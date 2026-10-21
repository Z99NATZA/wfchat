import { describe, expect, it } from "vitest";
import { Mesh, MeshBasicMaterial, Raycaster, Vector2, Vector3 } from "three";
import { START } from "./willowMap";
import {
	createCamera,
	createTerrainGeometry,
	positionCamera,
	terrainHeight,
	toWorld
} from "./willowTerrain";

describe("Willow Glade 3D view", () => {
	it("keeps the camera low enough to show the sides of objects on both desktop and mobile", () => {
		for (const aspect of [1.6, 0.45]) {
			const camera = createCamera(aspect);
			positionCamera(camera, new Vector3(0, 1, 0), aspect < 1);
			const view = camera.getWorldDirection(new Vector3());
			expect(Math.abs(view.y)).toBeLessThan(0.6);
			expect(Math.hypot(view.x, view.z)).toBeGreaterThan(0.8);
		}
	});

	it("raycasts screen clicks onto actual raised terrain instead of a flat image plane", () => {
		const geometry = createTerrainGeometry();
		const material = new MeshBasicMaterial();
		const ground = new Mesh(geometry, material);
		ground.updateMatrixWorld();
		try {
			const points = [toWorld(START), { x: -8, z: -3 }, { x: 0, z: 0 }];
			for (const point of points) {
				const foot = new Vector3(point.x, terrainHeight(point.x, point.z), point.z);
				const camera = createCamera(1.6);
				positionCamera(camera, foot.clone().add(new Vector3(0, 0.8, 0)), false);
				const projected = foot.clone().project(camera);
				const ray = new Raycaster();
				ray.setFromCamera(new Vector2(projected.x, projected.y), camera);
				const hit = ray.intersectObject(ground)[0];
				expect(hit).toBeDefined();
				expect(hit.point.distanceTo(foot)).toBeLessThan(0.025);
			}
			const heights = geometry.attributes.position;
			let lowest = Infinity,
				highest = -Infinity;
			for (let i = 0; i < heights.count; i++) {
				lowest = Math.min(lowest, heights.getY(i));
				highest = Math.max(highest, heights.getY(i));
			}
			expect(highest - lowest).toBeGreaterThan(1.5);
		} finally {
			geometry.dispose();
			material.dispose();
		}
	});
});
