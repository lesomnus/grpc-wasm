import {
	type DescMessage,
	type DescMethod,
	type DescMethodStreaming,
	type DescMethodUnary,
	type MessageInitShape,
	type MessageShape,
	create,
	fromBinary,
	toBinary,
} from "@bufbuild/protobuf";
import {
	Code,
	ConnectError,
	type ContextValues,
	type StreamResponse,
	type Transport,
	type UnaryResponse,
} from "@connectrpc/connect";

import type { Conn } from "../conn";
import type { Metadata } from "../types";
import type { GrpcWasmOptions } from "./options";

export class GrpcWasmTransport implements Transport {
	constructor(private readonly defaultOptions: GrpcWasmOptions) {}

	private get conn(): Promise<Conn> {
		return this.defaultOptions.conn;
	}

	private fullMethodOf(method: DescMethod) {
		return `/${method.parent.typeName}/${method.name}`;
	}

	async unary<I extends DescMessage, O extends DescMessage>(
		method: DescMethodUnary<I, O>,
		signal: AbortSignal | undefined,
		timeoutMs: number | undefined,
		header: HeadersInit | undefined,
		input: MessageInitShape<I>,
		contextValues?: ContextValues,
	): Promise<UnaryResponse<I, O>> {
		const conn = await this.conn;
		const name = this.fullMethodOf(method);
		const msg = create(method.input, input);
		const req = toBinary(method.input, msg);

		const result = await conn.invoke(name, req, { signal, meta: toMeta(header) });
		if (result.status.code !== 0) {
			const { message, code } = result.status;
			throw new ConnectError(message, code);
		}

		const res = fromBinary(method.output, result.response);
		return {
			service: method.parent,
			header: toHeaders(result.header),
			trailer: toHeaders(result.trailer),

			stream: false,
			message: res,
			method,
		};
	}

	async stream<I extends DescMessage, O extends DescMessage>(
		method: DescMethodStreaming<I, O>,
		signal: AbortSignal | undefined,
		timeoutMs: number | undefined,
		header: HeadersInit | undefined,
		input: AsyncIterable<MessageInitShape<I>>,
		contextValues?: ContextValues,
	): Promise<StreamResponse<I, O>> {
		switch (method.methodKind) {
			case "server_streaming":
				break;

			case "client_streaming":
			case "bidi_streaming":
				throw new ConnectError("only server streaming is supported", Code.Unimplemented);

			default:
				throw new ConnectError(
					//@ts-ignore
					`unknown kind of streaming method: ${method.methodKind}`,
					Code.Unimplemented,
				);
		}

		const conn = await this.conn;
		const name = this.fullMethodOf(method);
		const req = await (async () => {
			const it = input[Symbol.asyncIterator]();
			const { done, value } = await it.next();
			if (done) {
				throw new ConnectError("expected an input, but none was provided", Code.Internal);
			}

			const msg = create(method.input, value);
			const req = toBinary(method.input, msg);
			{
				const { done } = await it.next();
				if (!done) {
					throw new ConnectError("expected there be a single input", Code.Internal);
				}
			}

			return req;
		})();

		const stream = await conn.open_server_stream(name, req, { meta: toMeta(header) });
		const h = await stream.header();

		async function* pull(): AsyncGenerator<MessageShape<O>> {
			while (true) {
				const result = await stream.recv();
				if (result.done) {
					return;
				}

				const res = fromBinary(method.output, result.response);
				yield res;
			}
		}

		return {
			service: method.parent,
			header: toHeaders(h),
			// TODO: I have to wait until the stream end... how?
			trailer: new Headers(),

			stream: true,
			message: pull(),
			method,
		};
	}

	async close(): Promise<void> {
		const conn = await this.conn;
		return conn.close();
	}
}

function toMeta(h: HeadersInit | undefined): Metadata | undefined {
	if (h === undefined) return undefined;

	const md: Metadata = {};
	for (const [k, v] of new Headers(h).entries()) {
		md[k] = [v];
	}
	return md;
}

function toHeaders(md: Metadata): Headers {
	const h = new Headers();
	for (const [k, vs] of Object.entries(md)) {
		if (vs === undefined) continue;
		for (const v of vs) {
			h.append(k, v);
		}
	}
	return h;
}
