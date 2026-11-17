// Invariant under test: the built site plays a whole game by keyboard and by pointer, shows no heading and no pocket words, and reacts to the pointer.

import assert from "node:assert/strict";

import { test } from "@playwright/test";
import type { Page } from "@playwright/test";

import { cameraFieldOfViewDegrees, playFraming } from "../../src/camera-framing";
import { computePose, expandedPocketCorner, namedPoses } from "../../src/rig";
import type { Point } from "../../src/rig";
import {
	choiceNames,
	clickStage,
	defaultPocketNames,
	firstNumberPrompt,
	focusedName,
	secondNumberPrompt,
	stagePoint,
	statusText,
	waitForPhase,
	waitForStatus,
} from "./helpers";

test("the page has a pastel yellow background, no heading and no words on the pocket buttons", async ({ page }) => {
	await page.goto("");
	await waitForPhase(page, "chooseColour");

	assert.equal(await page.locator("h1, h2").count(), 0);
	const visibleText = await page.locator("body").innerText();
	assert.equal(/fortune teller/i.test(visibleText), false, `the page must not show a title, got ${JSON.stringify(visibleText)}`);
	assert.equal(await page.evaluate(() => getComputedStyle(document.body).backgroundColor), "rgb(245, 242, 184)");
	assert.deepEqual(await choiceNames(page), defaultPocketNames);
	assert.deepEqual(await page.locator(".fortune-teller__choices button").allInnerTexts(), ["", "", "", ""]);
	const swatchColours = await page
		.locator(".fortune-teller__swatch")
		.evaluateAll((swatches) => swatches.map((swatch) => getComputedStyle(swatch).backgroundColor));
	assert.deepEqual(swatchColours, ["rgb(164, 145, 211)", "rgb(129, 138, 163)", "rgb(197, 220, 160)", "rgb(249, 218, 208)"]);
});

test("the keyboard alone plays purple, 4 and 5 and the status line shows fortune 5", async ({ page }) => {
	await page.goto("");
	await waitForPhase(page, "chooseColour");

	await page.keyboard.press("Tab");
	assert.equal(await focusedName(page), "purple");
	await page.keyboard.press("Enter");
	await waitForStatus(page, firstNumberPrompt);
	assert.deepEqual(await choiceNames(page), ["1", "4", "5", "8"]);

	await page.keyboard.press("Tab");
	assert.equal(await focusedName(page), "4");
	await page.keyboard.press("Enter");
	await waitForStatus(page, secondNumberPrompt);
	assert.deepEqual(await choiceNames(page), ["1", "3", "5", "8"]);

	await page.keyboard.press("Tab");
	assert.equal(await focusedName(page), "5");
	await page.keyboard.press("Enter");
	await waitForPhase(page, "revealed");

	assert.equal(await statusText(page), "Your fortune: Someone is thinking of you.");
	assert.deepEqual(await choiceNames(page), ["Play again"]);
});

test("a click on a pocket and then on two number triangles plays the game on the canvas", async ({ page }) => {
	await page.setViewportSize({ width: 1280, height: 900 });
	await page.goto("");
	await waitForPhase(page, "chooseColour");

	await clickStage(page, 0.02, 0.02);
	await page.waitForTimeout(300);
	assert.equal(await page.locator(".fortune-teller").getAttribute("data-phase"), "chooseColour", "a click beside the paper must do nothing");

	// The top right pocket counts six and leaves the paper open east-west; number 1 is right of centre, above the middle.
	await clickStage(page, 0.68, 0.3);
	await waitForStatus(page, firstNumberPrompt);
	await page.mouse.move(...(await stagePoint(page, 0.573, 0.39)));
	await page.waitForTimeout(100);
	await page.locator(".fortune-teller__stage").screenshot({ path: "screenshots/hover-highlight.png" });
	assert.equal(await page.locator(".fortune-teller__stage canvas").evaluate((canvas) => getComputedStyle(canvas).cursor), "pointer");
	await clickStage(page, 0.573, 0.39);
	await waitForStatus(page, secondNumberPrompt);
	assert.deepEqual(await choiceNames(page), ["2", "3", "6", "7"]);
	// One count later the paper is open north-south; number 2 is right of centre, above the middle.
	await clickStage(page, 0.6, 0.41);
	await waitForPhase(page, "revealed");

	assert.equal(await statusText(page), "Your fortune: A good surprise is on its way.");
});

test("a corner pocket under the pointer expands outward and settles back when the pointer leaves", async ({ page }) => {
	// Invariant: hovering a pocket moves its outer corner away from the centre; leaving undoes it.
	// Witness: a point just beyond the resting corner of the top right pocket is empty, then purple, then empty.
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
	assert.ok(grown.blue > grown.green && grown.blue > grown.red, `the sample point must be purple, got ${JSON.stringify(grown)}`);

	await page.mouse.move(...(await stagePoint(page, 0.02, 0.02)));
	await page.waitForTimeout(500);
	assert.equal((await stagePixel(page, beyondRestCorner)).alpha, 0, "the pocket must settle back when the pointer leaves");
});

test("with reduced motion a count is one short step, and the second choice still offers 3", async ({ page }) => {
	await page.emulateMedia({ reducedMotion: "reduce" });
	await page.goto("");
	await waitForPhase(page, "chooseColour");

	const startMs = Date.now();
	await page.getByRole("button", { name: "purple", exact: true }).click();
	await waitForStatus(page, firstNumberPrompt);
	const elapsedMs = Date.now() - startMs;

	// Six counts take about 2300 ms with full motion and one step of 150 ms with reduced motion.
	assert.ok(elapsedMs < 1200, `the count took ${elapsedMs} ms`);
	assert.deepEqual(await choiceNames(page), ["1", "4", "5", "8"]);
	await page.getByRole("button", { name: "4", exact: true }).click();
	await waitForStatus(page, secondNumberPrompt);
	assert.deepEqual(await choiceNames(page), ["1", "3", "5", "8"]);
});

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
