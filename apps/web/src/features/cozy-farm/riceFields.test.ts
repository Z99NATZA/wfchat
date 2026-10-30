import { describe, expect, it } from "vitest";
import { paddyEdges } from "./riceFields";
import {
	act,
	blocked,
	canStand,
	cell,
	createWorld,
	deserialize,
	grow,
	index,
	objectsAt,
	serialize,
	TILE_SIZE,
	WIDTH,
	type WorldObject
} from "./world";

// Original authored identities before the eastern clearing was opened.
const previousObjects: WorldObject[] = [
	{ id: 91, kind: "tree", x: 34, y: 7 },
	{ id: 92, kind: "tree", x: 37, y: 7 },
	{ id: 93, kind: "tree", x: 40, y: 7 },
	{ id: 96, kind: "tree", x: 34, y: 10 },
	{ id: 97, kind: "tree", x: 37, y: 10 },
	{ id: 98, kind: "tree", x: 40, y: 10 },
	{ id: 122, kind: "flowers", x: 36, y: 6 },
	{ id: 131, kind: "flowers", x: 35, y: 9 },
	{ id: 139, kind: "flowers", x: 34, y: 12 }
];

function previousWorld() {
	const world = createWorld();
	delete world.riceComposition;
	for (const object of world.objects) {
		if (object.id === 60) object.x = 39;
		if (object.kind === "tree" && object.y === 3 && [31, 34, 37, 40].includes(object.x))
			object.y = 4;
	}
	for (let y = 5; y <= 13; y++)
		for (let x = 30; x <= 41; x++) {
			world.terrain[index(x, y)] = "grass";
			delete world.crops[index(x, y)];
		}
	world.terrain[index(29, 12)] = "grass";
	world.objects = world.objects.filter((o) => !previousObjects.some((old) => old.id === o.id));
	world.objects.push(...structuredClone(previousObjects));
	world.objects.sort((a, b) => a.id - b.id);
	return world;
}

describe("eastern rice clearing", () => {
	it("upgrades the original forest once, retaining the woodland rim, shore and existing farm", () => {
		const old = previousWorld(),
			world = deserialize(serialize(old))!;
		expect(world).toEqual(createWorld());
		for (let key = 0; key < world.terrain.length; key++) {
			const x = key % WIDTH,
				y = Math.floor(key / WIDTH);
			if (x < 28 || x > 41 || y < 5 || y > 12) {
				expect(world.terrain[key]).toBe(old.terrain[key]);
				expect(world.crops[key]).toEqual(old.crops[key]);
			}
		}
		expect(world.objects.filter((o) => o.kind === "tree" && o.x === 43)).toEqual(
			old.objects.filter((o) => o.kind === "tree" && o.x === 43)
		);
		expect(world.objects.filter((o) => o.kind === "rock")).toEqual(
			old.objects.filter((o) => o.kind === "rock")
		);
		const rice = Object.entries(world.crops).filter(([, crop]) => crop.kind === "rice");
		expect(rice).toHaveLength(70);
		for (const [key, crop] of rice) {
			const x = +key % WIDTH,
				y = Math.floor(+key / WIDTH);
			expect(cell(world, x, y)).toBe("soil");
			expect(objectsAt(world, x, y)).toEqual([]);
			expect(blocked(world, (x + 0.5) * TILE_SIZE, (y + 0.5) * TILE_SIZE)).toBe(false);
			expect(crop.watered).toBe(true);
			expect(crop.growth).toBe(1);
			expect(y).toBeGreaterThanOrEqual(6);
		}
		// A continuous walking lane joins the existing sign approach to the field.
		for (const [x, y] of [
			[28, 12],
			[29, 12],
			[30, 12],
			[30, 11],
			[30, 10],
			[30, 9],
			[30, 8],
			[30, 6]
		]) {
			expect(cell(world, x, y)).toBe("path");
			expect(canStand(world, (x + 0.5) * TILE_SIZE, (y + 0.5) * TILE_SIZE)).toBe(true);
		}
		// The former separating lane is tilled earth in the same connected field.
		for (let x = 31; x <= 40; x++) expect(cell(world, x, 9)).toBe("soil");
		const seen = new Set<number>([index(31, 9)]),
			queue = [...seen];
		for (let head = 0; head < queue.length; head++) {
			const key = queue[head];
			for (const next of [key - 1, key + 1, key - WIDTH, key + WIDTH])
				if (world.terrain[next] === "soil" && !seen.has(next)) {
					seen.add(next);
					queue.push(next);
				}
		}
		expect(seen.size).toBe(70);
		for (let y = 6; y <= 12; y++)
			for (let x = 31; x <= 40; x++) {
				expect(cell(world, x, y)).toBe("soil");
				expect(objectsAt(world, x, y)).toEqual([]);
			}
		expect(
			paddyEdges(world).filter(
				(edge) => edge.y === 9 && (edge.side === "north" || edge.side === "south")
			)
		).toEqual([]);
		expect(world.player).toEqual(old.player);
		expect(world.seeds).toBe(old.seeds);
	});

	it.each(["crop", "terrain", "placed", "removed", "moved"])(
		"preserves a clearing with a player %s edit",
		(edit) => {
			const world = previousWorld();
			if (edit === "crop") {
				world.terrain[index(32, 8)] = "soil";
				world.crops[index(32, 8)] = { kind: "berry", watered: true, growth: 0.4 };
			} else if (edit === "terrain") world.terrain[index(32, 8)] = "path";
			else if (edit === "placed") world.objects.push({ id: 999, kind: "fence", x: 32, y: 8 });
			else if (edit === "removed") world.objects = world.objects.filter((o) => o.id !== 91);
			else world.objects.find((o) => o.id === 91)!.x = 32;
			world.seeds = 37;
			world.harvest = 12;
			world.elapsed = 142;
			const before = structuredClone(world),
				loaded = deserialize(serialize(world))!;
			expect(loaded).toEqual({ ...before, riceComposition: 5 });
		}
	);

	it("preserves the player's footing and subsequent field edits across reloads", () => {
		const world = previousWorld();
		world.player = { x: 33.5 * TILE_SIZE, y: 11.5 * TILE_SIZE, dx: 0, dy: 1 };
		const loaded = deserialize(serialize(world))!;
		expect(loaded).not.toBeNull();
		expect(loaded.player).toEqual(world.player);
		expect(cell(loaded, 33, 11)).toBe("soil");
		expect(loaded.crops[index(33, 11)]).toBeUndefined();
		delete loaded.crops[index(34, 12)];
		loaded.terrain[index(34, 12)] = "path";
		expect(deserialize(serialize(loaded))).toEqual(loaded);
		expect(deserialize(JSON.stringify({ ...loaded, riceComposition: 6 }))).toBeNull();
	});

	it.each(["soil", "paddy"] as const)(
		"plants, grows, harvests and replants rice on %s",
		(terrain) => {
			const world = createWorld();
			world.player = { x: 30.5 * TILE_SIZE, y: 9.5 * TILE_SIZE, dx: 1, dy: 0 };
			const key = index(31, 9);
			delete world.crops[key];
			world.terrain[key] = terrain;
			expect(act(world, "rice", 31, 9)).toBe("planted");
			expect(world.seeds).toBe(23);
			expect(world.crops[key].watered).toBe(terrain === "paddy");
			if (terrain === "soil") {
				grow(world, 90);
				expect(world.crops[key].growth).toBe(0);
				expect(act(world, "water", 31, 9)).toBe("watered");
			}
			grow(world, 89);
			expect(act(world, "hand", 31, 9)).toBe("growing");
			grow(world, 1);
			expect(act(world, "hand", 31, 9)).toBe("harvested");
			expect(world.harvest).toBe(1);
			expect(world.seeds).toBe(25);
			expect(world.terrain[key]).toBe(terrain);
			expect(act(world, "rice", 31, 9)).toBe("planted");
			expect(deserialize(serialize(world))).toEqual(world);
		}
	);

	it.each([1, 2, 3] as const)(
		"expands composition %i into one continuous field and retains played crops",
		(composition) => {
			const world = createWorld();
			world.riceComposition = composition;
			// Restore the saved layouts: two separate plots, or just the lower one.
			for (let y = 6; y <= 12; y++)
				for (let x = 31; x <= 40; x++) {
					delete world.crops[index(x, y)];
					world.terrain[index(x, y)] = y === 9 ? "path" : "grass";
				}
			for (let y = 10; y <= 12; y++)
				for (let x = 31; x <= 39; x++) {
					if (y === 12 && (x === 31 || x === 39)) continue;
					world.terrain[index(x, y)] = "paddy";
					world.crops[index(x, y)] = { kind: "rice", watered: true, growth: 0.7 };
				}
			if (composition === 1)
				for (let y = 6; y <= 8; y++)
					for (let x = 33; x <= 40; x++) {
						if (y === 6 && (x === 33 || x >= 39)) continue;
						world.terrain[index(x, y)] = "paddy";
						world.crops[index(x, y)] = { kind: "rice", watered: true, growth: 1 };
					}
			if (composition === 3)
				for (let y = 6; y <= 12; y++)
					for (let x = 31; x <= 40; x++) {
						if ((y === 6 && x >= 39) || (y === 12 && (x === 31 || x === 40))) continue;
						world.terrain[index(x, y)] = "paddy";
						world.crops[index(x, y)] ??= { kind: "rice", watered: true, growth: 1 };
					}
			delete world.crops[index(34, 11)];
			world.crops[index(35, 11)].growth = 0.37;
			world.terrain[index(36, 8)] = "soil";
			world.crops[index(36, 8)] = { kind: "berry", watered: true, growth: 0.2 };
			world.player = { x: 34.5 * TILE_SIZE, y: 7.5 * TILE_SIZE, dx: 1, dy: 0 };
			world.seeds = 32;
			world.harvest = 7;
			const before = structuredClone(world),
				loaded = deserialize(serialize(world))!;
			expect(loaded.riceComposition).toBe(5);
			for (let key = 0; key < loaded.terrain.length; key++) {
				const x = key % WIDTH,
					y = Math.floor(key / WIDTH);
				if (before.terrain[key] === "paddy" || !(x >= 31 && x <= 40 && y >= 6 && y <= 12)) {
					expect(loaded.terrain[key]).toBe(
						before.terrain[key] === "paddy" ? "soil" : before.terrain[key]
					);
					expect(loaded.crops[key]).toEqual(before.crops[key]);
				}
			}
			for (let x = 31; x <= 40; x++) expect(cell(loaded, x, 9)).toBe("soil");
			expect(loaded.crops[index(34, 11)]).toBeUndefined();
			expect(loaded.crops[index(35, 11)].growth).toBe(0.37);
			expect(cell(loaded, 36, 8)).toBe("soil");
			expect(loaded.crops[index(36, 8)]).toEqual(before.crops[index(36, 8)]);
			expect(loaded.objects).toEqual(before.objects);
			expect(loaded.player).toEqual(before.player);
			expect(loaded.seeds).toBe(32);
			expect(loaded.harvest).toBe(7);
			expect(canStand(loaded, loaded.player.x, loaded.player.y)).toBe(true);
			expect(deserialize(serialize(loaded))).toEqual(loaded);
		}
	);

	it("fills the four corners and clears obstacles from the rectangle without resetting crops", () => {
		const world = createWorld();
		world.riceComposition = 3;
		for (const [x, y] of [
			[39, 6],
			[40, 6],
			[31, 12],
			[40, 12]
		]) {
			world.terrain[index(x, y)] = "grass";
			delete world.crops[index(x, y)];
		}
		for (const object of world.objects) {
			if (object.id === 60) object.x = 39;
			if (object.kind === "tree" && object.y === 3 && [31, 34, 37, 40].includes(object.x))
				object.y = 4;
		}
		world.objects.push(
			{ id: 999, kind: "fence", x: 35, y: 9 },
			{ id: 1000, kind: "rock", x: 36, y: 10 }
		);
		delete world.crops[index(35, 9)];
		delete world.crops[index(36, 10)];
		world.crops[index(37, 11)].growth = 0.4;
		const loaded = deserialize(serialize(world))!;
		expect(loaded.riceComposition).toBe(5);
		for (let y = 6; y <= 12; y++)
			for (let x = 31; x <= 40; x++) {
				expect(cell(loaded, x, y)).toBe("soil");
				expect(objectsAt(loaded, x, y)).toEqual([]);
			}
		expect(loaded.objects.find((o) => o.id === 60)).toMatchObject({ x: 42, y: 6 });
		expect(
			loaded.objects.filter(
				(o) => o.kind === "tree" && o.y === 3 && [31, 34, 37, 40].includes(o.x)
			)
		).toHaveLength(4);
		expect(loaded.crops[index(37, 11)].growth).toBe(0.4);
		expect(loaded.crops[index(35, 9)]).toBeUndefined();
		expect(loaded.seeds).toBe(world.seeds);
		expect(deserialize(serialize(loaded))).toEqual(loaded);
	});

	it("keeps the player's destination clear when an obstructing lamp cannot be relocated", () => {
		const world = createWorld();
		world.riceComposition = 3;
		world.objects.find((o) => o.id === 60)!.x = 39;
		delete world.crops[index(39, 6)];
		world.terrain[index(39, 6)] = "grass";
		world.player = { x: 42.5 * TILE_SIZE, y: 6.5 * TILE_SIZE, dx: -1, dy: 0 };
		const loaded = deserialize(serialize(world))!;
		expect(loaded.player).toEqual(world.player);
		expect(canStand(loaded, loaded.player.x, loaded.player.y)).toBe(true);
		expect(loaded.objects.find((o) => o.id === 60)).toBeUndefined();
		expect(cell(loaded, 39, 6)).toBe("soil");
	});

	it("converts the existing paddy to unfenced soil while preserving crops and the original garden fences", () => {
		const world = createWorld();
		world.riceComposition = 4;
		for (let y = 6; y <= 12; y++)
			for (let x = 31; x <= 40; x++) world.terrain[index(x, y)] = "paddy";
		delete world.crops[index(34, 11)];
		world.crops[index(35, 11)] = { kind: "rice", growth: 0.3, watered: false };
		world.objects.push({ id: 999, kind: "fence", x: 34, y: 11 });
		const before = structuredClone(world),
			loaded = deserialize(serialize(world))!;
		expect(loaded.riceComposition).toBe(5);
		for (let y = 6; y <= 12; y++)
			for (let x = 31; x <= 40; x++) expect(cell(loaded, x, y)).toBe("soil");
		expect(loaded.crops).toEqual(before.crops);
		expect(loaded.objects).toEqual(before.objects.filter((o) => o.id !== 999));
		expect(loaded.seeds).toBe(before.seeds);
		expect(loaded.harvest).toBe(before.harvest);
		expect(loaded.player).toEqual(before.player);
		expect(deserialize(serialize(loaded))).toEqual(loaded);
	});

	it("rejects unsuitable crops, terrain and empty seed inventory", () => {
		const world = createWorld();
		world.player = { x: 30.5 * TILE_SIZE, y: 9.5 * TILE_SIZE, dx: 1, dy: 0 };
		const key = index(31, 9);
		delete world.crops[key];
		for (const terrain of ["grass", "path", "water"] as const) {
			world.terrain[key] = terrain;
			expect(act(world, "rice", 31, 9)).toBe("invalid");
		}
		world.terrain[key] = "paddy";
		for (const tool of ["turnip", "berry"] as const)
			expect(act(world, tool, 31, 9)).toBe("invalid");
		world.seeds = 0;
		expect(act(world, "rice", 31, 9)).toBe("invalid");
		world.crops[key] = { kind: "berry", growth: 0, watered: false };
		expect(deserialize(serialize(world))).toBeNull();
	});
});
