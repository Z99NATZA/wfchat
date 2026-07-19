import { beforeEach, describe, expect, it, vi } from "vitest";
import { apiClient } from "@/services/apiClient";
import {
	cafeSocketUrl,
	cafeLobbyErrorCode,
	createCafeRoom,
	equipCafeCosmetic,
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
			.mockResolvedValueOnce({
				data: {
					cafe_stars: 4,
					unlocked_cosmetics: ["sakura_pin", "mint_scarf"],
					equipped_cosmetic: "mint_scarf",
					cosmetics: [
						{ id: "sakura_pin", required_stars: 0, unlocked: true },
						{ id: "tea_hat", required_stars: 5, unlocked: false }
					]
				}
			});

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
			unlockedCosmetics: ["sakura_pin", "mint_scarf"],
			equippedCosmetic: "mint_scarf",
			cosmetics: [
				{ id: "sakura_pin", requiredStars: 0, unlocked: true },
				{ id: "tea_hat", requiredStars: 5, unlocked: false }
			]
		});
	});

	it("sends only the selected cosmetic id when equipping", async () => {
		vi.mocked(apiClient.post).mockResolvedValue({
			data: {
				cafe_stars: 0,
				unlocked_cosmetics: ["sakura_pin"],
				equipped_cosmetic: "sakura_pin",
				cosmetics: [{ id: "sakura_pin", required_stars: 0, unlocked: true }]
			}
		});

		await expect(equipCafeCosmetic("sakura_pin")).resolves.toMatchObject({
			equippedCosmetic: "sakura_pin"
		});
		expect(apiClient.post).toHaveBeenCalledWith("/api/cafe/cosmetics/equipped", {
			cosmetic_id: "sakura_pin"
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

	it("maps lobby HTTP failures to player-facing room reasons", () => {
		expect(cafeLobbyErrorCode({ isAxiosError: true, response: { status: 404 } })).toBe(
			"room_not_found"
		);
		expect(cafeLobbyErrorCode({ isAxiosError: true, response: { status: 409 } })).toBe(
			"room_full"
		);
		expect(cafeLobbyErrorCode(new Error("offline"))).toBe("unavailable");
	});
});
