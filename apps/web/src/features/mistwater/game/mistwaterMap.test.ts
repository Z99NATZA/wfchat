import { describe, expect, it } from "vitest";
import {
	MISTWATER_BLOOM_POINTS,
	MISTWATER_EDDIES,
	MISTWATER_FLOW_CURRENTS,
	MISTWATER_MAP_COLUMNS,
	MISTWATER_MAP_ROWS,
	MISTWATER_PLAYER_START,
	MISTWATER_SURFACE_GLINTS,
	MISTWATER_TILE_SIZE,
	MISTWATER_WORLD_HEIGHT,
	MISTWATER_WORLD_WIDTH,
	isMistwaterWaterPoint
} from "@/features/mistwater/game/mistwaterMap";

describe("Mistwater map data", () => {
	it("keeps tile and world dimensions aligned", () => {
		expect(MISTWATER_WORLD_WIDTH).toBe(MISTWATER_MAP_COLUMNS * MISTWATER_TILE_SIZE);
		expect(MISTWATER_WORLD_HEIGHT).toBe(MISTWATER_MAP_ROWS * MISTWATER_TILE_SIZE);
	});

	it("places the breeze and every gameplay bloom on water", () => {
		expect(isMistwaterWaterPoint(MISTWATER_PLAYER_START.x, MISTWATER_PLAYER_START.y)).toBe(
			true
		);
		for (const bloom of MISTWATER_BLOOM_POINTS) {
			expect(isMistwaterWaterPoint(bloom.x, bloom.y)).toBe(true);
		}
	});

	it("keeps the playable water inside a compact land rim", () => {
		expect(isMistwaterWaterPoint(16, 16)).toBe(false);
		expect(isMistwaterWaterPoint(MISTWATER_WORLD_WIDTH - 16, 16)).toBe(false);
		expect(isMistwaterWaterPoint(900, 120)).toBe(false);
		expect(isMistwaterWaterPoint(900, 515)).toBe(true);
	});

	it("keeps water effects uniquely named and positioned on water", () => {
		const effects = [
			...MISTWATER_FLOW_CURRENTS,
			...MISTWATER_SURFACE_GLINTS,
			...MISTWATER_EDDIES
		];
		const ids = effects.map((effect) => effect.id);
		expect(new Set(ids).size).toBe(ids.length);

		for (const glint of MISTWATER_SURFACE_GLINTS) {
			expect(isMistwaterWaterPoint(glint.x, glint.y), glint.id).toBe(true);
		}
		for (const eddy of MISTWATER_EDDIES) {
			expect(isMistwaterWaterPoint(eddy.x, eddy.y), eddy.id).toBe(true);
		}
	});

	it("keeps every gameplay point inside the compact world", () => {
		for (const point of [MISTWATER_PLAYER_START, ...MISTWATER_BLOOM_POINTS]) {
			expect(point.x).toBeGreaterThan(0);
			expect(point.x).toBeLessThan(MISTWATER_WORLD_WIDTH);
			expect(point.y).toBeGreaterThan(0);
			expect(point.y).toBeLessThan(MISTWATER_WORLD_HEIGHT);
		}
	});
});
