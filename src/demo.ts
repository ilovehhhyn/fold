// Starts the demo page: the fortune teller with its special ending and private letter, or one fixed pose for `?pose=tipX,tipZ`.

import "./demo.css";

import { parseFixedPose } from "./fixed-pose";
import { mountFortuneTeller } from "./index";
import type { MountedFortuneTeller, SpecialEnding } from "./index";
import { openLetter, parseLockedLetter } from "./letter-cipher";
import lockedLetterData from "./letter.encrypted.json";
import { showLetterPage } from "./letter-page";

const containerId = "fortune-teller";
// Panel 3 answers the question below. The game offers it at every second number choice.
const specialPanelIndex = 2;
const specialPrompt = "what special day is it? honhonhon";
const reducedMotionQuery = "(prefers-reduced-motion: reduce)";

async function startDemo(): Promise<void> {
	const container = document.getElementById(containerId);
	const main = document.querySelector("main");
	if (container === null || main === null) {
		throw new Error(`the demo page must contain a main element and an element with id ${containerId}`);
	}
	try {
		const fixedPose = parseFixedPose(window.location.search);
		if (fixedPose !== null) {
			mountFortuneTeller(container, { fixedPose });
			return;
		}
	} catch (error: unknown) {
		if (!(error instanceof RangeError)) {
			throw error;
		}
		showProblem(container, "alert", `This page cannot show that pose: ${error.message}`);
		return;
	}
	const letter = await openLetter(window.location.hash, parseLockedLetter(lockedLetterData));
	let mounted: MountedFortuneTeller | undefined;
	// Without the key in the link, panel 3 shows its fortune like every other panel.
	const onChosen =
		letter.status === "opened"
			? letterOpener(letter.text, main, () => {
					mounted?.destroy();
				})
			: undefined;
	const specialEnding: SpecialEnding = {
		panelIndex: specialPanelIndex,
		prompt: specialPrompt,
		...(onChosen === undefined ? {} : { onChosen }),
	};
	mounted = mountFortuneTeller(container, { specialEnding });
	if (letter.status === "invalid") {
		showProblem(container, "status", `This link cannot open its letter: ${letter.reason}. Ask for the link again.`);
	}
}

function letterOpener(text: string, leaving: HTMLElement, onLeft: () => void): () => void {
	return () => {
		showLetterPage({ leaving, onLeft, prefersReducedMotion: window.matchMedia(reducedMotionQuery).matches, text });
	};
}

function showProblem(container: HTMLElement, role: "alert" | "status", message: string): void {
	const problem = document.createElement("p");
	problem.className = "demo__problem";
	problem.setAttribute("role", role);
	problem.textContent = message;
	container.append(problem);
}

startDemo().catch((error: unknown) => {
	const container = document.getElementById(containerId) ?? document.body;
	showProblem(container, "alert", `This page could not start: ${error instanceof Error ? error.message : String(error)}`);
});
