import type { RpcOptions } from "@protobuf-ts/runtime-rpc";

import type { Conn } from "../conn";

export interface GrpcWasmOptions extends RpcOptions {
	conn: Promise<Conn>;
}
