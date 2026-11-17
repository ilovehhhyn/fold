// Puts a playable fortune teller into a page element and returns a handle that removes it again.
//
// This file only connects the parts: page elements, scene, game flow, editor and storage.
// It owns every listener and observer it creates and releases them all in `destroy`.

import "./style.css";

import { createAnimator } from "./animation";
import paperFontUrl from "./assets/fonts/patrick-hand-latin-400-normal.woff2";
import type { FortuneTellerConfig } from "./config";
import { defaultConfig } from "./config";
import {
	chooseStartConfig,
	fragmentFor,
	isConfigFragment,
	readFragmentConfig,
	readSavedConfig,
	storageKey,
	writeSavedConfig,
} from "./config-storage";
import { createControls } from "./controls";
import type { Controls } from "./controls";
import { createEditor } from "./editor";
import type { EditorField } from "./editor";
import { standardLayout } from "./game";
import type { PanelLayout } from "./game";
import { createGameFlow } from "./game-flow";
import type { GameFlow, SpecialEnding, StatusLine } from "./game-flow";
import { applyConfigToPaper, drawPanelsOnTriangles } from "./paper-labels";
import type { PickTarget } from "./paper-meshes";
import { paperFontFamily } from "./paper-textures";
import { attachPointerInput } from "./pointer-input";
import { createRenderLoop } from "./render-loop";
import { namedPoses } from "./rig";
import type { TipOffsets } from "./rig";
import { createToyScene } from "./scene";
import type { ToyScene } from "./scene";
import { createToyView } from "./toy-view";
import type { ViewGoal } from "./toy-view";

const editMoveDurationMs = 350;
const pocketExpandDurationMs = 160;
const reducedMotionQuery = "(prefers-reduced-motion: reduce)";

export type MountOptions = Readonly<{
	/** Shows one pose without the game; the demo page uses it for screenshots. */
	fixedPose?: TipOffsets;
	/** Makes one panel always available at the second number choice, with its own question. */
	specialEnding?: SpecialEnding;
	/** Which texts the status line shows; "full" when not given. */
	statusLine?: StatusLine;
}>;

export type MountedFortuneTeller = Readonly<{
	/** Removes the toy from the page and releases everything it created. */
	destroy: () => void;
}>;

/** Adds the fortune teller to the container; the toy fills the container's width. */
export function mountFortuneTeller(container: HTMLElement, options: MountOptions = {}): MountedFortuneTeller {
	const controls = createControls(container);
	const cleanups: (() => void)[] = [];
	let isDestroyed = false;
	controls.setPhase("loading");
	controls.setStatus("Loading the fortune teller.");
	controls.editButton.hidden = true;
	start(controls, options, cleanups, () => isDestroyed).catch((error: unknown) => {
		controls.setPhase("failed");
		controls.setStatus(`The fortune teller could not start: ${error instanceof Error ? error.message : String(error)}`);
	});
	return {
		destroy: () => {
			isDestroyed = true;
			for (const cleanup of cleanups.reverse()) {
				cleanup();
			}
			controls.remove();
		},
	};
}

async function start(
	controls: Controls,
	options: MountOptions,
	cleanups: (() => void)[],
	isDestroyed: () => boolean,
): Promise<void> {
	const notices: string[] = [];
	const fontProblem = await loadPaperFont();
	if (isDestroyed()) {
		return;
	}
	if (fontProblem !== null) {
		notices.push(fontProblem);
	}
	const scene = createSceneOrExplain(controls);
	if (scene === null) {
		return;
	}
	cleanups.push(scene.dispose);
	// The canvas is a picture to assistive technology; the buttons under it carry the game.
	scene.canvas.setAttribute("role", "img");
	scene.canvas.setAttribute("aria-label", "A paper fortune teller. Use the buttons below it to play.");
	controls.stage.append(scene.canvas);
	const storage = openStorage(notices);
	const startConfig = chooseStartConfig(readSavedConfig(storage), readFragmentConfig(window.location.hash));
	notices.push(...startConfig.notices);
	let config = startConfig.config;
	let shownLayout: PanelLayout = standardLayout;
	applyConfigToPaper(scene.meshes, config, shownLayout);

	const animator = createAnimator();
	const motionPreference = window.matchMedia(reducedMotionQuery);
	let flow: GameFlow | undefined;
	const loop = createRenderLoop({
		animator,
		scene,
		wantsSway: () => flow !== undefined && !motionPreference.matches && flow.isWaitingForPlayer(),
	});
	cleanups.push(loop.stop, animator.cancelAll);
	const firstGoal: ViewGoal = {
		offsets: options.fixedPose ?? namedPoses.closed,
		liftedPanelIndex: null,
		framing: { kind: "play" },
	};
	const view = createToyView(scene, animator, loop.requestRender, firstGoal);
	const resizeObserver = new ResizeObserver(() => {
		scene.resize(Math.max(1, Math.round(controls.stage.clientWidth)));
		loop.requestRender();
	});
	resizeObserver.observe(controls.stage);
	cleanups.push(() => {
		resizeObserver.disconnect();
	});
	controls.setNotice(notices.length === 0 ? null : notices.join(" "));
	if (options.fixedPose !== undefined) {
		controls.setPhase("fixedPose");
		controls.setStatus(`Fixed pose: tipX ${options.fixedPose.tipX}, tipZ ${options.fixedPose.tipZ}. The game is off.`);
		return;
	}

	// A highlighted pocket also expands, so the corner under the pointer visibly reacts.
	const setHighlight = (target: PickTarget | null): void => {
		scene.meshes.setHighlight(target);
		const pocketIndex = target !== null && target.kind === "pocket" ? target.index : null;
		void view.expandPocket(pocketIndex, motionPreference.matches ? 0 : pocketExpandDurationMs);
	};
	// Only the triangles whose panel changed are redrawn, so a trade of two panels costs four textures.
	const showLayout = (layout: PanelLayout): void => {
		const changed = layout.flatMap((panelIndex, triangleIndex) => (panelIndex === shownLayout[triangleIndex] ? [] : [triangleIndex]));
		shownLayout = layout;
		drawPanelsOnTriangles(scene.meshes, config, layout, changed);
		loop.requestRender();
	};
	const gameFlow = createGameFlow({
		cancelMotion: animator.cancelAll,
		config: () => config,
		controls,
		prefersReducedMotion: () => motionPreference.matches,
		showLayout,
		special: options.specialEnding ?? null,
		statusLine: options.statusLine ?? "full",
		view,
	});
	flow = gameFlow;
	cleanups.push(
		attachPointerInput({
			canvas: scene.canvas,
			choose: (target) => {
				if (target.kind === "pocket") {
					gameFlow.choosePocket(target.index);
				} else {
					gameFlow.chooseTriangle(target.index);
				}
			},
			isChoosable: gameFlow.isChoosable,
			pick: scene.pick,
			setHighlight,
		}),
	);

	const applyConfig = (changed: FortuneTellerConfig): void => {
		config = changed;
		applyConfigToPaper(scene.meshes, config, shownLayout);
		writeSavedConfig(storage, config);
		clearFragment();
		gameFlow.refresh();
		loop.requestRender();
	};
	const showField = (field: EditorField): void => {
		animator.cancelAll();
		setHighlight(highlightFor(field));
		void view.moveTo(goalFor(field), motionPreference.matches ? 0 : editMoveDurationMs);
	};
	const editor = createEditor({
		config,
		host: controls.editorHost,
		onChange: applyConfig,
		onCopyLink: () => {
			void copyLink(config, controls);
		},
		onFocusField: showField,
		onReset: () => {
			applyConfig(defaultConfig);
			editor.setConfig(defaultConfig);
			controls.setNotice("The default fortune teller is back.");
		},
	});
	let isEditing = false;
	const onEditClick = (): void => {
		isEditing = !isEditing;
		controls.editButton.textContent = isEditing ? "Done" : "Edit";
		controls.editButton.setAttribute("aria-expanded", String(isEditing));
		editor.setOpen(isEditing);
		// Pausing cancels every running move, so the highlight is cleared after it, not before.
		gameFlow.setPaused(isEditing);
		setHighlight(null);
	};
	controls.editButton.addEventListener("click", onEditClick);
	controls.editButton.hidden = false;
}

// Canvas text drawn before the font is ready uses another font without any error, so the
// paper waits for the font. A failed load is reported to the visitor, not hidden.
async function loadPaperFont(): Promise<string | null> {
	try {
		const face = new FontFace(paperFontFamily, `url("${paperFontUrl}")`);
		document.fonts.add(await face.load());
		return null;
	} catch (error: unknown) {
		// A FontFace load fails with a DOMException for a network or a format problem.
		if (error instanceof DOMException) {
			return "The handwriting font could not be loaded, so the paper uses a plain font.";
		}
		throw error;
	}
}

function createSceneOrExplain(controls: Controls): ToyScene | null {
	const probe = document.createElement("canvas");
	const hasWebGl = probe.getContext("webgl2") !== null || probe.getContext("webgl") !== null;
	if (!hasWebGl) {
		controls.setPhase("failed");
		controls.setStatus("This toy needs WebGL to draw the paper, and this browser cannot provide it.");
		return null;
	}
	return createToyScene();
}

// Some browsers refuse storage access in private windows. The toy then keeps changes for the
// visit only, and says so.
function openStorage(notices: string[]): Pick<Storage, "getItem" | "setItem"> {
	try {
		const storage = window.localStorage;
		storage.getItem(storageKey);
		return storage;
	} catch (error: unknown) {
		if (!(error instanceof DOMException)) {
			throw error;
		}
		notices.push("This browser does not allow saving, so your changes last until you close the page.");
		const memory = new Map<string, string>();
		return {
			getItem: (key) => memory.get(key) ?? null,
			setItem: (key, value) => {
				memory.set(key, value);
			},
		};
	}
}

async function copyLink(config: FortuneTellerConfig, controls: Controls): Promise<void> {
	window.history.replaceState(null, "", fragmentFor(config));
	try {
		await navigator.clipboard.writeText(window.location.href);
		controls.setNotice("Link copied. Anyone who opens it plays your fortune teller.");
	} catch (error: unknown) {
		// The clipboard rejects with a DOMException when the page lacks permission or focus.
		if (!(error instanceof DOMException)) {
			throw error;
		}
		controls.setNotice("The link is in the address bar. Copy it from there; this browser blocked the clipboard.");
	}
}

// A shared link wins over the saved configuration on load, so an edit must drop the link data
// or the edit would seem lost after a reload. Any other fragment belongs to the host page and stays.
function clearFragment(): void {
	if (isConfigFragment(window.location.hash)) {
		window.history.replaceState(null, "", window.location.pathname + window.location.search);
	}
}

function goalFor(field: EditorField): ViewGoal {
	switch (field.kind) {
		case "fortune":
			return {
				offsets: namedPoses.reveal,
				liftedPanelIndex: field.index,
				framing: { kind: "fortune", panelIndex: field.index },
			};
		case "panelLabel":
			return { offsets: namedPoses.reveal, liftedPanelIndex: null, framing: { kind: "play" } };
		case "pocket":
			return { offsets: namedPoses.closed, liftedPanelIndex: null, framing: { kind: "play" } };
		default: {
			const unhandled: never = field;
			throw new Error(`unhandled editor field ${JSON.stringify(unhandled)}`);
		}
	}
}

function highlightFor(field: EditorField): PickTarget | null {
	switch (field.kind) {
		case "fortune":
			return null;
		case "panelLabel":
			return { kind: "panel", index: field.index };
		case "pocket":
			return { kind: "pocket", index: field.index };
		default: {
			const unhandled: never = field;
			throw new Error(`unhandled editor field ${JSON.stringify(unhandled)}`);
		}
	}
}
