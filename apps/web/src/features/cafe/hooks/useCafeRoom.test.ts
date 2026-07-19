/**
 * @vitest-environment happy-dom
 */
import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useCafeRoom } from "@/features/cafe/hooks/useCafeRoom";

class FakeWebSocket {
	static readonly OPEN = 1;
	static instances: FakeWebSocket[] = [];
	readonly url: string;
	readyState = 0;
	onopen: (() => void) | null = null;
	onmessage: ((event: MessageEvent<string>) => void) | null = null;
	onerror: (() => void) | null = null;
	onclose: (() => void) | null = null;
	sent: string[] = [];

	constructor(url: string) {
		this.url = url;
		FakeWebSocket.instances.push(this);
	}

	open() {
		this.readyState = FakeWebSocket.OPEN;
		this.onopen?.();
	}

	message(value: object) {
		this.onmessage?.({ data: JSON.stringify(value) } as MessageEvent<string>);
	}

	send(value: string) {
		this.sent.push(value);
	}

	close() {
		this.readyState = 3;
		this.onclose?.();
	}
}

const room = {
	id: "11111111-1111-4111-8111-111111111111",
	invite_code: "ABC123",
	is_private: false,
	capacity: 8,
	map_width: 1280,
	map_height: 800,
	players: [
		{
			id: "22222222-2222-4222-8222-222222222222",
			name: "Guest TEST",
			color: "#f48fb1",
			x: 640,
			y: 704,
			direction: "up",
			moving: false,
			carried_tea: 0
		}
	],
	activity: {
		id: "tea_delivery",
		round_number: 1,
		phase: "active",
		next_round_at: null,
		delivered: 0,
		target: 3,
		completed: false,
		tea_leaves: [{ id: "tea-1", x: 142, y: 224, available: true }]
	},
	aiko: { x: 640, y: 272, motion: "idle" }
};

describe("useCafeRoom", () => {
	beforeEach(() => {
		FakeWebSocket.instances = [];
		vi.stubGlobal("WebSocket", FakeWebSocket);
		vi.useFakeTimers();
	});

	afterEach(() => {
		cleanup();
		vi.useRealTimers();
		vi.unstubAllGlobals();
	});

	it("accepts welcome state, sends protocol messages, and reconnects", () => {
		const { result, unmount } = renderHook(() => useCafeRoom(room.id));
		const first = FakeWebSocket.instances[0];
		expect(first).toBeDefined();

		act(() => {
			first.open();
			first.message({
				type: "welcome",
				self_player_id: room.players[0].id,
				cafe_stars: 3,
				room
			});
		});

		expect(result.current.connectionState).toBe("connected");
		expect(result.current.connectionEpoch).toBe(1);
		expect(result.current.cafeStars).toBe(3);
		expect(result.current.room?.activity.teaLeaves[0].id).toBe("tea-1");

		act(() => {
			result.current.sendMovement(650, 700, "right", true, 1);
			result.current.interact("tea-1");
			result.current.sendEmote("wave");
		});
		expect(first.sent.map((value) => JSON.parse(value))).toEqual([
			{ type: "move", x: 650, y: 700, direction: "right", moving: true, sequence: 1 },
			{ type: "interact", target_id: "tea-1" },
			{ type: "emote", emote: "wave" }
		]);
		act(() => vi.advanceTimersByTime(10_000));
		expect(JSON.parse(first.sent.at(-1) ?? "{}")).toEqual({ type: "ping" });

		act(() => first.close());
		expect(result.current.connectionState).toBe("reconnecting");
		act(() => vi.advanceTimersByTime(500));
		expect(FakeWebSocket.instances).toHaveLength(2);
		unmount();
	});

	it("applies public dialogue, emotes, and earned stars", () => {
		const { result } = renderHook(() => useCafeRoom(room.id));
		const socket = FakeWebSocket.instances[0];
		act(() => {
			socket.open();
			socket.message({
				type: "welcome",
				self_player_id: room.players[0].id,
				cafe_stars: 1,
				room
			});
			socket.message({ type: "dialogue", message: "Tea is ready", expression: "happy" });
			socket.message({ type: "emote", player_id: room.players[0].id, emote: "tea" });
			socket.message({
				type: "reward",
				player_id: room.players[0].id,
				earned_stars: 1
			});
			socket.message({
				type: "reward",
				player_id: "33333333-3333-4333-8333-333333333333",
				earned_stars: 1
			});
		});

		expect(result.current.dialogue).toEqual({ message: "Tea is ready", expression: "happy" });
		expect(result.current.emote?.emote).toBe("tea");
		expect(result.current.cafeStars).toBe(2);
	});

	it("goes offline immediately, blocks messages, and waits for welcome before resuming", () => {
		const { result } = renderHook(() => useCafeRoom(room.id));
		const first = FakeWebSocket.instances[0];
		act(() => {
			first.open();
			first.message({
				type: "welcome",
				self_player_id: room.players[0].id,
				cafe_stars: 2,
				room
			});
		});

		act(() => window.dispatchEvent(new Event("offline")));
		expect(result.current.connectionState).toBe("offline");
		act(() => result.current.interact("tea-1"));
		expect(first.sent).toEqual([]);

		act(() => window.dispatchEvent(new Event("online")));
		expect(result.current.connectionState).toBe("reconnecting");
		expect(FakeWebSocket.instances).toHaveLength(2);
		const second = FakeWebSocket.instances[1];
		act(() => {
			second.open();
			second.message({
				type: "welcome",
				self_player_id: room.players[0].id,
				cafe_stars: 2,
				room: {
					...room,
					players: [{ ...room.players[0], x: 720 }]
				}
			});
		});

		expect(result.current.connectionState).toBe("connected");
		expect(result.current.connectionEpoch).toBe(2);
		expect(result.current.room?.players[0].x).toBe(720);
	});

	it("stops reconnecting for a terminal room error and lets the player retry", () => {
		const { result } = renderHook(() => useCafeRoom(room.id));
		const socket = FakeWebSocket.instances[0];

		act(() => {
			socket.open();
			socket.message({
				type: "error",
				code: "room_not_found",
				message: "Cafe room no longer exists"
			});
		});

		expect(result.current.connectionState).toBe("closed");
		expect(result.current.error).toBe("room_not_found");
		act(() => vi.advanceTimersByTime(10_000));
		expect(FakeWebSocket.instances).toHaveLength(1);

		act(() => result.current.retryConnection());
		expect(result.current.connectionState).toBe("connecting");
		expect(result.current.error).toBeNull();
		expect(FakeWebSocket.instances).toHaveLength(2);
	});

	it("offers manual recovery after bounded reconnect attempts", () => {
		const { result } = renderHook(() => useCafeRoom(room.id));

		for (const delay of [500, 1000, 2000, 4000, 5000]) {
			act(() => FakeWebSocket.instances.at(-1)?.close());
			act(() => vi.advanceTimersByTime(delay));
		}
		act(() => FakeWebSocket.instances.at(-1)?.close());

		expect(FakeWebSocket.instances).toHaveLength(6);
		expect(result.current.connectionState).toBe("closed");
		expect(result.current.error).toBe("connection_failed");
	});
});
