import { cell, DEFINITIONS, index, objectsAt, TILE_SIZE, type World } from "./world";

// Last dry row in each column, west to east. A shallow cove separates uneven
// headlands, while the farm lane, corner trees and dock remain untouched.
const SOUTH_BANK = [31, 31, 32, 32, 32, 31, 30, 30, 30, 31, 31, 31, 32, 32, 32, 32, 31, 31, 31];
const OUTCROPS = new Set([3, 4, 5, 6, 7, 13, 14, 15, 16, 17, 20, 21]);

// Grass extends past the visible roots, not just to the tree's logical foot.
// The dock keeps its wooden surface over the eastern shoulder of the bank.
const TREE_BANKS = [
	{
		treeX: 1,
		columns: [
			[0, 32],
			[1, 33],
			[2, 33],
			[3, 32],
			[4, 32]
		],
		rocks: [3, 4]
	},
	{
		treeX: 22,
		columns: [
			[20, 32],
			[21, 33],
			[22, 33],
			[23, 33]
		],
		rocks: [21]
	}
] as const;

export function applyTreeBanks(world: World, seed: World) {
	if (world.treeBankComposition === 1) return;
	for (const bank of TREE_BANKS) {
		const original = seed.objects.find(
				(o) => o.kind === "tree" && o.x === bank.treeX && o.y === 31
			),
			tree = world.objects.find(
				(o) =>
					o.id === original?.id && o.kind === "tree" && o.x === bank.treeX && o.y === 31
			);
		if (!tree) continue;
		const cells = bank.columns.flatMap(([x, lastDry]) =>
			Array.from({ length: lastDry - 31 }, (_, i) => ({ x, y: 32 + i }))
		);
		if (
			cells.some(
				({ x, y }) =>
					!(["grass", "water"] as (string | undefined)[]).includes(cell(world, x, y)) ||
					world.crops[index(x, y)] ||
					objectsAt(world, x, y).some(
						(o) =>
							o !== tree &&
							!(
								o.kind === "dock" &&
								seed.objects.some(
									(s) =>
										s.id === o.id &&
										s.kind === "dock" &&
										s.x === o.x &&
										s.y === o.y
								)
							)
					)
			)
		)
			continue;
		for (const { x, y } of cells) world.terrain[index(x, y)] = "grass";
		// Keep removed/replaced rocks removed, and never move a blocker onto feet.
		for (const x of bank.rocks) {
			const originalRock = seed.objects.find(
					(o) => o.kind === "rock" && o.x === x && o.y === 31
				),
				rock = world.objects.find(
					(o) => o.id === originalRock?.id && o.kind === "rock" && o.x === x && o.y === 31
				),
				y = bank.columns.find(([cx]) => cx === x)![1];
			if (
				rock &&
				!(
					world.player.x + 3 >= x * TILE_SIZE &&
					world.player.x - 3 < (x + 1) * TILE_SIZE &&
					world.player.y + 2 >= y * TILE_SIZE &&
					world.player.y - 2 < (y + 1) * TILE_SIZE
				)
			)
				rock.y = y;
		}
	}
	world.treeBankComposition = 1;
}

export function applySouthShore(world: World, seed: World) {
	if (world.southShoreComposition === 1) return;
	// Snapshot the original identities first: a fresh world is also its own seed.
	const originalRocks = seed.objects
		.filter((o) => o.kind === "rock" && o.y === 31 && o.x >= 3 && o.x <= 21)
		.map((o) => ({ ...o }));
	const removed = new Set<number>();
	for (const [column, lastDry] of SOUTH_BANK.entries()) {
		const x = column + 3,
			original = originalRocks.find((o) => o.x === x),
			rock = world.objects.find(
				(o) => o.id === original?.id && o.kind === "rock" && o.x === x && o.y === 31
			);
		let fits = true;
		for (const y of [31, 32]) {
			const key = index(x, y),
				old = cell(world, x, y),
				next = y <= lastDry ? "grass" : "water";
			if (
				old !== cell(seed, x, y) ||
				world.crops[key] ||
				objectsAt(world, x, y).some((o) => o !== rock) ||
				(next === "water" &&
					old !== "water" &&
					world.player.x + 3 >= x * TILE_SIZE &&
					world.player.x - 3 < (x + 1) * TILE_SIZE &&
					world.player.y + 2 >= y * TILE_SIZE &&
					world.player.y - 2 < (y + 1) * TILE_SIZE)
			)
				fits = false;
		}
		if (!fits) continue;
		for (const y of [31, 32]) world.terrain[index(x, y)] = y <= lastDry ? "grass" : "water";
		if (rock) {
			if (OUTCROPS.has(x)) rock.y = lastDry;
			else removed.add(rock.id);
		}
	}
	world.objects = world.objects.filter((o) => !removed.has(o.id));
	world.southShoreComposition = 1;
}

// This small authored composition follows the new bays. Each complete sprite is
// validated against actual saved terrain and objects before rendering.
export const SOUTH_BANK_ACCENTS = [
	{ name: "rock", x: 1.65, y: 33.9, scale: 0.42, water: false, mirror: false },
	{ name: "rock", x: 2.5, y: 33.9, scale: 0.45, water: false, mirror: true },
	{ name: "rock", x: 22.7, y: 33.9, scale: 0.5, water: false, mirror: false },
	{ name: "reeds", x: 12, y: 32.2, scale: 0.52, water: false, mirror: false },
	{ name: "reeds", x: 11.4, y: 32, scale: 0.36, water: false, mirror: true },
	{ name: "reeds", x: 19, y: 32.45, scale: 0.6, water: false, mirror: true },
	{ name: "reeds", x: 18.7, y: 32.65, scale: 0.4, water: false, mirror: false },
	{ name: "rock", x: 6.2, y: 33.9, scale: 0.75, water: true, mirror: true },
	{ name: "rock", x: 16.1, y: 34.1, scale: 0.65, water: true, mirror: false },
	{ name: "lilies", x: 10.4, y: 33.4, scale: 0.75, water: true, mirror: false },
	{ name: "lilies", x: 11.3, y: 33.8, scale: 0.52, water: true, mirror: true }
] as const;

export function southBankRockStyle(world: World, x: number, y: number) {
	if (x < 3 || x > 21 || y < 30 || y > 33 || cell(world, x, y + 1) !== "water") return null;
	return {
		variant: [3, 0, 2, 1][x % 4],
		offsetX: ((x * 7) % 5) - 2,
		offsetY: ((x * 3) % 5) - 1
	};
}

export function onSouthBank(world: World, x: number, y: number) {
	return (
		x >= 0 &&
		x <= 23 &&
		y >= 30 &&
		y <= 34 &&
		!world.objects.some(
			(o) =>
				o.kind === "dock" &&
				x >= o.x &&
				x < o.x + DEFINITIONS.dock.w &&
				y >= o.y &&
				y < o.y + DEFINITIONS.dock.h
		)
	);
}
