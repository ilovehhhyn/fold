// Invariant under test: the game follows the count, opening and choice rules, and ignores input that a phase does not accept.

import assert from "node:assert/strict";

import { test } from "vitest";

import { countFor, defaultConfig, parseConfig } from "./config";
import { advanceGame, choosablePanelIndexes, initialGameState, openingsFor } from "./game";
import type { GameEvent, GameState } from "./game";

const northSouth = "northSouth";
const eastWest = "eastWest";

const countExamples: readonly (readonly [string, number])[] = [
	["red", 3],
	["7", 7],
	["12", 12],
	["13", 2],
	["Hi!", 2],
	["ice cream", 8],
	["1", 1],
	["0", 1],
	["007", 3],
];

for (const [label, expected] of countExamples) {
	test(`the label ${JSON.stringify(label)} counts as ${expected}`, () => {
		assert.equal(countFor(label), expected);
	});
}

test("a label with no letter or digit has no count and is rejected", () => {
	assert.throws(() => countFor("!?"), { name: "ConfigError", message: /^label must contain a letter or a digit, got "!\?"/ });
});

test("choosing red then 3 then 5 plays the first worked example", () => {
	const afterColour = advanceGame(initialGameState, { type: "pocketChosen", pocketIndex: 0 }, defaultConfig);
	assert.deepEqual(afterColour, {
		phase: "counting",
		openings: [northSouth, eastWest, northSouth],
		tokens: ["r", "e", "d"],
		numbersChosen: 0,
	});

	const firstChoice = advanceGame(afterColour, { type: "animationFinished" }, defaultConfig);
	assert.deepEqual(firstChoice, { phase: "chooseNumber", openAxis: northSouth, numbersChosen: 0 });
	assert.deepEqual(numbersFor(firstChoice), [2, 3, 6, 7]);

	const afterThree = advanceGame(firstChoice, { type: "panelChosen", panelIndex: 2 }, defaultConfig);
	assert.deepEqual(afterThree, {
		phase: "counting",
		openings: [eastWest, northSouth, eastWest],
		tokens: ["1", "2", "3"],
		numbersChosen: 1,
	});

	const secondChoice = advanceGame(afterThree, { type: "animationFinished" }, defaultConfig);
	assert.deepEqual(secondChoice, { phase: "chooseNumber", openAxis: eastWest, numbersChosen: 1 });
	assert.deepEqual(numbersFor(secondChoice), [1, 4, 5, 8]);

	const revealing = advanceGame(secondChoice, { type: "panelChosen", panelIndex: 4 }, defaultConfig);
	assert.deepEqual(revealing, { phase: "revealing", panelIndex: 4 });
	const revealed = advanceGame(revealing, { type: "animationFinished" }, defaultConfig);
	assert.deepEqual(revealed, { phase: "revealed", panelIndex: 4 });
	assert.equal(defaultConfig.panels[revealed.phase === "revealed" ? revealed.panelIndex : -1]?.fortune, "Someone is thinking of you.");
	assert.deepEqual(advanceGame(revealed, { type: "playAgainChosen" }, defaultConfig), initialGameState);
});

test("choosing blue then 8 plays the second worked example", () => {
	const afterColour = advanceGame(initialGameState, { type: "pocketChosen", pocketIndex: 1 }, defaultConfig);
	assert.deepEqual(openingsOf(afterColour), [northSouth, eastWest, northSouth, eastWest]);

	const firstChoice = advanceGame(afterColour, { type: "animationFinished" }, defaultConfig);
	assert.deepEqual(numbersFor(firstChoice), [1, 4, 5, 8]);

	const afterEight = advanceGame(firstChoice, { type: "panelChosen", panelIndex: 7 }, defaultConfig);
	const openings = openingsOf(afterEight);
	assert.equal(openings.length, 8);
	assert.equal(openings[0], northSouth);
	assert.equal(openings.at(-1), eastWest);
});

test("openings alternate without a restart between the two counts", () => {
	assert.deepEqual(openingsFor(1, "none"), [northSouth]);
	assert.deepEqual(openingsFor(3, northSouth), [eastWest, northSouth, eastWest]);
	assert.deepEqual(openingsFor(2, eastWest), [northSouth, eastWest]);
});

test("a count below 1 or a fractional count is rejected", () => {
	for (const badCount of [0, -1, 1.5, Number.NaN]) {
		assert.throws(() => openingsFor(badCount, "none"), { name: "RangeError", message: /^count must be a whole number of at least 1, got / });
	}
});

test("input during counting and revealing changes nothing", () => {
	const counting = advanceGame(initialGameState, { type: "pocketChosen", pocketIndex: 0 }, defaultConfig);
	const revealing: GameState = { phase: "revealing", panelIndex: 4 };
	const playerInputs: readonly GameEvent[] = [
		{ type: "pocketChosen", pocketIndex: 1 },
		{ type: "panelChosen", panelIndex: 2 },
		{ type: "playAgainChosen" },
	];

	for (const event of playerInputs) {
		assert.equal(advanceGame(counting, event, defaultConfig), counting, `counting must ignore ${event.type}`);
		assert.equal(advanceGame(revealing, event, defaultConfig), revealing, `revealing must ignore ${event.type}`);
	}
});

test("a number triangle that faces away from the camera cannot be chosen", () => {
	const openNorthSouth: GameState = { phase: "chooseNumber", openAxis: northSouth, numbersChosen: 0 };

	for (const hiddenPanelIndex of [0, 3, 4, 7]) {
		const next = advanceGame(openNorthSouth, { type: "panelChosen", panelIndex: hiddenPanelIndex }, defaultConfig);
		assert.equal(next, openNorthSouth, `panel ${hiddenPanelIndex + 1} must stay unchoosable`);
	}
});

test("events of the wrong phase change nothing", () => {
	const cases: readonly (readonly [GameState, GameEvent])[] = [
		[initialGameState, { type: "panelChosen", panelIndex: 1 }],
		[initialGameState, { type: "animationFinished" }],
		[initialGameState, { type: "playAgainChosen" }],
		[{ phase: "chooseNumber", openAxis: eastWest, numbersChosen: 1 }, { type: "pocketChosen", pocketIndex: 0 }],
		[{ phase: "revealed", panelIndex: 0 }, { type: "panelChosen", panelIndex: 0 }],
	];

	for (const [state, event] of cases) {
		assert.equal(advanceGame(state, event, defaultConfig), state, `${state.phase} must ignore ${event.type}`);
	}
});

test("an index outside the paper is a programming error, not an ignored input", () => {
	const open: GameState = { phase: "chooseNumber", openAxis: eastWest, numbersChosen: 0 };

	assert.throws(() => advanceGame(initialGameState, { type: "pocketChosen", pocketIndex: 4 }, defaultConfig), {
		name: "RangeError",
		message: "pocketIndex must be a whole number from 0 to 3, got 4",
	});
	assert.throws(() => advanceGame(open, { type: "panelChosen", panelIndex: -1 }, defaultConfig), {
		name: "RangeError",
		message: "panelIndex must be a whole number from 0 to 7, got -1",
	});
});

test("a word label on a pocket and on a panel sets both counts", () => {
	const config = parseConfig({
		...defaultConfig,
		pockets: defaultConfig.pockets.map((pocket, index) => (index === 2 ? { ...pocket, label: "ice cream" } : pocket)),
		panels: defaultConfig.panels.map((panel, index) => (index === 1 ? { ...panel, label: "cat" } : panel)),
	});

	const afterColour = advanceGame(initialGameState, { type: "pocketChosen", pocketIndex: 2 }, config);
	assert.equal(openingsOf(afterColour).length, 8);
	const choice = advanceGame(afterColour, { type: "animationFinished" }, config);
	assert.deepEqual(choice, { phase: "chooseNumber", openAxis: eastWest, numbersChosen: 0 });
	const northSouthChoice: GameState = { phase: "chooseNumber", openAxis: northSouth, numbersChosen: 0 };
	const afterWord = advanceGame(northSouthChoice, { type: "panelChosen", panelIndex: 1 }, config);
	assert.deepEqual(afterWord, {
		phase: "counting",
		openings: [eastWest, northSouth, eastWest],
		tokens: ["c", "a", "t"],
		numbersChosen: 1,
	});
});

function openingsOf(state: GameState): readonly string[] {
	assert.equal(state.phase, "counting");
	return state.phase === "counting" ? state.openings : [];
}

function numbersFor(state: GameState): readonly number[] {
	assert.equal(state.phase, "chooseNumber");
	return state.phase === "chooseNumber" ? choosablePanelIndexes(state.openAxis).map((index) => index + 1) : [];
}
