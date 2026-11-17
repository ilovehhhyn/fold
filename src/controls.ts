// Builds the page elements around the canvas: the stage, the status line, the choice buttons and the notice.

/**
 * One button under the canvas. A choice with a `swatchColour` shows only that colour; its
 * label is then the name that a screen reader speaks, and no word is drawn.
 */
export type Choice = Readonly<{ label: string; swatchColour?: string; choose: () => void }>;

/** Whether the choice buttons accept input, or wait for an animation to end. */
export type ChoiceAvailability = "enabled" | "waiting";

export type Controls = Readonly<{
	root: HTMLElement;
	stage: HTMLElement;
	editButton: HTMLButtonElement;
	editorHost: HTMLElement;
	/** Publishes the game phase as `data-phase`, for styles and for browser tests. */
	setPhase: (phase: string) => void;
	setStatus: (text: string) => void;
	/** Replaces the buttons; keyboard focus stays on the button at the same place, or moves to the first. */
	setChoices: (choices: readonly Choice[], availability: ChoiceAvailability) => void;
	setNotice: (text: string | null) => void;
	remove: () => void;
}>;

/** Creates the elements inside the container and returns handles to the parts that change. */
export function createControls(container: HTMLElement): Controls {
	const root = element("div", "fortune-teller");
	const stage = element("div", "fortune-teller__stage");
	const status = element("p", "fortune-teller__status");
	status.setAttribute("role", "status");
	const choices = element("div", "fortune-teller__choices");
	choices.setAttribute("role", "group");
	choices.setAttribute("aria-label", "Choices");
	const toolbar = element("div", "fortune-teller__toolbar");
	const editButton = document.createElement("button");
	editButton.type = "button";
	editButton.className = "fortune-teller__button";
	editButton.textContent = "Edit";
	editButton.setAttribute("aria-expanded", "false");
	toolbar.append(editButton);
	const notice = element("p", "fortune-teller__notice");
	notice.hidden = true;
	notice.setAttribute("role", "status");
	const editorHost = element("div", "fortune-teller__editor-host");
	root.append(stage, status, choices, toolbar, notice, editorHost);
	container.append(root);

	const setChoices = (items: readonly Choice[], availability: ChoiceAvailability): void => {
		const focusedIndex = [...choices.children].findIndex((child) => child === document.activeElement);
		const buttons = items.map((item) => createChoiceButton(item, availability));
		choices.replaceChildren(...buttons);
		if (focusedIndex >= 0) {
			(buttons[focusedIndex] ?? buttons[0])?.focus();
		}
	};

	return {
		root,
		stage,
		editButton,
		editorHost,
		setPhase: (phase) => {
			root.dataset["phase"] = phase;
		},
		setStatus: (text) => {
			status.textContent = text;
		},
		setChoices,
		setNotice: (text) => {
			notice.hidden = text === null;
			notice.textContent = text ?? "";
		},
		remove: () => {
			root.remove();
		},
	};
}

// A waiting button keeps keyboard focus, which a disabled button would lose.
function createChoiceButton(choice: Choice, availability: ChoiceAvailability): HTMLButtonElement {
	const button = document.createElement("button");
	button.type = "button";
	button.className = "fortune-teller__button fortune-teller__button--choice";
	if (choice.swatchColour === undefined) {
		button.append(choice.label);
	} else {
		const swatch = element("span", "fortune-teller__swatch");
		swatch.style.backgroundColor = choice.swatchColour;
		button.append(swatch);
		button.setAttribute("aria-label", choice.label);
	}
	if (availability === "waiting") {
		button.setAttribute("aria-disabled", "true");
		return button;
	}
	button.addEventListener("click", choice.choose);
	return button;
}

function element(tagName: "div" | "p" | "span", className: string): HTMLElement {
	const created = document.createElement(tagName);
	created.className = className;
	return created;
}
