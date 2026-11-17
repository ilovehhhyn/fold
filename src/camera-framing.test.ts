// Invariant under test: the play camera looks from 80 degrees of elevation, and the fortune camera shows the fortune large with its lifted triangle in view.
//
// Oracle: an explicit pinhole projection written in this file, which shares no code with camera-framing.ts.

import assert from "node:assert/strict";

import { test } from "vitest";

import { cameraFieldOfViewDegrees, fortuneFraming, liftAngleDegrees, playFraming } from "./camera-framing";
import type { CameraFraming } from "./camera-framing";
import { computePose, innerTriangles, liftedCentreCorner, namedPoses, pocketTriangles, trianglePoints } from "./rig";
import type { Point } from "./rig";

const halfFieldTangent = Math.tan((cameraFieldOfViewDegrees * Math.PI) / 360);

test("the play camera looks down from 80 degrees with north at the top", () => {
	const { position, target } = playFraming();

	const height = position[1] - target[1];
	const southward = position[2] - target[2];
	assert.equal(position[0], target[0]);
	assert.ok(southward > 0, "the camera must stand south of the toy");
	assert.ok(Math.abs((Math.atan2(height, southward) * 180) / Math.PI - 80) < 1e-9);
});

test("the play camera keeps the whole toy inside the canvas in every named pose", () => {
	const framing = playFraming();

	for (const [name, offsets] of Object.entries(namedPoses)) {
		const pose = computePose(offsets);
		for (const triangle of [...innerTriangles, ...pocketTriangles]) {
			for (const corner of trianglePoints(pose, triangle.corners)) {
				const [x, y] = project(framing, corner);
				assert.ok(Math.abs(x) < 0.95 && Math.abs(y) < 0.95, `${name}: a corner lands at (${x.toFixed(2)}, ${y.toFixed(2)})`);
			}
		}
	}
});

for (const [panelIndex, triangle] of innerTriangles.entries()) {
	test(`the fortune camera for panel ${panelIndex + 1} shows the fortune across half the canvas, with the lifted triangle in view`, () => {
		const framing = fortuneFraming(panelIndex);
		const pose = computePose(namedPoses.reveal);
		const fortune = trianglePoints(pose, triangle.corners).map((corner) => project(framing, corner));
		const lifted = project(framing, liftedCentreCorner(pose, triangle, (liftAngleDegrees * Math.PI) / 180));

		const horizontal = fortune.map((point) => point[0]);
		const widthShare = (Math.max(...horizontal) - Math.min(...horizontal)) / 2;
		assert.ok(widthShare >= 0.5, `the fortune spans ${(widthShare * 100).toFixed(1)} percent of the canvas width`);
		for (const [x, y] of [...fortune, lifted]) {
			assert.ok(Math.abs(x) <= 0.95 && Math.abs(y) <= 0.95, `a corner lands at (${x.toFixed(2)}, ${y.toFixed(2)}), too close to the canvas edge`);
		}
	});
}

test("a panel index outside the paper is rejected", () => {
	assert.throws(() => fortuneFraming(8), { name: "RangeError", message: "panelIndex must be from 0 to 7, got 8" });
});

// Projects a point to normalised canvas coordinates: x and y from -1 to 1 across a square canvas.
function project(framing: CameraFraming, point: Point): readonly [number, number] {
	const forward = normalise(subtract(framing.target, framing.position));
	const right = normalise(cross(forward, [0, 1, 0]));
	const up = cross(right, forward);
	const relative = subtract(point, framing.position);
	const depth = dot(relative, forward);
	return [dot(relative, right) / (depth * halfFieldTangent), dot(relative, up) / (depth * halfFieldTangent)];
}

function subtract(left: Point, right: Point): Point {
	return [left[0] - right[0], left[1] - right[1], left[2] - right[2]];
}

function dot(left: Point, right: Point): number {
	return left[0] * right[0] + left[1] * right[1] + left[2] * right[2];
}

function cross(left: Point, right: Point): Point {
	return [left[1] * right[2] - left[2] * right[1], left[2] * right[0] - left[0] * right[2], left[0] * right[1] - left[1] * right[0]];
}

function normalise(vector: Point): Point {
	const length = Math.hypot(vector[0], vector[1], vector[2]);
	return [vector[0] / length, vector[1] / length, vector[2] / length];
}
