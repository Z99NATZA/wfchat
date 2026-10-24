import { describe, expect, it } from "vitest";
import {
	MISTWATER_FOLIAGE_LAYERS,
	MISTWATER_LEAF_SOURCE_AREAS,
	MISTWATER_MAP_COLUMNS,
	MISTWATER_MAP_ROWS,
	MISTWATER_SHORELINE,
	MISTWATER_TILE_SIZE,
	MISTWATER_TREE_OBJECTS,
	MISTWATER_WATER_BOUNDS,
	MISTWATER_WORLD_HEIGHT,
	MISTWATER_WORLD_WIDTH,
	getMistwaterWaterBlend,
	isMistwaterWaterPoint
} from "@/features/mistwater/game/mistwaterMap";

describe("Mistwater map data", () => {
	it("keeps tile and world dimensions aligned", () => {
		expect(MISTWATER_WORLD_WIDTH).toBe(MISTWATER_MAP_COLUMNS * MISTWATER_TILE_SIZE);
		expect(MISTWATER_WORLD_HEIGHT).toBe(MISTWATER_MAP_ROWS * MISTWATER_TILE_SIZE);
		expect(MISTWATER_WORLD_WIDTH).toBe(2_688);
		expect(MISTWATER_WORLD_HEIGHT).toBe(1_344);
	});

	it("keeps the water inside the expanded forest rim", () => {
		expect(isMistwaterWaterPoint(16, 16)).toBe(false);
		expect(isMistwaterWaterPoint(MISTWATER_WORLD_WIDTH - 16, 16)).toBe(false);
		expect(isMistwaterWaterPoint(1_400, 120)).toBe(false);
		expect(isMistwaterWaterPoint(1_500, 700)).toBe(true);
	});

	it("follows the painted pool without including foreground rocks or the path", () => {
		// Reference locations on the pond-rim artwork, in world coordinates.
		for (const [x, y] of [
			[1_200, 375],
			[720, 600],
			[2_110, 750],
			[1_740, 1_060]
		]) {
			expect(isMistwaterWaterPoint(x, y), `water at ${x},${y}`).toBe(true);
		}
		for (const [x, y] of [
			[1_000, 950],
			[760, 780],
			[1_660, 460],
			[2_100, 1_000],
			[1_200, 1_050]
		]) {
			expect(isMistwaterWaterPoint(x, y), `land at ${x},${y}`).toBe(false);
			expect(getMistwaterWaterBlend(x, y)).toBe(0);
		}
	});

	it("fades effects inward from the bank and leaves deep water fully animated", () => {
		expect(getMistwaterWaterBlend(1_240, 353)).toBe(0);
		const shallow = getMistwaterWaterBlend(1_240, 365);
		expect(shallow).toBeGreaterThan(0);
		expect(shallow).toBeLessThan(1);
		expect(getMistwaterWaterBlend(1_240, 380)).toBeGreaterThan(shallow);
		expect(getMistwaterWaterBlend(1_500, 700)).toBe(1);
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

	it("keeps isolated foliage anchors inside the world", () => {
		for (const layer of MISTWATER_FOLIAGE_LAYERS) {
			expect(layer.x).toBeGreaterThanOrEqual(0);
			expect(layer.y).toBeGreaterThanOrEqual(0);
			expect(layer.x).toBeLessThanOrEqual(MISTWATER_WORLD_WIDTH);
			expect(layer.y).toBeLessThanOrEqual(MISTWATER_WORLD_HEIGHT);
			expect(layer.scale).toBeGreaterThan(0);
		}
	});

	it("keeps independently editable trees on land with unique ids", () => {
		const ids = new Set<string>();
		for (const tree of MISTWATER_TREE_OBJECTS) {
			expect(tree.id.trim()).not.toBe("");
			expect(ids.has(tree.id)).toBe(false);
			ids.add(tree.id);
			expect(tree.x).toBeGreaterThanOrEqual(0);
			expect(tree.x).toBeLessThanOrEqual(MISTWATER_WORLD_WIDTH);
			expect(tree.y).toBeGreaterThanOrEqual(0);
			expect(tree.y).toBeLessThanOrEqual(MISTWATER_WORLD_HEIGHT);
			expect(isMistwaterWaterPoint(tree.x, tree.y)).toBe(false);
			expect(tree.scale).toBeGreaterThan(0);
		}
	});

	it("keeps falling-leaf source areas inside the world", () => {
		for (const area of MISTWATER_LEAF_SOURCE_AREAS) {
			expect(area.x).toBeGreaterThanOrEqual(0);
			expect(area.y).toBeGreaterThanOrEqual(0);
			expect(area.x + area.width).toBeLessThanOrEqual(MISTWATER_WORLD_WIDTH);
			expect(area.y + area.height).toBeLessThanOrEqual(MISTWATER_WORLD_HEIGHT);
		}
	});
});
