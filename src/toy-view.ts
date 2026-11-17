// Holds what the toy currently looks like (pose, lifted triangle, camera) and moves it toward a goal.
//
// Every move starts from the current values, so a move that interrupts another one continues
// from where the paper is. In-between poses are valid because any pair of tip offsets in range is.

import type { Animator, TweenOutcome } from "./animation";
import { fortuneFraming, liftAngleDegrees, playFraming } from "./camera-framing";
import type { CameraFraming } from "./camera-framing";
import { computePose, innerTriangles } from "./rig";
import type { Point, TipOffsets } from "./rig";
import type { ToyScene } from "./scene";

const liftAngleRadians = (liftAngleDegrees * Math.PI) / 180;

/** What the toy must look like at the end of a move. */
export type ViewGoal = Readonly<{
	offsets: TipOffsets;
	/** The number triangle that is lifted to show its fortune, or null for none. */
	liftedPanelIndex: number | null;
	/** The camera shows the whole toy, or closes in on the fortune of one panel. */
	framing: Readonly<{ kind: "play" } | { kind: "fortune"; panelIndex: number }>;
}>;

export type ToyView = Readonly<{
	moveTo: (goal: ViewGoal, durationMs: number) => Promise<TweenOutcome>;
	snapTo: (goal: ViewGoal) => void;
}>;

type ViewValues = Readonly<{ offsets: TipOffsets; liftAngles: readonly number[]; camera: CameraFraming }>;

/** Creates the view and shows the first goal at once. */
export function createToyView(
	scene: ToyScene,
	animator: Animator,
	requestRender: () => void,
	firstGoal: ViewGoal,
): ToyView {
	let current = valuesFor(firstGoal);
	const show = (values: ViewValues): void => {
		current = values;
		scene.meshes.movePaper(computePose(values.offsets), values.liftAngles);
		scene.setCamera(values.camera);
		requestRender();
	};
	show(current);
	return {
		moveTo: (goal, durationMs) => {
			const start = current;
			const end = valuesFor(goal);
			const outcome = animator.tween({
				durationMs,
				update: (progress) => {
					show(blend(start, end, progress));
				},
			});
			requestRender();
			return outcome;
		},
		snapTo: (goal) => {
			show(valuesFor(goal));
		},
	};
}

function valuesFor(goal: ViewGoal): ViewValues {
	return {
		offsets: goal.offsets,
		liftAngles: innerTriangles.map((_triangle, index) => (index === goal.liftedPanelIndex ? liftAngleRadians : 0)),
		camera: goal.framing.kind === "play" ? playFraming() : fortuneFraming(goal.framing.panelIndex),
	};
}

function blend(start: ViewValues, end: ViewValues, progress: number): ViewValues {
	return {
		offsets: {
			tipX: mix(start.offsets.tipX, end.offsets.tipX, progress),
			tipZ: mix(start.offsets.tipZ, end.offsets.tipZ, progress),
		},
		liftAngles: start.liftAngles.map((angle, index) => mix(angle, end.liftAngles[index] ?? angle, progress)),
		camera: {
			position: mixPoint(start.camera.position, end.camera.position, progress),
			target: mixPoint(start.camera.target, end.camera.target, progress),
		},
	};
}

function mixPoint(start: Point, end: Point, progress: number): Point {
	return [mix(start[0], end[0], progress), mix(start[1], end[1], progress), mix(start[2], end[2], progress)];
}

function mix(start: number, end: number, progress: number): number {
	return start + (end - start) * progress;
}
