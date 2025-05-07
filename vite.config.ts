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
				"protobuf-ts": resolve(__dirname, "src/protobuf-ts/index.ts"),
			},
			formats: ["es"],
			fileName: (format, entryName) => `${entryName}.${format}.js`,
		},
		rollupOptions: {
			external: ["@protobuf-ts/grpcweb-transport", "@protobuf-ts/runtime-rpc"],
		},
	},
	plugins: [
		dts({
			tsconfigPath: "./tsconfig.app.json",
			exclude: ["src/**/*.test.ts", "src/test/**"],
		}),
	],
	test: {},
});
