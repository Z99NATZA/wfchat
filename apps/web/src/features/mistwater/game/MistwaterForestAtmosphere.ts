import Phaser from "phaser";
import {
	createMistwaterGrass,
	type MistwaterGrass
} from "@/features/mistwater/game/MistwaterGrass";
import {
	MISTWATER_FOLIAGE_LAYERS,
	MISTWATER_LEAF_SOURCE_AREAS,
	MISTWATER_TREE_OBJECTS,
	MISTWATER_WORLD_HEIGHT,
	MISTWATER_WORLD_WIDTH,
	type MistwaterFoliageLayer,
	type MistwaterTreeObject,
	isMistwaterWaterPoint
} from "@/features/mistwater/game/mistwaterMap";
import {
	MistwaterWindModel,
	integrateLeafMotion,
	leafPigmentTint
} from "@/features/mistwater/game/mistwaterForestPhysics";

const LEAF_TEXTURE_KEY = "mistwater-falling-leaf";
const MAX_LEAVES = 36;
const TAU = Math.PI * 2;

type FoliageLayer = {
	image: Phaser.GameObjects.Image;
	kind: MistwaterFoliageLayer["kind"];
	grass?: MistwaterGrass;
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
	const leaves = createLeafPool(scene);
	let leafAccumulator = 0;

	return {
		update(time: number, delta: number) {
			const timeSeconds = time * 0.001;
			const deltaSeconds = Math.min(delta, 50) * 0.001;
			windModel.update(timeSeconds);
			const broadWind = windModel.sample(timeSeconds);

			updateTreeCrowns(treeLayers.values(), windModel, timeSeconds);
			updateFoliage(foliageLayers, windModel, timeSeconds, deltaSeconds);

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
		const grass = layer.kind === "grass" ? createMistwaterGrass(scene, layer) : undefined;
		const image =
			grass?.image ??
			scene.add
				.image(layer.x, layer.y, `mistwater-${layer.kind}`)
				.setOrigin(layer.originX, layer.originY)
				.setScale(layer.scale);
		image
			.setFlipX(layer.flipX)
			.setRotation(layer.rotation)
			.setAlpha(layer.alpha)
			.setTint(layer.tint)
			.setDepth(layer.depth);
		return {
			image,
			kind: layer.kind,
			grass,
			baseScale: layer.scale,
			baseRotation: layer.rotation,
			sway: layer.sway,
			phase: layer.phase,
			depthFactor: layer.depthFactor
		};
	});
}

function updateFoliage(
	layers: FoliageLayer[],
	windModel: MistwaterWindModel,
	timeSeconds: number,
	deltaSeconds: number
) {
	for (const layer of layers) {
		const wind = windModel.sample(
			timeSeconds,
			layer.image.x / MISTWATER_WORLD_WIDTH,
			layer.image.y / MISTWATER_WORLD_HEIGHT
		);
		if (layer.grass) {
			layer.grass.update(timeSeconds, deltaSeconds, wind);
			continue;
		}
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
