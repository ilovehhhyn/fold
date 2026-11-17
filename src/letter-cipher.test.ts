// Invariant under test: the stored letter opens only with its own key, and every other key or changed byte is reported as invalid.

import assert from "node:assert/strict";

import { test } from "vitest";

import { generateKeyText, keyFragmentPrefix, lockLetter, openLetter, parseLockedLetter } from "./letter-cipher";
import type { LockedLetter } from "./letter-cipher";

const sampleText = ["A test letter, not a real one.", "", "It has a blank line, an accent in café and a sign: ✓"].join("\n");

test("a locked letter opens to the same text with the key in the link", async () => {
	const keyText = generateKeyText();
	const locked = await lockLetter(sampleText, keyText);

	const result = await openLetter(`${keyFragmentPrefix}${keyText}`, locked);

	assert.deepEqual(result, { status: "opened", text: sampleText });
});

test("the stored form contains none of the letter's words", async () => {
	const locked = await lockLetter(sampleText, generateKeyText());

	const stored = JSON.stringify(locked);

	for (const word of ["test", "letter", "blank", "café"]) {
		assert.equal(stored.includes(word), false, `the stored form must not contain ${word}`);
	}
	assert.deepEqual(parseLockedLetter(JSON.parse(stored)), locked);
});

test("a new key is 43 base64url characters and differs every time", () => {
	const keys = new Set(Array.from({ length: 20 }, generateKeyText));

	assert.equal(keys.size, 20);
	for (const keyText of keys) {
		assert.match(keyText, /^[A-Za-z0-9_-]{43}$/);
	}
});

test("locking the same text twice gives different stored forms, because each uses a new nonce", async () => {
	const keyText = generateKeyText();

	const first = await lockLetter(sampleText, keyText);
	const second = await lockLetter(sampleText, keyText);

	assert.notEqual(first.nonce, second.nonce);
	assert.notEqual(first.ciphertext, second.ciphertext);
});

test("a link without a key reads as absent and needs no decryption", async () => {
	const locked = await lockLetter(sampleText, generateKeyText());

	for (const fragment of ["", "#", "#config=abc", "#keys=abc", "key=abc"]) {
		assert.deepEqual(await openLetter(fragment, locked), { status: "absent" }, `fragment ${JSON.stringify(fragment)}`);
	}
});

test("another key does not open the letter", async () => {
	const locked = await lockLetter(sampleText, generateKeyText());

	const result = await openLetter(`${keyFragmentPrefix}${generateKeyText()}`, locked);

	assert.deepEqual(result, { status: "invalid", reason: "the key in the link does not open this letter" });
});

test("a key that is cut short, too long or has a wrong sign is reported as incomplete", async () => {
	const keyText = generateKeyText();
	const locked = await lockLetter(sampleText, keyText);

	for (const badKey of [keyText.slice(0, 42), `${keyText}A`, `${keyText.slice(0, 42)}=`, "", "%%%"]) {
		const result = await openLetter(`${keyFragmentPrefix}${badKey}`, locked);
		assert.deepEqual(result, { status: "invalid", reason: "the key in the link is incomplete" }, `key ${JSON.stringify(badKey)}`);
	}
});

test("a stored letter with one changed character does not open, even with the right key", async () => {
	const keyText = generateKeyText();
	const locked = await lockLetter(sampleText, keyText);
	const firstCharacter = locked.ciphertext[0] === "A" ? "B" : "A";
	const changed: LockedLetter = { ...locked, ciphertext: firstCharacter + locked.ciphertext.slice(1) };

	const result = await openLetter(`${keyFragmentPrefix}${keyText}`, changed);

	assert.deepEqual(result, { status: "invalid", reason: "the key in the link does not open this letter" });
});

test("locking with a malformed key is rejected before anything is encrypted", async () => {
	await assert.rejects(lockLetter(sampleText, "too-short"), {
		message: "letter key must be 43 base64url characters; create one with generateKeyText",
	});
});

const validStored = { version: 1, nonce: "AAAAAAAAAAAAAAAA", ciphertext: "AAAA" };
const rejectedStoredForms: readonly (readonly [string, unknown, RegExp])[] = [
	["a value that is not an object", "letter", /^locked letter must be an object$/],
	["a list", [], /^locked letter must be an object$/],
	["an extra key", { ...validStored, text: "plain" }, /^locked letter must have exactly the keys ciphertext, nonce, version, got ciphertext, nonce, text, version$/],
	["a missing key", { version: 1, nonce: "AAAAAAAAAAAAAAAA" }, /^locked letter must have exactly the keys/],
	["another version", { ...validStored, version: 2 }, /^locked letter version must be 1, got 2$/],
	["a nonce of the wrong length", { ...validStored, nonce: "AAAA" }, /^locked letter nonce must be 12 bytes in base64url$/],
	["a nonce with a wrong sign", { ...validStored, nonce: "AAAAAAAAAAAAAAA=" }, /^locked letter nonce must be 12 bytes in base64url$/],
	["an empty ciphertext", { ...validStored, ciphertext: "" }, /^locked letter ciphertext must be base64url text$/],
	["a ciphertext that is not text", { ...validStored, ciphertext: 7 }, /^locked letter ciphertext must be base64url text$/],
];

for (const [name, value, message] of rejectedStoredForms) {
	test(`a stored letter with ${name} is rejected`, () => {
		assert.throws(() => parseLockedLetter(value), { message });
	});
}

test("a stored letter in the right form is accepted unchanged", () => {
	assert.deepEqual(parseLockedLetter(validStored), validStored);
});
