// Build and unit-test settings for the fortune teller: relative asset URLs and browser-free unit tests.

import { defineConfig } from "vitest/config";

// Vite requires the configuration to be the default export.
export default defineConfig({
	// A relative base makes the built files work from any sub-path.
	base: "./",
	// Three.js alone is about 600 kB minified, above Vite's default warning limit of 500 kB.
	build: { chunkSizeWarningLimit: 800, target: "es2022" },
	test: { environment: "node", include: ["src/**/*.test.ts"] },
});
