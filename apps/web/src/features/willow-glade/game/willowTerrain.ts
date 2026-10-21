import { PerspectiveCamera, PlaneGeometry, Vector3 } from "three";
import { MAP_HEIGHT, MAP_WIDTH, POND, type Point } from "./willowMap";

export const WORLD_SCALE = 65;
export const CAMERA_YAW = Math.PI / 6;
export const CAMERA_ELEVATION = (31 * Math.PI) / 180;
export const WATER_LEVEL = -0.18;
export const TERRAIN_SIZE = 72;

export function seededRandom(seed: number) {
	let state = seed >>> 0;
	return () => {
		state = (state * 1664525 + 1013904223) >>> 0;
		return state / 4294967296;
	};
}

export function toWorld(point: Point): { x: number; z: number } {
	return {
		x: (point.x - MAP_WIDTH / 2) / WORLD_SCALE,
		z: (point.y - MAP_HEIGHT / 2) / WORLD_SCALE
	};
}

export function toMap(x: number, z: number): Point {
	return { x: x * WORLD_SCALE + MAP_WIDTH / 2, y: z * WORLD_SCALE + MAP_HEIGHT / 2 };
}

export function pondDistance(x: number, z: number) {
	const p = toMap(x, z);
	return Math.hypot((p.x - POND.x) / POND.rx, (p.y - POND.y) / POND.ry);
}

export function terrainHeight(x: number, z: number) {
	const hill = Math.exp(-((x + 8) ** 2 / 22 + (z + 3) ** 2 / 34)) * 1.45;
	const base =
		Math.sin(x * 0.42) * Math.cos(z * 0.31) * 0.15 + Math.sin(z * 0.7 + x * 0.2) * 0.06 + hill;
	const pond = Math.max(0, Math.min(1, (1.2 - pondDistance(x, z)) / 0.38));
	return base * (1 - pond) - pond * 0.75;
}

export function createTerrainGeometry() {
	const geometry = new PlaneGeometry(TERRAIN_SIZE, TERRAIN_SIZE, 180, 180);
	geometry.rotateX(-Math.PI / 2);
	const points = geometry.attributes.position;
	for (let i = 0; i < points.count; i++)
		points.setY(i, terrainHeight(points.getX(i), points.getZ(i)));
	geometry.computeVertexNormals();
	return geometry;
}

export function pathDistance(x: number, z: number) {
	const p = toMap(x, z);
	const main = Math.abs(p.x - (760 + Math.sin(p.y / 210) * 100)) / WORLD_SCALE;
	const branch =
		p.x >= 680 && p.x <= 1070
			? Math.abs(p.y - (810 - (p.x - 720) * 0.25)) / WORLD_SCALE
			: Infinity;
	return Math.min(main, branch);
}

export function createCamera(aspect: number) {
	const camera = new PerspectiveCamera(38, aspect, 0.15, 110);
	positionCamera(camera, new Vector3(0, 0.8, 0), false);
	return camera;
}

export function positionCamera(camera: PerspectiveCamera, target: Vector3, mobile: boolean) {
	const distance = mobile ? 23.5 : 21;
	const horizontal = Math.cos(CAMERA_ELEVATION) * distance;
	camera.position.set(
		target.x + Math.sin(CAMERA_YAW) * horizontal,
		target.y + Math.sin(CAMERA_ELEVATION) * distance,
		target.z + Math.cos(CAMERA_YAW) * horizontal
	);
	camera.lookAt(target);
	camera.updateMatrixWorld();
}
