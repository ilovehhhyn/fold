// Runs timed value changes (tweens) from a clock that the caller advances, without touching the browser.
//
// Easing: easeInOutCubic(t) = 4 t^3 for t < 1/2, else 1 - (-2 t + 2)^3 / 2, with t in [0, 1].

/** How a tween ended: it ran to its end, or `cancelAll` stopped it first. */
export type TweenOutcome = "cancelled" | "finished";

export type TweenOptions = Readonly<{
	durationMs: number;
	/** Receives the eased progress from 0 to 1; the last call always receives exactly 1. */
	update: (progress: number) => void;
}>;

export type Animator = Readonly<{
	tween: (options: TweenOptions) => Promise<TweenOutcome>;
	/** Stops every running tween where it is and resolves each as "cancelled". */
	cancelAll: () => void;
	/** Moves every running tween to the given time, in milliseconds on any steady clock. */
	advance: (nowMs: number) => void;
	isActive: () => boolean;
}>;

type ActiveTween = {
	readonly options: TweenOptions;
	readonly resolve: (outcome: TweenOutcome) => void;
	startMs: number | undefined;
};

/** Creates an animator with no running tweens. */
export function createAnimator(): Animator {
	let active: ActiveTween[] = [];
	return {
		tween: (options) => {
			if (!Number.isFinite(options.durationMs) || options.durationMs < 0) {
				throw new RangeError(`durationMs must be 0 or more, got ${options.durationMs}`);
			}
			return new Promise((resolve) => {
				active.push({ options, resolve, startMs: undefined });
			});
		},
		cancelAll: () => {
			const cancelled = active;
			active = [];
			for (const tween of cancelled) {
				tween.resolve("cancelled");
			}
		},
		advance: (nowMs) => {
			const running = active;
			active = [];
			for (const tween of running) {
				tween.startMs ??= nowMs;
				const { durationMs, update } = tween.options;
				const elapsed = durationMs === 0 ? 1 : Math.min(1, (nowMs - tween.startMs) / durationMs);
				update(easeInOutCubic(elapsed));
				if (elapsed < 1) {
					active.push(tween);
				} else {
					tween.resolve("finished");
				}
			}
		},
		isActive: () => active.length > 0,
	};
}

/** Returns the eased value for linear progress `t` in [0, 1]; slow at both ends. */
export function easeInOutCubic(t: number): number {
	return t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2;
}
