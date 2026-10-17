import Phaser from "phaser";
import {
	MISTWATER_BLOOM_POINTS,
	MISTWATER_EDDIES,
	MISTWATER_FLOW_CURRENTS,
	MISTWATER_SURFACE_GLINTS,
	type MistwaterFlowCurrent
} from "@/features/mistwater/game/mistwaterMap";

const TERRAIN_KEY = "mistwater-pond-v3";
const TERRAIN_URL = "/images/mistwater/mistwater-pond-v3.webp?v=01a14aac971b7413b23913e0a950691b";

type FlowMote = {
	current: MistwaterFlowCurrent;
	distanceOffset: number;
	sideOffset: number;
	phase: number;
	sprite: Phaser.GameObjects.Ellipse;
};

export type MistwaterWorld = {
	update: (time: number) => void;
};

export function preloadMistwaterWorld(scene: Phaser.Scene) {
	scene.load.image(TERRAIN_KEY, TERRAIN_URL);
}

export function createMistwaterWorld(scene: Phaser.Scene): MistwaterWorld {
	scene.add.image(0, 0, TERRAIN_KEY).setOrigin(0).setDepth(0);
	const flowMotes = createFlowMotes(scene);
	createSurfaceGlints(scene);
	createEddies(scene);
	createAmbientRipples(scene);

	return {
		update(time: number) {
			updateFlowMotes(time, flowMotes);
		}
	};
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
			const length = 17 + (moteIndex % 4) * 5;
			const sprite = scene.add
				.ellipse(0, 0, length, moteIndex % 3 === 0 ? 3 : 2, 0xd6fff2, 0.3)
				.setRotation(angle)
				.setDepth(4)
				.setBlendMode(Phaser.BlendModes.ADD);
			return {
				current,
				distanceOffset: moteIndex / current.motes + currentIndex * 0.071,
				sideOffset: ((moteIndex % 3) - 1) * Math.min(current.width * 0.26, 22),
				phase: currentIndex * 1.73 + moteIndex * 0.91,
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
		const curve = Math.sin(progress * Math.PI) * (mote.current.curve ?? 0);
		const wave = Math.sin(progress * Math.PI * 2 + mote.phase) * 6;
		mote.sprite.setPosition(
			Phaser.Math.Linear(mote.current.from.x, mote.current.to.x, progress) +
				normalX * (mote.sideOffset + curve + wave),
			Phaser.Math.Linear(mote.current.from.y, mote.current.to.y, progress) +
				normalY * (mote.sideOffset + curve + wave)
		);
		const pulse = 0.72 + Math.sin(time * 0.0024 + mote.phase) * 0.28;
		mote.sprite.setAlpha((0.06 + Math.sin(progress * Math.PI) * 0.34) * pulse);
		mote.sprite.setScale(0.86 + Math.sin(time * 0.0018 + mote.phase) * 0.16, 1);
	}
}

function createSurfaceGlints(scene: Phaser.Scene) {
	MISTWATER_SURFACE_GLINTS.forEach((glint, index) => {
		const streaks = [
			scene.add.ellipse(-glint.width * 0.2, -5, glint.width * 0.32, 2, 0xe7fff8, 0.22),
			scene.add.ellipse(0, 2, glint.width * 0.48, 2, 0xbef8ec, 0.19),
			scene.add.ellipse(glint.width * 0.24, 8, glint.width * 0.22, 2, 0xffffff, 0.24)
		];
		const shimmer = scene.add
			.container(glint.x, glint.y, streaks)
			.setName(glint.id)
			.setDepth(2)
			.setBlendMode(Phaser.BlendModes.ADD)
			.setAlpha(0.22);

		scene.tweens.add({
			targets: shimmer,
			x: glint.x + glint.drift,
			y: glint.y + (index % 2 === 0 ? 5 : -5),
			scaleX: 1.16,
			alpha: 0.78,
			duration: glint.duration,
			delay: index * 170,
			yoyo: true,
			repeat: -1,
			ease: "Sine.InOut"
		});
	});
}

function createEddies(scene: Phaser.Scene) {
	MISTWATER_EDDIES.forEach((eddy, index) => {
		const outer = scene.add
			.arc(0, 0, eddy.radius, 18, 236, false, 0xcdfcf2, 0)
			.setStrokeStyle(1, 0xcdfcf2, 0.24);
		const middle = scene.add
			.arc(0, 0, eddy.radius * 0.68, 205, 455, false, 0xe9fff9, 0)
			.setStrokeStyle(1, 0xe9fff9, 0.3);
		const inner = scene.add
			.arc(0, 0, eddy.radius * 0.36, 35, 260, false, 0xaeece3, 0)
			.setStrokeStyle(1, 0xaeece3, 0.26);
		const swirl = scene.add
			.container(eddy.x, eddy.y, [outer, middle, inner])
			.setName(eddy.id)
			.setDepth(3)
			.setAlpha(0.35);

		scene.tweens.add({
			targets: swirl,
			rotation: eddy.direction * Math.PI * 2,
			alpha: { from: 0.18, to: 0.5 },
			duration: eddy.duration,
			delay: index * 240,
			repeat: -1,
			ease: "Sine.InOut"
		});
	});
}

function createAmbientRipples(scene: Phaser.Scene) {
	const ripplePoints = [
		...MISTWATER_BLOOM_POINTS.filter((_, index) => index % 2 === 0),
		...MISTWATER_SURFACE_GLINTS.filter((_, index) => index % 2 === 1)
	];
	ripplePoints.forEach((point, index) => {
		const ripple = scene.add
			.ellipse(
				point.x + 18,
				point.y + 14,
				16 + (index % 3) * 3,
				7 + (index % 2) * 2,
				0xc6fff3,
				0
			)
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
			delay: index * 290,
			hold: 120,
			yoyo: true,
			repeat: -1,
			repeatDelay: 2_350 + (index % 5) * 260,
			ease: "Sine.InOut"
		});
	});
}
