import { describe, expect, it, vi } from "vitest";
import { formatLocalDateKey, formatMessageDateLabel } from "@/utils/date";

describe("date utilities", () => {
	it("formats local date keys as YYYY-MM-DD", () => {
		expect(formatLocalDateKey(new Date(2026, 0, 20, 12))).toBe("2026-01-20");
	});

	it("uses relative labels for today and yesterday", () => {
		vi.useFakeTimers();
		vi.setSystemTime(new Date(2026, 0, 21, 12));

		expect(formatMessageDateLabel(new Date(2026, 0, 21, 8), "วันนี้", "เมื่อวาน")).toBe("วันนี้");
		expect(formatMessageDateLabel(new Date(2026, 0, 20, 23), "วันนี้", "เมื่อวาน")).toBe("เมื่อวาน");
		expect(formatMessageDateLabel(new Date(2026, 0, 19, 12), "วันนี้", "เมื่อวาน")).toBe("2026-01-19");

		vi.useRealTimers();
	});
});
