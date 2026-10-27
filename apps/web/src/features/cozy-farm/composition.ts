import type { World } from "./world";

type Knot = readonly [x: number, y: number, radius: number];
// Separate, staggered junctions: the cottage feeds the west lane, the shed feeds
// the bend, and the farm/dock route departs farther east. Coordinates are cells.
const routes: readonly (readonly Knot[])[] = [
	[
		[3.5, 15.4, 0.9],
		[7, 14.1, 1.05],
		[11.2, 14.5, 0.95],
		[14.2, 15, 0.95],
		[17.6, 16.3, 1.1],
		[20.7, 16.7, 1],
		[24, 14.5, 0.9],
		[26.4, 13, 0.8],
		[28.3, 12.8, 0.7]
	],
	[
		[16.5, 11.2, 0.65],
		[16.8, 12.4, 0.7],
		[15.8, 14, 0.75],
		[14.2, 15, 0.85]
	],
	[
		[23, 11.2, 0.7],
		[23.1, 12.5, 0.75],
		[21.5, 14.6, 0.8],
		[20.7, 16.7, 0.9]
	],
	[
		[20.7, 16.7, 0.9],
		[20.1, 19.2, 0.8],
		[19.8, 22.2, 0.85],
		[20.4, 25.4, 0.9],
		[20, 28, 0.8],
		[21.3, 30.5, 0.8],
		[24.5, 30.5, 0.7]
	],
	[
		[11.2, 14.5, 0.7],
		[11, 17.5, 0.7],
		[11, 21, 0.7],
		[11, 25, 0.7],
		[10.8, 29.8, 0.8]
	],
	[
		[4, 29.5, 0.7],
		[7.5, 29.3, 0.75],
		[10.8, 29.8, 0.8],
		[16, 29.4, 0.85],
		[20, 30.1, 0.8],
		[24.5, 30.5, 0.7]
	]
];
function interpolate(a: number, b: number, c: number, d: number, t: number) {
	return (
		0.5 *
		(2 * b +
			(-a + c) * t +
			(2 * a - 5 * b + 4 * c - d) * t * t +
			(-a + 3 * b - 3 * c + d) * t * t * t)
	);
}
export function composedPathCells(width: number, height: number) {
	const cells = new Set<number>();
	for (const route of routes)
		for (let leg = 0; leg < route.length - 1; leg++) {
			const a = route[Math.max(0, leg - 1)],
				b = route[leg],
				c = route[leg + 1],
				d = route[Math.min(route.length - 1, leg + 2)];
			for (let step = 0; step <= 24; step++) {
				const t = step / 24,
					x = interpolate(a[0], b[0], c[0], d[0], t),
					y = interpolate(a[1], b[1], c[1], d[1], t),
					radius = b[2] + (c[2] - b[2]) * t;
				for (
					let cy = Math.max(0, Math.floor(y - radius));
					cy <= Math.min(height - 1, Math.floor(y + radius));
					cy++
				)
					for (
						let cx = Math.max(0, Math.floor(x - radius));
						cx <= Math.min(width - 1, Math.floor(x + radius));
						cx++
					)
						if (Math.hypot(cx + 0.5 - x, cy + 0.5 - y) <= radius)
							cells.add(cy * width + cx);
			}
		}
	return cells;
}
export function legacyPathCell(x: number, y: number) {
	return y === 14 || y === 15 || x === 19 || x === 20 || (y === 29 && x < 25);
}
// One-time path-only composition upgrade. Keep altered terrain, crops, objects
// and player state; all exchanged cells remain walkable grass/dirt.
export function applyPathComposition(world: World, width: number, height: number) {
	if (world.pathComposition === 1) return;
	const paths = composedPathCells(width, height);
	for (let y = 0; y < height; y++)
		for (let x = 0; x < width; x++) {
			const key = y * width + x,
				old = world.terrain[key],
				expected = legacyPathCell(x, y) ? "path" : "grass";
			if (old !== expected || world.crops[key]) continue;
			world.terrain[key] = paths.has(key) ? "path" : "grass";
		}
	world.pathComposition = 1;
}

export function forestStyle(x: number, y: number) {
	// Existing trunks/footprints remain in place. Small front-row firs expose
	// background trees and create visible pockets at the cottage and farm edges.
	const northFront = y === 4;
	const opening =
		(northFront && [4, 13, 25, 34, 43].includes(x)) ||
		(x === 1 && [10, 19, 28].includes(y)) ||
		(x === 22 && y === 25);
	const pocket = Math.floor(x / 7) + Math.floor(y / 8),
		pine = opening || pocket % 3 === 1;
	const scale = opening ? 0.63 : northFront ? 0.82 : (x + y) % 3 === 0 ? 0.9 : 1;
	return {
		variant: pine ? 0 : 1,
		scale,
		offsetX: ((x * 7 + y * 3) % 11) - 5,
		offsetY: opening ? -6 : ((x * 3 + y * 5) % 9) - 4
	};
}
