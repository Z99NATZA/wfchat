import type { GameState } from "./state";
import { TILE } from "./world";

export type LightingPreview = "auto" | "day" | "night";
export function lightingMinutes(minutes: number, preview: LightingPreview = "auto") {
	return preview === "day" ? 720 : preview === "night" ? 1200 : minutes;
}
export function isNightTime(minutes: number) {
	const hour = (minutes / 60) % 24;
	return hour >= 18 || hour < 6;
}
export const NIGHT_LIGHT = {
	innerRadius: TILE * 0.75,
	outerRadius: TILE * 4.5,
	centerAlpha: 0.12,
	ambientAlpha: 0.76,
	bodyOffsetY: -20
} as const;
type LightingState = Pick<GameState, "map" | "minutes" | "x" | "y">;
export function isGardenNight(s: Pick<GameState, "map" | "minutes">) {
	return s.map === "garden" && isNightTime(s.minutes);
}
// This overlay is drawn in world space, so the soft pool of visibility follows
// Aiko through movement, camera clamping and zoom without bleaching the artwork.
export function drawGardenNight(
	ctx: CanvasRenderingContext2D,
	s: LightingState,
	width: number,
	height: number
) {
	if (!isGardenNight(s)) return false;
	const x = s.x * TILE,
		y = s.y * TILE + NIGHT_LIGHT.bodyOffsetY;
	const shade = ctx.createRadialGradient(
		x,
		y,
		NIGHT_LIGHT.innerRadius,
		x,
		y,
		NIGHT_LIGHT.outerRadius
	);
	shade.addColorStop(0, `rgba(5,13,28,${NIGHT_LIGHT.centerAlpha})`);
	shade.addColorStop(0.3, "rgba(5,13,28,0.18)");
	shade.addColorStop(0.65, "rgba(5,13,28,0.52)");
	shade.addColorStop(1, `rgba(5,13,28,${NIGHT_LIGHT.ambientAlpha})`);
	ctx.save();
	ctx.fillStyle = shade;
	ctx.fillRect(0, 0, width, height);
	ctx.restore();
	return true;
}
