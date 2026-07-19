import { useCallback, useEffect, useRef, useState } from "react";
import { cafeSocketUrl } from "@/features/cafe/services/cafeApiService";
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
	| { type: "reward"; earned_stars: number }
	| { type: "pong" }
	| { type: "error"; code?: string; message: string };

export function useCafeRoom(roomId: string) {
	const [room, setRoom] = useState<CafeRoomState | null>(null);
	const [selfPlayerId, setSelfPlayerId] = useState<string | null>(null);
	const [cafeStars, setCafeStars] = useState(0);
	const [connectionState, setConnectionState] = useState<CafeConnectionState>("connecting");
	const [dialogue, setDialogue] = useState<CafeDialogue | null>(null);
	const [emote, setEmote] = useState<CafeEmote | null>(null);
	const [error, setError] = useState<CafeRoomErrorCode | null>(null);
	const [retryKey, setRetryKey] = useState(0);
	const socketRef = useRef<WebSocket | null>(null);
	const reconnectTimerRef = useRef<number | null>(null);
	const reconnectAttemptRef = useRef(0);
	const shouldReconnectRef = useRef(true);
	const lastPongAtRef = useRef(Date.now());
	const dialogueTimerRef = useRef<number | null>(null);
	const emoteKeyRef = useRef(0);

	useEffect(() => {
		shouldReconnectRef.current = true;
		reconnectAttemptRef.current = 0;
		setConnectionState("connecting");
		setError(null);
		let disposed = false;

		function connect() {
			if (disposed || !shouldReconnectRef.current) {
				return;
			}
			setConnectionState(reconnectAttemptRef.current > 0 ? "reconnecting" : "connecting");
			let socket: WebSocket;
			try {
				socket = new WebSocket(cafeSocketUrl(roomId));
			} catch {
				shouldReconnectRef.current = false;
				setConnectionState("closed");
				setError("connection_failed");
				return;
			}
			socketRef.current = socket;

			socket.onopen = () => {
				lastPongAtRef.current = Date.now();
			};
			socket.onmessage = (event) => {
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
				setError("connection_interrupted");
			};
			socket.onclose = () => {
				if (socketRef.current === socket) {
					socketRef.current = null;
				}
				if (!disposed && shouldReconnectRef.current) {
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
					reconnectTimerRef.current = window.setTimeout(connect, delay);
				} else {
					setConnectionState("closed");
				}
			};
		}

		function handleServerMessage(message: ServerMessage) {
			switch (message.type) {
				case "welcome":
					reconnectAttemptRef.current = 0;
					setSelfPlayerId(message.self_player_id);
					setCafeStars(message.cafe_stars);
					setRoom(toRoomState(message.room));
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
					setCafeStars((current) => current + message.earned_stars);
					break;
				case "error":
					shouldReconnectRef.current = false;
					setError(toRoomErrorCode(message.code));
					setConnectionState("closed");
					socketRef.current?.close(4001, "cafe room error");
					break;
				case "pong":
					lastPongAtRef.current = Date.now();
					break;
			}
		}

		connect();
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
			if (reconnectTimerRef.current !== null) {
				window.clearTimeout(reconnectTimerRef.current);
			}
			if (dialogueTimerRef.current !== null) {
				window.clearTimeout(dialogueTimerRef.current);
			}
			window.clearInterval(heartbeatTimer);
			socketRef.current?.close(1000, "leaving cafe");
			socketRef.current = null;
		};
	}, [retryKey, roomId]);

	const send = useCallback((message: object) => {
		const socket = socketRef.current;
		if (socket?.readyState === WebSocket.OPEN) {
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
			carriedTea: player.carried_tea
		})),
		activity: {
			id: room.activity.id,
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
