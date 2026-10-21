import * as THREE from "three";
import { mergeGeometries, mergeVertices } from "three/addons/utils/BufferGeometryUtils.js";
import { POND, PROPS } from "./willowMap";
import {
	createTerrainGeometry,
	pathDistance,
	pondDistance,
	seededRandom,
	terrainHeight,
	toWorld,
	TERRAIN_SIZE,
	WATER_LEVEL
} from "./willowTerrain";

const UP = new THREE.Vector3(0, 1, 0);
const sphere = new THREE.SphereGeometry(1, 16, 12);
const box = new THREE.BoxGeometry(1, 1, 1);

function material(color: THREE.ColorRepresentation, roughness = 0.95) {
	return new THREE.MeshStandardMaterial({ color, roughness });
}

function shape(
	parent: THREE.Object3D,
	geometry: THREE.BufferGeometry,
	mat: THREE.Material,
	x: number,
	y: number,
	z: number,
	sx = 1,
	sy = 1,
	sz = 1
) {
	const mesh = new THREE.Mesh(geometry, mat);
	mesh.position.set(x, y, z);
	mesh.scale.set(sx, sy, sz);
	mesh.castShadow = true;
	mesh.receiveShadow = true;
	parent.add(mesh);
	return mesh;
}

function segment(from: THREE.Vector3, to: THREE.Vector3, radius: number) {
	const direction = to.clone().sub(from);
	const geometry = new THREE.CylinderGeometry(radius * 0.65, radius, direction.length(), 7);
	const rotation = new THREE.Quaternion().setFromUnitVectors(UP, direction.normalize());
	geometry.applyQuaternion(rotation);
	geometry.translate(...from.clone().add(to).multiplyScalar(0.5).toArray());
	return geometry;
}

function groundTexture() {
	const canvas = document.createElement("canvas");
	canvas.width = canvas.height = 1536;
	const ctx = canvas.getContext("2d")!;
	const random = seededRandom(91);
	const image = ctx.createImageData(canvas.width, canvas.height);
	for (let py = 0; py < canvas.height; py++) {
		for (let px = 0; px < canvas.width; px++) {
			const x = (px / canvas.width - 0.5) * TERRAIN_SIZE;
			const z = (py / canvas.height - 0.5) * TERRAIN_SIZE;
			const path = 1 - THREE.MathUtils.smoothstep(pathDistance(x, z), 0.8, 1.5);
			const variation =
				Math.sin(x * 0.6 + z * 0.7) * 5 + Math.cos(x * 1.5 - z * 0.8) * 3 + random() * 15;
			const offset = (py * canvas.width + px) * 4;
			for (let channel = 0; channel < 3; channel++) {
				image.data[offset + channel] =
					THREE.MathUtils.lerp([102, 127, 71][channel], [192, 173, 126][channel], path) +
					variation;
			}
			image.data[offset + 3] = 255;
		}
	}
	ctx.putImageData(image, 0, 0);
	for (let i = 0; i < 22000; i++) {
		const x = random() * canvas.width;
		const y = random() * canvas.height;
		ctx.fillStyle = i % 2 ? "#f1e9bb20" : "#294b3220";
		ctx.beginPath();
		ctx.ellipse(x, y, 0.5 + random() * 2, 0.4 + random(), random() * 6, 0, Math.PI * 2);
		ctx.fill();
	}
	const texture = new THREE.CanvasTexture(canvas);
	texture.colorSpace = THREE.SRGBColorSpace;
	texture.anisotropy = 4;
	return texture;
}

export function makeTerrain() {
	const geometry = createTerrainGeometry();
	const ground = new THREE.Mesh(
		geometry,
		new THREE.MeshStandardMaterial({ map: groundTexture(), roughness: 1 })
	);
	ground.receiveShadow = true;
	return ground;
}

type Canopy = {
	mesh: THREE.Mesh<THREE.BufferGeometry, THREE.MeshStandardMaterial>;
	center: THREE.Vector3;
	radius: number;
};

export function makeWoodland(scene: THREE.Scene) {
	const random = seededRandom(538);
	const rawFoliage = new THREE.IcosahedronGeometry(1, 1);
	rawFoliage.deleteAttribute("normal");
	rawFoliage.deleteAttribute("uv");
	const foliageShape = mergeVertices(rawFoliage);
	rawFoliage.dispose();
	const position = foliageShape.attributes.position;
	for (let i = 0; i < position.count; i++) {
		const x = position.getX(i),
			y = position.getY(i),
			z = position.getZ(i);
		const rough = 1 + Math.sin(x * 13 + y * 9 + z * 15) * 0.075;
		position.setXYZ(i, x * rough, y * rough, z * rough);
	}
	foliageShape.computeVertexNormals();
	const leafOutline = new THREE.Shape();
	leafOutline.moveTo(0, -0.11);
	leafOutline.quadraticCurveTo(0.075, 0, 0.015, 0.13);
	leafOutline.quadraticCurveTo(-0.075, 0.02, 0, -0.11);
	const leafShape = new THREE.ShapeGeometry(leafOutline, 2);
	leafShape.deleteAttribute("uv");
	const treePoints = PROPS.filter((p) => ["oak", "golden", "willow"].includes(p.frame)).map(
		(p) => ({ ...toWorld(p), seed: p.seed })
	);
	for (let i = 0; i < 24; i++) {
		const x = -21 + random() * 44;
		const z = -12 - random() * 17;
		treePoints.push({ x, z, seed: i + 50 });
	}
	for (let i = 0; i < 9; i++)
		treePoints.push({ x: -16 - random() * 5, z: -8 + i * 2.4, seed: i + 100 });
	const trunks: THREE.BufferGeometry[] = [];
	const canopies: Canopy[] = [];
	for (const tree of treePoints) {
		const rand = seededRandom(tree.seed * 73);
		const base = new THREE.Vector3(tree.x, terrainHeight(tree.x, tree.z) - 0.03, tree.z);
		const height = 3.4 + rand() * 1.3;
		const bend = new THREE.Vector3(
			(rand() - 0.5) * 0.7,
			height * 0.65,
			(rand() - 0.5) * 0.6
		).add(base);
		const crown = base.clone().add(new THREE.Vector3((rand() - 0.5) * 0.9, height, 0));
		trunks.push(segment(base, bend, 0.26 + rand() * 0.12), segment(bend, crown, 0.18));
		for (let i = 0; i < 5; i++) {
			const angle = i * 2.4 + rand();
			const tip = crown
				.clone()
				.add(
					new THREE.Vector3(
						Math.cos(angle) * 1.4,
						-0.5 + rand() * 0.6,
						Math.sin(angle) * 1.4
					)
				);
			trunks.push(segment(bend.clone().lerp(crown, 0.3 + rand() * 0.2), tip, 0.11));
			const rootEnd = base
				.clone()
				.add(new THREE.Vector3(Math.cos(angle) * 0.7, -0.03, Math.sin(angle) * 0.7));
			trunks.push(segment(base.clone().add(new THREE.Vector3(0, 0.3, 0)), rootEnd, 0.12));
		}
		const clusters: THREE.BufferGeometry[] = [];
		const clusterCount = tree.z < -12 ? 15 : 24;
		for (let i = 0; i < clusterCount; i++) {
			const angle = i * 2.399;
			const radius = Math.sqrt(i / clusterCount) * 1.95;
			const center = crown
				.clone()
				.add(
					new THREE.Vector3(
						Math.cos(angle) * radius,
						(1 - radius / 2) * 0.7 + (rand() - 0.5) * 0.7,
						Math.sin(angle) * radius * 0.85
					)
				);
			const cluster = foliageShape.clone();
			const sx = 0.65 + rand() * 0.45,
				sy = 0.65 + rand() * 0.5,
				sz = 0.65 + rand() * 0.4;
			cluster.scale(sx, sy, sz);
			cluster.translate(center.x, center.y, center.z);
			const color = new THREE.Color().setHSL(
				0.205 + rand() * 0.035,
				0.3 + rand() * 0.16,
				0.33 + rand() * 0.13,
				THREE.SRGBColorSpace
			);
			const colors = new Float32Array(cluster.attributes.position.count * 3);
			for (let j = 0; j < colors.length; j += 3) {
				colors[j] = color.r;
				colors[j + 1] = color.g;
				colors[j + 2] = color.b;
			}
			cluster.setAttribute("color", new THREE.BufferAttribute(colors, 3));
			clusters.push(cluster);
			for (let leafIndex = 0; leafIndex < 7; leafIndex++) {
				const normal = new THREE.Vector3(
					rand() - 0.5,
					rand() - 0.4,
					rand() - 0.5
				).normalize();
				const leaf = leafShape.clone();
				leaf.scale(0.9 + rand() * 0.5, 0.8 + rand() * 0.8, 1);
				leaf.rotateZ(rand() * Math.PI * 2);
				leaf.applyQuaternion(
					new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 0, 1), normal)
				);
				leaf.translate(
					center.x + normal.x * sx * 0.97,
					center.y + normal.y * sy * 0.97,
					center.z + normal.z * sz * 0.97
				);
				const leafColor = color.clone().multiplyScalar(0.9 + rand() * 0.5);
				const leafColors = new Float32Array(leaf.attributes.position.count * 3);
				for (let j = 0; j < leafColors.length; j += 3) {
					leafColors[j] = leafColor.r;
					leafColors[j + 1] = leafColor.g;
					leafColors[j + 2] = leafColor.b;
				}
				leaf.setAttribute("color", new THREE.BufferAttribute(leafColors, 3));
				clusters.push(leaf);
			}
		}
		const canopyGeometry = mergeGeometries(clusters)!;
		clusters.forEach((g) => g.dispose());
		const mesh = new THREE.Mesh(
			canopyGeometry,
			new THREE.MeshStandardMaterial({
				vertexColors: true,
				roughness: 1,
				transparent: true,
				side: THREE.DoubleSide
			})
		);
		mesh.castShadow = true;
		mesh.receiveShadow = true;
		scene.add(mesh);
		canopies.push({ mesh, center: crown, radius: 2.7 });
	}
	const trunkMesh = new THREE.Mesh(mergeGeometries(trunks)!, material("#74604a"));
	trunks.forEach((g) => g.dispose());
	foliageShape.dispose();
	leafShape.dispose();
	trunkMesh.castShadow = trunkMesh.receiveShadow = true;
	scene.add(trunkMesh);
	const shrubs: THREE.BufferGeometry[] = [];
	for (const prop of PROPS.filter((p) => p.frame === "fern")) {
		const p = toWorld(prop);
		for (let i = 0; i < 9; i++) {
			const angle = i * 2.399;
			const leaf = new THREE.SphereGeometry(1, 6, 4);
			leaf.scale(0.17, 0.08, 0.4);
			leaf.rotateX(-0.35);
			leaf.rotateY(angle);
			leaf.translate(
				p.x + Math.sin(angle) * 0.26,
				terrainHeight(p.x, p.z) + 0.15 + (i % 3) * 0.07,
				p.z + Math.cos(angle) * 0.26
			);
			shrubs.push(leaf);
		}
	}
	if (shrubs.length) {
		const shrub = new THREE.Mesh(mergeGeometries(shrubs)!, material("#6c8c4e"));
		shrub.castShadow = shrub.receiveShadow = true;
		scene.add(shrub);
		shrubs.forEach((g) => g.dispose());
	}
	return canopies;
}

export function makeMeadow(scene: THREE.Scene, wind: { value: number }) {
	const random = seededRandom(165);
	const geometry = new THREE.BufferGeometry();
	geometry.setAttribute(
		"position",
		new THREE.Float32BufferAttribute(
			[
				-0.05, 0, 0, 0.04, 0, 0, 0.025, 0.19, 0.025, -0.05, 0, 0, 0.025, 0.19, 0.025, -0.02,
				0.17, 0.025, -0.02, 0.17, 0.025, 0.025, 0.19, 0.025, 0.065, 0.36, 0.05
			],
			3
		)
	);
	geometry.computeVertexNormals();
	const mat = new THREE.MeshStandardMaterial({
		color: "#a4b877",
		roughness: 1,
		side: THREE.DoubleSide
	});
	mat.onBeforeCompile = (shader) => {
		shader.uniforms.willowWind = wind;
		shader.vertexShader = "uniform float willowWind;\n" + shader.vertexShader;
		shader.vertexShader = shader.vertexShader.replace(
			"#include <begin_vertex>",
			`#include <begin_vertex>
		transformed.x += sin(willowWind * 1.3 + instanceMatrix[3].x * 0.8 + instanceMatrix[3].z) * position.y * position.y * 0.25;`
		);
	};
	const blades = new THREE.InstancedMesh(geometry, mat, 15000);
	const dummy = new THREE.Object3D();
	let count = 0;
	for (let i = 0; i < 21000 && count < 15000; i++) {
		const x = -19 + random() * 38;
		const z = -18 + random() * 34;
		if (pathDistance(x, z) < 1.05 + random() * 0.3 || pondDistance(x, z) < 1.08) continue;
		dummy.position.set(x, terrainHeight(x, z), z);
		dummy.rotation.set(0, random() * Math.PI * 2, 0);
		dummy.scale.setScalar(0.65 + random() * 0.8);
		dummy.updateMatrix();
		blades.setMatrixAt(count, dummy.matrix);
		blades.setColorAt(
			count,
			new THREE.Color().setHSL(
				0.19 + random() * 0.07,
				0.25 + random() * 0.17,
				0.31 + random() * 0.18
			)
		);
		count++;
	}
	blades.count = count;
	blades.receiveShadow = true;
	scene.add(blades);
	const flowers = new THREE.InstancedMesh(
		new THREE.IcosahedronGeometry(0.055, 1),
		material("#ede1b1"),
		160
	);
	for (let i = 0; i < 160; i++) {
		const x = -11 + random() * 22,
			z = -8 + random() * 18;
		if (pathDistance(x, z) < 1.3 || pondDistance(x, z) < 1.1) {
			dummy.scale.setScalar(0);
		} else dummy.scale.setScalar(0.7 + random() * 0.6);
		dummy.position.set(x, terrainHeight(x, z) + 0.19, z);
		dummy.updateMatrix();
		flowers.setMatrixAt(i, dummy.matrix);
	}
	scene.add(flowers);
}

export function makeBench(scene: THREE.Scene) {
	const prop = PROPS.find((p) => p.frame === "bench")!;
	const p = toWorld(prop);
	const group = new THREE.Group();
	group.position.set(p.x, terrainHeight(p.x, p.z), p.z);
	group.rotation.y = -0.23;
	const wood = material("#ab8150");
	const edge = material("#805d3c");
	const iron = material("#424d43", 0.7);
	for (const x of [-0.82, 0.82]) {
		for (const z of [-0.28, 0.28]) shape(group, box, iron, x, 0.31, z, 0.09, 0.62, 0.1);
		shape(group, box, iron, x, 0.89, -0.3, 0.07, 0.8, 0.08);
		shape(group, box, edge, x, 0.55, 0, 0.1, 0.12, 0.88);
	}
	for (let i = 0; i < 4; i++) shape(group, box, wood, 0, 0.66, -0.3 + i * 0.2, 2.1, 0.095, 0.18);
	for (const y of [0.96, 1.2]) shape(group, box, wood, 0, y, -0.32, 2.1, 0.2, 0.09);
	for (const x of [-0.83, 0.83])
		for (const y of [0.96, 1.2]) shape(group, sphere, iron, x, y, -0.26, 0.025, 0.025, 0.02);
	scene.add(group);
}

export function makeRocks(scene: THREE.Scene) {
	const random = seededRandom(67);
	const rockShape = new THREE.IcosahedronGeometry(1, 1);
	const stone = material("#8e9685");
	const moss = material("#6f8050");
	const pond = toWorld(POND);
	const points = PROPS.filter((p) => p.frame === "rock").map((p) => ({
		...toWorld(p),
		size: p.width / 160
	}));
	for (let i = 0; i < 45; i++) {
		const angle = (i / 45) * Math.PI * 2;
		points.push({
			x: pond.x + ((Math.cos(angle) * POND.rx) / 65) * 1.07,
			z: pond.z + ((Math.sin(angle) * POND.ry) / 65) * 1.07,
			size: 0.17 + random() * 0.16
		});
	}
	for (const point of points) {
		const y = terrainHeight(point.x, point.z);
		const rock = shape(
			scene,
			rockShape,
			stone,
			point.x,
			y + point.size * 0.2,
			point.z,
			point.size,
			point.size * 0.65,
			point.size * 0.75
		);
		rock.rotation.set(random() * 0.5, random() * 6, random() * 0.4);
		shape(
			scene,
			rockShape,
			moss,
			point.x - point.size * 0.1,
			y + point.size * 0.56,
			point.z,
			point.size * 0.68,
			point.size * 0.12,
			point.size * 0.5
		);
	}
	// Thin stones embedded in the trail have real side faces and receive shadows.
	for (let i = 0; i < 19; i++) {
		const y = 580 + i * 28;
		const p = toWorld({ x: 760 + Math.sin(y / 210) * 100 + (i % 2 ? 18 : -18), y });
		const stone = shape(
			scene,
			new THREE.CylinderGeometry(0.29, 0.31, 0.07, 6),
			material(i % 2 ? "#bcb9a0" : "#abae95"),
			p.x,
			terrainHeight(p.x, p.z) + 0.025,
			p.z
		);
		stone.scale.z = 0.7;
		stone.rotation.y = random() * 6;
	}
}

export function makePond(scene: THREE.Scene, time: { value: number }) {
	const p = toWorld(POND);
	const geometry = new THREE.CircleGeometry(1, 80);
	geometry.rotateX(-Math.PI / 2);
	geometry.scale((POND.rx / 65) * 1.025, 1, (POND.ry / 65) * 1.025);
	const mat = new THREE.MeshStandardMaterial({
		color: "#6baca1",
		roughness: 0.24,
		metalness: 0.08,
		transparent: true,
		opacity: 0.88
	});
	mat.onBeforeCompile = (shader) => {
		shader.uniforms.willowTime = time;
		shader.vertexShader = "varying vec3 willowPosition;\n" + shader.vertexShader;
		shader.vertexShader = shader.vertexShader.replace(
			"#include <begin_vertex>",
			"#include <begin_vertex>\nwillowPosition = position;"
		);
		shader.fragmentShader =
			"uniform float willowTime;\nvarying vec3 willowPosition;\n" + shader.fragmentShader;
		shader.fragmentShader = shader.fragmentShader.replace(
			"#include <color_fragment>",
			`#include <color_fragment>
		float ripple = sin(willowPosition.x * 7.0 + sin(willowPosition.z * 4.0 + willowTime * 0.5) + willowTime) * sin(willowPosition.z * 9.0 - willowTime * 0.7);
		diffuseColor.rgb += smoothstep(0.72, 1.0, ripple) * 0.12;`
		);
	};
	const water = new THREE.Mesh(geometry, mat);
	water.position.set(p.x, WATER_LEVEL, p.z);
	water.receiveShadow = true;
	scene.add(water);
	const leaf = material("#668755");
	for (const [dx, dz] of [
		[-0.9, 0.6],
		[-0.6, 0.75],
		[1.05, -0.4]
	]) {
		const pad = shape(
			scene,
			new THREE.CircleGeometry(0.25, 20, 0.12, Math.PI * 1.85),
			leaf,
			p.x + dx,
			WATER_LEVEL + 0.02,
			p.z + dz
		);
		pad.rotation.x = -Math.PI / 2;
		pad.castShadow = false;
	}
}

export function makeTraveller() {
	const root = new THREE.Group();
	const body = new THREE.Group();
	root.add(body);
	const cream = material("#ddd1ae"),
		skin = material("#edc6a3"),
		hair = material("#65503b");
	const green = material("#6b8559"),
		scarf = material("#608c7e"),
		leather = material("#77583a"),
		dark = material("#3e4139");
	const legs: THREE.Group[] = [],
		arms: THREE.Group[] = [];
	for (const side of [-1, 1]) {
		const leg = new THREE.Group();
		leg.position.set(side * 0.13, 0.53, 0);
		body.add(leg);
		legs.push(leg);
		shape(leg, new THREE.CapsuleGeometry(0.085, 0.25, 4, 8), material("#6c6954"), 0, -0.19, 0);
		shape(leg, sphere, leather, 0, -0.43, 0.055, 0.11, 0.105, 0.17);
		const arm = new THREE.Group();
		arm.position.set(side * 0.29, 1.04, 0);
		body.add(arm);
		arms.push(arm);
		shape(arm, new THREE.CapsuleGeometry(0.09, 0.24, 4, 8), cream, 0, -0.17, 0);
		shape(arm, sphere, skin, 0, -0.38, 0, 0.085, 0.095, 0.08);
	}
	shape(body, new THREE.CylinderGeometry(0.22, 0.32, 0.59, 12), cream, 0, 0.83, 0);
	for (const y of [0.69, 0.82, 0.95])
		shape(body, sphere, leather, 0.035, y, 0.255, 0.022, 0.022, 0.018);
	shape(body, sphere, hair, 0, 1.39, -0.02, 0.335, 0.37, 0.31);
	shape(body, sphere, skin, 0, 1.38, 0.1, 0.278, 0.305, 0.238);
	for (const side of [-1, 1]) {
		shape(body, sphere, skin, side * 0.285, 1.35, 0.03, 0.065, 0.085, 0.055);
		shape(body, sphere, hair, side * 0.27, 1.42, 0.08, 0.085, 0.23, 0.09);
		shape(body, sphere, dark, side * 0.105, 1.4, 0.31, 0.034, 0.055, 0.018);
		shape(
			body,
			sphere,
			material("#fff4d8"),
			side * 0.105 - 0.007,
			1.42,
			0.327,
			0.009,
			0.013,
			0.006
		);
		shape(body, sphere, material("#dca28d"), side * 0.17, 1.31, 0.285, 0.055, 0.027, 0.012);
	}
	shape(body, sphere, skin, 0, 1.33, 0.34, 0.04, 0.045, 0.04);
	for (let i = 0; i < 5; i++) {
		const fringe = shape(
			body,
			new THREE.ConeGeometry(0.09, 0.23, 6),
			hair,
			-0.21 + i * 0.1,
			1.57 + Math.sin(i) * 0.025,
			0.245
		);
		fringe.rotation.z = Math.PI + (i - 2) * 0.16;
	}
	shape(body, sphere, green, -0.025, 1.75, 0, 0.42, 0.17, 0.37).rotation.z = -0.1;
	shape(
		body,
		new THREE.CylinderGeometry(0.34, 0.35, 0.065, 24),
		material("#536e46"),
		0,
		1.66,
		0.015
	);
	shape(body, sphere, material("#c5c38b"), -0.31, 1.73, 0.2, 0.04, 0.095, 0.018).rotation.z =
		-0.5;
	shape(body, new THREE.TorusGeometry(0.17, 0.055, 6, 20), scarf, 0, 1.13, 0).rotation.x =
		Math.PI / 2;
	shape(body, box, scarf, -0.1, 0.97, 0.25, 0.12, 0.29, 0.055).rotation.z = -0.18;
	shape(body, box, leather, 0.08, 0.89, 0.26, 0.045, 0.55, 0.035).rotation.z = -0.65;
	shape(body, sphere, leather, 0.32, 0.71, 0.05, 0.14, 0.17, 0.09);
	shape(body, sphere, material("#a18151"), 0.33, 0.78, 0.09, 0.14, 0.08, 0.06);
	root.scale.setScalar(1.12);
	return { root, body, legs, arms };
}

export function disposeWorld(scene: THREE.Scene) {
	const geometries = new Set<THREE.BufferGeometry>();
	const materials = new Set<THREE.Material>();
	const textures = new Set<THREE.Texture>();
	scene.traverse((object) => {
		if (!(object instanceof THREE.Mesh)) return;
		geometries.add(object.geometry);
		for (const mat of Array.isArray(object.material) ? object.material : [object.material]) {
			materials.add(mat);
			for (const value of Object.values(mat))
				if (value instanceof THREE.Texture) textures.add(value);
		}
		if (object instanceof THREE.InstancedMesh) object.dispose();
	});
	geometries.forEach((geometry) => geometry.dispose());
	materials.forEach((mat) => mat.dispose());
	textures.forEach((texture) => texture.dispose());
}
