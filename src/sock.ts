import { type ModuleThread, Thread, Worker, spawn } from "threads";

import { ClientConn, type Conn } from "./conn";
import type { BridgeWorker } from "./worker";

export interface Sock {
	close(): Promise<void>;
	dial(): Promise<Conn>;
}

class ClientSock {
	constructor(private worker: ModuleThread<BridgeWorker>) {}

	async close(): Promise<void> {
		await this.worker.stop();
		await Thread.terminate(this.worker);
	}

	async dial(): Promise<Conn> {
		const id = await this.worker.dial();
		return new ClientConn(this.worker, id);
	}
}

export async function open(app: string | WebAssembly.Module): Promise<Sock> {
	const w = new Worker("./worker.ts", {
		_baseURL: import.meta.url,
		type: "module",
	});
	const b = await spawn<BridgeWorker>(w);
	await b.start(app);
	return new ClientSock(b);
}
