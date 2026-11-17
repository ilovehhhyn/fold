// Saves and loads a configuration in browser storage and in the URL fragment of a shared link.
//
// Both places hold untrusted text. Every read goes through parseConfig, and a broken value is
// reported as "invalid" with its reason. It is never replaced by a default without a notice.
// Fragment format: `#config=` followed by the JSON text as UTF-8 bytes in base64url.

import { ConfigError, defaultConfig, parseConfig } from "./config";
import type { FortuneTellerConfig } from "./config";

// The key ends in v2 since the default colours changed and pocket labels are no longer drawn.
// A value saved under the v1 key belongs to the earlier look and is not read.
export const storageKey = "fortune-teller.config.v2";
const fragmentPrefix = "#config=";

/** The three outcomes of a read: nothing stored, a broken value, or a valid configuration. */
export type LoadResult = Readonly<
	| { status: "absent" }
	| { status: "invalid"; reason: string }
	| { status: "loaded"; config: FortuneTellerConfig }
>;

/** The configuration to start with, and the notices the visitor must see about broken values. */
export type StartConfig = Readonly<{ config: FortuneTellerConfig; notices: readonly string[] }>;

/** Reads the saved configuration. */
export function readSavedConfig(storage: Pick<Storage, "getItem">): LoadResult {
	const text = storage.getItem(storageKey);
	return text === null ? { status: "absent" } : parseConfigText(text);
}

/** Saves the configuration, replacing the one saved before. */
export function writeSavedConfig(storage: Pick<Storage, "setItem">, config: FortuneTellerConfig): void {
	storage.setItem(storageKey, JSON.stringify(config));
}

/** Returns true if the URL fragment carries a shared configuration, valid or not. */
export function isConfigFragment(fragment: string): boolean {
	return fragment.startsWith(fragmentPrefix);
}

/** Reads the configuration from a URL fragment such as `location.hash`. */
export function readFragmentConfig(fragment: string): LoadResult {
	if (!fragment.startsWith(fragmentPrefix)) {
		return { status: "absent" };
	}
	const encoded = fragment.slice(fragmentPrefix.length);
	try {
		const binary = atob(encoded.replaceAll("-", "+").replaceAll("_", "/"));
		const bytes = Uint8Array.from(binary, (character) => character.charCodeAt(0));
		return parseConfigText(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
	} catch (error: unknown) {
		// atob and the decoder report malformed input as DOMException or TypeError.
		if (error instanceof DOMException || error instanceof TypeError) {
			return { status: "invalid", reason: "the link data is not valid base64url text" };
		}
		throw error;
	}
}

/** Returns the URL fragment that carries the configuration. */
export function fragmentFor(config: FortuneTellerConfig): string {
	const bytes = new TextEncoder().encode(JSON.stringify(config));
	const binary = Array.from(bytes, (byte) => String.fromCharCode(byte)).join("");
	return fragmentPrefix + btoa(binary).replaceAll("+", "-").replaceAll("/", "_").replaceAll("=", "");
}

/** Chooses the first configuration: a shared link wins over the saved one, which wins over the defaults. */
export function chooseStartConfig(saved: LoadResult, shared: LoadResult): StartConfig {
	const notices: string[] = [];
	if (shared.status === "invalid") {
		notices.push(`The fortune teller in this link could not be read (${shared.reason}), so it is not shown.`);
	}
	if (saved.status === "invalid") {
		notices.push(`Your saved fortune teller could not be read (${saved.reason}), so the default one is shown.`);
	}
	if (shared.status === "loaded") {
		return { config: shared.config, notices };
	}
	return { config: saved.status === "loaded" ? saved.config : defaultConfig, notices };
}

function parseConfigText(text: string): LoadResult {
	let value: unknown;
	try {
		value = JSON.parse(text);
	} catch (error: unknown) {
		if (error instanceof SyntaxError) {
			return { status: "invalid", reason: "the stored text is not valid JSON" };
		}
		throw error;
	}
	try {
		return { status: "loaded", config: parseConfig(value) };
	} catch (error: unknown) {
		if (error instanceof ConfigError) {
			return { status: "invalid", reason: error.message };
		}
		throw error;
	}
}
