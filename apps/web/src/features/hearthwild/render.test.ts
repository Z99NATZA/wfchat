import { describe, it, expect, vi } from "vitest";
import { renderWorld, viewFor } from "./render";
import { newGame } from "./state";
import { treeAppearance, PALETTE } from "./appearance";
import type { AnimationName } from "./animation";

describe("woodland presentation", () => {
	it("keeps every tree's draw position and dimensions fixed across animation time", () => {
		const drawImage = vi.fn(),
			noop = () => {},
			ctx = {
				drawImage,
				clearRect: noop,
				fillRect: noop,
				save: noop,
				restore: noop,
				scale: noop,
				translate: noop,
				beginPath: noop,
				ellipse: noop,
				fill: noop,
				strokeRect: noop,
				createRadialGradient: () => ({ addColorStop: noop })
			} as unknown as CanvasRenderingContext2D;
		const art = { width: 1254 } as HTMLCanvasElement,
			interior = { naturalWidth: 1024, naturalHeight: 1024 } as HTMLImageElement,
			ground = {} as HTMLCanvasElement;
		const sheet = { naturalWidth: 1024, naturalHeight: 1024 } as HTMLImageElement;
		const players = Object.fromEntries(
			["idle", "walk", "run", "sword", "bow"].map((key) => [key, sheet])
		) as Record<AnimationName, HTMLImageElement>;
		const s = newGame();
		s.objects.garden = [
			{ id: "a", kind: "tree", x: 7, y: 7 },
			{ id: "b", kind: "tree", x: 22, y: 7 }
		];
		const trees = () =>
			drawImage.mock.calls
				.filter((args) => args[0] === art && args[1] === 0 && args[2] === 0)
				.map((args) => args.slice(5));
		renderWorld(
			ctx,
			art,
			interior,
			players,
			ground,
			s,
			viewFor(s, 1000, 700),
			0,
			"hand",
			null,
			false
		);
		const first = trees();
		drawImage.mockClear();
		renderWorld(
			ctx,
			art,
			interior,
			players,
			ground,
			s,
			viewFor(s, 1000, 700),
			10000,
			"hand",
			null,
			false
		);
		expect(trees()).toEqual(first);
		expect(first).toHaveLength(2);
		expect(first[0][2]).not.toBe(first[1][2]);
		expect(first[0][3]).not.toBe(first[1][3]);
	});
	it("provides deterministic small and tall trees and a dark blue-green ground palette", () => {
		const shapes = Array.from({ length: 30 }, (_, x) => treeAppearance({ x, y: 5 }));
		expect(shapes).toEqual(Array.from({ length: 30 }, (_, x) => treeAppearance({ x, y: 5 })));
		expect(
			Math.max(...shapes.map((s) => s.height)) - Math.min(...shapes.map((s) => s.height))
		).toBeGreaterThan(40);
		for (const color of PALETTE.grass) {
			const r = parseInt(color.slice(1, 3), 16),
				g = parseInt(color.slice(3, 5), 16),
				b = parseInt(color.slice(5, 7), 16);
			expect(r).toBeLessThan(50);
			expect(g).toBeLessThan(90);
			expect(b).toBeGreaterThanOrEqual(g - 10);
		}
	});
});
