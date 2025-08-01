import { GrpcStatusCode } from "@protobuf-ts/grpcweb-transport";
import { RpcError } from "@protobuf-ts/runtime-rpc";
import { assert, beforeEach, describe, expect, test } from "vitest";

import { open } from "../index";
import { sleep } from "../test/util";

import type { EchoResponse } from "./test/proto/echo/echo";
import { EchoServiceClient } from "./test/proto/echo/echo.client";
import { GrpcWasmTransport } from "./transport";

async function make_transport() {
	const p = new URL("../test/echobridge.wasm", import.meta.url);
	const sock = await open(p.toString());
	const conn = sock.dial();
	return new GrpcWasmTransport({ conn });
}

describe("unary", () => {
	let client: EchoServiceClient;
	beforeEach(async () => {
		const transport = await make_transport();
		client = new EchoServiceClient(transport);
		return () => transport.close();
	});

	test("invoke", async () => {
		const { response } = await client.once({
			message: "Lebowski",
			circularShift: 3,
		});
		expect(response.message).toBe("skiLebow");
	});
	test("error", async () => {
		try {
			await client.once({
				message: "",
				status: {
					code: GrpcStatusCode.FAILED_PRECONDITION,
					message: "Is this your homework, Larry?",
				},
			});
			assert.fail();
		} catch (e) {
			assert.instanceOf(e, RpcError);
			expect(e.code).toBe(GrpcStatusCode[GrpcStatusCode.FAILED_PRECONDITION]);
			expect(e.message).toBe("Is this your homework, Larry?");
		}
	});
	test("metadata", async () => {
		const { headers, trailers } = await client.once(
			{
				message: "Lebowski",
			},
			{ meta: { foo: ["bar"] } },
		);
		expect(headers).toMatchObject({
			// "content-type": ["application/grpc+noop"],
			foo: ["bar"],
			timing: ["header"],
		});
		expect(trailers).toEqual({
			foo: ["bar"],
			timing: ["trailer"],
		});
	});
	test("error with metadata", async () => {
		const p = client.once(
			{
				message: "",
				status: {
					code: GrpcStatusCode.FAILED_PRECONDITION,
					message: "Is this your homework, Larry?",
				},
			},
			{ meta: { foo: ["bar"] } },
		);
		const { headers, response, status, trailers } = p;
		await expect(headers).resolves.toMatchObject({
			// "content-type": ["application/grpc+noop"],
			foo: ["bar"],
			timing: ["header"],
		});
		await expect(status).resolves.toEqual({
			code: GrpcStatusCode[GrpcStatusCode.FAILED_PRECONDITION],
			detail: "Is this your homework, Larry?",
		});
		await expect(trailers).resolves.toMatchObject({
			foo: ["bar"],
			timing: ["trailer"],
		});

		try {
			await response;
			assert.fail();
		} catch (e) {
			assert.instanceOf(e, RpcError);
			expect(e.code).toBe(GrpcStatusCode[GrpcStatusCode.FAILED_PRECONDITION]);
			expect(e.message).toBe("Is this your homework, Larry?");
		}

		try {
			await p;
			assert.fail();
		} catch (e) {
			assert.instanceOf(e, RpcError);
			expect(e.code).toBe(GrpcStatusCode[GrpcStatusCode.FAILED_PRECONDITION]);
			expect(e.message).toBe("Is this your homework, Larry?");
		}
	});
	test("abort", async () => {
		const ac = new AbortController();
		const p = client.once(
			{
				message: "",
				overVoid: true,
			},
			{
				abort: ac.signal,
			},
		);
		p.then(() => assert.fail()).catch(() => {});
		await sleep(10);

		ac.abort();
		try {
			await p.response;
			assert.fail();
		} catch (e) {
			assert.instanceOf(e, RpcError);
			expect(e.code).toBe(GrpcStatusCode[GrpcStatusCode.CANCELLED]);
		}
	});
	test("timeout", async () => {
		const p = client.once(
			{
				message: "",
				overVoid: true,
			},
			{
				timeout: 20,
			},
		);
		p.then(() => assert.fail()).catch(() => {});
		await sleep(10);

		try {
			await p.response;
			assert.fail();
		} catch (e) {
			assert.instanceOf(e, RpcError);
			expect(e.code).toBe(GrpcStatusCode[GrpcStatusCode.DEADLINE_EXCEEDED]);
		}
	});
});

describe("server stream", () => {
	let client: EchoServiceClient;
	beforeEach(async () => {
		const transport = await make_transport();
		client = new EchoServiceClient(transport);
		return () => transport.close();
	});

	test("send and recv", async () => {
		const { responses } = client.many({
			message: "Lebowski",
			repeat: 3,
		});

		const vs: EchoResponse[] = [];
		for await (const res of responses) {
			vs.push(res);
		}
		expect(vs).toHaveLength(3);
		expect(vs[0].sequence).toBe(0);
		expect(vs[1].sequence).toBe(1);
		expect(vs[2].sequence).toBe(2);
	});
	test("abort", async () => {
		const ac = new AbortController();
		const { responses, status } = client.many(
			{
				message: "",
				overVoid: true,
			},
			{
				abort: ac.signal,
			},
		);
		responses.onMessage(() => assert.fail());
		await sleep(10);

		ac.abort();
		const { code } = await status;
		expect(code).toBe(GrpcStatusCode[GrpcStatusCode.CANCELLED]);
	});
	test("timeout", async () => {
		const { responses, status } = client.many(
			{
				message: "",
				overVoid: true,
			},
			{
				timeout: 20,
			},
		);
		responses.onMessage(() => assert.fail());
		await sleep(10);

		const { code } = await status;
		expect(code).toBe(GrpcStatusCode[GrpcStatusCode.DEADLINE_EXCEEDED]);
	});
});

describe("client stream", () => {
	let client: EchoServiceClient;
	beforeEach(async () => {
		const transport = await make_transport();
		client = new EchoServiceClient(transport);
		return () => transport.close();
	});

	test("send and recv", async () => {
		const { requests, response } = client.buff({
			message: "Lebowski",
			repeat: 3,
		});

		await requests.send({ message: "Lebowski" });
		await requests.send({ message: "Lebowski" });
		await requests.send({ message: "Lebowski" });
		await requests.complete();

		const { items } = await response;
		expect(items).toHaveLength(3);
		expect(items[0].sequence).toBe(0);
		expect(items[1].sequence).toBe(1);
		expect(items[2].sequence).toBe(2);
	});
	test("abort", async () => {
		const ac = new AbortController();
		const { response } = client.buff({
			abort: ac.signal,
		});
		response.then(() => assert.fail()).catch(() => {});
		await sleep(10);

		ac.abort();
		try {
			await response;
			assert.fail();
		} catch (e) {
			assert.instanceOf(e, RpcError);
			expect(e.code).toBe(GrpcStatusCode[GrpcStatusCode.CANCELLED]);
		}
	});
	test("timeout", async () => {
		const { response } = client.buff({
			timeout: 20,
		});
		response.then(() => assert.fail()).catch(() => {});
		await sleep(10);

		try {
			await response;
			assert.fail();
		} catch (e) {
			assert.instanceOf(e, RpcError);
			expect(e.code).toBe(GrpcStatusCode[GrpcStatusCode.DEADLINE_EXCEEDED]);
		}
	});
});

describe("bidi stream", () => {
	let client: EchoServiceClient;
	beforeEach(async () => {
		const transport = await make_transport();
		client = new EchoServiceClient(transport);
		return () => transport.close();
	});

	test("send multiple", async () => {
		const { requests, responses } = client.live();
		await requests.send({ message: "Lebowski" });
		await requests.send({ message: "Lebowski" });
		await requests.send({ message: "Lebowski" });
		await requests.complete();

		const vs: EchoResponse[] = [];
		for await (const res of responses) {
			vs.push(res);
		}
		expect(vs).toHaveLength(3);
		expect(vs[0].sequence).toBe(0);
		expect(vs[1].sequence).toBe(1);
		expect(vs[2].sequence).toBe(2);
	});
	test("abort", async () => {
		const ac = new AbortController();
		const { responses, status } = client.live({
			abort: ac.signal,
		});
		responses.onMessage(() => assert.fail());
		await sleep(10);

		ac.abort();
		const { code } = await status;
		expect(code).toBe(GrpcStatusCode[GrpcStatusCode.CANCELLED]);
	});
	test("timeout", async () => {
		const { responses, status } = client.live({
			timeout: 20,
		});
		responses.onMessage(() => assert.fail());
		await sleep(10);

		const { code } = await status;
		expect(code).toBe(GrpcStatusCode[GrpcStatusCode.DEADLINE_EXCEEDED]);
	});
});
