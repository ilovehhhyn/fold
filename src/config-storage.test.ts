// Invariant under test: a configuration survives saving and sharing unchanged, and a broken stored value is reported, never replaced in silence.

import assert from "node:assert/strict";

import { test } from "vitest";

import { defaultConfig, parseConfig } from "./config";
import { chooseStartConfig, fragmentFor, readFragmentConfig, readSavedConfig, storageKey, writeSavedConfig } from "./config-storage";
import type { LoadResult } from "./config-storage";

const customConfig = parseConfig({
	...defaultConfig,
	panels: defaultConfig.panels.map((panel, index) => (index === 4 ? { ...panel, fortune: "Tu vas réussir ça, c'est sûr ✓" } : panel)),
});

test("a shared link carries a configuration with accented text unchanged", () => {
	const fragment = fragmentFor(customConfig);

	assert.match(fragment, /^#config=[A-Za-z0-9_-]+$/);
	assert.deepEqual(readFragmentConfig(fragment), { status: "loaded", config: customConfig });
});

test("a page address without link data reads as absent", () => {
	for (const fragment of ["", "#", "#section-2", "#configuration"]) {
		assert.deepEqual(readFragmentConfig(fragment), { status: "absent" }, `fragment ${JSON.stringify(fragment)}`);
	}
});

const brokenFragments: readonly (readonly [string, string, RegExp])[] = [
	["signs that are not base64url", "#config=%%%", /^the link data is not valid base64url text$/],
	["bytes that are not UTF-8", `#config=${btoa("ÿþ")}`, /^the link data is not valid base64url text$/],
	["text that is not JSON", `#config=${btoa("not json")}`, /^the stored text is not valid JSON$/],
	["a configuration of another version", `#config=${btoa(JSON.stringify({ ...defaultConfig, version: 9 }))}`, /^config\.version must be 1, got 9$/],
	["an empty value", "#config=", /^the stored text is not valid JSON$/],
];

for (const [name, fragment, reason] of brokenFragments) {
	test(`link data with ${name} reads as invalid with its reason`, () => {
		const result = readFragmentConfig(fragment);

		assert.equal(result.status, "invalid");
		assert.match(result.status === "invalid" ? result.reason : "", reason);
	});
}

test("saving writes one value under the storage key and reading returns it", () => {
	const writes: (readonly [string, string])[] = [];
	const storage = {
		getItem: (key: string): string | null => writes.filter((write) => write[0] === key).at(-1)?.[1] ?? null,
		setItem: (key: string, value: string): void => {
			writes.push([key, value]);
		},
	};

	assert.deepEqual(readSavedConfig(storage), { status: "absent" });
	writeSavedConfig(storage, customConfig);

	assert.deepEqual(writes.map(([key]) => key), [storageKey]);
	assert.deepEqual(readSavedConfig(storage), { status: "loaded", config: customConfig });
});

test("a saved value that breaks a rule reads as invalid and is not repaired", () => {
	const brokenText = JSON.stringify({ ...defaultConfig, pockets: [] });
	const storage = { getItem: (): string | null => brokenText };

	assert.deepEqual(readSavedConfig(storage), { status: "invalid", reason: "config.pockets must be a list of 4 items" });
	assert.deepEqual(readSavedConfig({ getItem: (): string | null => "{" }), { status: "invalid", reason: "the stored text is not valid JSON" });
});

const absent: LoadResult = { status: "absent" };
const loadedCustom: LoadResult = { status: "loaded", config: customConfig };
const broken: LoadResult = { status: "invalid", reason: "config.version must be 1, got 9" };

test("the first configuration is the link's, then the saved one, then the default", () => {
	assert.deepEqual(chooseStartConfig(absent, absent), { config: defaultConfig, notices: [] });
	assert.deepEqual(chooseStartConfig(loadedCustom, absent), { config: customConfig, notices: [] });
	assert.deepEqual(chooseStartConfig(absent, loadedCustom), { config: customConfig, notices: [] });
	assert.deepEqual(chooseStartConfig({ status: "loaded", config: defaultConfig }, loadedCustom), { config: customConfig, notices: [] });
});

test("a broken link or a broken saved value always produces a notice", () => {
	const brokenLink = chooseStartConfig(loadedCustom, broken);
	assert.equal(brokenLink.config, customConfig);
	assert.deepEqual(brokenLink.notices, [
		"The fortune teller in this link could not be read (config.version must be 1, got 9), so it is not shown.",
	]);

	const brokenSaved = chooseStartConfig(broken, absent);
	assert.equal(brokenSaved.config, defaultConfig);
	assert.deepEqual(brokenSaved.notices, [
		"Your saved fortune teller could not be read (config.version must be 1, got 9), so the default one is shown.",
	]);

	assert.equal(chooseStartConfig(broken, broken).notices.length, 2);
});
