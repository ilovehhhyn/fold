// Plays the game on screen: turns each game state into paper motion, status text and choice buttons.
//
// game.ts decides what is allowed. This file only shows the result and reports back when an
// animation ends. A cancelled animation stops its sequence without reporting.

import type { TweenOutcome } from "./animation";
import type { FortuneTellerConfig } from "./config";
import type { Choice, Controls } from "./controls";
import { advanceGame, choosablePanelIndexes, initialGameState } from "./game";
import type { GameEvent, GameState, OpeningAxis } from "./game";
import type { PickTarget } from "./paper-meshes";
import { namedPoses } from "./rig";
import type { ToyView, ViewGoal } from "./toy-view";

// One count is one close and one open, about 400 ms together.
const closeDurationMs = 150;
const openDurationMs = 250;
const flattenDurationMs = 600;
const liftDurationMs = 700;
const returnDurationMs = 450;
// With reduced motion every move is one short step.
const reducedMotionDurationMs = 150;

const closedGoal: ViewGoal = { offsets: namedPoses.closed, liftedPanelIndex: null, framing: { kind: "play" } };
const bowlGoal: ViewGoal = { offsets: namedPoses.reveal, liftedPanelIndex: null, framing: { kind: "play" } };

export type GameFlowOptions = Readonly<{
	view: ToyView;
	controls: Controls;
	config: () => FortuneTellerConfig;
	prefersReducedMotion: () => boolean;
	cancelMotion: () => void;
}>;

export type GameFlow = Readonly<{
	state: () => GameState;
	choosePocket: (pocketIndex: number) => void;
	choosePanel: (panelIndex: number) => void;
	/** True if pointing at the target would be accepted now. */
	isChoosable: (target: PickTarget) => boolean;
	/** True while the toy waits for the player, so idle motion is welcome. */
	isWaitingForPlayer: () => boolean;
	/** Stops the game, closes the toy and hands it to the editor; or starts a new game. */
	setPaused: (isPaused: boolean) => void;
	/** Redraws buttons and status after the configuration changed. */
	refresh: () => void;
}>;

/** Creates the flow and shows the first phase. */
export function createGameFlow(options: GameFlowOptions): GameFlow {
	const { cancelMotion, config, controls, prefersReducedMotion, view } = options;
	let state: GameState = initialGameState;
	let isPaused = false;
	let isReturning = false;
	// The buttons of the last phase that had choices; they stay on screen, waiting, during an animation.
	let shownChoices: readonly Choice[] = [];

	const duration = (fullMs: number): number => (prefersReducedMotion() ? reducedMotionDurationMs : fullMs);

	const dispatch = (event: GameEvent): void => {
		if (isPaused || isReturning) {
			return;
		}
		const next = advanceGame(state, event, config());
		if (next === state) {
			return;
		}
		state = next;
		show();
		void runPhase(next);
	};

	const runPhase = async (entered: GameState): Promise<void> => {
		if (entered.phase === "counting") {
			const outcome = await playCounting(entered);
			if (outcome === "finished") {
				dispatch({ type: "animationFinished" });
			}
		} else if (entered.phase === "revealing") {
			const outcome = await playReveal(entered.panelIndex);
			if (outcome === "finished") {
				dispatch({ type: "animationFinished" });
			}
		} else if (entered.phase === "chooseColour") {
			isReturning = true;
			show();
			const outcome = await playReturn();
			isReturning = false;
			if (outcome === "finished") {
				show();
			}
		}
	};

	const playCounting = async (counting: Extract<GameState, { phase: "counting" }>): Promise<TweenOutcome> => {
		const spoken: string[] = [];
		let isOpen = counting.numbersChosen === 1;
		for (const [index, axis] of counting.openings.entries()) {
			spoken.push(counting.tokens[index] ?? "");
			controls.setStatus(spoken.join(" "));
			if (prefersReducedMotion()) {
				continue;
			}
			if (isOpen && (await view.moveTo(closedGoal, closeDurationMs)) === "cancelled") {
				return "cancelled";
			}
			if ((await view.moveTo(openGoal(axis), openDurationMs)) === "cancelled") {
				return "cancelled";
			}
			isOpen = true;
		}
		const lastAxis = counting.openings.at(-1);
		if (prefersReducedMotion() && lastAxis !== undefined) {
			return view.moveTo(openGoal(lastAxis), reducedMotionDurationMs);
		}
		return "finished";
	};

	const playReveal = async (panelIndex: number): Promise<TweenOutcome> => {
		if ((await view.moveTo(bowlGoal, duration(flattenDurationMs))) === "cancelled") {
			return "cancelled";
		}
		const fortuneGoal: ViewGoal = {
			offsets: namedPoses.reveal,
			liftedPanelIndex: panelIndex,
			framing: { kind: "fortune", panelIndex },
		};
		return view.moveTo(fortuneGoal, duration(liftDurationMs));
	};

	const playReturn = async (): Promise<TweenOutcome> => {
		if ((await view.moveTo(bowlGoal, duration(returnDurationMs))) === "cancelled") {
			return "cancelled";
		}
		return view.moveTo(closedGoal, duration(returnDurationMs));
	};

	const show = (): void => {
		controls.setPhase(isPaused ? "editing" : isReturning ? "returning" : state.phase);
		if (isPaused) {
			controls.setStatus("Close the editor to play.");
			controls.setChoices([], "waiting");
			return;
		}
		const shown = state;
		const isAnimating = shown.phase === "counting" || shown.phase === "revealing";
		if (shown.phase !== "counting" && shown.phase !== "revealing") {
			shownChoices = choicesFor(shown);
		}
		controls.setChoices(shownChoices, isAnimating || isReturning ? "waiting" : "enabled");
		const status = statusFor(state);
		if (status !== undefined) {
			controls.setStatus(status);
		}
	};

	const choicesFor = (shown: Exclude<GameState, { phase: "counting" | "revealing" }>): readonly Choice[] => {
		const { panels, pockets } = config();
		switch (shown.phase) {
			case "chooseColour":
				return pockets.map((pocket, pocketIndex) => ({
					label: pocket.label,
					swatchColour: pocket.colour,
					choose: () => {
						dispatch({ type: "pocketChosen", pocketIndex });
					},
				}));
			case "chooseNumber":
				return choosablePanelIndexes(shown.openAxis).map((panelIndex) => ({
					label: panels[panelIndex]?.label ?? "",
					choose: () => {
						dispatch({ type: "panelChosen", panelIndex });
					},
				}));
			case "revealed":
				return [
					{
						label: "Play again",
						choose: () => {
							dispatch({ type: "playAgainChosen" });
						},
					},
				];
			default: {
				const unhandled: never = shown;
				throw new Error(`unhandled game phase ${JSON.stringify(unhandled)}`);
			}
		}
	};

	const statusFor = (shown: GameState): string | undefined => {
		switch (shown.phase) {
			case "chooseColour":
				return "Choose a colour.";
			case "chooseNumber":
				return shown.numbersChosen === 0 ? "Choose a number." : "Choose one more number to see your fortune.";
			case "counting":
				return undefined;
			case "revealed":
			case "revealing":
				return `Your fortune: ${config().panels[shown.panelIndex]?.fortune ?? ""}`;
			default: {
				const unhandled: never = shown;
				throw new Error(`unhandled game phase ${JSON.stringify(unhandled)}`);
			}
		}
	};

	show();
	return {
		state: () => state,
		choosePocket: (pocketIndex) => {
			dispatch({ type: "pocketChosen", pocketIndex });
		},
		choosePanel: (panelIndex) => {
			dispatch({ type: "panelChosen", panelIndex });
		},
		isChoosable: (target) => {
			if (isPaused || isReturning) {
				return false;
			}
			if (target.kind === "pocket") {
				return state.phase === "chooseColour";
			}
			return state.phase === "chooseNumber" && choosablePanelIndexes(state.openAxis).includes(target.index);
		},
		isWaitingForPlayer: () => !isPaused && !isReturning && (state.phase === "chooseColour" || state.phase === "chooseNumber"),
		setPaused: (shouldPause) => {
			cancelMotion();
			isPaused = shouldPause;
			isReturning = false;
			state = initialGameState;
			show();
			void view.moveTo(closedGoal, duration(returnDurationMs));
		},
		refresh: show,
	};
}

function openGoal(axis: OpeningAxis): ViewGoal {
	const offsets = axis === "northSouth" ? namedPoses.openNorthSouth : namedPoses.openEastWest;
	return { offsets, liftedPanelIndex: null, framing: { kind: "play" } };
}
