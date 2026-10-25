import { describe, it, expect } from "vitest";
import { GARDEN_SOUTH_WATER_ROW, MAPS, terrain, initialObjects } from "./world";
import { blocked, deserialize, edit, move, newGame, serialize } from "./state";
import { findPath } from "./engine";

describe("southern garden water", () => {
	it("keeps the woodland border sparse instead of forming continuous tree rows", () => {
		const trees = initialObjects().garden.filter((o) => o.kind === "tree"),
			cells = new Set(trees.map((o) => `${o.x}:${o.y}`));
		expect(trees.length).toBeGreaterThan(35);
		expect(trees.length).toBeLessThan(55);
		for (let y = 2; y < GARDEN_SOUTH_WATER_ROW; y++) {
			let run = 0;
			for (let x = 1; x < MAPS.garden.width - 1; x++) {
				run = cells.has(`${x}:${y}`) ? run + 1 : 0;
				expect(run).toBeLessThanOrEqual(3);
			}
		}
	});

	it("fills all southern rows, including map-edge corners, and joins the pond", () => {
		for (let y = GARDEN_SOUTH_WATER_ROW; y < MAPS.garden.height; y++)
			for (let x = 0; x < MAPS.garden.width; x++)
				expect(terrain("garden", x, y)).toBe("water");
		expect(terrain("garden", 27, 22)).toBe("water");
		expect(terrain("garden", 27, 23)).toBe("water");
		expect(terrain("garden", 14, 22)).toBe("path");
		expect(terrain("garden", 14, 23)).toBe("path");
		expect(terrain("garden", 14, 24)).toBe("water");
		expect(terrain("garden", 24, 23)).toBe("grass");
		expect(terrain("garden", 25, 23)).toBe("water");
		expect(terrain("garden", 29, 23)).toBe("water");
		expect(terrain("garden", 30, 23)).toBe("grass");
		expect(terrain("garden", 14, 28)).toBe("wall");
		expect(terrain("garden", -1, 25)).toBe("wall");
		expect(terrain("home", 10, 15)).toBe("wall");
		expect(terrain("dungeon", 15, 22)).toBe("wall");
	});
	it("keeps initial southern water clear and blocks walking, pathfinding and construction", () => {
		expect(initialObjects().garden.every((o) => o.y < GARDEN_SOUTH_WATER_ROW)).toBe(true);
		const s = newGame();
		s.x = 14.5;
		s.y = 23.5;
		const wood = s.wood;
		expect(blocked(s, "garden", 14.5, 24.5)).toBe(true);
		expect(findPath(s, 14.5, 25.5)).toEqual([]);
		for (const tool of ["path", "soil", "tree", "lantern", "crop"] as const)
			expect(edit(s, tool, 14, 24)).toBe(false);
		expect(s.wood).toBe(wood);
		move(s, 0, 1, 2, true);
		expect(Math.floor(s.y)).toBe(23);
	});
	it("migrates flooded placements once, refunds their materials and preserves dry land edits", () => {
		const s = newGame();
		s.coins = 987;
		s.gems = 4;
		s.harvested = 6;
		s.objects.garden.push(
			{ id: "initial-legacy", kind: "tree", x: 12, y: 26 },
			{ id: "placed-a", kind: "lantern", x: 17, y: 24 },
			{ id: "placed-b", kind: "fence", x: 18, y: 24 },
			{ id: "placed-c", kind: "tree", x: 20, y: 24 },
			{ id: "placed-d", kind: "crop", x: 19, y: 24, planted: 300 }
		);
		s.tiles = {
			"garden:14:25": "path",
			"garden:18:24": "soil",
			"garden:16:14": "path",
			"home:7:8": "path"
		};
		const restored = deserialize(serialize(s));
		expect(restored.objects.garden.every((o) => o.y < GARDEN_SOUTH_WATER_ROW)).toBe(true);
		expect(restored.wood).toBe(s.wood + 10);
		expect(restored.seeds).toBe(s.seeds + 1);
		expect(restored.tiles).toEqual({ "garden:16:14": "path", "home:7:8": "path" });
		expect(restored.coins).toBe(987);
		expect(restored.gems).toBe(4);
		expect(restored.harvested).toBe(6);
		const again = deserialize(serialize(restored));
		expect(again.wood).toBe(restored.wood);
		expect(again.seeds).toBe(restored.seeds);
		expect(again.tiles).toEqual(restored.tiles);
	});
	it("moves a flooded saved player to an open shore tile without resetting their run or sleep", () => {
		const s = newGame();
		s.x = 14.5;
		s.y = 25.5;
		s.hp = 41;
		s.coins = 123;
		s.awake = 22;
		s.sleep = 3.5;
		const restored = deserialize(serialize(s));
		expect(restored.map).toBe("garden");
		expect(restored.y).toBeLessThan(GARDEN_SOUTH_WATER_ROW);
		expect(blocked(restored, "garden", restored.x, restored.y)).toBe(false);
		expect(restored.hp).toBe(41);
		expect(restored.coins).toBe(123);
		expect(restored.awake).toBe(22);
		expect(restored.sleep).toBe(3.5);
	});
	it("moves a saved player out of the widened pond mouth", () => {
		const s = newGame();
		s.x = 25.5;
		s.y = 23.5;
		const restored = deserialize(serialize(s));
		expect(terrain("garden", Math.floor(restored.x), Math.floor(restored.y))).not.toBe("water");
		expect(blocked(restored, "garden", restored.x, restored.y)).toBe(false);
	});
});
