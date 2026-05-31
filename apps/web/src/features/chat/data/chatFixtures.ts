import type { ChatMessage, ChatPersona } from "@/types/chat";

const avatarUrl = "/images/aiko-avatar.png";

export const CHAT_PERSONAS: ChatPersona[] = [
	{
		id: "aiko",
		name: "Aiko",
		title: "Calm anime companion",
		status: "Online",
		lastMessage: "Ready when you are.",
		lastActiveAt: "Now",
		unreadCount: 0,
		avatarUrl
	}
];

export const STARTER_MESSAGES: ChatMessage[] = [];

export const QUICK_PROMPTS = [
	"Make it sweeter",
	"Add playful banter",
	"Suggest a reply",
	"Save this memory"
];
