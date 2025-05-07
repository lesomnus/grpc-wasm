// Worker handles connection to the WASM compiled gRPC server.
// Worker cannot be reused, means new worker should be initialized once it is closed.
// Bridge is a WASM program which serves gRPC server.

import { expose } from "threads/worker";

import "./wasm_exec";
import { Defer } from "./defer";
import { Table } from "./table";
import type * as types from "./types";
import type { Go } from "./wasm_exec";

export type ConnId = number;
export type CallId = number;
export type StreamId = number;

export type CallOption = {
	meta?: types.Metadata;
};

export type InvokeResult = {
	id: CallId;
	result: Promise<types.RpcResult>;
};

export type BridgeWorker = {
	start(app: string | WebAssembly.Module): Promise<void>;
	stop(): Promise<void>;
	dial(): Promise<ConnId>;
	close(id: ConnId): Promise<void>;
	invoke(id: ConnId, method: string, req: Uint8Array, option: CallOption): Promise<CallId>;
	recv(id: CallId): Promise<types.RpcResult>;
	cancel(id: CallId): Promise<void>;
	open_server_stream(id: ConnId, method: string, option: CallOption): Promise<StreamId>;
	open_client_stream(id: ConnId, method: string, option: CallOption): Promise<StreamId>;
	open_bidi_stream(id: ConnId, method: string, option: CallOption): Promise<StreamId>;
	stream_header(id: StreamId): Promise<types.Metadata>;
	stream_recv(id: StreamId): Promise<types.StreamResult>;
	stream_send(id: StreamId, req: Uint8Array): Promise<void>;
	stream_close_send(id: StreamId): Promise<void>;
	stream_close(id: StreamId): Promise<void>;
};

interface Socket {
	close(): void;
	dial(): Promise<Conn>;
}

type InvokeOption = CallOption & {
	abort_request?: Promise<void>;
};

type Conn = {
	close(): Promise<void>;
	invoke(method: string, req: Uint8Array, option: InvokeOption): Promise<types.RpcResult>;
	open_server_stream(method: string, option: CallOption): Promise<Stream>;
	open_client_stream(method: string, option: CallOption): Promise<Stream>;
	open_bidi_stream(method: string, option: CallOption): Promise<Stream>;
};

type Call = {
	cancel(): void;
	result: Promise<types.RpcResult>;
};

type Stream = {
	conn: Conn;
	header(): Promise<types.Metadata>;
	recv(): Promise<types.StreamResult>;
	send(req: Uint8Array): Promise<void>;
	close_send(): Promise<void>;
	close(): Promise<void>;
};

type Bridge = {
	go: Go;
	// Bridge execution. Settled when the execution is finished.
	exec: Promise<void>;
	// Socket bound to the server in the bridge execution.
	sock: Socket;
};

// Bridge will settle the grpc_wasm.
declare global {
	var grpc_wasm: Defer<Socket> | undefined;
}
globalThis.grpc_wasm = undefined;

async function init(app: string | WebAssembly.Module): Promise<Bridge> {
	const go = new globalThis.Go();

	let m: WebAssembly.Module;
	if (app instanceof WebAssembly.Module) {
		m = app;
	} else {
		const res = fetch(app);
		m = await WebAssembly.compileStreaming(res);
	}

	const instance = await WebAssembly.instantiate(m, go.importObject);
	const socket = new Defer<Socket>();
	globalThis.grpc_wasm = socket;

	let settled = false;
	socket.finally(() => {
		settled = true;
		delete globalThis.grpc_wasm;
	});

	const exec = go.run(instance);
	return new Promise<Bridge>((resolve, reject) => {
		socket.then(
			(sock) => resolve({ go, exec, sock }),
			(err) => reject(err),
		);
		exec.finally(() => {
			if (!settled) {
				reject("bridge exited before callback");
			}
		});
	});
}

// When an open request is made, a promise is assigned.
// The promise is resolved when the bridge is started.
// More precisely, after the bridge runs, the server
// finishes its setup, and the callback from `grpc_wasm`
// is invoked, then the promise is resolved.
let start_work: Promise<void> | undefined;
let stop_work: Promise<void> | undefined;

// Indicates whether the bridge closed.
// Future request after close must fail.
function isStopped(): boolean {
	return stop_work !== undefined;
}

const ready = new Defer<Bridge>();

// Assume IDs are monotonic and are never re-used.
const conns = new Table<ConnId, Conn>();
const calls = new Table<CallId, Call>();
const streams = new Table<StreamId, Stream>();

expose({
	start(app: string | WebAssembly.Module): Promise<void> {
		if (isStopped()) {
			throw new Error("bridge closed");
		}
		if (start_work) {
			// There is pending open.
			return start_work;
		}

		start_work = init(app).then(
			(ctx) => ready.resolve(ctx),
			(err) => {
				ready.reject(err);
				throw err;
			},
		);
		return start_work;
	},
	stop(): Promise<void> {
		if (stop_work) {
			// There is pending close.
			return stop_work;
		}
		if (!start_work) {
			stop_work = Promise.resolve();

			// Connection was never made.
			// Prevent future requests and abort pending requests.
			const err = new Error("closed");
			start_work = Promise.reject(err);
			ready.reject(err);
			return stop_work;
		}

		stop_work = (async () => {
			// Open was requested so wait for the socket opened
			// then close the socket.
			const { exec, sock } = await ready;
			sock.close();
			await exec;
		})();

		return stop_work;
	},
	async dial(): Promise<ConnId> {
		const { sock } = await ready;
		const conn = await sock.dial();

		return conns.add(conn);
	},
	async close(id: ConnId): Promise<void> {
		const conn = conns.delete(id);
		return conn?.close();
	},
	invoke(id: ConnId, method: string, req: Uint8Array, option): Promise<CallId> {
		const conn = conns.must(id);

		const abort_request = new Defer<void>();
		const cancel = () => abort_request.resolve();
		const result = conn.invoke(method, req, {
			meta: option.meta,
			abort_request,
		});
		result.finally(() => {
			cancel();
		});

		const call_id = calls.add({ cancel, result });
		return Promise.resolve(call_id);
	},
	recv(id) {
		const call = calls.must(id);
		return call.result;
	},
	cancel(id) {
		const call = calls.get(id);
		call?.cancel();
		return Promise.resolve();
	},
	async open_server_stream(id, method, option) {
		const conn = conns.must(id);
		const stream = await conn.open_server_stream(method, option);
		stream.conn = conn;

		return streams.add(stream);
	},
	async open_client_stream(id, method, option) {
		const conn = conns.must(id);
		const stream = await conn.open_client_stream(method, option);
		stream.conn = conn;

		return streams.add(stream);
	},
	async open_bidi_stream(id, method, option) {
		const conn = conns.must(id);
		const stream = await conn.open_bidi_stream(method, option);
		stream.conn = conn;

		return streams.add(stream);
	},
	stream_header(id) {
		const stream = streams.must(id);
		return stream.header();
	},
	async stream_close(id): Promise<void> {
		const stream = streams.delete(id);
		return stream?.close();
	},
	stream_close_send(id) {
		const stream = streams.must(id);
		return stream.close_send();
	},
	stream_send(id, req) {
		const stream = streams.must(id);
		return stream.send(req);
	},
	stream_recv(id) {
		const stream = streams.must(id);
		return stream.recv();
	},
} satisfies BridgeWorker);
