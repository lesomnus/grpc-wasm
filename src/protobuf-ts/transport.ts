import { GrpcStatusCode } from "@protobuf-ts/grpcweb-transport";
import {
	ClientStreamingCall,
	DuplexStreamingCall,
	type MethodInfo,
	RpcError,
	type RpcInputStream,
	type RpcMetadata,
	type RpcOptions,
	RpcOutputStreamController,
	type RpcStatus,
	type RpcTransport,
	ServerStreamingCall,
	UnaryCall,
	mergeRpcOptions,
} from "@protobuf-ts/runtime-rpc";

import type { Conn } from "../conn";
import { Defer } from "../defer";
import {
	type BidiStreamingClient,
	type ServerStreamingClient,
	stream_close_and_recv,
} from "../stream";
import type { Metadata, StreamFinalResult } from "../types";

import type { GrpcWasmOptions } from "./options";

export class GrpcWasmTransport implements RpcTransport {
	constructor(private readonly defaultOptions: GrpcWasmOptions) {}

	private get conn(): Conn {
		return this.defaultOptions.conn;
	}

	private full_method_of(method: MethodInfo) {
		return `/${method.service.typeName}/${method.name}`;
	}

	mergeOptions(options?: Partial<RpcOptions>): RpcOptions {
		return mergeRpcOptions(this.defaultOptions, options);
	}

	unary<I extends object, O extends object>(
		method: MethodInfo<I, O>,
		input: I,
		options: RpcOptions,
	): UnaryCall<I, O> {
		const [signal, cause] = normalize_abort(options);
		if (!signal && cause.code != GrpcStatusCode.OK) {
			// TODO: should the Promise be resolved instead of rejected?
			const err = Promise.reject(
				new RpcError(
					"call was not made because the option had already indicated a failure",
					GrpcStatusCode[cause.code],
				),
			);
			return new UnaryCall<I, O>(method, options.meta ?? {}, input, err, err, err, err);
		}

		const header = new Defer<RpcMetadata>();
		const response = new Defer<O>();
		const status = new Defer<RpcStatus>();
		const trailer = new Defer<RpcMetadata>();

		const req = method.I.toBinary(input, options.binaryOptions);
		this.conn
			.invoke(this.full_method_of(method), req, { meta: normalize_meta(options.meta), signal })
			.then((result) => {
				const st: RpcStatus = {
					code: GrpcStatusCode[result.status.code],
					detail: result.status.message,
				};

				header.resolve(result.header as RpcMetadata);
				status.resolve(st);
				trailer.resolve(result.trailer as RpcMetadata);

				if (result.status.code !== GrpcStatusCode.OK) {
					response.reject(new RpcError(st.detail, st.code, result.header as RpcMetadata));
					return;
				}

				try {
					const res = method.O.fromBinary(result.response, options.binaryOptions);
					response.resolve(res);
				} catch (e) {
					response.reject(e);
				}
			})
			.catch((e) => {
				header.reject(e);
				response.reject(e);
				status.reject(e);
				trailer.reject(e);
			});

		return new UnaryCall<I, O>(
			method,
			options.meta ?? {},
			input,
			header,
			response,
			status,
			trailer,
		);
	}

	// private handle_server_stream/

	serverStreaming<I extends object, O extends object>(
		method: MethodInfo<I, O>,
		input: I,
		options: RpcOptions,
	): ServerStreamingCall<I, O> {
		const header = new Defer<RpcMetadata>();
		const status = new Defer<RpcStatus>();
		const trailer = new Defer<RpcMetadata>();

		const req = method.I.toBinary(input, options.binaryOptions);
		const stream = this.conn.open_server_stream(this.full_method_of(method), req, {});
		const ostream = new RpcOutputStreamController<O>();

		stream
			.then(async (stream) => {
				{
					const h = await stream.header();
					header.resolve(h as RpcMetadata);
				}

				const result = await stream_pipe(stream, ostream, (data) => {
					return method.O.fromBinary(data, options.binaryOptions);
				});
				if (!result.done) {
					return stream;
				}

				status.resolve({
					code: GrpcStatusCode[result.status.code],
					detail: result.status.message,
				});
				trailer.resolve(result.trailer as RpcMetadata);

				ostream.notifyComplete();
				return stream;
			})
			.then((stream) => {
				stream.close();
			})
			.catch((e) => {
				header.reject(e);
				status.reject(e);
				trailer.reject(e);
				ostream.notifyError(e);
			});

		return new ServerStreamingCall<I, O>(
			method,
			options.meta ?? {},
			input,
			header,
			ostream,
			status,
			trailer,
		);
	}

	clientStreaming<I extends object, O extends object>(
		method: MethodInfo<I, O>,
		options: RpcOptions,
	): ClientStreamingCall<I, O> {
		const header = new Defer<RpcMetadata>();
		const response = new Defer<O>();
		const status = new Defer<RpcStatus>();
		const trailer = new Defer<RpcMetadata>();

		const stream = this.conn.open_bidi_stream(this.full_method_of(method), {});
		const istream = new GrpcInputStreamWrapper<I>(
			stream,
			(m) => method.I.toBinary(m, options.binaryOptions),
			async (stream) => {
				const result = await stream_close_and_recv(stream);
				const res = method.O.fromBinary(result.response, options.binaryOptions);
				const st: RpcStatus = {
					code: GrpcStatusCode[result.status.code],
					detail: result.status.message,
				};

				response.resolve(res);
				status.resolve(st);
				trailer.resolve(result.trailer as RpcMetadata);
			},
		);

		return new ClientStreamingCall<I, O>(
			method,
			options.meta ?? {},
			istream,
			header,
			response,
			status,
			trailer,
		);
	}

	duplex<I extends object, O extends object>(
		method: MethodInfo<I, O>,
		options: RpcOptions,
	): DuplexStreamingCall<I, O> {
		const header = new Defer<RpcMetadata>();
		const status = new Defer<RpcStatus>();
		const trailer = new Defer<RpcMetadata>();

		const stream = this.conn.open_bidi_stream(this.full_method_of(method), {});
		const ostream = new RpcOutputStreamController<O>();
		const istream = new GrpcInputStreamWrapper<I>(stream, (m) =>
			method.I.toBinary(m, options.binaryOptions),
		);

		stream
			.then(async (stream) => {
				{
					const h = await stream.header();
					header.resolve(h as RpcMetadata);
				}

				const result = await stream_pipe(stream, ostream, (data) => {
					return method.O.fromBinary(data, options.binaryOptions);
				});
				if (!result.done) {
					return stream;
				}

				status.resolve({
					code: GrpcStatusCode[result.status.code],
					detail: result.status.message,
				});
				trailer.resolve(result.trailer as RpcMetadata);

				ostream.notifyComplete();
				return stream;
			})
			.then((stream) => {
				stream.close();
			})
			.catch((e) => {
				ostream.notifyError(e);
			});

		return new DuplexStreamingCall<I, O>(
			method,
			options.meta ?? {},
			istream,
			header,
			ostream,
			status,
			trailer,
		);
	}

	close() {
		return this.conn.close();
	}
}

class GrpcInputStreamWrapper<T> implements RpcInputStream<T> {
	constructor(
		private readonly stream: Promise<BidiStreamingClient>,
		private encode: (m: T) => Uint8Array,
		private on_complete?: (stream: BidiStreamingClient) => void,
	) {}

	async send(message: T): Promise<void> {
		const data = this.encode(message);
		const stream = await this.stream;
		return stream.send(data);
	}

	async complete(): Promise<void> {
		const stream = await this.stream;
		this.on_complete?.(stream);
		return stream.close_send();
	}
}

function normalize_meta(meta?: RpcMetadata): Metadata | undefined {
	if (meta === undefined) return undefined;

	const normal: Metadata = {};
	for (let [k, v] of Object.entries(meta)) {
		if (typeof v === "string") {
			v = [v];
		}
		normal[k] = v;
	}

	return normal;
}

type AbortCode = GrpcStatusCode.OK | GrpcStatusCode.CANCELLED | GrpcStatusCode.DEADLINE_EXCEEDED;
type AbortResult = [AbortSignal, { code: Promise<AbortCode> }] | [undefined, { code: AbortCode }];

function normalize_abort(options: Pick<RpcOptions, "timeout" | "abort">): AbortResult {
	if (options.abort === undefined && options.timeout === undefined) {
		return [undefined, { code: GrpcStatusCode.OK }];
	}
	if (options.abort?.aborted) {
		return [undefined, { code: GrpcStatusCode.CANCELLED }];
	}

	let timeout = options.timeout;
	if (timeout !== undefined) {
		if (typeof timeout !== "number") {
			timeout = timeout.getTime() - Date.now();
		}
		if (timeout <= 0) {
			return [undefined, { code: GrpcStatusCode.DEADLINE_EXCEEDED }];
		}
	}

	const code = new Defer<AbortCode>();
	const ac = new AbortController();
	const abort = (c: AbortCode) => {
		ac.abort();
		code.resolve(c);
	};

	if (options.abort !== undefined) {
		options.abort.addEventListener("abort", () => {
			abort(GrpcStatusCode.CANCELLED);
		});
	}
	if (timeout !== undefined) {
		setTimeout(() => {
			abort(GrpcStatusCode.DEADLINE_EXCEEDED);
		}, timeout);
	}

	return [ac.signal, { code }];
}

// Returns `{done: false}` if ostream is closed.
async function stream_pipe<O extends {}>(
	istream: ServerStreamingClient,
	ostream: RpcOutputStreamController<O>,
	decode: (data: Uint8Array) => O,
): Promise<StreamFinalResult | { done: false }> {
	while (true) {
		const result = await istream.recv();
		if (ostream.closed) {
			return { done: false };
		}
		if (result.done) {
			return result;
		}

		const res = decode(result.response);
		ostream.notifyMessage(res);
	}
}
