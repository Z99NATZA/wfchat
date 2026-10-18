import Phaser from "phaser";
import { createMistwaterWaterSurface } from "@/features/mistwater/game/MistwaterWaterSurface";

const TERRAIN_KEY = "mistwater-pond-v4";
const TERRAIN_URL = "/images/mistwater/mistwater-pond-v4.webp?v=1b328c8f40eafcf5";

export type MistwaterWorld = {
	update: (time: number, delta: number) => void;
	disturbWater: (x: number, y: number, strength?: number, radius?: number) => void;
};

export function preloadMistwaterWorld(scene: Phaser.Scene) {
	scene.load.image(TERRAIN_KEY, TERRAIN_URL);
}

export function createMistwaterWorld(scene: Phaser.Scene): MistwaterWorld {
	scene.add.image(0, 0, TERRAIN_KEY).setOrigin(0).setDepth(0);
	const waterSurface = createMistwaterWaterSurface(scene, TERRAIN_KEY);

	return {
		update(time: number, delta: number) {
			waterSurface?.update(time, delta);
		},
		disturbWater(x: number, y: number, strength?: number, radius?: number) {
			waterSurface?.disturb(x, y, strength, radius);
		}
	};
}
