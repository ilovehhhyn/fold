// The rules of the fortune teller game as a pure state machine: a state and an event give the next state.
//
// Order of phases: chooseColour, counting, chooseNumber, counting, chooseNumber, revealing,
// revealed, then chooseColour again. An event that is not valid in the current phase leaves
// the state unchanged, so input during an animation is ignored and never queued.
//
// Special panel. A game can name one panel that is always offered at the second number choice.
// If the last opening does not show that panel, it trades places with the panel across the
// diagonal fold from it (panel index XOR 1), which that opening does show. The trade lasts
// until the game ends. Choosing the special panel either reveals its fortune like any other
// panel, or hands the game over to the page.

import { countFor, countTokens, panelCount, pocketCount } from "./config";
import type { FortuneTellerConfig } from "./config";

/** The direction in which the tips move apart when the toy opens. */
export type OpeningAxis = "eastWest" | "northSouth";

/** Which panel each number triangle shows: entry `triangleIndex` is a panel index. */
export type PanelLayout = readonly number[];

/** One panel that is always offered at the second number choice, and what choosing it does. */
export type SpecialPanel = Readonly<{ panelIndex: number; ending: "fortune" | "handOver" }>;

/** What the game is played with: the text on the paper and the optional special panel. */
export type GameRules = Readonly<{ config: FortuneTellerConfig; special: SpecialPanel | null }>;

export type GameState = Readonly<
	| { phase: "chooseColour" }
	| { phase: "chooseNumber"; openAxis: OpeningAxis; numbersChosen: 0 | 1; layout: PanelLayout }
	| {
			phase: "counting";
			/** One opening per count, in order. */
			openings: readonly OpeningAxis[];
			/** What the status line shows for each opening. */
			tokens: readonly string[];
			numbersChosen: 0 | 1;
			/** The layout the paper must have when it opens for the last time in this count. */
			layout: PanelLayout;
	  }
	| { phase: "handedOver" }
	| { phase: "revealed"; triangleIndex: number; panelIndex: number }
	| { phase: "revealing"; triangleIndex: number; panelIndex: number }
>;

export type GameEvent = Readonly<
	| { type: "animationFinished" }
	| { type: "panelChosen"; triangleIndex: number }
	| { type: "playAgainChosen" }
	| { type: "pocketChosen"; pocketIndex: number }
>;

export const initialGameState: GameState = { phase: "chooseColour" };

/** Every number triangle shows its own panel. */
export const standardLayout: PanelLayout = [0, 1, 2, 3, 4, 5, 6, 7];

// Number triangles are indexed 0 to 7 for the numbers 1 to 8, clockwise from north.
const choosableAfterNorthSouth: readonly number[] = [1, 2, 5, 6];
const choosableAfterEastWest: readonly number[] = [0, 3, 4, 7];

/** Returns the state after one event; an event that the phase does not accept returns the same state. */
export function advanceGame(state: GameState, event: GameEvent, rules: GameRules): GameState {
	switch (state.phase) {
		case "chooseColour": {
			if (event.type !== "pocketChosen") {
				return state;
			}
			const pocket = rules.config.pockets[requireIndex("pocketIndex", event.pocketIndex, pocketCount)];
			return pocket === undefined ? state : startCounting(pocket.label, "none", 0, null);
		}
		case "counting": {
			const lastOpening = state.openings.at(-1);
			if (event.type !== "animationFinished" || lastOpening === undefined) {
				return state;
			}
			return { phase: "chooseNumber", openAxis: lastOpening, numbersChosen: state.numbersChosen, layout: state.layout };
		}
		case "chooseNumber": {
			if (event.type !== "panelChosen") {
				return state;
			}
			const triangleIndex = requireIndex("triangleIndex", event.triangleIndex, panelCount);
			const panelIndex = state.layout[triangleIndex];
			const panel = panelIndex === undefined ? undefined : rules.config.panels[panelIndex];
			const isChoosable = choosableTriangleIndexes(state.openAxis).includes(triangleIndex);
			if (panelIndex === undefined || panel === undefined || !isChoosable) {
				return state;
			}
			if (state.numbersChosen === 0) {
				return startCounting(panel.label, state.openAxis, 1, rules.special);
			}
			const handsOver = rules.special !== null && rules.special.ending === "handOver" && rules.special.panelIndex === panelIndex;
			return handsOver ? { phase: "handedOver" } : { phase: "revealing", triangleIndex, panelIndex };
		}
		case "revealing": {
			return event.type === "animationFinished"
				? { phase: "revealed", triangleIndex: state.triangleIndex, panelIndex: state.panelIndex }
				: state;
		}
		case "revealed": {
			return event.type === "playAgainChosen" ? initialGameState : state;
		}
		case "handedOver": {
			return state;
		}
		default: {
			const unhandled: never = state;
			throw new Error(`unhandled game phase ${JSON.stringify(unhandled)}`);
		}
	}
}

/** Returns the number triangles that face the camera, and so can be chosen, after an opening. */
export function choosableTriangleIndexes(openAxis: OpeningAxis): readonly number[] {
	return openAxis === "northSouth" ? choosableAfterNorthSouth : choosableAfterEastWest;
}

/**
 * Returns the directions of `count` openings that alternate, starting after `previousAxis`.
 *
 * The first opening of a game is north-south. The alternation never restarts within a game.
 */
export function openingsFor(count: number, previousAxis: OpeningAxis | "none"): readonly OpeningAxis[] {
	if (!Number.isInteger(count) || count < 1) {
		throw new RangeError(`count must be a whole number of at least 1, got ${count}`);
	}
	const openings: OpeningAxis[] = [];
	let axis: OpeningAxis = previousAxis === "northSouth" ? "eastWest" : "northSouth";
	for (let index = 0; index < count; index += 1) {
		openings.push(axis);
		axis = axis === "northSouth" ? "eastWest" : "northSouth";
	}
	return openings;
}

/**
 * Returns the layout for a number choice after an opening along `openAxis`.
 *
 * The layout is the standard one unless the special panel would be hidden. Then the special
 * panel and its neighbour across the diagonal fold, panel index XOR 1, trade places.
 */
export function layoutShowingSpecial(openAxis: OpeningAxis, special: SpecialPanel | null): PanelLayout {
	if (special === null) {
		return standardLayout;
	}
	const specialIndex = requireIndex("special.panelIndex", special.panelIndex, panelCount);
	if (choosableTriangleIndexes(openAxis).includes(specialIndex)) {
		return standardLayout;
	}
	const neighbourIndex = specialIndex ^ 1;
	return standardLayout.map((panelIndex) => {
		if (panelIndex === specialIndex) {
			return neighbourIndex;
		}
		return panelIndex === neighbourIndex ? specialIndex : panelIndex;
	});
}

// The special panel matters only for the count that leads to the second number choice.
function startCounting(
	label: string,
	previousAxis: OpeningAxis | "none",
	numbersChosen: 0 | 1,
	special: SpecialPanel | null,
): GameState {
	const openings = openingsFor(countFor(label), previousAxis);
	const lastOpening = openings.at(-1);
	if (lastOpening === undefined) {
		throw new Error("a count has at least one opening");
	}
	return {
		phase: "counting",
		openings,
		tokens: countTokens(label),
		numbersChosen,
		layout: numbersChosen === 1 ? layoutShowingSpecial(lastOpening, special) : standardLayout,
	};
}

function requireIndex(name: string, value: number, count: number): number {
	if (!Number.isInteger(value) || value < 0 || value >= count) {
		throw new RangeError(`${name} must be a whole number from 0 to ${count - 1}, got ${value}`);
	}
	return value;
}
