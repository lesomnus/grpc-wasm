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

export type OpenOption = {
	workerUrl?: string;
};

export async function open(
	app: string | WebAssembly.Module,
	option: OpenOption = {},
): Promise<Sock> {
	let w: Worker;
	if (import.meta.env.DEV) {
		w = new Worker("./worker.ts", {
			_baseURL: import.meta.url,
			type: "module",
		});
	} else {
		const path = option.workerUrl ?? "./worker.es.js";
		const base = option.workerUrl === undefined ? undefined : import.meta.url;
		w = new Worker(path, {
			_baseURL: base,
			type: "module",
		});
	}
	const b = await spawn<BridgeWorker>(w);
	await b.start(app);
	return new ClientSock(b);
}
