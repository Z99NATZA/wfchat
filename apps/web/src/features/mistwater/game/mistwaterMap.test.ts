import { describe, expect, it } from "vitest";
import {
	MISTWATER_BLOOM_POINTS,
	MISTWATER_MAP_COLUMNS,
	MISTWATER_MAP_ROWS,
	MISTWATER_PLAYER_START,
	MISTWATER_SCENERY,
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

	it("keeps editable objects uniquely named and inside the world", () => {
		const ids = MISTWATER_SCENERY.map((object) => object.id);
		expect(new Set(ids).size).toBe(ids.length);

		for (const object of MISTWATER_SCENERY) {
			expect(object.x).toBeGreaterThanOrEqual(0);
			expect(object.x).toBeLessThanOrEqual(MISTWATER_WORLD_WIDTH);
			expect(object.y).toBeGreaterThanOrEqual(0);
			expect(object.y).toBeLessThanOrEqual(MISTWATER_WORLD_HEIGHT);
		}
	});

	it("places the breeze and every gameplay bloom on water", () => {
		expect(isMistwaterWaterPoint(MISTWATER_PLAYER_START.x, MISTWATER_PLAYER_START.y)).toBe(
			true
		);
		for (const bloom of MISTWATER_BLOOM_POINTS) {
			expect(isMistwaterWaterPoint(bloom.x, bloom.y)).toBe(true);
		}
	});

	it("keeps a land rim and central island around the animated basin", () => {
		expect(isMistwaterWaterPoint(16, 16)).toBe(false);
		expect(isMistwaterWaterPoint(800, 410)).toBe(false);
		expect(isMistwaterWaterPoint(800, 535)).toBe(true);
	});
});
