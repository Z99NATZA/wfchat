import { useEffect, useMemo, useState } from "react";
import { CHAT_PERSONAS, QUICK_PROMPTS } from "@/features/chat/data/chatFixtures";
import { useI18n } from "@/i18n";
import {
	clearChatMessages,
	createMemoryFact,
	createMemorySummary,
	createPersonaChat,
	deleteMemoryFact,
	deleteMemorySummary,
	getChat,
	getChatUiConfig,
	isNotFound,
	listMemoryFacts,
	listMemorySummaries,
	listPersonaChats,
	sendChatMessage
} from "@/features/chat/services/chatApiService";
import { useDialog } from "@/components/dialog/DialogProvider";
import type { ChatMessage, ChatSessionSummary, MemoryFact, MemorySummary } from "@/types/chat";
import { formatMessageTime } from "@/utils/date";

const CHAT_PATH_PREFIX = "/chat/";

function parseChatIdFromPath(pathname: string): string | null {
	return pathname.startsWith(CHAT_PATH_PREFIX) ? pathname.slice(CHAT_PATH_PREFIX.length) : null;
}

function isRootPath(pathname: string): boolean {
	return pathname === "/" || pathname === "";
}

function updateHistoryForChat(chatId: string) {
	window.history.pushState(null, "", `${CHAT_PATH_PREFIX}${chatId}`);
}

export function useChatSession() {
	const { confirm } = useDialog();
	const { t } = useI18n();
	const [personas, setPersonas] = useState(CHAT_PERSONAS);
	const [quickPrompts, setQuickPrompts] = useState(QUICK_PROMPTS);
	const [selectedPersonaId, setSelectedPersonaId] = useState(CHAT_PERSONAS[0]?.id ?? "");
	const [messages, setMessages] = useState<ChatMessage[]>([]);
	const [draft, setDraft] = useState("");
	const [isSidebarOpen, setIsSidebarOpen] = useState(false);
	const [activeChatId, setActiveChatId] = useState<string | null>(null);
	const [sessions, setSessions] = useState<ChatSessionSummary[]>([]);
	const [isSending, setIsSending] = useState(false);
	const [isClearing, setIsClearing] = useState(false);
	const [isCreatingSession, setIsCreatingSession] = useState(false);
	const [memoryFacts, setMemoryFacts] = useState<MemoryFact[]>([]);
	const [memorySummaries, setMemorySummaries] = useState<MemorySummary[]>([]);
	const [isSavingMemoryFact, setIsSavingMemoryFact] = useState(false);
	const [isSavingMemorySummary, setIsSavingMemorySummary] = useState(false);
	const [errorMessage, setErrorMessage] = useState<string | null>(null);
	const [routeChatId, setRouteChatId] = useState<string | null>(() =>
		typeof window === "undefined" ? null : parseChatIdFromPath(window.location.pathname)
	);

	const activePersona = useMemo(() => {
		const firstPersona = personas[0] ?? CHAT_PERSONAS[0];
		return personas.find((persona) => persona.id === selectedPersonaId) ?? firstPersona;
	}, [personas, selectedPersonaId]);

	useEffect(() => {
		function onPopState() {
			setRouteChatId(parseChatIdFromPath(window.location.pathname));
		}
		window.addEventListener("popstate", onPopState);
		return () => window.removeEventListener("popstate", onPopState);
	}, []);

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
		listPersonaChats(selectedPersonaId)
			.then((nextSessions) => {
				if (!isCurrent) {
					return;
				}
				setSessions(nextSessions);
			})
			.catch(() => {
				if (isCurrent) {
					setSessions([]);
					setErrorMessage(t("chat.session.connectError"));
				}
			});

		return () => {
			isCurrent = false;
		};
	}, [selectedPersonaId, t]);

	useEffect(() => {
		let isCurrent = true;
		if (!selectedPersonaId) {
			return;
		}

		listMemoryFacts(selectedPersonaId)
			.then((facts) => {
				if (isCurrent) {
					setMemoryFacts(facts);
				}
			})
			.catch(() => {
				if (isCurrent) {
					setMemoryFacts([]);
				}
			});

		return () => {
			isCurrent = false;
		};
	}, [selectedPersonaId]);

	useEffect(() => {
		let isCurrent = true;
		if (!selectedPersonaId) {
			return;
		}

		listMemorySummaries(selectedPersonaId)
			.then((summaries) => {
				if (isCurrent) {
					setMemorySummaries(summaries);
				}
			})
			.catch(() => {
				if (isCurrent) {
					setMemorySummaries([]);
				}
			});

		return () => {
			isCurrent = false;
		};
	}, [selectedPersonaId]);

	useEffect(() => {
		let isCurrent = true;
		if (!selectedPersonaId) {
			return;
		}

		async function syncFromRoute() {
			setErrorMessage(null);

			if (routeChatId) {
				try {
					const chat = await getChat(routeChatId);
					if (!isCurrent) {
						return;
					}
					setActiveChatId(chat.chatId);
					setMessages(chat.messages);
					setSessions((currentSessions) =>
						currentSessions.some((session) => session.id === chat.chatId)
							? currentSessions
							: [
									{
										id: chat.chatId,
										characterId: selectedPersonaId,
										createdAt: Date.now() / 1000,
										updatedAt: Date.now() / 1000,
										lastMessage: chat.messages.at(-1)?.text ?? ""
									},
									...currentSessions
								]
					);
				} catch (error) {
					if (!isCurrent) {
						return;
					}
					if (isNotFound(error)) {
						const newChat = await createPersonaChat(selectedPersonaId);
						if (!isCurrent) {
							return;
						}
						setActiveChatId(newChat.chatId);
						setMessages(newChat.messages);
						updateHistoryForChat(newChat.chatId);
						setRouteChatId(newChat.chatId);
						return;
					}
					setErrorMessage(t("chat.session.connectError"));
				}
				return;
			}

			if (isRootPath(window.location.pathname)) {
				setIsCreatingSession(true);
				try {
					const newChat = await createPersonaChat(selectedPersonaId);
					if (!isCurrent) {
						return;
					}
					setActiveChatId(newChat.chatId);
					setMessages(newChat.messages);
					updateHistoryForChat(newChat.chatId);
					setRouteChatId(newChat.chatId);
					setSessions((currentSessions) => [
						{
							id: newChat.chatId,
							characterId: selectedPersonaId,
							createdAt: Date.now() / 1000,
							updatedAt: Date.now() / 1000,
							lastMessage: ""
						},
						...currentSessions
					]);
				} catch {
					if (isCurrent) {
						setErrorMessage(t("chat.session.connectError"));
					}
				} finally {
					if (isCurrent) {
						setIsCreatingSession(false);
					}
				}
			}
		}

		void syncFromRoute();
		return () => {
			isCurrent = false;
		};
	}, [routeChatId, selectedPersonaId, t]);

	function selectPersona(personaId: string) {
		setSelectedPersonaId(personaId);
		setIsSidebarOpen(false);
	}

	async function createNewSession() {
		if (!selectedPersonaId || isCreatingSession) {
			return;
		}
		setIsCreatingSession(true);
		setErrorMessage(null);
		try {
			const chat = await createPersonaChat(selectedPersonaId);
			setActiveChatId(chat.chatId);
			setMessages(chat.messages);
			setSessions((currentSessions) => [
				{
					id: chat.chatId,
					characterId: selectedPersonaId,
					createdAt: Date.now() / 1000,
					updatedAt: Date.now() / 1000,
					lastMessage: ""
				},
				...currentSessions
			]);
			updateHistoryForChat(chat.chatId);
			setRouteChatId(chat.chatId);
		} catch {
			setErrorMessage(t("chat.session.connectError"));
		} finally {
			setIsCreatingSession(false);
		}
	}

	async function selectSession(sessionId: string) {
		if (sessionId === activeChatId) {
			return;
		}

		setErrorMessage(null);
		try {
			const chat = await getChat(sessionId);
			setActiveChatId(chat.chatId);
			setMessages(chat.messages);
			updateHistoryForChat(chat.chatId);
			setRouteChatId(chat.chatId);
			setIsSidebarOpen(false);
		} catch {
			setErrorMessage(t("chat.session.connectError"));
		}
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
			setSessions((currentSessions) =>
				currentSessions.map((session) =>
					session.id === activeChatId
						? {
								...session,
								lastMessage: nextMessages.at(-1)?.text ?? trimmedDraft,
								updatedAt: Math.floor(Date.now() / 1000)
							}
						: session
				)
			);
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
			setSessions((currentSessions) =>
				currentSessions.map((session) =>
					session.id === activeChatId
						? {
								...session,
								lastMessage: "",
								updatedAt: Math.floor(Date.now() / 1000)
							}
						: session
				)
			);
		} catch {
			setErrorMessage(t("chat.session.clearError"));
		} finally {
			setIsClearing(false);
		}
	}

	async function saveMemoryFact(content: string) {
		const trimmed = content.trim();
		if (!trimmed || !selectedPersonaId || isSavingMemoryFact) {
			return false;
		}
		setIsSavingMemoryFact(true);
		try {
			const fact = await createMemoryFact(selectedPersonaId, trimmed, 0.7, activeChatId ?? undefined);
			setMemoryFacts((current) => [fact, ...current]);
			return true;
		} catch {
			return false;
		} finally {
			setIsSavingMemoryFact(false);
		}
	}

	async function removeMemoryFact(factId: string) {
		try {
			await deleteMemoryFact(factId);
			setMemoryFacts((current) => current.filter((fact) => fact.id !== factId));
		} catch {
			// no-op
		}
	}

	async function saveMemorySummary(summary: string) {
		const trimmed = summary.trim();
		if (!trimmed || !selectedPersonaId || isSavingMemorySummary) {
			return false;
		}
		setIsSavingMemorySummary(true);
		try {
			const created = await createMemorySummary(selectedPersonaId, trimmed, activeChatId ?? undefined);
			setMemorySummaries((current) => [created, ...current]);
			return true;
		} catch {
			return false;
		} finally {
			setIsSavingMemorySummary(false);
		}
	}

	async function removeMemorySummary(summaryId: string) {
		try {
			await deleteMemorySummary(summaryId);
			setMemorySummaries((current) => current.filter((summary) => summary.id !== summaryId));
		} catch {
			// no-op
		}
	}

	return {
		activePersona,
		activeChatId,
		clearChat,
		closeSidebar: () => setIsSidebarOpen(false),
		createNewSession,
		draft,
		errorMessage,
		isClearing,
		isCreatingSession,
		isSavingMemoryFact,
		isSavingMemorySummary,
		isSidebarOpen,
		isSending,
		memoryFacts,
		memorySummaries,
		messages,
		openSidebar: () => setIsSidebarOpen(true),
		personas,
		quickPrompts,
		selectPersona,
		selectSession,
		sendMessage,
		sessions,
		setDraft,
		saveMemoryFact,
		saveMemorySummary,
		removeMemoryFact,
		removeMemorySummary,
		useQuickPrompt: setDraft
	};
}
