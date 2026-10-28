import { pierEdges } from "./environment";
import { cell, DEFINITIONS, objectsAt, TILE_SIZE, type World } from "./world";

export const BOAT_ART = { frame: [969, 738, 244, 179] as const, width: 44 };
export interface Mooring {
	id: number;
	x: number;
	y: number;
	pierX: number;
	side: number;
	ties: { y: number; dx: number; dy: number }[];
}

// Move artwork clear of the planks only when the entire bobbing envelope is
// water. Logical objects/collision and saved positions remain authoritative.
export function boatMoorings(world: World): Mooring[] {
	const edges = pierEdges(world),
		result: Mooring[] = [],
		{ w, h } = DEFINITIONS.boat,
		height = (BOAT_ART.width * BOAT_ART.frame[3]) / BOAT_ART.frame[2];
	for (const boat of world.objects) {
		if (boat.kind !== "boat") continue;
		for (const side of [1, -1]) {
			const boundary = (side > 0 ? boat.x : boat.x + w) * TILE_SIZE,
				pierX = boundary - side * 2,
				top = boat.y * TILE_SIZE,
				y = (boat.y + h) * TILE_SIZE,
				x = boundary + side * (BOAT_ART.width / 2 + 6),
				upper = edges
					.filter((e) => e.x === pierX && e.to < top && top - e.to < TILE_SIZE * 2)
					.sort((a, b) => b.to - a.to)[0],
				lower = edges
					.filter((e) => e.x === pierX && e.from > y && e.from - y < TILE_SIZE * 2)
					.sort((a, b) => a.from - b.from)[0];
			if (!upper || !lower) continue;
			const dockX = side > 0 ? boat.x - 1 : boat.x + w;
			if (
				!Array.from({ length: h }, (_, i) => boat.y + i).every((cy) =>
					objectsAt(world, dockX, cy).some((o) => o.kind === "dock")
				)
			)
				continue;
			let clear = true;
			for (
				let cy = Math.floor((y - height - 1) / TILE_SIZE);
				cy <= Math.floor((y + 1) / TILE_SIZE);
				cy++
			)
				for (
					let cx = Math.floor((x - BOAT_ART.width / 2 - 1) / TILE_SIZE);
					cx <= Math.floor((x + BOAT_ART.width / 2 + 1) / TILE_SIZE);
					cx++
				)
					if (
						cell(world, cx, cy) !== "water" ||
						objectsAt(world, cx, cy).some((o) => o !== boat)
					)
						clear = false;
			if (!clear) continue;
			// Two gunnel attachment points measured inside the source boat frame.
			const ties = [
				[154, 17, upper.to - 10],
				[8, 92, lower.from - 10]
			].map(([sx, sy, dockY]) => ({
				y: dockY,
				dx: (sx / BOAT_ART.frame[2] - 0.5) * BOAT_ART.width * side,
				dy: ((sy - BOAT_ART.frame[3]) / BOAT_ART.frame[2]) * BOAT_ART.width
			}));
			result.push({ id: boat.id, x, y, pierX, side, ties });
			break;
		}
	}
	return result;
}
