export type ChatPersonaStatus = "Online" | "Typing" | "Away";

export type ChatMessageAuthor = "user" | "companion";

export type ChatMessageAttachmentKind = "image";

export type ChatMessageAttachment = {
	id: string;
	kind: ChatMessageAttachmentKind;
	mimeType: string;
	byteSize: number;
	width?: number | null;
	height?: number | null;
	previewUrl: string;
};

export type PendingChatImageAttachment = {
	id: string;
	file: File;
	name: string;
	previewUrl: string;
	kind: "image";
};

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
	attachments?: ChatMessageAttachment[];
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
