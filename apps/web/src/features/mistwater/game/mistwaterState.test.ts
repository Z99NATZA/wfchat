import { describe, expect, it } from "vitest";
import {
	MISTWATER_STREAK_WINDOW_MS,
	initialMistwaterSnapshot,
	recordMistwaterBloom
} from "@/features/mistwater/game/mistwaterState";

describe("mistwater state", () => {
	it("starts a run without persistent progress", () => {
		expect(initialMistwaterSnapshot()).toEqual({
			blooms: 0,
			streak: 0,
			bestStreak: 0
		});
	});

	it("keeps nearby blooms in one flow streak", () => {
		const first = recordMistwaterBloom(initialMistwaterSnapshot(), null);
		const second = recordMistwaterBloom(first, MISTWATER_STREAK_WINDOW_MS);

		expect(second).toEqual({ blooms: 2, streak: 2, bestStreak: 2 });
	});

	it("starts a new streak after the flow window while preserving the best", () => {
		const current = { blooms: 5, streak: 4, bestStreak: 4 };
		const next = recordMistwaterBloom(current, MISTWATER_STREAK_WINDOW_MS + 1);

		expect(next).toEqual({ blooms: 6, streak: 1, bestStreak: 4 });
	});
});
