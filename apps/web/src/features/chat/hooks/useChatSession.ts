import { useEffect, useMemo, useState } from "react";
import { CHAT_PERSONAS, QUICK_PROMPTS, STARTER_MESSAGES } from "@/features/chat/data/chatFixtures";
import { getOrCreateChat, sendChatMessage } from "@/features/chat/services/chatApiService";
import type { ChatMessage } from "@/types/chat";
import { formatMessageTime } from "@/utils/date";

export function useChatSession() {
	const [selectedPersonaId, setSelectedPersonaId] = useState(CHAT_PERSONAS[0].id);
	const [messages, setMessages] = useState<ChatMessage[]>(STARTER_MESSAGES);
	const [draft, setDraft] = useState("");
	const [isSidebarOpen, setIsSidebarOpen] = useState(false);
	const [activeChatId, setActiveChatId] = useState<string | null>(null);
	const [isSending, setIsSending] = useState(false);
	const [errorMessage, setErrorMessage] = useState<string | null>(null);

	const activePersona = useMemo(
		() => CHAT_PERSONAS.find((persona) => persona.id === selectedPersonaId) ?? CHAT_PERSONAS[0],
		[selectedPersonaId]
	);

	useEffect(() => {
		let isCurrent = true;

		setErrorMessage(null);
		setActiveChatId(null);

		getOrCreateChat(selectedPersonaId)
			.then((chat) => {
				if (!isCurrent) {
					return;
				}

				setActiveChatId(chat.chatId);
				setMessages(chat.messages.length > 0 ? chat.messages : STARTER_MESSAGES);
			})
			.catch(() => {
				if (isCurrent) {
					setErrorMessage("Could not connect to the chat API.");
				}
			});

		return () => {
			isCurrent = false;
		};
	}, [selectedPersonaId]);

	function selectPersona(personaId: string) {
		setSelectedPersonaId(personaId);
		setIsSidebarOpen(false);
	}

	async function sendMessage() {
		const trimmedDraft = draft.trim();

		if (!trimmedDraft || isSending || !activeChatId) {
			return;
		}

		const timestamp = formatMessageTime(new Date());
		const optimisticMessage: ChatMessage = {
			id: `local-${Date.now()}`,
			author: "user",
			text: trimmedDraft,
			time: timestamp
		};

		setMessages((currentMessages) => [...withoutStarterMessages(currentMessages), optimisticMessage]);
		setDraft("");
		setIsSending(true);
		setErrorMessage(null);

		try {
			const nextMessages = await sendChatMessage(activeChatId, trimmedDraft);
			setMessages(nextMessages);
		} catch {
			setMessages((currentMessages) => currentMessages.filter((message) => message.id !== optimisticMessage.id));
			setErrorMessage("The AI service did not respond. Check the backend console and API key.");
		} finally {
			setIsSending(false);
		}
	}

	return {
		activePersona,
		activeChatId,
		closeSidebar: () => setIsSidebarOpen(false),
		draft,
		errorMessage,
		isSidebarOpen,
		isSending,
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

function withoutStarterMessages(messages: ChatMessage[]): ChatMessage[] {
	if (messages.every((message) => message.id.startsWith("starter-"))) {
		return [];
	}

	return messages;
}
