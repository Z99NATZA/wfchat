import { describe, expect, it } from "vitest";
import { cafePositionCollides, resolveCafeMovement } from "@/features/cafe/engine/cafeCollision";
import type { CafeMapLayout } from "@/features/cafe/types";

const layout: CafeMapLayout = {
	version: "cafe-room-v1",
	width: 1280,
	height: 800,
	playerCollisionRadius: 10,
	interactionRadius: 92,
	hostInteractionRadius: 132,
	playerSpawn: { x: 640, y: 704 },
	colliders: [
		{
			id: "table-window",
			x: 190,
			y: 322,
			width: 120,
			height: 122
		}
	],
	interactionTargets: [{ id: "aiko", x: 640, y: 272 }]
};

describe("Cafe collision prediction", () => {
	it("uses the server-provided foot radius at the furniture boundary", () => {
		expect(cafePositionCollides(layout, 180, 380)).toBe(false);
		expect(cafePositionCollides(layout, 181, 380)).toBe(true);
		expect(cafePositionCollides(layout, 320, 380)).toBe(false);
		expect(cafePositionCollides(layout, 319, 380)).toBe(true);
	});

	it("blocks entry while preserving movement along the free axis", () => {
		expect(resolveCafeMovement(layout, { x: 170, y: 380 }, { x: 195, y: 460 })).toEqual({
			x: 170,
			y: 460
		});
	});

	it("clamps against authoritative world bounds without viewport inputs", () => {
		expect(resolveCafeMovement(layout, { x: 640, y: 704 }, { x: -100, y: 1000 })).toEqual({
			x: 10,
			y: 790
		});
	});
});
