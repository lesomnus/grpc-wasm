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
import type { BidiStreamingClient, ClientStreamingClient, ServerStreamingClient } from "../stream";
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
		const meta = options.meta ?? {};
		const [signal, cause, err] = normalize_abort(options);
		if (err) {
			const e = Promise.reject(err);
			return new UnaryCall<I, O>(method, meta, input, e, e, Promise.resolve(cause), e);
		}

		const header = new Defer<RpcMetadata>();
		const response = new Defer<O>();
		const status = new Defer<RpcStatus>();
		const trailer = new Defer<RpcMetadata>();

		header.catch(() => {});
		response.catch(() => {});
		status.catch(() => {});
		trailer.catch(() => {});

		signal?.addEventListener("abort", async () => {
			const st = await cause;
			const err = new RpcError("", st.code);
			header.reject(err);
			response.reject(err);
			status.resolve(st);
			trailer.reject(err);
		});

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

		return new UnaryCall<I, O>(method, meta, input, header, response, status, trailer);
	}

	serverStreaming<I extends object, O extends object>(
		method: MethodInfo<I, O>,
		input: I,
		options: RpcOptions,
	): ServerStreamingCall<I, O> {
		const meta = options.meta ?? {};
		const [signal, cause, err] = normalize_abort(options);
		if (err) {
			const e = Promise.reject(err);
			const o = new RpcOutputStreamController<O>();
			o.notifyError(err);
			return new ServerStreamingCall<I, O>(method, meta, input, e, o, Promise.resolve(cause), e);
		}

		const header = new Defer<RpcMetadata>();
		const status = new Defer<RpcStatus>();
		const trailer = new Defer<RpcMetadata>();

		header.catch(() => {});
		status.catch(() => {});
		trailer.catch(() => {});

		const req = method.I.toBinary(input, options.binaryOptions);
		const stream = this.conn.open_server_stream(this.full_method_of(method), req, {});
		const ostream = new RpcOutputStreamController<O>();
		const ostream_set_error = (err: Error) => {
			if (ostream.closed) return;
			ostream.notifyError(err);
		};

		signal?.addEventListener("abort", async () => {
			const st = await cause;
			const err = new RpcError("", st.code);
			header.reject(err);
			status.resolve(st);
			trailer.reject(err);
			(await stream).close();

			ostream_set_error(err);
		});

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
				ostream_set_error(e);
			});

		return new ServerStreamingCall<I, O>(method, meta, input, header, ostream, status, trailer);
	}

	clientStreaming<I extends object, O extends object>(
		method: MethodInfo<I, O>,
		options: RpcOptions,
	): ClientStreamingCall<I, O> {
		const meta = options.meta ?? {};
		const [signal, cause, err] = normalize_abort(options);
		if (err) {
			const e = Promise.reject(err);
			const i = new GrpcErrInputStream<I>(err);
			return new ClientStreamingCall<I, O>(method, meta, i, e, e, Promise.resolve(cause), e);
		}

		const header = new Defer<RpcMetadata>();
		const response = new Defer<O>();
		const status = new Defer<RpcStatus>();
		const trailer = new Defer<RpcMetadata>();

		header.catch(() => {});
		response.catch(() => {});
		status.catch(() => {});
		trailer.catch(() => {});

		const stream = this.conn.open_client_stream(this.full_method_of(method), {});
		const istream = new GrpcInputStreamWrapper<I, ClientStreamingClient>(
			stream,
			(m) => method.I.toBinary(m, options.binaryOptions),
			async (stream) => {
				const result = await stream.close_and_recv();
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

		signal?.addEventListener("abort", async () => {
			const st = await cause;
			const err = new RpcError("abort", st.code);
			header.reject(err);
			response.reject(err);
			status.resolve(st);
			trailer.reject(err);
			(await stream).close();
		});

		return new ClientStreamingCall<I, O>(method, meta, istream, header, response, status, trailer);
	}

	duplex<I extends object, O extends object>(
		method: MethodInfo<I, O>,
		options: RpcOptions,
	): DuplexStreamingCall<I, O> {
		const meta = options.meta ?? {};
		const [signal, cause, err] = normalize_abort(options);
		if (err) {
			const e = Promise.reject(err);
			const i = new GrpcErrInputStream<I>(err);
			const o = new RpcOutputStreamController<O>();
			o.notifyError(err);
			return new DuplexStreamingCall<I, O>(method, meta, i, e, o, Promise.resolve(cause), e);
		}

		const header = new Defer<RpcMetadata>();
		const status = new Defer<RpcStatus>();
		const trailer = new Defer<RpcMetadata>();

		header.catch(() => {});
		status.catch(() => {});
		trailer.catch(() => {});

		const stream = this.conn.open_bidi_stream(this.full_method_of(method), {});
		const ostream = new RpcOutputStreamController<O>();
		const istream = new GrpcInputStreamWrapper<I, BidiStreamingClient>(
			stream,
			(m) => method.I.toBinary(m, options.binaryOptions),
			(stream) => stream.close_send(),
		);
		const ostream_set_error = (err: Error) => {
			if (ostream.closed) return;
			ostream.notifyError(err);
		};

		signal?.addEventListener("abort", async () => {
			const st = await cause;
			const err = new RpcError("", st.code);
			header.reject(err);
			status.resolve(st);
			trailer.reject(err);
			(await stream).close();

			ostream_set_error(err);
		});

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
				ostream_set_error(e);
			});

		return new DuplexStreamingCall<I, O>(method, meta, istream, header, ostream, status, trailer);
	}

	close() {
		return this.conn.close();
	}
}

type GrpcInputStream = {
	send(req: Uint8Array): Promise<void>;
};

class GrpcInputStreamWrapper<T, S extends GrpcInputStream> implements RpcInputStream<T> {
	constructor(
		private readonly stream: Promise<S>,
		private encode: (m: T) => Uint8Array,
		private on_complete: (stream: S) => Promise<void>,
	) {}

	async send(message: T): Promise<void> {
		const data = this.encode(message);
		const stream = await this.stream;
		return stream.send(data);
	}

	async complete(): Promise<void> {
		const stream = await this.stream;
		return this.on_complete(stream);
	}
}

class GrpcErrInputStream<T> implements RpcInputStream<T> {
	constructor(private err: Error) {}

	send(message: T): Promise<void> {
		return Promise.reject(this.err);
	}

	complete(): Promise<void> {
		return Promise.resolve();
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

type AbortResult =
	// The request can be aborted, so respect the signal and await the code if necessary.
	| [AbortSignal, Promise<RpcStatus>, null]
	// The request can never be aborted.
	| [undefined, RpcStatus, null]
	// The request should not be made because the options already indicate failure.
	| [undefined, RpcStatus, RpcError];

function normalize_abort(options: Pick<RpcOptions, "timeout" | "abort">): AbortResult {
	if (options.abort === undefined && options.timeout === undefined) {
		return [undefined, { code: GrpcStatusCode[GrpcStatusCode.OK], detail: "" }, null];
	}

	const err_msg = "call was not made because the option had already indicated a failure";
	if (options.abort?.aborted) {
		const code = GrpcStatusCode[GrpcStatusCode.CANCELLED];
		return [undefined, { code, detail: "" }, new RpcError(err_msg, code)];
	}

	let timeout = options.timeout;
	if (timeout !== undefined) {
		if (typeof timeout !== "number") {
			timeout = timeout.getTime() - Date.now();
		}
		if (timeout <= 0) {
			const code = GrpcStatusCode[GrpcStatusCode.DEADLINE_EXCEEDED];
			return [undefined, { code, detail: "" }, new RpcError(err_msg, code)];
		}
	}

	const code = new Defer<GrpcStatusCode>();
	const ac = new AbortController();
	const abort = (c: GrpcStatusCode) => {
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

	return [
		ac.signal,
		code.then<RpcStatus>((c) => {
			return { code: GrpcStatusCode[c], detail: "" };
		}),
		null,
	];
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
