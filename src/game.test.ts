// Invariant under test: the game follows the count, opening and choice rules, ignores input that a phase does not accept, and always offers the special panel at the second number choice.

import assert from "node:assert/strict";

import { test } from "vitest";

import { countFor, defaultConfig, parseConfig } from "./config";
import { advanceGame, choosableTriangleIndexes, initialGameState, layoutShowingSpecial, openingsFor, standardLayout } from "./game";
import type { GameEvent, GameRules, GameState, SpecialPanel } from "./game";

const northSouth = "northSouth";
const eastWest = "eastWest";
// The pocket words of the worked examples in docs/agent-prompt.md.
const classicConfig = parseConfig({
	...defaultConfig,
	pockets: ["red", "blue", "green", "yellow"].map((label, index) => ({ label, colour: defaultConfig.pockets[index]?.colour })),
});
const plainRules: GameRules = { config: classicConfig, special: null };
// Panel 3 has index 2. Its neighbour across the diagonal fold is panel 4, index 3.
const panelThree: SpecialPanel = { panelIndex: 2, ending: "handOver" };
const handOverRules: GameRules = { config: classicConfig, special: panelThree };
const fortuneRules: GameRules = { config: classicConfig, special: { panelIndex: 2, ending: "fortune" } };
const tradedLayout = [0, 1, 3, 2, 4, 5, 6, 7];

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
	const afterColour = advanceGame(initialGameState, { type: "pocketChosen", pocketIndex: 0 }, plainRules);
	assert.deepEqual(afterColour, {
		phase: "counting",
		openings: [northSouth, eastWest, northSouth],
		tokens: ["r", "e", "d"],
		numbersChosen: 0,
		layout: standardLayout,
	});

	const firstChoice = advanceGame(afterColour, { type: "animationFinished" }, plainRules);
	assert.deepEqual(firstChoice, { phase: "chooseNumber", openAxis: northSouth, numbersChosen: 0, layout: standardLayout });
	assert.deepEqual(offeredNumbers(firstChoice), [2, 3, 6, 7]);

	const afterThree = advanceGame(firstChoice, { type: "panelChosen", triangleIndex: 2 }, plainRules);
	assert.deepEqual(afterThree, {
		phase: "counting",
		openings: [eastWest, northSouth, eastWest],
		tokens: ["1", "2", "3"],
		numbersChosen: 1,
		layout: standardLayout,
	});

	const secondChoice = advanceGame(afterThree, { type: "animationFinished" }, plainRules);
	assert.deepEqual(offeredNumbers(secondChoice), [1, 4, 5, 8]);

	const revealing = advanceGame(secondChoice, { type: "panelChosen", triangleIndex: 4 }, plainRules);
	assert.deepEqual(revealing, { phase: "revealing", triangleIndex: 4, panelIndex: 4 });
	const revealed = advanceGame(revealing, { type: "animationFinished" }, plainRules);
	assert.deepEqual(revealed, { phase: "revealed", triangleIndex: 4, panelIndex: 4 });
	assert.deepEqual(advanceGame(revealed, { type: "playAgainChosen" }, plainRules), initialGameState);
});

test("choosing blue then 8 plays the second worked example", () => {
	const afterColour = advanceGame(initialGameState, { type: "pocketChosen", pocketIndex: 1 }, plainRules);
	assert.deepEqual(openingsOf(afterColour), [northSouth, eastWest, northSouth, eastWest]);

	const firstChoice = advanceGame(afterColour, { type: "animationFinished" }, plainRules);
	assert.deepEqual(offeredNumbers(firstChoice), [1, 4, 5, 8]);

	const openings = openingsOf(advanceGame(firstChoice, { type: "panelChosen", triangleIndex: 7 }, plainRules));
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

test("input during counting, during revealing and after a hand-over changes nothing", () => {
	const counting = advanceGame(initialGameState, { type: "pocketChosen", pocketIndex: 0 }, plainRules);
	const revealing: GameState = { phase: "revealing", triangleIndex: 4, panelIndex: 4 };
	const handedOver: GameState = { phase: "handedOver" };
	const playerInputs: readonly GameEvent[] = [
		{ type: "pocketChosen", pocketIndex: 1 },
		{ type: "panelChosen", triangleIndex: 2 },
		{ type: "playAgainChosen" },
	];

	for (const event of playerInputs) {
		assert.equal(advanceGame(counting, event, plainRules), counting, `counting must ignore ${event.type}`);
		assert.equal(advanceGame(revealing, event, plainRules), revealing, `revealing must ignore ${event.type}`);
		assert.equal(advanceGame(handedOver, event, handOverRules), handedOver, `a handed-over game must ignore ${event.type}`);
	}
	assert.equal(advanceGame(handedOver, { type: "animationFinished" }, handOverRules), handedOver);
});

test("a number triangle that faces away from the camera cannot be chosen", () => {
	const openNorthSouth: GameState = { phase: "chooseNumber", openAxis: northSouth, numbersChosen: 0, layout: standardLayout };

	for (const hiddenTriangleIndex of [0, 3, 4, 7]) {
		const next = advanceGame(openNorthSouth, { type: "panelChosen", triangleIndex: hiddenTriangleIndex }, plainRules);
		assert.equal(next, openNorthSouth, `triangle ${hiddenTriangleIndex} must stay unchoosable`);
	}
});

test("events of the wrong phase change nothing", () => {
	const cases: readonly (readonly [GameState, GameEvent])[] = [
		[initialGameState, { type: "panelChosen", triangleIndex: 1 }],
		[initialGameState, { type: "animationFinished" }],
		[initialGameState, { type: "playAgainChosen" }],
		[{ phase: "chooseNumber", openAxis: eastWest, numbersChosen: 1, layout: standardLayout }, { type: "pocketChosen", pocketIndex: 0 }],
		[{ phase: "revealed", triangleIndex: 0, panelIndex: 0 }, { type: "panelChosen", triangleIndex: 0 }],
	];

	for (const [state, event] of cases) {
		assert.equal(advanceGame(state, event, plainRules), state, `${state.phase} must ignore ${event.type}`);
	}
});

test("an index outside the paper is a programming error, not an ignored input", () => {
	const open: GameState = { phase: "chooseNumber", openAxis: eastWest, numbersChosen: 0, layout: standardLayout };

	assert.throws(() => advanceGame(initialGameState, { type: "pocketChosen", pocketIndex: 4 }, plainRules), {
		name: "RangeError",
		message: "pocketIndex must be a whole number from 0 to 3, got 4",
	});
	assert.throws(() => advanceGame(open, { type: "panelChosen", triangleIndex: -1 }, plainRules), {
		name: "RangeError",
		message: "triangleIndex must be a whole number from 0 to 7, got -1",
	});
	assert.throws(() => layoutShowingSpecial(eastWest, { panelIndex: 8, ending: "fortune" }), {
		name: "RangeError",
		message: "special.panelIndex must be a whole number from 0 to 7, got 8",
	});
});

test("a word label on a pocket and on a panel sets both counts", () => {
	const config = parseConfig({
		...classicConfig,
		pockets: classicConfig.pockets.map((pocket, index) => (index === 2 ? { ...pocket, label: "ice cream" } : pocket)),
		panels: classicConfig.panels.map((panel, index) => (index === 1 ? { ...panel, label: "cat" } : panel)),
	});
	const rules: GameRules = { config, special: null };

	const afterColour = advanceGame(initialGameState, { type: "pocketChosen", pocketIndex: 2 }, rules);
	assert.equal(openingsOf(afterColour).length, 8);
	const northSouthChoice: GameState = { phase: "chooseNumber", openAxis: northSouth, numbersChosen: 0, layout: standardLayout };
	const afterWord = advanceGame(northSouthChoice, { type: "panelChosen", triangleIndex: 1 }, rules);
	assert.deepEqual(afterWord, {
		phase: "counting",
		openings: [eastWest, northSouth, eastWest],
		tokens: ["c", "a", "t"],
		numbersChosen: 1,
		layout: standardLayout,
	});
});

test("with panel 3 as the special panel, every colour and first number lead to a second choice that offers 3", () => {
	let gamesPlayed = 0;
	const secondAxes = new Set<string>();

	for (let pocketIndex = 0; pocketIndex < 4; pocketIndex += 1) {
		const firstChoice = playToFirstChoice(pocketIndex, handOverRules);
		for (const firstTriangleIndex of choosableOf(firstChoice)) {
			const counting = advanceGame(firstChoice, { type: "panelChosen", triangleIndex: firstTriangleIndex }, handOverRules);
			const secondChoice = advanceGame(counting, { type: "animationFinished" }, handOverRules);
			assert.equal(secondChoice.phase, "chooseNumber");
			const axis = secondChoice.phase === "chooseNumber" ? secondChoice.openAxis : "";
			const expected = axis === eastWest ? [1, 3, 5, 8] : [2, 3, 6, 7];
			assert.deepEqual(offeredNumbers(secondChoice), expected, `pocket ${pocketIndex}, first triangle ${firstTriangleIndex}`);
			secondAxes.add(axis);
			gamesPlayed += 1;
		}
	}

	assert.equal(gamesPlayed, 16);
	assert.deepEqual([...secondAxes].sort(), [eastWest, northSouth], "the games must reach both kinds of opening");
});

test("the special panel trades places with panel 4 only when the last opening hides it", () => {
	assert.deepEqual(layoutShowingSpecial(eastWest, panelThree), tradedLayout);
	assert.equal(layoutShowingSpecial(northSouth, panelThree), standardLayout);
	assert.equal(layoutShowingSpecial(eastWest, null), standardLayout);
	assert.equal(layoutShowingSpecial(northSouth, null), standardLayout);
});

test("for every possible special panel the layout is a rearrangement that puts it in view", () => {
	for (let panelIndex = 0; panelIndex < 8; panelIndex += 1) {
		for (const axis of [northSouth, eastWest] as const) {
			const layout = layoutShowingSpecial(axis, { panelIndex, ending: "fortune" });
			assert.deepEqual([...layout].sort(), standardLayout, `panel ${panelIndex}, ${axis}: every panel must appear once`);
			const shown = choosableTriangleIndexes(axis).map((triangleIndex) => layout[triangleIndex]);
			assert.ok(shown.includes(panelIndex), `panel ${panelIndex} must face the camera after a ${axis} opening`);
			const moved = layout.filter((shownPanel, triangleIndex) => shownPanel !== triangleIndex).length;
			assert.ok(moved === 0 || moved === 2, `panel ${panelIndex}, ${axis}: ${moved} panels moved`);
		}
	}
});

test("the first number choice never trades panels, even with a special panel", () => {
	for (let pocketIndex = 0; pocketIndex < 4; pocketIndex += 1) {
		const firstChoice = playToFirstChoice(pocketIndex, handOverRules);
		assert.equal(firstChoice.phase === "chooseNumber" ? firstChoice.layout : undefined, standardLayout);
	}
});

test("choosing the special panel hands the game over, from its own triangle and from the traded one", () => {
	const inView: GameState = { phase: "chooseNumber", openAxis: northSouth, numbersChosen: 1, layout: standardLayout };
	const traded: GameState = { phase: "chooseNumber", openAxis: eastWest, numbersChosen: 1, layout: tradedLayout };

	assert.deepEqual(advanceGame(inView, { type: "panelChosen", triangleIndex: 2 }, handOverRules), { phase: "handedOver" });
	assert.deepEqual(advanceGame(traded, { type: "panelChosen", triangleIndex: 3 }, handOverRules), { phase: "handedOver" });
});

test("every other panel of the second choice shows its normal fortune", () => {
	const inView: GameState = { phase: "chooseNumber", openAxis: northSouth, numbersChosen: 1, layout: standardLayout };
	const traded: GameState = { phase: "chooseNumber", openAxis: eastWest, numbersChosen: 1, layout: tradedLayout };

	for (const triangleIndex of [1, 5, 6]) {
		const next = advanceGame(inView, { type: "panelChosen", triangleIndex }, handOverRules);
		assert.deepEqual(next, { phase: "revealing", triangleIndex, panelIndex: triangleIndex });
	}
	for (const triangleIndex of [0, 4, 7]) {
		const next = advanceGame(traded, { type: "panelChosen", triangleIndex }, handOverRules);
		assert.deepEqual(next, { phase: "revealing", triangleIndex, panelIndex: triangleIndex });
	}
});

test("with the fortune ending, the special panel reveals its own fortune under the triangle that shows it", () => {
	const traded: GameState = { phase: "chooseNumber", openAxis: eastWest, numbersChosen: 1, layout: tradedLayout };

	const next = advanceGame(traded, { type: "panelChosen", triangleIndex: 3 }, fortuneRules);

	assert.deepEqual(next, { phase: "revealing", triangleIndex: 3, panelIndex: 2 });
});

test("the special panel does not hand over at the first number choice", () => {
	const firstChoice: GameState = { phase: "chooseNumber", openAxis: northSouth, numbersChosen: 0, layout: standardLayout };

	const next = advanceGame(firstChoice, { type: "panelChosen", triangleIndex: 2 }, handOverRules);

	assert.equal(next.phase, "counting");
});

function playToFirstChoice(pocketIndex: number, rules: GameRules): GameState {
	const counting = advanceGame(initialGameState, { type: "pocketChosen", pocketIndex }, rules);
	return advanceGame(counting, { type: "animationFinished" }, rules);
}

function openingsOf(state: GameState): readonly string[] {
	assert.equal(state.phase, "counting");
	return state.phase === "counting" ? state.openings : [];
}

function choosableOf(state: GameState): readonly number[] {
	assert.equal(state.phase, "chooseNumber");
	return state.phase === "chooseNumber" ? choosableTriangleIndexes(state.openAxis) : [];
}

// Returns the numbers 1 to 8 of the panels that the state offers, in triangle order.
function offeredNumbers(state: GameState): readonly number[] {
	assert.equal(state.phase, "chooseNumber");
	if (state.phase !== "chooseNumber") {
		return [];
	}
	return choosableTriangleIndexes(state.openAxis).map((triangleIndex) => (state.layout[triangleIndex] ?? Number.NaN) + 1);
}
