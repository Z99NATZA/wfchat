import { isAxiosError } from "axios";
import { apiBaseUrl, apiClient } from "@/services/apiClient";
import type { CafeProgress, CafeRoomSummary } from "@/features/cafe/types";

export type CafeLobbyErrorCode = "room_not_found" | "room_full" | "unavailable";

type ApiRoomSummary = {
	id: string;
	invite_code: string;
	is_private: boolean;
	player_count: number;
	capacity: number;
	activity_completed: boolean;
};

type ApiRoomResponse = {
	room: ApiRoomSummary;
};

type ApiRoomsResponse = {
	rooms: ApiRoomSummary[];
};

type ApiProgressResponse = {
	cafe_stars: number;
	unlocked_cosmetics: string[];
};

export async function listCafeRooms(): Promise<CafeRoomSummary[]> {
	const response = await apiClient.get<ApiRoomsResponse>("/api/cafe/rooms");
	return response.data.rooms.map(toRoomSummary);
}

export async function quickJoinCafe(): Promise<CafeRoomSummary> {
	const response = await apiClient.post<ApiRoomResponse>("/api/cafe/rooms/quick-join");
	return toRoomSummary(response.data.room);
}

export async function createCafeRoom(isPrivate = true): Promise<CafeRoomSummary> {
	const response = await apiClient.post<ApiRoomResponse>("/api/cafe/rooms", {
		is_private: isPrivate
	});
	return toRoomSummary(response.data.room);
}

export async function joinCafeByCode(inviteCode: string): Promise<CafeRoomSummary> {
	const response = await apiClient.post<ApiRoomResponse>("/api/cafe/rooms/join", {
		invite_code: inviteCode
	});
	return toRoomSummary(response.data.room);
}

export async function getCafeProgress(): Promise<CafeProgress> {
	const response = await apiClient.get<ApiProgressResponse>("/api/cafe/progress");
	return {
		cafeStars: response.data.cafe_stars,
		unlockedCosmetics: response.data.unlocked_cosmetics
	};
}

export function cafeSocketUrl(roomId: string): string {
	const fallbackOrigin =
		typeof window === "undefined" ? "http://localhost:8080" : window.location.origin;
	const baseUrl = apiBaseUrl || fallbackOrigin;
	const url = new URL(`/api/cafe/rooms/${roomId}/ws`, baseUrl);
	url.protocol = url.protocol === "https:" ? "wss:" : "ws:";
	return url.toString();
}

export function cafeLobbyErrorCode(error: unknown): CafeLobbyErrorCode {
	if (!isAxiosError(error)) {
		return "unavailable";
	}
	if (error.response?.status === 404) {
		return "room_not_found";
	}
	if (error.response?.status === 409) {
		return "room_full";
	}
	return "unavailable";
}

function toRoomSummary(room: ApiRoomSummary): CafeRoomSummary {
	return {
		id: room.id,
		inviteCode: room.invite_code,
		isPrivate: room.is_private,
		playerCount: room.player_count,
		capacity: room.capacity,
		activityCompleted: room.activity_completed
	};
}
