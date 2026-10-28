import { cell, DEFINITIONS, index, objectsAt, TILE_SIZE, type Terrain, type World } from "./world";
import { GARDEN_PROPS } from "./gardenProps";

// Bottom-centered artwork bounds, including a small walking/planting clearance.
// Check the entire image, so future player edits can never hide under decoration.
export function sceneryFits(
	world: World,
	x: number,
	y: number,
	width: number,
	height: number,
	terrain: Terrain | readonly Terrain[] = "grass",
	clearance = 2
) {
	const allowed = typeof terrain === "string" ? [terrain] : terrain;
	for (
		let cy = Math.floor((y - height - clearance) / TILE_SIZE);
		cy <= Math.floor((y + clearance) / TILE_SIZE);
		cy++
	)
		for (
			let cx = Math.floor((x - width / 2 - clearance) / TILE_SIZE);
			cx <= Math.floor((x + width / 2 + clearance) / TILE_SIZE);
			cx++
		)
			if (
				!allowed.includes(cell(world, cx, cy) as Terrain) ||
				objectsAt(world, cx, cy).length ||
				world.crops[index(cx, cy)]
			)
				return false;
	return true;
}

// Authored accents occupy quiet edges of the living/farming areas, away from gates.
export const GARDEN_ACCENTS = (
	[
		{ name: "bench", x: 11.5, y: 12.2 },
		{ name: "planter", x: 12.8, y: 12.2 },
		{ name: "mailbox", x: 18.6, y: 12.8 },
		{ name: "cart", x: 26.5, y: 9.6 },
		{ name: "crate", x: 25.8, y: 10.8 },
		{ name: "wateringCan", x: 27.5, y: 10.8 },
		{ name: "basket", x: 6.2, y: 17.5 },
		{ name: "wateringCan", x: 14, y: 17.5 }
	] as const
).map((prop) => ({
	...prop,
	...(prop.name === "cart" ? { width: 43, height: 35 } : GARDEN_PROPS[prop.name])
}));

// Only the outside water-facing sides receive ropes. A boat leaves a mooring gap;
// land-facing entrances and the middle of a joined pier stay open.
export function pierEdges(world: World) {
	const rows = new Map<number, Set<number>>();
	for (const dock of world.objects) {
		if (dock.kind !== "dock") continue;
		const { w, h } = DEFINITIONS.dock;
		for (const side of [-1, 1]) {
			const outsideX = side < 0 ? dock.x - 1 : dock.x + w,
				edgeX = (side < 0 ? dock.x : dock.x + w) * TILE_SIZE - side * 2;
			for (let y = dock.y; y < dock.y + h; y++) {
				if (cell(world, outsideX, y) !== "water" || objectsAt(world, outsideX, y).length)
					continue;
				if (!rows.has(edgeX)) rows.set(edgeX, new Set());
				rows.get(edgeX)!.add(y);
			}
		}
	}
	const edges: { x: number; from: number; to: number }[] = [];
	for (const [x, occupied] of rows) {
		const sorted = [...occupied].sort((a, b) => a - b);
		let first = sorted[0],
			previous = first;
		for (let i = 1; i <= sorted.length; i++) {
			const next = sorted[i];
			if (next !== previous + 1) {
				edges.push({ x, from: first * TILE_SIZE + 3, to: (previous + 1) * TILE_SIZE - 3 });
				first = next;
			}
			previous = next;
		}
	}
	return edges;
}

export const BUTTERFLY_MEADOWS = [
	{ x: 11, y: 12.3, color: 0xffd280 },
	{ x: 26.95, y: 11.4, color: 0xf2dfb5 },
	{ x: 25.7, y: 22.5, color: 0x9ec8dd },
	{ x: 7.5, y: 16.4, color: 0xffd280 }
] as const;
