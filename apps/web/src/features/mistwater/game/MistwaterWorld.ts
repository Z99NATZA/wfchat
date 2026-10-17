import Phaser from "phaser";
import {
	MISTWATER_BLOOM_POINTS,
	MISTWATER_FLOW_CURRENTS,
	MISTWATER_FOG_VEILS,
	MISTWATER_SCENERY,
	type MistwaterFlowCurrent,
	type MistwaterSceneryKind,
	type MistwaterSceneryObject
} from "@/features/mistwater/game/mistwaterMap";

const TERRAIN_KEY = "mistwater-terrain-v2";
export const MISTWATER_SCENERY_TEXTURE_KEY = "mistwater-scenery-v1";
const TERRAIN_URL =
	"/images/mistwater/mistwater-terrain-v2.webp?v=b199e3c634d7b8de217f47df3910cea9";
const SCENERY_URL =
	"/images/mistwater/mistwater-scenery-v1.webp?v=e25eaf48d647d914ed034c68af2eceb6";

const SCENERY_FRAMES: Record<MistwaterSceneryKind, number> = {
	tree: 0,
	rock: 1,
	reeds: 2,
	lilies: 3,
	bridge: 4,
	island: 5
};

const SCENERY_SCALE: Record<MistwaterSceneryKind, number> = {
	tree: 0.31,
	rock: 0.22,
	reeds: 0.2,
	lilies: 0.18,
	bridge: 0.28,
	island: 0.24
};

const SCENERY_ORIGIN_Y: Record<MistwaterSceneryKind, number> = {
	tree: 0.83,
	rock: 0.72,
	reeds: 0.78,
	lilies: 0.5,
	bridge: 0.5,
	island: 0.72
};

type FlowMote = {
	current: MistwaterFlowCurrent;
	distanceOffset: number;
	sideOffset: number;
	sprite: Phaser.GameObjects.Ellipse;
};

export type MistwaterWorld = {
	update: (time: number) => void;
};

export function preloadMistwaterWorld(scene: Phaser.Scene) {
	scene.load.image(TERRAIN_KEY, TERRAIN_URL);
	scene.load.spritesheet(MISTWATER_SCENERY_TEXTURE_KEY, SCENERY_URL, {
		frameWidth: 512,
		frameHeight: 512
	});
}

export function createMistwaterWorld(scene: Phaser.Scene): MistwaterWorld {
	scene.add.image(0, 0, TERRAIN_KEY).setOrigin(0).setDepth(0);
	const flowMotes = createFlowMotes(scene);
	createAmbientRipples(scene);
	MISTWATER_SCENERY.forEach((object, index) => createSceneryObject(scene, object, index));
	createFogVeils(scene);

	return {
		update(time: number) {
			updateFlowMotes(time, flowMotes);
		}
	};
}

function createSceneryObject(scene: Phaser.Scene, object: MistwaterSceneryObject, index: number) {
	const image = scene.add
		.image(object.x, object.y, MISTWATER_SCENERY_TEXTURE_KEY, SCENERY_FRAMES[object.kind])
		.setName(object.id)
		.setData("mapObject", object)
		.setOrigin(0.5, SCENERY_ORIGIN_Y[object.kind])
		.setScale(SCENERY_SCALE[object.kind] * (object.scale ?? 1))
		.setAngle(object.rotation ?? 0)
		.setDepth(object.kind === "lilies" ? 6 : 100 + object.y);

	if (object.variant === 1) {
		image.setTint(0xe5f2cf);
	} else if (object.variant === 2) {
		image.setTint(0xc8e4de);
	}

	if (object.kind === "tree" || object.kind === "reeds") {
		const sway = object.kind === "tree" ? 0.8 : 1.7;
		scene.tweens.add({
			targets: image,
			angle: (object.rotation ?? 0) + (index % 2 === 0 ? sway : -sway),
			duration: 2_600 + (index % 5) * 310,
			delay: (index % 7) * 130,
			yoyo: true,
			repeat: -1,
			ease: "Sine.InOut"
		});
	} else if (object.kind === "lilies") {
		scene.tweens.add({
			targets: image,
			y: object.y + 3,
			angle: (object.rotation ?? 0) + (index % 2 === 0 ? 1.2 : -1.2),
			duration: 2_100 + (index % 3) * 270,
			yoyo: true,
			repeat: -1,
			ease: "Sine.InOut"
		});
	}
}

function createFlowMotes(scene: Phaser.Scene): FlowMote[] {
	return MISTWATER_FLOW_CURRENTS.flatMap((current, currentIndex) => {
		const angle = Phaser.Math.Angle.Between(
			current.from.x,
			current.from.y,
			current.to.x,
			current.to.y
		);
		return Array.from({ length: current.motes }, (_, moteIndex) => {
			const sprite = scene.add
				.ellipse(0, 0, 20 + (moteIndex % 3) * 5, 3, 0xd6fff2, 0.28)
				.setRotation(angle)
				.setDepth(4)
				.setBlendMode(Phaser.BlendModes.ADD);
			return {
				current,
				distanceOffset: moteIndex / current.motes + currentIndex * 0.071,
				sideOffset: ((moteIndex % 3) - 1) * Math.min(current.width * 0.26, 22),
				sprite
			};
		});
	});
}

function updateFlowMotes(time: number, flowMotes: FlowMote[]) {
	for (const mote of flowMotes) {
		const progress = (time * 0.001 * mote.current.speed + mote.distanceOffset) % 1;
		const dx = mote.current.to.x - mote.current.from.x;
		const dy = mote.current.to.y - mote.current.from.y;
		const length = Math.max(Math.hypot(dx, dy), 1);
		const normalX = -dy / length;
		const normalY = dx / length;
		const wave = Math.sin(progress * Math.PI * 2 + mote.distanceOffset * 5) * 5;
		mote.sprite.setPosition(
			Phaser.Math.Linear(mote.current.from.x, mote.current.to.x, progress) +
				normalX * (mote.sideOffset + wave),
			Phaser.Math.Linear(mote.current.from.y, mote.current.to.y, progress) +
				normalY * (mote.sideOffset + wave)
		);
		mote.sprite.setAlpha(0.08 + Math.sin(progress * Math.PI) * 0.32);
	}
}

function createAmbientRipples(scene: Phaser.Scene) {
	MISTWATER_BLOOM_POINTS.filter((_, index) => index % 2 === 0).forEach((point, index) => {
		const ripple = scene.add
			.ellipse(point.x + 24, point.y + 18, 18, 8, 0xc6fff3, 0)
			.setStrokeStyle(1, 0xd7fff6, 0.42)
			.setDepth(3)
			.setScale(0.65)
			.setAlpha(0);
		scene.tweens.add({
			targets: ripple,
			scaleX: 1.8,
			scaleY: 1.8,
			alpha: { from: 0, to: 0.44 },
			duration: 1_500,
			delay: index * 360,
			hold: 120,
			yoyo: true,
			repeat: -1,
			repeatDelay: 2_800 + index * 170,
			ease: "Sine.InOut"
		});
	});
}

function createFogVeils(scene: Phaser.Scene) {
	MISTWATER_FOG_VEILS.forEach((fog) => {
		const wisps = [
			scene.add.ellipse(
				-fog.width * 0.2,
				4,
				fog.width * 0.5,
				fog.height * 0.62,
				0xd8f7ee,
				0.085
			),
			scene.add.ellipse(0, -8, fog.width * 0.6, fog.height * 0.76, 0xe8fff8, 0.075),
			scene.add.ellipse(
				fog.width * 0.22,
				6,
				fog.width * 0.46,
				fog.height * 0.58,
				0xcceee8,
				0.085
			)
		];
		const veil = scene.add
			.container(fog.x, fog.y, wisps)
			.setName(fog.id)
			.setDepth(3_000)
			.setAlpha(0.7);
		scene.tweens.add({
			targets: veil,
			x: fog.x + fog.drift,
			alpha: 1,
			duration: fog.duration,
			yoyo: true,
			repeat: -1,
			ease: "Sine.InOut"
		});
	});
}
