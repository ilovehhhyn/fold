// Camera positions for the fortune teller: one that shows the whole toy and one that shows one fortune.
//
// The camera always looks from the south and from above, at a fixed elevation, so north stays at
// the top of the screen. Its axes in world coordinates, for elevation e, are:
//   right   = (1, 0, 0)
//   up      = (0, cos e, -sin e)
//   forward = (0, -sin e, -cos e)
// A point at camera-axis coordinates (a, b, depth) lands on the square canvas at
//   x = a / (depth * tan(fov / 2)),  y = b / (depth * tan(fov / 2)),  each from -1 to 1.
// Fortune framing solves for the camera distance and target at which the fortune triangle spans
// `fortuneWidthShare` of the canvas width and the region (fortune plus lifted triangle) is centred.
// It repeats two corrections, distance *= share / wanted and target += offset, until both settle.

import { computePose, innerTriangles, liftedCentreCorner, namedPoses, trianglePoints } from "./rig";
import type { Point } from "./rig";
import type { Point2 } from "./text-layout";

// Below about 75 degrees the near walls of the mouth turn away from the camera and hide a number.
export const cameraElevationDegrees = 80;
export const cameraFieldOfViewDegrees = 30;
// The task asks for a lift of about 150 degrees. At 150 the lifted corner leaves the canvas (it
// reaches 1.05 of the half-width) once the fortune spans half the canvas. At 130 it reaches 0.93.
export const liftAngleDegrees = 130;
// The fortune triangle must span at least half of the canvas width during the reveal.
const fortuneWidthShare = 0.51;
// The two corrections shrink the error by more than a factor of 3 per round, so 12 rounds
// leave less than 1e-5 of the canvas.
const fitRounds = 12;
// Half of the scene height that the play camera shows at the depth of its target, in paper units.
const playHalfExtent = 1.42;
const playTarget: Point = [0, 0.55, 0];

const elevationRadians = (cameraElevationDegrees * Math.PI) / 180;
const halfFieldTangent = Math.tan((cameraFieldOfViewDegrees * Math.PI) / 360);
const sine = Math.sin(elevationRadians);
const cosine = Math.cos(elevationRadians);

/** Where the camera stands and the point it looks at. */
export type CameraFraming = Readonly<{ position: Point; target: Point }>;

/** Returns the framing that shows the whole toy in the closed, open and reveal poses. */
export function playFraming(): CameraFraming {
	return framingAt(playTarget, playHalfExtent / halfFieldTangent);
}

/** Returns the framing that shows one fortune triangle and its lifted number triangle. */
export function fortuneFraming(panelIndex: number, liftDegrees: number = liftAngleDegrees): CameraFraming {
	const triangle = innerTriangles[panelIndex];
	if (triangle === undefined) {
		throw new RangeError(`panelIndex must be from 0 to ${innerTriangles.length - 1}, got ${panelIndex}`);
	}
	const pose = computePose(namedPoses.reveal);
	const fortuneCorners = trianglePoints(pose, triangle.corners);
	const region = [...fortuneCorners, liftedCentreCorner(pose, triangle, (liftDegrees * Math.PI) / 180)];
	let target: Point = [
		region.reduce((sum, point) => sum + point[0], 0) / region.length,
		region.reduce((sum, point) => sum + point[1], 0) / region.length,
		region.reduce((sum, point) => sum + point[2], 0) / region.length,
	];
	let distance = playHalfExtent / halfFieldTangent;
	for (let round = 0; round < fitRounds; round += 1) {
		const framing = framingAt(target, distance);
		const onCanvas = region.map((point) => projectToCanvas(framing, point));
		const share = extent(onCanvas.slice(0, fortuneCorners.length), 0) / 2;
		distance *= share / fortuneWidthShare;
		const shiftRight = middle(onCanvas, 0) * distance * halfFieldTangent;
		const shiftUp = middle(onCanvas, 1) * distance * halfFieldTangent;
		target = [target[0] + shiftRight, target[1] + shiftUp * cosine, target[2] - shiftUp * sine];
	}
	return framingAt(target, distance);
}

/** Returns where a point appears on screen in a parallel projection: x right, y down, in paper units. */
export function projectToScreen(point: Point): Point2 {
	const [right, up] = toCameraAxes(point);
	return [right, -up];
}

function framingAt(target: Point, distance: number): CameraFraming {
	return {
		position: [target[0], target[1] + distance * sine, target[2] + distance * cosine],
		target,
	};
}

// Returns the canvas position of a point, x and y from -1 to 1, as the perspective camera sees it.
function projectToCanvas(framing: CameraFraming, point: Point): Point2 {
	const relative: Point = [
		point[0] - framing.position[0],
		point[1] - framing.position[1],
		point[2] - framing.position[2],
	];
	const [right, up, depth] = toCameraAxes(relative);
	return [right / (depth * halfFieldTangent), up / (depth * halfFieldTangent)];
}

function toCameraAxes(point: Point): Point {
	return [point[0], point[1] * cosine - point[2] * sine, -point[1] * sine - point[2] * cosine];
}

function extent(points: readonly Point2[], axis: 0 | 1): number {
	const values = points.map((point) => point[axis]);
	return Math.max(...values) - Math.min(...values);
}

function middle(points: readonly Point2[], axis: 0 | 1): number {
	const values = points.map((point) => point[axis]);
	return (Math.max(...values) + Math.min(...values)) / 2;
}
