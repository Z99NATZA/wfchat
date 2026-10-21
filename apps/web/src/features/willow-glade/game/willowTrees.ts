import * as THREE from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import { PROPS } from "./willowMap";
import { seededRandom, terrainHeight, toWorld } from "./willowTerrain";

type Canopy = {
	mesh: THREE.Mesh<THREE.BufferGeometry, THREE.MeshStandardMaterial>;
	shadow: THREE.Mesh;
	center: THREE.Vector3;
	radius: number;
};

export type TreeTextures = { foliage: THREE.Texture; bark: THREE.Texture };

export function disposeTreeTextures(textures: TreeTextures) {
	textures.foliage.dispose();
	textures.bark.dispose();
}

export async function loadTreeTextures(): Promise<TreeTextures> {
	const loader = new THREE.TextureLoader();
	const results = await Promise.allSettled([
		loader.loadAsync("/images/willow-glade/foliage-cluster-v1.png"),
		loader.loadAsync("/images/willow-glade/oak-bark-v1.png")
	]);
	if (results.some((result) => result.status === "rejected")) {
		for (const result of results) if (result.status === "fulfilled") result.value.dispose();
		throw new Error("Could not load woodland textures");
	}
	const [foliage, bark] = results.map(
		(result) => (result as PromiseFulfilledResult<THREE.Texture>).value
	);
	for (const texture of [foliage, bark]) {
		texture.colorSpace = THREE.SRGBColorSpace;
		texture.anisotropy = 4;
	}
	bark.wrapS = bark.wrapT = THREE.RepeatWrapping;
	return { foliage, bark };
}

/** Curved taper, flared base and irregular bark relief with continuous UVs. */
function wood(points: THREE.Vector3[], start: number, end: number, seed: number) {
	const curve = new THREE.CatmullRomCurve3(points);
	const rings = 14,
		sides = 14;
	const geometry = new THREE.TubeGeometry(curve, rings, 1, sides, false);
	const frames = curve.computeFrenetFrames(rings, false);
	const positions = geometry.attributes.position;
	const uv = geometry.attributes.uv;
	const colors: number[] = [];
	for (let ring = 0; ring <= rings; ring++) {
		const t = ring / rings;
		const center = curve.getPointAt(t);
		const radius = THREE.MathUtils.lerp(start, end, Math.pow(t, 0.7));
		for (let side = 0; side <= sides; side++) {
			const angle = (side / sides) * Math.PI * 2;
			const ridge = 1 + Math.sin(angle * 5 + seed + t * 1.5) * 0.055;
			const point = center
				.clone()
				.addScaledVector(frames.normals[ring], -Math.cos(angle) * radius * ridge)
				.addScaledVector(frames.binormals[ring], Math.sin(angle) * radius * ridge);
			const index = ring * (sides + 1) + side;
			positions.setXYZ(index, point.x, point.y, point.z);
			uv.setXY(index, side / sides, t * Math.max(0.4, curve.getLength() / 2));
			const color = new THREE.Color("#ddd6bb").lerp(
				new THREE.Color("#92a582"),
				Math.max(0, 0.2 - t) * 2
			);
			colors.push(color.r, color.g, color.b);
		}
	}
	geometry.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3));
	geometry.computeVertexNormals();
	return geometry;
}

export function makeTrees(scene: THREE.Scene, textures: TreeTextures): Canopy[] {
	const random = seededRandom(538);
	const trees = PROPS.filter((p) => ["oak", "golden", "willow"].includes(p.frame)).map((p) => ({
		...toWorld(p),
		seed: p.seed,
		distant: false,
		willow: p.frame === "willow"
	}));
	for (let i = 0; i < 24; i++)
		trees.push({
			x: -21 + random() * 44,
			z: -12 - random() * 17,
			seed: i + 50,
			distant: true,
			willow: false
		});
	for (let i = 0; i < 9; i++)
		trees.push({
			x: -16 - random() * 5,
			z: -8 + i * 2.4,
			seed: i + 100,
			distant: true,
			willow: false
		});
	const trunks: THREE.BufferGeometry[] = [];
	const canopies: Canopy[] = [];
	for (const tree of trees) {
		const rand = seededRandom(tree.seed * 73);
		const base = new THREE.Vector3(tree.x, terrainHeight(tree.x, tree.z) - 0.04, tree.z);
		const height = 4.1 + rand() * 1.3;
		const lean = new THREE.Vector3((rand() - 0.5) * 1.55, 0, (rand() - 0.5) * 0.7);
		const at = (t: number) =>
			base
				.clone()
				.addScaledVector(lean, t * t)
				.add(new THREE.Vector3(Math.sin(t * 4) * 0.15, height * t, 0));
		const thickness = 0.39 + rand() * 0.06;
		trunks.push(wood([at(0), at(0.2), at(0.5), at(0.8), at(1)], thickness, 0.07, tree.seed));
		for (let i = 0; i < 6; i++) {
			const angle = i * 2.399 + tree.seed;
			const length = 0.65 + rand() * 0.3;
			const tip = base
				.clone()
				.add(new THREE.Vector3(Math.cos(angle) * length, 0, Math.sin(angle) * length));
			tip.y = terrainHeight(tip.x, tip.z) - 0.025;
			const knee = base.clone().lerp(tip, 0.45);
			knee.y += 0.1;
			trunks.push(wood([at(0.08), knee, tip], thickness * 0.48, 0.012, tree.seed + i));
		}

		const cards: THREE.BufferGeometry[] = [];
		const shadowClusters: THREE.BufferGeometry[] = [];
		const foliageTint = new THREE.Color().setHSL(0.23 + rand() * 0.025, 0.12, 0.88);
		const branchCount = tree.distant ? 7 : 9;
		for (let branch = 0; branch < branchCount; branch++) {
			// Different branch lengths and rising forks avoid horizontal shelves.
			const angle = branch * 2.399 + tree.seed + (rand() - 0.5) * 0.9;
			const crown = branch === branchCount - 1;
			const reach = crown ? 0.3 : 0.95 + rand() * 1.15;
			const start = at(crown ? 0.8 : 0.42 + rand() * 0.32);
			const elbow = start
				.clone()
				.add(
					new THREE.Vector3(
						Math.cos(angle) * reach * 0.5,
						0.25 + rand() * 0.3,
						Math.sin(angle) * reach * 0.5
					)
				);
			const tip = start
				.clone()
				.add(
					new THREE.Vector3(
						Math.cos(angle) * reach,
						crown ? height * 0.23 : 0.8 + rand() * 1.2,
						Math.sin(angle) * reach
					)
				);
			trunks.push(
				wood([start, elbow, tip], 0.15 + rand() * 0.035, 0.025, branch + tree.seed)
			);
			for (let fork = 0; fork < 3; fork++) {
				const direction = angle + (fork - 1) * 0.8;
				const center = elbow
					.clone()
					.lerp(tip, 0.8)
					.add(
						new THREE.Vector3(
							Math.cos(direction) * 0.45,
							(rand() - 0.5) * 0.45,
							Math.sin(direction) * 0.45
						)
					);
				trunks.push(
					wood(
						[
							elbow,
							center
								.clone()
								.lerp(elbow, 0.4)
								.add(new THREE.Vector3(0, 0.12, 0)),
							center
						],
						0.045,
						0.008,
						fork
					)
				);
				const size = (tree.distant ? 1.65 : 1.55) + rand() * 0.4;
				const shadowCluster = new THREE.IcosahedronGeometry(1, 0);
				shadowCluster.scale(size * 0.38, size * 0.28, size * 0.38);
				shadowCluster.translate(center.x, center.y, center.z);
				shadowClusters.push(shadowCluster);
				// Crossed, gently curved leaf clusters occupy real volume. These are
				// fixed world geometry, not camera-facing whole-tree billboards.
				for (let layer = 0; layer < (tree.distant ? 1 : 2); layer++) {
					const card = new THREE.PlaneGeometry(size, size * 0.8, 2, 2);
					const positions = card.attributes.position;
					for (let i = 0; i < positions.count; i++) {
						const x = positions.getX(i),
							y = positions.getY(i);
						positions.setZ(i, 0.18 * (1 - ((x / size) * 2) ** 2) - y * y * 0.12);
					}
					card.computeVertexNormals();
					card.rotateX(-0.25 - rand() * 0.45 - (layer === 1 ? 0.55 : 0));
					card.rotateY(direction + (layer * Math.PI) / 3 + rand() * 0.3);
					card.rotateZ((rand() - 0.5) * 0.3);
					card.translate(
						center.x,
						center.y + (layer - 1) * 0.13 - (tree.willow && fork === 2 ? 0.35 : 0),
						center.z
					);
					const color = foliageTint
						.clone()
						.multiplyScalar(
							0.68 + rand() * 0.24 + ((center.y - base.y) / height) * 0.12
						);
					const colors = new Float32Array(positions.count * 3);
					for (let i = 0; i < positions.count; i++)
						colors.set([color.r, color.g, color.b], i * 3);
					card.setAttribute("color", new THREE.BufferAttribute(colors, 3));
					cards.push(card);
				}
			}
		}
		const geometry = mergeGeometries(cards)!;
		cards.forEach((card) => card.dispose());
		geometry.computeBoundingSphere();
		const mesh = new THREE.Mesh(
			geometry,
			new THREE.MeshStandardMaterial({
				map: textures.foliage,
				alphaTest: 0.3,
				vertexColors: true,
				roughness: 1,
				side: THREE.DoubleSide,
				transparent: true,
				forceSinglePass: true
			})
		);
		mesh.receiveShadow = true;
		// Opaque low-detail shadow volumes avoid sampling hundreds of overlapping
		// alpha textures again for every moving-character shadow update.
		const shadow = new THREE.Mesh(
			mergeGeometries(shadowClusters)!,
			new THREE.MeshBasicMaterial({ colorWrite: false, depthWrite: false })
		);
		shadowClusters.forEach((cluster) => cluster.dispose());
		shadow.castShadow = true;
		scene.add(shadow);
		scene.add(mesh);
		const bounds = geometry.boundingSphere!;
		canopies.push({ mesh, shadow, center: bounds.center.clone(), radius: bounds.radius });
	}
	const trunkMesh = new THREE.Mesh(
		mergeGeometries(trunks)!,
		new THREE.MeshStandardMaterial({
			map: textures.bark,
			bumpMap: textures.bark,
			bumpScale: 0.055,
			vertexColors: true,
			roughness: 0.95
		})
	);
	trunks.forEach((geometry) => geometry.dispose());
	trunkMesh.castShadow = trunkMesh.receiveShadow = true;
	scene.add(trunkMesh);
	return canopies;
}
