import { describe, expect, it } from "vitest";
import { cafePlayerFrame, cafePlayerFrameOffsetX } from "./cafePlayerAnimation";

describe("cafePlayerFrame", () => {
	it.each([
		["up", 0],
		["left", 4],
		["right", 8],
		["down", 12]
	] as const)("uses the idle frame for %s", (direction, frame) => {
		expect(cafePlayerFrame(direction, false, 10_000)).toBe(frame);
	});

	it("cycles through the four walk frames without leaving the direction row", () => {
		expect([0, 125, 250, 375, 500].map((time) => cafePlayerFrame("right", true, time))).toEqual(
			[8, 9, 10, 11, 8]
		);
	});

	it("clamps negative animation time to the first frame", () => {
		expect(cafePlayerFrame("down", true, -1)).toBe(12);
	});

	it.each([
		["up", [-7.5, -2.5, 3, 14.5]],
		["down", [-7.5, -2, 4, 14.5]]
	] as const)("normalizes the lateral drift in the %s walk row", (direction, offsets) => {
		const frames = [0, 125, 250, 375].map((time) => cafePlayerFrame(direction, true, time));
		expect(frames.map(cafePlayerFrameOffsetX)).toEqual(offsets);
	});

	it("does not offset an unknown frame", () => {
		expect(cafePlayerFrameOffsetX(99)).toBe(0);
	});
});
