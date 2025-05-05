import {
	BidiStream,
	type BidiStreamingClient,
	type ClientStreamingClient,
	type ServerStreamingClient,
} from "./stream";
import type { CallOption, RpcResult } from "./types";
import type { BridgeWorker, ConnId } from "./worker";

export interface Conn {
	close(): Promise<void>;
	invoke(method: string, req: Uint8Array, option: CallOption): Promise<RpcResult>;
	open_server_stream(
		method: string,
		req: Uint8Array,
		option: CallOption,
	): Promise<ServerStreamingClient>;
	open_client_stream(method: string, option: CallOption): Promise<ClientStreamingClient>;
	open_bidi_stream(method: string, option: CallOption): Promise<BidiStreamingClient>;
}

export class ClientConn implements Conn {
	private close_work: Promise<void> | undefined;

	constructor(
		private worker: BridgeWorker,
		private id: ConnId,
	) {}

	close(): Promise<void> {
		if (this.close_work) {
			return this.close_work;
		}

		this.close_work = this.worker.close(this.id);
		return this.close_work;
	}

	async invoke(method: string, req: Uint8Array, option: CallOption): Promise<RpcResult> {
		this.throwIfClosed();
		return this.worker.invoke(this.id, method, req, option);
	}

	async open_server_stream(
		method: string,
		req: Uint8Array,
		option: CallOption,
	): Promise<ServerStreamingClient> {
		this.throwIfClosed();
		const stream_id = await this.worker.open_server_stream(this.id, method, option);
		const stream = new BidiStream(this.worker, stream_id);
		await stream.send(req);
		await stream.close_send();
		return stream;
	}

	async open_client_stream(method: string, option: CallOption): Promise<ClientStreamingClient> {
		this.throwIfClosed();
		const stream_id = await this.worker.open_client_stream(this.id, method, option);
		return new BidiStream(this.worker, stream_id);
	}

	async open_bidi_stream(method: string, option: CallOption): Promise<BidiStreamingClient> {
		this.throwIfClosed();
		const stream_id = await this.worker.open_bidi_stream(this.id, method, option);
		return new BidiStream(this.worker, stream_id);
	}

	private throwIfClosed() {
		if (this.close_work) {
			throw new Error("closed");
		}
	}
}
