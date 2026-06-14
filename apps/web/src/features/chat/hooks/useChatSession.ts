import { useCallback, useEffect, useMemo, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { CHAT_PERSONAS, MARKDOWN_QA_MESSAGES } from "@/features/chat/data/chatFixtures";
import { useI18n } from "@/i18n";
import {
	clearChatMessages,
	createMemoryFact,
	createMemorySummary,
	createPersonaChat,
	deleteChat,
	deleteMemoryFact,
	deleteMemorySummary,
	getChat,
	getChatUiConfig,
	isNotFound,
	listMemoryFacts,
	listMemorySummaries,
	listPersonaChats,
	sendChatMessage,
	streamChatMessage,
	updateMemoryFact,
	updateMemorySummary
} from "@/features/chat/services/chatApiService";
import {
	markChatMessagesDeleted,
	markChatSessionDeleted,
	markMemoryFactDeleted,
	markMemorySummaryDeleted,
	readChatMessagesCache,
	readChatSessionsCache,
	readMemoryFactsCache,
	readMemorySummariesCache
} from "@/services/syncService";
import { useDialog } from "@/components/dialog/DialogProvider";
import type { ChatMessage, ChatSessionSummary, MemoryFact, MemorySummary } from "@/types/chat";
import { formatMessageTime } from "@/utils/date";

const CHAT_PATH_PREFIX = "/chat/";
const CHAT_DRAFT_PATH = "/chat";
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function parseChatIdFromPath(pathname: string): string | null {
	if (!pathname.startsWith(CHAT_PATH_PREFIX)) {
		return null;
	}

	const chatId = pathname.slice(CHAT_PATH_PREFIX.length).trim();
	return UUID_PATTERN.test(chatId) ? chatId : null;
}

function isDraftChatPath(pathname: string): boolean {
	return pathname === CHAT_DRAFT_PATH || pathname === `${CHAT_DRAFT_PATH}/`;
}

function isInvalidChatPath(pathname: string): boolean {
	return pathname.startsWith(CHAT_PATH_PREFIX) && parseChatIdFromPath(pathname) === null;
}

export type ChatSessionAvatarEvent =
	| { type: "assistant_waiting"; chatId: string | null; personaId: string }
	| { type: "assistant_streaming"; chatId: string; personaId: string }
	| { type: "assistant_replied"; chatId: string; personaId: string; text: string }
	| { type: "assistant_error"; chatId: string | null; personaId: string };

type UseChatSessionOptions = {
	onAvatarChatEvent?: (event: ChatSessionAvatarEvent) => void;
};

export function useChatSession({ onAvatarChatEvent }: UseChatSessionOptions = {}) {
	const { confirm } = useDialog();
	const { t } = useI18n();
	const location = useLocation();
	const navigate = useNavigate();
	const [personas, setPersonas] = useState(CHAT_PERSONAS);
	const [selectedPersonaId, setSelectedPersonaId] = useState(CHAT_PERSONAS[0]?.id ?? "");
	const [messages, setMessages] = useState<ChatMessage[]>([]);
	const [draft, setDraft] = useState("");
	const [isSidebarOpen, setIsSidebarOpen] = useState(false);
	const [activeChatId, setActiveChatId] = useState<string | null>(null);
	const [sessions, setSessions] = useState<ChatSessionSummary[]>([]);
	const [chatSearchQuery, setChatSearchQuery] = useState("");
	const [debouncedChatSearchQuery, setDebouncedChatSearchQuery] = useState("");
	const [isSending, setIsSending] = useState(false);
	const [isClearing, setIsClearing] = useState(false);
	const [isCreatingSession, setIsCreatingSession] = useState(false);
	const [memoryFacts, setMemoryFacts] = useState<MemoryFact[]>([]);
	const [memorySummaries, setMemorySummaries] = useState<MemorySummary[]>([]);
	const [isSavingMemoryFact, setIsSavingMemoryFact] = useState(false);
	const [isSavingMemorySummary, setIsSavingMemorySummary] = useState(false);
	const [errorMessage, setErrorMessage] = useState<string | null>(null);
	const [refreshVersion, setRefreshVersion] = useState(0);
	const [routeChatId, setRouteChatId] = useState<string | null>(() =>
		parseChatIdFromPath(location.pathname)
	);

	const activePersona = useMemo(() => {
		const firstPersona = personas[0] ?? CHAT_PERSONAS[0];
		return personas.find((persona) => persona.id === selectedPersonaId) ?? firstPersona;
	}, [personas, selectedPersonaId]);
	const filteredSessions = useMemo(() => {
		const visibleSessions = sessions.filter((session) => session.lastMessage.trim().length > 0);
		const query = debouncedChatSearchQuery.trim().toLowerCase();
		if (!query) {
			return visibleSessions;
		}

		return visibleSessions.filter((session) => {
			const haystack = session.lastMessage.toLowerCase();
			return haystack.includes(query);
		});
	}, [debouncedChatSearchQuery, sessions]);
	const isMarkdownQaEnabled = useMemo(() => {
		const search = typeof location.search === "string" ? location.search : "";
		const isQaBuildEnabled =
			import.meta.env.DEV || import.meta.env.VITE_ENABLE_MARKDOWN_QA === "true";
		return isQaBuildEnabled && new URLSearchParams(search).get("qa") === "markdown";
	}, [location.search]);

	useEffect(() => {
		const timeoutId = window.setTimeout(() => {
			setDebouncedChatSearchQuery(chatSearchQuery);
		}, 200);

		return () => window.clearTimeout(timeoutId);
	}, [chatSearchQuery]);

	useEffect(() => {
		setRouteChatId(parseChatIdFromPath(location.pathname));
	}, [location.pathname]);

	const navigateToChat = useCallback(
		(chatId: string) => {
			navigate(`${CHAT_PATH_PREFIX}${chatId}`);
			setRouteChatId(chatId);
		},
		[navigate]
	);

	const navigateToDraft = useCallback(() => {
		navigate(CHAT_DRAFT_PATH);
		setRouteChatId(null);
	}, [navigate]);

	useEffect(() => {
		let isCurrent = true;

		getChatUiConfig()
			.then((config) => {
				if (!isCurrent || config.personas.length === 0) {
					return;
				}

				setPersonas(config.personas);
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
				const cachedSessions = readChatSessionsCache().filter(
					(session) => session.characterId === selectedPersonaId
				);
				setSessions(mergeChatSessions(nextSessions, cachedSessions));
			})
			.catch(() => {
				if (isCurrent) {
					const cachedSessions = readChatSessionsCache().filter(
						(session) => session.characterId === selectedPersonaId
					);
					setSessions(cachedSessions);
					setErrorMessage(t("chat.session.connectError"));
				}
			});

		return () => {
			isCurrent = false;
		};
	}, [refreshVersion, selectedPersonaId, t]);

	useEffect(() => {
		let isCurrent = true;
		if (!selectedPersonaId) {
			return;
		}

		listMemoryFacts(selectedPersonaId)
			.then((facts) => {
				if (isCurrent) {
					const cachedFacts = readMemoryFactsCache().filter(
						(item) => item.characterId === selectedPersonaId
					);
					setMemoryFacts(mergeMemoryFacts(facts, cachedFacts));
				}
			})
			.catch(() => {
				if (isCurrent) {
					const cachedFacts = readMemoryFactsCache().filter(
						(item) => item.characterId === selectedPersonaId
					);
					setMemoryFacts(cachedFacts);
				}
			});

		return () => {
			isCurrent = false;
		};
	}, [refreshVersion, selectedPersonaId]);

	useEffect(() => {
		let isCurrent = true;
		if (!selectedPersonaId) {
			return;
		}

		listMemorySummaries(selectedPersonaId)
			.then((summaries) => {
				if (isCurrent) {
					const cachedSummaries = readMemorySummariesCache().filter(
						(item) => item.characterId === selectedPersonaId
					);
					setMemorySummaries(mergeMemorySummaries(summaries, cachedSummaries));
				}
			})
			.catch(() => {
				if (isCurrent) {
					const cachedSummaries = readMemorySummariesCache().filter(
						(item) => item.characterId === selectedPersonaId
					);
					setMemorySummaries(cachedSummaries);
				}
			});

		return () => {
			isCurrent = false;
		};
	}, [refreshVersion, selectedPersonaId]);

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
						setActiveChatId(null);
						setMessages([]);
						setDraft("");
						navigateToDraft();
						return;
					}
					const cachedMessages = readChatMessagesCache(routeChatId);
					if (cachedMessages.length > 0) {
						setActiveChatId(routeChatId);
						setMessages(cachedMessages);
						return;
					}
					setErrorMessage(t("chat.session.connectError"));
				}
				return;
			}

			if (isDraftChatPath(location.pathname)) {
				setActiveChatId(null);
				setMessages([]);
				setDraft("");
				return;
			}

			if (isInvalidChatPath(location.pathname)) {
				setActiveChatId(null);
				setMessages([]);
				setDraft("");
				navigateToDraft();
			}
		}

		void syncFromRoute();
		return () => {
			isCurrent = false;
		};
	}, [location.pathname, navigateToDraft, refreshVersion, routeChatId, selectedPersonaId, t]);

	const refreshRemoteState = useCallback(() => {
		setRefreshVersion((version) => version + 1);
	}, []);

	const resetToDraft = useCallback(() => {
		setActiveChatId(null);
		setMessages([]);
		setDraft("");
		setSessions([]);
		setMemoryFacts([]);
		setMemorySummaries([]);
		setErrorMessage(null);
		navigateToDraft();
	}, [navigateToDraft]);

	const loadMarkdownQaMessages = useCallback(() => {
		if (!isMarkdownQaEnabled) {
			return;
		}

		setActiveChatId(null);
		setMessages(MARKDOWN_QA_MESSAGES.map((message) => ({ ...message })));
		setDraft("");
		setErrorMessage(null);
		setIsSidebarOpen(false);
	}, [isMarkdownQaEnabled]);

	function selectPersona(personaId: string) {
		setSelectedPersonaId(personaId);
		setIsSidebarOpen(false);
	}

	async function createNewSession() {
		if (!selectedPersonaId || isCreatingSession) {
			return;
		}
		setErrorMessage(null);
		setActiveChatId(null);
		setMessages([]);
		setDraft("");
		navigateToDraft();
		setIsSidebarOpen(false);
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
			navigateToChat(chat.chatId);
			setIsSidebarOpen(false);
		} catch {
			setErrorMessage(t("chat.session.connectError"));
		}
	}

	async function sendMessage() {
		const trimmedDraft = draft.trim();

		if (!trimmedDraft || isSending || !selectedPersonaId) {
			return;
		}

		const createdAt = Math.floor(Date.now() / 1000);
		const timestamp = formatMessageTime(new Date(createdAt * 1000));
		const optimisticMessage: ChatMessage = {
			id: `local-${Date.now()}`,
			author: "user",
			text: trimmedDraft,
			createdAt,
			time: timestamp
		};

		setMessages((currentMessages) => [...currentMessages, optimisticMessage]);
		setDraft("");
		setIsSending(true);
		setErrorMessage(null);
		onAvatarChatEvent?.({
			type: "assistant_waiting",
			chatId: activeChatId,
			personaId: selectedPersonaId
		});
		let createdChatId: string | null = null;
		let assistantMessageId: string | null = null;
		let streamStarted = false;
		let streamReceivedToken = false;
		let streamCompleted = false;
		let didNotifyStreaming = false;

		const ensureOptimisticAssistantMessage = () => {
			if (assistantMessageId) {
				return assistantMessageId;
			}

			assistantMessageId = `local-assistant-${Date.now()}`;
			const assistantMessage: ChatMessage = {
				id: assistantMessageId,
				author: "companion",
				text: "",
				createdAt,
				time: timestamp
			};

			setMessages((currentMessages) =>
				currentMessages.some((message) => message.id === assistantMessage.id)
					? currentMessages
					: [...currentMessages, assistantMessage]
			);

			return assistantMessageId;
		};

		const applyServerMessages = (
			chatId: string,
			nextMessages: ChatMessage[],
			assistantText: string
		) => {
			setMessages(nextMessages);
			onAvatarChatEvent?.({
				type: "assistant_replied",
				chatId,
				personaId: selectedPersonaId,
				text: assistantText
			});
			setSessions((currentSessions) =>
				upsertSentSession(
					currentSessions,
					chatId,
					selectedPersonaId,
					nextMessages.at(-1)?.text ?? trimmedDraft
				)
			);
		};

		try {
			const chatId = activeChatId ?? (await createPersonaChat(selectedPersonaId)).chatId;
			if (!activeChatId) {
				createdChatId = chatId;
				setActiveChatId(chatId);
				navigateToChat(chatId);
			}

			try {
				await streamChatMessage(chatId, trimmedDraft, {
					onStart: () => {
						streamStarted = true;
						ensureOptimisticAssistantMessage();
					},
					onToken: (text) => {
						streamReceivedToken = true;
						const currentAssistantMessageId = ensureOptimisticAssistantMessage();
						setMessages((currentMessages) =>
							currentMessages.map((message) =>
								message.id === currentAssistantMessageId
									? { ...message, text: `${message.text}${text}` }
									: message
							)
						);
						if (!didNotifyStreaming) {
							didNotifyStreaming = true;
							onAvatarChatEvent?.({
								type: "assistant_streaming",
								chatId,
								personaId: selectedPersonaId
							});
						}
					},
					onDone: (event) => {
						streamCompleted = true;
						applyServerMessages(chatId, event.messages, event.assistantMessage.text);
					}
				});

				if (!streamCompleted) {
					throw new Error("chat stream ended before completion");
				}
			} catch (streamError) {
				if (streamCompleted) {
					return;
				}

				if (!streamStarted && !streamReceivedToken) {
					const nextMessages = await sendChatMessage(chatId, trimmedDraft);
					applyServerMessages(
						chatId,
						nextMessages,
						nextMessages.filter((message) => message.author === "companion").at(-1)?.text ?? ""
					);
					return;
				}

				throw streamError;
			}
		} catch {
			if (createdChatId) {
				void deleteChat(createdChatId);
				setActiveChatId(null);
				navigateToDraft();
			}
			setMessages((currentMessages) =>
				currentMessages.filter(
					(message) => message.id !== optimisticMessage.id && message.id !== assistantMessageId
				)
			);
			setErrorMessage(t("chat.session.aiNoResponse"));
			onAvatarChatEvent?.({
				type: "assistant_error",
				chatId: createdChatId ?? activeChatId,
				personaId: selectedPersonaId
			});
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
			const messageIds = messages.map((message) => message.id);
			const nextMessages = await clearChatMessages(activeChatId);
			setMessages(nextMessages);
			if (messageIds.length > 0) {
				markChatMessagesDeleted(activeChatId, messageIds);
			}
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
			markMemoryFactDeleted(factId);
		} catch {
			// no-op
		}
	}

	async function editMemoryFact(factId: string, content: string) {
		const trimmed = content.trim();
		if (!trimmed) {
			return false;
		}
		try {
			const updated = await updateMemoryFact(factId, trimmed, 0.7);
			setMemoryFacts((current) => current.map((fact) => (fact.id === factId ? updated : fact)));
			return true;
		} catch {
			return false;
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
			markMemorySummaryDeleted(summaryId);
		} catch {
			// no-op
		}
	}

	async function editMemorySummary(summaryId: string, summary: string) {
		const trimmed = summary.trim();
		if (!trimmed) {
			return false;
		}
		try {
			const updated = await updateMemorySummary(summaryId, trimmed);
			setMemorySummaries((current) =>
				current.map((item) => (item.id === summaryId ? updated : item))
			);
			return true;
		} catch {
			return false;
		}
	}

	async function removeSession(sessionId: string) {
		const targetSession = sessions.find((session) => session.id === sessionId);
		if (!targetSession) {
			return;
		}

		const shouldDelete = await confirm({
			title: t("chat.session.deleteConfirmTitle"),
			description: t("chat.session.deleteConfirmDesc"),
			confirmLabel: t("chat.sidebar.deleteChat"),
			tone: "destructive"
		});

		if (!shouldDelete) {
			return;
		}

		async function applyLocalRemoval() {
			markChatSessionDeleted(sessionId);
			const nextSessions = sessions.filter((session) => session.id !== sessionId);
			setSessions(nextSessions);

			if (activeChatId !== sessionId) {
				return;
			}

			const fallbackSession = nextSessions[0];
			if (fallbackSession) {
				await selectSession(fallbackSession.id);
			return;
		}

			setActiveChatId(null);
			setMessages([]);
			setDraft("");
			navigateToDraft();
		}

		try {
			await deleteChat(sessionId);
			await applyLocalRemoval();
		} catch (error) {
			if (isNotFound(error)) {
				await applyLocalRemoval();
				return;
			}
			setErrorMessage(t("chat.session.deleteError"));
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
		refreshRemoteState,
		isMarkdownQaEnabled,
		loadMarkdownQaMessages,
		resetToDraft,
		personas,
		chatSearchQuery,
		selectPersona,
		selectSession,
		sendMessage,
		sessions: filteredSessions,
		setDraft,
		setChatSearchQuery,
		saveMemoryFact,
		saveMemorySummary,
		removeMemoryFact,
		removeMemorySummary,
		editMemoryFact,
		editMemorySummary,
		removeSession,
	};
}

function mergeChatSessions(primary: ChatSessionSummary[], secondary: ChatSessionSummary[]): ChatSessionSummary[] {
	const map = new Map<string, ChatSessionSummary>();
	for (const item of secondary) {
		map.set(item.id, item);
	}
	for (const item of primary) {
		const current = map.get(item.id);
		if (!current || item.updatedAt >= current.updatedAt) {
			map.set(item.id, item);
		}
	}
	return [...map.values()].sort((a, b) => b.updatedAt - a.updatedAt);
}

function upsertSentSession(
	sessions: ChatSessionSummary[],
	chatId: string,
	characterId: string,
	lastMessage: string
): ChatSessionSummary[] {
	const now = Math.floor(Date.now() / 1000);
	const existing = sessions.find((session) => session.id === chatId);
	const nextSession: ChatSessionSummary = {
		id: chatId,
		characterId,
		createdAt: existing?.createdAt ?? now,
		updatedAt: now,
		lastMessage
	};
	return [nextSession, ...sessions.filter((session) => session.id !== chatId)];
}

function mergeMemoryFacts(primary: MemoryFact[], secondary: MemoryFact[]): MemoryFact[] {
	const map = new Map<string, MemoryFact>();
	for (const item of secondary) {
		map.set(item.id, item);
	}
	for (const item of primary) {
		const current = map.get(item.id);
		if (!current || item.updatedAt >= current.updatedAt) {
			map.set(item.id, item);
		}
	}
	return [...map.values()].sort((a, b) => b.updatedAt - a.updatedAt);
}

function mergeMemorySummaries(primary: MemorySummary[], secondary: MemorySummary[]): MemorySummary[] {
	const map = new Map<string, MemorySummary>();
	for (const item of secondary) {
		map.set(item.id, item);
	}
	for (const item of primary) {
		const current = map.get(item.id);
		if (!current || item.createdAt >= current.createdAt) {
			map.set(item.id, item);
		}
	}
	return [...map.values()].sort((a, b) => b.createdAt - a.createdAt);
}
