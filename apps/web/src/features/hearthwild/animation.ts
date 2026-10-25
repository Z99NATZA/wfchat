import type { GameState } from "./state";
export type Weapon = "sword" | "bow";
export type Motion = "idle" | "walk" | "run";
export type AnimationName = Motion | Weapon;
export const WALK_SPEED = 3.5;
export const RUN_SPEED = 5.8;
export const ANIMATIONS: Record<
	AnimationName,
	{
		url: string;
		frames: number;
		fps: number;
		loop: boolean;
		sequence?: readonly number[];
		blink?: { frame: number; period: number; start: number; duration: number };
		rows: readonly number[];
		mirroredFrames?: readonly string[];
		rowRects?: readonly (readonly [number, number])[];
	}
> = {
	idle: {
		url: "/images/hearthwild/aiko-idle-v2.png",
		sequence: [0, 1, 0, 3],
		blink: { frame: 2, period: 5, start: 4.65, duration: 0.12 },
		frames: 4,
		fps: 2,
		rows: [0, 1, 2, 3],
		loop: true
	},
	walk: {
		url: "/images/hearthwild/aiko-walk-front-v2.png",
		frames: 8,
		fps: 16,
		rows: [0, 1, 2, 3],
		loop: true
	},
	run: {
		url: "/images/hearthwild/aiko-run-v1.png",
		mirroredFrames: ["2:1", "2:2", "2:3"],
		frames: 4,
		fps: 12,
		rows: [0, 1, 2, 3],
		loop: true
	},
	sword: {
		url: "/images/hearthwild/aiko-sword-v1.png",
		mirroredFrames: ["2:1"],
		frames: 4,
		fps: 10,
		rows: [0, 1, 2, 3],
		loop: false
	},
	bow: {
		url: "/images/hearthwild/aiko-bow-v1.png",
		rowRects: [
			[0, 315],
			[315, 341],
			[656, 286],
			[942, 312]
		],
		frames: 4,
		fps: 6.25,
		rows: [0, 1, 2, 3],
		loop: false
	}
};
export const ATTACK_DURATION: Record<Weapon, number> = { sword: 0.4, bow: 0.64 };
export const ATTACK_RELEASE: Record<Weapon, number> = { sword: 0.2, bow: 0.32 };
export const FACING: readonly (readonly [number, number])[] = [
	[0, 1],
	[0, -1],
	[-1, 0],
	[1, 0]
];
export function playerFrame(s: GameState) {
	const action: AnimationName = s.attack > 0 ? s.weapon : s.motion;
	const animation = ANIMATIONS[action],
		elapsed = s.attack > 0 ? ATTACK_DURATION[s.weapon] - s.attack : s.animationTime;
	const index = Math.floor(Math.max(0, elapsed) * animation.fps);
	let frame = animation.sequence
		? animation.sequence[index % animation.sequence.length]
		: animation.loop
			? index % animation.frames
			: Math.min(animation.frames - 1, index);
	if (animation.blink) {
		const phase = elapsed % animation.blink.period;
		if (
			phase >= animation.blink.start &&
			phase < animation.blink.start + animation.blink.duration
		)
			frame = animation.blink.frame;
	}
	const row = animation.rows[s.attack > 0 ? s.attackDirection : s.direction];
	return {
		mirror: animation.mirroredFrames?.includes(`${row}:${frame}`) ?? false,
		action,
		frame,
		row
	};
}
