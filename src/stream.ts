import type { Metadata, StreamResult } from "./types";
import type { BridgeWorker, StreamId } from "./worker";

export interface Stream {
	header(): Promise<Metadata>;
	close(): Promise<void>;
	close_send(): Promise<void>;
	send(req: Uint8Array): Promise<void>;
	recv(): Promise<StreamResult>;
}

export class BidiStream implements Stream {
	private close_work: Promise<void> | undefined;

	constructor(
		private worker: BridgeWorker,
		private id: StreamId,
	) {}
	header(): Promise<Metadata> {
		this.throwIfClosed();
		return this.worker.stream_header(this.id);
	}
	close(): Promise<void> {
		if (this.close_work) {
			return this.close_work;
		}

		this.close_work = this.worker.stream_close(this.id);
		return this.close_work;
	}
	async close_send(): Promise<void> {
		this.throwIfClosed();
		return this.worker.stream_close_send(this.id);
	}
	async send(req: Uint8Array): Promise<void> {
		this.throwIfClosed();
		return this.worker.stream_send(this.id, req);
	}
	async recv(): Promise<StreamResult> {
		this.throwIfClosed();
		return this.worker.stream_recv(this.id);
	}

	private throwIfClosed() {
		if (this.close_work) {
			throw new Error("closed");
		}
	}
}
