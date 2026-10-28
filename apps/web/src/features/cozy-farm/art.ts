import { Texture } from "pixi.js";
import { ART_DENSITY } from "./landscape";
import { GARDEN_PROPS } from "./gardenProps";
import { DETAILS, type Detail } from "./details";
import { BOAT_ART } from "./harbor";
import type { ObjectKind } from "./world";
import type { CharacterPose } from "./character";
import { CHARACTER_SHEETS, CHARACTER_ROWS } from "./character";
import {
	prepareIdle,
	prepareWalk,
	prepareRun,
	PLAYER_CELL,
	PLAYER_BODY_HEIGHT,
	PLAYER_FOOT,
	type PlayerSheets
} from "./playerSprites";

type Frame = readonly [number, number, number, number];
interface Asset {
	frame: Frame;
	width: number;
	height?: number;
}
// Measured alpha bounds from the original atlas, plus authored native world dimensions.
// Normalize source images ONCE to a common two-texel/world-pixel asset grid. Renderers
// use the same scale for every asset; a logical footprint never stretches a texture.
const environment: Record<string, Asset> = {
	cottage: { frame: [8, 12, 470, 440], width: 144 },
	shed: { frame: [484, 158, 258, 268], width: 72 },
	oak: { frame: [723, 46, 333, 400], width: 77 },
	pine: { frame: [1055, 30, 199, 405], width: 60 },
	rock: { frame: [41, 517, 248, 143], width: 27 },
	shrub: { frame: [380, 498, 236, 183], width: 33 },
	flowers: { frame: [718, 528, 198, 146], width: 24 },
	reeds: { frame: [1014, 456, 204, 234], width: 29 },
	lamp: { frame: [76, 675, 169, 242], width: 29 },
	fence: { frame: [326, 762, 203, 133], width: 18 },
	// Use the uninterrupted plank surface from the dock asset for connected modules.
	dock: { frame: [699, 792, 154, 78], width: 32, height: 16 },
	boat: BOAT_ART,
	waterfall: { frame: [17, 920, 369, 319], width: 105 },
	lilies: { frame: [421, 1022, 210, 141], width: 31 },
	scarecrow: { frame: [681, 949, 200, 282], width: 28 },
	cart: { frame: [939, 980, 290, 234], width: 43 }
};
// Chimney mouth measured in the cottage's source frame, relative to its foot anchor.
export const COTTAGE_CHIMNEY = {
	x: ((160 - 8) / 470 - 0.5) * 144,
	y: ((25 - 12 - 440) / 470) * 144
};
function loadImage(src: string) {
	return new Promise<HTMLImageElement>((resolve, reject) => {
		const image = document.createElement("img");
		image.onload = () => resolve(image);
		image.onerror = () => reject(new Error(`Cozy Farm asset failed to load: ${src}`));
		image.src = src;
	});
}
export class Art {
	private textures = new Map<string, Texture>();
	private atlas: HTMLImageElement | null = null;
	private garden: HTMLImageElement | null = null;
	private heroine: Partial<PlayerSheets> = {};
	private crops: HTMLImageElement | null = null;
	async load() {
		const [
			environment,
			crops,
			garden,
			idle,
			walkFront,
			walkBack,
			walkSide,
			runFront,
			runBack,
			runSide
		] = await Promise.all(
			[
				"environment-v1.png",
				"crops-v1.png",
				"garden-props-v1.png",
				CHARACTER_SHEETS.idle,
				...Object.values(CHARACTER_SHEETS.walk),
				...Object.values(CHARACTER_SHEETS.run)
			].map((name) => loadImage(`/images/cozy-farm/${name}`))
		);
		this.atlas = environment;
		this.crops = crops;
		this.garden = garden;
		this.heroine = {
			idle: prepareIdle(idle),
			walk: prepareWalk({ front: walkFront, back: walkBack, side: walkSide }),
			run: prepareRun({ front: runFront, back: runBack, side: runSide })
		};
	}
	private make(
		key: string,
		width: number,
		height: number,
		paint: (c: CanvasRenderingContext2D) => void
	) {
		const previous = this.textures.get(key);
		if (previous) return previous;
		const canvas = document.createElement("canvas");
		canvas.width = Math.ceil(width * ART_DENSITY);
		canvas.height = Math.ceil(height * ART_DENSITY);
		const c = canvas.getContext("2d");
		if (!c) throw new Error("Sprite canvas unavailable");
		c.imageSmoothingEnabled = false;
		paint(c);
		const texture = Texture.from(canvas);
		texture.source.scaleMode = "nearest";
		this.textures.set(key, texture);
		return texture;
	}
	scenery(name: string) {
		const garden = Object.hasOwn(GARDEN_PROPS, name),
			asset: Asset = garden
				? GARDEN_PROPS[name as keyof typeof GARDEN_PROPS]
				: environment[name],
			atlas = garden ? this.garden : this.atlas;
		if (!asset || !atlas) throw new Error(`Missing scenery: ${name}`);
		const [x, y, w, h] = asset.frame,
			height = asset.height ?? (asset.width * h) / w;
		return this.make(name, asset.width, height, (c) => {
			const isolated = document.createElement("canvas");
			isolated.width = w;
			isolated.height = h;
			const source = isolated.getContext("2d")!;
			source.drawImage(atlas, x, y, w, h, 0, 0, w, h);
			// Atlas rectangles can contain the tips of adjacent disconnected sprites.
			// Keep the main alpha island before sampling to native resolution.
			if (name !== "dock") {
				const image = source.getImageData(0, 0, w, h);
				keepLargestAlphaIsland(image.data, w, h);
				source.putImageData(image, 0, 0);
			}
			c.drawImage(
				isolated,
				0,
				0,
				w,
				h,
				0,
				0,
				asset.width * ART_DENSITY,
				height * ART_DENSITY
			);
		});
	}
	shoreRock(variant: number) {
		const mode = variant % 4;
		return this.make(`shore-rock:${mode}`, 32, 24, (c) => {
			const stone = this.scenery("rock").source.resource as HTMLCanvasElement;
			const w = [30, 19, 23, 17][mode] * ART_DENSITY,
				h = (w * stone.height) / stone.width;
			c.drawImage(stone, Math.floor((32 * ART_DENSITY - w) / 2), 24 * ART_DENSITY - h, w, h);
			// Low mossy banks alternate with prominent rock groups, keeping each
			// blocking cell visibly marked while breaking the repeated stone wall.
			if (mode !== 0) {
				c.fillStyle = mode === 2 ? "#64814b" : "#587846";
				for (let i = 0; i < 14; i++) {
					const x = 9 + ((i * 11) % 43),
						y = 43 + ((i * 7) % 4);
					c.fillRect(x, y, 1, 1 + (i % 4));
				}
			}
		});
	}

	object(kind: ObjectKind, variant = 0) {
		if (kind === "tree") return this.scenery(variant % 3 === 0 ? "pine" : "oak");
		if (kind === "sign") return this.detail("waymarker");
		return this.scenery(kind);
	}
	detail(name: Detail) {
		const { width, height, paint } = DETAILS[name];
		return this.make(`detail:${name}`, width, height, (c) => {
			c.scale(ART_DENSITY, ART_DENSITY);
			paint(c);
		});
	}
	crop(kind: "turnip" | "berry", stage: number) {
		if (!this.crops) throw new Error("Crops not loaded");
		const image = this.crops,
			w = image.width / 4,
			h = image.height / 2;
		// Keep all growth stages on identical canvases with their roots on the same baseline.
		return this.make(`crop:${kind}:${stage}`, 16, 20, (c) =>
			c.drawImage(
				image,
				stage * w,
				kind === "turnip" ? 0 : h,
				w,
				h,
				0,
				0,
				16 * ART_DENSITY,
				20 * ART_DENSITY
			)
		);
	}
	player({ state, facing, frame }: CharacterPose) {
		const image = this.heroine[state];
		if (!image) throw new Error(`Heroine ${state} atlas not loaded`);
		const row = CHARACTER_ROWS[facing];
		const scale = 30 / PLAYER_BODY_HEIGHT;
		return this.make(`aiko:${state}:${facing}:${frame}`, 40, 36, (c) => {
			c.drawImage(
				image,
				frame * PLAYER_CELL,
				row * PLAYER_CELL,
				PLAYER_CELL,
				PLAYER_CELL,
				(20 - PLAYER_FOOT.x * scale) * ART_DENSITY,
				(36 - PLAYER_FOOT.y * scale) * ART_DENSITY,
				PLAYER_CELL * scale * ART_DENSITY,
				PLAYER_CELL * scale * ART_DENSITY
			);
		});
	}

	destroy() {
		for (const texture of this.textures.values()) texture.destroy(true);
		this.textures.clear();
		this.atlas = null;
		this.garden = null;
		this.heroine = {};
		this.crops = null;
	}
}

export function keepLargestAlphaIsland(data: Uint8ClampedArray, width: number, height: number) {
	const labels = new Int32Array(width * height),
		stack = new Int32Array(width * height);
	let largest = 0,
		largestCount = 0,
		label = 0;
	for (let start = 0; start < labels.length; start++) {
		if (labels[start] || data[start * 4 + 3] < 8) continue;
		label++;
		let count = 0,
			head = 1;
		stack[0] = start;
		labels[start] = label;
		while (head) {
			const i = stack[--head],
				x = i % width,
				y = Math.floor(i / width);
			count++;
			const visit = (j: number) => {
				if (!labels[j] && data[j * 4 + 3] >= 8) {
					labels[j] = label;
					stack[head++] = j;
				}
			};
			if (x) visit(i - 1);
			if (x < width - 1) visit(i + 1);
			if (y) visit(i - width);
			if (y < height - 1) visit(i + width);
		}
		if (count > largestCount) {
			largestCount = count;
			largest = label;
		}
	}
	for (let i = 0; i < labels.length; i++) if (labels[i] !== largest) data[i * 4 + 3] = 0;
}
