import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import dts from "vite-plugin-dts";
import { defineConfig } from "vitest/config";

const __dirname = dirname(fileURLToPath(import.meta.url));

// https://vite.dev/config/
export default defineConfig({
	build: {
		minify: false,
		sourcemap: true,
		lib: {
			entry: {
				index: resolve(__dirname, "src/index.ts"),
				worker: resolve(__dirname, "src/worker.ts"),
				"@protobuf-ts": resolve(__dirname, "src/@protobuf-ts/index.ts"),
				"@connectrpc": resolve(__dirname, "src/@connectrpc/index.ts"),
			},
			formats: ["es"],
			fileName: (format, entryName) => `${entryName}.${format}.js`,
		},
		rollupOptions: {
			external: [
				"@bufbuild/protobuf",
				"@connectrpc/connect",
				"@protobuf-ts/grpcweb-transport",
				"@protobuf-ts/runtime-rpc",
			],
		},
	},
	plugins: [
		dts({
			tsconfigPath: "./tsconfig.app.json",
			exclude: ["src/@connectrpc/test", "src/@protobuf-ts/test", "src/test", "src/**/*.test.ts"],
		}),
	],
	test: {},
});
