import { describe, expect, it } from "vitest";
import { BOAT_ART, boatMoorings } from "./harbor";
import { createWorld, index, serialize, TILE_SIZE } from "./world";

describe("rowboat mooring composition", () => {
	it("separates the boat from the planks without moving saved objects or terrain", () => {
		const world = createWorld(),
			before = serialize(world),
			moorings = boatMoorings(world),
			boat = world.objects.find((o) => o.kind === "boat")!;
		expect(moorings).toHaveLength(1);
		const mooring = moorings[0];
		expect(mooring.id).toBe(boat.id);
		expect(mooring.x - BOAT_ART.width / 2).toBeGreaterThan(boat.x * TILE_SIZE);
		expect(mooring.ties[0].y).toBeLessThan(mooring.ties[1].y);
		expect(serialize(world)).toBe(before);
	});
	it("uses both sides of a pier and requires real posts and clear water for the full sprite", () => {
		for (const side of [1, -1]) {
			const world = createWorld();
			world.terrain.fill("water");
			world.objects = [0, 1, 2, 3, 4].map((i) => ({
				id: i + 1,
				kind: "dock",
				x: side > 0 ? 10 : 16,
				y: 10 + i
			}));
			world.objects.push({ id: 6, kind: "boat", x: side > 0 ? 12 : 14, y: 11 });
			const mooring = boatMoorings(world)[0];
			expect(mooring.side).toBe(side);
			expect((mooring.x - mooring.pierX) * side).toBeGreaterThan(BOAT_ART.width / 2);
			const cx = Math.floor(mooring.x / TILE_SIZE),
				cy = 10;
			world.terrain[index(cx, cy)] = "grass";
			expect(boatMoorings(world)).toEqual([]);
			world.terrain[index(cx, cy)] = "water";
			world.objects.push({ id: 7, kind: "rock", x: cx, y: cy });
			expect(boatMoorings(world)).toEqual([]);
			world.objects = world.objects.filter(
				(o) => o.id !== 7 && !(o.kind === "dock" && o.y === 10)
			);
			expect(boatMoorings(world)).toEqual([]);
		}
	});
});
