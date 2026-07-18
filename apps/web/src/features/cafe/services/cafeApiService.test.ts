import { beforeEach, describe, expect, it, vi } from "vitest";
import { apiClient } from "@/services/apiClient";
import {
	cafeSocketUrl,
	createCafeRoom,
	getCafeProgress,
	joinCafeByCode,
	listCafeRooms,
	quickJoinCafe
} from "@/features/cafe/services/cafeApiService";

vi.mock("@/services/apiClient", () => ({
	apiBaseUrl: "http://localhost:8080",
	apiClient: {
		get: vi.fn(),
		post: vi.fn()
	}
}));

const room = {
	id: "11111111-1111-4111-8111-111111111111",
	invite_code: "ABC123",
	is_private: false,
	player_count: 2,
	capacity: 8,
	activity_completed: false
};

describe("cafeApiService", () => {
	beforeEach(() => vi.clearAllMocks());

	it("maps lobby rooms and durable progress", async () => {
		vi.mocked(apiClient.get)
			.mockResolvedValueOnce({ data: { rooms: [room] } })
			.mockResolvedValueOnce({ data: { cafe_stars: 4, unlocked_cosmetics: ["blue_apron"] } });

		await expect(listCafeRooms()).resolves.toEqual([
			{
				id: room.id,
				inviteCode: "ABC123",
				isPrivate: false,
				playerCount: 2,
				capacity: 8,
				activityCompleted: false
			}
		]);
		await expect(getCafeProgress()).resolves.toEqual({
			cafeStars: 4,
			unlockedCosmetics: ["blue_apron"]
		});
	});

	it("uses the explicit room operations and websocket route", async () => {
		vi.mocked(apiClient.post).mockResolvedValue({ data: { room } });

		await quickJoinCafe();
		await createCafeRoom(true);
		await joinCafeByCode("abc123");

		expect(apiClient.post).toHaveBeenNthCalledWith(1, "/api/cafe/rooms/quick-join");
		expect(apiClient.post).toHaveBeenNthCalledWith(2, "/api/cafe/rooms", {
			is_private: true
		});
		expect(apiClient.post).toHaveBeenNthCalledWith(3, "/api/cafe/rooms/join", {
			invite_code: "abc123"
		});
		expect(cafeSocketUrl(room.id)).toBe(`ws://localhost:8080/api/cafe/rooms/${room.id}/ws`);
	});
});
