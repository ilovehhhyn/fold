// Computes the corner positions of a paper fortune teller, as rigid triangles, from two tip offsets.
//
// Model. The folded square has half-side 1. It is creased along both diagonals and both
// midlines, which gives 8 right triangles around the centre. Axes: x east, y up, z south.
//   centre        = (0, 0, 0)                          bottom of the mouth
//   tip(sx, sz)   = (sx * tipX, tipY, sz * tipZ)       the 4 corners of the square; sx, sz are -1 or +1
//   tipY          = sqrt(2 - tipX^2 - tipZ^2)          keeps |centre - tip| = sqrt(2)
//   midEast       = (cos a, sin a, 0)                  midpoint of the east side, |centre - mid| = 1
//   a             = atan2(tipY, tipX) - acos(1 / sqrt(2 - tipZ^2))    keeps |mid - tip| = 1
//   midSouth      = (0, sin b, cos b)
//   b             = atan2(tipY, tipZ) - acos(1 / sqrt(2 - tipX^2))
//   pocketCorner  = mirror image of the centre in the plane through (mid, tip, mid) of one quadrant
// Contract: 0 <= tipX <= 1 and 0 <= tipZ <= 1. (0, 0) is fully closed and (1, 1) is flat.
// Every triangle keeps its flat edge lengths (1, 1, sqrt(2)) for every input in that range.

const tipOffsetMin = 0;
const tipOffsetMax = 1;
const diagonalSquared = 2;

export type Point = readonly [x: number, y: number, z: number];

export type QuadrantName = "northEast" | "northWest" | "southEast" | "southWest";

export type SideName = "east" | "north" | "south" | "west";

export type CornerName =
	| "centre"
	| `mids.${SideName}`
	| `pocketCorners.${QuadrantName}`
	| `tips.${QuadrantName}`;

/** The two numbers that describe a whole pose; each is the distance of the tips from one axis. */
export type TipOffsets = Readonly<{ tipX: number; tipZ: number }>;

/** Every corner position of the paper in one pose. */
export type Pose = Readonly<{
	centre: Point;
	mids: Readonly<Record<SideName, Point>>;
	pocketCorners: Readonly<Record<QuadrantName, Point>>;
	tips: Readonly<Record<QuadrantName, Point>>;
}>;

type Quadrant = Readonly<{
	name: QuadrantName;
	signX: -1 | 1;
	signZ: -1 | 1;
	midAlongZ: SideName;
	midAlongX: SideName;
}>;

export type CornerTriple = readonly [CornerName, CornerName, CornerName];

export type InnerTriangle = Readonly<{ flap: SideName; corners: CornerTriple }>;

export type PocketTriangle = Readonly<{ pocket: QuadrantName; corners: CornerTriple }>;

export const quadrants: readonly Quadrant[] = [
	{ name: "northEast", signX: 1, signZ: -1, midAlongZ: "north", midAlongX: "east" },
	{ name: "southEast", signX: 1, signZ: 1, midAlongZ: "south", midAlongX: "east" },
	{ name: "southWest", signX: -1, signZ: 1, midAlongZ: "south", midAlongX: "west" },
	{ name: "northWest", signX: -1, signZ: -1, midAlongZ: "north", midAlongX: "west" },
];

// The 8 number triangles, clockwise from north when seen from above. Corner order makes the
// number side face +y in the flat pose.
export const innerTriangles: readonly InnerTriangle[] = [
	{ flap: "north", corners: ["centre", "tips.northEast", "mids.north"] },
	{ flap: "east", corners: ["centre", "mids.east", "tips.northEast"] },
	{ flap: "east", corners: ["centre", "tips.southEast", "mids.east"] },
	{ flap: "south", corners: ["centre", "mids.south", "tips.southEast"] },
	{ flap: "south", corners: ["centre", "tips.southWest", "mids.south"] },
	{ flap: "west", corners: ["centre", "mids.west", "tips.southWest"] },
	{ flap: "west", corners: ["centre", "tips.northWest", "mids.west"] },
	{ flap: "north", corners: ["centre", "mids.north", "tips.northWest"] },
];

// The 8 outside triangles, two per finger pocket. Corner order makes the coloured side face
// away from the centre.
export const pocketTriangles: readonly PocketTriangle[] = [
	{ pocket: "northEast", corners: ["pocketCorners.northEast", "mids.north", "tips.northEast"] },
	{ pocket: "northEast", corners: ["pocketCorners.northEast", "tips.northEast", "mids.east"] },
	{ pocket: "southEast", corners: ["pocketCorners.southEast", "mids.east", "tips.southEast"] },
	{ pocket: "southEast", corners: ["pocketCorners.southEast", "tips.southEast", "mids.south"] },
	{ pocket: "southWest", corners: ["pocketCorners.southWest", "mids.south", "tips.southWest"] },
	{ pocket: "southWest", corners: ["pocketCorners.southWest", "tips.southWest", "mids.west"] },
	{ pocket: "northWest", corners: ["pocketCorners.northWest", "mids.west", "tips.northWest"] },
	{ pocket: "northWest", corners: ["pocketCorners.northWest", "tips.northWest", "mids.north"] },
];

// Start values from the task description. The pinched offset stays above 0 so that the two
// halves of a shut flap never coincide.
export const namedPoses = {
	closed: { tipX: 0.05, tipZ: 0.05 },
	openEastWest: { tipX: 0.75, tipZ: 0.05 },
	openNorthSouth: { tipX: 0.05, tipZ: 0.75 },
	reveal: { tipX: 0.9, tipZ: 0.9 },
} as const satisfies Readonly<Record<string, TipOffsets>>;

/** Returns every corner position of the fortune teller for one pair of tip offsets. */
export function computePose(offsets: TipOffsets): Pose {
	const tipX = requireTipOffset("tipX", offsets.tipX);
	const tipZ = requireTipOffset("tipZ", offsets.tipZ);
	const tipY = Math.sqrt(diagonalSquared - tipX * tipX - tipZ * tipZ);
	const eastAngle = Math.atan2(tipY, tipX) - Math.acos(1 / Math.sqrt(diagonalSquared - tipZ * tipZ));
	const southAngle = Math.atan2(tipY, tipZ) - Math.acos(1 / Math.sqrt(diagonalSquared - tipX * tipX));
	const mids: Record<SideName, Point> = {
		north: [0, Math.sin(southAngle), -Math.cos(southAngle)],
		east: [Math.cos(eastAngle), Math.sin(eastAngle), 0],
		south: [0, Math.sin(southAngle), Math.cos(southAngle)],
		west: [-Math.cos(eastAngle), Math.sin(eastAngle), 0],
	};
	const tip = (quadrant: Quadrant): Point => [quadrant.signX * tipX, tipY, quadrant.signZ * tipZ];
	const pocketCorner = (quadrant: Quadrant): Point =>
		mirrorOriginInPlane(mids[quadrant.midAlongZ], tip(quadrant), mids[quadrant.midAlongX]);
	const [northEast, southEast, southWest, northWest] = quadrants;
	if (northEast === undefined || southEast === undefined || southWest === undefined || northWest === undefined) {
		throw new Error("the quadrant table must list four quadrants");
	}
	return {
		centre: [0, 0, 0],
		mids,
		pocketCorners: {
			northEast: pocketCorner(northEast),
			northWest: pocketCorner(northWest),
			southEast: pocketCorner(southEast),
			southWest: pocketCorner(southWest),
		},
		tips: {
			northEast: tip(northEast),
			northWest: tip(northWest),
			southEast: tip(southEast),
			southWest: tip(southWest),
		},
	};
}

/** Returns the position of one named corner in a pose. */
export function cornerPosition(pose: Pose, cornerName: CornerName): Point {
	return cornerTable(pose)[cornerName];
}

/** Returns the three corner positions of a triangle, in its listed corner order. */
export function trianglePoints(pose: Pose, corners: CornerTriple): readonly [Point, Point, Point] {
	const table = cornerTable(pose);
	return [table[corners[0]], table[corners[1]], table[corners[2]]];
}

/**
 * Returns the centre corner of a number triangle after the triangle turns about its outer edge.
 *
 * The outer edge runs from the mid to the tip of the triangle. The corner moves on a circle:
 *   lifted = mid + cos(angle) * offset + sin(angle) * (axis x offset),  offset = centre - mid
 * The axis direction is chosen so that a small positive angle raises the corner on the number side.
 */
export function liftedCentreCorner(pose: Pose, triangle: InnerTriangle, angleRadians: number): Point {
	const [centre, second, third] = trianglePoints(pose, triangle.corners);
	const secondIsMid = triangle.corners[1].startsWith("mids.");
	const mid = secondIsMid ? second : third;
	const tip = secondIsMid ? third : second;
	const numberSideNormal = cross(subtract(second, centre), subtract(third, centre));
	const offset = subtract(centre, mid);
	const edge = normalize(subtract(tip, mid));
	const sideways = cross(edge, offset);
	const sign = dot(sideways, numberSideNormal) >= 0 ? 1 : -1;
	const cosine = Math.cos(angleRadians);
	const sine = sign * Math.sin(angleRadians);
	// The offset is perpendicular to the edge, because the triangle has its right angle at the mid.
	return [
		mid[0] + cosine * offset[0] + sine * sideways[0],
		mid[1] + cosine * offset[1] + sine * sideways[1],
		mid[2] + cosine * offset[2] + sine * sideways[2],
	];
}

function requireTipOffset(name: "tipX" | "tipZ", value: number): number {
	const isInRange = Number.isFinite(value) && value >= tipOffsetMin && value <= tipOffsetMax;
	if (!isInRange) {
		throw new RangeError(
			`${name} must be a number from ${tipOffsetMin} to ${tipOffsetMax}, got ${value}; clamp the animation value before calling computePose`,
		);
	}
	return value;
}

function cornerTable(pose: Pose): Readonly<Record<CornerName, Point>> {
	return {
		centre: pose.centre,
		"mids.east": pose.mids.east,
		"mids.north": pose.mids.north,
		"mids.south": pose.mids.south,
		"mids.west": pose.mids.west,
		"pocketCorners.northEast": pose.pocketCorners.northEast,
		"pocketCorners.northWest": pose.pocketCorners.northWest,
		"pocketCorners.southEast": pose.pocketCorners.southEast,
		"pocketCorners.southWest": pose.pocketCorners.southWest,
		"tips.northEast": pose.tips.northEast,
		"tips.northWest": pose.tips.northWest,
		"tips.southEast": pose.tips.southEast,
		"tips.southWest": pose.tips.southWest,
	};
}

// The mirror image of the origin in the plane through three points is 2 * (n . first) * n,
// where n is the unit normal of the plane.
function mirrorOriginInPlane(first: Point, second: Point, third: Point): Point {
	const unitNormal = normalize(cross(subtract(second, first), subtract(third, first)));
	const signedDistance = dot(unitNormal, first);
	return [
		2 * signedDistance * unitNormal[0],
		2 * signedDistance * unitNormal[1],
		2 * signedDistance * unitNormal[2],
	];
}

function subtract(left: Point, right: Point): Point {
	return [left[0] - right[0], left[1] - right[1], left[2] - right[2]];
}

function dot(left: Point, right: Point): number {
	return left[0] * right[0] + left[1] * right[1] + left[2] * right[2];
}

function cross(left: Point, right: Point): Point {
	return [
		left[1] * right[2] - left[2] * right[1],
		left[2] * right[0] - left[0] * right[2],
		left[0] * right[1] - left[1] * right[0],
	];
}

function normalize(vector: Point): Point {
	const length = Math.hypot(vector[0], vector[1], vector[2]);
	return [vector[0] / length, vector[1] / length, vector[2] / length];
}
