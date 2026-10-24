import Phaser from "phaser";
import {
	MISTWATER_SHORELINE,
	MISTWATER_WATER_BOUNDS,
	getMistwaterWaterBlend,
	isMistwaterWaterPoint
} from "@/features/mistwater/game/mistwaterMap";
import { MistwaterCaustics } from "@/features/mistwater/game/mistwaterCaustics";
import { MistwaterWaterPhysics } from "@/features/mistwater/game/mistwaterWaterPhysics";

const WATER_FRAME = "mistwater-water-surface";
const WAVE_TEXTURE_KEY = "mistwater-wave-displacement";
const CAUSTICS_TEXTURE_KEY = "mistwater-refractive-caustics";
const SPECULAR_TEXTURE_KEY = "mistwater-surface-specular";
const DEPTH_LIGHT_TEXTURE_KEY = "mistwater-depth-light";
const SHORE_BLEND_TEXTURE_KEY = "mistwater-shore-blend";
const FIELD_WIDTH = 96;
const FIELD_HEIGHT = 44;
const CAUSTICS_WIDTH = 256;
const CAUSTICS_HEIGHT = 128;
const FIXED_STEP_MS = 1_000 / 30;
const TEXTURE_REFRESH_MS = 1_000 / 20;

type WaterLightLayers = {
	caustics: Phaser.GameObjects.Image;
	specular: Phaser.GameObjects.TileSprite;
	depthLight: Phaser.GameObjects.Image;
	displacements: Phaser.FX.Displacement[];
};

export type MistwaterWaterSurface = {
	update: (time: number, delta: number) => void;
	disturb: (x: number, y: number, strength?: number, radius?: number) => void;
	reset: () => void;
};

export function createMistwaterWaterSurface(
	scene: Phaser.Scene,
	terrainKey: string,
	terrainTint = 0xffffff
): MistwaterWaterSurface | null {
	if (scene.game.renderer.type !== Phaser.WEBGL) {
		return null;
	}

	const terrain = scene.textures.get(terrainKey);
	if (!terrain.has(WATER_FRAME)) {
		terrain.add(
			WATER_FRAME,
			0,
			MISTWATER_WATER_BOUNDS.x,
			MISTWATER_WATER_BOUNDS.y,
			MISTWATER_WATER_BOUNDS.width,
			MISTWATER_WATER_BOUNDS.height
		);
	}

	if (scene.textures.exists(WAVE_TEXTURE_KEY)) {
		scene.textures.remove(WAVE_TEXTURE_KEY);
	}
	const waveTexture = scene.textures.createCanvas(WAVE_TEXTURE_KEY, FIELD_WIDTH, FIELD_HEIGHT);
	if (!waveTexture) {
		return null;
	}

	const waterLayer = scene.add
		.image(MISTWATER_WATER_BOUNDS.x, MISTWATER_WATER_BOUNDS.y, terrainKey, WATER_FRAME)
		.setOrigin(0)
		.setDepth(1)
		.setTint(terrainTint)
		.setAlpha(0.88);
	const maskSource = createShorelineMask(scene);
	const waterMask = maskSource.createGeometryMask();
	waterLayer.setMask(waterMask);
	const causticsTexture = createWaterLightTextures(scene);
	if (!causticsTexture) {
		waterLayer.destroy();
		waterMask.destroy();
		maskSource.destroy();
		scene.textures.remove(WAVE_TEXTURE_KEY);
		return null;
	}
	const lightLayers = createWaterLightLayers(scene, waterMask);

	const displacement = waterLayer.preFX?.addDisplacement(WAVE_TEXTURE_KEY, 0.009, 0.006);
	if (!displacement) {
		waterLayer.destroy();
		waterMask.destroy();
		maskSource.destroy();
		scene.textures.remove(WAVE_TEXTURE_KEY);
		return null;
	}

	const physics = new MistwaterWaterPhysics(FIELD_WIDTH, FIELD_HEIGHT);
	const caustics = new MistwaterCaustics(
		CAUSTICS_WIDTH,
		CAUSTICS_HEIGHT,
		MISTWATER_WATER_BOUNDS.width / MISTWATER_WATER_BOUNDS.height
	);
	const imageData = waveTexture.context.createImageData(FIELD_WIDTH, FIELD_HEIGHT);
	const causticsImageData = causticsTexture.context.createImageData(
		CAUSTICS_WIDTH,
		CAUSTICS_HEIGHT
	);
	let physicsAccumulator = 0;
	let textureAccumulator = 0;

	const renderDisplacement = (timeSeconds: number) => {
		physics.writeDisplacementMap(imageData.data, timeSeconds);
		waveTexture.context.putImageData(imageData, 0, 0);
		waveTexture.refresh();
	};

	const renderCaustics = (timeSeconds: number) => {
		caustics.writeLightMap(causticsImageData.data, timeSeconds, (x, y) =>
			physics.sampleHeight(x, y)
		);
		causticsTexture.context.putImageData(causticsImageData, 0, 0);
		causticsTexture.refresh();
	};

	const disturb = (x: number, y: number, strength = 0.55, radius = 2) => {
		if (!isMistwaterWaterPoint(x, y)) {
			return;
		}
		physics.disturb(
			(x - MISTWATER_WATER_BOUNDS.x) / MISTWATER_WATER_BOUNDS.width,
			(y - MISTWATER_WATER_BOUNDS.y) / MISTWATER_WATER_BOUNDS.height,
			strength,
			radius
		);
	};

	renderDisplacement(0);
	renderCaustics(0);
	createShorelineBlend(scene, terrainKey, terrainTint);

	return {
		update(time: number, delta: number) {
			physicsAccumulator += Math.min(delta, 100);
			textureAccumulator += Math.min(delta, 100);

			while (physicsAccumulator >= FIXED_STEP_MS) {
				physics.step();
				physicsAccumulator -= FIXED_STEP_MS;
			}

			if (textureAccumulator >= TEXTURE_REFRESH_MS) {
				renderDisplacement(time * 0.001);
				renderCaustics(time * 0.001);
				textureAccumulator %= TEXTURE_REFRESH_MS;
			}

			const waveEnergy = Phaser.Math.Clamp(physics.getPeak(), 0, 1.5);
			displacement.x = 0.0075 + waveEnergy * 0.0015;
			displacement.y = 0.0048 + waveEnergy * 0.0012;
			updateWaterLightLayers(time, waveEnergy, lightLayers);
		},
		disturb,
		reset() {
			physics.reset();
			physicsAccumulator = 0;
			textureAccumulator = 0;
			renderDisplacement(0);
			renderCaustics(0);
		}
	};
}

function createShorelineBlend(scene: Phaser.Scene, terrainKey: string, terrainTint: number) {
	const bounds = MISTWATER_WATER_BOUNDS;
	const texture = createCanvasTexture(
		scene,
		SHORE_BLEND_TEXTURE_KEY,
		bounds.width,
		bounds.height,
		(context) => {
			const source = scene.textures.get(terrainKey).getSourceImage() as HTMLImageElement;
			context.drawImage(
				source,
				bounds.x,
				bounds.y,
				bounds.width,
				bounds.height,
				0,
				0,
				bounds.width,
				bounds.height
			);
			// This stationary copy covers refraction and additive light near shore.
			// An alpha mask at quarter resolution is computed once, then interpolated.
			const mask = document.createElement("canvas");
			mask.width = Math.ceil(bounds.width / 4);
			mask.height = Math.ceil(bounds.height / 4);
			const maskContext = mask.getContext("2d")!;
			const pixels = maskContext.createImageData(mask.width, mask.height);
			for (let y = 0; y < mask.height; y += 1) {
				for (let x = 0; x < mask.width; x += 1) {
					const worldX = bounds.x + ((x + 0.5) / mask.width) * bounds.width;
					const worldY = bounds.y + ((y + 0.5) / mask.height) * bounds.height;
					const index = (y * mask.width + x) * 4;
					pixels.data[index] = 255;
					pixels.data[index + 1] = 255;
					pixels.data[index + 2] = 255;
					pixels.data[index + 3] = Math.round(
						(1 - getMistwaterWaterBlend(worldX, worldY)) * 255
					);
				}
			}
			maskContext.putImageData(pixels, 0, 0);
			context.globalCompositeOperation = "destination-in";
			context.drawImage(mask, 0, 0, bounds.width, bounds.height);
			context.globalCompositeOperation = "source-over";
		}
	);
	if (!texture) return;
	scene.add
		.image(bounds.x, bounds.y, SHORE_BLEND_TEXTURE_KEY)
		.setOrigin(0)
		.setDepth(1.3)
		.setTint(terrainTint);
	scene.events.once("shutdown", () => scene.textures.remove(SHORE_BLEND_TEXTURE_KEY));
}

function createWaterLightTextures(scene: Phaser.Scene): Phaser.Textures.CanvasTexture | null {
	const causticsTexture = createCanvasTexture(
		scene,
		CAUSTICS_TEXTURE_KEY,
		CAUSTICS_WIDTH,
		CAUSTICS_HEIGHT,
		() => undefined
	);
	createCanvasTexture(scene, SPECULAR_TEXTURE_KEY, 768, 384, drawSpecularHighlights);
	createCanvasTexture(scene, DEPTH_LIGHT_TEXTURE_KEY, 512, 256, drawDepthLight);
	return causticsTexture;
}

function createCanvasTexture(
	scene: Phaser.Scene,
	key: string,
	width: number,
	height: number,
	draw: (context: CanvasRenderingContext2D, width: number, height: number) => void
): Phaser.Textures.CanvasTexture | null {
	if (scene.textures.exists(key)) {
		scene.textures.remove(key);
	}
	const texture = scene.textures.createCanvas(key, width, height);
	if (!texture) {
		return null;
	}
	texture.context.clearRect(0, 0, width, height);
	draw(texture.context, width, height);
	texture.refresh();
	return texture;
}

function drawSpecularHighlights(context: CanvasRenderingContext2D, width: number, height: number) {
	const random = createSeededRandom(0x57a7e2);
	context.save();
	context.globalCompositeOperation = "lighter";
	context.lineCap = "round";
	context.shadowColor = "rgba(220, 255, 250, 0.35)";
	context.shadowBlur = 2;

	for (let cluster = 0; cluster < 14; cluster += 1) {
		const centerX = random() * width;
		const centerY = random() * height;
		const streakCount = 4 + Math.floor(random() * 7);
		for (let streak = 0; streak < streakCount; streak += 1) {
			const x = centerX + (random() - random()) * 76;
			const y = centerY + (random() - random()) * 18;
			const length = 6 + random() * 24;
			const rise = (random() - 0.5) * 3;
			context.beginPath();
			context.moveTo(x, y);
			context.quadraticCurveTo(x + length * 0.5, y + rise, x + length, y + rise * 0.2);
			context.strokeStyle = `rgba(232, 255, 250, ${0.1 + random() * 0.3})`;
			context.lineWidth = 0.55 + random() * 1.15;
			context.stroke();
		}
	}
	context.restore();
}

function drawDepthLight(context: CanvasRenderingContext2D, width: number, height: number) {
	const primary = context.createRadialGradient(
		width * 0.58,
		height * 0.6,
		0,
		width * 0.58,
		height * 0.6,
		width * 0.48
	);
	primary.addColorStop(0, "rgba(91, 255, 229, 0.72)");
	primary.addColorStop(0.38, "rgba(36, 212, 209, 0.34)");
	primary.addColorStop(1, "rgba(0, 77, 117, 0)");
	context.fillStyle = primary;
	context.fillRect(0, 0, width, height);

	const shallow = context.createRadialGradient(
		width * 0.82,
		height * 0.72,
		0,
		width * 0.82,
		height * 0.72,
		width * 0.3
	);
	shallow.addColorStop(0, "rgba(255, 239, 174, 0.44)");
	shallow.addColorStop(1, "rgba(255, 239, 174, 0)");
	context.fillStyle = shallow;
	context.fillRect(0, 0, width, height);
}

function createWaterLightLayers(
	scene: Phaser.Scene,
	waterMask: Phaser.Display.Masks.GeometryMask
): WaterLightLayers {
	const centerX = MISTWATER_WATER_BOUNDS.x + MISTWATER_WATER_BOUNDS.width / 2;
	const centerY = MISTWATER_WATER_BOUNDS.y + MISTWATER_WATER_BOUNDS.height / 2;
	const depthLight = scene.add
		.image(centerX, centerY, DEPTH_LIGHT_TEXTURE_KEY)
		.setDisplaySize(MISTWATER_WATER_BOUNDS.width, MISTWATER_WATER_BOUNDS.height)
		.setDepth(1.05)
		.setAlpha(0.085)
		.setBlendMode(Phaser.BlendModes.ADD)
		.setMask(waterMask);
	const caustics = scene.add
		.image(centerX, centerY, CAUSTICS_TEXTURE_KEY)
		.setDisplaySize(MISTWATER_WATER_BOUNDS.width, MISTWATER_WATER_BOUNDS.height)
		.setDepth(1.15)
		.setAlpha(0.71)
		.setTint(0xb8fff1)
		.setBlendMode(Phaser.BlendModes.ADD)
		.setMask(waterMask);
	const specular = scene.add
		.tileSprite(
			centerX,
			centerY,
			MISTWATER_WATER_BOUNDS.width,
			MISTWATER_WATER_BOUNDS.height,
			SPECULAR_TEXTURE_KEY
		)
		.setDepth(1.2)
		.setAlpha(0.12)
		.setTint(0xd9fff8)
		.setBlendMode(Phaser.BlendModes.ADD)
		.setMask(waterMask);
	specular.setTileScale(1.05, 0.92);
	const displacements = [caustics, specular].flatMap((layer) => {
		const effect = layer.preFX?.addDisplacement(WAVE_TEXTURE_KEY, 0.004, 0.003);
		return effect ? [effect] : [];
	});
	return { caustics, specular, depthLight, displacements };
}

function updateWaterLightLayers(time: number, waveEnergy: number, layers: WaterLightLayers) {
	const seconds = time * 0.001;
	layers.specular.tilePositionX = seconds * 7.5 + Math.sin(seconds * 0.19) * 10;
	layers.specular.tilePositionY = Math.sin(seconds * 0.53) * 7;

	const slowPulse = Math.sin(seconds * 0.82) * 0.5 + 0.5;
	const activeLight = Phaser.Math.Clamp(waveEnergy * 0.035, 0, 0.045);
	layers.caustics.setAlpha(0.65 + slowPulse * 0.08 + activeLight);
	layers.specular.setAlpha(0.06 + slowPulse * 0.035 + activeLight * 0.65);
	layers.depthLight.setAlpha(0.05 + slowPulse * 0.015 + activeLight * 0.25);
	for (const displacement of layers.displacements) {
		displacement.x = 0.0035 + waveEnergy * 0.0012;
		displacement.y = 0.0025 + waveEnergy * 0.001;
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

function createShorelineMask(scene: Phaser.Scene): Phaser.GameObjects.Graphics {
	const mask = scene.make.graphics({ x: 0, y: 0 });
	mask.fillStyle(0xffffff, 1);
	mask.beginPath();
	mask.moveTo(MISTWATER_SHORELINE[0].x, MISTWATER_SHORELINE[0].y);
	for (let index = 1; index < MISTWATER_SHORELINE.length; index += 1) {
		mask.lineTo(MISTWATER_SHORELINE[index].x, MISTWATER_SHORELINE[index].y);
	}
	mask.closePath();
	mask.fillPath();
	return mask;
}
