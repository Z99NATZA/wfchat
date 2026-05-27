import type {
	ChatMemoryItem,
	ChatMessage,
	ChatMode,
	ChatPersona,
	ResponseMetric,
	SafetySetting
} from "@/types/chat";

const avatarUrl = "/images/aiko-avatar.png";

export const CHAT_PERSONAS: ChatPersona[] = [
	{
		id: "aiko",
		name: "Aiko",
		title: "Cozy strategist",
		status: "Online",
		lastMessage: "I made a warmer opening line for your scene.",
		lastActiveAt: "2m",
		unreadCount: 2,
		accentClass: "from-primary to-sky-400",
		avatarUrl
	},
	{
		id: "mira",
		name: "Mira",
		title: "Lore keeper",
		status: "Typing",
		lastMessage: "The backstory works better if the city is older.",
		lastActiveAt: "18m",
		unreadCount: 0,
		accentClass: "from-rose-400 to-orange-300",
		avatarUrl
	},
	{
		id: "nami",
		name: "Nami",
		title: "Daily check-in",
		status: "Away",
		lastMessage: "Drink water before the next focus sprint.",
		lastActiveAt: "1h",
		unreadCount: 0,
		accentClass: "from-emerald-400 to-teal-300",
		avatarUrl
	}
];

export const STARTER_MESSAGES: ChatMessage[] = [
	{
		id: 1,
		author: "companion",
		text: "Welcome back. I kept the chat warm, light, and distraction-free so we can jump straight into the next scene.",
		time: "21:02"
	},
	{
		id: 2,
		author: "user",
		text: "Can you help me make the opening message softer but still confident?",
		time: "21:03"
	},
	{
		id: 3,
		author: "companion",
		text: "Yes. Try opening with a small sensory detail, then ask one direct question. It feels intimate without becoming vague.",
		time: "21:04"
	},
	{
		id: 4,
		author: "companion",
		text: "Draft: I saved the quiet seat by the window. Tell me what kind of evening you want, and I will match your pace.",
		time: "21:05"
	}
];

export const QUICK_PROMPTS = [
	"Make it sweeter",
	"Add playful banter",
	"Suggest a reply",
	"Save this memory"
];

export const CHAT_MODES: ChatMode[] = [
	{ id: "soft", label: "Soft", isActive: true },
	{ id: "playful", label: "Playful", isActive: false },
	{ id: "focus", label: "Focus", isActive: false },
	{ id: "story", label: "Story", isActive: false }
];

export const MEMORY_ITEMS: ChatMemoryItem[] = [
	{ id: "concise-replies", label: "Prefers concise replies" },
	{ id: "cozy-settings", label: "Likes cozy settings" },
	{ id: "rewrite-style", label: "Save rewrite style" }
];

export const RESPONSE_METRICS: ResponseMetric[] = [
	{ id: "warmth", label: "Warmth", value: 72 },
	{ id: "creativity", label: "Creativity", value: 58 }
];

export const SAFETY_SETTING: SafetySetting = {
	title: "Boundaries",
	description: "Respectful companion mode",
	isEnabled: true
};
