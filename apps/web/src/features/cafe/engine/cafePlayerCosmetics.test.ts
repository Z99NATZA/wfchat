import { describe, expect, it } from "vitest";
import { cafeSakuraPinLayout } from "./cafePlayerCosmetics";

describe("cafeSakuraPinLayout", () => {
	it.each(["boy", "girl"] as const)("keeps the %s pin above the face", (avatarId) => {
		for (const direction of ["up", "down", "left", "right"] as const) {
			const layout = cafeSakuraPinLayout(avatarId, direction);
			expect(layout.y).toBeLessThanOrEqual(-82);
			expect(layout.petalRadius).toBe(4);
		}
	});

	it.each(["boy", "girl"] as const)(
		"moves the %s side-facing pin toward the hair instead of the eye",
		(avatarId) => {
			expect(cafeSakuraPinLayout(avatarId, "left").x).toBeGreaterThan(0);
			expect(cafeSakuraPinLayout(avatarId, "right").x).toBeLessThan(0);
		}
	);

	it("allows avatar-specific hair anchors", () => {
		expect(cafeSakuraPinLayout("boy", "down")).not.toEqual(cafeSakuraPinLayout("girl", "down"));
	});
});
