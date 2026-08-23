import type { CafeAvatarId, CafeDirection } from "@/features/cafe/types";

export const DEFAULT_CAFE_AVATAR_ID: CafeAvatarId = "boy";
export const CAFE_PLAYER_FRAME_SIZE = 256;
export const CAFE_PLAYER_DISPLAY_SIZE = 128;
export const CAFE_PLAYER_ORIGIN_Y = 0.87;

export const CAFE_PLAYER_SPRITES: Record<CafeAvatarId, { key: string; url: string }> = {
	boy: {
		key: "cafe-player-boy-v2-acb196a07c0e678911b7537fc7a60eccf439c4ae47b5d9fb8da7064ea863a179",
		url: "/images/aiko-cafe/cafe-player-boy-v2.png?v=acb196a07c0e678911b7537fc7a60eccf439c4ae47b5d9fb8da7064ea863a179"
	},
	girl: {
		key: "cafe-player-girl-v3-1930e7bf3d9e219b10fff237a63efe6d818fe166a37e3012589e9c22c2876eb0",
		url: "/images/aiko-cafe/cafe-player-girl-v3.png?v=1930e7bf3d9e219b10fff237a63efe6d818fe166a37e3012589e9c22c2876eb0"
	}
};

const WALK_FRAME_DURATION_MS = 125;
const WALK_FRAMES_PER_DIRECTION = 4;
const FRAMES_PER_DIRECTION = 6;
const IDLE_CYCLE_MS = 4_000;
const IDLE_BLINK_START_MS = 3_200;
const IDLE_BLINK_DURATION_MS = 160;
const TARGET_VISUAL_HEIGHT = 190;
const TARGET_FOOT_Y = 210;

const DIRECTION_ROW: Record<CafeDirection, number> = {
	up: 0,
	left: 1,
	right: 2,
	down: 3
};

// The generated sheets keep a uniform 256px cell grid, but the painted body
// drifts inside those cells. These measured alpha bounds normalize the visual
// center, scale, and foot anchor without changing world-space collision.
const FRAME_VISUAL_CENTER_X: Record<CafeAvatarId, readonly number[]> = {
	boy: [
		152, 139, 128, 117.5, 109.5, 99, 154.5, 141, 129, 117.5, 108, 99.5, 146, 133.5, 123, 113,
		102.5, 94, 150, 138, 127, 116, 105.5, 99
	],
	girl: [
		153, 143, 133, 120.5, 96.5, 86, 154, 145.5, 134.5, 118, 96.5, 84.5, 146, 137, 128.5, 114,
		93, 80.5, 152, 142, 131, 117.5, 95.5, 83.5
	]
};

const FRAME_VISUAL_BOTTOM_Y: Record<CafeAvatarId, readonly number[]> = {
	boy: [
		236, 236, 237, 237, 237, 240, 206, 206, 204, 205, 205, 205, 211, 211, 211, 210, 211, 211,
		237, 237, 239, 239, 239, 239
	],
	girl: [
		240, 240, 241, 241, 242, 242, 215, 215, 211, 212, 212, 212, 208, 208, 206, 206, 206, 207,
		239, 239, 240, 241, 240, 240
	]
};

const DIRECTION_VISUAL_HEIGHT: Record<CafeAvatarId, readonly number[]> = {
	boy: [206, 200, 204, 207],
	girl: [211, 192, 194, 198]
};

export function normalizeCafeAvatarId(value: string): CafeAvatarId {
	return value === "girl" ? "girl" : DEFAULT_CAFE_AVATAR_ID;
}

export function cafePlayerTextureKey(avatarId: CafeAvatarId): string {
	return CAFE_PLAYER_SPRITES[avatarId].key;
}

export function cafePlayerIdlePhase(playerId: string): number {
	let hash = 0;
	for (const character of playerId) {
		hash = (hash * 31 + character.charCodeAt(0)) >>> 0;
	}
	return hash % IDLE_CYCLE_MS;
}

export function cafePlayerFrame(
	direction: CafeDirection,
	moving: boolean,
	timeMs: number,
	idlePhaseMs = 0
): number {
	const rowStart = DIRECTION_ROW[direction] * FRAMES_PER_DIRECTION;
	const safeTime = Math.max(0, timeMs);
	if (moving) {
		return (
			rowStart +
			2 +
			(Math.floor(safeTime / WALK_FRAME_DURATION_MS) % WALK_FRAMES_PER_DIRECTION)
		);
	}
	const idleTime = (safeTime + Math.max(0, idlePhaseMs)) % IDLE_CYCLE_MS;
	const blinking =
		idleTime >= IDLE_BLINK_START_MS && idleTime < IDLE_BLINK_START_MS + IDLE_BLINK_DURATION_MS;
	return rowStart + (blinking ? 1 : 0);
}

export function cafePlayerFrameTransform(avatarId: CafeAvatarId, frame: number) {
	const directionRow = Math.floor(frame / FRAMES_PER_DIRECTION);
	const visualHeight = DIRECTION_VISUAL_HEIGHT[avatarId][directionRow] ?? TARGET_VISUAL_HEIGHT;
	const scale =
		(CAFE_PLAYER_DISPLAY_SIZE / CAFE_PLAYER_FRAME_SIZE) * (TARGET_VISUAL_HEIGHT / visualHeight);
	const centerX = FRAME_VISUAL_CENTER_X[avatarId][frame] ?? CAFE_PLAYER_FRAME_SIZE / 2;
	const bottomY = FRAME_VISUAL_BOTTOM_Y[avatarId][frame] ?? TARGET_FOOT_Y;
	const originY = CAFE_PLAYER_FRAME_SIZE * CAFE_PLAYER_ORIGIN_Y;
	const targetFootOffsetY =
		(TARGET_FOOT_Y - originY) * (CAFE_PLAYER_DISPLAY_SIZE / CAFE_PLAYER_FRAME_SIZE);
	return {
		x: (CAFE_PLAYER_FRAME_SIZE / 2 - centerX) * scale,
		y: targetFootOffsetY - (bottomY - originY) * scale,
		scale
	};
}
