// Shared steps and readings for the browser tests: waiting for a phase, reading the buttons, and pointing at the stage.

import assert from "node:assert/strict";

import type { Page } from "@playwright/test";

export const storageKey = "fortune-teller.config.v2";
// The accessible names of the four pocket buttons, which show a colour and no word.
export const defaultPocketNames = ["purple", "slate", "green", "peach"];
export const firstNumberPrompt = "Choose a number.";
export const secondNumberPrompt = "what special day is it?";

export async function waitForPhase(page: Page, phase: string): Promise<void> {
	await page.locator(`.fortune-teller[data-phase="${phase}"]`).waitFor();
}

export async function waitForStatus(page: Page, text: string): Promise<void> {
	await page.locator(".fortune-teller__status", { hasText: text }).waitFor();
}

export async function statusText(page: Page): Promise<string> {
	return page.locator(".fortune-teller__status").innerText();
}

/** Returns what each choice button is called: its accessible name if it has one, else its text. */
export async function choiceNames(page: Page): Promise<string[]> {
	return page
		.locator(".fortune-teller__choices button")
		.evaluateAll((buttons) => buttons.map((button) => button.getAttribute("aria-label") ?? button.textContent ?? ""));
}

export async function focusedName(page: Page): Promise<string | null> {
	return page.evaluate(() => document.activeElement?.getAttribute("aria-label") ?? document.activeElement?.textContent ?? null);
}

/** Clicks a pocket button, then the first number, then the second number, waiting for each prompt. */
export async function chooseWithButtons(page: Page, names: readonly [string, string, string]): Promise<void> {
	const [pocketName, firstNumber, secondNumber] = names;
	await page.getByRole("button", { name: pocketName, exact: true }).click();
	await waitForStatus(page, firstNumberPrompt);
	await page.getByRole("button", { name: firstNumber, exact: true }).click();
	await waitForStatus(page, secondNumberPrompt);
	await page.getByRole("button", { name: secondNumber, exact: true }).click();
}

export async function stagePoint(page: Page, shareX: number, shareY: number): Promise<[number, number]> {
	const box = await page.locator(".fortune-teller__stage").boundingBox();
	assert.ok(box !== null, "the stage must be on the page");
	return [box.x + box.width * shareX, box.y + box.height * shareY];
}

export async function clickStage(page: Page, shareX: number, shareY: number): Promise<void> {
	await page.mouse.click(...(await stagePoint(page, shareX, shareY)));
}

export function collectPageErrors(page: Page): string[] {
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
