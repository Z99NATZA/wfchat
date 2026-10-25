import { ANIMATIONS, type AnimationName } from "./animation";

export const PLAYER_CELL = 96;
export const PLAYER_BODY_HEIGHT = 86;
export const PLAYER_FOOT = { x: 48, y: 92 } as const;
export const WALK_SOURCES = {
	front: "/images/hearthwild/aiko-walk-front-v2.png",
	back: "/images/hearthwild/aiko-walk-back-v2.png",
	side: "/images/hearthwild/aiko-walk-side-v2.png"
} as const;
export type PlayerSheet = HTMLImageElement | HTMLCanvasElement;
export type PlayerSheets = Record<AnimationName, PlayerSheet>;
export type SourceCell = { x: number; y: number; width: number; height: number };
export type SpriteBounds = SourceCell & { anchorX: number; anchorY: number };

// Read opaque anatomy, ignoring near-transparent antialiasing around the sprite.
export function measureFrame(
	pixels: Uint8ClampedArray,
	imageWidth: number,
	cell: SourceCell
): SpriteBounds {
	let left = cell.x + cell.width,
		right = -1,
		top = cell.y + cell.height,
		bottom = -1;
	for (let y = cell.y; y < cell.y + cell.height; y++)
		for (let x = cell.x; x < cell.x + cell.width; x++) {
			if (pixels[(y * imageWidth + x) * 4 + 3] < 48) continue;
			left = Math.min(left, x);
			right = Math.max(right, x);
			top = Math.min(top, y);
			bottom = Math.max(bottom, y);
		}
	if (right < left || bottom < top) throw new Error("Aiko animation contains an empty frame");
	// A head anchor stays fixed even when an arm, leg or coat extends to one side.
	const headEnd = top + Math.max(1, Math.floor((bottom - top + 1) * 0.22));
	let weightedX = 0,
		weight = 0;
	for (let y = top; y < headEnd; y++)
		for (let x = left; x <= right; x++) {
			const alpha = pixels[(y * imageWidth + x) * 4 + 3];
			if (alpha < 48) continue;
			weightedX += (x + 0.5) * alpha;
			weight += alpha;
		}
	return {
		x: left,
		y: top,
		width: right - left + 1,
		height: bottom - top + 1,
		anchorX: weight ? weightedX / weight : (left + right + 1) / 2,
		anchorY: bottom + 1
	};
}
export function framePlacement(bounds: SpriteBounds) {
	const scale = Math.min(
		PLAYER_BODY_HEIGHT / bounds.height,
		44 / Math.max(bounds.anchorX - bounds.x, bounds.x + bounds.width - bounds.anchorX)
	);
	return {
		x: PLAYER_FOOT.x + (bounds.x - bounds.anchorX) * scale,
		y: PLAYER_FOOT.y - bounds.height * scale,
		width: bounds.width * scale,
		height: bounds.height * scale,
		scale
	};
}
function readSheet(
	image: HTMLImageElement,
	columns: number,
	rows: number,
	boundaries?: readonly number[]
) {
	const canvas = document.createElement("canvas");
	canvas.width = image.naturalWidth;
	canvas.height = image.naturalHeight;
	const ctx = canvas.getContext("2d", { willReadFrequently: true })!;
	ctx.drawImage(image, 0, 0);
	const pixels = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
	return Array.from({ length: columns * rows }, (_, i) => {
		const col = i % columns,
			row = Math.floor(i / columns),
			x = Math.floor((col * canvas.width) / columns),
			y = Math.floor(
				boundaries ? (boundaries[row] * canvas.height) / 1254 : (row * canvas.height) / rows
			);
		return measureFrame(pixels, canvas.width, {
			x,
			y,
			width: Math.floor(((col + 1) * canvas.width) / columns) - x,
			height:
				Math.floor(
					boundaries
						? (boundaries[row + 1] * canvas.height) / 1254
						: ((row + 1) * canvas.height) / rows
				) - y
		});
	});
}
function makeAtlas(frames: number) {
	const canvas = document.createElement("canvas");
	canvas.width = frames * PLAYER_CELL;
	canvas.height = 4 * PLAYER_CELL;
	const ctx = canvas.getContext("2d")!;
	ctx.imageSmoothingEnabled = false;
	return { canvas, ctx };
}
function paintFrame(
	ctx: CanvasRenderingContext2D,
	image: HTMLImageElement,
	bounds: SpriteBounds,
	col: number,
	row: number,
	mirror = false
) {
	const p = framePlacement(bounds);
	ctx.save();
	ctx.translate(col * PLAYER_CELL + (mirror ? PLAYER_CELL : 0), row * PLAYER_CELL);
	if (mirror) ctx.scale(-1, 1);
	ctx.drawImage(
		image,
		bounds.x,
		bounds.y,
		bounds.width,
		bounds.height,
		Math.round(p.x),
		Math.round(p.y),
		p.width,
		p.height
	);
	ctx.restore();
}
export function prepareIdle(image: HTMLImageElement) {
	const { canvas, ctx } = makeAtlas(4),
		bounds = readSheet(image, 4, 4, [0, 334, 645, 938, 1254]);
	for (let row = 0; row < 4; row++)
		for (let col = 0; col < 4; col++) paintFrame(ctx, image, bounds[row * 4 + col], col, row);
	// Planted legs and coat hem use one stable layer; breathing affects the upper body.
	const plantedY = 58;
	for (let row = 0; row < 4; row++)
		for (let col = 1; col < 4; col++) {
			ctx.clearRect(
				col * PLAYER_CELL,
				row * PLAYER_CELL + plantedY,
				PLAYER_CELL,
				PLAYER_CELL - plantedY
			);
			ctx.drawImage(
				canvas,
				0,
				row * PLAYER_CELL + plantedY,
				PLAYER_CELL,
				PLAYER_CELL - plantedY,
				col * PLAYER_CELL,
				row * PLAYER_CELL + plantedY,
				PLAYER_CELL,
				PLAYER_CELL - plantedY
			);
		}
	return canvas;
}
export function prepareWalk(images: Record<keyof typeof WALK_SOURCES, HTMLImageElement>) {
	const { canvas, ctx } = makeAtlas(ANIMATIONS.walk.frames);
	const bounds = {
		front: readSheet(images.front, 4, 2, [0, 650, 1254]),
		back: readSheet(images.back, 4, 2),
		side: readSheet(images.side, 4, 2)
	};
	const sources = ["front", "back", "side", "side"] as const;
	for (let row = 0; row < 4; row++)
		for (let col = 0; col < 8; col++) {
			const key = sources[row];
			paintFrame(ctx, images[key], bounds[key][col], col, row, row === 2);
		}
	return canvas;
}
