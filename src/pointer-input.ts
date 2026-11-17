// Turns pointer events on the canvas into choices: a tap chooses, and a mouse hover highlights.

import type { PickTarget } from "./paper-meshes";

// A press and release within this distance and time is a tap. A longer or wider gesture is a
// scroll or a drag and chooses nothing.
const tapDistanceMaxPixels = 10;
const tapDurationMaxMs = 500;

export type PointerInputOptions = Readonly<{
	canvas: HTMLCanvasElement;
	pick: (clientX: number, clientY: number) => PickTarget | null;
	isChoosable: (target: PickTarget) => boolean;
	choose: (target: PickTarget) => void;
	setHighlight: (target: PickTarget | null) => void;
}>;

type Press = Readonly<{ pointerId: number; clientX: number; clientY: number; timeMs: number }>;

/** Starts listening on the canvas and returns a function that stops listening. */
export function attachPointerInput(options: PointerInputOptions): () => void {
	const { canvas, choose, isChoosable, pick, setHighlight } = options;
	let press: Press | undefined;

	const choosableAt = (event: PointerEvent): PickTarget | null => {
		const target = pick(event.clientX, event.clientY);
		return target !== null && isChoosable(target) ? target : null;
	};
	const onPointerMove = (event: PointerEvent): void => {
		if (event.pointerType !== "mouse") {
			return;
		}
		const target = choosableAt(event);
		setHighlight(target);
		canvas.style.cursor = target === null ? "" : "pointer";
	};
	const onPointerLeave = (): void => {
		setHighlight(null);
		canvas.style.cursor = "";
	};
	const onPointerDown = (event: PointerEvent): void => {
		press = { pointerId: event.pointerId, clientX: event.clientX, clientY: event.clientY, timeMs: event.timeStamp };
	};
	const onPointerUp = (event: PointerEvent): void => {
		const started = press;
		press = undefined;
		if (started === undefined || started.pointerId !== event.pointerId) {
			return;
		}
		const distance = Math.hypot(event.clientX - started.clientX, event.clientY - started.clientY);
		const isTap = distance <= tapDistanceMaxPixels && event.timeStamp - started.timeMs <= tapDurationMaxMs;
		const target = isTap ? choosableAt(event) : null;
		if (target !== null) {
			setHighlight(null);
			canvas.style.cursor = "";
			choose(target);
		}
	};
	const onPointerCancel = (): void => {
		press = undefined;
	};

	canvas.addEventListener("pointermove", onPointerMove);
	canvas.addEventListener("pointerleave", onPointerLeave);
	canvas.addEventListener("pointerdown", onPointerDown);
	canvas.addEventListener("pointerup", onPointerUp);
	canvas.addEventListener("pointercancel", onPointerCancel);
	return () => {
		canvas.removeEventListener("pointermove", onPointerMove);
		canvas.removeEventListener("pointerleave", onPointerLeave);
		canvas.removeEventListener("pointerdown", onPointerDown);
		canvas.removeEventListener("pointerup", onPointerUp);
		canvas.removeEventListener("pointercancel", onPointerCancel);
	};
}
