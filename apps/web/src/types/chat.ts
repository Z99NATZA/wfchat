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
	time: string;
};
