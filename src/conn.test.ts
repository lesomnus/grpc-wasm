import { beforeEach, describe, expect, test } from "vitest";

import type { Conn } from "./conn";
import { open } from "./sock";
import { Echo } from "./test/proto/echo/echo";

describe("conn", () => {
	let conn: Conn;
	beforeEach(async () => {
		const p = new URL("./test/echobridge.wasm", import.meta.url);
		const sock = await open(p.toString());
		const conn_ = await sock.dial();
		conn = conn_;
		return async () => {
			await conn_.close();
			await sock.close();
		};
	});

	test("unary", async () => {
		const msg = { message: "Django", sequence: 42n };
		const req = Echo.toBinary(msg);
		const rst = await conn.invoke("/echo.EchoService/Unary", req, {});
		const res = Echo.fromBinary(rst.response);
		expect(res.message).toEqual(msg.message);
		expect(res.sequence).toEqual(msg.sequence);
	});
});
