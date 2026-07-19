export type CafeDirection = "up" | "down" | "left" | "right";

export type CafeConnectionState =
	"connecting" | "connected" | "offline" | "reconnecting" | "closed";

export type CafeRoomErrorCode =
	| "room_not_found"
	| "room_full"
	| "rate_limited"
	| "unreadable_update"
	| "connection_interrupted"
	| "connection_failed";

export type CafeRoomSummary = {
	id: string;
	inviteCode: string;
	isPrivate: boolean;
	playerCount: number;
	capacity: number;
	activityCompleted: boolean;
};

export type CafePlayerState = {
	id: string;
	name: string;
	color: string;
	x: number;
	y: number;
	direction: CafeDirection;
	moving: boolean;
	carriedTea: number;
	equippedCosmetic: string | null;
};

export type CafeTeaLeaf = {
	id: string;
	x: number;
	y: number;
	available: boolean;
};

export type CafeActivityState = {
	id: "tea_delivery";
	roundNumber: number;
	phase: "active" | "intermission";
	nextRoundAt: number | null;
	delivered: number;
	target: number;
	completed: boolean;
	teaLeaves: CafeTeaLeaf[];
};

export type CafeRoomState = {
	id: string;
	inviteCode: string;
	isPrivate: boolean;
	capacity: number;
	mapWidth: number;
	mapHeight: number;
	players: CafePlayerState[];
	activity: CafeActivityState;
	aiko: {
		x: number;
		y: number;
		motion: "idle" | "celebrate";
	};
};

export type CafeProgress = {
	cafeStars: number;
	unlockedCosmetics: string[];
	equippedCosmetic: string | null;
	cosmetics: CafeCosmetic[];
};

export type CafeCosmetic = {
	id: string;
	requiredStars: number;
	unlocked: boolean;
};

export type CafeDialogue = {
	message: string;
	expression: "neutral" | "happy" | "shy";
};

export type CafeEmote = {
	playerId: string;
	emote: string;
	key: number;
};
