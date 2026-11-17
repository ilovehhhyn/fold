// Owns the WebGL renderer, the camera and the lights, and draws the paper meshes on one canvas.

import {
	DirectionalLight,
	Group,
	HemisphereLight,
	PerspectiveCamera,
	Raycaster,
	Scene,
	Vector2,
	WebGLRenderer,
} from "three";

import { cameraFieldOfViewDegrees } from "./camera-framing";
import type { CameraFraming } from "./camera-framing";
import { createPaperMeshes } from "./paper-meshes";
import type { PaperMeshes, PickTarget } from "./paper-meshes";

// A higher ratio costs fill rate on phones without a visible gain.
const devicePixelRatioMax = 2;
const cameraNear = 0.5;
const cameraFar = 40;

export type ToyScene = Readonly<{
	canvas: HTMLCanvasElement;
	meshes: PaperMeshes;
	setCamera: (framing: CameraFraming) => void;
	/** Tilts the whole toy by two small angles, in radians, about the x and z axes. */
	setSway: (tiltX: number, tiltZ: number) => void;
	/** Returns what lies nearest to the camera under a point of the page, or null for no paper. */
	pick: (clientX: number, clientY: number) => PickTarget | null;
	resize: (sizePixels: number) => void;
	render: () => void;
	dispose: () => void;
}>;

/** Creates the scene; throws if the browser cannot create a WebGL context. */
export function createToyScene(): ToyScene {
	const renderer = new WebGLRenderer({ alpha: true, antialias: true });
	renderer.setPixelRatio(Math.min(window.devicePixelRatio, devicePixelRatioMax));
	const scene = new Scene();
	const camera = new PerspectiveCamera(cameraFieldOfViewDegrees, 1, cameraNear, cameraFar);
	const meshes = createPaperMeshes();
	const swayGroup = new Group();
	swayGroup.add(meshes.group);
	scene.add(swayGroup);
	const skyLight = new HemisphereLight("#ffffff", "#d9cfbc", 1.75);
	const keyLight = new DirectionalLight("#ffffff", 1.35);
	keyLight.position.set(-2.6, 6, 3.4);
	scene.add(skyLight, keyLight);
	const raycaster = new Raycaster();

	const pick = (clientX: number, clientY: number): PickTarget | null => {
		const bounds = renderer.domElement.getBoundingClientRect();
		const pointer = new Vector2(
			((clientX - bounds.left) / bounds.width) * 2 - 1,
			1 - ((clientY - bounds.top) / bounds.height) * 2,
		);
		scene.updateMatrixWorld();
		raycaster.setFromCamera(pointer, camera);
		const nearest = raycaster.intersectObjects([...meshes.pickables], false).find((hit) => hit.object.visible);
		if (nearest === undefined) {
			return null;
		}
		// userData is untyped; paper-meshes.ts is the only writer of pickTarget.
		return nearest.object.userData["pickTarget"] as PickTarget | null;
	};

	return {
		canvas: renderer.domElement,
		meshes,
		setCamera: (framing) => {
			camera.position.set(...framing.position);
			camera.lookAt(...framing.target);
		},
		setSway: (tiltX, tiltZ) => {
			swayGroup.rotation.set(tiltX, 0, tiltZ);
		},
		pick,
		resize: (sizePixels) => {
			renderer.setSize(sizePixels, sizePixels, false);
		},
		render: () => {
			renderer.render(scene, camera);
		},
		dispose: () => {
			meshes.dispose();
			skyLight.dispose();
			keyLight.dispose();
			renderer.dispose();
			renderer.forceContextLoss();
		},
	};
}
