import { describe, it, expect, vi } from "vitest";
import { drawGardenNight, isGardenNight, NIGHT_LIGHT } from "./lighting";
import { newGame } from "./state";

describe("garden night visibility", () => {
	it("applies only to the garden from dusk through the pre-dawn hours", () => {
		const s = newGame();
		for (const [minutes, night] of [
			[0, true],
			[359.9, true],
			[360, false],
			[1079.9, false],
			[1080, true],
			[1440, true],
			[1800, false]
		] as const) {
			s.minutes = minutes;
			expect(isGardenNight(s)).toBe(night);
		}
		s.minutes = 1200;
		s.map = "home";
		expect(isGardenNight(s)).toBe(false);
		s.map = "dungeon";
		expect(isGardenNight(s)).toBe(false);
	});
	it("anchors the light at the player's world position and keeps distant opacity below black", () => {
		const stops = vi.fn(),
			gradient = { addColorStop: stops },
			radial = vi.fn(() => gradient),
			fillRect = vi.fn();
		const ctx = {
			createRadialGradient: radial,
			fillRect,
			save: vi.fn(),
			restore: vi.fn()
		} as unknown as CanvasRenderingContext2D;
		const s = newGame();
		s.minutes = 1200;
		expect(drawGardenNight(ctx, s, 1216, 896)).toBe(true);
		expect(radial).toHaveBeenLastCalledWith(
			s.x * 32,
			s.y * 32 - 20,
			NIGHT_LIGHT.innerRadius,
			s.x * 32,
			s.y * 32 - 20,
			NIGHT_LIGHT.outerRadius
		);
		s.x += 3;
		s.y -= 2;
		drawGardenNight(ctx, s, 1216, 896);
		expect(radial).toHaveBeenLastCalledWith(
			s.x * 32,
			s.y * 32 - 20,
			NIGHT_LIGHT.innerRadius,
			s.x * 32,
			s.y * 32 - 20,
			NIGHT_LIGHT.outerRadius
		);
		expect(fillRect).toHaveBeenLastCalledWith(0, 0, 1216, 896);
		expect(NIGHT_LIGHT.ambientAlpha).toBeGreaterThan(0.53);
		expect(NIGHT_LIGHT.ambientAlpha).toBeLessThan(0.85);
		expect(stops.mock.calls.map((call) => call[0]).slice(0, 4)).toEqual([0, 0.3, 0.65, 1]);
	});
	it("leaves the daylight canvas untouched", () => {
		const ctx = {
			createRadialGradient: vi.fn(),
			fillRect: vi.fn()
		} as unknown as CanvasRenderingContext2D;
		expect(drawGardenNight(ctx, newGame(), 1216, 896)).toBe(false);
		expect(ctx.fillRect).not.toHaveBeenCalled();
	});
});
