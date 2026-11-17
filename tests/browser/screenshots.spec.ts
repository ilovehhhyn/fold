// Invariant under test: every named pose and the revealed state draw without page errors, at a phone width and a desktop width.
//
// The screenshots are written to `screenshots/` for a person to look at. This file checks only
// that each state is reached and drawn; it does not judge the picture.

import assert from "node:assert/strict";

import { test } from "@playwright/test";
import type { Page } from "@playwright/test";

const viewports = [
	{ name: "390", width: 390, height: 844 },
	{ name: "1280", width: 1280, height: 900 },
] as const;

// Screenshots taken back to back during a count of six; each takes about 100 ms, so they
// catch the paper closed, opening and open.
const countFrames = 8;

const fixedPoses = [
	{ name: "closed", query: "0.05,0.05" },
	{ name: "open-north-south", query: "0.05,0.75" },
	{ name: "open-east-west", query: "0.75,0.05" },
	{ name: "reveal", query: "0.9,0.9" },
] as const;

for (const viewport of viewports) {
	for (const pose of fixedPoses) {
		test(`the ${pose.name} pose draws at ${viewport.name} pixels of width`, async ({ page }) => {
			const pageErrors = collectPageErrors(page);
			await page.setViewportSize({ width: viewport.width, height: viewport.height });

			await page.goto(`?pose=${pose.query}`);
			await page.locator('.fortune-teller[data-phase="fixedPose"]').waitFor();
			await waitForFrames(page);

			await page.locator(".fortune-teller__stage").screenshot({ path: `screenshots/pose-${pose.name}-${viewport.name}.png` });
			assert.deepEqual(pageErrors, []);
		});
	}

	test(`the revealed state draws at ${viewport.name} pixels of width`, async ({ page }) => {
		const pageErrors = collectPageErrors(page);
		await page.setViewportSize({ width: viewport.width, height: viewport.height });

		await page.goto("");
		await page.locator('.fortune-teller[data-phase="chooseColour"]').waitFor();
		await page.getByRole("button", { name: "red", exact: true }).click();
		await page.locator('.fortune-teller[data-phase="chooseNumber"]').waitFor();
		await page.screenshot({ path: `screenshots/page-choose-number-${viewport.name}.png`, fullPage: true });
		await page.getByRole("button", { name: "3", exact: true }).click();
		await page.locator('.fortune-teller[data-phase="chooseNumber"]').waitFor();
		await page.getByRole("button", { name: "5", exact: true }).click();
		await page.locator('.fortune-teller[data-phase="revealed"]').waitFor();
		await waitForFrames(page);

		await page.locator(".fortune-teller__stage").screenshot({ path: `screenshots/revealed-${viewport.name}.png` });
		await page.screenshot({ path: `screenshots/page-revealed-${viewport.name}.png`, fullPage: true });
		assert.deepEqual(pageErrors, []);
	});
}

test("the paper draws at every stage of a count, and the page asks no other host for anything", async ({ page }) => {
	const pageErrors = collectPageErrors(page);
	const requestedUrls: string[] = [];
	page.on("request", (request) => {
		requestedUrls.push(request.url());
	});
	await page.setViewportSize({ width: 1280, height: 900 });
	await page.goto("");
	await page.locator('.fortune-teller[data-phase="chooseColour"]').waitFor();

	await page.getByRole("button", { name: "yellow", exact: true }).click();
	for (let frame = 0; frame < countFrames; frame += 1) {
		await page.locator(".fortune-teller__stage").screenshot({ path: `screenshots/count-frame-${frame}.png` });
	}
	await page.locator('.fortune-teller[data-phase="chooseNumber"]').waitFor();

	assert.deepEqual(pageErrors, []);
	assert.ok(requestedUrls.length >= 4, `only ${requestedUrls.length} requests were seen`);
	const outsideUrls = requestedUrls.filter((url) => !url.startsWith("http://127.0.0.1:4317/nested/site/") && !url.startsWith("data:"));
	assert.deepEqual(outsideUrls, []);
});

test("an invalid pose parameter shows an error and no toy", async ({ page }) => {
	await page.goto("?pose=2,0.5");

	const problem = page.getByRole("alert");
	await problem.waitFor();
	assert.match(await problem.innerText(), /pose must be two numbers from 0 to 1/);
	assert.equal(await page.locator("canvas").count(), 0);
});

function collectPageErrors(page: Page): string[] {
	const pageErrors: string[] = [];
	page.on("pageerror", (error) => {
		pageErrors.push(error.message);
	});
	page.on("console", (message) => {
		if (message.type() === "error") {
			pageErrors.push(message.text());
		}
	});
	return pageErrors;
}

// The toy draws on animation frames; three frames cover the resize, the draw and the present.
async function waitForFrames(page: Page): Promise<void> {
	await page.evaluate(
		() =>
			new Promise<void>((resolve) => {
				requestAnimationFrame(() => {
					requestAnimationFrame(() => {
						requestAnimationFrame(() => {
							resolve();
						});
					});
				});
			}),
	);
}
