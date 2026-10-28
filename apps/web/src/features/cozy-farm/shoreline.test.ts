import { describe, expect, it } from "vitest";
import { forestStyle } from "./composition";
import { canStand, cell, createWorld, deserialize, index, serialize, TILE_SIZE } from "./world";

function previousTreeBanks() {
	const world = createWorld();
	delete world.treeBankComposition;
	for (const x of [0, 1, 2, 3, 4, 20, 21, 22, 23])
		for (const y of [32, 33]) world.terrain[index(x, y)] = "water";
	for (const rock of world.objects)
		if (rock.kind === "rock" && [3, 4, 21].includes(rock.x) && rock.y >= 31) rock.y = 31;
	return world;
}

// Restore the original south bank, including its seeded rock identities. The
// original north-south path left columns 19/20 without shoreline rocks.
function legacyWorld() {
	const world = previousTreeBanks();
	delete world.southShoreComposition;
	const columns = [...Array.from({ length: 16 }, (_, i) => i + 3), 21],
		first = world.objects.find((o) => o.kind === "rock" && o.x === 3 && o.y === 31)!.id;
	world.objects = world.objects.filter((o) => o.id < first || o.id >= first + columns.length);
	world.objects.push(
		...columns.map((x, i) => ({ id: first + i, kind: "rock" as const, x, y: 31 }))
	);
	world.objects.sort((a, b) => a.id - b.id);
	for (let x = 3; x <= 21; x++) {
		world.terrain[index(x, 31)] = "grass";
		world.terrain[index(x, 32)] = "water";
	}
	return world;
}

describe("south shoreline composition", () => {
	it("curves the bank and groups visible rocks without changing the farm or dock", () => {
		const old = legacyWorld(),
			world = createWorld();
		expect(cell(world, 6, 32)).toBe("grass");
		expect(cell(world, 10, 31)).toBe("water");
		expect(cell(world, 16, 32)).toBe("grass");
		for (let i = 0; i < old.terrain.length; i++) {
			const x = i % 48,
				y = Math.floor(i / 48);
			const bank =
				(x >= 3 && x <= 21 && y >= 31 && y <= 32) ||
				([0, 1, 2, 3, 4, 20, 21, 22, 23].includes(x) && y >= 32 && y <= 33);
			if (!bank) expect(world.terrain[i]).toBe(old.terrain[i]);
		}
		const changed = (o: (typeof old.objects)[number]) =>
			o.kind === "rock" && o.x >= 3 && o.x <= 21 && o.y >= 30;
		expect(world.objects.filter((o) => !changed(o))).toEqual(
			old.objects.filter((o) => !changed(o))
		);
		expect(world.objects.filter(changed).length).toBeLessThan(
			old.objects.filter(changed).length
		);
		for (const rock of world.objects.filter(changed)) {
			expect(cell(world, rock.x, rock.y)).toBe("grass");
			expect(cell(world, rock.x, rock.y + 1)).toBe("water");
		}
		expect(world.crops).toEqual(old.crops);
		expect(world.player).toEqual(old.player);
	});
	it("upgrades unedited older saves once and retains subsequent shoreline edits", () => {
		const loaded = deserialize(serialize(legacyWorld()))!;
		expect(loaded).toEqual(createWorld());
		loaded.terrain[index(10, 31)] = "grass";
		loaded.objects = loaded.objects.filter((o) => !(o.kind === "rock" && o.x === 5));
		expect(deserialize(serialize(loaded))).toEqual(loaded);
		const raw = JSON.parse(serialize(loaded));
		raw.southShoreComposition = 2;
		expect(deserialize(JSON.stringify(raw))).toBeNull();
	});
	it("preserves old paths, crops, placed objects, removed rocks and inventory", () => {
		const world = legacyWorld();
		world.objects = world.objects.filter(
			(o) => !(o.kind === "rock" && [5, 9, 10, 11, 12, 16].includes(o.x) && o.y === 31)
		);
		world.terrain[index(9, 31)] = "path";
		world.terrain[index(10, 31)] = "soil";
		world.crops[index(10, 31)] = { kind: "berry", watered: true, growth: 0.5 };
		world.terrain[index(11, 30)] = world.terrain[index(12, 30)] = "grass";
		world.objects.push({ id: 999, kind: "tree", x: 11, y: 30 });
		world.objects.push({ id: 1000, kind: "flowers", x: 16, y: 31 });
		world.seeds = 37;
		world.harvest = 9;
		world.elapsed = 141;
		const loaded = deserialize(serialize(world))!;
		expect(loaded).not.toBeNull();
		expect(cell(loaded, 9, 31)).toBe("path");
		expect(cell(loaded, 10, 31)).toBe("soil");
		expect(cell(loaded, 11, 31)).toBe("grass");
		expect(cell(loaded, 16, 32)).toBe("water");
		expect(loaded.crops).toEqual(world.crops);
		expect(loaded.objects.filter((o) => o.id >= 999)).toEqual(
			world.objects.filter((o) => o.id >= 999)
		);
		expect(loaded.objects.some((o) => o.kind === "rock" && o.x === 5)).toBe(false);
		expect([loaded.seeds, loaded.harvest, loaded.elapsed]).toEqual([37, 9, 141]);
	});
	it("never replaces ground beneath a player with water, including foot overlap", () => {
		for (const x of [10.5 * TILE_SIZE, 10 * TILE_SIZE - 1]) {
			const world = legacyWorld();
			world.objects = world.objects.filter(
				(o) => !(o.kind === "rock" && o.y === 31 && o.x >= 9 && o.x <= 11)
			);
			world.player.x = x;
			world.player.y = 31.5 * TILE_SIZE;
			expect(canStand(world, world.player.x, world.player.y)).toBe(true);
			const loaded = deserialize(serialize(world))!;
			expect(loaded).not.toBeNull();
			expect(canStand(loaded, loaded.player.x, loaded.player.y)).toBe(true);
			expect(loaded.player).toEqual(world.player);
		}
	});
});

describe("tree roots on solid banks", () => {
	it("supports complete tree footprints and visible root margins at both corners", () => {
		const world = createWorld();
		for (const tree of world.objects.filter((o) => o.kind === "tree" && o.y === 31)) {
			for (let dy = 0; dy < 2; dy++)
				for (let dx = 0; dx < 2; dx++)
					expect(cell(world, tree.x + dx, tree.y + dy)).toBe("grass");
			const style = forestStyle(tree.x, tree.y),
				x = (tree.x + 1) * TILE_SIZE + style.offsetX,
				y = (tree.y + 2) * TILE_SIZE + style.offsetY;
			for (const dx of [-12, 0, 12])
				expect(
					cell(world, Math.floor((x + dx) / TILE_SIZE), Math.floor((y + 8) / TILE_SIZE))
				).toBe("grass");
		}
	});
	it("grounds already composed saves once and keeps their cove, dock and later edits", () => {
		const old = previousTreeBanks(),
			loaded = deserialize(serialize(old))!;
		expect(loaded).toEqual(createWorld());
		expect(cell(loaded, 10, 31)).toBe("water");
		expect(loaded.objects.filter((o) => o.kind === "dock" || o.kind === "tree")).toEqual(
			old.objects.filter((o) => o.kind === "dock" || o.kind === "tree")
		);
		loaded.terrain[index(1, 33)] = "water";
		expect(deserialize(serialize(loaded))).toEqual(loaded);
		const raw = JSON.parse(serialize(loaded));
		raw.treeBankComposition = 2;
		expect(deserialize(JSON.stringify(raw))).toBeNull();
	});
	it("preserves planted banks and removed trees or rocks in older saves", () => {
		const edited = previousTreeBanks();
		edited.terrain[index(3, 32)] = "soil";
		edited.crops[index(3, 32)] = { kind: "turnip", watered: true, growth: 0.5 };
		const planted = deserialize(serialize(edited))!;
		expect(planted.crops).toEqual(edited.crops);
		expect(cell(planted, 3, 32)).toBe("soil");
		expect(cell(planted, 1, 33)).toBe("water");
		const removed = previousTreeBanks();
		removed.objects = removed.objects.filter(
			(o) =>
				!(o.kind === "tree" && o.x === 1 && o.y === 31) &&
				!(o.kind === "rock" && o.x === 21 && o.y === 31)
		);
		const loaded = deserialize(serialize(removed))!;
		expect(loaded.objects.some((o) => o.kind === "tree" && o.x === 1 && o.y === 31)).toBe(
			false
		);
		expect(loaded.objects.some((o) => o.kind === "rock" && o.x === 21)).toBe(false);
		expect(cell(loaded, 1, 33)).toBe("water");
		expect(cell(loaded, 22, 33)).toBe("grass");
	});
	it("keeps a player standing on an edited bank clear of relocated rocks", () => {
		const world = previousTreeBanks();
		world.terrain[index(3, 32)] = "grass";
		world.player.x = 3.5 * TILE_SIZE;
		world.player.y = 32.5 * TILE_SIZE;
		expect(canStand(world, world.player.x, world.player.y)).toBe(true);
		const loaded = deserialize(serialize(world))!;
		expect(canStand(loaded, loaded.player.x, loaded.player.y)).toBe(true);
		expect(loaded.objects.find((o) => o.kind === "rock" && o.x === 3)?.y).toBe(31);
	});
});
