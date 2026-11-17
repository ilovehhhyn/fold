// The rules of the fortune teller game as a pure state machine: a state and an event give the next state.
//
// Order of phases: chooseColour, counting, chooseNumber, counting, chooseNumber, revealing,
// revealed, then chooseColour again. An event that is not valid in the current phase leaves
// the state unchanged, so input during an animation is ignored and never queued.

import { countFor, countTokens, panelCount, pocketCount } from "./config";
import type { FortuneTellerConfig } from "./config";

/** The direction in which the tips move apart when the toy opens. */
export type OpeningAxis = "eastWest" | "northSouth";

export type GameState = Readonly<
	| { phase: "chooseColour" }
	| { phase: "chooseNumber"; openAxis: OpeningAxis; numbersChosen: 0 | 1 }
	| {
			phase: "counting";
			/** One opening per count, in order. */
			openings: readonly OpeningAxis[];
			/** What the status line shows for each opening. */
			tokens: readonly string[];
			numbersChosen: 0 | 1;
	  }
	| { phase: "revealed"; panelIndex: number }
	| { phase: "revealing"; panelIndex: number }
>;

export type GameEvent = Readonly<
	| { type: "animationFinished" }
	| { type: "panelChosen"; panelIndex: number }
	| { type: "playAgainChosen" }
	| { type: "pocketChosen"; pocketIndex: number }
>;

export const initialGameState: GameState = { phase: "chooseColour" };

// Number triangles are indexed 0 to 7 for the numbers 1 to 8, clockwise from north.
const choosableAfterNorthSouth: readonly number[] = [1, 2, 5, 6];
const choosableAfterEastWest: readonly number[] = [0, 3, 4, 7];

/** Returns the state after one event; an event that the phase does not accept returns the same state. */
export function advanceGame(state: GameState, event: GameEvent, config: FortuneTellerConfig): GameState {
	switch (state.phase) {
		case "chooseColour": {
			if (event.type !== "pocketChosen") {
				return state;
			}
			const pocket = config.pockets[requireIndex("pocketIndex", event.pocketIndex, pocketCount)];
			return pocket === undefined ? state : startCounting(pocket.label, "none", 0);
		}
		case "counting": {
			const lastOpening = state.openings.at(-1);
			if (event.type !== "animationFinished" || lastOpening === undefined) {
				return state;
			}
			return { phase: "chooseNumber", openAxis: lastOpening, numbersChosen: state.numbersChosen };
		}
		case "chooseNumber": {
			if (event.type !== "panelChosen") {
				return state;
			}
			const panelIndex = requireIndex("panelIndex", event.panelIndex, panelCount);
			const panel = config.panels[panelIndex];
			if (panel === undefined || !choosablePanelIndexes(state.openAxis).includes(panelIndex)) {
				return state;
			}
			return state.numbersChosen === 0
				? startCounting(panel.label, state.openAxis, 1)
				: { phase: "revealing", panelIndex };
		}
		case "revealing": {
			return event.type === "animationFinished" ? { phase: "revealed", panelIndex: state.panelIndex } : state;
		}
		case "revealed": {
			return event.type === "playAgainChosen" ? initialGameState : state;
		}
		default: {
			const unhandled: never = state;
			throw new Error(`unhandled game phase ${JSON.stringify(unhandled)}`);
		}
	}
}

/** Returns the number triangles that face the camera, and so can be chosen, after an opening. */
export function choosablePanelIndexes(openAxis: OpeningAxis): readonly number[] {
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

function startCounting(label: string, previousAxis: OpeningAxis | "none", numbersChosen: 0 | 1): GameState {
	return {
		phase: "counting",
		openings: openingsFor(countFor(label), previousAxis),
		tokens: countTokens(label),
		numbersChosen,
	};
}

function requireIndex(name: string, value: number, count: number): number {
	if (!Number.isInteger(value) || value < 0 || value >= count) {
		throw new RangeError(`${name} must be a whole number from 0 to ${count - 1}, got ${value}`);
	}
	return value;
}
