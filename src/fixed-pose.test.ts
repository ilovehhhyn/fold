// Invariant under test: the pose parameter gives a pose only for two numbers from 0 to 1, and every other value is an error.

import assert from "node:assert/strict";

import { test } from "vitest";

import { parseFixedPose } from "./fixed-pose";

test("a page address without the parameter has no fixed pose", () => {
	assert.equal(parseFixedPose(""), null);
	assert.equal(parseFixedPose("?other=1"), null);
});

test("two numbers from 0 to 1 give that pose", () => {
	assert.deepEqual(parseFixedPose("?pose=0.05,0.75"), { tipX: 0.05, tipZ: 0.75 });
	assert.deepEqual(parseFixedPose("?pose=0,1"), { tipX: 0, tipZ: 1 });
	assert.deepEqual(parseFixedPose("?theme=dark&pose=1,0.5"), { tipX: 1, tipZ: 0.5 });
});

const invalidValues = ["2,0.5", "0.5,1.01", "-0.1,0.5", "abc", "0.5", "0.5,0.5,0.5", "", "0.5, 0.5", "1e-1,0.5", ".5,.5"];

for (const value of invalidValues) {
	test(`the pose value ${JSON.stringify(value)} is rejected and never replaced by a default`, () => {
		assert.throws(() => parseFixedPose(`?pose=${encodeURIComponent(value)}`), {
			name: "RangeError",
			message: `pose must be two numbers from 0 to 1 separated by a comma, got ${JSON.stringify(value)}; for example ?pose=0.05,0.75`,
		});
	});
}
