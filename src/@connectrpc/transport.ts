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
	type Interceptor,
	type StreamRequest,
	type StreamResponse,
	type Transport,
	type UnaryRequest,
	type UnaryResponse,
	createContextValues,
} from "@connectrpc/connect";

import type { GrpcWasmOptions } from "./options";

import type { Conn } from "../conn";
import type { Metadata } from "../types";

type AnyFn = (req: UnaryRequest | StreamRequest) => Promise<UnaryResponse | StreamResponse>;

export class GrpcWasmTransport implements Transport {
	private readonly conn: Promise<Conn>;
	private readonly interceptors: Interceptor[];

	constructor(private readonly defaultOptions: GrpcWasmOptions) {
		this.conn = defaultOptions.conn;
		this.interceptors = defaultOptions.interceptors ?? [];
	}

	private plan(next: AnyFn, interceptors?: Interceptor[]) {
		interceptors ??= this.interceptors;
		for (const i of interceptors.concat().reverse()) {
			next = i(next);
		}
		return next;
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

		signal ??= new AbortController().signal; // TODO
		contextValues ??= createContextValues();
		const req: UnaryRequest<I, O> = {
			service: method.parent,
			requestMethod: "", // N/A
			url: "", // N/A
			signal, // TODO:
			header: new Headers(header),
			contextValues,

			stream: false,
			message: create(method.input, input),
			method,
		};

		const run = this.plan((async ({ signal, header, message, method }: UnaryRequest<I, O>) => {
			const txData = toBinary(req.method.input, req.message);
			const result = await conn.invoke(name, txData, { signal, meta: toMeta(header) });
			if (result.status.code !== 0) {
				const { message, code } = result.status;
				throw new ConnectError(message, code);
			}

			const rxData = fromBinary(method.output, result.response);
			return {
				service: method.parent,
				header: toHeaders(result.header),
				trailer: toHeaders(result.trailer),

				stream: false,
				message: rxData,
				method,
			};
		}) as unknown as AnyFn);
		return run(req) as Promise<UnaryResponse<I, O>>;
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
