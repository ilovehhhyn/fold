// Invariant under test: the second number choice always offers 3 and asks its question; 3 opens the letter only for a link with the right key, and every other choice shows a normal fortune.
//
// The letter tests need the real key and the plain text, which are not in the repository. They
// read the key from the environment variable LETTER_KEY and the text from private/letter.txt,
// and are skipped, with a reason, when either is missing.

import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { test } from "@playwright/test";

import { choiceNames, chooseWithButtons, collectPageErrors, firstNumberPrompt, secondNumberPrompt, statusText, waitForPhase, waitForStatus } from "./helpers";

const letterKey = process.env["LETTER_KEY"];
const letterPath = fileURLToPath(new URL("../../private/letter.txt", import.meta.url));
const letterText = existsSync(letterPath) ? readFileSync(letterPath, "utf8").trimEnd() : undefined;
const skipReason = "needs LETTER_KEY and private/letter.txt, which are not in the repository";
const pixelsPerInch = 96;

// Each row is a pocket and a first number, with the numbers the second choice must then offer.
const secondChoices = [
	{ pocket: "purple", first: "4", offered: ["1", "3", "5", "8"] },
	{ pocket: "purple", first: "1", offered: ["2", "3", "6", "7"] },
	{ pocket: "slate", first: "2", offered: ["2", "3", "6", "7"] },
	{ pocket: "green", first: "3", offered: ["1", "3", "5", "8"] },
	{ pocket: "peach", first: "7", offered: ["1", "3", "5", "8"] },
] as const;

for (const { first, offered, pocket } of secondChoices) {
	test(`after ${pocket} and ${first}, the second choice asks its question and offers ${offered.join(", ")}`, async ({ page }) => {
		await page.goto("");
		await waitForPhase(page, "chooseColour");

		await page.getByRole("button", { name: pocket, exact: true }).click();
		await waitForStatus(page, firstNumberPrompt);
		await page.getByRole("button", { name: first, exact: true }).click();
		await waitForStatus(page, secondNumberPrompt);

		assert.equal(await statusText(page), "what special day is it?");
		assert.deepEqual(await choiceNames(page), offered);
	});
}

test("without a key, 3 shows the fortune of panel 3, also where it stands in for 4, and the next game shows 4 again", async ({ page }) => {
	await page.goto("");
	await waitForPhase(page, "chooseColour");

	await chooseWithButtons(page, ["purple", "4", "3"]);
	await waitForPhase(page, "revealed");
	assert.equal(await statusText(page), "Your fortune: Ask again after a snack.");
	await page.locator(".fortune-teller__stage").screenshot({ path: "screenshots/revealed-three-in-place-of-four.png" });
	assert.equal(await page.locator("body").getAttribute("data-view"), null);

	await page.getByRole("button", { name: "Play again", exact: true }).click();
	await waitForPhase(page, "chooseColour");
	await page.getByRole("button", { name: "purple", exact: true }).click();
	await waitForStatus(page, firstNumberPrompt);
	assert.deepEqual(await choiceNames(page), ["1", "4", "5", "8"]);
});

test("a link with a wrong key says so and shows a normal fortune for 3", async ({ page }) => {
	await page.goto(`#key=${"A".repeat(43)}`);
	await waitForPhase(page, "chooseColour");

	assert.equal(
		await page.getByRole("status").filter({ hasText: "letter" }).innerText(),
		"This link cannot open its letter: the key in the link does not open this letter. Ask for the link again.",
	);
	await chooseWithButtons(page, ["slate", "2", "3"]);
	await waitForPhase(page, "revealed");
	assert.equal(await statusText(page), "Your fortune: Ask again after a snack.");
});

const letterRoutes = [
	{ name: "where 3 stands in for 4", choices: ["purple", "4", "3"] },
	{ name: "where 3 is in its own place", choices: ["slate", "2", "3"] },
] as const;

for (const { choices, name } of letterRoutes) {
	test(`with the key, 3 opens the letter on a blank page, ${name}`, async ({ page }) => {
		test.skip(letterKey === undefined || letterText === undefined, skipReason);
		const pageErrors = collectPageErrors(page);
		await page.setViewportSize({ width: 1280, height: 900 });
		await page.goto(`#key=${letterKey}`);
		await waitForPhase(page, "chooseColour");

		await chooseWithButtons(page, choices);
		await page.locator('body[data-view="letter"] .letter--shown').waitFor();
		await page.waitForTimeout(800);

		assert.equal(await page.locator(".letter__text").evaluate((element) => element.textContent), letterText);
		assert.equal(await page.locator("canvas").count(), 0, "the toy must be gone");
		assert.equal(await page.locator("main").isVisible(), false);
		const style = await page.locator(".letter").evaluate((element) => {
			const computed = getComputedStyle(element);
			return {
				fontFamily: computed.fontFamily,
				fontSize: computed.fontSize,
				colour: computed.color,
				background: getComputedStyle(document.body).backgroundColor,
				opacity: computed.opacity,
			};
		});
		assert.match(style.fontFamily, /^Arial\b/);
		// 11 points are 11 / 72 inch, which is 14.667 CSS pixels.
		assert.ok(Math.abs(Number.parseFloat(style.fontSize) - (11 / 72) * pixelsPerInch) < 0.01, `font size is ${style.fontSize}`);
		assert.equal(style.colour, "rgb(0, 0, 0)");
		assert.equal(style.background, "rgb(255, 255, 255)");
		assert.equal(style.opacity, "1");
		const textBox = await page.locator(".letter__text").boundingBox();
		assert.ok(textBox !== null);
		// A page 8.5 inches wide with 1 inch margins leaves a text column of 6.5 inches, centred.
		assert.ok(Math.abs(textBox.width - 6.5 * pixelsPerInch) < 1, `text width is ${textBox.width}`);
		assert.ok(Math.abs(textBox.x - (1280 - 6.5 * pixelsPerInch) / 2) < 1, `text starts at ${textBox.x}`);
		assert.deepEqual(pageErrors, []);
	});
}

test("the letter keeps readable margins on a phone, and the screenshots of it stay out of the repository", async ({ page }) => {
	test.skip(letterKey === undefined || letterText === undefined, skipReason);
	for (const viewport of [{ name: "390", width: 390, height: 844 }, { name: "1280", width: 1280, height: 900 }]) {
		await page.setViewportSize({ width: viewport.width, height: viewport.height });
		await page.goto("about:blank");
		await page.goto(`#key=${letterKey}`);
		await waitForPhase(page, "chooseColour");
		await chooseWithButtons(page, ["slate", "2", "3"]);
		await page.locator('body[data-view="letter"] .letter--shown').waitFor();
		await page.waitForTimeout(800);

		const textBox = await page.locator(".letter__text").boundingBox();
		assert.ok(textBox !== null);
		assert.ok(textBox.x >= 24, `the left margin is ${textBox.x} pixels at ${viewport.name}`);
		assert.ok(viewport.width - (textBox.x + textBox.width) >= 24, `the right margin is too small at ${viewport.name}`);
		assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), true, "the page must not scroll sideways");
		// screenshots/ is ignored by Git, so the letter text in this picture is not published.
		await page.screenshot({ path: `screenshots/private-letter-${viewport.name}.png` });
	}
});
