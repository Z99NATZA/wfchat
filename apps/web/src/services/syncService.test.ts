import { describe, expect, it, vi } from "vitest";
import {
	compactItems,
	compactQueue,
	computeNextRetryAt,
	trimQueue,
	type SyncItem,
	type SyncQueueOperation
} from "@/services/syncService";

describe("syncService queue helpers", () => {
	it("keeps newest item per item_id", () => {
		const items: SyncItem[] = [
			{ item_id: "settings.theme", item_type: "setting", updated_at: 10, payload: { value: "light" } },
			{ item_id: "settings.theme", item_type: "setting", updated_at: 20, payload: { value: "dark" } },
			{ item_id: "settings.font", item_type: "setting", updated_at: 12, payload: { value: "inter" } }
		];

		const result = compactItems(items);
		expect(result).toHaveLength(2);
		expect(result.find((item) => item.item_id === "settings.theme")?.payload.value).toBe("dark");
	});

	it("compacts every operation in queue", () => {
		const queue: SyncQueueOperation[] = [
			{
				operation_id: "a",
				attempt: 0,
				next_retry_at: 0,
				items: [
					{ item_id: "x", item_type: "setting", updated_at: 1, payload: { value: "1" } },
					{ item_id: "x", item_type: "setting", updated_at: 3, payload: { value: "3" } }
				]
			}
		];

		const result = compactQueue(queue);
		expect(result[0].items).toHaveLength(1);
		expect(result[0].items[0].updated_at).toBe(3);
	});

	it("caps queue length to 20", () => {
		const queue: SyncQueueOperation[] = Array.from({ length: 30 }, (_, index) => ({
			operation_id: `op-${index}`,
			attempt: 0,
			next_retry_at: 0,
			items: []
		}));

		const result = trimQueue(queue);
		expect(result).toHaveLength(20);
		expect(result[0].operation_id).toBe("op-10");
	});

	it("computes retry timestamp with bounded jitter", () => {
		vi.spyOn(Math, "random").mockReturnValue(0.9);
		const result = computeNextRetryAt(3, 100);
		expect(result).toBeGreaterThanOrEqual(108);
		expect(result).toBeLessThanOrEqual(110);
		vi.restoreAllMocks();
	});
});
