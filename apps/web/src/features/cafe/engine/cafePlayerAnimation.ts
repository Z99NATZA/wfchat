import type { CafeDirection } from "@/features/cafe/types";

export const CAFE_PLAYER_SPRITE_KEY = "cafe-player";
export const CAFE_PLAYER_SPRITE_URL = "/images/aiko-cafe/cafe-player-sprites-v1.png";
export const CAFE_PLAYER_FRAME_SIZE = 256;
export const CAFE_PLAYER_DISPLAY_SIZE = 128;
export const CAFE_PLAYER_ORIGIN_Y = 0.87;

const WALK_FRAME_DURATION_MS = 125;
const FRAMES_PER_DIRECTION = 4;

// The generated v1 atlas has consistent cell sizes, but its painted character
// is not centered identically inside every cell. These source-pixel centers
// were measured from the alpha bounds of each frame. Converting them to render
// offsets keeps the character over the same world-space foot anchor.
const FRAME_VISUAL_CENTER_X = [
	143, 133, 122, 99, 146, 128, 120, 101, 141, 126, 117, 98, 143, 132, 120, 99
] as const;

const DIRECTION_ROW: Record<CafeDirection, number> = {
	up: 0,
	left: 1,
	right: 2,
	down: 3
};

export function cafePlayerFrame(direction: CafeDirection, moving: boolean, timeMs: number): number {
	const column = moving
		? Math.floor(Math.max(0, timeMs) / WALK_FRAME_DURATION_MS) % FRAMES_PER_DIRECTION
		: 0;
	return DIRECTION_ROW[direction] * FRAMES_PER_DIRECTION + column;
}

export function cafePlayerFrameOffsetX(frame: number): number {
	const centerX = FRAME_VISUAL_CENTER_X[frame];
	if (centerX === undefined) return 0;
	return (
		(CAFE_PLAYER_FRAME_SIZE / 2 - centerX) * (CAFE_PLAYER_DISPLAY_SIZE / CAFE_PLAYER_FRAME_SIZE)
	);
}
