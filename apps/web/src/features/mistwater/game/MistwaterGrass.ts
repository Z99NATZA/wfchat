import type Phaser from "phaser";
import type { MistwaterFoliageLayer } from "@/features/mistwater/game/mistwaterMap";
import {
	deformGrassPoint,
	integrateGrassBend,
	type MistwaterWindSample
} from "@/features/mistwater/game/mistwaterForestPhysics";

const SOURCE_SIZE = 320;
const PADDING = 24;
const COLUMNS = 8;
const ROWS = 12;

type Vertex = { x: number; y: number; u: number; v: number };

export type MistwaterGrass = {
	image: Phaser.GameObjects.Image;
	update: (timeSeconds: number, deltaSeconds: number, wind: MistwaterWindSample) => void;
};

export function createMistwaterGrass(
	scene: Phaser.Scene,
	layer: MistwaterFoliageLayer
): MistwaterGrass {
	const source = scene.textures.get("mistwater-grass").getSourceImage() as HTMLImageElement;
	const key = `mistwater-grass-bend-${layer.id}`;
	if (scene.textures.exists(key)) {
		scene.textures.remove(key);
	}
	const width = SOURCE_SIZE;
	const height = Math.round((source.height / source.width) * width);
	const texture = scene.textures.createCanvas(key, width + PADDING * 2, height + PADDING * 2);
	if (!texture) {
		return {
			image: scene.add
				.image(layer.x, layer.y, "mistwater-grass")
				.setOrigin(layer.originX, layer.originY)
				.setScale(layer.scale),
			update() {}
		};
	}
	const sourceCanvas = document.createElement("canvas");
	sourceCanvas.width = width;
	sourceCanvas.height = height;
	const sourceContext = sourceCanvas.getContext("2d")!;
	sourceContext.drawImage(source, 0, 0, width, height);
	const image = scene.add
		.image(layer.x, layer.y, key)
		.setOrigin(
			(PADDING + layer.originX * width) / texture.width,
			(PADDING + layer.originY * height) / texture.height
		)
		.setScale((layer.scale * source.width) / width);
	let bend = { angle: 0, angularVelocity: 0 };
	const vertices: Vertex[] = Array.from({ length: (COLUMNS + 1) * (ROWS + 1) }, () => ({
		x: 0,
		y: 0,
		u: 0,
		v: 0
	}));
	const render = (timeSeconds: number) => {
		const context = texture.context;
		context.clearRect(0, 0, texture.width, texture.height);
		for (let row = 0; row <= ROWS; row += 1) {
			for (let column = 0; column <= COLUMNS; column += 1) {
				const u = column / COLUMNS;
				const v = (row / ROWS) * layer.originY;
				const point = deformGrassPoint(
					u,
					v,
					layer.originX,
					layer.originY,
					bend.angle,
					timeSeconds,
					layer.phase
				);
				const vertex = vertices[row * (COLUMNS + 1) + column];
				vertex.x = PADDING + point.x * width;
				vertex.y = PADDING + point.y * height;
				vertex.u = u * width;
				vertex.v = v * height;
			}
		}
		for (let row = 0; row < ROWS; row += 1) {
			for (let column = 0; column < COLUMNS; column += 1) {
				const index = row * (COLUMNS + 1) + column;
				const a = vertices[index];
				const b = vertices[index + 1];
				const c = vertices[index + COLUMNS + 1];
				const d = vertices[index + COLUMNS + 2];
				drawTriangle(context, sourceCanvas, a, b, c);
				drawTriangle(context, sourceCanvas, d, c, b);
			}
		}
		const rootY = layer.originY * height;
		context.drawImage(
			sourceCanvas,
			0,
			rootY,
			width,
			height - rootY,
			PADDING,
			PADDING + rootY,
			width,
			height - rootY
		);
		texture.refresh();
	};
	render(0);
	scene.events.once("shutdown", () => scene.textures.remove(key));
	return {
		image,
		update(timeSeconds, deltaSeconds, wind) {
			const sway = layer.sway * layer.depthFactor;
			const breeze = Math.sin(timeSeconds * 0.7 + layer.phase) * 0.08;
			bend = integrateGrassBend(bend, (wind.x + breeze) * sway, deltaSeconds);
			render(timeSeconds);
		}
	};
}

function drawTriangle(
	context: CanvasRenderingContext2D,
	source: HTMLCanvasElement,
	a: Vertex,
	b: Vertex,
	c: Vertex
) {
	// Both triangles have axis-aligned source edges, including the reversed one.
	const scaleX = (b.x - a.x) / (b.u - a.u);
	const skewY = (b.y - a.y) / (b.u - a.u);
	const skewX = (c.x - a.x) / (c.v - a.v);
	const scaleY = (c.y - a.y) / (c.v - a.v);
	context.save();
	context.beginPath();
	// A small overlap hides antialiasing cracks between adjoining triangles.
	const centerX = (a.x + b.x + c.x) / 3;
	const centerY = (a.y + b.y + c.y) / 3;
	for (const [index, vertex] of [a, b, c].entries()) {
		const dx = vertex.x - centerX;
		const dy = vertex.y - centerY;
		const overlap = 0.35 / Math.hypot(dx, dy);
		const x = vertex.x + dx * overlap;
		const y = vertex.y + dy * overlap;
		if (index === 0) context.moveTo(x, y);
		else context.lineTo(x, y);
	}
	context.closePath();
	context.clip();
	context.transform(
		scaleX,
		skewY,
		skewX,
		scaleY,
		a.x - scaleX * a.u - skewX * a.v,
		a.y - skewY * a.u - scaleY * a.v
	);
	context.drawImage(source, 0, 0);
	context.restore();
}
