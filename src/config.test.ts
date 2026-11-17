// Invariant under test: only a value that passes every rule becomes a configuration, and each rejection names its rule.

import assert from "node:assert/strict";

import { test } from "vitest";

import { ConfigError, defaultConfig, parseColour, parseConfig, parseFortune, parseLabel } from "./config";

test("the default configuration passes its own rules unchanged", () => {
	assert.deepEqual(parseConfig(structuredClone(defaultConfig)), defaultConfig);
});

test("labels, fortunes and colours are trimmed and put in one form", () => {
	assert.equal(parseLabel("  blue  ", "label"), "blue");
	assert.equal(parseLabel("héllo wörld!", "label"), "héllo wörld!");
	assert.equal(parseFortune(" Be kind. ", "fortune"), "Be kind.");
	assert.equal(parseColour("#E5484D", "colour"), "#e5484d");
});

test("a label at the length limit passes and one character more is rejected", () => {
	assert.equal(parseLabel("abcdefghijkl", "label"), "abcdefghijkl");
	assert.throws(() => parseLabel("abcdefghijklm", "label"), {
		name: "ConfigError",
		message: "label must have 1 to 12 characters, got 13; shorten the text",
	});
});

test("a fortune at the length limit passes and one character more is rejected", () => {
	assert.equal(parseFortune("x".repeat(60), "fortune").length, 60);
	assert.throws(() => parseFortune("x".repeat(61), "fortune"), {
		name: "ConfigError",
		message: "fortune must have 1 to 60 characters, got 61; shorten the text",
	});
});

const rejectedFields: readonly (readonly [string, () => unknown, string])[] = [
	["an empty label", () => parseLabel("   ", "label"), "label must have 1 to 12 characters, got 0; shorten the text"],
	["a label of signs only", () => parseLabel("!?", "label"), "label must contain a letter or a digit; add one so the toy can count it"],
	["a label that is not text", () => parseLabel(7, "label"), "label must be text"],
	["an empty fortune", () => parseFortune("", "fortune"), "fortune must have 1 to 60 characters, got 0; shorten the text"],
	["a colour name", () => parseColour("red", "colour"), 'colour must be a colour written as #rrggbb, got "red"'],
	["a short colour", () => parseColour("#fff", "colour"), 'colour must be a colour written as #rrggbb, got "#fff"'],
];

for (const [name, run, message] of rejectedFields) {
	test(`${name} is rejected with its rule`, () => {
		assert.throws(run, (error: unknown) => {
			assert.ok(error instanceof ConfigError);
			assert.equal(error.message, message);
			return true;
		});
	});
}

const rejectedConfigs: readonly (readonly [string, unknown, string])[] = [
	["a value that is not an object", "config", "config must be an object"],
	["a list", [], "config must be an object"],
	["an unknown key", { ...defaultConfig, theme: "dark" }, "config must have exactly the keys panels, pockets, version, got panels, pockets, theme, version"],
	["a missing key", { version: 1, pockets: defaultConfig.pockets }, "config must have exactly the keys panels, pockets, version, got pockets, version"],
	["another version", { ...defaultConfig, version: 2 }, "config.version must be 1, got 2"],
	["three pockets", { ...defaultConfig, pockets: defaultConfig.pockets.slice(0, 3) }, "config.pockets must be a list of 4 items"],
	["nine panels", { ...defaultConfig, panels: [...defaultConfig.panels, defaultConfig.panels[0]] }, "config.panels must be a list of 8 items"],
	[
		"a pocket with an extra key",
		{ ...defaultConfig, pockets: defaultConfig.pockets.map((pocket) => ({ ...pocket, size: 1 })) },
		"config.pockets[0] must have exactly the keys colour, label, got colour, label, size",
	],
	[
		"a long fortune in the last panel",
		{ ...defaultConfig, panels: defaultConfig.panels.map((panel, index) => (index === 7 ? { ...panel, fortune: "y".repeat(61) } : panel)) },
		"config.panels[7].fortune must have 1 to 60 characters, got 61; shorten the text",
	],
	[
		"a bad colour in the third pocket",
		{ ...defaultConfig, pockets: defaultConfig.pockets.map((pocket, index) => (index === 2 ? { ...pocket, colour: "green" } : pocket)) },
		'config.pockets[2].colour must be a colour written as #rrggbb, got "green"',
	],
];

for (const [name, value, message] of rejectedConfigs) {
	test(`a configuration with ${name} is rejected`, () => {
		assert.throws(() => parseConfig(value), { name: "ConfigError", message });
	});
}

test("a configuration error keeps the path and the rule apart for the form", () => {
	try {
		parseLabel("", "config.panels[3].label");
		assert.fail("an empty label must be rejected");
	} catch (error: unknown) {
		assert.ok(error instanceof ConfigError);
		assert.equal(error.path, "config.panels[3].label");
		assert.equal(error.rule, "must have 1 to 12 characters, got 0; shorten the text");
	}
});
