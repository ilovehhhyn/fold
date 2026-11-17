// Plays the game on screen: turns each game state into paper motion, status text and choice buttons.
//
// game.ts decides what is allowed. This file only shows the result and reports back when an
// animation ends. A cancelled animation stops its sequence without reporting.

import type { TweenOutcome } from "./animation";
import type { FortuneTellerConfig } from "./config";
import type { Choice, Controls } from "./controls";
import { advanceGame, choosableTriangleIndexes, initialGameState, standardLayout } from "./game";
import type { GameEvent, GameRules, GameState, OpeningAxis, PanelLayout } from "./game";
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

/** A panel that the second number choice always offers, with the question asked at that choice. */
export type SpecialEnding = Readonly<{
	/** Index of the panel, from 0 to 7. Panel 3 has index 2. */
	panelIndex: number;
	/** The status line at the second number choice. */
	prompt: string;
	/** Called when the player chooses the panel. Without it, the panel shows its fortune like any other. */
	onChosen?: () => void;
}>;

/** Which texts the status line shows. */
export type StatusLine = "full" | "specialPromptOnly";

export type GameFlowOptions = Readonly<{
	view: ToyView;
	controls: Controls;
	config: () => FortuneTellerConfig;
	prefersReducedMotion: () => boolean;
	cancelMotion: () => void;
	special: SpecialEnding | null;
	/** "full" shows every prompt and the count; "specialPromptOnly" shows only the special question and the fortune. */
	statusLine: StatusLine;
	/** Draws the labels and fortunes of a layout on the paper. */
	showLayout: (layout: PanelLayout) => void;
}>;

export type GameFlow = Readonly<{
	state: () => GameState;
	choosePocket: (pocketIndex: number) => void;
	chooseTriangle: (triangleIndex: number) => void;
	/** True if pointing at the target would be accepted now. */
	isChoosable: (target: PickTarget) => boolean;
	/** True while the toy waits for the player, so idle motion is welcome. */
	isWaitingForPlayer: () => boolean;
	/** Stops the game, closes the toy and hands it to the editor; or starts a new game. */
	setPaused: (isPaused: boolean) => void;
	/** Redraws buttons and status after the configuration changed. */
	refresh: () => void;
}>;

type CountingState = Extract<GameState, { phase: "counting" }>;
type ChoiceState = Exclude<GameState, { phase: "counting" | "handedOver" | "revealing" }>;

/** Creates the flow and shows the first phase. */
export function createGameFlow(options: GameFlowOptions): GameFlow {
	const { cancelMotion, config, controls, prefersReducedMotion, showLayout, special, statusLine, view } = options;
	const isQuiet = statusLine === "specialPromptOnly";
	let state: GameState = initialGameState;
	let isPaused = false;
	let isReturning = false;
	// The buttons of the last phase that had choices; they stay on screen, waiting, during an animation.
	let shownChoices: readonly Choice[] = [];

	const duration = (fullMs: number): number => (prefersReducedMotion() ? reducedMotionDurationMs : fullMs);
	const rules = (): GameRules => ({
		config: config(),
		special: special === null ? null : { panelIndex: special.panelIndex, ending: special.onChosen === undefined ? "fortune" : "handOver" },
	});

	const dispatch = (event: GameEvent): void => {
		if (isPaused || isReturning) {
			return;
		}
		const next = advanceGame(state, event, rules());
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
			const outcome = await playReveal(entered.triangleIndex);
			if (outcome === "finished") {
				dispatch({ type: "animationFinished" });
			}
		} else if (entered.phase === "handedOver") {
			special?.onChosen?.();
		} else if (entered.phase === "chooseColour") {
			isReturning = true;
			show();
			const outcome = await playReturn();
			isReturning = false;
			if (outcome === "finished") {
				showLayout(standardLayout);
				show();
			}
		}
	};

	const playCounting = async (counting: CountingState): Promise<TweenOutcome> => {
		const spoken: string[] = [];
		const lastIndex = counting.openings.length - 1;
		let isOpen = counting.numbersChosen === 1;
		for (const [index, axis] of counting.openings.entries()) {
			spoken.push(counting.tokens[index] ?? "");
			controls.setStatus(isQuiet ? "" : spoken.join(" "));
			// With reduced motion the status line carries the count and only the last opening moves.
			if (prefersReducedMotion() && index < lastIndex) {
				continue;
			}
			if (isOpen && (await view.moveTo(closedGoal, duration(closeDurationMs))) === "cancelled") {
				return "cancelled";
			}
			// The paper is closed here, so the player cannot see two panels trade places.
			if (index === lastIndex) {
				showLayout(counting.layout);
			}
			if ((await view.moveTo(openGoal(axis), duration(openDurationMs))) === "cancelled") {
				return "cancelled";
			}
			isOpen = true;
		}
		return "finished";
	};

	const playReveal = async (triangleIndex: number): Promise<TweenOutcome> => {
		if ((await view.moveTo(bowlGoal, duration(flattenDurationMs))) === "cancelled") {
			return "cancelled";
		}
		const fortuneGoal: ViewGoal = {
			offsets: namedPoses.reveal,
			liftedPanelIndex: triangleIndex,
			framing: { kind: "fortune", panelIndex: triangleIndex },
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
		const hasChoices = shown.phase !== "counting" && shown.phase !== "revealing" && shown.phase !== "handedOver";
		if (shown.phase !== "counting" && shown.phase !== "revealing" && shown.phase !== "handedOver") {
			shownChoices = choicesFor(shown);
		}
		controls.setChoices(shownChoices, hasChoices && !isReturning ? "enabled" : "waiting");
		const status = statusFor(shown);
		if (status !== undefined) {
			controls.setStatus(status);
		}
	};

	const choicesFor = (shown: ChoiceState): readonly Choice[] => {
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
				return choosableTriangleIndexes(shown.openAxis).map((triangleIndex) => ({
					label: panels[shown.layout[triangleIndex] ?? -1]?.label ?? "",
					choose: () => {
						dispatch({ type: "panelChosen", triangleIndex });
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

	// Returns undefined for a phase that keeps the status line of the phase before it.
	const statusFor = (shown: GameState): string | undefined => {
		switch (shown.phase) {
			case "chooseColour":
				return isQuiet ? "" : "Choose a colour.";
			case "chooseNumber":
				if (shown.numbersChosen === 0) {
					return isQuiet ? "" : "Choose a number.";
				}
				return special === null ? "Choose one more number to see your fortune." : special.prompt;
			case "counting":
			case "handedOver":
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
		chooseTriangle: (triangleIndex) => {
			dispatch({ type: "panelChosen", triangleIndex });
		},
		isChoosable: (target) => {
			if (isPaused || isReturning) {
				return false;
			}
			if (target.kind === "pocket") {
				return state.phase === "chooseColour";
			}
			return state.phase === "chooseNumber" && choosableTriangleIndexes(state.openAxis).includes(target.index);
		},
		isWaitingForPlayer: () => !isPaused && !isReturning && (state.phase === "chooseColour" || state.phase === "chooseNumber"),
		setPaused: (shouldPause) => {
			cancelMotion();
			isPaused = shouldPause;
			isReturning = false;
			state = initialGameState;
			showLayout(standardLayout);
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
