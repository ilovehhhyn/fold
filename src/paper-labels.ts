// Writes a configuration onto the paper: pocket colours, pocket labels, number labels and fortunes.
//
// Each text is laid out for the pose in which the player reads it: a pocket label in the closed
// pose, a number label in the open pose that shows its flap, and a fortune in the reveal pose.

import { projectToScreen } from "./camera-framing";
import type { FortuneTellerConfig } from "./config";
import type { PaperMeshes } from "./paper-meshes";
import { createTriangleTexture, paperFrontColour } from "./paper-textures";
import { computePose, innerTriangles, namedPoses, pocketTriangles, quadrants, trianglePoints } from "./rig";
import type { CornerTriple, TipOffsets } from "./rig";

const panelLabelFontSizeMaxPixels = 170;
const pocketLabelFontSizeMaxPixels = 120;
const fortuneFontSizeMaxPixels = 72;

/** Redraws every text and colour on the paper from the configuration. */
export function applyConfigToPaper(meshes: PaperMeshes, config: FortuneTellerConfig): void {
	for (const [index, triangle] of innerTriangles.entries()) {
		const panel = config.panels[index];
		if (panel === undefined) {
			throw new Error(`config must have a panel for number triangle ${index + 1}`);
		}
		const isShownByNorthSouthOpening = triangle.flap === "east" || triangle.flap === "west";
		const labelPose = isShownByNorthSouthOpening ? namedPoses.openNorthSouth : namedPoses.openEastWest;
		meshes.setPanelLabel(index, textureFor(panel.label, paperFrontColour, triangle.corners, labelPose, panelLabelFontSizeMaxPixels));
		meshes.setFortune(index, textureFor(panel.fortune, paperFrontColour, triangle.corners, namedPoses.reveal, fortuneFontSizeMaxPixels));
	}
	for (const [index, triangle] of pocketTriangles.entries()) {
		const pocket = config.pockets[quadrants.findIndex((quadrant) => quadrant.name === triangle.pocket)];
		if (pocket === undefined) {
			throw new Error(`config must have a pocket for ${triangle.pocket}`);
		}
		if (carriesPocketLabel(triangle.corners)) {
			meshes.setPocketLabel(index, textureFor(pocket.label, pocket.colour, triangle.corners, namedPoses.closed, pocketLabelFontSizeMaxPixels));
		} else {
			meshes.setPocketColour(index, pocket.colour);
		}
	}
}

// In the closed pose the pocket triangle beside a north or south mid has a wide horizontal
// edge on screen, so a horizontal word fits it better than its neighbour.
function carriesPocketLabel(corners: CornerTriple): boolean {
	return corners.includes("mids.north") || corners.includes("mids.south");
}

function textureFor(
	text: string,
	backgroundColour: string,
	corners: CornerTriple,
	readingPose: TipOffsets,
	fontSizeMaxPixels: number,
): ReturnType<typeof createTriangleTexture> {
	const [first, second, third] = trianglePoints(computePose(readingPose), corners);
	return createTriangleTexture({
		backgroundColour,
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
