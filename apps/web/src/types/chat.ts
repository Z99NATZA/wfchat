export type ChatPersonaStatus = "Online" | "Typing" | "Away";

export type ChatMessageAuthor = "user" | "companion";

export type ChatPersona = {
	id: string;
	name: string;
	title: string;
	status: ChatPersonaStatus;
	lastMessage: string;
	lastActiveAt: string;
	unreadCount: number;
	avatarUrl: string;
};

export type ChatMessage = {
	id: string;
	author: ChatMessageAuthor;
	text: string;
	createdAt: number;
	time: string;
};

export type ChatSessionSummary = {
	id: string;
	characterId: string;
	createdAt: number;
	updatedAt: number;
	lastMessage: string;
};

export type MemoryFact = {
	id: string;
	characterId: string;
	content: string;
	confidence: number;
	sourceChatId?: string | null;
	createdAt: number;
	updatedAt: number;
};

export type MemorySummary = {
	id: string;
	characterId: string;
	summary: string;
	sourceChatId?: string | null;
	createdAt: number;
};
