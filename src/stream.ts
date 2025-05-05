import type { Metadata, StreamResult } from "./types";
import type { BridgeWorker, StreamId } from "./worker";

export interface ClientStream {
	header(): Promise<Metadata>;
	close(): Promise<void>;
}

export interface ServerStreamingClient extends ClientStream {
	recv(): Promise<StreamResult>;
}

export interface ClientStreamingClient extends ClientStream {
	send(req: Uint8Array): Promise<void>;
	close_send(): Promise<void>;
}

export interface BidiStreamingClient extends ServerStreamingClient, ClientStreamingClient {}

export class BidiStream implements BidiStreamingClient {
	private close_work: Promise<void> | undefined;

	constructor(
		private worker: BridgeWorker,
		private id: StreamId,
	) {}

	header(): Promise<Metadata> {
		this.throwIfClosed();
		return this.worker.stream_header(this.id);
	}

	async recv(): Promise<StreamResult> {
		this.throwIfClosed();
		return this.worker.stream_recv(this.id);
	}

	async send(req: Uint8Array): Promise<void> {
		this.throwIfClosed();
		return this.worker.stream_send(this.id, req);
	}

	async close_send(): Promise<void> {
		this.throwIfClosed();
		return this.worker.stream_close_send(this.id);
	}

	close(): Promise<void> {
		if (this.close_work) {
			return this.close_work;
		}

		this.close_work = this.worker.stream_close(this.id);
		return this.close_work;
	}

	private throwIfClosed() {
		if (this.close_work) {
			throw new Error("closed");
		}
	}
}
