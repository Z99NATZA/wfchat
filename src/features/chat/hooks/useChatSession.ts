import { useMemo, useState } from "react";
import { CHAT_PERSONAS, QUICK_PROMPTS, STARTER_MESSAGES } from "@/features/chat/data/chatFixtures";
import { buildCompanionReply } from "@/features/chat/services/chatReplyService";
import type { ChatMessage } from "@/types/chat";
import { formatMessageTime } from "@/utils/date";

export function useChatSession() {
	const [selectedPersonaId, setSelectedPersonaId] = useState(CHAT_PERSONAS[0].id);
	const [messages, setMessages] = useState<ChatMessage[]>(STARTER_MESSAGES);
	const [draft, setDraft] = useState("");
	const [isSidebarOpen, setIsSidebarOpen] = useState(false);

	const activePersona = useMemo(
		() => CHAT_PERSONAS.find((persona) => persona.id === selectedPersonaId) ?? CHAT_PERSONAS[0],
		[selectedPersonaId]
	);

	function selectPersona(personaId: string) {
		setSelectedPersonaId(personaId);
		setIsSidebarOpen(false);
	}

	function sendMessage() {
		const trimmedDraft = draft.trim();

		if (!trimmedDraft) {
			return;
		}

		const timestamp = formatMessageTime(new Date());
		const messageId = Date.now();

		setMessages((currentMessages) => [
			...currentMessages,
			{
				id: messageId,
				author: "user",
				text: trimmedDraft,
				time: timestamp
			},
			{
				id: messageId + 1,
				author: "companion",
				text: buildCompanionReply(trimmedDraft),
				time: timestamp
			}
		]);
		setDraft("");
	}

	return {
		activePersona,
		closeSidebar: () => setIsSidebarOpen(false),
		draft,
		isSidebarOpen,
		messages,
		openSidebar: () => setIsSidebarOpen(true),
		personas: CHAT_PERSONAS,
		quickPrompts: QUICK_PROMPTS,
		selectPersona,
		sendMessage,
		setDraft,
		useQuickPrompt: setDraft
	};
}
