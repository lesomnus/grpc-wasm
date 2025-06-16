import { GrpcStatusCode } from "@protobuf-ts/grpcweb-transport";
import { assert, beforeEach, describe, expect, test } from "vitest";

import { type Conn, open } from "./index";

import { EchoBatchResponse, EchoRequest, EchoResponse } from "./@protobuf-ts/test/proto/echo/echo";
import { sleep } from "./test/util";

describe("server stream", () => {
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
		const req: EchoRequest = {
			message: "Lebowski",
			circularShift: 1,
			repeat: 3,
		};
		const stream = await conn.open_server_stream(
			"/echo.EchoService/Many",
			EchoRequest.toBinary(req),
			{},
		);

		await stream.close();

		await expect(stream.recv()).rejects.toThrow("closed");
	});
	test("recv", async () => {
		const req: EchoRequest = {
			message: "Lebowski",
			repeat: 3,
		};
		const stream = await conn.open_server_stream(
			"/echo.EchoService/Many",
			EchoRequest.toBinary(req),
			{},
		);

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
});

describe("client stream", () => {
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
		const stream = await conn.open_client_stream("/echo.EchoService/Buff", {});

		await stream.close();

		await expect(stream.close_and_recv()).rejects.toThrow("closed");
	});
	test("send and recv", async () => {
		const stream = await conn.open_client_stream("/echo.EchoService/Buff", {});

		const req: EchoRequest = {
			message: "Lebowski",
			repeat: 3,
		};
		await stream.send(EchoRequest.toBinary(req));

		const result = await stream.close_and_recv();

		const res = EchoBatchResponse.fromBinary(result.response);
		expect(res.items).lengthOf(3);
		expect(res.items[0].sequence).toBe(0);
		expect(res.items[1].sequence).toBe(1);
		expect(res.items[2].sequence).toBe(2);
	});
});

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
