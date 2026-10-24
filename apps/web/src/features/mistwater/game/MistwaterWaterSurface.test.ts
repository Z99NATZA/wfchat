import type Phaser from "phaser";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createMistwaterWaterSurface } from "@/features/mistwater/game/MistwaterWaterSurface";
import { MISTWATER_WATER_BOUNDS } from "@/features/mistwater/game/mistwaterMap";

vi.mock("phaser", () => ({
	default: {
		WEBGL: 2,
		BlendModes: { ADD: 1 },
		Math: {
			Clamp: (value: number, min: number, max: number) => Math.max(min, Math.min(max, value))
		}
	}
}));

function createContext() {
	return new Proxy(
		{
			createImageData: (width: number, height: number) => ({
				data: new Uint8ClampedArray(width * height * 4)
			}),
			createRadialGradient: () => ({ addColorStop: vi.fn() }),
			drawImage: vi.fn()
		},
		{ get: (target, key) => Reflect.get(target, key) ?? (() => {}) }
	);
}

function createImage(x: number, y: number, key: string) {
	return {
		x,
		y,
		key,
		setOrigin: vi.fn().mockReturnThis(),
		setDepth: vi.fn().mockReturnThis(),
		setAlpha: vi.fn().mockReturnThis(),
		setTint: vi.fn().mockReturnThis(),
		setMask: vi.fn().mockReturnThis(),
		setDisplaySize: vi.fn().mockReturnThis(),
		setBlendMode: vi.fn().mockReturnThis(),
		setTileScale: vi.fn().mockReturnThis(),
		preFX: { addDisplacement: vi.fn(() => ({ x: 0, y: 0 })) }
	};
}

describe("Mistwater water and shoreline composition", () => {
	afterEach(() => vi.unstubAllGlobals());

	it("aligns the crop and tint with the static pond and keeps the bank cover stationary", () => {
		vi.stubGlobal("document", {
			createElement: () => ({ width: 0, height: 0, getContext: createContext })
		});
		const source = {};
		const terrain = { has: () => false, add: vi.fn(), getSourceImage: () => source };
		const canvases = new Map<
			string,
			{ context: ReturnType<typeof createContext>; refresh: ReturnType<typeof vi.fn> }
		>();
		const images: ReturnType<typeof createImage>[] = [];
		const addImage = (x: number, y: number, key: string) => {
			const image = createImage(x, y, key);
			images.push(image);
			return image;
		};
		const graphics = {
			fillStyle: vi.fn(),
			beginPath: vi.fn(),
			moveTo: vi.fn(),
			lineTo: vi.fn(),
			closePath: vi.fn(),
			fillPath: vi.fn(),
			createGeometryMask: () => ({})
		};
		const scene = {
			game: { renderer: { type: 2 } },
			textures: {
				get: () => terrain,
				exists: () => false,
				remove: vi.fn(),
				createCanvas: (key: string) => {
					const texture = { context: createContext(), refresh: vi.fn() };
					canvases.set(key, texture);
					return texture;
				}
			},
			add: { image: addImage, tileSprite: addImage },
			make: { graphics: () => graphics },
			events: { once: vi.fn() }
		};
		const tint = 0x79b9cf;
		const surface = createMistwaterWaterSurface(scene as unknown as Phaser.Scene, "pond", tint);
		const bounds = MISTWATER_WATER_BOUNDS;
		expect(terrain.add).toHaveBeenCalledWith(
			"mistwater-water-surface",
			0,
			bounds.x,
			bounds.y,
			bounds.width,
			bounds.height
		);
		const water = images.find((image) => image.key === "pond")!;
		const bank = images.find((image) => image.key === "mistwater-shore-blend")!;
		expect([water.x, water.y]).toEqual([bounds.x, bounds.y]);
		expect([bank.x, bank.y]).toEqual([bounds.x, bounds.y]);
		expect(water.setTint).toHaveBeenCalledWith(tint);
		expect(bank.setTint).toHaveBeenCalledWith(tint);
		expect(bank.setDepth).toHaveBeenCalledWith(1.3);
		const cover = canvases.get("mistwater-shore-blend")!;
		expect(cover.context.drawImage).toHaveBeenCalledWith(
			source,
			bounds.x,
			bounds.y,
			bounds.width,
			bounds.height,
			0,
			0,
			bounds.width,
			bounds.height
		);
		surface!.update(1_000, 60);
		expect(cover.refresh).toHaveBeenCalledTimes(1);
		expect(
			canvases.get("mistwater-wave-displacement")!.refresh.mock.calls.length
		).toBeGreaterThan(1);
	});
});
