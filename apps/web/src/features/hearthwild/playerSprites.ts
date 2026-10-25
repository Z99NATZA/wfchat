import { ANIMATIONS, type AnimationName } from "./animation";

export const PLAYER_CELL = 96;
export const PLAYER_BODY_HEIGHT = 86;
export const PLAYER_HEAD_WIDTH = 34;
export const PLAYER_FOOT = { x: 48, y: 92 } as const;
export const WALK_SOURCES = {
	front: "/images/hearthwild/aiko-walk-front-v2.png",
	back: "/images/hearthwild/aiko-walk-back-v2.png",
	side: "/images/hearthwild/aiko-walk-side-v2.png"
} as const;
export const RUN_SOURCES = {
	front: "/images/hearthwild/aiko-run-front-v2.png",
	back: "/images/hearthwild/aiko-run-back-v2.png",
	side: "/images/hearthwild/aiko-run-side-v2.png"
} as const;
export type PlayerSheet = HTMLImageElement | HTMLCanvasElement;
export type PlayerSheets = Record<AnimationName, PlayerSheet>;
export type SourceCell = { x: number; y: number; width: number; height: number };
export type SpriteBounds = SourceCell & { anchorX: number; anchorY: number; headWidth: number };

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
	const headEnd = top + Math.max(1, Math.floor((bottom - top + 1) * 0.22)),
		headWidthEnd = top + Math.max(1, Math.floor((bottom - top + 1) * 0.18));
	let weightedX = 0,
		weight = 0,
		headWidth = 0;
	for (let y = top; y < headEnd; y++) {
		let rowLeft = right + 1,
			rowRight = left - 1;
		for (let x = left; x <= right; x++) {
			const alpha = pixels[(y * imageWidth + x) * 4 + 3];
			if (alpha < 48) continue;
			weightedX += (x + 0.5) * alpha;
			weight += alpha;
			rowLeft = Math.min(rowLeft, x);
			rowRight = Math.max(rowRight, x);
		}
		if (y < headWidthEnd && rowRight >= rowLeft)
			headWidth = Math.max(headWidth, rowRight - rowLeft + 1);
	}
	return {
		x: left,
		y: top,
		width: right - left + 1,
		height: bottom - top + 1,
		anchorX: weight ? weightedX / weight : (left + right + 1) / 2,
		anchorY: bottom + 1,
		headWidth
	};
}
function median(values: readonly number[]) {
	const sorted = [...values].sort((a, b) => a - b),
		middle = Math.floor(sorted.length / 2);
	return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}
export function sharedFrameScale(frames: readonly SpriteBounds[]) {
	const medianHeight = median(frames.map((bounds) => bounds.height)),
		widestSide = Math.max(
			...frames.map((bounds) =>
				Math.max(bounds.anchorX - bounds.x, bounds.x + bounds.width - bounds.anchorX)
			)
		);
	return Math.min(PLAYER_BODY_HEIGHT / medianHeight, 44 / widestSide);
}
export function sharedFrameHorizontalScale(frames: readonly SpriteBounds[], verticalScale: number) {
	const projectedHead = median(frames.map((bounds) => bounds.headWidth)) * verticalScale,
		widestSide = Math.max(
			...frames.map((bounds) =>
				Math.max(bounds.anchorX - bounds.x, bounds.x + bounds.width - bounds.anchorX)
			)
		),
		fit = 44 / (widestSide * verticalScale);
	return Math.min(fit, Math.max(0.88, Math.min(1.3, PLAYER_HEAD_WIDTH / projectedHead)));
}
export function framePlacement(
	bounds: SpriteBounds,
	scale = sharedFrameScale([bounds]),
	horizontalScale = 1
) {
	const scaleX = scale * horizontalScale;
	return {
		x: PLAYER_FOOT.x + (bounds.x - bounds.anchorX) * scaleX,
		y: PLAYER_FOOT.y - bounds.height * scale,
		width: bounds.width * scaleX,
		height: bounds.height * scale,
		scale,
		scaleX
	};
}
// Generated sheets can carry tiny opaque fragments from adjacent cells.
// Keep substantial detached accessories, but discard isolated specks before registration.
export function removeSpecks(pixels: Uint8ClampedArray, imageWidth: number, cell: SourceCell) {
	const visited = new Uint8Array(cell.width * cell.height),
		components: number[][] = [];
	for (let ly = 0; ly < cell.height; ly++)
		for (let lx = 0; lx < cell.width; lx++) {
			const start = ly * cell.width + lx,
				global = (cell.y + ly) * imageWidth + cell.x + lx;
			if (visited[start] || pixels[global * 4 + 3] < 48) continue;
			visited[start] = 1;
			const component = [start];
			for (let i = 0; i < component.length; i++) {
				const pos = component[i],
					x = pos % cell.width,
					y = Math.floor(pos / cell.width);
				for (let dy = -1; dy <= 1; dy++)
					for (let dx = -1; dx <= 1; dx++) {
						const nx = x + dx,
							ny = y + dy;
						if (nx < 0 || ny < 0 || nx >= cell.width || ny >= cell.height) continue;
						const n = ny * cell.width + nx;
						if (visited[n]) continue;
						const p = (cell.y + ny) * imageWidth + cell.x + nx;
						if (pixels[p * 4 + 3] < 48) continue;
						visited[n] = 1;
						component.push(n);
					}
			}
			components.push(component);
		}
	const primary = components.reduce<number[]>(
		(best, c) => (c.length > best.length ? c : best),
		[]
	);
	let top = cell.height,
		bottom = 0;
	for (const pos of primary) {
		const y = Math.floor(pos / cell.width);
		top = Math.min(top, y);
		bottom = Math.max(bottom, y);
	}
	const groundBand = top + (bottom - top) * 0.75;
	for (const component of components) {
		const nearGround = component.every((pos) => Math.floor(pos / cell.width) > groundBand);
		const minimum = Math.max(4, primary.length * (nearGround ? 0.03 : 0.005));
		if (component.length < minimum)
			for (const pos of component) {
				const x = pos % cell.width,
					y = Math.floor(pos / cell.width),
					p = ((cell.y + y) * imageWidth + cell.x + x) * 4;
				pixels[p] = pixels[p + 1] = pixels[p + 2] = pixels[p + 3] = 0;
			}
	}
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
	const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height),
		pixels = imageData.data;
	const bounds = Array.from({ length: columns * rows }, (_, i) => {
		const col = i % columns,
			row = Math.floor(i / columns),
			x = Math.floor((col * canvas.width) / columns),
			y = Math.floor(
				boundaries ? (boundaries[row] * canvas.height) / 1254 : (row * canvas.height) / rows
			);
		const cell = {
			x,
			y,
			width: Math.floor(((col + 1) * canvas.width) / columns) - x,
			height:
				Math.floor(
					boundaries
						? (boundaries[row + 1] * canvas.height) / 1254
						: ((row + 1) * canvas.height) / rows
				) - y
		};
		removeSpecks(pixels, canvas.width, cell);
		return measureFrame(pixels, canvas.width, cell);
	});
	ctx.putImageData(imageData, 0, 0);
	return { image: canvas, bounds };
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
	image: PlayerSheet,
	bounds: SpriteBounds,
	col: number,
	row: number,
	mirror = false,
	scale?: number,
	horizontalScale?: number
) {
	const p = framePlacement(bounds, scale, horizontalScale);
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
		source = readSheet(image, 4, 4, [0, 334, 645, 938, 1254]),
		bounds = source.bounds,
		scales = Array.from({ length: 4 }, (_, row) =>
			sharedFrameScale(bounds.slice(row * 4, row * 4 + 4))
		),
		horizontalScales = Array.from({ length: 4 }, (_, row) =>
			sharedFrameHorizontalScale(bounds.slice(row * 4, row * 4 + 4), scales[row])
		);
	for (let row = 0; row < 4; row++)
		for (let col = 0; col < 4; col++)
			paintFrame(
				ctx,
				source.image,
				bounds[row * 4 + col],
				col,
				row,
				false,
				scales[row],
				horizontalScales[row]
			);
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
type StrideImages = Record<keyof typeof WALK_SOURCES, HTMLImageElement>;
function prepareStride(
	images: StrideImages,
	frames: number,
	boundaries: Partial<Record<keyof StrideImages, readonly number[]>> = {}
) {
	const { canvas, ctx } = makeAtlas(frames);
	const bounds = {
			front: readSheet(images.front, 4, 2, boundaries.front),
			back: readSheet(images.back, 4, 2, boundaries.back),
			side: readSheet(images.side, 4, 2, boundaries.side)
		},
		scales = {
			front: sharedFrameScale(bounds.front.bounds),
			back: sharedFrameScale(bounds.back.bounds),
			side: sharedFrameScale(bounds.side.bounds)
		},
		horizontalScales = {
			front: sharedFrameHorizontalScale(bounds.front.bounds, scales.front),
			back: sharedFrameHorizontalScale(bounds.back.bounds, scales.back),
			side: sharedFrameHorizontalScale(bounds.side.bounds, scales.side)
		};
	const sources = ["front", "back", "side", "side"] as const;
	for (let row = 0; row < 4; row++)
		for (let col = 0; col < frames; col++) {
			const key = sources[row];
			paintFrame(
				ctx,
				bounds[key].image,
				bounds[key].bounds[col],
				col,
				row,
				row === 2,
				scales[key],
				horizontalScales[key]
			);
		}
	return canvas;
}
export function prepareWalk(images: StrideImages) {
	return prepareStride(images, ANIMATIONS.walk.frames, { front: [0, 650, 1254] });
}
export function prepareRun(images: StrideImages) {
	return prepareStride(images, ANIMATIONS.run.frames);
}
