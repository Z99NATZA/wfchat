import { describe, it, expect } from "vitest";
import {
	measureFrame,
	removeSpecks,
	framePlacement,
	PLAYER_FOOT,
	PLAYER_BODY_HEIGHT
} from "./playerSprites";

function fixture(offsetX: number, offsetY: number, armWidth = 0) {
	const w = 120,
		h = 140,
		p = new Uint8ClampedArray(w * h * 4);
	const fill = (x: number, y: number, width: number, height: number, alpha = 255) => {
		for (let yy = y; yy < y + height; yy++)
			for (let xx = x; xx < x + width; xx++) p[(yy * w + xx) * 4 + 3] = alpha;
	};
	fill(40 + offsetX, 10 + offsetY, 20, 20);
	fill(38 + offsetX, 30 + offsetY, 24, 55);
	fill(38 + offsetX, 85 + offsetY, 10, 25);
	fill(52 + offsetX, 85 + offsetY, 10, 25);
	if (armWidth) fill(62 + offsetX, 40 + offsetY, armWidth, 8);
	fill(2, 2, 2, 2, 10);
	return { pixels: p, w, cell: { x: 0, y: 0, width: w, height: h } };
}
describe("Aiko sprite registration", () => {
	it("anchors at the head and soles instead of the changing silhouette center", () => {
		const a = fixture(0, 0),
			b = fixture(9, 12, 20);
		const ba = measureFrame(a.pixels, a.w, a.cell),
			bb = measureFrame(b.pixels, b.w, b.cell);
		expect(ba.anchorX).toBeCloseTo(50);
		expect(bb.anchorX).toBeCloseTo(59);
		expect(bb.anchorY - ba.anchorY).toBe(12);
		const pa = framePlacement(ba),
			pb = framePlacement(bb);
		expect(pa.y + pa.height).toBe(PLAYER_FOOT.y);
		expect(pb.y + pb.height).toBe(PLAYER_FOOT.y);
		expect(pa.height).toBeCloseTo(PLAYER_BODY_HEIGHT);
		expect(pb.height).toBeCloseTo(pa.height);
		expect(pa.x + (ba.anchorX - ba.x) * pa.scale).toBeCloseTo(PLAYER_FOOT.x);
		expect(pb.x + (bb.anchorX - bb.x) * pb.scale).toBeCloseTo(PLAYER_FOOT.x);
	});
	it("removes isolated opaque fragments while retaining connected legs and substantial accessories", () => {
		const f = fixture(0, 0);
		f.pixels[(125 * f.w + 110) * 4 + 3] = 255;
		for (let y = 98; y < 104; y++)
			for (let x = 94; x < 100; x++) f.pixels[(y * f.w + x) * 4 + 3] = 255;
		for (let y = 65; y < 70; y++)
			for (let x = 85; x < 90; x++) f.pixels[(y * f.w + x) * 4 + 3] = 255;
		removeSpecks(f.pixels, f.w, f.cell);
		expect(f.pixels[(125 * f.w + 110) * 4 + 3]).toBe(0);
		expect(f.pixels[(100 * f.w + 96) * 4 + 3]).toBe(0);
		expect(f.pixels[(67 * f.w + 87) * 4 + 3]).toBe(255);
		expect(f.pixels[(100 * f.w + 40) * 4 + 3]).toBe(255);
	});
	it("ignores faint edge pixels and rejects empty cells instead of drawing missing limbs", () => {
		const f = fixture(0, 0),
			b = measureFrame(f.pixels, f.w, f.cell);
		expect(b.x).toBe(38);
		expect(b.y).toBe(10);
		expect(() =>
			measureFrame(new Uint8ClampedArray(16 * 16 * 4), 16, {
				x: 0,
				y: 0,
				width: 16,
				height: 16
			})
		).toThrow("empty frame");
	});
});
