// The text and colours a visitor can write on the fortune teller, with the rules that every value must pass.
//
// Untrusted data (a saved value, a shared link, a form field) becomes a FortuneTellerConfig only
// through the parse functions in this file. Code that holds a FortuneTellerConfig does not check again.

export const configVersion = 1;
export const pocketCount = 4;
export const panelCount = 8;
export const labelLengthMax = 12;
export const fortuneLengthMax = 60;
// A label that is a whole number from 1 to countMax counts as that number.
export const countMax = 12;

const wholeNumberPattern = /^(?:[1-9]|1[0-2])$/;
const letterOrDigitPattern = /[\p{L}\p{N}]/gu;
const colourPattern = /^#[0-9a-f]{6}$/;

/** One finger pocket: its colour as `#rrggbb`, and the word that is counted for it but not drawn. */
export type Pocket = Readonly<{ label: string; colour: string }>;

/** One inside triangle: the label the player sees and the fortune hidden under it. */
export type Panel = Readonly<{ label: string; fortune: string }>;

/** Everything a visitor can change. Pockets run northEast, southEast, southWest, northWest; panels run clockwise from north. */
export type FortuneTellerConfig = Readonly<{
	version: typeof configVersion;
	pockets: readonly [Pocket, Pocket, Pocket, Pocket];
	panels: readonly [Panel, Panel, Panel, Panel, Panel, Panel, Panel, Panel];
}>;

/** A value broke a configuration rule; `path` names the value and `rule` states the rule and the fix. */
export class ConfigError extends Error {
	override readonly name = "ConfigError";
	readonly path: string;
	readonly rule: string;

	constructor(path: string, rule: string) {
		super(`${path} ${rule}`);
		this.path = path;
		this.rule = rule;
	}
}

export const defaultConfig: FortuneTellerConfig = {
	version: configVersion,
	pockets: [
		{ label: "purple", colour: "#a491d3" },
		{ label: "slate", colour: "#818aa3" },
		{ label: "green", colour: "#c5dca0" },
		{ label: "peach", colour: "#f9dad0" },
	],
	panels: [
		{ label: "1", fortune: "You will make a new friend soon." },
		{ label: "2", fortune: "A good surprise is on its way." },
		{ label: "3", fortune: "Ask again after a snack." },
		{ label: "4", fortune: "Today is a lucky day for you." },
		{ label: "5", fortune: "Someone is thinking of you." },
		{ label: "6", fortune: "You will travel somewhere new." },
		{ label: "7", fortune: "Try the thing that scares you a little." },
		{ label: "8", fortune: "Your next idea will work." },
	],
};

/** Returns a validated configuration, or throws a ConfigError that names the first broken rule. */
export function parseConfig(value: unknown): FortuneTellerConfig {
	const record = requireRecord(value, "config", ["panels", "pockets", "version"]);
	if (record["version"] !== configVersion) {
		throw new ConfigError("config.version", `must be ${configVersion}, got ${JSON.stringify(record["version"])}`);
	}
	const pockets = requireList(record["pockets"], "config.pockets", pocketCount).map(parsePocket);
	const panels = requireList(record["panels"], "config.panels", panelCount).map(parsePanel);
	const [pocket0, pocket1, pocket2, pocket3] = pockets;
	const [panel0, panel1, panel2, panel3, panel4, panel5, panel6, panel7] = panels;
	const isComplete =
		pocket0 !== undefined && pocket1 !== undefined && pocket2 !== undefined && pocket3 !== undefined &&
		panel0 !== undefined && panel1 !== undefined && panel2 !== undefined && panel3 !== undefined &&
		panel4 !== undefined && panel5 !== undefined && panel6 !== undefined && panel7 !== undefined;
	if (!isComplete) {
		throw new Error("the list lengths were checked by requireList");
	}
	return {
		version: configVersion,
		pockets: [pocket0, pocket1, pocket2, pocket3],
		panels: [panel0, panel1, panel2, panel3, panel4, panel5, panel6, panel7],
	};
}

/** Returns the trimmed label, or throws if it breaks the label rule. */
export function parseLabel(value: unknown, path: string): string {
	const text = requireText(value, path);
	const length = characterCount(text);
	if (length < 1 || length > labelLengthMax) {
		throw new ConfigError(path, `must have 1 to ${labelLengthMax} characters, got ${length}; shorten the text`);
	}
	if (text.match(letterOrDigitPattern) === null) {
		throw new ConfigError(path, "must contain a letter or a digit; add one so the toy can count it");
	}
	return text;
}

/** Returns the trimmed fortune, or throws if it breaks the fortune rule. */
export function parseFortune(value: unknown, path: string): string {
	const text = requireText(value, path);
	const length = characterCount(text);
	if (length < 1 || length > fortuneLengthMax) {
		throw new ConfigError(path, `must have 1 to ${fortuneLengthMax} characters, got ${length}; shorten the text`);
	}
	return text;
}

/** Returns the colour in lower case, or throws if it is not `#rrggbb`. */
export function parseColour(value: unknown, path: string): string {
	const text = requireText(value, path).toLowerCase();
	if (!colourPattern.test(text)) {
		throw new ConfigError(path, `must be a colour written as #rrggbb, got ${JSON.stringify(text)}`);
	}
	return text;
}

/**
 * Returns how many times the toy opens for a label.
 *
 * A whole number from 1 to 12 written in digits counts as that number. Any other label counts
 * its letters and digits.
 */
export function countFor(label: string): number {
	return countTokens(label).length;
}

/** Returns what the status line shows for each opening: 1, 2, 3 for a number, or the letters of a word. */
export function countTokens(label: string): readonly string[] {
	if (wholeNumberPattern.test(label)) {
		return Array.from({ length: Number(label) }, (_unused, index) => String(index + 1));
	}
	const tokens = label.match(letterOrDigitPattern);
	if (tokens === null) {
		throw new ConfigError("label", `must contain a letter or a digit, got ${JSON.stringify(label)}; pass a parsed label`);
	}
	return tokens;
}

function parsePocket(value: unknown, index: number): Pocket {
	const path = `config.pockets[${index}]`;
	const record = requireRecord(value, path, ["colour", "label"]);
	return {
		label: parseLabel(record["label"], `${path}.label`),
		colour: parseColour(record["colour"], `${path}.colour`),
	};
}

function parsePanel(value: unknown, index: number): Panel {
	const path = `config.panels[${index}]`;
	const record = requireRecord(value, path, ["fortune", "label"]);
	return {
		label: parseLabel(record["label"], `${path}.label`),
		fortune: parseFortune(record["fortune"], `${path}.fortune`),
	};
}

function requireRecord(value: unknown, path: string, keys: readonly string[]): Readonly<Record<string, unknown>> {
	if (typeof value !== "object" || value === null || Array.isArray(value)) {
		throw new ConfigError(path, "must be an object");
	}
	const actualKeys = Object.keys(value).sort();
	const hasExactKeys = actualKeys.length === keys.length && actualKeys.every((key, index) => key === keys[index]);
	if (!hasExactKeys) {
		throw new ConfigError(path, `must have exactly the keys ${keys.join(", ")}, got ${actualKeys.join(", ")}`);
	}
	return Object.fromEntries(Object.entries(value));
}

function requireList(value: unknown, path: string, length: number): readonly unknown[] {
	if (!Array.isArray(value) || value.length !== length) {
		throw new ConfigError(path, `must be a list of ${length} items`);
	}
	return value;
}

function requireText(value: unknown, path: string): string {
	if (typeof value !== "string") {
		throw new ConfigError(path, "must be text");
	}
	return value.trim();
}

// Counts code points, so that one emoji or accented letter is one character.
function characterCount(text: string): number {
	return Array.from(text).length;
}
