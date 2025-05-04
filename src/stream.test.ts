import { GrpcStatusCode } from "@protobuf-ts/grpcweb-transport";
import type { MessageType } from "@protobuf-ts/runtime";
import { assert, beforeEach, describe, expect, test } from "vitest";

import { type CallOption, type Conn, open } from "./index";

import { EchoRequest, EchoResponse } from "./test/proto/echo/echo";
import { Timestamp } from "./test/proto/google/protobuf/timestamp";

describe("bidi stream", () => {
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

	test("close", async () => {
		const stream = await conn.open_bidi_stream("/echo.EchoService/Live", {});

		await stream.close();

		await expect(stream.recv()).rejects.toThrow("closed");
	});
	test("recv and close", async () => {
		const stream = await conn.open_bidi_stream("/echo.EchoService/Live", {});

		const p = stream.recv();
		await sleep(10);

		await stream.close();

		const result = await p;
		if (!result.done) assert.fail();
		expect(result.status.code).toEqual(GrpcStatusCode.CANCELLED);
	});
	test("close send", async () => {
		const stream = await conn.open_bidi_stream("/echo.EchoService/Live", {});

		await stream.close_send();
		const result = await stream.recv();
		if (!result.done) assert.fail();
		expect(result.status.code).toBe(GrpcStatusCode.OK);
	});
	test("recv and close send", async () => {
		const stream = await conn.open_bidi_stream("/echo.EchoService/Live", {});

		const p = stream.recv();
		await sleep(10);

		await stream.close_send();

		const result = await p;
		if (!result.done) assert.fail();
		expect(result.status.code).toBe(GrpcStatusCode.OK);
	});
	test("send and recv", async () => {
		const stream = await conn.open_bidi_stream("/echo.EchoService/Live", {});

		const req: EchoRequest = {
			message: "Lebowski",
			circularShift: 3,
		};
		await stream.send(EchoRequest.toBinary(req));

		const result = await stream.recv();
		if (result.done) assert.fail();
		const res = EchoResponse.fromBinary(result.response);
		expect(res.message).toBe("skiLebow");
	});
	test("recv and send", async () => {
		const stream = await conn.open_bidi_stream("/echo.EchoService/Live", {});

		const p = stream.recv();
		await sleep(10);

		const req: EchoRequest = {
			message: "Lebowski",
			circularShift: 3,
		};
		await stream.send(EchoRequest.toBinary(req));

		const result = await p;
		if (result.done) assert.fail();
		const res = EchoResponse.fromBinary(result.response);
		expect(res.message).toBe("skiLebow");
	});
	test("send multiple", async () => {
		const stream = await conn.open_bidi_stream("/echo.EchoService/Live", {});

		const req: EchoRequest = {
			message: "Lebowski",
		};
		await stream.send(EchoRequest.toBinary(req));
		await stream.send(EchoRequest.toBinary(req));
		await stream.send(EchoRequest.toBinary(req));

		{
			const result = await stream.recv();
			if (result.done) assert.fail();
			const res = EchoResponse.fromBinary(result.response);
			expect(res.sequence).toBe(0);
		}
		{
			const result = await stream.recv();
			if (result.done) assert.fail();
			const res = EchoResponse.fromBinary(result.response);
			expect(res.sequence).toBe(1);
		}
		{
			const result = await stream.recv();
			if (result.done) assert.fail();
			const res = EchoResponse.fromBinary(result.response);
			expect(res.sequence).toBe(2);
		}
	});
	test("recv many", async () => {
		const stream = await conn.open_bidi_stream("/echo.EchoService/Live", {});

		const req: EchoRequest = {
			message: "Lebowski",
			repeat: 3,
		};
		await stream.send(EchoRequest.toBinary(req));

		{
			const result = await stream.recv();
			if (result.done) assert.fail();
			const res = EchoResponse.fromBinary(result.response);
			expect(res.sequence).toBe(0);
		}
		{
			const result = await stream.recv();
			if (result.done) assert.fail();
			const res = EchoResponse.fromBinary(result.response);
			expect(res.sequence).toBe(1);
		}
		{
			const result = await stream.recv();
			if (result.done) assert.fail();
			const res = EchoResponse.fromBinary(result.response);
			expect(res.sequence).toBe(2);
		}
	});
	test("error", async () => {
		const stream = await conn.open_bidi_stream("/echo.EchoService/Live", {});

		const req: EchoRequest = {
			message: "",
			status: {
				code: GrpcStatusCode.FAILED_PRECONDITION,
				message: "Is this your homework, Larry?",
			},
		};
		await stream.send(EchoRequest.toBinary(req));

		const result = await stream.recv();
		if (!result.done) assert.fail();
		expect(result.status.code).toBe(GrpcStatusCode.FAILED_PRECONDITION);
	});
	test("with metadata", async () => {
		const stream = await conn.open_bidi_stream("/echo.EchoService/Live", {
			meta: {
				foo: ["bar"],
			},
		});

		const header = await stream.header();
		expect(header).toMatchObject({
			// "content-type": ["application/grpc+noop"],
			foo: ["bar"],
			timing: ["header"],
		});

		await stream.close_send();

		const result = await stream.recv();
		if (!result.done) assert.fail();
		expect(result.trailer).toMatchObject({
			foo: ["bar"],
			timing: ["trailer"],
		});
	});
});

function sleep(ms: number): Promise<void> {
	return new Promise((resolve) => {
		setTimeout(() => {
			resolve();
		}, ms);
	});
}
