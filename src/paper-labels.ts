// Writes a configuration onto the paper: pocket colours, number labels and fortunes.
//
// Each text is laid out for the pose in which the player reads it: a number label in the open
// pose that shows its triangle, and a fortune in the reveal pose. Pockets carry a colour only;
// their label is counted by the game but is not drawn.

import { projectToScreen } from "./camera-framing";
import type { FortuneTellerConfig } from "./config";
import type { PanelLayout } from "./game";
import type { PaperMeshes } from "./paper-meshes";
import { createTriangleTexture, paperFrontColour } from "./paper-textures";
import { computePose, innerTriangles, namedPoses, pocketTriangles, quadrants, trianglePoints } from "./rig";
import type { CornerTriple, TipOffsets } from "./rig";

const panelLabelFontSizeMaxPixels = 170;
const fortuneFontSizeMaxPixels = 72;

/** Redraws every colour and every text on the paper from the configuration. */
export function applyConfigToPaper(meshes: PaperMeshes, config: FortuneTellerConfig, layout: PanelLayout): void {
	for (const [index, triangle] of pocketTriangles.entries()) {
		const pocket = config.pockets[quadrants.findIndex((quadrant) => quadrant.name === triangle.pocket)];
		if (pocket === undefined) {
			throw new Error(`config must have a pocket for ${triangle.pocket}`);
		}
		meshes.setPocketColour(index, pocket.colour);
	}
	drawPanelsOnTriangles(meshes, config, layout, innerTriangles.map((_triangle, index) => index));
}

/** Redraws the label and the fortune of the listed number triangles for a layout. */
export function drawPanelsOnTriangles(
	meshes: PaperMeshes,
	config: FortuneTellerConfig,
	layout: PanelLayout,
	triangleIndexes: readonly number[],
): void {
	for (const triangleIndex of triangleIndexes) {
		const triangle = innerTriangles[triangleIndex];
		const panelIndex = layout[triangleIndex];
		const panel = panelIndex === undefined ? undefined : config.panels[panelIndex];
		if (triangle === undefined || panel === undefined) {
			throw new Error(`layout must name a panel for number triangle ${triangleIndex}, got ${String(panelIndex)}`);
		}
		const isShownByNorthSouthOpening = triangle.flap === "east" || triangle.flap === "west";
		const labelPose = isShownByNorthSouthOpening ? namedPoses.openNorthSouth : namedPoses.openEastWest;
		meshes.setPanelLabel(triangleIndex, textureFor(panel.label, triangle.corners, labelPose, panelLabelFontSizeMaxPixels));
		meshes.setFortune(triangleIndex, textureFor(panel.fortune, triangle.corners, namedPoses.reveal, fortuneFontSizeMaxPixels));
	}
}

function textureFor(
	text: string,
	corners: CornerTriple,
	readingPose: TipOffsets,
	fontSizeMaxPixels: number,
): ReturnType<typeof createTriangleTexture> {
	const [first, second, third] = trianglePoints(computePose(readingPose), corners);
	return createTriangleTexture({
		backgroundColour: paperFrontColour,
		fontSizeMaxPixels,
		rightAngleIndex: rightAngleIndexOf(corners),
		screenCorners: [projectToScreen(first), projectToScreen(second), projectToScreen(third)],
		text,
	});
}

// Every paper triangle has its right angle at its mid corner.
function rightAngleIndexOf(corners: CornerTriple): 0 | 1 | 2 {
	if (corners[0].startsWith("mids.")) {
		return 0;
	}
	if (corners[1].startsWith("mids.")) {
		return 1;
	}
	if (corners[2].startsWith("mids.")) {
		return 2;
	}
	throw new Error(`triangle ${corners.join(" ")} must have a mid corner`);
}
