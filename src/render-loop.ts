// Draws frames only while something changes: a running tween, the idle sway, or a requested redraw.
//
// The loop stops while the page is hidden or the canvas is off screen, and starts again when
// either becomes visible. Sway: tiltX = A sin(2 pi t / P1), tiltZ = A sin(2 pi t / P2), with A
// faded in and out over `swayFadeMs` so the toy never jumps.

import type { Animator } from "./animation";
import type { ToyScene } from "./scene";

const swayAmplitudeRadians = (2.5 * Math.PI) / 180;
// Two periods without a small common multiple, so the sway does not look like a loop.
const swayPeriodXMs = 5300;
const swayPeriodZMs = 7100;
const swayFadeMs = 400;
const swayLevelMin = 0.001;

export type RenderLoopOptions = Readonly<{
	animator: Animator;
	scene: ToyScene;
	/** Asked every frame; true while the toy waits for input and motion is allowed. */
	wantsSway: () => boolean;
}>;

export type RenderLoop = Readonly<{
	/** Asks for one more frame, for a change that no tween drives. */
	requestRender: () => void;
	stop: () => void;
}>;

/** Starts the loop and returns its controls. */
export function createRenderLoop(options: RenderLoopOptions): RenderLoop {
	const { animator, scene, wantsSway } = options;
	let frameHandle: number | undefined;
	let isOnScreen = true;
	let swayLevel = 0;
	let previousMs: number | undefined;

	const frame = (nowMs: number): void => {
		frameHandle = undefined;
		const elapsedMs = previousMs === undefined ? 0 : nowMs - previousMs;
		previousMs = nowMs;
		animator.advance(nowMs);
		const swayTarget = wantsSway() ? 1 : 0;
		swayLevel += (swayTarget - swayLevel) * Math.min(1, elapsedMs / swayFadeMs);
		const isSwaying = swayTarget === 1 || swayLevel > swayLevelMin;
		const amplitude = isSwaying ? swayLevel * swayAmplitudeRadians : 0;
		scene.setSway(
			amplitude * Math.sin((2 * Math.PI * nowMs) / swayPeriodXMs),
			amplitude * Math.sin((2 * Math.PI * nowMs) / swayPeriodZMs),
		);
		scene.render();
		if (animator.isActive() || isSwaying) {
			schedule();
		} else {
			previousMs = undefined;
		}
	};

	const schedule = (): void => {
		const canDraw = !document.hidden && isOnScreen;
		if (frameHandle === undefined && canDraw) {
			frameHandle = requestAnimationFrame(frame);
		}
	};

	const onVisibilityChange = (): void => {
		previousMs = undefined;
		schedule();
	};
	const observer = new IntersectionObserver((entries) => {
		isOnScreen = entries.some((entry) => entry.isIntersecting);
		previousMs = undefined;
		schedule();
	});
	observer.observe(scene.canvas);
	document.addEventListener("visibilitychange", onVisibilityChange);
	schedule();

	return {
		requestRender: schedule,
		stop: () => {
			if (frameHandle !== undefined) {
				cancelAnimationFrame(frameHandle);
				frameHandle = undefined;
			}
			observer.disconnect();
			document.removeEventListener("visibilitychange", onVisibilityChange);
		},
	};
}
