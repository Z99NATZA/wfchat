import { Texture } from "pixi.js";
import { cell, HEIGHT, TILE_SIZE, WIDTH, type Terrain, type World } from "./world";
import { paddyEdges } from "./riceFields";

export const ART_DENSITY = 2;
export function hash(x: number, y: number, seed = 71) {
	let n = Math.imul(x + seed, 374761393) ^ Math.imul(y - seed, 668265263);
	n = Math.imul(n ^ (n >>> 13), 1274126177);
	return ((n ^ (n >>> 16)) >>> 0) / 4294967295;
}
function noise(x: number, y: number, size: number) {
	const gx = Math.floor(x / size),
		gy = Math.floor(y / size),
		fx = x / size - gx,
		fy = y / size - gy;
	const sx = fx * fx * (3 - 2 * fx),
		sy = fy * fy * (3 - 2 * fy);
	const a = hash(gx, gy) * (1 - sx) + hash(gx + 1, gy) * sx,
		b = hash(gx, gy + 1) * (1 - sx) + hash(gx + 1, gy + 1) * sx;
	return a * (1 - sy) + b * sy;
}
// Rounded visual transitions interpolate cell centers. Gameplay still reads exact cells.
export function coverage(world: World, x: number, y: number, kind: Terrain) {
	const gx = x / TILE_SIZE - 0.5,
		gy = y / TILE_SIZE - 0.5,
		ix = Math.floor(gx),
		iy = Math.floor(gy),
		fx = gx - ix,
		fy = gy - iy;
	const sample = (cx: number, cy: number) =>
		+(
			cell(
				world,
				Math.max(0, Math.min(WIDTH - 1, cx)),
				Math.max(0, Math.min(HEIGHT - 1, cy))
			) === kind
		);
	return (
		sample(ix, iy) * (1 - fx) * (1 - fy) +
		sample(ix + 1, iy) * fx * (1 - fy) +
		sample(ix, iy + 1) * (1 - fx) * fy +
		sample(ix + 1, iy + 1) * fx * fy
	);
}
// Bounded domain warping only affects the transition band, never cell centers.
export function visualCoverage(world: World, x: number, y: number, kind: Terrain) {
	const base = coverage(world, x, y, kind);
	if (base <= 0.02 || base >= 0.98) return base;
	const amplitude = kind === "path" ? 17 : 5;
	return coverage(
		world,
		x + (noise(x + 97, y, 37) - 0.5) * amplitude,
		y + (noise(x, y + 173, 43) - 0.5) * amplitude,
		kind
	);
}
function causticRidge(x: number, y: number) {
	const gx = Math.floor(x),
		gy = Math.floor(y);
	let first = 99,
		second = 99;
	for (let dy = -1; dy <= 1; dy++)
		for (let dx = -1; dx <= 1; dx++) {
			const cx = gx + dx,
				cy = gy + dy,
				px = cx + hash(cx, cy, 19),
				py = cy + hash(cx, cy, 89),
				d = (x - px) ** 2 + (y - py) ** 2;
			if (d < first) {
				second = first;
				first = d;
			} else if (d < second) second = d;
		}
	return Math.max(0, 1 - (Math.sqrt(second) - Math.sqrt(first)) * 8) ** 3;
}
export interface ShorePoint {
	x: number;
	y: number;
	angle: number;
}

function paintPaddyBanks(c: CanvasRenderingContext2D, world: World) {
	c.save();
	c.scale(ART_DENSITY, ART_DENSITY);
	for (const { x, y, side } of paddyEdges(world)) {
		c.save();
		c.translate(x * TILE_SIZE, y * TILE_SIZE);
		if (side === "south") {
			c.translate(TILE_SIZE, TILE_SIZE);
			c.rotate(Math.PI);
		} else if (side === "west") {
			c.translate(0, TILE_SIZE);
			c.rotate(-Math.PI / 2);
		} else if (side === "east") {
			c.translate(TILE_SIZE, 0);
			c.rotate(Math.PI / 2);
		}
		// Raised earth and a darker wet face keep the water inside a tended bed.
		c.fillStyle = "#344b38";
		c.fillRect(0, 0, TILE_SIZE, 4);
		c.fillStyle = "#6e5c3f";
		c.fillRect(0, 0, TILE_SIZE, 3);
		c.fillStyle = "#a08a59";
		c.fillRect(0, 0, TILE_SIZE, 1);
		for (let i = 0; i < 13; i++) {
			const px = Math.floor(hash(x + i, y, side.length) * 30) / 2,
				py = 0.5 + Math.floor(hash(y + i, x, 829) * 4) / 2;
			c.fillStyle = ["#819052", "#baa36e", "#4f5835", "#91784c"][i % 4];
			c.fillRect(px, py, i % 3 ? 0.5 : 1, 0.5);
		}
		c.restore();
	}
	c.restore();
}

export class Landscape {
	texture: Texture | null = null;
	shore: ShorePoint[] = [];
	private signature = "";
	rebuild(world: World) {
		const signature = world.terrain.join(",");
		if (signature === this.signature && this.texture) return false;
		this.signature = signature;
		this.texture?.destroy(true);
		this.shore = [];
		const width = WIDTH * TILE_SIZE,
			height = HEIGHT * TILE_SIZE;
		const canvas = document.createElement("canvas");
		canvas.width = width * ART_DENSITY;
		canvas.height = height * ART_DENSITY;
		const context = canvas.getContext("2d");
		if (!context) throw new Error("Landscape canvas unavailable");
		const image = context.createImageData(canvas.width, canvas.height);
		const distance = new Float32Array(width * height),
			water = new Float32Array(width * height);
		// A deterministic distance field gives a continuous shelf beneath editable lake cells.
		for (let y = 0; y < height; y++)
			for (let x = 0; x < width; x++) {
				const i = y * width + x;
				water[i] = visualCoverage(world, x + 0.5, y + 0.5, "water");
				distance[i] = water[i] > 0.5 ? 999 : 0;
			}
		for (let y = 0; y < height; y++)
			for (let x = 0; x < width; x++) {
				const i = y * width + x;
				if (x) distance[i] = Math.min(distance[i], distance[i - 1] + 1);
				if (y) distance[i] = Math.min(distance[i], distance[i - width] + 1);
				if (x && y) distance[i] = Math.min(distance[i], distance[i - width - 1] + 1.414);
				if (x < width - 1 && y)
					distance[i] = Math.min(distance[i], distance[i - width + 1] + 1.414);
			}
		for (let y = height - 1; y >= 0; y--)
			for (let x = width - 1; x >= 0; x--) {
				const i = y * width + x;
				if (x < width - 1) distance[i] = Math.min(distance[i], distance[i + 1] + 1);
				if (y < height - 1) distance[i] = Math.min(distance[i], distance[i + width] + 1);
				if (x < width - 1 && y < height - 1)
					distance[i] = Math.min(distance[i], distance[i + width + 1] + 1.414);
				if (x && y < height - 1)
					distance[i] = Math.min(distance[i], distance[i + width - 1] + 1.414);
			}
		for (let y = 0; y < canvas.height; y++)
			for (let x = 0; x < canvas.width; x++) {
				const wx = x / ART_DENSITY,
					wy = y / ART_DENSITY,
					i = Math.floor(wy) * width + Math.floor(wx),
					n = noise(wx, wy, 31),
					fine = hash(x, y),
					detail = noise(wx, wy, 5);
				const wet = water[i] > 0.5;
				let r: number, g: number, b: number;
				if (wet) {
					const basin = noise(wx, wy, 87),
						depth = Math.min(1, distance[i] / (51 + basin * 30)),
						shelf = (1 - depth) ** 1.6;
					const caustic =
						distance[i] < 70
							? causticRidge(
									wx / 13 + Math.sin(wy * 0.16 + n * 5) * 0.4,
									wy / 10 + Math.cos(wx * 0.19 + detail) * 0.35
								) *
								shelf *
								Math.max(0, (noise(wx, wy, 17) - 0.25) * 1.4)
							: 0;
					const current = noise(wx + wy * 0.17, wy, 19),
						glint =
							Math.max(0, hash(Math.floor(wx / 2), Math.floor(wy / 2)) - 0.94) * 11;
					r = 10 + basin * 6 + shelf * 25 + caustic * 30;
					g = 43 + basin * 16 + current * 5 + shelf * 91 + caustic * 40;
					b = 66 + basin * 17 + current * 5 + shelf * 73 + caustic * 28;
					g += glint * (0.3 + shelf);
					b += glint;
					// Broken foam and a dark wet lip replace the uniform bright border.
					if (
						distance[i] < 1.5 &&
						hash(Math.floor(wx / 5), Math.floor(wy / 4), 27) > 0.48
					) {
						r += 55;
						g += 45;
						b += 28;
					} else if (distance[i] < 3) {
						r -= 4;
						g -= 11;
						b -= 9;
					}
				} else {
					const path = visualCoverage(world, wx, wy, "path"),
						soil = visualCoverage(world, wx, wy, "soil"),
						paddy = visualCoverage(world, wx, wy, "paddy");
					const patch = noise(wx, wy, 67),
						edge = 0.48 + (noise(wx, wy, 23) - 0.5) * 0.32 + (detail - 0.5) * 0.15;
					// A narrow stippled ecotone reads as earth between grass tufts, not blur.
					const pathMix = Math.max(0, Math.min(1, (path - edge) * 4.5 + 0.5));
					const soilMix = Math.max(
						0,
						Math.min(1, (soil - 0.48 - (detail - 0.5) * 0.14) * 6 + 0.5)
					);
					const dirt = pathMix > fine,
						tilled = soilMix > fine;
					r = 39 + n * 19 + detail * 6 + patch * 10;
					g = 66 + n * 26 + detail * 10 + patch * 12;
					b = 37 + n * 13 + detail * 5;
					if (paddy > 0.46 + (detail - 0.5) * 0.08) {
						// Shallow jade irrigation water, with a dark earthen lip and
						// broken reflections between the planted rows.
						const rim = Math.max(0, 1 - (paddy - 0.46) * 5),
							glint =
								Math.sin(wy * 1.2 + noise(wx, wy, 19) * 4) > 0.92 && fine > 0.55
									? 16
									: 0;
						const channel = Math.max(0, 1 - Math.abs((wy % TILE_SIZE) - 3.5) / 2.5);
						r = 66 + n * 13 + glint + channel * 5 - rim * 24;
						g = 100 + n * 18 + glint + channel * 14 - rim * 35;
						b = 78 + n * 15 + glint + channel * 17 - rim * 35;
					} else if (tilled) {
						const shoulder = (1 - soilMix) * 9;
						const furrow =
							Math.floor(wy + Math.sin(wx * 0.13) * 0.3) % 4 === 0
								? -1
								: Math.floor(wy) % 4 === 1
									? 0.7
									: 0;
						r = 69 + n * 22 + furrow * 7 - shoulder;
						g = 46 + n * 13 + furrow * 4 - shoulder * 0.7;
						b = 31 + n * 8 - shoulder * 0.4;
					} else if (dirt) {
						const worn = Math.min(1, path * 1.2),
							pebble = fine > 0.994 ? 16 : 0;
						r = 140 + n * 22 + detail * 8 + worn * 15 + pebble;
						g = 111 + n * 20 + detail * 6 + worn * 12 + pebble;
						b = 68 + n * 14 + worn * 8 + pebble;
					} else if (fine > 0.95) {
						r += 7;
						g += 10;
						b += 3;
					}

					if (water[i] > 0.21) {
						const bank = (water[i] - 0.21) / 0.29;
						r = r * (1 - bank * 0.4) + 57 * bank * 0.4;
						g = g * (1 - bank * 0.4) + 67 * bank * 0.4;
						b = b * (1 - bank * 0.4) + 48 * bank * 0.4;
					}
				}
				const grain = (fine - 0.5) * (wet ? 2 : 5),
					p = (y * canvas.width + x) * 4;
				image.data[p] = r + grain;
				image.data[p + 1] = g + grain;
				image.data[p + 2] = b + grain;
				image.data[p + 3] = 255;
			}
		context.putImageData(image, 0, 0);
		paintPaddyBanks(context, world);
		// Small rooted fans replace isolated bright strokes. Jittered placement and
		// patch-sized pigment changes keep the meadow organic at gameplay scale.
		for (let gy = 4; gy < height - 4; gy += 3)
			for (let gx = 4; gx < width - 4; gx += 3) {
				const x = gx + Math.floor(hash(gx, gy, 421) * 3),
					y = gy + Math.floor(hash(gx, gy, 433) * 3);
				if (
					!(["grass", "path"] as (Terrain | undefined)[]).includes(
						cell(world, Math.floor(x / TILE_SIZE), Math.floor(y / TILE_SIZE))
					) ||
					visualCoverage(world, x, y, "path") > 0.75 ||
					coverage(world, x, y - 2, "soil") > 0.08 ||
					coverage(world, x, y, "soil") > 0.08 ||
					coverage(world, x, y, "paddy") > 0.08 ||
					coverage(world, x, y - 2, "paddy") > 0.08 ||
					water[y * width + x] > 0.2 ||
					water[(y - 3) * width + x] > 0.2
				)
					continue;
				const r = hash(x, y, 413),
					patch = noise(x, y, 24);
				const edge = visualCoverage(world, x, y, "path");
				if (r < 0.985 - patch * 0.07 - (edge > 0.08 ? 0.14 : 0)) continue;
				const px = x * ART_DENSITY,
					py = y * ART_DENSITY,
					blade = 3 + Math.floor(hash(x, y, 439) * 4);
				context.fillStyle = "#344e31";
				context.fillRect(px - 2, py, 5, 1);
				context.fillStyle = patch > 0.6 ? "#6e8347" : "#52723c";
				context.fillRect(px, py - blade, 1, blade);
				context.fillRect(px - 1, py - 2, 1, 2);
				context.fillRect(px - 2, py - 4, 1, 2);
				context.fillRect(px + 1, py - 3, 1, 3);
				context.fillRect(px + 2, py - 4, 1, 2);
				context.fillStyle = patch > 0.6 ? "#94a05d" : "#7e9150";
				context.fillRect(px, py - blade, 1, 1);
				if (r > 0.986 && patch > 0.56 && edge < 0.08) {
					// Occasional clover rosettes and pale seed heads stay in the meadow.
					context.fillStyle = "#7c9250";
					context.fillRect(px - 3, py - 2, 2, 1);
					context.fillRect(px + 2, py - 2, 2, 1);
					context.fillStyle = "#b7b17a";
					context.fillRect(px, py - blade - 1, 1, 1);
				}
			}
		// Sparse worn stones cluster at path junctions and the cottage, not on a lattice.
		for (let i = 0; i < 170; i++) {
			const x = Math.floor(hash(i, 11) * width),
				y = Math.floor(hash(i, 71) * height);
			if (
				coverage(world, x, y, "path") < 0.42 ||
				hash(Math.floor(x / 38), Math.floor(y / 29)) < 0.45
			)
				continue;
			context.fillStyle = "#8c8263";
			context.fillRect(x * ART_DENSITY, y * ART_DENSITY, 2 + (i % 3), 2);
			context.fillStyle = "#c8ba8d";
			context.fillRect(x * ART_DENSITY, y * ART_DENSITY, 2 + (i % 2), 1);
		}
		// Small curved foam segments follow the rendered shore, not the square tile edges.
		for (let y = 2; y < height - 2; y += 3)
			for (let x = 2; x < width - 2; x += 3) {
				const i = y * width + x;
				if (distance[i] >= 1 && distance[i] <= 2 && hash(x, y) > 0.35) {
					const dx = water[i + 1] - water[i - 1],
						dy = water[i + width] - water[i - width];
					this.shore.push({ x, y, angle: Math.atan2(dy, dx) + Math.PI / 2 });
				}
			}
		this.texture = Texture.from(canvas);
		this.texture.source.scaleMode = "nearest";
		return true;
	}
	destroy() {
		this.texture?.destroy(true);
		this.texture = null;
	}
}
