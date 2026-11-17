// Invariant under test: a tween reports eased progress up to exactly 1, ends once, and stops at once when cancelled.

import assert from "node:assert/strict";

import { test } from "vitest";

import { createAnimator, easeInOutCubic } from "./animation";

test("a tween runs from its first frame to exactly 1 and then finishes", async () => {
	const animator = createAnimator();
	const seen: number[] = [];
	const outcome = animator.tween({ durationMs: 100, update: (progress) => seen.push(progress) });

	animator.advance(1000);
	animator.advance(1050);
	assert.equal(animator.isActive(), true);
	animator.advance(1100);

	assert.deepEqual(seen, [0, 0.5, 1]);
	assert.equal(animator.isActive(), false);
	assert.equal(await outcome, "finished");
});

test("a frame far past the end still reports exactly 1", async () => {
	const animator = createAnimator();
	const seen: number[] = [];
	const outcome = animator.tween({ durationMs: 100, update: (progress) => seen.push(progress) });

	animator.advance(0);
	animator.advance(5000);

	assert.deepEqual(seen, [0, 1]);
	assert.equal(await outcome, "finished");
});

test("a tween of zero length finishes on its first frame", async () => {
	const animator = createAnimator();
	const seen: number[] = [];
	const outcome = animator.tween({ durationMs: 0, update: (progress) => seen.push(progress) });

	animator.advance(42);

	assert.deepEqual(seen, [1]);
	assert.equal(await outcome, "finished");
});

test("cancelling stops every tween where it is and reports it as cancelled", async () => {
	const animator = createAnimator();
	const seen: number[] = [];
	const first = animator.tween({ durationMs: 100, update: (progress) => seen.push(progress) });
	const second = animator.tween({ durationMs: 200, update: () => undefined });
	animator.advance(0);

	animator.cancelAll();
	animator.advance(100);

	assert.deepEqual(seen, [0]);
	assert.equal(animator.isActive(), false);
	assert.deepEqual(await Promise.all([first, second]), ["cancelled", "cancelled"]);
});

test("a tween started from inside an update is kept and runs", async () => {
	const animator = createAnimator();
	const seen: number[] = [];
	let inner: Promise<string> | undefined;
	void animator.tween({
		durationMs: 0,
		update: () => {
			inner = animator.tween({ durationMs: 0, update: (progress) => seen.push(progress) });
		},
	});

	animator.advance(0);
	assert.equal(animator.isActive(), true);
	animator.advance(16);

	assert.deepEqual(seen, [1]);
	assert.equal(await inner, "finished");
});

test("a negative or unbounded duration is rejected before anything runs", () => {
	const animator = createAnimator();

	for (const badDuration of [-1, Number.NaN, Number.POSITIVE_INFINITY]) {
		assert.throws(() => animator.tween({ durationMs: badDuration, update: () => assert.fail("update must not run") }), {
			name: "RangeError",
			message: /^durationMs must be 0 or more, got /,
		});
	}
	assert.equal(animator.isActive(), false);
});

test("the easing curve starts at 0, passes one half at the middle and ends at 1", () => {
	assert.equal(easeInOutCubic(0), 0);
	assert.equal(easeInOutCubic(0.5), 0.5);
	assert.equal(easeInOutCubic(1), 1);
	assert.ok(easeInOutCubic(0.25) < 0.25, "the start must be slow");
	assert.ok(easeInOutCubic(0.75) > 0.75, "the end must be slow");
});
