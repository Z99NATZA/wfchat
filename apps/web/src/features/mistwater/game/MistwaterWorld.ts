import Phaser from "phaser";
import { createMistwaterForestAtmosphere } from "@/features/mistwater/game/MistwaterForestAtmosphere";
import { createMistwaterWaterSurface } from "@/features/mistwater/game/MistwaterWaterSurface";
import {
	MISTWATER_WORLD_HEIGHT,
	MISTWATER_WORLD_WIDTH,
	type MistwaterTreeObject
} from "@/features/mistwater/game/mistwaterMap";

const FOREST_FLOOR_KEY = "mistwater-forest-floor";
const FOREST_FLOOR_URL = "/images/mistwater/mistwater-forest-floor-v2.webp";
const POND_RIM_KEY = "mistwater-pond-rim";
const POND_RIM_URL = "/images/mistwater/mistwater-pond-rim-v1.webp?v=24ebd436988c0736";
const TREE_TRUNK_KEY = "mistwater-tree-trunk";
const TREE_TRUNK_URL = "/images/mistwater/mistwater-tree-trunk-v1.webp?v=016bc2bcb4e4ff9b";
const TREE_CROWN_KEY = "mistwater-tree-crown";
const TREE_CROWN_URL = "/images/mistwater/mistwater-tree-crown-v1.webp?v=1da837d71f8f23f1";
const UNDERSTORY_KEY = "mistwater-understory";
const UNDERSTORY_URL = "/images/mistwater/mistwater-understory-v1.webp?v=fa85aec1de39e840";
const BRANCH_KEY = "mistwater-branch";
const BRANCH_URL = "/images/mistwater/mistwater-branch-v1.webp?v=93c8960bf49b0a25";
const GRASS_KEY = "mistwater-grass";
const GRASS_URL = "/images/mistwater/mistwater-grass-v1.webp";

export type MistwaterWorld = {
	update: (time: number, delta: number) => void;
	disturbWater: (x: number, y: number, strength?: number, radius?: number) => void;
	addTree: (tree: MistwaterTreeObject) => boolean;
	removeTree: (id: string) => boolean;
	moveTree: (id: string, x: number, y: number) => boolean;
};

export function preloadMistwaterWorld(scene: Phaser.Scene) {
	scene.load.image(FOREST_FLOOR_KEY, FOREST_FLOOR_URL);
	scene.load.image(POND_RIM_KEY, POND_RIM_URL);
	scene.load.image(TREE_TRUNK_KEY, TREE_TRUNK_URL);
	scene.load.image(TREE_CROWN_KEY, TREE_CROWN_URL);
	scene.load.image(UNDERSTORY_KEY, UNDERSTORY_URL);
	scene.load.image(BRANCH_KEY, BRANCH_URL);
	scene.load.image(GRASS_KEY, GRASS_URL);
}

export function createMistwaterWorld(scene: Phaser.Scene): MistwaterWorld {
	scene.add
		.tileSprite(0, 0, MISTWATER_WORLD_WIDTH, MISTWATER_WORLD_HEIGHT, FOREST_FLOOR_KEY)
		.setOrigin(0)
		.setDepth(0);
	scene.add.image(0, 0, POND_RIM_KEY).setOrigin(0).setDepth(0.2).setTint(0x79b9cf);
	const waterSurface = createMistwaterWaterSurface(scene, POND_RIM_KEY);
	const forestAtmosphere = createMistwaterForestAtmosphere(scene);

	return {
		update(time: number, delta: number) {
			waterSurface?.update(time, delta);
			forestAtmosphere.update(time, delta);
		},
		disturbWater(x: number, y: number, strength?: number, radius?: number) {
			waterSurface?.disturb(x, y, strength, radius);
		},
		addTree(tree: MistwaterTreeObject) {
			return forestAtmosphere.addTree(tree);
		},
		removeTree(id: string) {
			return forestAtmosphere.removeTree(id);
		},
		moveTree(id: string, x: number, y: number) {
			return forestAtmosphere.moveTree(id, x, y);
		}
	};
}
