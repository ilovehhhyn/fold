// Invariant under test: a host page can mount the toy into its own element and remove it again without leftovers.

import assert from "node:assert/strict";

import { test } from "@playwright/test";

const sourceUrl = "http://127.0.0.1:4318/";

test("destroy removes every element and releases the WebGL context", async ({ page }) => {
	const pageErrors: string[] = [];
	page.on("pageerror", (error) => {
		pageErrors.push(error.message);
	});
	await page.goto(`${sourceUrl}?pose=0.05,0.05`);
	await page.locator('.fortune-teller[data-phase="fixedPose"]').waitFor();

	const result = await page.evaluate(async () => {
		const modulePath = "/src/index.ts";
		const { mountFortuneTeller } = await import(/* @vite-ignore */ modulePath);
		const host = document.createElement("div");
		host.style.width = "300px";
		document.body.append(host);
		const mounted = mountFortuneTeller(host);
		const started = Date.now();
		while (host.querySelector('[data-phase="chooseColour"]') === null) {
			if (Date.now() - started > 10_000) {
				throw new Error("the embedded toy did not start within 10 seconds");
			}
			await new Promise((resolve) => setTimeout(resolve, 50));
		}
		const canvas = host.querySelector("canvas");
		if (canvas === null) {
			throw new Error("the embedded toy must contain a canvas");
		}
		const canvasWidthPixels = canvas.getBoundingClientRect().width;
		let hasLostContext = false;
		canvas.addEventListener("webglcontextlost", () => {
			hasLostContext = true;
		});
		mounted.destroy();
		await new Promise((resolve) => setTimeout(resolve, 300));
		return { canvasWidthPixels, childCount: host.childElementCount, hasLostContext };
	});

	assert.equal(result.canvasWidthPixels, 300, "the toy must fill the width of its host element");
	assert.equal(result.childCount, 0);
	assert.equal(result.hasLostContext, true);
	assert.deepEqual(pageErrors, []);
});
