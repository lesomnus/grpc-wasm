import { GrpcStatusCode } from "@protobuf-ts/grpcweb-transport";
import type { MessageType } from "@protobuf-ts/runtime";
import { assert, beforeEach, describe, expect, test } from "vitest";

import { type CallOption, type Conn, type InvokeOption, open } from "./index";

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
		option: InvokeOption,
	) => {
		const req = i.toBinary(m);
		const rst = await conn.invoke(`/echo.EchoService/${method}`, req, option);
		const response = o.fromBinary(rst.response);
		return {
			...rst,
			response,
		};
	};
	const invokeOnce = (m: EchoRequest, option: InvokeOption) =>
		invoke("Once", EchoRequest, EchoResponse, m, option);

	test("transfer", async () => {
		const req: EchoRequest = {
			message: "Lebowski",
			circularShift: 3,
			dateCreated: Timestamp.now(),
		};
		const data = EchoRequest.toBinary(req);
		const rst = await conn.invoke(`/echo.EchoService/Once`, data, {});
		expect(data).lengthOf(0);
	});
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
	test("unary cancel", async () => {
		const req: EchoRequest = {
			message: "Lebowski",
			overVoid: true,
		};

		const ac = new AbortController();
		const p = invokeOnce(req, { signal: ac.signal });
		await new Promise<void>((resolve) => setTimeout(() => resolve(), 10));

		ac.abort();
		const { status } = await p;
		expect(status.code).toBe(GrpcStatusCode.CANCELLED);
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
