import { describe, expect, it } from "vitest";
import {
	MISTWATER_AMBIENT_IMPULSES,
	MISTWATER_MAP_COLUMNS,
	MISTWATER_MAP_ROWS,
	MISTWATER_SHORELINE,
	MISTWATER_TILE_SIZE,
	MISTWATER_WATER_BOUNDS,
	MISTWATER_WORLD_HEIGHT,
	MISTWATER_WORLD_WIDTH,
	isMistwaterWaterPoint
} from "@/features/mistwater/game/mistwaterMap";

describe("Mistwater map data", () => {
	it("keeps tile and world dimensions aligned", () => {
		expect(MISTWATER_WORLD_WIDTH).toBe(MISTWATER_MAP_COLUMNS * MISTWATER_TILE_SIZE);
		expect(MISTWATER_WORLD_HEIGHT).toBe(MISTWATER_MAP_ROWS * MISTWATER_TILE_SIZE);
	});

	it("keeps the water inside a compact land rim", () => {
		expect(isMistwaterWaterPoint(16, 16)).toBe(false);
		expect(isMistwaterWaterPoint(MISTWATER_WORLD_WIDTH - 16, 16)).toBe(false);
		expect(isMistwaterWaterPoint(900, 120)).toBe(false);
		expect(isMistwaterWaterPoint(900, 515)).toBe(true);
	});

	it("places every ambient impulse inside the pond", () => {
		for (const point of MISTWATER_AMBIENT_IMPULSES) {
			expect(isMistwaterWaterPoint(point.x, point.y)).toBe(true);
		}
	});

	it("keeps the editable shoreline and water surface inside the world", () => {
		for (const point of MISTWATER_SHORELINE) {
			expect(point.x).toBeGreaterThanOrEqual(MISTWATER_WATER_BOUNDS.x);
			expect(point.x).toBeLessThanOrEqual(
				MISTWATER_WATER_BOUNDS.x + MISTWATER_WATER_BOUNDS.width
			);
			expect(point.y).toBeGreaterThanOrEqual(MISTWATER_WATER_BOUNDS.y);
			expect(point.y).toBeLessThanOrEqual(
				MISTWATER_WATER_BOUNDS.y + MISTWATER_WATER_BOUNDS.height
			);
		}
	});
});
