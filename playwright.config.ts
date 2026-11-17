// Browser test settings: the tests run against the production build, served from a nested path.

import { defineConfig } from "@playwright/test";

const siteUrl = "http://127.0.0.1:4317/nested/site/";
// The development server serves the source modules, which the embedding test imports directly.
const sourceUrl = "http://127.0.0.1:4318/";

// Playwright requires the configuration to be the default export.
export default defineConfig({
	testDir: "tests/browser",
	fullyParallel: false,
	workers: 1,
	reporter: "list",
	use: {
		baseURL: siteUrl,
		// The installed Google Chrome runs the tests, so no browser download is needed.
		channel: "chrome",
	},
	webServer: [
		{
			command: "npm run build && node tests/browser/serve-dist.mjs",
			url: siteUrl,
			reuseExistingServer: false,
			timeout: 120_000,
		},
		{
			command: "npx vite --host 127.0.0.1 --port 4318 --strictPort",
			url: sourceUrl,
			reuseExistingServer: false,
			timeout: 120_000,
		},
	],
});
