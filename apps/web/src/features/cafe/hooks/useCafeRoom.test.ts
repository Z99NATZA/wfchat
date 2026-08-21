/**
 * @vitest-environment happy-dom
 */
import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useCafeRoom } from "@/features/cafe/hooks/useCafeRoom";
import { CAFE_PLAYER_NAME_STORAGE_KEY } from "@/features/cafe/services/cafePlayerName";

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
	closeCode: number | undefined;
	closeReason: string | undefined;

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

	close(code?: number, reason?: string) {
		this.closeCode = code;
		this.closeReason = reason;
		this.readyState = 3;
		this.onclose?.();
	}
}

const room = {
	id: "11111111-1111-4111-8111-111111111111",
	invite_code: "ABC123",
	is_private: false,
	capacity: 8,
	map_layout: {
		version: "cafe-room-v1",
		width: 1280,
		height: 800,
		player_collision_radius: 10,
		interaction_radius: 92,
		host_interaction_radius: 132,
		player_spawn: { x: 640, y: 704 },
		colliders: [
			{
				id: "table-window",
				x: 190,
				y: 322,
				width: 120,
				height: 122
			}
		],
		interaction_targets: [{ id: "aiko", x: 640, y: 272 }]
	},
	players: [
		{
			id: "22222222-2222-4222-8222-222222222222",
			name: "Guest TEST",
			color: "#f48fb1",
			x: 640,
			y: 704,
			direction: "up",
			moving: false,
			carried_tea: 0,
			carried_order_id: null,
			equipped_cosmetic: "sakura_pin",
			avatar_id: "girl"
		}
	],
	activity: {
		id: "tea_delivery",
		round_number: 1,
		phase: "active",
		next_round_at: null,
		ends_at: null,
		delivered: 0,
		target: 3,
		combo: 0,
		best_combo: 0,
		combo_expires_at: null,
		completed: false,
		tea_leaves: [{ id: "tea-1", x: 142, y: 224, available: true }],
		table_orders: []
	},
	aiko: { x: 640, y: 272, motion: "idle" }
};

describe("useCafeRoom", () => {
	beforeEach(() => {
		FakeWebSocket.instances = [];
		window.sessionStorage.clear();
		vi.stubGlobal("WebSocket", FakeWebSocket);
		vi.useFakeTimers();
	});

	afterEach(() => {
		cleanup();
		vi.useRealTimers();
		vi.unstubAllGlobals();
	});

	it("accepts welcome state, sends protocol messages, and reconnects", () => {
		window.sessionStorage.setItem(CAFE_PLAYER_NAME_STORAGE_KEY, "Mint Friend");
		const { result, unmount } = renderHook(() => useCafeRoom(room.id));
		const first = FakeWebSocket.instances[0];
		expect(first).toBeDefined();
		expect(new URL(first.url).searchParams.get("nickname")).toBe("Mint Friend");

		act(() => {
			first.open();
			first.message({
				type: "welcome",
				self_player_id: room.players[0].id,
				cafe_stars: 3,
				revision: 1,
				room,
				chat_history: [
					{
						id: "44444444-4444-4444-8444-444444444444",
						kind: "joined",
						player_id: room.players[0].id,
						player_name: room.players[0].name,
						text: null,
						created_at: 1_700_000_000_000
					}
				]
			});
		});

		expect(result.current.connectionState).toBe("connected");
		expect(result.current.connectionEpoch).toBe(1);
		expect(result.current.cafeStars).toBe(3);
		expect(result.current.room?.activity.teaLeaves[0].id).toBe("tea-1");
		expect(result.current.room?.players[0].equippedCosmetic).toBe("sakura_pin");
		expect(result.current.room?.players[0].avatarId).toBe("girl");
		expect(result.current.room?.mapLayout).toMatchObject({
			version: "cafe-room-v1",
			playerCollisionRadius: 10,
			hostInteractionRadius: 132
		});
		expect(result.current.room?.mapLayout.colliders[0]).toEqual({
			id: "table-window",
			x: 190,
			y: 322,
			width: 120,
			height: 122
		});
		expect(result.current.chatEvents[0]).toMatchObject({
			kind: "joined",
			playerName: "Guest TEST"
		});

		act(() => {
			result.current.sendMovement(650, 700, "right", true, 1);
			result.current.interact("tea-1");
			result.current.sendEmote("wave");
			result.current.sendChat("Hello cafe");
		});
		expect(first.sent.map((value) => JSON.parse(value))).toEqual([
			{ type: "move", x: 650, y: 700, direction: "right", moving: true, sequence: 1 },
			{ type: "interact", target_id: "tea-1" },
			{ type: "emote", emote: "wave" },
			{ type: "chat", text: "Hello cafe" }
		]);
		act(() => vi.advanceTimersByTime(10_000));
		expect(JSON.parse(first.sent.at(-1) ?? "{}")).toEqual({ type: "ping" });

		act(() => first.close());
		expect(result.current.connectionState).toBe("reconnecting");
		act(() => vi.advanceTimersByTime(500));
		expect(FakeWebSocket.instances).toHaveLength(2);
		expect(new URL(FakeWebSocket.instances[1].url).searchParams.get("nickname")).toBe(
			"Mint Friend"
		);
		unmount();
	});

	it("applies public dialogue, emotes, room chat, and earned stars", () => {
		const { result } = renderHook(() => useCafeRoom(room.id));
		const socket = FakeWebSocket.instances[0];
		act(() => {
			socket.open();
			socket.message({
				type: "welcome",
				self_player_id: room.players[0].id,
				cafe_stars: 1,
				revision: 1,
				room
			});
			socket.message({
				type: "dialogue",
				message_key: "cafe.dialogue.roundComplete",
				expression: "happy"
			});
			socket.message({ type: "emote", player_id: room.players[0].id, emote: "tea" });
			socket.message({
				type: "chat_event",
				event: {
					id: "55555555-5555-4555-8555-555555555555",
					kind: "message",
					player_id: room.players[0].id,
					player_name: "Guest TEST",
					text: "Tea is ready!",
					created_at: 1_700_000_000_100
				}
			});
			socket.message({ type: "chat_error", code: "rate_limited" });
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

		expect(result.current.dialogue).toEqual({
			messageKey: "cafe.dialogue.roundComplete",
			expression: "happy"
		});
		expect(result.current.emote?.emote).toBe("tea");
		expect(result.current.latestChatMessage?.text).toBe("Tea is ready!");
		expect(result.current.chatEvents.at(-1)?.playerName).toBe("Guest TEST");
		expect(result.current.chatError).toBe("rate_limited");
		expect(result.current.cafeStars).toBe(2);
	});

	it("maps claimed table service orders from authoritative snapshots", () => {
		const tableRoom = {
			...room,
			players: [
				{
					...room.players[0],
					carried_order_id: "order-2-1"
				}
			],
			activity: {
				id: "table_service" as const,
				round_number: 2,
				phase: "active" as const,
				next_round_at: null,
				ends_at: null,
				delivered: 0,
				target: 3,
				combo: 0,
				best_combo: 0,
				combo_expires_at: null,
				completed: false,
				tea_leaves: [],
				table_orders: [
					{
						id: "order-2-1",
						table_id: "garden" as const,
						drink: "mint" as const,
						x: 906,
						y: 411,
						status: "claimed" as const,
						claimed_by: room.players[0].id
					}
				]
			}
		};
		const { result } = renderHook(() => useCafeRoom(room.id));
		const socket = FakeWebSocket.instances[0];

		act(() => {
			socket.open();
			socket.message({
				type: "welcome",
				self_player_id: room.players[0].id,
				cafe_stars: 7,
				revision: 1,
				room: tableRoom
			});
		});

		expect(result.current.room?.activity.id).toBe("table_service");
		expect(result.current.room?.activity.tableOrders[0]).toMatchObject({
			id: "order-2-1",
			tableId: "garden",
			drink: "mint",
			status: "claimed"
		});
		expect(result.current.room?.players[0].carriedOrderId).toBe("order-2-1");
	});

	it("orders welcome, dynamic snapshots, and replaceable movement by room revision", () => {
		const secondPlayer = {
			...room.players[0],
			id: "33333333-3333-4333-8333-333333333333",
			name: "Guest REMOTE",
			x: 600
		};
		const revisionRoom = { ...room, players: [...room.players, secondPlayer] };
		const { map_layout: _mapLayout, ...dynamicRoom } = revisionRoom;
		const rushRoom = {
			...dynamicRoom,
			players: [{ ...dynamicRoom.players[0], x: 680 }],
			activity: {
				...dynamicRoom.activity,
				id: "cafe_rush" as const,
				round_number: 3,
				delivered: 1,
				target: 4
			}
		};
		const { result } = renderHook(() => useCafeRoom(room.id));
		const socket = FakeWebSocket.instances[0];

		act(() => {
			socket.open();
			socket.message({
				type: "welcome",
				self_player_id: room.players[0].id,
				cafe_stars: 0,
				revision: 10,
				room: revisionRoom
			});
			socket.message({
				type: "movement",
				revision: 12,
				players: [
					{
						id: room.players[0].id,
						x: 700,
						y: 704,
						direction: "right",
						moving: true
					},
					{
						id: secondPlayer.id,
						x: 610,
						y: 704,
						direction: "left",
						moving: true
					}
				]
			});
			socket.message({
				type: "movement",
				revision: 12,
				players: [
					{ ...room.players[0], x: 710 },
					{ ...secondPlayer, x: 620 }
				]
			});
			socket.message({ type: "snapshot", revision: 11, room: rushRoom });
		});

		expect(result.current.room?.players[0].x).toBe(700);
		expect(result.current.room?.players[1].x).toBe(610);
		expect(result.current.room?.activity.id).toBe("tea_delivery");

		act(() => {
			socket.message({ type: "snapshot", revision: 13, room: rushRoom });
			socket.message({
				type: "movement",
				revision: 12,
				players: [
					{
						id: room.players[0].id,
						x: 720,
						y: 704,
						direction: "right",
						moving: true
					},
					{
						id: secondPlayer.id,
						x: 625,
						y: 704,
						direction: "left",
						moving: true
					}
				]
			});
		});

		expect(result.current.room?.activity.id).toBe("cafe_rush");
		expect(result.current.room?.activity.target).toBe(4);
		expect(result.current.room?.players[0].x).toBe(680);
		expect(result.current.room?.mapLayout.version).toBe("cafe-room-v1");
	});

	it("reconnects when state arrives before an authoritative welcome", () => {
		const { result } = renderHook(() => useCafeRoom(room.id));
		const socket = FakeWebSocket.instances[0];
		act(() => {
			socket.open();
			socket.message({
				type: "movement",
				revision: 1,
				players: []
			});
		});

		expect(socket.closeCode).toBe(1012);
		expect(result.current.connectionState).toBe("reconnecting");
		expect(result.current.room).toBeNull();
	});

	it("reconnects for an incomplete movement roster and resets revision from fresh welcome", () => {
		const { result } = renderHook(() => useCafeRoom(room.id));
		const first = FakeWebSocket.instances[0];
		act(() => {
			first.open();
			first.message({
				type: "welcome",
				self_player_id: room.players[0].id,
				cafe_stars: 0,
				revision: 50,
				room
			});
			first.message({ type: "movement", revision: 51, players: [] });
		});

		expect(first.closeCode).toBe(1012);
		expect(result.current.connectionState).toBe("reconnecting");
		act(() => vi.advanceTimersByTime(500));
		const second = FakeWebSocket.instances[1];
		act(() => {
			second.open();
			second.message({
				type: "welcome",
				self_player_id: room.players[0].id,
				cafe_stars: 0,
				revision: 2,
				room: { ...room, players: [{ ...room.players[0], x: 730 }] }
			});
		});

		expect(result.current.connectionState).toBe("connected");
		expect(result.current.room?.players[0].x).toBe(730);
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
				revision: 1,
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
				revision: 3,
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
