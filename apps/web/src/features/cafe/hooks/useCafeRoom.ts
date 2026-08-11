import { useCallback, useEffect, useRef, useState } from "react";
import { cafeSocketUrl } from "@/features/cafe/services/cafeApiService";
import { readCafePlayerName } from "@/features/cafe/services/cafePlayerName";
import type {
	CafeChatErrorCode,
	CafeChatEvent,
	CafeConnectionState,
	CafeDialogue,
	CafeDirection,
	CafeEmote,
	CafeMapLayout,
	CafeRoomErrorCode,
	CafeRoomState
} from "@/features/cafe/types";

const MAX_RECONNECT_ATTEMPTS = 5;
const CHAT_HISTORY_LIMIT = 30;

type ApiChatEvent = {
	id: string;
	kind: CafeChatEvent["kind"];
	player_id: string;
	player_name: string;
	text: string | null;
	created_at: number;
};

type ApiPlayer = {
	id: string;
	name: string;
	color: string;
	x: number;
	y: number;
	direction: CafeDirection;
	moving: boolean;
	carried_tea: number;
	carried_order_id: string | null;
	equipped_cosmetic: string | null;
};

type ApiRoom = {
	id: string;
	invite_code: string;
	is_private: boolean;
	capacity: number;
	map_layout: {
		version: string;
		width: number;
		height: number;
		player_collision_radius: number;
		interaction_radius: number;
		host_interaction_radius: number;
		player_spawn: { x: number; y: number };
		colliders: Array<{
			id: string;
			x: number;
			y: number;
			width: number;
			height: number;
		}>;
		interaction_targets: Array<{ id: string; x: number; y: number }>;
	};
	players: ApiPlayer[];
	activity: {
		id: "tea_delivery" | "table_service" | "cafe_rush";
		round_number: number;
		phase: "active" | "intermission";
		next_round_at: number | null;
		ends_at: number | null;
		delivered: number;
		target: number;
		combo: number;
		best_combo: number;
		combo_expires_at: number | null;
		completed: boolean;
		tea_leaves: Array<{ id: string; x: number; y: number; available: boolean }>;
		table_orders: Array<{
			id: string;
			table_id: "window" | "garden" | "long";
			drink: "sakura" | "mint" | "classic";
			x: number;
			y: number;
			status: "waiting_ingredient" | "available" | "claimed" | "served";
			claimed_by: string | null;
		}>;
	};
	aiko: CafeRoomState["aiko"];
};

type ApiDynamicRoom = Omit<ApiRoom, "map_layout">;

type ApiMovementPlayer = Pick<ApiPlayer, "id" | "x" | "y" | "direction" | "moving">;

type ServerMessage =
	| {
			type: "welcome";
			self_player_id: string;
			cafe_stars: number;
			revision: number;
			room: ApiRoom;
			chat_history?: ApiChatEvent[];
	  }
	| { type: "snapshot"; revision: number; room: ApiDynamicRoom }
	| { type: "movement"; revision: number; players: ApiMovementPlayer[] }
	| { type: "dialogue"; message_key: string; expression: CafeDialogue["expression"] }
	| { type: "emote"; player_id: string; emote: string }
	| { type: "chat_event"; event: ApiChatEvent }
	| { type: "chat_error"; code: CafeChatErrorCode }
	| { type: "reward"; player_id: string; earned_stars: number }
	| { type: "pong" }
	| { type: "error"; code?: string; message: string };

export function useCafeRoom(roomId: string) {
	const [room, setRoom] = useState<CafeRoomState | null>(null);
	const [selfPlayerId, setSelfPlayerId] = useState<string | null>(null);
	const [cafeStars, setCafeStars] = useState(0);
	const [connectionState, setConnectionState] = useState<CafeConnectionState>("connecting");
	const [connectionEpoch, setConnectionEpoch] = useState(0);
	const [dialogue, setDialogue] = useState<CafeDialogue | null>(null);
	const [emote, setEmote] = useState<CafeEmote | null>(null);
	const [chatEvents, setChatEvents] = useState<CafeChatEvent[]>([]);
	const [latestChatMessage, setLatestChatMessage] = useState<CafeChatEvent | null>(null);
	const [chatError, setChatError] = useState<CafeChatErrorCode | null>(null);
	const [error, setError] = useState<CafeRoomErrorCode | null>(null);
	const [retryKey, setRetryKey] = useState(0);
	const socketRef = useRef<WebSocket | null>(null);
	const reconnectTimerRef = useRef<number | null>(null);
	const reconnectAttemptRef = useRef(0);
	const shouldReconnectRef = useRef(true);
	const onlineRef = useRef(browserIsOnline());
	const readyRef = useRef(false);
	const roomRef = useRef<CafeRoomState | null>(null);
	const lastRevisionRef = useRef(0);
	const selfPlayerIdRef = useRef<string | null>(null);
	const lastPongAtRef = useRef(Date.now());
	const dialogueTimerRef = useRef<number | null>(null);
	const emoteKeyRef = useRef(0);

	useEffect(() => {
		shouldReconnectRef.current = true;
		reconnectAttemptRef.current = 0;
		onlineRef.current = browserIsOnline();
		readyRef.current = false;
		roomRef.current = null;
		lastRevisionRef.current = 0;
		setConnectionState(onlineRef.current ? "connecting" : "offline");
		setError(null);
		setChatEvents([]);
		setLatestChatMessage(null);
		setChatError(null);
		let disposed = false;

		function clearReconnectTimer() {
			if (reconnectTimerRef.current !== null) {
				window.clearTimeout(reconnectTimerRef.current);
				reconnectTimerRef.current = null;
			}
		}

		function connect(isReconnect = false) {
			if (disposed || !shouldReconnectRef.current || !onlineRef.current) {
				return;
			}
			clearReconnectTimer();
			readyRef.current = false;
			lastRevisionRef.current = 0;
			setConnectionState(
				isReconnect || reconnectAttemptRef.current > 0 ? "reconnecting" : "connecting"
			);
			let socket: WebSocket;
			try {
				socket = new WebSocket(cafeSocketUrl(roomId, readCafePlayerName()));
			} catch {
				shouldReconnectRef.current = false;
				setConnectionState("closed");
				setError("connection_failed");
				return;
			}
			socketRef.current = socket;

			socket.onopen = () => {
				if (socketRef.current !== socket) return;
				lastPongAtRef.current = Date.now();
			};
			socket.onmessage = (event) => {
				if (socketRef.current !== socket) return;
				if (typeof event.data !== "string") {
					return;
				}
				try {
					handleServerMessage(JSON.parse(event.data) as ServerMessage, socket);
				} catch {
					setError("unreadable_update");
				}
			};
			socket.onerror = () => {
				if (socketRef.current !== socket || !onlineRef.current) return;
				setError("connection_interrupted");
			};
			socket.onclose = () => {
				if (socketRef.current !== socket) return;
				socketRef.current = null;
				readyRef.current = false;
				if (disposed) return;
				if (!onlineRef.current) {
					setConnectionState("offline");
					return;
				}
				if (shouldReconnectRef.current) {
					const nextAttempt = reconnectAttemptRef.current + 1;
					if (nextAttempt > MAX_RECONNECT_ATTEMPTS) {
						shouldReconnectRef.current = false;
						setConnectionState("closed");
						setError("connection_failed");
						return;
					}
					reconnectAttemptRef.current = nextAttempt;
					setConnectionState("reconnecting");
					const delay = Math.min(5000, 500 * 2 ** Math.min(4, nextAttempt - 1));
					reconnectTimerRef.current = window.setTimeout(() => connect(true), delay);
				} else {
					setConnectionState("closed");
				}
			};
		}

		function handleOffline() {
			onlineRef.current = false;
			readyRef.current = false;
			clearReconnectTimer();
			setError(null);
			setConnectionState("offline");
			socketRef.current?.close(4002, "browser offline");
		}

		function handleOnline() {
			if (disposed || onlineRef.current) return;
			onlineRef.current = true;
			shouldReconnectRef.current = true;
			reconnectAttemptRef.current = 0;
			setError(null);
			setConnectionState("reconnecting");
			connect(true);
		}

		function requestResynchronization(socket: WebSocket) {
			if (socketRef.current !== socket) return;
			readyRef.current = false;
			setError("connection_interrupted");
			socket.close(1012, "cafe state resynchronization required");
		}

		function handleServerMessage(message: ServerMessage, socket: WebSocket) {
			switch (message.type) {
				case "welcome":
					reconnectAttemptRef.current = 0;
					readyRef.current = true;
					selfPlayerIdRef.current = message.self_player_id;
					setSelfPlayerId(message.self_player_id);
					setCafeStars(message.cafe_stars);
					lastRevisionRef.current = message.revision;
					roomRef.current = toRoomState(message.room);
					setRoom(roomRef.current);
					setChatEvents((message.chat_history ?? []).map(toChatEvent));
					setLatestChatMessage(null);
					setChatError(null);
					setConnectionEpoch((current) => current + 1);
					setConnectionState("connected");
					setError(null);
					break;
				case "snapshot": {
					if (!readyRef.current || roomRef.current === null) {
						requestResynchronization(socket);
						break;
					}
					if (message.revision <= lastRevisionRef.current) break;
					lastRevisionRef.current = message.revision;
					roomRef.current = toDynamicRoomState(message.room, roomRef.current.mapLayout);
					setRoom(roomRef.current);
					break;
				}
				case "movement": {
					const currentRoom = roomRef.current;
					if (!readyRef.current || currentRoom === null) {
						requestResynchronization(socket);
						break;
					}
					if (message.revision <= lastRevisionRef.current) break;
					const nextRoom = applyMovementBatch(currentRoom, message.players);
					if (nextRoom === null) {
						requestResynchronization(socket);
						break;
					}
					lastRevisionRef.current = message.revision;
					roomRef.current = nextRoom;
					setRoom(nextRoom);
					break;
				}
				case "dialogue":
					setDialogue({
						messageKey: message.message_key,
						expression: message.expression
					});
					if (dialogueTimerRef.current !== null) {
						window.clearTimeout(dialogueTimerRef.current);
					}
					dialogueTimerRef.current = window.setTimeout(() => setDialogue(null), 7000);
					break;
				case "emote":
					emoteKeyRef.current += 1;
					setEmote({
						playerId: message.player_id,
						emote: message.emote,
						key: emoteKeyRef.current
					});
					break;
				case "chat_event": {
					const event = toChatEvent(message.event);
					setChatEvents((current) => {
						if (current.some((item) => item.id === event.id)) return current;
						return [...current, event].slice(-CHAT_HISTORY_LIMIT);
					});
					if (event.kind === "message") {
						setLatestChatMessage(event);
						if (event.playerId === selfPlayerIdRef.current) {
							setChatError(null);
						}
					}
					break;
				}
				case "chat_error":
					setChatError(message.code);
					break;
				case "reward":
					if (message.player_id === selfPlayerIdRef.current) {
						setCafeStars((current) => current + message.earned_stars);
					}
					break;
				case "error":
					shouldReconnectRef.current = false;
					readyRef.current = false;
					setError(toRoomErrorCode(message.code));
					setConnectionState("closed");
					socketRef.current?.close(4001, "cafe room error");
					break;
				case "pong":
					lastPongAtRef.current = Date.now();
					break;
			}
		}

		window.addEventListener("offline", handleOffline);
		window.addEventListener("online", handleOnline);
		if (onlineRef.current) {
			connect();
		}
		const heartbeatTimer = window.setInterval(() => {
			const socket = socketRef.current;
			if (socket?.readyState !== WebSocket.OPEN) {
				return;
			}
			if (Date.now() - lastPongAtRef.current > 25_000) {
				socket.close(4000, "cafe heartbeat timeout");
				return;
			}
			socket.send(JSON.stringify({ type: "ping" }));
		}, 10_000);
		return () => {
			disposed = true;
			shouldReconnectRef.current = false;
			readyRef.current = false;
			clearReconnectTimer();
			if (dialogueTimerRef.current !== null) {
				window.clearTimeout(dialogueTimerRef.current);
			}
			window.clearInterval(heartbeatTimer);
			window.removeEventListener("offline", handleOffline);
			window.removeEventListener("online", handleOnline);
			socketRef.current?.close(1000, "leaving cafe");
			socketRef.current = null;
		};
	}, [retryKey, roomId]);

	const send = useCallback((message: object) => {
		const socket = socketRef.current;
		if (readyRef.current && onlineRef.current && socket?.readyState === WebSocket.OPEN) {
			socket.send(JSON.stringify(message));
			return true;
		}
		return false;
	}, []);

	const sendMovement = useCallback(
		(x: number, y: number, direction: CafeDirection, moving: boolean, sequence: number) => {
			send({ type: "move", x, y, direction, moving, sequence });
		},
		[send]
	);
	const interact = useCallback(
		(targetId: string) => send({ type: "interact", target_id: targetId }),
		[send]
	);
	const sendEmote = useCallback((value: string) => send({ type: "emote", emote: value }), [send]);
	const sendChat = useCallback(
		(text: string) => {
			setChatError(null);
			return send({ type: "chat", text });
		},
		[send]
	);
	const retryConnection = useCallback(() => {
		roomRef.current = null;
		setRoom(null);
		setSelfPlayerId(null);
		setRetryKey((current) => current + 1);
	}, []);

	return {
		room,
		selfPlayerId,
		connectionEpoch,
		cafeStars,
		connectionState,
		dialogue,
		emote,
		chatEvents,
		latestChatMessage,
		chatError,
		error,
		retryConnection,
		sendMovement,
		interact,
		sendEmote,
		sendChat
	};
}

function toRoomErrorCode(code: string | undefined): CafeRoomErrorCode {
	switch (code) {
		case "room_not_found":
		case "room_full":
		case "rate_limited":
			return code;
		default:
			return "connection_failed";
	}
}

function toRoomState(room: ApiRoom): CafeRoomState {
	return toDynamicRoomState(room, toMapLayout(room.map_layout));
}

function toDynamicRoomState(room: ApiDynamicRoom, mapLayout: CafeMapLayout): CafeRoomState {
	return {
		id: room.id,
		inviteCode: room.invite_code,
		isPrivate: room.is_private,
		capacity: room.capacity,
		mapLayout,
		players: room.players.map((player) => ({
			id: player.id,
			name: player.name,
			color: player.color,
			x: player.x,
			y: player.y,
			direction: player.direction,
			moving: player.moving,
			carriedTea: player.carried_tea,
			carriedOrderId: player.carried_order_id,
			equippedCosmetic: player.equipped_cosmetic
		})),
		activity: {
			id: room.activity.id,
			roundNumber: room.activity.round_number,
			phase: room.activity.phase,
			nextRoundAt: room.activity.next_round_at,
			endsAt: room.activity.ends_at ?? null,
			delivered: room.activity.delivered,
			target: room.activity.target,
			combo: room.activity.combo ?? 0,
			bestCombo: room.activity.best_combo ?? 0,
			comboExpiresAt: room.activity.combo_expires_at ?? null,
			completed: room.activity.completed,
			teaLeaves: room.activity.tea_leaves.map((leaf) => ({
				id: leaf.id,
				x: leaf.x,
				y: leaf.y,
				available: leaf.available
			})),
			tableOrders: room.activity.table_orders.map((order) => ({
				id: order.id,
				tableId: order.table_id,
				drink: order.drink,
				x: order.x,
				y: order.y,
				status: order.status,
				claimedBy: order.claimed_by
			}))
		},
		aiko: room.aiko
	};
}

function applyMovementBatch(
	room: CafeRoomState,
	updates: ApiMovementPlayer[]
): CafeRoomState | null {
	if (updates.length !== room.players.length) return null;
	const updatesById = new Map(updates.map((player) => [player.id, player]));
	if (updatesById.size !== room.players.length) return null;
	if (room.players.some((player) => !updatesById.has(player.id))) return null;

	return {
		...room,
		players: room.players.map((player) => {
			const update = updatesById.get(player.id);
			if (update === undefined) return player;
			return {
				...player,
				x: update.x,
				y: update.y,
				direction: update.direction,
				moving: update.moving
			};
		})
	};
}

function toMapLayout(layout: ApiRoom["map_layout"]): CafeMapLayout {
	return {
		version: layout.version,
		width: layout.width,
		height: layout.height,
		playerCollisionRadius: layout.player_collision_radius,
		interactionRadius: layout.interaction_radius,
		hostInteractionRadius: layout.host_interaction_radius,
		playerSpawn: layout.player_spawn,
		colliders: layout.colliders,
		interactionTargets: layout.interaction_targets
	};
}

function toChatEvent(event: ApiChatEvent): CafeChatEvent {
	return {
		id: event.id,
		kind: event.kind,
		playerId: event.player_id,
		playerName: event.player_name,
		text: event.text,
		createdAt: event.created_at
	};
}

function browserIsOnline(): boolean {
	return typeof navigator === "undefined" || navigator.onLine !== false;
}
