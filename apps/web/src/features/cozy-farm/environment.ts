import { cell, index, objectsAt, TILE_SIZE, type Terrain, type World } from "./world";
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
