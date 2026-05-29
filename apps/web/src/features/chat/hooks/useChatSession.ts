import { useEffect, useMemo, useState } from "react";
import { CHAT_PERSONAS, QUICK_PROMPTS, STARTER_MESSAGES } from "@/features/chat/data/chatFixtures";
import { useI18n } from "@/i18n";
import {
	clearChatMessages,
	getChatUiConfig,
	getOrCreateChat,
	sendChatMessage
} from "@/features/chat/services/chatApiService";
import { useDialog } from "@/components/dialog/DialogProvider";
import type { ChatMessage } from "@/types/chat";
import { formatMessageTime } from "@/utils/date";

export function useChatSession() {
	const { confirm } = useDialog();
	const { t } = useI18n();
	const [personas, setPersonas] = useState(CHAT_PERSONAS);
	const [quickPrompts, setQuickPrompts] = useState(QUICK_PROMPTS);
	const [selectedPersonaId, setSelectedPersonaId] = useState(CHAT_PERSONAS[0]?.id ?? "");
	const [messages, setMessages] = useState<ChatMessage[]>(STARTER_MESSAGES);
	const [draft, setDraft] = useState("");
	const [isSidebarOpen, setIsSidebarOpen] = useState(false);
	const [activeChatId, setActiveChatId] = useState<string | null>(null);
	const [isSending, setIsSending] = useState(false);
	const [isClearing, setIsClearing] = useState(false);
	const [errorMessage, setErrorMessage] = useState<string | null>(null);

	const activePersona = useMemo(() => {
		const firstPersona = personas[0] ?? CHAT_PERSONAS[0];
		return personas.find((persona) => persona.id === selectedPersonaId) ?? firstPersona;
	}, [personas, selectedPersonaId]);

	useEffect(() => {
		let isCurrent = true;

		getChatUiConfig()
			.then((config) => {
				if (!isCurrent || config.personas.length === 0) {
					return;
				}

				setPersonas(config.personas);
				setQuickPrompts(config.quickPrompts);
				setSelectedPersonaId((currentId) =>
					config.personas.some((persona) => persona.id === currentId)
						? currentId
						: config.personas[0].id
				);
			})
			.catch(() => {
				if (!isCurrent) {
					return;
				}

				setPersonas(CHAT_PERSONAS);
				setQuickPrompts(QUICK_PROMPTS);
				setSelectedPersonaId((currentId) =>
					CHAT_PERSONAS.some((persona) => persona.id === currentId)
						? currentId
						: (CHAT_PERSONAS[0]?.id ?? "")
				);
			});

		return () => {
			isCurrent = false;
		};
	}, []);

	useEffect(() => {
		let isCurrent = true;

		if (!selectedPersonaId) {
			return;
		}

		setErrorMessage(null);
		setActiveChatId(null);

		getOrCreateChat(selectedPersonaId)
			.then((chat) => {
				if (!isCurrent) {
					return;
				}

				setActiveChatId(chat.chatId);
				setMessages(chat.messages);
			})
			.catch(() => {
				if (isCurrent) {
					setErrorMessage(t("chat.session.connectError"));
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

		setMessages((currentMessages) => [...currentMessages, optimisticMessage]);
		setDraft("");
		setIsSending(true);
		setErrorMessage(null);

		try {
			const nextMessages = await sendChatMessage(activeChatId, trimmedDraft);
			setMessages(nextMessages);
		} catch {
			setMessages((currentMessages) => currentMessages.filter((message) => message.id !== optimisticMessage.id));
			setErrorMessage(t("chat.session.aiNoResponse"));
		} finally {
			setIsSending(false);
		}
	}

	async function clearChat() {
		if (!activeChatId || isSending || isClearing || messages.length === 0) {
			return;
		}

		const shouldClear = await confirm({
			title: t("chat.session.clearConfirmTitle"),
			description: t("chat.session.clearConfirmDesc")
		});

		if (!shouldClear) {
			return;
		}

		setIsClearing(true);
		setErrorMessage(null);

		try {
			const nextMessages = await clearChatMessages(activeChatId);
			setMessages(nextMessages);
		} catch {
			setErrorMessage(t("chat.session.clearError"));
		} finally {
			setIsClearing(false);
		}
	}

	return {
		activePersona,
		activeChatId,
		clearChat,
		closeSidebar: () => setIsSidebarOpen(false),
		draft,
		errorMessage,
		isClearing,
		isSidebarOpen,
		isSending,
		messages,
		openSidebar: () => setIsSidebarOpen(true),
		personas,
		quickPrompts,
		selectPersona,
		sendMessage,
		setDraft,
		useQuickPrompt: setDraft
	};
}
