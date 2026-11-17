// Invariant under test: computePose moves the paper without stretching it, and matches the reference values.
//
// Oracle: the flat edge lengths of the paper (1, 1, sqrt(2)) and the reference positions in the
// task description, which were produced by the reference JavaScript implementation.
// Tolerance: absolute 1e-12 on edge lengths; absolute 5e-5 on the 4-decimal reference positions.

import assert from "node:assert/strict";

import { test } from "vitest";

import {
	computePose,
	cornerPosition,
	expandedPocketCorner,
	innerTriangles,
	liftedCentreCorner,
	namedPoses,
	pocketExpansionMax,
	pocketTriangles,
	trianglePoints,
} from "./rig";
import type { CornerName, Point, Pose } from "./rig";

const lengthTolerance = 1e-12;
const referenceTolerance = 5e-5;
const gridSteps = 20;
const trianglesPerPose = innerTriangles.length + pocketTriangles.length;
const edgesPerTriangle = 3;
const flatEdgeLengthsSorted = [1, 1, Math.SQRT2];

test("every triangle keeps its flat edge lengths across the whole input range", () => {
	let poseCount = 0;
	let worstError = 0;

	for (let stepX = 0; stepX <= gridSteps; stepX += 1) {
		for (let stepZ = 0; stepZ <= gridSteps; stepZ += 1) {
			const pose = computePose({ tipX: stepX / gridSteps, tipZ: stepZ / gridSteps });
			const { edgeCount, largestError } = largestEdgeLengthError(pose);
			assert.equal(edgeCount, trianglesPerPose * edgesPerTriangle);
			worstError = Math.max(worstError, largestError);
			poseCount += 1;
		}
	}

	assert.equal(poseCount, (gridSteps + 1) * (gridSteps + 1));
	assert.ok(worstError <= lengthTolerance, `worst edge length error is ${worstError}`);
});

test("the edge length check fails on a pose that stretches the paper", () => {
	// Witness: raising one tip by 1 percent stretches the triangles that meet at it.
	const pose = computePose(namedPoses.openNorthSouth);
	const [x, y, z] = pose.tips.northEast;
	const stretched: Pose = { ...pose, tips: { ...pose.tips, northEast: [x, y * 1.01, z] } };

	const { largestError } = largestEdgeLengthError(stretched);

	assert.ok(largestError > 1e-3, `a stretched pose must be detected, error was ${largestError}`);
});

const referencePositions: readonly (readonly [number, number, CornerName, Point])[] = [
	[0, 0, "tips.northEast", [0, 1.4142, 0]],
	[0, 0, "tips.southWest", [0, 1.4142, 0]],
	[0, 0, "mids.east", [0.7071, 0.7071, 0]],
	[0, 0, "pocketCorners.northEast", [0.9428, 0.9428, -0.9428]],
	[1, 1, "tips.northEast", [1, 0, -1]],
	[1, 1, "pocketCorners.northEast", [0, 0, 0]],
	[1, 1, "pocketCorners.southWest", [0, 0, 0]],
	[0.05, 0.75, "tips.northEast", [0.05, 1.1979, -0.75]],
	[0.05, 0.75, "mids.north", [0, 0.2247, -0.9744]],
	[0.05, 0.75, "mids.east", [0.586, 0.8103, 0]],
	[0.05, 0.75, "pocketCorners.northEast", [0.9222, 0.0935, -0.6108]],
];

for (const [tipX, tipZ, cornerName, expected] of referencePositions) {
	test(`${cornerName} at (${tipX}, ${tipZ}) matches the reference position`, () => {
		const actual = cornerPosition(computePose({ tipX, tipZ }), cornerName);

		assertClose(actual, expected, referenceTolerance, cornerName);
	});
}

test("the flat pose turns every number side straight up", () => {
	const pose = computePose({ tipX: 1, tipZ: 1 });

	for (const triangle of innerTriangles) {
		const normal = unitNormal(trianglePoints(pose, triangle.corners));
		assertClose(normal, [0, 1, 0], lengthTolerance, triangle.corners.join(" "));
	}
});

test("the coloured side of every pocket faces away from the centre in each folded pose", () => {
	for (const offsets of [namedPoses.closed, namedPoses.openNorthSouth, namedPoses.openEastWest]) {
		const pose = computePose(offsets);
		for (const triangle of pocketTriangles) {
			const normal = unitNormal(trianglePoints(pose, triangle.corners));
			const pocketCorner = pose.pocketCorners[triangle.pocket];
			const outwardness =
				normal[0] * pocketCorner[0] + normal[1] * pocketCorner[1] + normal[2] * pocketCorner[2];
			assert.ok(outwardness > 0.1, `${triangle.corners.join(" ")} has outwardness ${outwardness}`);
		}
	}
});

test("each open pose turns its two flaps toward the camera and leaves the other two shut", () => {
	const cases = [
		{ offsets: namedPoses.openNorthSouth, shownFlaps: ["east", "west"] },
		{ offsets: namedPoses.openEastWest, shownFlaps: ["north", "south"] },
	];

	for (const { offsets, shownFlaps } of cases) {
		const pose = computePose(offsets);
		for (const triangle of innerTriangles) {
			const upwardness = unitNormal(trianglePoints(pose, triangle.corners))[1];
			if (shownFlaps.includes(triangle.flap)) {
				assert.ok(upwardness > 0.35, `${triangle.flap} flap must face up, got ${upwardness}`);
			} else {
				assert.ok(Math.abs(upwardness) < 0.1, `${triangle.flap} flap must stay shut, got ${upwardness}`);
			}
		}
	}
});

test("a lifted number triangle keeps its size, starts at the centre and rises first", () => {
	const pose = computePose(namedPoses.reveal);

	for (const triangle of innerTriangles) {
		const [centre, second, third] = trianglePoints(pose, triangle.corners);
		const atRest = liftedCentreCorner(pose, triangle, 0);
		const slightlyLifted = liftedCentreCorner(pose, triangle, 0.1);
		const fullyLifted = liftedCentreCorner(pose, triangle, (150 * Math.PI) / 180);
		assertClose(atRest, centre, lengthTolerance, "corner at angle 0");
		assert.ok(slightlyLifted[1] > centre[1], `the corner of ${triangle.corners.join(" ")} must rise first`);
		const lengths = [distance(fullyLifted, second), distance(fullyLifted, third)].sort(compareNumbers);
		assert.ok(Math.abs((lengths[0] ?? Number.NaN) - 1) <= lengthTolerance, `short edge is ${lengths[0]}`);
		assert.ok(Math.abs((lengths[1] ?? Number.NaN) - Math.SQRT2) <= lengthTolerance, `long edge is ${lengths[1]}`);
		const horizontalReach = Math.hypot(fullyLifted[0], fullyLifted[2]);
		assert.ok(horizontalReach > 1, `the lifted corner must end outside the paper, reach ${horizontalReach}`);
	}
});

test("an expanded pocket corner moves straight away from the centre, by the stated share at most", () => {
	const corner = computePose(namedPoses.closed).pocketCorners.northEast;

	const atRest = expandedPocketCorner(corner, 0);
	const halfway = expandedPocketCorner(corner, 0.5);
	const full = expandedPocketCorner(corner, 1);

	assert.deepEqual(atRest, corner);
	const restLength = Math.hypot(...corner);
	assert.ok(Math.abs(Math.hypot(...halfway) / restLength - (1 + pocketExpansionMax / 2)) <= lengthTolerance);
	assert.ok(Math.abs(Math.hypot(...full) / restLength - (1 + pocketExpansionMax)) <= lengthTolerance);
	for (const index of [0, 1, 2] as const) {
		assert.ok(Math.abs(full[index] / corner[index] - (1 + pocketExpansionMax)) <= lengthTolerance, "the direction must not change");
	}
});

test("an expansion outside 0 to 1 is rejected", () => {
	const corner = computePose(namedPoses.closed).pocketCorners.southWest;

	for (const badValue of [-0.01, 1.01, Number.NaN, Number.POSITIVE_INFINITY]) {
		assert.throws(() => expandedPocketCorner(corner, badValue), {
			name: "RangeError",
			message: /^expansion must be a number from 0 to 1, got /,
		});
	}
});

test("offsets outside 0 to 1 are rejected with a message that names the fix", () => {
	for (const badValue of [-0.01, 1.01, Number.NaN, Number.POSITIVE_INFINITY]) {
		assert.throws(() => computePose({ tipX: badValue, tipZ: 0.5 }), {
			name: "RangeError",
			message: /^tipX must be a number from 0 to 1, got .*; clamp the animation value before calling computePose$/,
		});
		assert.throws(() => computePose({ tipX: 0.5, tipZ: badValue }), {
			name: "RangeError",
			message: /^tipZ must be a number from 0 to 1, got /,
		});
	}
});

function largestEdgeLengthError(pose: Pose): Readonly<{ edgeCount: number; largestError: number }> {
	let largestError = 0;
	let edgeCount = 0;
	for (const triangle of [...innerTriangles, ...pocketTriangles]) {
		const [first, second, third] = trianglePoints(pose, triangle.corners);
		const lengths = [distance(first, second), distance(second, third), distance(third, first)].sort(
			compareNumbers,
		);
		for (const [index, length] of lengths.entries()) {
			const expected = flatEdgeLengthsSorted[index] ?? Number.NaN;
			largestError = Math.max(largestError, Math.abs(length - expected));
			edgeCount += 1;
		}
	}
	return { edgeCount, largestError };
}

function assertClose(actual: Point, expected: Point, tolerance: number, label: string): void {
	for (const [index, component] of actual.entries()) {
		const difference = Math.abs(component - (expected[index] ?? Number.NaN));
		assert.ok(difference <= tolerance, `${label}[${index}] is ${component}, expected ${expected[index]}`);
	}
}

function unitNormal(points: readonly [Point, Point, Point]): Point {
	const [first, second, third] = points;
	const u = [second[0] - first[0], second[1] - first[1], second[2] - first[2]] as const;
	const v = [third[0] - first[0], third[1] - first[1], third[2] - first[2]] as const;
	const normal = [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]] as const;
	const length = Math.hypot(...normal);
	return [normal[0] / length, normal[1] / length, normal[2] / length];
}

function distance(left: Point, right: Point): number {
	return Math.hypot(left[0] - right[0], left[1] - right[1], left[2] - right[2]);
}

function compareNumbers(left: number, right: number): number {
	return left - right;
}
