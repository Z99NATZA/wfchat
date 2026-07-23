export type CafeDirection = "up" | "down" | "left" | "right";
export type CafeActivityId = "tea_delivery" | "table_service";

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
	activityId: CafeActivityId;
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
	carriedOrderId: string | null;
	equippedCosmetic: string | null;
};

export type CafeTeaLeaf = {
	id: string;
	x: number;
	y: number;
	available: boolean;
};

export type CafeActivityState = {
	id: CafeActivityId;
	roundNumber: number;
	phase: "active" | "intermission";
	nextRoundAt: number | null;
	delivered: number;
	target: number;
	completed: boolean;
	teaLeaves: CafeTeaLeaf[];
	tableOrders: CafeTableOrder[];
};

export type CafeTableOrder = {
	id: string;
	tableId: "window" | "garden" | "long";
	drink: "sakura" | "mint" | "classic";
	x: number;
	y: number;
	status: "available" | "claimed" | "served";
	claimedBy: string | null;
};

export type CafeMapCollider = {
	id: string;
	x: number;
	y: number;
	width: number;
	height: number;
};

export type CafeMapInteractionTarget = {
	id: string;
	x: number;
	y: number;
};

export type CafeMapLayout = {
	version: string;
	width: number;
	height: number;
	playerCollisionRadius: number;
	interactionRadius: number;
	hostInteractionRadius: number;
	playerSpawn: {
		x: number;
		y: number;
	};
	colliders: CafeMapCollider[];
	interactionTargets: CafeMapInteractionTarget[];
};

export type CafeRoomState = {
	id: string;
	inviteCode: string;
	isPrivate: boolean;
	capacity: number;
	mapLayout: CafeMapLayout;
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
	messageKey: string;
	expression: "neutral" | "happy" | "shy";
};

export type CafeEmote = {
	playerId: string;
	emote: string;
	key: number;
};
