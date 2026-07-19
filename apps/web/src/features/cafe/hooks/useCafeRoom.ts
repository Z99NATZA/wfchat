import { useCallback, useEffect, useRef, useState } from "react";
import { cafeSocketUrl } from "@/features/cafe/services/cafeApiService";
import { readCafePlayerName } from "@/features/cafe/services/cafePlayerName";
import type {
	CafeConnectionState,
	CafeDialogue,
	CafeDirection,
	CafeEmote,
	CafeRoomErrorCode,
	CafeRoomState
} from "@/features/cafe/types";

const MAX_RECONNECT_ATTEMPTS = 5;

type ApiPlayer = {
	id: string;
	name: string;
	color: string;
	x: number;
	y: number;
	direction: CafeDirection;
	moving: boolean;
	carried_tea: number;
	equipped_cosmetic: string | null;
};

type ApiRoom = {
	id: string;
	invite_code: string;
	is_private: boolean;
	capacity: number;
	map_width: number;
	map_height: number;
	players: ApiPlayer[];
	activity: {
		id: "tea_delivery";
		round_number: number;
		phase: "active" | "intermission";
		next_round_at: number | null;
		delivered: number;
		target: number;
		completed: boolean;
		tea_leaves: Array<{ id: string; x: number; y: number; available: boolean }>;
	};
	aiko: CafeRoomState["aiko"];
};

type ServerMessage =
	| { type: "welcome"; self_player_id: string; cafe_stars: number; room: ApiRoom }
	| { type: "snapshot"; room: ApiRoom }
	| { type: "dialogue"; message: string; expression: CafeDialogue["expression"] }
	| { type: "emote"; player_id: string; emote: string }
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
	const [error, setError] = useState<CafeRoomErrorCode | null>(null);
	const [retryKey, setRetryKey] = useState(0);
	const socketRef = useRef<WebSocket | null>(null);
	const reconnectTimerRef = useRef<number | null>(null);
	const reconnectAttemptRef = useRef(0);
	const shouldReconnectRef = useRef(true);
	const onlineRef = useRef(browserIsOnline());
	const readyRef = useRef(false);
	const selfPlayerIdRef = useRef<string | null>(null);
	const lastPongAtRef = useRef(Date.now());
	const dialogueTimerRef = useRef<number | null>(null);
	const emoteKeyRef = useRef(0);

	useEffect(() => {
		shouldReconnectRef.current = true;
		reconnectAttemptRef.current = 0;
		onlineRef.current = browserIsOnline();
		readyRef.current = false;
		setConnectionState(onlineRef.current ? "connecting" : "offline");
		setError(null);
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
					handleServerMessage(JSON.parse(event.data) as ServerMessage);
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

		function handleServerMessage(message: ServerMessage) {
			switch (message.type) {
				case "welcome":
					reconnectAttemptRef.current = 0;
					readyRef.current = true;
					selfPlayerIdRef.current = message.self_player_id;
					setSelfPlayerId(message.self_player_id);
					setCafeStars(message.cafe_stars);
					setRoom(toRoomState(message.room));
					setConnectionEpoch((current) => current + 1);
					setConnectionState("connected");
					setError(null);
					break;
				case "snapshot":
					setRoom(toRoomState(message.room));
					break;
				case "dialogue":
					setDialogue({ message: message.message, expression: message.expression });
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
		}
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
	const retryConnection = useCallback(() => {
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
		error,
		retryConnection,
		sendMovement,
		interact,
		sendEmote
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
	return {
		id: room.id,
		inviteCode: room.invite_code,
		isPrivate: room.is_private,
		capacity: room.capacity,
		mapWidth: room.map_width,
		mapHeight: room.map_height,
		players: room.players.map((player) => ({
			id: player.id,
			name: player.name,
			color: player.color,
			x: player.x,
			y: player.y,
			direction: player.direction,
			moving: player.moving,
			carriedTea: player.carried_tea,
			equippedCosmetic: player.equipped_cosmetic
		})),
		activity: {
			id: room.activity.id,
			roundNumber: room.activity.round_number,
			phase: room.activity.phase,
			nextRoundAt: room.activity.next_round_at,
			delivered: room.activity.delivered,
			target: room.activity.target,
			completed: room.activity.completed,
			teaLeaves: room.activity.tea_leaves.map((leaf) => ({
				id: leaf.id,
				x: leaf.x,
				y: leaf.y,
				available: leaf.available
			}))
		},
		aiko: room.aiko
	};
}

function browserIsOnline(): boolean {
	return typeof navigator === "undefined" || navigator.onLine !== false;
}
