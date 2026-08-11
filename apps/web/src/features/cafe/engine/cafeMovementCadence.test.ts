import { describe, expect, it } from "vitest";
import {
	CAFE_MOVEMENT_INTERVAL_MS,
	CafeMovementCadence
} from "@/features/cafe/engine/cafeMovementCadence";

describe("CafeMovementCadence", () => {
	it("sends no movement while idle for one second", () => {
		const cadence = new CafeMovementCadence();
		const sends = Array.from({ length: 101 }, (_, index) =>
			cadence.shouldSend(index * 10, "down", false)
		).filter(Boolean);

		expect(sends).toHaveLength(0);
	});

	it("limits continuous movement to ten updates in a one-second window", () => {
		const cadence = new CafeMovementCadence();
		const sendTimes = Array.from({ length: 100 }, (_, index) => index * 10).filter((time) =>
			cadence.shouldSend(time, "right", true)
		);

		expect(sendTimes).toEqual([0, 100, 200, 300, 400, 500, 600, 700, 800, 900]);
	});

	it("sends transitions immediately and starts a new cadence window", () => {
		const cadence = new CafeMovementCadence();

		expect(cadence.shouldSend(0, "right", true)).toBe(true);
		expect(cadence.shouldSend(50, "down", true)).toBe(true);
		expect(cadence.shouldSend(149, "down", true)).toBe(false);
		expect(cadence.shouldSend(50 + CAFE_MOVEMENT_INTERVAL_MS, "down", true)).toBe(true);
		expect(cadence.shouldSend(175, "down", false)).toBe(true);
		expect(cadence.shouldSend(1000, "down", false)).toBe(false);
	});

	it("starts movement immediately after input is disabled and restored", () => {
		const cadence = new CafeMovementCadence();

		expect(cadence.shouldSend(0, "up", true)).toBe(true);
		expect(cadence.markInputDisabled()).toBe(true);
		expect(cadence.markInputDisabled()).toBe(false);
		expect(cadence.shouldSend(10, "up", false)).toBe(false);
		expect(cadence.shouldSend(20, "up", true)).toBe(true);
	});

	it("does not request a stop when idle input is disabled", () => {
		const cadence = new CafeMovementCadence();

		expect(cadence.markInputDisabled()).toBe(false);
		expect(cadence.shouldSend(0, "down", false)).toBe(false);
		expect(cadence.markInputDisabled()).toBe(false);
	});
});
