// Encrypts a plain-text letter into src/letter.encrypted.json and prints the private link that opens it.
//
// Usage: node scripts/encrypt-letter.ts <path to the letter as plain text>
// The key is read from the environment variable LETTER_KEY, so that an edited letter keeps its
// link. Without the variable a new key is made, and every link sent before stops working.
// The plain text and the key are never written into the repository by this script.

import { readFile, rename, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

import { generateKeyText, keyFragmentPrefix, lockLetter, openLetter } from "../src/letter-cipher.ts";

const keyVariableName = "LETTER_KEY";
const outputPath = fileURLToPath(new URL("../src/letter.encrypted.json", import.meta.url));
const packagePath = fileURLToPath(new URL("../package.json", import.meta.url));

async function main(arguments_: readonly string[]): Promise<number> {
	const [letterPath, ...extra] = arguments_;
	if (letterPath === undefined || extra.length > 0) {
		process.stderr.write("usage: node scripts/encrypt-letter.ts <path to the letter as plain text>\n");
		return 2;
	}
	const text = (await readFile(letterPath, "utf8")).trimEnd();
	if (text === "") {
		process.stderr.write(`letter file ${letterPath} must contain text\n`);
		return 2;
	}
	const existingKey = process.env[keyVariableName];
	const keyText = existingKey ?? generateKeyText();
	const locked = await lockLetter(text, keyText);
	const reopened = await openLetter(`${keyFragmentPrefix}${keyText}`, locked);
	if (reopened.status !== "opened" || reopened.text !== text) {
		process.stderr.write("the encrypted letter did not open back to the same text; nothing was written\n");
		return 1;
	}
	const temporaryPath = `${outputPath}.temporary`;
	await writeFile(temporaryPath, `${JSON.stringify(locked, null, "\t")}\n`, { flag: "wx" });
	await rename(temporaryPath, outputPath);
	const homepage = await readHomepage();
	const lines = [
		`encrypted ${text.length} characters into src/letter.encrypted.json`,
		existingKey === undefined ? "made a new key; links sent before no longer open the letter" : `reused the key from ${keyVariableName}`,
		`key: ${keyText}`,
		`link: ${homepage}${keyFragmentPrefix}${keyText}`,
	];
	process.stdout.write(`${lines.join("\n")}\n`);
	return 0;
}

async function readHomepage(): Promise<string> {
	const manifest: unknown = JSON.parse(await readFile(packagePath, "utf8"));
	const homepage = typeof manifest === "object" && manifest !== null && "homepage" in manifest ? manifest.homepage : undefined;
	if (typeof homepage !== "string" || !homepage.startsWith("https://")) {
		throw new Error("package.json homepage must be the https address of the hosted site");
	}
	return homepage;
}

process.exitCode = await main(process.argv.slice(2));
