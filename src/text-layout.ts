// Places text inside a paper triangle: where the triangle sits on its texture canvas, how the text turns, and where each line goes.
//
// All coordinates have x to the right and y down, as on a canvas and on a screen.
// Turning rule: the canvas-to-screen map is affine, screen = L * canvas + constant. L splits
// into a rotation and a stretch, L = R(phi) * P with P symmetric (polar decomposition), where
//   phi = atan2(L21 - L12, L11 + L22).
// The text is turned by -phi on the canvas. On a slanted triangle the stretch P then tilts the
// baseline and the upright strokes by equal and opposite amounts, so neither is far from upright.
// Mirror rule: the triangle is placed on the canvas with the same handedness as on screen, so
// det(L) > 0 and the text is never mirrored.

/** A point on a canvas or a screen: x to the right, y down. */
export type Point2 = readonly [x: number, y: number];

export type Triangle2 = readonly [Point2, Point2, Point2];

/** Where a triangle sits on its canvas and the angle by which its text is turned, in radians. */
export type TriangleCanvasLayout = Readonly<{ canvasCorners: Triangle2; rotationRadians: number }>;

export type TriangleCanvasOptions = Readonly<{
	/** The triangle as the camera sees it in the pose where the player reads it. */
	screenCorners: Triangle2;
	/** Index of the corner with the right angle; every paper triangle is a right isosceles triangle. */
	rightAngleIndex: 0 | 1 | 2;
	canvasSizePixels: number;
	paddingPixels: number;
}>;

/** One line of fitted text; offsets are in the turned text frame, relative to the pivot. */
export type TextLine = Readonly<{ text: string; offsetX: number; offsetY: number }>;

export type FittedText = Readonly<{ fontSizePixels: number; pivot: Point2; lines: readonly TextLine[] }>;

export type FitTextOptions = Readonly<{
	text: string;
	canvasCorners: Triangle2;
	rotationRadians: number;
	marginPixels: number;
	fontSizeMaxPixels: number;
	fontSizeMinPixels: number;
	lineHeightRatio: number;
	measureWidth: (text: string, fontSizePixels: number) => number;
}>;

// Each try is 4 percent smaller than the one before, so the chosen size is within 4 percent
// of the largest size that fits.
const fontSizeStepRatio = 0.96;
const lineCountMax = 8;

// Whether a word that is wider than its line may be cut in two.
type WordBreaking = "never" | "whenTooWide";
// A triangle that covers less than this share of a unit screen square is seen edge-on.
const screenAreaMin = 1e-9;

/** Returns the canvas position of a triangle and the text direction that reads upright on screen. */
export function layoutTriangleOnCanvas(options: TriangleCanvasOptions): TriangleCanvasLayout {
	const { canvasSizePixels, paddingPixels, rightAngleIndex, screenCorners } = options;
	const far = canvasSizePixels - paddingPixels;
	const rightAngleSpot: Point2 = [paddingPixels, far];
	const alongX: Point2 = [far, far];
	const alongY: Point2 = [paddingPixels, paddingPixels];
	const screenArea = signedDoubleArea(screenCorners);
	if (Math.abs(screenArea) < screenAreaMin) {
		throw new Error("a text triangle is edge-on in its reading pose; choose a pose in which the camera sees its face");
	}
	const placements: readonly Triangle2[] = [
		placeCorners(rightAngleIndex, rightAngleSpot, alongX, alongY),
		placeCorners(rightAngleIndex, rightAngleSpot, alongY, alongX),
	];
	const canvasCorners = placements.find((corners) => signedDoubleArea(corners) * screenArea > 0);
	if (canvasCorners === undefined) {
		throw new Error("one of the two canvas placements always has the handedness of the screen triangle");
	}
	return { canvasCorners, rotationRadians: uprightRotation(canvasCorners, screenCorners) };
}

/**
 * Returns the largest text that fits inside the triangle, as centred lines around the incentre.
 *
 * Words stay whole if the text fits that way at any allowed size. Only a text that cannot fit
 * with whole words, such as one very long word, has words cut at the end of a line.
 */
export function fitTextInTriangle(options: FitTextOptions): FittedText {
	const { canvasCorners, marginPixels, rotationRadians } = options;
	const pivot = incentre(canvasCorners);
	const inradius = Math.abs(signedDoubleArea(canvasCorners)) / perimeter(canvasCorners);
	if (marginPixels >= inradius) {
		throw new Error(`text margin must be smaller than the inradius ${inradius.toFixed(1)}, got ${marginPixels}`);
	}
	const shrink = 1 - marginPixels / inradius;
	const polygon = canvasCorners.map((corner) =>
		rotate([(corner[0] - pivot[0]) * shrink, (corner[1] - pivot[1]) * shrink], -rotationRadians),
	);
	const words = options.text.split(/\s+/u).filter((word) => word !== "");
	if (words.length === 0) {
		throw new Error("text to fit must contain at least one word");
	}
	for (const wordBreaking of ["never", "whenTooWide"] as const) {
		let fontSizePixels = options.fontSizeMaxPixels;
		while (fontSizePixels >= options.fontSizeMinPixels) {
			const lines = layoutLines(words, polygon, fontSizePixels, options, wordBreaking);
			if (lines !== undefined) {
				return { fontSizePixels, pivot, lines };
			}
			fontSizePixels *= fontSizeStepRatio;
		}
	}
	throw new Error(
		`text ${JSON.stringify(options.text)} does not fit at ${options.fontSizeMinPixels} pixels; shorten the text`,
	);
}

function placeCorners(rightAngleIndex: 0 | 1 | 2, rightAngleSpot: Point2, first: Point2, second: Point2): Triangle2 {
	if (rightAngleIndex === 0) {
		return [rightAngleSpot, first, second];
	}
	if (rightAngleIndex === 1) {
		return [first, rightAngleSpot, second];
	}
	return [first, second, rightAngleSpot];
}

// Builds L = S * C^-1 from the edge vectors of the screen triangle (columns of S) and of the
// canvas triangle (columns of C), then returns minus its polar rotation angle.
function uprightRotation(canvasCorners: Triangle2, screenCorners: Triangle2): number {
	const [screenU, screenV] = edgesFromFirst(screenCorners);
	const [canvasU, canvasV] = edgesFromFirst(canvasCorners);
	const determinant = canvasU[0] * canvasV[1] - canvasV[0] * canvasU[1];
	const l11 = (screenU[0] * canvasV[1] - screenV[0] * canvasU[1]) / determinant;
	const l12 = (screenV[0] * canvasU[0] - screenU[0] * canvasV[0]) / determinant;
	const l21 = (screenU[1] * canvasV[1] - screenV[1] * canvasU[1]) / determinant;
	const l22 = (screenV[1] * canvasU[0] - screenU[1] * canvasV[0]) / determinant;
	return -Math.atan2(l21 - l12, l11 + l22);
}

function layoutLines(
	words: readonly string[],
	polygon: readonly Point2[],
	fontSizePixels: number,
	options: FitTextOptions,
	wordBreaking: WordBreaking,
): readonly TextLine[] | undefined {
	const lineHeight = fontSizePixels * options.lineHeightRatio;
	const measure = (text: string): number => options.measureWidth(text, fontSizePixels);
	for (let lineCount = 1; lineCount <= lineCountMax; lineCount += 1) {
		const lines = fillBands(words, polygon, { lineCount, lineHeight, measure, wordBreaking });
		if (lines !== undefined) {
			return lines;
		}
	}
	return undefined;
}

type BandOptions = Readonly<{
	lineCount: number;
	lineHeight: number;
	measure: (text: string) => number;
	wordBreaking: WordBreaking;
}>;

// Fills `lineCount` bands that are centred on the pivot, top to bottom, with as many words as
// each band holds. Fails if a band cannot hold its first word or if words are left over.
function fillBands(
	allWords: readonly string[],
	polygon: readonly Point2[],
	options: BandOptions,
): readonly TextLine[] | undefined {
	const { lineCount, lineHeight, measure, wordBreaking } = options;
	const words = [...allWords];
	const lines: TextLine[] = [];
	let nextWord = 0;
	for (let band = 0; band < lineCount && nextWord < words.length; band += 1) {
		const top = (band - lineCount / 2) * lineHeight;
		const span = intersectSpans(spanAt(polygon, top), spanAt(polygon, top + lineHeight));
		if (span === undefined) {
			return undefined;
		}
		let text = "";
		while (nextWord < words.length) {
			const candidate = text === "" ? String(words[nextWord]) : `${text} ${words[nextWord]}`;
			if (measure(candidate) > span[1] - span[0]) {
				break;
			}
			text = candidate;
			nextWord += 1;
		}
		if (text === "" && wordBreaking === "whenTooWide") {
			const [head, rest] = splitToFit(String(words[nextWord]), span[1] - span[0], measure);
			text = head;
			words[nextWord] = rest;
		}
		if (text === "") {
			return undefined;
		}
		lines.push({ text, offsetX: (span[0] + span[1]) / 2, offsetY: top + lineHeight / 2 });
	}
	return nextWord === words.length ? lines : undefined;
}

// Cuts a word after the last character that still fits the width. The head is empty if not
// even one character fits.
function splitToFit(word: string, width: number, measure: (text: string) => number): readonly [string, string] {
	const characters = Array.from(word);
	let count = 0;
	while (count < characters.length - 1 && measure(characters.slice(0, count + 1).join("")) <= width) {
		count += 1;
	}
	return [characters.slice(0, count).join(""), characters.slice(count).join("")];
}

// Returns the horizontal extent of a convex polygon at height y, or undefined outside it.
function spanAt(polygon: readonly Point2[], y: number): Point2 | undefined {
	let left = Number.POSITIVE_INFINITY;
	let right = Number.NEGATIVE_INFINITY;
	for (const [index, start] of polygon.entries()) {
		const end = polygon[(index + 1) % polygon.length] ?? start;
		const crosses = (start[1] - y) * (end[1] - y) <= 0 && start[1] !== end[1];
		if (!crosses) {
			continue;
		}
		const x = start[0] + ((y - start[1]) / (end[1] - start[1])) * (end[0] - start[0]);
		left = Math.min(left, x);
		right = Math.max(right, x);
	}
	return left <= right ? [left, right] : undefined;
}

function intersectSpans(first: Point2 | undefined, second: Point2 | undefined): Point2 | undefined {
	if (first === undefined || second === undefined) {
		return undefined;
	}
	const left = Math.max(first[0], second[0]);
	const right = Math.min(first[1], second[1]);
	return left < right ? [left, right] : undefined;
}

function incentre(triangle: Triangle2): Point2 {
	const [a, b, c] = triangle;
	const lengthA = distance(b, c);
	const lengthB = distance(c, a);
	const lengthC = distance(a, b);
	const total = lengthA + lengthB + lengthC;
	return [
		(lengthA * a[0] + lengthB * b[0] + lengthC * c[0]) / total,
		(lengthA * a[1] + lengthB * b[1] + lengthC * c[1]) / total,
	];
}

function perimeter(triangle: Triangle2): number {
	const [a, b, c] = triangle;
	return distance(a, b) + distance(b, c) + distance(c, a);
}

function signedDoubleArea(triangle: Triangle2): number {
	const [u, v] = edgesFromFirst(triangle);
	return u[0] * v[1] - v[0] * u[1];
}

function edgesFromFirst(triangle: Triangle2): readonly [Point2, Point2] {
	const [first, second, third] = triangle;
	return [
		[second[0] - first[0], second[1] - first[1]],
		[third[0] - first[0], third[1] - first[1]],
	];
}

function rotate(point: Point2, angleRadians: number): Point2 {
	const cosine = Math.cos(angleRadians);
	const sine = Math.sin(angleRadians);
	return [point[0] * cosine - point[1] * sine, point[0] * sine + point[1] * cosine];
}

function distance(left: Point2, right: Point2): number {
	return Math.hypot(left[0] - right[0], left[1] - right[1]);
}
