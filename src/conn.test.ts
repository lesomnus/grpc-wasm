import { GrpcStatusCode } from "@protobuf-ts/grpcweb-transport";
import type { MessageType } from "@protobuf-ts/runtime";
import { beforeEach, describe, expect, test } from "vitest";

import { type CallOption, type Conn, open } from "./index";

import { Echo } from "./test/proto/echo/echo";
import { Timestamp } from "./test/proto/google/protobuf/timestamp";

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

	const empty_echo: Echo = { message: "", sequence: 0n, circularShift: 0n };
	const invoke = async <T extends {}>(
		method: string,
		t: MessageType<T>,
		m: T,
		option: CallOption,
	) => {
		const req = t.toBinary(m);
		const rst = await conn.invoke(`/echo.EchoService/${method}`, req, option);
		const response = t.fromBinary(rst.response);
		return {
			...rst,
			response,
		};
	};

	test("unary", async () => {
		const msg: Echo = {
			message: "Lebowski",
			sequence: 42n,
			circularShift: 3n,
			dateCreated: Timestamp.now(),
		};
		const { response: res, status } = await invoke("Unary", Echo, msg, {});
		expect(status.code).toEqual(0);
		expect(res.message).toEqual("skiLebow");
		expect(res.sequence).toEqual(msg.sequence);
		expect(res.dateCreated).not.toBeUndefined();
		expect(Timestamp.toDate(res.dateCreated!).getTime()).toBeGreaterThan(
			Timestamp.toDate(msg.dateCreated!).getTime(),
		);
	});
	test("unary with error", async () => {
		const msg: Echo = {
			...empty_echo,
			status: {
				code: GrpcStatusCode.FAILED_PRECONDITION,
				message: "Is this your homework, Larry?",
			},
		};
		const { status } = await invoke("Unary", Echo, msg, {});
		expect(status).toEqual(msg.status);
	});
	test("unary with metadata", async () => {
		const meta = { foo: ["bar"] };
		const msg = empty_echo;
		const { header, trailer } = await invoke("Unary", Echo, msg, { meta });
		expect(header).toMatchObject({
			// "content-type": ["application/grpc+noop"],
			foo: ["bar"],
			timing: ["header"],
		});
		expect(trailer).toEqual({
			foo: ["bar"],
			timing: ["trailer"],
		});
	});
	test("unary with error and metadata", async () => {
		const meta = { foo: ["bar"] };
		const msg: Echo = {
			...empty_echo,
			status: {
				code: GrpcStatusCode.FAILED_PRECONDITION,
				message: "Is this your homework, Larry?",
			},
		};
		const { header, trailer, status } = await invoke("Unary", Echo, msg, {
			meta,
		});
		expect(status).toEqual(msg.status);
		expect(header).toMatchObject({
			// "content-type": ["application/grpc+noop"],
			foo: ["bar"],
			timing: ["header"],
		});
		expect(trailer).toEqual({
			foo: ["bar"],
			timing: ["trailer"],
		});
	});
});
