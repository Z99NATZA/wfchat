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

export const MARKDOWN_QA_MESSAGES: ChatMessage[] = [
	{
		id: "qa-user-markdown-plain",
		author: "user",
		text: "## User Markdown stays plain\n\n- This should not become a list\n\n**This should not become bold**",
		createdAt: 1_780_325_400,
		time: "QA"
	},
	{
		id: "qa-assistant-markdown-structure",
		author: "companion",
		text: [
			"## Markdown QA",
			"",
			"This fixture checks **bold text**, *italic text*, `inline code`, and a [safe link](https://example.com/docs).",
			"",
			"### Steps",
			"",
			"1. Confirm headings are compact.",
			"2. Confirm ordered lists are readable.",
			"3. Confirm assistant bubbles stay wider than user bubbles.",
			"",
			"Options:",
			"",
			"- Alpha",
			"- Beta",
			"- Gamma",
			"",
			"> Keep this as a frontend-only manual QA fixture."
		].join("\n"),
		createdAt: 1_780_325_460,
		time: "QA"
	},
	{
		id: "qa-assistant-markdown-table",
		author: "companion",
		text: [
			"## Table QA",
			"",
			"| Feature | Status | Notes |",
			"| --- | --- | --- |",
			"| Markdown | Ready | First rendering scope |",
			"| Attachments | Later | Out of scope |",
			"| Quick prompts | Later | Separate feature scope |",
			"",
			"| Column A | Column B | Column C | Column D | Column E |",
			"| --- | --- | --- | --- | --- |",
			"| Long value that should remain readable | Another long value | More content | Extra content | Final content |"
		].join("\n"),
		createdAt: 1_780_325_520,
		time: "QA"
	},
	{
		id: "qa-assistant-markdown-code",
		author: "companion",
		text: [
			"## Code QA",
			"",
			"```ts",
			"const value = \"hello\";",
			"console.log(value);",
			"```",
			"",
			"```text",
			"this-is-a-very-long-line-that-should-scroll-inside-the-code-block-this-is-a-very-long-line-that-should-scroll-inside-the-code-block",
			"```"
		].join("\n"),
		createdAt: 1_780_325_580,
		time: "QA"
	},
	{
		id: "qa-assistant-markdown-security",
		author: "companion",
		text: [
			"## Raw HTML QA",
			"",
			"<script>alert(\"xss\")</script>",
			"",
			"<img src=x onerror=alert(1)>",
			"",
			"<strong>raw strong should stay inert</strong>"
		].join("\n"),
		createdAt: 1_780_325_640,
		time: "QA"
	}
];

export const QUICK_PROMPTS = [
	"Make it sweeter",
	"Add playful banter",
	"Suggest a reply",
	"Save this memory"
];
