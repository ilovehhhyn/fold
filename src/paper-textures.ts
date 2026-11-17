// Draws the label or fortune of one paper triangle on a canvas and wraps it as a Three.js texture.

import { CanvasTexture, SRGBColorSpace } from "three";

import { fitTextInTriangle, layoutTriangleOnCanvas } from "./text-layout";
import type { Point2, Triangle2 } from "./text-layout";

export const paperFontFamily = "Patrick Hand";
export const paperFrontColour = "#fbf6ea";
export const paperInkColour = "#2b2620";
const lightInkColour = "#ffffff";
const canvasSizePixels = 512;
const paddingPixels = 6;
const marginPixels = 30;
const fontSizeMinPixels = 12;
const lineHeightRatio = 1.08;
// The font has one weight. A thin outline in the ink colour makes it heavier, like a marker pen.
const strokeWidthRatio = 0.035;
// Above this relative luminance, dark ink has more contrast than white ink (WCAG contrast formula).
const darkInkLuminanceMin = 0.179;

export type TriangleTextOptions = Readonly<{
	text: string;
	backgroundColour: string;
	/** The triangle as the camera sees it in the pose where the player reads it. */
	screenCorners: Triangle2;
	rightAngleIndex: 0 | 1 | 2;
	fontSizeMaxPixels: number;
}>;

/** A texture with one triangle of text, and the texture coordinate of each triangle corner. */
export type TriangleTexture = Readonly<{ texture: CanvasTexture; uvs: Triangle2 }>;

/** Returns a texture that shows the text upright, inside the triangle, in its reading pose. */
export function createTriangleTexture(options: TriangleTextOptions): TriangleTexture {
	const canvas = document.createElement("canvas");
	canvas.width = canvasSizePixels;
	canvas.height = canvasSizePixels;
	const context = canvas.getContext("2d");
	if (context === null) {
		throw new Error("a 2D canvas context is required to draw text on the paper");
	}
	const layout = layoutTriangleOnCanvas({
		canvasSizePixels,
		paddingPixels,
		rightAngleIndex: options.rightAngleIndex,
		screenCorners: options.screenCorners,
	});
	const fitted = fitTextInTriangle({
		canvasCorners: layout.canvasCorners,
		fontSizeMaxPixels: options.fontSizeMaxPixels,
		fontSizeMinPixels,
		lineHeightRatio,
		marginPixels,
		measureWidth: (text, fontSizePixels) => {
			context.font = fontDeclaration(fontSizePixels);
			return context.measureText(text).width;
		},
		rotationRadians: layout.rotationRadians,
		text: options.text,
	});
	context.fillStyle = options.backgroundColour;
	context.fillRect(0, 0, canvasSizePixels, canvasSizePixels);
	context.translate(fitted.pivot[0], fitted.pivot[1]);
	context.rotate(layout.rotationRadians);
	context.font = fontDeclaration(fitted.fontSizePixels);
	const inkColour = inkColourFor(options.backgroundColour);
	context.fillStyle = inkColour;
	context.strokeStyle = inkColour;
	context.lineWidth = fitted.fontSizePixels * strokeWidthRatio;
	context.lineJoin = "round";
	context.textAlign = "center";
	context.textBaseline = "middle";
	for (const line of fitted.lines) {
		context.fillText(line.text, line.offsetX, line.offsetY);
		context.strokeText(line.text, line.offsetX, line.offsetY);
	}
	const texture = new CanvasTexture(canvas);
	texture.colorSpace = SRGBColorSpace;
	texture.anisotropy = 8;
	const [first, second, third] = layout.canvasCorners;
	return { texture, uvs: [toTextureCoordinate(first), toTextureCoordinate(second), toTextureCoordinate(third)] };
}

/** Returns dark ink for a light colour and white ink for a dark colour. */
export function inkColourFor(backgroundColour: string): string {
	const luminance =
		0.2126 * linearChannel(backgroundColour, 1) +
		0.7152 * linearChannel(backgroundColour, 3) +
		0.0722 * linearChannel(backgroundColour, 5);
	return luminance > darkInkLuminanceMin ? paperInkColour : lightInkColour;
}

// Returns one colour channel of `#rrggbb` in linear light, as the sRGB standard defines it.
function linearChannel(colour: string, start: 1 | 3 | 5): number {
	const value = Number.parseInt(colour.slice(start, start + 2), 16) / 255;
	return value <= 0.039_28 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
}

function fontDeclaration(fontSizePixels: number): string {
	return `${fontSizePixels}px "${paperFontFamily}", sans-serif`;
}

// A canvas texture is flipped vertically by default, so canvas y = 0 is texture v = 1.
function toTextureCoordinate(canvasPoint: Point2): Point2 {
	return [canvasPoint[0] / canvasSizePixels, 1 - canvasPoint[1] / canvasSizePixels];
}
