// Builds the form in which a visitor writes the pocket labels, pocket colours, panel labels and fortunes.
//
// A field value reaches the toy only after it passes the rule in config.ts. An invalid value
// shows its rule next to the field and changes nothing.

import { ConfigError, parseColour, parseConfig, parseFortune, parseLabel } from "./config";
import type { FortuneTellerConfig } from "./config";

/** The part of the toy that a form field writes on. */
export type EditorField = Readonly<
	| { kind: "fortune"; index: number }
	| { kind: "panelLabel"; index: number }
	| { kind: "pocket"; index: number }
>;

export type EditorOptions = Readonly<{
	host: HTMLElement;
	config: FortuneTellerConfig;
	/** Called with the whole new configuration after each valid change. */
	onChange: (config: FortuneTellerConfig) => void;
	onFocusField: (field: EditorField) => void;
	onCopyLink: () => void;
	onReset: () => void;
}>;

export type Editor = Readonly<{
	setOpen: (isOpen: boolean) => void;
	/** Replaces every field value, for example after a reset. */
	setConfig: (config: FortuneTellerConfig) => void;
}>;

type FieldKey = "colour" | "fortune" | "label";

type FieldSpec = Readonly<{
	group: "panels" | "pockets";
	index: number;
	key: FieldKey;
	accessibleName: string;
	focus: EditorField;
}>;

// Pockets are stored in the order northEast, southEast, southWest, northWest.
const pocketPlaces = ["Top right", "Bottom right", "Bottom left", "Top left"] as const;
// Panels are stored clockwise from north, as seen from above.
const panelPlaces = [
	"top flap, right half",
	"right flap, top half",
	"right flap, bottom half",
	"bottom flap, right half",
	"bottom flap, left half",
	"left flap, bottom half",
	"left flap, top half",
	"top flap, left half",
] as const;

let nextEditorId = 0;

/** Creates the form, hidden at first, inside the host element. */
export function createEditor(options: EditorOptions): Editor {
	let config = options.config;
	const editorId = nextEditorId;
	nextEditorId += 1;
	const form = document.createElement("form");
	form.className = "fortune-teller__editor";
	form.hidden = true;
	form.noValidate = true;
	form.addEventListener("submit", (event) => {
		event.preventDefault();
	});
	const inputs: { spec: FieldSpec; input: HTMLInputElement }[] = [];

	const addField = (row: HTMLElement, spec: FieldSpec, className: string): void => {
		const input = document.createElement("input");
		input.type = spec.key === "colour" ? "color" : "text";
		input.className = className;
		input.id = `fortune-teller-${editorId}-${spec.group}-${spec.index}-${spec.key}`;
		input.setAttribute("aria-label", spec.accessibleName);
		const problem = document.createElement("p");
		problem.className = "fortune-teller__problem";
		problem.id = `${input.id}-problem`;
		problem.hidden = true;
		input.setAttribute("aria-describedby", problem.id);
		input.addEventListener("focus", () => {
			options.onFocusField(spec.focus);
		});
		input.addEventListener("input", () => {
			const outcome = withFieldValue(config, spec, input.value);
			const isValid = typeof outcome !== "string";
			input.setAttribute("aria-invalid", String(!isValid));
			problem.hidden = isValid;
			problem.textContent = isValid ? "" : outcome;
			if (isValid) {
				config = outcome;
				options.onChange(config);
			}
		});
		inputs.push({ spec, input });
		row.append(input, problem);
	};

	const pocketSet = fieldset("Pockets: the coloured outside. The word is counted when its pocket is chosen, but is not drawn.");
	for (const [index, place] of pocketPlaces.entries()) {
		const row = fieldRow(`${place} pocket`);
		const focus: EditorField = { kind: "pocket", index };
		addField(row, { group: "pockets", index, key: "label", accessibleName: `${place} pocket label`, focus }, "fortune-teller__input");
		addField(row, { group: "pockets", index, key: "colour", accessibleName: `${place} pocket colour`, focus }, "fortune-teller__colour");
		pocketSet.append(row);
	}
	const panelSet = fieldset("Panels: the inside triangles and their hidden fortunes");
	for (const [index, place] of panelPlaces.entries()) {
		const row = fieldRow(`Panel ${index + 1}: ${place}`);
		const labelSpec: FieldSpec = {
			group: "panels",
			index,
			key: "label",
			accessibleName: `Panel ${index + 1} label`,
			focus: { kind: "panelLabel", index },
		};
		const fortuneSpec: FieldSpec = {
			group: "panels",
			index,
			key: "fortune",
			accessibleName: `Panel ${index + 1} fortune`,
			focus: { kind: "fortune", index },
		};
		addField(row, labelSpec, "fortune-teller__input fortune-teller__input--short");
		addField(row, fortuneSpec, "fortune-teller__input fortune-teller__input--long");
		panelSet.append(row);
	}
	const actions = document.createElement("div");
	actions.className = "fortune-teller__actions";
	actions.append(actionButton("Copy link", options.onCopyLink), actionButton("Reset", options.onReset));
	form.append(pocketSet, panelSet, actions);
	options.host.append(form);

	const fill = (): void => {
		for (const { input, spec } of inputs) {
			input.value = fieldValue(config, spec);
			input.setAttribute("aria-invalid", "false");
			const problem = document.getElementById(`${input.id}-problem`);
			if (problem !== null) {
				problem.hidden = true;
				problem.textContent = "";
			}
		}
	};
	fill();

	return {
		setOpen: (isOpen) => {
			form.hidden = !isOpen;
		},
		setConfig: (replacement) => {
			config = replacement;
			fill();
		},
	};
}

function fieldValue(config: FortuneTellerConfig, spec: FieldSpec): string {
	const record: Readonly<Record<string, string>> | undefined =
		spec.group === "pockets" ? config.pockets[spec.index] : config.panels[spec.index];
	const value = record?.[spec.key];
	if (value === undefined) {
		throw new Error(`config must have ${spec.group}[${spec.index}].${spec.key}`);
	}
	return value;
}

// Returns the configuration with one field replaced, or the rule that the new value breaks.
function withFieldValue(config: FortuneTellerConfig, spec: FieldSpec, text: string): FortuneTellerConfig | string {
	try {
		const value = parseFieldValue(spec.key, text);
		const replaceAt = <Item extends object>(items: readonly Item[]): readonly Item[] =>
			items.map((item, index) => (index === spec.index ? { ...item, [spec.key]: value } : item));
		return parseConfig({
			version: config.version,
			pockets: spec.group === "pockets" ? replaceAt(config.pockets) : config.pockets,
			panels: spec.group === "panels" ? replaceAt(config.panels) : config.panels,
		});
	} catch (error: unknown) {
		if (error instanceof ConfigError) {
			return `This ${error.rule}.`;
		}
		throw error;
	}
}

function parseFieldValue(key: FieldKey, text: string): string {
	switch (key) {
		case "colour":
			return parseColour(text, "colour");
		case "fortune":
			return parseFortune(text, "fortune");
		case "label":
			return parseLabel(text, "label");
		default: {
			const unhandled: never = key;
			throw new Error(`unhandled field key ${String(unhandled)}`);
		}
	}
}

function fieldset(legendText: string): HTMLFieldSetElement {
	const set = document.createElement("fieldset");
	set.className = "fortune-teller__fieldset";
	const legend = document.createElement("legend");
	legend.textContent = legendText;
	set.append(legend);
	return set;
}

function fieldRow(title: string): HTMLElement {
	const row = document.createElement("div");
	row.className = "fortune-teller__row";
	const heading = document.createElement("span");
	heading.className = "fortune-teller__row-title";
	heading.textContent = title;
	row.append(heading);
	return row;
}

function actionButton(label: string, run: () => void): HTMLButtonElement {
	const button = document.createElement("button");
	button.type = "button";
	button.className = "fortune-teller__button";
	button.textContent = label;
	button.addEventListener("click", run);
	return button;
}
