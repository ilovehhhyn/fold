// Invariant under test: a visitor's own text reaches the paper, survives a reload and travels in a link, and a broken stored value is always reported.

import assert from "node:assert/strict";

import { test } from "@playwright/test";

import { choiceNames, chooseWithButtons, defaultPocketNames, statusText, storageKey, waitForPhase } from "./helpers";

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
	await chooseWithButtons(page, ["purple", "4", "5"]);
	await waitForPhase(page, "revealed");

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
	assert.deepEqual(await choiceNames(page), ["pink", "slate", "green", "peach"]);
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
	assert.deepEqual(await choiceNames(page), ["pink", "blue", "green", "yellow"]);
	assert.equal(await page.locator(".fortune-teller__notice").isVisible(), false);

	await page.goto("about:blank");
	await page.goto("#config=%%%");
	await waitForPhase(page, "chooseColour");
	assert.deepEqual(await choiceNames(page), defaultPocketNames);
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

	assert.deepEqual(await choiceNames(page), defaultPocketNames);
	assert.equal(
		await page.locator(".fortune-teller__notice").innerText(),
		"Your saved fortune teller could not be read (the stored text is not valid JSON), so the default one is shown.",
	);
});

test("a value saved by the earlier version of the site is not read", async ({ page }) => {
	// Invariant: the storage key changed with the look, so text saved for the old look never shows up.
	await page.addInitScript(() => {
		const earlier = {
			version: 1,
			pockets: ["red", "blue", "green", "yellow"].map((label) => ({ label, colour: "#e5484d" })),
			panels: Array.from({ length: 8 }, (_unused, index) => ({ label: String(index + 1), fortune: "An earlier fortune." })),
		};
		window.localStorage.setItem("fortune-teller.config.v1", JSON.stringify(earlier));
	});

	await page.goto("");
	await waitForPhase(page, "chooseColour");

	assert.deepEqual(await choiceNames(page), defaultPocketNames);
	assert.equal(await page.locator(".fortune-teller__notice").isVisible(), false);
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
	assert.equal(await page.getByLabel("Top right pocket label").inputValue(), "purple");
	assert.equal(new URL(page.url()).hash, "", "a reset must drop the link data from the address");
	await page.getByRole("button", { name: "Done", exact: true }).click();
	await waitForPhase(page, "chooseColour");
	assert.deepEqual(await choiceNames(page), defaultPocketNames);

	const visitor = await context.newPage();
	await visitor.goto(link);
	await waitForPhase(visitor, "chooseColour");
	assert.deepEqual(await choiceNames(visitor), ["pink", "slate", "green", "peach"]);
});
