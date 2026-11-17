// Invariant under test: text on a paper triangle is never mirrored, is turned upright for the screen, and stays inside the triangle.
//
// Oracle for the turning rule: the composed map (canvas to screen, after the text is turned) must
// be a pure stretch, that is a symmetric matrix with a positive trace and a positive determinant.
// Tolerance: absolute 1e-9 on matrix entries of order 1.

import assert from "node:assert/strict";

import { test } from "vitest";

import { fitTextInTriangle, layoutTriangleOnCanvas } from "./text-layout";
import type { FitTextOptions, Point2, Triangle2 } from "./text-layout";

const canvasSizePixels = 512;
const paddingPixels = 6;
const tolerance = 1e-9;
const canonical: Triangle2 = [
	[6, 506],
	[506, 506],
	[6, 6],
];

test("a screen triangle that already matches the canvas needs no turn", () => {
	const layout = layoutTriangleOnCanvas({ canvasSizePixels, paddingPixels, rightAngleIndex: 0, screenCorners: scale(canonical, 0.01) });

	assert.deepEqual(layout.canvasCorners, canonical);
	assert.ok(Math.abs(layout.rotationRadians) < tolerance, `rotation is ${layout.rotationRadians}`);
});

test("a screen triangle turned by a quarter turn gets the opposite turn on the canvas", () => {
	const quarterTurn = canonical.map(([x, y]) => [-y * 0.01, x * 0.01]) as unknown as Triangle2; // map keeps three corners.

	const layout = layoutTriangleOnCanvas({ canvasSizePixels, paddingPixels, rightAngleIndex: 0, screenCorners: quarterTurn });

	assert.ok(Math.abs(layout.rotationRadians + Math.PI / 2) < tolerance, `rotation is ${layout.rotationRadians}`);
});

test("a mirrored screen triangle is placed with the other handedness, so its text is not mirrored", () => {
	const mirrored = canonical.map(([x, y]) => [-x * 0.01, y * 0.01]) as unknown as Triangle2; // map keeps three corners.

	const layout = layoutTriangleOnCanvas({ canvasSizePixels, paddingPixels, rightAngleIndex: 0, screenCorners: mirrored });

	assert.deepEqual(layout.canvasCorners, [canonical[0], canonical[2], canonical[1]]);
	assert.ok(determinant(composedMap(layout.canvasCorners, mirrored, layout.rotationRadians)) > 0);
});

test("for any screen triangle the turned text map is a pure stretch without mirroring", () => {
	const random = seededRandom(20_261_116);
	let checked = 0;

	for (let attempt = 0; attempt < 200; attempt += 1) {
		const screenCorners: Triangle2 = [
			[random() * 2 - 1, random() * 2 - 1],
			[random() * 2 - 1, random() * 2 - 1],
			[random() * 2 - 1, random() * 2 - 1],
		];
		if (Math.abs(doubleArea(screenCorners)) < 0.05) {
			continue;
		}
		const rightAngleIndex = (attempt % 3) as 0 | 1 | 2; // attempt % 3 is 0, 1 or 2.
		const layout = layoutTriangleOnCanvas({ canvasSizePixels, paddingPixels, rightAngleIndex, screenCorners });
		const [[m11, m12], [m21, m22]] = composedMap(layout.canvasCorners, screenCorners, layout.rotationRadians);
		assert.ok(Math.abs(m21 - m12) < tolerance, `map is not symmetric: ${m12} and ${m21}`);
		assert.ok(m11 + m22 > 0, "text must not be upside down");
		assert.ok(m11 * m22 - m12 * m21 > 0, "text must not be mirrored");
		checked += 1;
	}

	assert.ok(checked > 150, `only ${checked} triangles were large enough to check`);
});

test("a triangle that the camera sees edge-on is rejected", () => {
	const edgeOn: Triangle2 = [
		[0, 0],
		[1, 1],
		[2, 2],
	];

	assert.throws(() => layoutTriangleOnCanvas({ canvasSizePixels, paddingPixels, rightAngleIndex: 1, screenCorners: edgeOn }), {
		message: "a text triangle is edge-on in its reading pose; choose a pose in which the camera sees its face",
	});
});

const fitDefaults: Omit<FitTextOptions, "text"> = {
	canvasCorners: canonical,
	fontSizeMaxPixels: 170,
	fontSizeMinPixels: 12,
	lineHeightRatio: 1.1,
	marginPixels: 30,
	// A stand-in for the browser: every character is half as wide as the font size.
	measureWidth: (text, fontSizePixels) => text.length * fontSizePixels * 0.5,
	rotationRadians: 0,
};

for (const rotationRadians of [0, 0.6, -2.2, Math.PI]) {
	test(`every fitted line stays inside the triangle when the text is turned by ${rotationRadians} radians`, () => {
		const text = "You will travel somewhere new and bring back a good story.";

		const fitted = fitTextInTriangle({ ...fitDefaults, rotationRadians, text });

		assert.equal(fitted.lines.map((line) => line.text).join(" "), text);
		const halfHeight = (fitted.fontSizePixels * fitDefaults.lineHeightRatio) / 2;
		for (const line of fitted.lines) {
			const halfWidth = fitDefaults.measureWidth(line.text, fitted.fontSizePixels) / 2;
			for (const [signX, signY] of [[-1, -1], [1, -1], [1, 1], [-1, 1]] as const) {
				const corner = toCanvas([line.offsetX + signX * halfWidth, line.offsetY + signY * halfHeight], rotationRadians, fitted.pivot);
				assert.ok(isInside(corner, canonical), `a corner of ${JSON.stringify(line.text)} leaves the triangle at ${corner}`);
			}
		}
	});
}

test("a longer text gets a smaller font, and a single digit gets the largest", () => {
	const digit = fitTextInTriangle({ ...fitDefaults, text: "5" });
	const word = fitTextInTriangle({ ...fitDefaults, text: "abcdefghijkl" });
	const shortSentence = fitTextInTriangle({ ...fitDefaults, text: "Be kind today." });
	const longSentence = fitTextInTriangle({ ...fitDefaults, text: "Try the thing that scares you a little, and then try it again." });

	assert.equal(digit.fontSizePixels, fitDefaults.fontSizeMaxPixels);
	assert.ok(word.fontSizePixels < digit.fontSizePixels);
	assert.ok(longSentence.fontSizePixels < shortSentence.fontSizePixels);
	assert.deepEqual(word.lines.map((line) => line.text), ["abcdefghijkl"]);
	assert.ok(longSentence.lines.length > 1);
});

test("the longest allowed fortune without spaces fits by cutting the word across lines", () => {
	const text = "x".repeat(60);

	const fitted = fitTextInTriangle({ ...fitDefaults, text });

	assert.ok(fitted.fontSizePixels >= fitDefaults.fontSizeMinPixels);
	assert.ok(fitted.lines.length > 1, "one line cannot hold 60 characters");
	assert.equal(fitted.lines.map((line) => line.text).join(""), text);
});

test("words stay whole when the text fits without cutting", () => {
	const text = "Someone is thinking of you.";

	const fitted = fitTextInTriangle({ ...fitDefaults, text });

	assert.equal(fitted.lines.map((line) => line.text).join(" "), text);
});

test("text that cannot fit at the smallest font is rejected with the fix", () => {
	assert.throws(() => fitTextInTriangle({ ...fitDefaults, text: "x".repeat(400) }), {
		message: /does not fit at 12 pixels; shorten the text$/,
	});
});

test("an empty text and a margin as large as the triangle are rejected", () => {
	assert.throws(() => fitTextInTriangle({ ...fitDefaults, text: "   " }), { message: "text to fit must contain at least one word" });
	assert.throws(() => fitTextInTriangle({ ...fitDefaults, marginPixels: 200, text: "5" }), {
		message: /^text margin must be smaller than the inradius 146\.4, got 200$/,
	});
});

type Matrix2 = readonly [readonly [number, number], readonly [number, number]];

// Returns L * R(rotation), where L maps canvas edge vectors to screen edge vectors.
function composedMap(canvasCorners: Triangle2, screenCorners: Triangle2, rotationRadians: number): Matrix2 {
	const [canvasU, canvasV] = edges(canvasCorners);
	const [screenU, screenV] = edges(screenCorners);
	const canvasDeterminant = canvasU[0] * canvasV[1] - canvasV[0] * canvasU[1];
	const l11 = (screenU[0] * canvasV[1] - screenV[0] * canvasU[1]) / canvasDeterminant;
	const l12 = (screenV[0] * canvasU[0] - screenU[0] * canvasV[0]) / canvasDeterminant;
	const l21 = (screenU[1] * canvasV[1] - screenV[1] * canvasU[1]) / canvasDeterminant;
	const l22 = (screenV[1] * canvasU[0] - screenU[1] * canvasV[0]) / canvasDeterminant;
	const cosine = Math.cos(rotationRadians);
	const sine = Math.sin(rotationRadians);
	return [
		[l11 * cosine + l12 * sine, -l11 * sine + l12 * cosine],
		[l21 * cosine + l22 * sine, -l21 * sine + l22 * cosine],
	];
}

function determinant(matrix: Matrix2): number {
	return matrix[0][0] * matrix[1][1] - matrix[0][1] * matrix[1][0];
}

function edges(triangle: Triangle2): readonly [Point2, Point2] {
	return [
		[triangle[1][0] - triangle[0][0], triangle[1][1] - triangle[0][1]],
		[triangle[2][0] - triangle[0][0], triangle[2][1] - triangle[0][1]],
	];
}

function doubleArea(triangle: Triangle2): number {
	const [u, v] = edges(triangle);
	return u[0] * v[1] - v[0] * u[1];
}

function scale(triangle: Triangle2, factor: number): Triangle2 {
	return [
		[triangle[0][0] * factor, triangle[0][1] * factor],
		[triangle[1][0] * factor, triangle[1][1] * factor],
		[triangle[2][0] * factor, triangle[2][1] * factor],
	];
}

function toCanvas(textPoint: Point2, rotationRadians: number, pivot: Point2): Point2 {
	const cosine = Math.cos(rotationRadians);
	const sine = Math.sin(rotationRadians);
	return [pivot[0] + textPoint[0] * cosine - textPoint[1] * sine, pivot[1] + textPoint[0] * sine + textPoint[1] * cosine];
}

function isInside(point: Point2, triangle: Triangle2): boolean {
	const signs = triangle.map((start, index) => {
		const end = triangle[(index + 1) % 3] ?? start;
		return (end[0] - start[0]) * (point[1] - start[1]) - (end[1] - start[1]) * (point[0] - start[0]);
	});
	return signs.every((sign) => sign <= 0) || signs.every((sign) => sign >= 0);
}

// A small linear congruential generator (Numerical Recipes constants), so the cases never change.
function seededRandom(seed: number): () => number {
	let state = seed >>> 0;
	return () => {
		state = (Math.imul(state, 1_664_525) + 1_013_904_223) >>> 0;
		return state / 2 ** 32;
	};
}
