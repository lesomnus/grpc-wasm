import { type Client, Code, ConnectError, createClient } from "@connectrpc/connect";
import { assert, beforeEach, describe, expect, test } from "vitest";

import { Defer } from "../defer";
import { open } from "../index";

import { type EchoResponse, EchoService } from "./test/proto/echo/echo_pb";
import { GrpcWasmTransport } from "./transport";

async function make_transport() {
	const p = new URL("../test/echobridge.wasm", import.meta.url);
	const sock = await open(p.toString());
	const conn = sock.dial();
	return new GrpcWasmTransport({ conn });
}

async function toObject(h: Promise<Headers>): Promise<Record<string, string>> {
	return Object.fromEntries((await h).entries());
}

describe("unary", () => {
	let client: Client<typeof EchoService>;
	beforeEach(async () => {
		const transport = await make_transport();
		client = createClient(EchoService, transport);
		return () => transport.close();
	});

	test("invoke", async () => {
		const response = await client.once({
			status: {},
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
					code: Code.FailedPrecondition,
					message: "Is this your homework, Larry?",
				},
			});
			assert.fail();
		} catch (e) {
			assert.instanceOf(e, ConnectError);
			expect(e.code).toBe(Code.FailedPrecondition);
			expect(e.rawMessage).toBe("Is this your homework, Larry?");
		}
	});
	test("metadata", async () => {
		const headers = new Defer<Headers>();
		const trailers = new Defer<Headers>();

		await client.once(
			{
				message: "Lebowski",
			},
			{
				headers: { foo: "bar" },
				onHeader: (v) => headers.resolve(v),
				onTrailer: (v) => trailers.resolve(v),
			},
		);

		await expect(toObject(headers)).resolves.toMatchObject({
			// "content-type": ["application/grpc+noop"],
			foo: "bar",
			timing: "header",
		});
		await expect(toObject(trailers)).resolves.toMatchObject({
			foo: "bar",
			timing: "trailer",
		});
	});
	// Headers and trailers cannot be emitted if there were error?
	// according to the Transport interface from `@connectrpc/connect`.
	// I'm not sure.
	test.skip("error with metadata", async () => {
		const headers = new Defer<Headers>();
		const trailers = new Defer<Headers>();
		const p = client.once(
			{
				message: "",
				status: {
					code: Code.FailedPrecondition,
					message: "Is this your homework, Larry?",
				},
			},
			{
				headers: { foo: "bar" },
				onHeader: (v) => headers.resolve(v),
				onTrailer: (v) => trailers.resolve(v),
			},
		);

		await expect(toObject(headers)).resolves.toMatchObject({
			// "content-type": ["application/grpc+noop"],
			foo: "bar",
			timing: "header",
		});
		await expect(p).rejects.toThrow(ConnectError);
		await expect(p).rejects.toMatchObject({
			code: Code.FailedPrecondition,
			rawMessage: "Is this your homework, Larry?",
		});
		await expect(toObject(trailers)).resolves.toMatchObject({
			foo: "bar",
			timing: "trailer",
		});
	});
});

describe("server stream", () => {
	let client: Client<typeof EchoService>;
	beforeEach(async () => {
		const transport = await make_transport();
		client = createClient(EchoService, transport);
		return () => transport.close();
	});

	test("send and recv", async () => {
		const stream = client.many({
			message: "Lebowski",
			repeat: 3,
		});

		const vs: EchoResponse[] = [];
		for await (const res of stream) {
			vs.push(res);
		}
		expect(vs).toHaveLength(3);
		expect(vs[0].sequence).toBe(0);
		expect(vs[1].sequence).toBe(1);
		expect(vs[2].sequence).toBe(2);
	});
});
