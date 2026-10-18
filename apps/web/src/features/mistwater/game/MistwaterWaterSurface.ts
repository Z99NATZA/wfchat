import Phaser from "phaser";
import {
	MISTWATER_AMBIENT_IMPULSES,
	MISTWATER_SHORELINE,
	MISTWATER_WATER_BOUNDS,
	isMistwaterWaterPoint
} from "@/features/mistwater/game/mistwaterMap";
import { MistwaterWaterPhysics } from "@/features/mistwater/game/mistwaterWaterPhysics";

const WATER_FRAME = "mistwater-water-surface";
const WAVE_TEXTURE_KEY = "mistwater-wave-displacement";
const CAUSTICS_TEXTURE_KEY = "mistwater-underwater-caustics";
const SPECULAR_TEXTURE_KEY = "mistwater-surface-specular";
const DEPTH_LIGHT_TEXTURE_KEY = "mistwater-depth-light";
const FIELD_WIDTH = 96;
const FIELD_HEIGHT = 44;
const FIXED_STEP_MS = 1_000 / 30;
const TEXTURE_REFRESH_MS = 1_000 / 20;
const AMBIENT_IMPULSE_MS = 720;

type WaterLightLayers = {
	causticsNear: Phaser.GameObjects.TileSprite;
	causticsDeep: Phaser.GameObjects.TileSprite;
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
	terrainKey: string
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
		.setAlpha(0.88);
	const maskSource = createShorelineMask(scene);
	const waterMask = maskSource.createGeometryMask();
	waterLayer.setMask(waterMask);
	createWaterLightTextures(scene);
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
	const imageData = waveTexture.context.createImageData(FIELD_WIDTH, FIELD_HEIGHT);
	let physicsAccumulator = 0;
	let textureAccumulator = 0;
	let nextAmbientAt = 0;
	let ambientIndex = 0;

	const renderDisplacement = () => {
		physics.writeDisplacementMap(imageData.data);
		waveTexture.context.putImageData(imageData, 0, 0);
		waveTexture.refresh();
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

	for (let index = 0; index < MISTWATER_AMBIENT_IMPULSES.length; index += 2) {
		const point = MISTWATER_AMBIENT_IMPULSES[index];
		disturb(point.x, point.y, 0.32, 2);
	}
	renderDisplacement();

	return {
		update(time: number, delta: number) {
			physicsAccumulator += Math.min(delta, 100);
			textureAccumulator += Math.min(delta, 100);

			while (physicsAccumulator >= FIXED_STEP_MS) {
				physics.step();
				physicsAccumulator -= FIXED_STEP_MS;
			}

			if (time >= nextAmbientAt) {
				const point =
					MISTWATER_AMBIENT_IMPULSES[ambientIndex % MISTWATER_AMBIENT_IMPULSES.length];
				disturb(point.x, point.y, 0.22, 2);
				ambientIndex += 1;
				nextAmbientAt = time + AMBIENT_IMPULSE_MS;
			}

			if (textureAccumulator >= TEXTURE_REFRESH_MS) {
				renderDisplacement();
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
			nextAmbientAt = 0;
			ambientIndex = 0;
			renderDisplacement();
		}
	};
}

function createWaterLightTextures(scene: Phaser.Scene) {
	createCanvasTexture(scene, CAUSTICS_TEXTURE_KEY, 768, 384, drawCaustics);
	createCanvasTexture(scene, SPECULAR_TEXTURE_KEY, 512, 256, drawSpecularHighlights);
	createCanvasTexture(scene, DEPTH_LIGHT_TEXTURE_KEY, 512, 256, drawDepthLight);
}

function createCanvasTexture(
	scene: Phaser.Scene,
	key: string,
	width: number,
	height: number,
	draw: (context: CanvasRenderingContext2D, width: number, height: number) => void
) {
	if (scene.textures.exists(key)) {
		scene.textures.remove(key);
	}
	const texture = scene.textures.createCanvas(key, width, height);
	if (!texture) {
		return;
	}
	texture.context.clearRect(0, 0, width, height);
	draw(texture.context, width, height);
	texture.refresh();
}

function drawCaustics(context: CanvasRenderingContext2D, width: number, height: number) {
	const imageData = context.createImageData(width, height);
	for (let y = 0; y < height; y += 1) {
		const v = (y / height) * Math.PI * 2;
		for (let x = 0; x < width; x += 1) {
			const u = (x / width) * Math.PI * 2;
			const field =
				Math.sin(u * 9 + Math.sin(v * 5) * 1.05) +
				Math.sin(v * 11 - Math.sin(u * 4) * 0.96) * 0.86 +
				Math.sin((u + v) * 7 + Math.sin(u * 3 - v * 4) * 0.62) * 0.42;
			const ridge = Math.max(0, 1 - Math.abs(field) * 3.15);
			const brightness = Math.pow(ridge, 2.2);
			const pixel = (y * width + x) * 4;
			imageData.data[pixel] = 168;
			imageData.data[pixel + 1] = 255;
			imageData.data[pixel + 2] = 239;
			imageData.data[pixel + 3] = Math.round(brightness * 145);
		}
	}
	context.putImageData(imageData, 0, 0);
}

function drawSpecularHighlights(context: CanvasRenderingContext2D, width: number, height: number) {
	const random = createSeededRandom(0x57a7e2);
	context.save();
	context.globalCompositeOperation = "lighter";
	context.lineCap = "round";
	context.shadowColor = "rgba(220, 255, 250, 0.35)";
	context.shadowBlur = 2;

	for (let index = 0; index < 130; index += 1) {
		const x = random() * width;
		const y = random() * height;
		const length = 9 + random() * 38;
		const rise = (random() - 0.5) * 5;
		context.beginPath();
		context.moveTo(x, y);
		context.quadraticCurveTo(x + length * 0.5, y + rise, x + length, y + rise * 0.25);
		context.strokeStyle = `rgba(225, 255, 251, ${0.12 + random() * 0.28})`;
		context.lineWidth = 0.7 + random() * 1.5;
		context.stroke();
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
	const causticsDeep = scene.add
		.tileSprite(
			centerX,
			centerY,
			MISTWATER_WATER_BOUNDS.width,
			MISTWATER_WATER_BOUNDS.height,
			CAUSTICS_TEXTURE_KEY
		)
		.setDepth(1.1)
		.setAlpha(0.08)
		.setTint(0x5cddd6)
		.setBlendMode(Phaser.BlendModes.ADD)
		.setMask(waterMask);
	causticsDeep.setTileScale(1.42, 1.28);
	const causticsNear = scene.add
		.tileSprite(
			centerX,
			centerY,
			MISTWATER_WATER_BOUNDS.width,
			MISTWATER_WATER_BOUNDS.height,
			CAUSTICS_TEXTURE_KEY
		)
		.setDepth(1.15)
		.setAlpha(0.13)
		.setTint(0xb8fff1)
		.setBlendMode(Phaser.BlendModes.ADD)
		.setMask(waterMask);
	causticsNear.setTileScale(0.92, 0.82);
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
	specular.setTileScale(1.2, 1.05);
	const displacements = [causticsDeep, causticsNear, specular].flatMap((layer) => {
		const effect = layer.preFX?.addDisplacement(WAVE_TEXTURE_KEY, 0.004, 0.003);
		return effect ? [effect] : [];
	});
	return { causticsNear, causticsDeep, specular, depthLight, displacements };
}

function updateWaterLightLayers(time: number, waveEnergy: number, layers: WaterLightLayers) {
	const seconds = time * 0.001;
	layers.causticsNear.tilePositionX = seconds * 12;
	layers.causticsNear.tilePositionY = Math.sin(seconds * 0.47) * 18 + seconds * 3;
	layers.causticsDeep.tilePositionX = -seconds * 7;
	layers.causticsDeep.tilePositionY = Math.cos(seconds * 0.36) * 15 - seconds * 2;
	layers.specular.tilePositionX = seconds * 18;
	layers.specular.tilePositionY = Math.sin(seconds * 0.7) * 10;

	const slowPulse = Math.sin(seconds * 0.82) * 0.5 + 0.5;
	const activeLight = Phaser.Math.Clamp(waveEnergy * 0.035, 0, 0.045);
	layers.causticsNear.setAlpha(0.12 + slowPulse * 0.055 + activeLight);
	layers.causticsDeep.setAlpha(0.06 + (1 - slowPulse) * 0.035 + activeLight * 0.5);
	layers.specular.setAlpha(0.1 + slowPulse * 0.07 + activeLight * 0.8);
	layers.depthLight.setAlpha(0.055 + slowPulse * 0.025 + activeLight * 0.35);
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
