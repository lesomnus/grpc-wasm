import {
	type ClientStreamingCall,
	Deferred,
	type DuplexStreamingCall,
	type MethodInfo,
	RpcError,
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

import { GrpcStatusCode } from "@protobuf-ts/grpcweb-transport";
import type { Metadata } from "../types";
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
		const header = new Defer<RpcMetadata>();
		const response = new Defer<O>();
		const status = new Defer<RpcStatus>();
		const trailer = new Defer<RpcMetadata>();

		const req = method.I.toBinary(input, options.binaryOptions);
		this.conn
			.invoke(this.full_method_of(method), req, { meta: normalize_meta(options.meta) })
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

	serverStreaming<I extends object, O extends object>(
		method: MethodInfo<I, O>,
		input: I,
		options: RpcOptions,
	): ServerStreamingCall<I, O> {
		const header = new Defer<RpcMetadata>();
		const status = new Defer<RpcStatus>();
		const trailer = new Defer<RpcMetadata>();

		const ctrl = new RpcOutputStreamController<O>();

		const req = method.I.toBinary(input, options.binaryOptions);
		this.conn
			.open_server_stream(this.full_method_of(method), req, {})
			.then(async (stream) => {
				{
					const h = await stream.header();
					header.resolve(h as RpcMetadata);
				}

				while (true) {
					const result = await stream.recv();
					if (result.done) {
						const st: RpcStatus = {
							code: GrpcStatusCode[result.status.code],
							detail: result.status.message,
						};
						status.resolve(st);
						trailer.resolve(result.trailer as RpcMetadata);
						break;
					}

					const res = method.O.fromBinary(result.response, options.binaryOptions);
					if (ctrl.closed) {
						return stream;
					}
					ctrl.notifyMessage(res);
				}

				if (!ctrl.closed) {
					ctrl.notifyComplete();
				}
				return stream;
			})
			.then((stream) => {
				stream.close();
			})
			.catch((e) => {
				ctrl.notifyError(e);
			});

		return new ServerStreamingCall<I, O>(
			method,
			options.meta ?? {},
			input,
			header,
			ctrl,
			status,
			trailer,
		);
	}

	clientStreaming<I extends object, O extends object>(
		method: MethodInfo<I, O>,
		options: RpcOptions,
	): ClientStreamingCall<I, O> {
		throw new Error("Method not implemented.");
	}

	duplex<I extends object, O extends object>(
		method: MethodInfo<I, O>,
		options: RpcOptions,
	): DuplexStreamingCall<I, O> {
		throw new Error("Method not implemented.");
	}

	close() {
		return this.conn.close();
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
