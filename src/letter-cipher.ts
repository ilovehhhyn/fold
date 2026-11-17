// Locks and unlocks the private letter of the demo page, without ever storing its key in the site.
//
// The site holds the letter only as AES-256-GCM ciphertext. The key travels in the URL fragment
// of the link that the writer sends, `#key=<key>`. A browser does not send a fragment to any
// server, so the key reaches only the person who has the link. Without the key there is no letter.
// Formats: the key is 32 random bytes and the nonce is 12 random bytes. Key, nonce and ciphertext
// are written in base64url without padding.

export const keyFragmentPrefix = "#key=";
const lockedLetterVersion = 1;
const keyByteLength = 32;
const nonceByteLength = 12;
// 32 bytes in base64url without padding are 43 characters.
const keyTextPattern = /^[A-Za-z0-9_-]{43}$/;
const base64UrlPattern = /^[A-Za-z0-9_-]+$/;

/** The letter as the site stores it. */
export type LockedLetter = Readonly<{ version: typeof lockedLetterVersion; nonce: string; ciphertext: string }>;

/** The three outcomes of opening: the link has no key, the key does not fit, or the letter text. */
export type LetterResult = Readonly<
	| { status: "absent" }
	| { status: "invalid"; reason: string }
	| { status: "opened"; text: string }
>;

/** Returns the stored letter if the value has exactly the stored format, or throws. */
export function parseLockedLetter(value: unknown): LockedLetter {
	if (typeof value !== "object" || value === null || Array.isArray(value)) {
		throw new Error("locked letter must be an object");
	}
	const record: Readonly<Record<string, unknown>> = Object.fromEntries(Object.entries(value));
	const keys = Object.keys(record).sort().join(", ");
	if (keys !== "ciphertext, nonce, version") {
		throw new Error(`locked letter must have exactly the keys ciphertext, nonce, version, got ${keys}`);
	}
	const { ciphertext, nonce, version } = record;
	if (version !== lockedLetterVersion) {
		throw new Error(`locked letter version must be ${lockedLetterVersion}, got ${JSON.stringify(version)}`);
	}
	if (typeof nonce !== "string" || !base64UrlPattern.test(nonce) || decodeBase64Url(nonce).length !== nonceByteLength) {
		throw new Error(`locked letter nonce must be ${nonceByteLength} bytes in base64url`);
	}
	if (typeof ciphertext !== "string" || !base64UrlPattern.test(ciphertext)) {
		throw new Error("locked letter ciphertext must be base64url text");
	}
	return { version: lockedLetterVersion, nonce, ciphertext };
}

/** Returns a new random key as text, ready to follow `#key=` in a link. */
export function generateKeyText(): string {
	return encodeBase64Url(crypto.getRandomValues(new Uint8Array(keyByteLength)));
}

/** Encrypts the letter with the key; every call uses a new random nonce. */
export async function lockLetter(text: string, keyText: string): Promise<LockedLetter> {
	if (!keyTextPattern.test(keyText)) {
		throw new Error("letter key must be 43 base64url characters; create one with generateKeyText");
	}
	const nonce = crypto.getRandomValues(new Uint8Array(nonceByteLength));
	const key = await importKey(keyText, "encrypt");
	const ciphertext = await crypto.subtle.encrypt({ name: "AES-GCM", iv: nonce }, key, new TextEncoder().encode(text));
	return { version: lockedLetterVersion, nonce: encodeBase64Url(nonce), ciphertext: encodeBase64Url(new Uint8Array(ciphertext)) };
}

/** Opens the letter with the key in a URL fragment such as `location.hash`. */
export async function openLetter(fragment: string, locked: LockedLetter): Promise<LetterResult> {
	if (!fragment.startsWith(keyFragmentPrefix)) {
		return { status: "absent" };
	}
	const keyText = fragment.slice(keyFragmentPrefix.length);
	if (!keyTextPattern.test(keyText)) {
		return { status: "invalid", reason: "the key in the link is incomplete" };
	}
	// Browsers offer the Web Crypto functions only on https pages and on localhost.
	if (globalThis.crypto?.subtle === undefined) {
		return { status: "invalid", reason: "the page must be opened over https" };
	}
	try {
		const key = await importKey(keyText, "decrypt");
		const plain = await crypto.subtle.decrypt(
			{ name: "AES-GCM", iv: decodeBase64Url(locked.nonce) },
			key,
			decodeBase64Url(locked.ciphertext),
		);
		return { status: "opened", text: new TextDecoder("utf-8", { fatal: true }).decode(plain) };
	} catch (error: unknown) {
		// Decryption with a wrong key, or of changed ciphertext, fails with a DOMException.
		if (error instanceof DOMException) {
			return { status: "invalid", reason: "the key in the link does not open this letter" };
		}
		throw error;
	}
}

async function importKey(keyText: string, usage: "decrypt" | "encrypt"): Promise<CryptoKey> {
	return crypto.subtle.importKey("raw", decodeBase64Url(keyText), "AES-GCM", false, [usage]);
}

function encodeBase64Url(bytes: Uint8Array): string {
	const binary = Array.from(bytes, (byte) => String.fromCharCode(byte)).join("");
	return btoa(binary).replaceAll("+", "-").replaceAll("/", "_").replaceAll("=", "");
}

function decodeBase64Url(text: string): Uint8Array<ArrayBuffer> {
	const binary = atob(text.replaceAll("-", "+").replaceAll("_", "/"));
	return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}
