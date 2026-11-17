// Parses the `?pose=tipX,tipZ` page parameter, which shows one fixed pose for screenshots.

import type { TipOffsets } from "./rig";

const poseParameterName = "pose";
const posePattern = /^(\d+(?:\.\d+)?),(\d+(?:\.\d+)?)$/;

/** Returns the pose named by the query string, or null if it has no `pose` parameter. */
export function parseFixedPose(queryString: string): TipOffsets | null {
	const value = new URLSearchParams(queryString).get(poseParameterName);
	if (value === null) {
		return null;
	}
	const match = posePattern.exec(value);
	const tipX = Number(match?.[1]);
	const tipZ = Number(match?.[2]);
	const isInRange = match !== null && tipX <= 1 && tipZ <= 1;
	if (!isInRange) {
		throw new RangeError(
			`pose must be two numbers from 0 to 1 separated by a comma, got ${JSON.stringify(value)}; for example ?pose=0.05,0.75`,
		);
	}
	return { tipX, tipZ };
}
