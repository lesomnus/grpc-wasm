import { GrpcStatusCode } from "@protobuf-ts/grpcweb-transport";
import type { MessageType } from "@protobuf-ts/runtime";
import { beforeEach, describe, expect, test } from "vitest";

import { type CallOption, type Conn, open } from "./index";

import { EchoRequest, EchoResponse } from "./test/proto/echo/echo";
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

	const invoke = async <I extends {}, O extends {}>(
		method: string,
		i: MessageType<I>,
		o: MessageType<O>,
		m: I,
		option: CallOption,
	) => {
		const req = i.toBinary(m);
		const rst = await conn.invoke(`/echo.EchoService/${method}`, req, option);
		const response = o.fromBinary(rst.response);
		return {
			...rst,
			response,
		};
	};
	const invokeOnce = (m: EchoRequest, option: CallOption) =>
		invoke("Once", EchoRequest, EchoResponse, m, option);

	test("unary", async () => {
		const req: EchoRequest = {
			message: "Lebowski",
			circularShift: 3,
			dateCreated: Timestamp.now(),
		};
		const { response: res, status } = await invokeOnce(req, {});
		expect(status.code).toEqual(0);
		expect(res.message).toEqual("skiLebow");
		expect(res.dateCreated).not.toBeUndefined();
		expect(Timestamp.toDate(res.dateCreated!).getTime()).toBeGreaterThan(
			Timestamp.toDate(req.dateCreated!).getTime(),
		);
	});
	test("unary with error", async () => {
		const req: EchoRequest = {
			message: "",
			status: {
				code: GrpcStatusCode.FAILED_PRECONDITION,
				message: "Is this your homework, Larry?",
			},
		};
		const { status } = await invokeOnce(req, {});
		expect(status).toEqual(req.status);
	});
	test("unary with metadata", async () => {
		const meta = { foo: ["bar"] };
		const req: EchoRequest = { message: "" };
		const { header, trailer } = await invokeOnce(req, { meta });
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
		const req: EchoRequest = {
			message: "",
			status: {
				code: GrpcStatusCode.FAILED_PRECONDITION,
				message: "Is this your homework, Larry?",
			},
		};
		const { header, trailer, status } = await invokeOnce(req, { meta });
		expect(status).toEqual(req.status);
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
