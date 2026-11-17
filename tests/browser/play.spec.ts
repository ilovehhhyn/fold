// Invariant under test: the built site plays a whole game by keyboard and by pointer, and keeps a visitor's own text across a reload.

import assert from "node:assert/strict";

import { test } from "@playwright/test";
import type { Page } from "@playwright/test";

import { cameraFieldOfViewDegrees, playFraming } from "../../src/camera-framing";
import { computePose, expandedPocketCorner, namedPoses } from "../../src/rig";
import type { Point } from "../../src/rig";

const storageKey = "fortune-teller.config.v1";

test("the keyboard alone plays red, 3 and 5 and the status line shows fortune 5", async ({ page }) => {
	await page.goto("");
	await waitForPhase(page, "chooseColour");

	await page.keyboard.press("Tab");
	assert.equal(await focusedText(page), "red");
	await page.keyboard.press("Enter");
	await waitForStatus(page, "Choose a number.");
	assert.deepEqual(await choiceLabels(page), ["2", "3", "6", "7"]);

	await page.keyboard.press("Tab");
	assert.equal(await focusedText(page), "3");
	await page.keyboard.press("Enter");
	await waitForStatus(page, "Choose one more number to see your fortune.");
	assert.deepEqual(await choiceLabels(page), ["1", "4", "5", "8"]);

	await page.keyboard.press("Tab");
	assert.equal(await focusedText(page), "5");
	await page.keyboard.press("Enter");
	await waitForPhase(page, "revealed");

	assert.equal(await statusText(page), "Your fortune: Someone is thinking of you.");
	assert.deepEqual(await choiceLabels(page), ["Play again"]);
});

test("a fortune written in the form survives a reload and is the one that is revealed", async ({ page }) => {
	const customFortune = "Custom fortune for the test.";
	await page.goto("");
	await waitForPhase(page, "chooseColour");

	await page.getByRole("button", { name: "Edit", exact: true }).click();
	await page.getByLabel("Panel 5 fortune").fill(customFortune);
	// The camera takes 350 ms to reach the fortune; the screenshot waits for the end of that move.
	await page.waitForTimeout(700);
	await page.screenshot({ path: "screenshots/page-editor-fortune-field.png", fullPage: true });
	await page.getByRole("button", { name: "Done", exact: true }).click();
	await page.reload();
	await waitForPhase(page, "chooseColour");
	await playWithButtons(page, ["red", "3", "5"]);

	assert.equal(await statusText(page), `Your fortune: ${customFortune}`);
	await page.locator(".fortune-teller__stage").screenshot({ path: "screenshots/revealed-custom-fortune.png" });
});

test("an invalid value in the form shows its rule and is not saved", async ({ page }) => {
	await page.goto("");
	await waitForPhase(page, "chooseColour");
	await page.getByRole("button", { name: "Edit", exact: true }).click();
	const label = page.getByLabel("Top right pocket label");

	await label.fill("a label that is far too long");

	assert.equal(await label.getAttribute("aria-invalid"), "true");
	const problemId = await label.getAttribute("aria-describedby");
	assert.equal(await page.locator(`#${problemId}`).innerText(), "This must have 1 to 12 characters, got 28; shorten the text.");
	assert.equal(await page.evaluate((key) => window.localStorage.getItem(key), storageKey), null);

	await label.fill("pink");
	assert.equal(await label.getAttribute("aria-invalid"), "false");
	const saved = await page.evaluate((key) => window.localStorage.getItem(key), storageKey);
	assert.equal(JSON.parse(saved ?? "null").pockets[0].label, "pink");
	await page.getByRole("button", { name: "Done", exact: true }).click();
	await waitForPhase(page, "chooseColour");
	assert.deepEqual(await choiceLabels(page), ["pink", "blue", "green", "yellow"]);
});

test("a click on a pocket and then on two number triangles plays the game on the canvas", async ({ page }) => {
	await page.setViewportSize({ width: 1280, height: 900 });
	await page.goto("");
	await waitForPhase(page, "chooseColour");

	await clickStage(page, 0.02, 0.02);
	await page.waitForTimeout(300);
	assert.equal(await page.locator(".fortune-teller").getAttribute("data-phase"), "chooseColour", "a click beside the paper must do nothing");

	await clickStage(page, 0.68, 0.3);
	await waitForStatus(page, "Choose a number.");
	await page.mouse.move(...(await stagePoint(page, 0.6, 0.41)));
	await page.waitForTimeout(100);
	await page.locator(".fortune-teller__stage").screenshot({ path: "screenshots/hover-highlight.png" });
	assert.equal(await page.locator(".fortune-teller__stage canvas").evaluate((canvas) => getComputedStyle(canvas).cursor), "pointer");
	await clickStage(page, 0.6, 0.41);
	await waitForStatus(page, "Choose one more number to see your fortune.");
	assert.deepEqual(await choiceLabels(page), ["2", "3", "6", "7"]);
	await clickStage(page, 0.6, 0.41);
	await waitForPhase(page, "revealed");

	assert.equal(await statusText(page), "Your fortune: A good surprise is on its way.");
});

test("a corner pocket under the pointer expands outward and settles back when the pointer leaves", async ({ page }) => {
	// Invariant: hovering a pocket moves its outer corner away from the centre; leaving undoes it.
	// Witness: a point just beyond the resting corner of the red pocket is empty, then red, then empty.
	await page.setViewportSize({ width: 1280, height: 900 });
	await page.goto("");
	await waitForPhase(page, "chooseColour");
	const pose = computePose(namedPoses.closed);
	const restCorner = pose.pocketCorners.northEast;
	const grownCorner = expandedPocketCorner(restCorner, 1);
	const beyondRestCorner = projectToStage([
		(restCorner[0] + grownCorner[0]) / 2,
		(restCorner[1] + grownCorner[1]) / 2,
		(restCorner[2] + grownCorner[2]) / 2,
	]);
	const insidePocket = projectToStage([
		(restCorner[0] + pose.mids.north[0] + pose.tips.northEast[0]) / 3,
		(restCorner[1] + pose.mids.north[1] + pose.tips.northEast[1]) / 3,
		(restCorner[2] + pose.mids.north[2] + pose.tips.northEast[2]) / 3,
	]);

	assert.equal((await stagePixel(page, beyondRestCorner)).alpha, 0, "at rest the sample point must lie outside the paper");

	await page.mouse.move(...(await stagePoint(page, insidePocket[0], insidePocket[1])));
	await page.waitForTimeout(500);
	const grown = await stagePixel(page, beyondRestCorner);
	await page.locator(".fortune-teller__stage").screenshot({ path: "screenshots/hover-expanded-pocket.png" });
	assert.equal(grown.alpha, 255, "the expanded pocket must cover the sample point");
	assert.ok(grown.red > grown.blue + 60 && grown.red > grown.green + 60, `the sample point must be red, got ${JSON.stringify(grown)}`);

	await page.mouse.move(...(await stagePoint(page, 0.02, 0.02)));
	await page.waitForTimeout(500);
	assert.equal((await stagePixel(page, beyondRestCorner)).alpha, 0, "the pocket must settle back when the pointer leaves");
});

test("with reduced motion the count is one short step", async ({ page }) => {
	await page.emulateMedia({ reducedMotion: "reduce" });
	await page.goto("");
	await waitForPhase(page, "chooseColour");

	const startMs = Date.now();
	await page.getByRole("button", { name: "yellow", exact: true }).click();
	await waitForStatus(page, "Choose a number.");
	const elapsedMs = Date.now() - startMs;

	// Six counts take about 2300 ms with full motion and one step of 150 ms with reduced motion.
	assert.ok(elapsedMs < 1200, `the count took ${elapsedMs} ms`);
	assert.deepEqual(await choiceLabels(page), ["1", "4", "5", "8"]);
});

test("a shared link shows its own text, and a broken link shows a notice", async ({ page }) => {
	const shared = {
		version: 1,
		pockets: [
			{ label: "pink", colour: "#ff7ab8" },
			{ label: "blue", colour: "#3e63dd" },
			{ label: "green", colour: "#30a46c" },
			{ label: "yellow", colour: "#f5d90a" },
		],
		panels: Array.from({ length: 8 }, (_unused, index) => ({ label: String(index + 1), fortune: `Shared fortune ${index + 1}.` })),
	};
	const encoded = Buffer.from(JSON.stringify(shared), "utf8").toString("base64url");

	await page.goto(`#config=${encoded}`);
	await waitForPhase(page, "chooseColour");
	assert.deepEqual(await choiceLabels(page), ["pink", "blue", "green", "yellow"]);
	assert.equal(await page.locator(".fortune-teller__notice").isVisible(), false);

	await page.goto("about:blank");
	await page.goto("#config=%%%");
	await waitForPhase(page, "chooseColour");
	assert.deepEqual(await choiceLabels(page), ["red", "blue", "green", "yellow"]);
	assert.equal(
		await page.locator(".fortune-teller__notice").innerText(),
		"The fortune teller in this link could not be read (the link data is not valid base64url text), so it is not shown.",
	);
});

test("a broken saved value shows a notice and the default toy", async ({ page }) => {
	await page.addInitScript((key) => {
		window.localStorage.setItem(key, "{");
	}, storageKey);

	await page.goto("");
	await waitForPhase(page, "chooseColour");

	assert.deepEqual(await choiceLabels(page), ["red", "blue", "green", "yellow"]);
	assert.equal(
		await page.locator(".fortune-teller__notice").innerText(),
		"Your saved fortune teller could not be read (the stored text is not valid JSON), so the default one is shown.",
	);
});

test("copy link puts a working link on the clipboard, and reset brings the defaults back", async ({ context, page }) => {
	await context.grantPermissions(["clipboard-read", "clipboard-write"]);
	await page.goto("");
	await waitForPhase(page, "chooseColour");
	await page.getByRole("button", { name: "Edit", exact: true }).click();
	await page.getByLabel("Top right pocket label").fill("pink");

	await page.getByRole("button", { name: "Copy link", exact: true }).click();
	await page.locator(".fortune-teller__notice", { hasText: "Link copied." }).waitFor();
	const link = await page.evaluate(() => navigator.clipboard.readText());
	assert.match(link, /^http:\/\/127\.0\.0\.1:4317\/nested\/site\/#config=[A-Za-z0-9_-]+$/);

	await page.getByRole("button", { name: "Reset", exact: true }).click();
	assert.equal(await page.getByLabel("Top right pocket label").inputValue(), "red");
	assert.equal(new URL(page.url()).hash, "", "a reset must drop the link data from the address");
	await page.getByRole("button", { name: "Done", exact: true }).click();
	await waitForPhase(page, "chooseColour");
	assert.deepEqual(await choiceLabels(page), ["red", "blue", "green", "yellow"]);

	const visitor = await context.newPage();
	await visitor.goto(link);
	await waitForPhase(visitor, "chooseColour");
	assert.deepEqual(await choiceLabels(visitor), ["pink", "blue", "green", "yellow"]);
});

async function playWithButtons(page: Page, labels: readonly string[]): Promise<void> {
	for (const [index, label] of labels.entries()) {
		await page.getByRole("button", { name: label, exact: true }).click();
		if (index < labels.length - 1) {
			await waitForStatus(page, index === 0 ? "Choose a number." : "Choose one more number to see your fortune.");
		}
	}
	await waitForPhase(page, "revealed");
}

async function waitForPhase(page: Page, phase: string): Promise<void> {
	await page.locator(`.fortune-teller[data-phase="${phase}"]`).waitFor();
}

async function waitForStatus(page: Page, text: string): Promise<void> {
	await page.locator(".fortune-teller__status", { hasText: text }).waitFor();
}

async function statusText(page: Page): Promise<string> {
	return page.locator(".fortune-teller__status").innerText();
}

async function choiceLabels(page: Page): Promise<string[]> {
	return page.locator(".fortune-teller__choices button").allInnerTexts();
}

async function focusedText(page: Page): Promise<string | null> {
	return page.evaluate(() => document.activeElement?.textContent ?? null);
}

async function stagePoint(page: Page, shareX: number, shareY: number): Promise<[number, number]> {
	const box = await page.locator(".fortune-teller__stage").boundingBox();
	assert.ok(box !== null, "the stage must be on the page");
	return [box.x + box.width * shareX, box.y + box.height * shareY];
}

async function clickStage(page: Page, shareX: number, shareY: number): Promise<void> {
	await page.mouse.click(...(await stagePoint(page, shareX, shareY)));
}

// Returns where a point of the paper appears on the stage, as shares of its width and height.
// This is a pinhole projection for the play camera, written out here so the test does not
// rely on the drawing code.
function projectToStage(point: Point): readonly [number, number] {
	const { position, target } = playFraming();
	const forward = normalise([target[0] - position[0], target[1] - position[1], target[2] - position[2]]);
	const right = normalise(cross(forward, [0, 1, 0]));
	const up = cross(right, forward);
	const relative: Point = [point[0] - position[0], point[1] - position[1], point[2] - position[2]];
	const reach = dot(relative, forward) * Math.tan((cameraFieldOfViewDegrees * Math.PI) / 360);
	return [(dot(relative, right) / reach + 1) / 2, (1 - dot(relative, up) / reach) / 2];
}

// Reads one pixel of the WebGL canvas. The read happens inside an animation frame, after the
// toy has drawn that frame, because the canvas is cleared once the frame is shown.
async function stagePixel(page: Page, share: readonly [number, number]): Promise<{ red: number; green: number; blue: number; alpha: number }> {
	return page.evaluate(
		([shareX, shareY]) =>
			new Promise((resolve, reject) => {
				requestAnimationFrame(() => {
					const canvas = document.querySelector<HTMLCanvasElement>(".fortune-teller__stage canvas");
					const copy = document.createElement("canvas");
					const context = copy.getContext("2d");
					if (canvas === null || context === null) {
						reject(new Error("the stage canvas and a 2D context are required to read a pixel"));
						return;
					}
					copy.width = canvas.width;
					copy.height = canvas.height;
					context.drawImage(canvas, 0, 0);
					const [red, green, blue, alpha] = context.getImageData(Math.round(shareX * canvas.width), Math.round(shareY * canvas.height), 1, 1).data;
					resolve({ red: red ?? -1, green: green ?? -1, blue: blue ?? -1, alpha: alpha ?? -1 });
				});
			}),
		[share[0], share[1]] as const,
	);
}

function dot(left: Point, right: Point): number {
	return left[0] * right[0] + left[1] * right[1] + left[2] * right[2];
}

function cross(left: Point, right: Point): Point {
	return [left[1] * right[2] - left[2] * right[1], left[2] * right[0] - left[0] * right[2], left[0] * right[1] - left[1] * right[0]];
}

function normalise(vector: Point): Point {
	const length = Math.hypot(vector[0], vector[1], vector[2]);
	return [vector[0] / length, vector[1] / length, vector[2] / length];
}
