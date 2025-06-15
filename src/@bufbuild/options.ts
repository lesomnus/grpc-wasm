import type { Conn } from "../conn";

export interface GrpcWasmOptions {
	conn: Promise<Conn>;
}
