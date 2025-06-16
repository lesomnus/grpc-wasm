import type { Interceptor } from "@connectrpc/connect";

import type { Conn } from "../conn";

export interface GrpcWasmOptions {
	conn: Promise<Conn>;
	interceptors?: Interceptor[];
}
