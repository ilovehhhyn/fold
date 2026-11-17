// Builds the paper triangles of the fortune teller as Three.js meshes and moves them to a pose.
//
// There are 8 number triangles, 8 fortune triangles and 8 pocket triangles. A fortune triangle
// has the corners of its number triangle and stays hidden until that number triangle lifts, so
// the two surfaces never share a plane while both are drawn.

import {
	BackSide,
	BufferAttribute,
	BufferGeometry,
	FrontSide,
	Group,
	LineBasicMaterial,
	LineSegments,
	Mesh,
	MeshStandardMaterial,
} from "three";

import { paperFrontColour } from "./paper-textures";
import type { TriangleTexture } from "./paper-textures";
import { expandedPocketCorner, innerTriangles, liftedCentreCorner, pocketTriangles, quadrants, trianglePoints } from "./rig";
import type { Point, Pose } from "./rig";

const paperBackColour = "#e4dac6";
const edgeColour = "#3b3228";
// A highlighted surface glows in its own colours: the glow is the surface texture or colour
// times this intensity, so dark ink stays dark and the text stays readable.
const highlightIntensity = 0.38;
// A fortune triangle is drawn once its number triangle has turned by more than this angle.
const liftVisibleMinRadians = 0.01;
const trianglesWithEdges = innerTriangles.length * 2 + pocketTriangles.length;
const floatsPerTriangleEdges = 3 * 2 * 3;
// The polygon offset moves the faces slightly back in depth, so that the edge lines that lie
// exactly on them stay visible.
const paperMaterialOptions = {
	flatShading: true,
	metalness: 0,
	polygonOffset: true,
	polygonOffsetFactor: 1,
	polygonOffsetUnits: 1,
	roughness: 0.93,
} as const;

/** Something the player can point at: a number triangle or a whole pocket. */
export type PickTarget = Readonly<{ kind: "panel"; index: number } | { kind: "pocket"; index: number }>;

/** The parts of the paper's shape that the pose alone does not give. */
export type PaperShape = Readonly<{
	/** One lift angle per number triangle, in radians; 0 leaves the triangle in place. */
	liftAnglesRadians: readonly number[];
	/** One hover expansion per pocket, from 0 (at rest) to 1 (fully expanded). */
	pocketExpansions: readonly number[];
}>;

type Surface = Readonly<{ geometry: BufferGeometry; material: MeshStandardMaterial; mesh: Mesh }>;

export type PaperMeshes = Readonly<{
	group: Group;
	pickables: readonly Mesh[];
	/** Moves every triangle to the pose, with its lifted number triangles and expanded pockets. */
	movePaper: (pose: Pose, shape: PaperShape) => void;
	setPanelLabel: (triangleIndex: number, triangleTexture: TriangleTexture) => void;
	setFortune: (triangleIndex: number, triangleTexture: TriangleTexture) => void;
	setPocketColour: (pocketTriangleIndex: number, colour: string) => void;
	setHighlight: (target: PickTarget | null) => void;
	dispose: () => void;
}>;

/** Creates the paper meshes; the caller must call `movePaper` once before the first render. */
export function createPaperMeshes(): PaperMeshes {
	const group = new Group();
	const backMaterial = new MeshStandardMaterial({ ...paperMaterialOptions, color: paperBackColour, side: BackSide });
	const pickables: Mesh[] = [];
	const addSurface = (target: PickTarget | null, hasBack: boolean): Surface => {
		const surface = createSurface(target);
		group.add(surface.mesh);
		pickables.push(surface.mesh);
		if (hasBack) {
			const backMesh = new Mesh(surface.geometry, backMaterial);
			backMesh.userData["pickTarget"] = target;
			group.add(backMesh);
			pickables.push(backMesh);
		}
		return surface;
	};
	const fortunes = innerTriangles.map(() => addSurface(null, false));
	const numbers = innerTriangles.map((_triangle, index) => addSurface({ kind: "panel", index }, true));
	const pocketIndexes = pocketTriangles.map((triangle) => quadrants.findIndex((quadrant) => quadrant.name === triangle.pocket));
	const pockets = pocketIndexes.map((index) => addSurface({ kind: "pocket", index }, true));
	const edgeGeometry = new BufferGeometry();
	edgeGeometry.setAttribute("position", new BufferAttribute(new Float32Array(trianglesWithEdges * floatsPerTriangleEdges), 3));
	const edgeMaterial = new LineBasicMaterial({ color: edgeColour, opacity: 0.6, transparent: true });
	const edges = new LineSegments(edgeGeometry, edgeMaterial);
	edges.frustumCulled = false;
	group.add(edges);

	const movePaper = (pose: Pose, shape: PaperShape): void => {
		const outlines: (readonly [Point, Point, Point])[] = [];
		for (const [index, triangle] of innerTriangles.entries()) {
			const corners = trianglePoints(pose, triangle.corners);
			const angle = requireItem(shape.liftAnglesRadians, index, "lift angle");
			const isLifted = angle > liftVisibleMinRadians;
			const lifted: readonly [Point, Point, Point] = isLifted
				? [liftedCentreCorner(pose, triangle, angle), corners[1], corners[2]]
				: corners;
			const fortune = requireItem(fortunes, index, "fortune surface");
			writeTriangle(requireItem(numbers, index, "number surface").geometry, lifted);
			writeTriangle(fortune.geometry, corners);
			fortune.mesh.visible = isLifted;
			outlines.push(lifted, isLifted ? corners : [corners[0], corners[0], corners[0]]);
		}
		for (const [index, triangle] of pocketTriangles.entries()) {
			if (!triangle.corners[0].startsWith("pocketCorners.")) {
				throw new Error(`pocket triangle ${triangle.corners.join(" ")} must list its pocket corner first`);
			}
			const [pocketCorner, second, third] = trianglePoints(pose, triangle.corners);
			const expansion = requireItem(shape.pocketExpansions, requireItem(pocketIndexes, index, "pocket"), "pocket expansion");
			const corners: readonly [Point, Point, Point] = [expandedPocketCorner(pocketCorner, expansion), second, third];
			writeTriangle(requireItem(pockets, index, "pocket surface").geometry, corners);
			outlines.push(corners);
		}
		writeEdges(edgeGeometry, outlines);
	};

	const setHighlight = (target: PickTarget | null): void => {
		for (const surface of [...numbers, ...pockets]) {
			surface.material.emissiveIntensity = 0;
		}
		if (target === null) {
			return;
		}
		const lit = target.kind === "panel"
			? [requireItem(numbers, target.index, "number surface")]
			: pockets.filter((surface) => isSameTarget(surface.mesh.userData["pickTarget"], target));
		for (const surface of lit) {
			surface.material.emissiveIntensity = highlightIntensity;
		}
	};

	const dispose = (): void => {
		for (const surface of [...fortunes, ...numbers, ...pockets]) {
			surface.material.map?.dispose();
			surface.material.dispose();
			surface.geometry.dispose();
		}
		backMaterial.dispose();
		edgeGeometry.dispose();
		edgeMaterial.dispose();
	};

	return {
		group,
		pickables,
		movePaper,
		setPanelLabel: (panelIndex, triangleTexture) => {
			setTexture(requireItem(numbers, panelIndex, "number surface"), triangleTexture);
		},
		setFortune: (panelIndex, triangleTexture) => {
			setTexture(requireItem(fortunes, panelIndex, "fortune surface"), triangleTexture);
		},
		setPocketColour: (pocketTriangleIndex, colour) => {
			const { material } = requireItem(pockets, pocketTriangleIndex, "pocket surface");
			material.map?.dispose();
			material.map = null;
			material.emissiveMap = null;
			material.color.set(colour);
			material.emissive.set(colour);
			material.needsUpdate = true;
		},
		setHighlight,
		dispose,
	};
}

function createSurface(target: PickTarget | null): Surface {
	const geometry = new BufferGeometry();
	geometry.setAttribute("position", new BufferAttribute(new Float32Array(9), 3));
	geometry.setAttribute("uv", new BufferAttribute(new Float32Array(6), 2));
	const material = new MeshStandardMaterial({
		...paperMaterialOptions,
		color: paperFrontColour,
		emissive: paperFrontColour,
		emissiveIntensity: 0,
		side: FrontSide,
	});
	const mesh = new Mesh(geometry, material);
	mesh.userData["pickTarget"] = target;
	return { geometry, material, mesh };
}

function setTexture(surface: Surface, triangleTexture: TriangleTexture): void {
	surface.material.map?.dispose();
	surface.material.map = triangleTexture.texture;
	surface.material.emissiveMap = triangleTexture.texture;
	surface.material.color.set("#ffffff");
	surface.material.emissive.set("#ffffff");
	surface.material.needsUpdate = true;
	const uv = surface.geometry.getAttribute("uv");
	for (const [index, coordinate] of triangleTexture.uvs.entries()) {
		uv.setXY(index, coordinate[0], coordinate[1]);
	}
	uv.needsUpdate = true;
}

// The raycaster rejects a mesh by its bounding sphere first, so the sphere must follow the corners.
function writeTriangle(geometry: BufferGeometry, corners: readonly [Point, Point, Point]): void {
	const position = geometry.getAttribute("position");
	for (const [index, corner] of corners.entries()) {
		position.setXYZ(index, corner[0], corner[1], corner[2]);
	}
	position.needsUpdate = true;
	geometry.computeBoundingSphere();
}

function writeEdges(geometry: BufferGeometry, outlines: readonly (readonly [Point, Point, Point])[]): void {
	if (outlines.length !== trianglesWithEdges) {
		throw new Error(`edge buffer holds ${trianglesWithEdges} triangles, got ${outlines.length}`);
	}
	const position = geometry.getAttribute("position");
	let vertex = 0;
	for (const corners of outlines) {
		for (const [index, start] of corners.entries()) {
			const end = corners[(index + 1) % corners.length] ?? start;
			position.setXYZ(vertex, start[0], start[1], start[2]);
			position.setXYZ(vertex + 1, end[0], end[1], end[2]);
			vertex += 2;
		}
	}
	position.needsUpdate = true;
}

function isSameTarget(value: unknown, target: PickTarget): boolean {
	const candidate = value as PickTarget | null; // userData is untyped; this file is its only writer.
	return candidate !== null && candidate.kind === target.kind && candidate.index === target.index;
}

function requireItem<Item>(items: readonly Item[], index: number, what: string): Item {
	const item = items[index];
	if (item === undefined) {
		throw new RangeError(`${what} index must be from 0 to ${items.length - 1}, got ${index}`);
	}
	return item;
}
