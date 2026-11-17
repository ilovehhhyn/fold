// Invariant under test: the view draws the pose, the lifted triangle and the hover expansion it was asked for, and a hover change never disturbs a pose move.

import assert from "node:assert/strict";

import { test } from "vitest";

import { createAnimator } from "./animation";
import type { Animator } from "./animation";
import type { PaperShape } from "./paper-meshes";
import { computePose, namedPoses } from "./rig";
import type { Pose, TipOffsets } from "./rig";
import { createToyView } from "./toy-view";
import type { ToyView, ViewGoal } from "./toy-view";

const closedGoal: ViewGoal = { offsets: namedPoses.closed, liftedPanelIndex: null, framing: { kind: "play" } };
const openGoal: ViewGoal = { offsets: namedPoses.openNorthSouth, liftedPanelIndex: null, framing: { kind: "play" } };

type Drawing = Readonly<{ pose: Pose; shape: PaperShape }>;

type Fixture = Readonly<{ animator: Animator; view: ToyView; drawings: Drawing[]; renderRequests: () => number }>;

// A stand-in for the scene that records every drawing the view asks for.
function createFixture(firstGoal: ViewGoal): Fixture {
	const drawings: Drawing[] = [];
	let renderRequestCount = 0;
	const animator = createAnimator();
	const scene = {
		meshes: {
			movePaper: (pose: Pose, shape: PaperShape): void => {
				drawings.push({ pose, shape });
			},
		},
		setCamera: (): void => undefined,
	};
	const view = createToyView(scene, animator, () => {
		renderRequestCount += 1;
	}, firstGoal);
	return { animator, view, drawings, renderRequests: () => renderRequestCount };
}

function lastDrawing(fixture: Fixture): Drawing {
	const drawing = fixture.drawings.at(-1);
	assert.ok(drawing !== undefined, "the view must have drawn at least once");
	return drawing;
}

function assertPose(drawing: Drawing, offsets: TipOffsets): void {
	assert.deepEqual(drawing.pose.tips.northEast, computePose(offsets).tips.northEast);
}

test("the first goal is drawn at once, with nothing lifted and nothing expanded", () => {
	const fixture = createFixture(closedGoal);

	assert.equal(fixture.drawings.length, 1);
	assertPose(lastDrawing(fixture), namedPoses.closed);
	assert.deepEqual(lastDrawing(fixture).shape, { liftAnglesRadians: [0, 0, 0, 0, 0, 0, 0, 0], pocketExpansions: [0, 0, 0, 0] });
	assert.ok(fixture.renderRequests() >= 1);
});

test("a hovered pocket expands fully and the other three stay at rest", async () => {
	const fixture = createFixture(closedGoal);

	const outcome = fixture.view.expandPocket(2, 100);
	fixture.animator.advance(0);
	fixture.animator.advance(50);
	assert.deepEqual(lastDrawing(fixture).shape.pocketExpansions, [0, 0, 0.5, 0]);
	fixture.animator.advance(100);

	assert.deepEqual(lastDrawing(fixture).shape.pocketExpansions, [0, 0, 1, 0]);
	assert.equal(await outcome, "finished");
});

test("moving to another pocket shrinks the first one, and leaving shrinks them all", () => {
	const fixture = createFixture(closedGoal);
	void fixture.view.expandPocket(0, 0);
	fixture.animator.advance(0);

	void fixture.view.expandPocket(3, 100);
	fixture.animator.advance(10);
	fixture.animator.advance(110);
	assert.deepEqual(lastDrawing(fixture).shape.pocketExpansions, [0, 0, 0, 1]);

	void fixture.view.expandPocket(null, 0);
	fixture.animator.advance(120);
	assert.deepEqual(lastDrawing(fixture).shape.pocketExpansions, [0, 0, 0, 0]);
});

test("a hover change during a pose move changes only the pockets, and the pose move ends at its goal", async () => {
	const fixture = createFixture(closedGoal);

	const move = fixture.view.moveTo(openGoal, 200);
	fixture.animator.advance(0);
	const hover = fixture.view.expandPocket(1, 100);
	fixture.animator.advance(100);
	const midway = lastDrawing(fixture);
	assert.ok(midway.pose.tips.northEast[2] < -namedPoses.closed.tipZ, "the pose move must still be running");
	assert.ok(midway.pose.tips.northEast[2] > -namedPoses.openNorthSouth.tipZ, "the pose move must not have jumped to its end");
	fixture.animator.advance(200);

	assertPose(lastDrawing(fixture), namedPoses.openNorthSouth);
	assert.deepEqual(lastDrawing(fixture).shape.pocketExpansions, [0, 1, 0, 0]);
	assert.deepEqual(await Promise.all([move, hover]), ["finished", "finished"]);
});

test("a move that interrupts another continues from where the paper is", () => {
	const fixture = createFixture(closedGoal);
	void fixture.view.moveTo(openGoal, 100);
	fixture.animator.advance(0);
	fixture.animator.advance(50);
	const interruptedAt = lastDrawing(fixture).pose.tips.northEast;
	fixture.animator.cancelAll();

	void fixture.view.moveTo(closedGoal, 100);
	fixture.animator.advance(1000);

	assert.deepEqual(lastDrawing(fixture).pose.tips.northEast, interruptedAt);
	fixture.animator.advance(1100);
	assertPose(lastDrawing(fixture), namedPoses.closed);
});

test("a lifted panel reaches the lift angle and a snap shows a goal without a tween", () => {
	const fixture = createFixture(closedGoal);

	fixture.view.snapTo({ offsets: namedPoses.reveal, liftedPanelIndex: 4, framing: { kind: "fortune", panelIndex: 4 } });

	assert.equal(fixture.animator.isActive(), false);
	assertPose(lastDrawing(fixture), namedPoses.reveal);
	const angles = lastDrawing(fixture).shape.liftAnglesRadians;
	assert.equal(angles.filter((angle) => angle === 0).length, 7);
	assert.ok(Math.abs((angles[4] ?? 0) - (130 * Math.PI) / 180) < 1e-12, `lift angle is ${angles[4]}`);
});
