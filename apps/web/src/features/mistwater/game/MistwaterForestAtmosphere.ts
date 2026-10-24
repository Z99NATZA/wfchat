import Phaser from "phaser";
import {
	MISTWATER_FOLIAGE_LAYERS,
	MISTWATER_LEAF_SOURCE_AREAS,
	MISTWATER_TREE_OBJECTS,
	MISTWATER_WORLD_HEIGHT,
	MISTWATER_WORLD_WIDTH,
	type MistwaterTreeObject,
	isMistwaterWaterPoint
} from "@/features/mistwater/game/mistwaterMap";
import {
	MistwaterWindModel,
	beerLambertTransmittance,
	integrateLeafMotion,
	leafPigmentTint,
	smoothValueNoise
} from "@/features/mistwater/game/mistwaterForestPhysics";

const DAPPLE_TEXTURE_KEY = "mistwater-forest-dapple";
const CANOPY_SHADOW_TEXTURE_KEY = "mistwater-canopy-shadow";
const LEAF_TEXTURE_KEY = "mistwater-falling-leaf";
const DAPPLE_WIDTH = 288;
const DAPPLE_HEIGHT = 144;
const DAPPLE_REFRESH_MS = 100;
const MAX_LEAVES = 36;
const TAU = Math.PI * 2;

type FoliageLayer = {
	image: Phaser.GameObjects.Image;
	kind: "branch" | "understory";
	baseScale: number;
	baseRotation: number;
	sway: number;
	phase: number;
	depthFactor: number;
};

type TreeLayer = {
	definition: MistwaterTreeObject;
	trunk: Phaser.GameObjects.Image;
	crown: Phaser.GameObjects.Image;
};

type LeafState = {
	image: Phaser.GameObjects.Image;
	active: boolean;
	age: number;
	lifetime: number;
	velocityX: number;
	velocityY: number;
	flutterPhase: number;
	flutterFrequency: number;
	rotationVelocity: number;
};

export type MistwaterForestAtmosphere = {
	update: (time: number, delta: number) => void;
	addTree: (tree: MistwaterTreeObject) => boolean;
	removeTree: (id: string) => boolean;
	moveTree: (id: string, x: number, y: number) => boolean;
};

export function createMistwaterForestAtmosphere(scene: Phaser.Scene): MistwaterForestAtmosphere {
	const windModel = new MistwaterWindModel();
	const random = createSeededRandom(0xf04e57);
	const treeLayers = new Map<string, TreeLayer>();
	for (const tree of MISTWATER_TREE_OBJECTS) {
		addTreeLayer(scene, treeLayers, tree);
	}
	const foliageLayers = createFoliageLayers(scene);
	const dapple = createDappleLayer(scene);
	const leaves = createLeafPool(scene);
	let dappleAccumulator = 0;
	let leafAccumulator = 0;

	return {
		update(time: number, delta: number) {
			const timeSeconds = time * 0.001;
			const deltaSeconds = Math.min(delta, 50) * 0.001;
			windModel.update(timeSeconds);
			const broadWind = windModel.sample(timeSeconds);

			updateTreeCrowns(treeLayers.values(), windModel, timeSeconds);
			updateFoliage(foliageLayers, windModel, timeSeconds);

			dappleAccumulator += Math.min(delta, 100);
			if (dapple && dappleAccumulator >= DAPPLE_REFRESH_MS) {
				dapple.render(timeSeconds, broadWind.x, broadWind.y);
				dappleAccumulator %= DAPPLE_REFRESH_MS;
			}

			leafAccumulator += deltaSeconds * (0.18 + broadWind.gust * 3.2);
			while (leafAccumulator >= 1) {
				spawnLeaf(leaves, random);
				leafAccumulator -= 1;
			}
			updateLeaves(leaves, windModel, timeSeconds, deltaSeconds);
		},
		addTree(tree: MistwaterTreeObject) {
			return addTreeLayer(scene, treeLayers, tree);
		},
		removeTree(id: string) {
			const layer = treeLayers.get(id);
			if (!layer) {
				return false;
			}
			layer.trunk.destroy();
			layer.crown.destroy();
			treeLayers.delete(id);
			return true;
		},
		moveTree(id: string, x: number, y: number) {
			const layer = treeLayers.get(id);
			if (!layer || !isTreePositionValid(x, y)) {
				return false;
			}
			layer.definition.x = x;
			layer.definition.y = y;
			positionTreeLayer(layer);
			return true;
		}
	};
}

function addTreeLayer(
	scene: Phaser.Scene,
	trees: Map<string, TreeLayer>,
	tree: MistwaterTreeObject
): boolean {
	if (
		trees.has(tree.id) ||
		tree.id.trim().length === 0 ||
		!Number.isFinite(tree.scale) ||
		tree.scale <= 0 ||
		!isTreePositionValid(tree.x, tree.y)
	) {
		return false;
	}
	const definition = { ...tree };
	const shapeX = treeWidthScale(definition);
	const trunk = scene.add
		.image(definition.x, definition.y, "mistwater-tree-trunk")
		.setOrigin(0.5, 1)
		.setScale(definition.scale * shapeX, definition.scale)
		.setFlipX(definition.flipX)
		.setRotation(definition.rotation)
		.setTint(definition.tint);
	const crown = scene.add
		.image(
			definition.x + definition.crownOffsetX,
			definition.y + definition.crownOffsetY,
			"mistwater-tree-crown"
		)
		.setOrigin(0.5, 0.92)
		.setScale(definition.scale * shapeX, definition.scale)
		.setFlipX(definition.flipX)
		.setRotation(definition.rotation * 0.45)
		.setTint(definition.tint);
	const layer = { definition, trunk, crown };
	positionTreeLayer(layer);
	trees.set(definition.id, layer);
	return true;
}

function positionTreeLayer(layer: TreeLayer) {
	const tree = layer.definition;
	const depth = 2.24 + (tree.y / MISTWATER_WORLD_HEIGHT) * 1.45;
	layer.trunk.setPosition(tree.x, tree.y).setDepth(depth);
	layer.crown
		.setPosition(tree.x + tree.crownOffsetX, tree.y + tree.crownOffsetY)
		.setDepth(depth + 0.01);
}

function updateTreeCrowns(
	trees: Iterable<TreeLayer>,
	windModel: MistwaterWindModel,
	timeSeconds: number
) {
	for (const layer of trees) {
		const tree = layer.definition;
		const wind = windModel.sample(
			timeSeconds,
			tree.x / MISTWATER_WORLD_WIDTH,
			tree.y / MISTWATER_WORLD_HEIGHT
		);
		const branchFlutter = Math.sin(timeSeconds * 1.13 + tree.phase) * 0.0028;
		const shapeX = treeWidthScale(tree);
		const bend =
			(wind.x * 0.022 + branchFlutter * (0.35 + wind.strength)) *
			tree.sway *
			tree.depthFactor;
		layer.crown.rotation = tree.rotation * 0.45 + bend;
		layer.crown.setScale(
			tree.scale * shapeX * (1 + wind.x * 0.006 * tree.depthFactor),
			tree.scale * (1 - wind.strength * 0.0025 * tree.depthFactor)
		);
	}
}

function treeWidthScale(tree: MistwaterTreeObject): number {
	return 0.9 + (Math.sin(tree.phase * 12.9) * 0.5 + 0.5) * 0.18;
}

function isTreePositionValid(x: number, y: number): boolean {
	return (
		x >= 0 &&
		x <= MISTWATER_WORLD_WIDTH &&
		y >= 0 &&
		y <= MISTWATER_WORLD_HEIGHT &&
		!isMistwaterWaterPoint(x, y)
	);
}

function createFoliageLayers(scene: Phaser.Scene): FoliageLayer[] {
	return MISTWATER_FOLIAGE_LAYERS.map((layer) => {
		const image = scene.add
			.image(layer.x, layer.y, `mistwater-${layer.kind}`)
			.setOrigin(layer.originX, layer.originY)
			.setScale(layer.scale)
			.setFlipX(layer.flipX)
			.setRotation(layer.rotation)
			.setAlpha(layer.alpha)
			.setTint(layer.tint)
			.setDepth(layer.depth);
		return {
			image,
			kind: layer.kind,
			baseScale: layer.scale,
			baseRotation: layer.rotation,
			sway: layer.sway,
			phase: layer.phase,
			depthFactor: layer.depthFactor
		};
	});
}

function updateFoliage(layers: FoliageLayer[], windModel: MistwaterWindModel, timeSeconds: number) {
	for (const layer of layers) {
		const wind = windModel.sample(
			timeSeconds,
			layer.image.x / MISTWATER_WORLD_WIDTH,
			layer.image.y / MISTWATER_WORLD_HEIGHT
		);
		const fineSway = Math.sin(timeSeconds * 1.28 + layer.phase) * (0.18 + wind.strength);
		const motion = layer.sway * layer.depthFactor;
		const bend = (wind.x * 0.035 + fineSway * 0.006) * motion;
		const bendScale = layer.kind === "branch" ? 1 : 0.48;
		layer.image.rotation = layer.baseRotation + bend * bendScale;
		layer.image.setScale(
			layer.baseScale * (1 + wind.x * 0.012 * motion),
			layer.baseScale * (1 - wind.strength * 0.003 * motion)
		);
	}
}

function createDappleLayer(scene: Phaser.Scene): {
	render: (timeSeconds: number, windX: number, windY: number) => void;
} | null {
	if (scene.textures.exists(DAPPLE_TEXTURE_KEY)) {
		scene.textures.remove(DAPPLE_TEXTURE_KEY);
	}
	if (scene.textures.exists(CANOPY_SHADOW_TEXTURE_KEY)) {
		scene.textures.remove(CANOPY_SHADOW_TEXTURE_KEY);
	}
	const texture = scene.textures.createCanvas(DAPPLE_TEXTURE_KEY, DAPPLE_WIDTH, DAPPLE_HEIGHT);
	const shadowTexture = scene.textures.createCanvas(
		CANOPY_SHADOW_TEXTURE_KEY,
		DAPPLE_WIDTH,
		DAPPLE_HEIGHT
	);
	if (!texture || !shadowTexture) {
		return null;
	}
	const imageData = texture.context.createImageData(DAPPLE_WIDTH, DAPPLE_HEIGHT);
	const shadowImageData = shadowTexture.context.createImageData(DAPPLE_WIDTH, DAPPLE_HEIGHT);
	const landMask = new Uint8Array(DAPPLE_WIDTH * DAPPLE_HEIGHT);
	for (let y = 0; y < DAPPLE_HEIGHT; y += 1) {
		for (let x = 0; x < DAPPLE_WIDTH; x += 1) {
			const worldX = ((x + 0.5) / DAPPLE_WIDTH) * MISTWATER_WORLD_WIDTH;
			const worldY = ((y + 0.5) / DAPPLE_HEIGHT) * MISTWATER_WORLD_HEIGHT;
			landMask[y * DAPPLE_WIDTH + x] = isMistwaterWaterPoint(worldX, worldY) ? 0 : 1;
		}
	}

	scene.add
		.image(MISTWATER_WORLD_WIDTH / 2, MISTWATER_WORLD_HEIGHT / 2, CANOPY_SHADOW_TEXTURE_KEY)
		.setDisplaySize(MISTWATER_WORLD_WIDTH, MISTWATER_WORLD_HEIGHT)
		.setDepth(2.1)
		.setBlendMode(Phaser.BlendModes.MULTIPLY)
		.setAlpha(0.24);

	scene.add
		.image(MISTWATER_WORLD_WIDTH / 2, MISTWATER_WORLD_HEIGHT / 2, DAPPLE_TEXTURE_KEY)
		.setDisplaySize(MISTWATER_WORLD_WIDTH, MISTWATER_WORLD_HEIGHT)
		.setDepth(2.15)
		.setBlendMode(Phaser.BlendModes.ADD)
		.setAlpha(0.58);

	const render = (timeSeconds: number, windX: number, windY: number) => {
		const driftX = timeSeconds * (0.22 + windX * 1.8);
		const driftY = timeSeconds * (0.08 + windY * 1.5);
		for (let y = 0; y < DAPPLE_HEIGHT; y += 1) {
			for (let x = 0; x < DAPPLE_WIDTH; x += 1) {
				const pixel = y * DAPPLE_WIDTH + x;
				const offset = pixel * 4;
				if (landMask[pixel] === 0) {
					imageData.data[offset + 3] = 0;
					shadowImageData.data[offset + 3] = 0;
					continue;
				}

				const nx = x / DAPPLE_WIDTH;
				const ny = y / DAPPLE_HEIGHT;
				const sampleX = nx * 7.4 + driftX;
				const sampleY = ny * 4.2 + driftY;
				const canopyDensity =
					smoothValueNoise(sampleX, sampleY, 0x18ad) * 0.57 +
					smoothValueNoise(sampleX * 2.15 + 9.3, sampleY * 2.15 - 4.7, 0x5eed) * 0.29 +
					smoothValueNoise(sampleX * 4.6 - 3.8, sampleY * 4.6 + 6.1, 0xca11) * 0.14;
				const opticalDepth = 0.16 + canopyDensity * 3.15;
				const transmission = beerLambertTransmittance(opticalDepth, 0.92);
				const aperture = smoothStep(0.21, 0.57, transmission);
				const broadSun = 0.68 + smoothValueNoise(nx * 2.2 + 4, ny * 2.2 - 2, 0x51a7) * 0.32;
				const alpha = Math.round(aperture * aperture * broadSun * 84);
				imageData.data[offset] = 164;
				imageData.data[offset + 1] = 219;
				imageData.data[offset + 2] = 244;
				imageData.data[offset + 3] = alpha;
				const shadow = smoothStep(0.42, 0.78, canopyDensity);
				shadowImageData.data[offset] = 25;
				shadowImageData.data[offset + 1] = 57;
				shadowImageData.data[offset + 2] = 78;
				shadowImageData.data[offset + 3] = Math.round(shadow * 58);
			}
		}
		texture.context.putImageData(imageData, 0, 0);
		shadowTexture.context.putImageData(shadowImageData, 0, 0);
		texture.refresh();
		shadowTexture.refresh();
	};

	render(0, 0, 0);
	return { render };
}

function createLeafPool(scene: Phaser.Scene): LeafState[] {
	createLeafTexture(scene);
	return Array.from({ length: MAX_LEAVES }, () => ({
		image: scene.add.image(0, 0, LEAF_TEXTURE_KEY).setDepth(3).setVisible(false),
		active: false,
		age: 0,
		lifetime: 0,
		velocityX: 0,
		velocityY: 0,
		flutterPhase: 0,
		flutterFrequency: 0,
		rotationVelocity: 0
	}));
}

function createLeafTexture(scene: Phaser.Scene) {
	if (scene.textures.exists(LEAF_TEXTURE_KEY)) {
		scene.textures.remove(LEAF_TEXTURE_KEY);
	}
	const texture = scene.textures.createCanvas(LEAF_TEXTURE_KEY, 20, 28);
	if (!texture) {
		return;
	}
	const context = texture.context;
	context.fillStyle = "white";
	context.beginPath();
	context.moveTo(10, 2);
	context.bezierCurveTo(18, 6, 18, 18, 10, 25);
	context.bezierCurveTo(2, 18, 2, 6, 10, 2);
	context.fill();
	context.strokeStyle = "rgba(65, 75, 35, 0.65)";
	context.lineWidth = 1;
	context.beginPath();
	context.moveTo(10, 4);
	context.lineTo(10, 25);
	context.stroke();
	texture.refresh();
}

function spawnLeaf(leaves: LeafState[], random: () => number) {
	const leaf = leaves.find((candidate) => !candidate.active);
	if (!leaf) {
		return;
	}
	const area =
		MISTWATER_LEAF_SOURCE_AREAS[Math.floor(random() * MISTWATER_LEAF_SOURCE_AREAS.length)];
	const scale = 0.42 + random() * 0.42;
	leaf.active = true;
	leaf.age = 0;
	leaf.lifetime = 7 + random() * 6;
	leaf.velocityX = (random() - 0.5) * 10;
	leaf.velocityY = 3 + random() * 7;
	leaf.flutterPhase = random() * TAU;
	leaf.flutterFrequency = 2.4 + random() * 3.2;
	leaf.rotationVelocity = (random() - 0.5) * 1.8;
	leaf.image
		.setPosition(area.x + random() * area.width, area.y + random() * area.height)
		.setScale(scale)
		.setRotation(random() * TAU)
		.setTint(leafPigmentTint(random() ** 2.4))
		.setAlpha(0)
		.setVisible(true);
}

function updateLeaves(
	leaves: LeafState[],
	windModel: MistwaterWindModel,
	timeSeconds: number,
	deltaSeconds: number
) {
	for (const leaf of leaves) {
		if (!leaf.active) {
			continue;
		}
		leaf.age += deltaSeconds;
		const flutter = Math.sin(leaf.age * leaf.flutterFrequency + leaf.flutterPhase);
		const wind = windModel.sample(
			timeSeconds,
			leaf.image.x / MISTWATER_WORLD_WIDTH,
			leaf.image.y / MISTWATER_WORLD_HEIGHT
		);
		const next = integrateLeafMotion(
			{
				x: leaf.image.x,
				y: leaf.image.y,
				velocityX: leaf.velocityX,
				velocityY: leaf.velocityY
			},
			wind,
			deltaSeconds,
			flutter
		);
		leaf.velocityX = next.velocityX;
		leaf.velocityY = next.velocityY;
		leaf.image.setPosition(next.x, next.y);
		leaf.image.rotation += (leaf.rotationVelocity + flutter * 0.9) * deltaSeconds;
		leaf.image.scaleX =
			Math.max(0.08, Math.abs(Math.cos(leaf.age * 3.1 + leaf.flutterPhase))) *
			leaf.image.scaleY;
		leaf.image.alpha = Math.min(1, leaf.age / 0.8, (leaf.lifetime - leaf.age) / 1.3) * 0.78;

		if (
			leaf.age >= leaf.lifetime ||
			leaf.image.x < -40 ||
			leaf.image.x > MISTWATER_WORLD_WIDTH + 40 ||
			leaf.image.y > MISTWATER_WORLD_HEIGHT + 40
		) {
			leaf.active = false;
			leaf.image.setVisible(false);
		}
	}
}

function createSeededRandom(seed: number): () => number {
	let state = seed >>> 0;
	return () => {
		state += 0x6d2b79f5;
		let value = state;
		value = Math.imul(value ^ (value >>> 15), value | 1);
		value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
		return ((value ^ (value >>> 14)) >>> 0) / 4_294_967_296;
	};
}

function smoothStep(min: number, max: number, value: number): number {
	const amount = Phaser.Math.Clamp((value - min) / (max - min), 0, 1);
	return amount * amount * (3 - 2 * amount);
}
