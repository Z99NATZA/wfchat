import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { CHAT_PERSONAS, MARKDOWN_QA_MESSAGES } from "@/features/chat/data/chatFixtures";
import { useAssistantSpeechPlayback } from "@/features/chat/hooks/useAssistantSpeechPlayback";
import { useUserSpeechTranscription } from "@/features/chat/hooks/useUserSpeechTranscription";
import { useI18n } from "@/i18n/i18nContext";
import {
	clearChatMessages,
	claimPersonaFollowUp,
	createPersonaChat,
	deleteChat,
	deleteChatAttachment,
	getChat,
	getChatUiConfig,
	isChatApiStatus,
	isNotFound,
	listPersonaChats,
	sendChatMessage,
	streamChatMessage,
	uploadChatImageAttachment
} from "@/features/chat/services/chatApiService";
import type { ChatFollowUp } from "@/features/chat/services/chatApiService";
import {
	markChatMessagesDeleted,
	markChatSessionDeleted,
	readChatMessagesCache,
	readChatSessionsCache,
	syncLocalDeletesNow
} from "@/services/syncService";
import { useDialog } from "@/components/dialog/DialogContext";
import type {
	ChatMessage,
	ChatMessageAttachment,
	ChatSessionSummary,
	PendingChatImageAttachment
} from "@/types/chat";
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
	| { type: "assistant_error"; chatId: string | null; personaId: string }
	| { type: "assistant_speech_loading"; chatId: string | null; personaId: string; text: string }
	| { type: "assistant_speech_playing"; chatId: string | null; personaId: string; text: string }
	| { type: "assistant_speech_stopped"; chatId: string | null; personaId: string }
	| { type: "assistant_speech_error"; chatId: string | null; personaId: string };

type UseChatSessionOptions = {
	onAvatarChatEvent?: (event: ChatSessionAvatarEvent) => void;
};

type ActiveAssistantSpeechAvatarState = {
	chatId: string | null;
	messageId: string;
	personaId: string;
};

export function useChatSession({ onAvatarChatEvent }: UseChatSessionOptions = {}) {
	const { confirm } = useDialog();
	const { locale, t } = useI18n();
	const location = useLocation();
	const navigate = useNavigate();
	const [personas, setPersonas] = useState(CHAT_PERSONAS);
	const [selectedPersonaId, setSelectedPersonaId] = useState(CHAT_PERSONAS[0]?.id ?? "");
	const [quickPrompts, setQuickPrompts] = useState<string[]>([]);
	const [messages, setMessages] = useState<ChatMessage[]>([]);
	const [draft, setDraft] = useState("");
	const [isSidebarOpen, setIsSidebarOpen] = useState(false);
	const [activeChatId, setActiveChatId] = useState<string | null>(null);
	const [sessions, setSessions] = useState<ChatSessionSummary[]>([]);
	const [chatSearchQuery, setChatSearchQuery] = useState("");
	const [debouncedChatSearchQuery, setDebouncedChatSearchQuery] = useState("");
	const [isSending, setIsSending] = useState(false);
	const [isClearing, setIsClearing] = useState(false);
	const isCreatingSession = false;
	const [errorMessage, setErrorMessage] = useState<string | null>(null);
	const [isActiveChatReadOnly, setIsActiveChatReadOnly] = useState(false);
	const [isAssistantSpeechEnabled, setIsAssistantSpeechEnabled] = useState(false);
	const [isUserTranscriptionEnabled, setIsUserTranscriptionEnabled] = useState(false);
	const [refreshVersion, setRefreshVersion] = useState(0);
	const [routeChatId, setRouteChatId] = useState<string | null>(() =>
		parseChatIdFromPath(location.pathname)
	);
	const [draftFollowUp, setDraftFollowUp] = useState<ChatFollowUp | null>(null);
	const draftFollowUpClaimRef = useRef<{ characterId: string; claimKey: string } | null>(null);
	const pendingCreatedChatIdRef = useRef<string | null>(null);
	const activeAssistantSpeechAvatarRef = useRef<ActiveAssistantSpeechAvatarState | null>(null);
	const assistantSpeechAvatarEventKeyRef = useRef<string | null>(null);
	const {
		playback: assistantSpeechPlayback,
		stopAssistantSpeech,
		toggleAssistantSpeech
	} = useAssistantSpeechPlayback(activeChatId);
	const applyUserSpeechTranscript = useCallback((text: string) => {
		setDraft((currentDraft) => mergeDraftWithTranscript(currentDraft, text));
	}, []);
	const {
		cancelSpeechInput: cancelUserSpeechInput,
		speechInput: userSpeechInput,
		toggleSpeechInput: toggleUserSpeechInputBase
	} = useUserSpeechTranscription(applyUserSpeechTranscript);
	const toggleUserSpeechInput = useCallback(() => {
		if (userSpeechInput.status === "idle" || userSpeechInput.status === "error") {
			stopAssistantSpeech();
		}

		toggleUserSpeechInputBase();
	}, [stopAssistantSpeech, toggleUserSpeechInputBase, userSpeechInput.status]);

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
	const draftFollowUpMessage = useMemo<ChatMessage | null>(
		() =>
			draftFollowUp
				? {
						id: `follow-up-${draftFollowUp.id}`,
						author: "companion",
						text: draftFollowUp.content,
						createdAt: draftFollowUp.createdAt,
						time: formatMessageTime(new Date(draftFollowUp.createdAt * 1000))
					}
				: null,
		[draftFollowUp]
	);

	useEffect(() => {
		const timeoutId = window.setTimeout(() => {
			setDebouncedChatSearchQuery(chatSearchQuery);
		}, 200);

		return () => window.clearTimeout(timeoutId);
	}, [chatSearchQuery]);

	useEffect(() => {
		setRouteChatId(parseChatIdFromPath(location.pathname));
	}, [location.pathname]);

	useEffect(() => {
		let isCurrent = true;
		if (!selectedPersonaId || !isDraftChatPath(location.pathname) || isMarkdownQaEnabled) {
			setDraftFollowUp(null);
			draftFollowUpClaimRef.current = null;
			return;
		}

		const existingClaim = draftFollowUpClaimRef.current;
		const claim =
			existingClaim?.characterId === selectedPersonaId
				? existingClaim
				: { characterId: selectedPersonaId, claimKey: createUuidV4() };
		draftFollowUpClaimRef.current = claim;
		setDraftFollowUp((current) =>
			current?.characterId === selectedPersonaId ? current : null
		);
		claimPersonaFollowUp(selectedPersonaId, locale, claim.claimKey)
			.then((followUp) => {
				if (isCurrent) {
					setDraftFollowUp(followUp);
				}
			})
			.catch(() => {
				if (isCurrent) {
					setDraftFollowUp(null);
				}
			});

		return () => {
			isCurrent = false;
		};
	}, [isMarkdownQaEnabled, locale, location.pathname, selectedPersonaId]);

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

	const applyCachedChat = useCallback(
		(chatId: string) => {
			const cachedMessages = readChatMessagesCache(chatId);
			if (cachedMessages.length === 0) {
				return false;
			}

			setActiveChatId(chatId);
			setMessages(cachedMessages);
			setDraft("");
			setIsActiveChatReadOnly(true);
			setErrorMessage(t("chat.session.cachedReadOnly"));
			setSessions((currentSessions) =>
				currentSessions.some((session) => session.id === chatId)
					? currentSessions
					: [
							{
								id: chatId,
								characterId: selectedPersonaId,
								createdAt: cachedMessages[0]?.createdAt ?? Date.now() / 1000,
								updatedAt: cachedMessages.at(-1)?.createdAt ?? Date.now() / 1000,
								lastMessage: cachedMessages.at(-1)?.text ?? ""
							},
							...currentSessions
						]
			);
			return true;
		},
		[selectedPersonaId, t]
	);

	const markChatDeletedAndSync = useCallback((chatId: string) => {
		markChatSessionDeleted(chatId);
		void syncLocalDeletesNow().catch(() => {
			// The delete stays queued locally and will retry through the normal sync path.
		});
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
				setIsAssistantSpeechEnabled(config.assistantSpeechEnabled);
				setIsUserTranscriptionEnabled(config.userTranscriptionEnabled);
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
				setQuickPrompts([]);
				setIsAssistantSpeechEnabled(false);
				setIsUserTranscriptionEnabled(false);
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
		cancelUserSpeechInput();
	}, [activeChatId, cancelUserSpeechInput]);

	useEffect(() => {
		if (!onAvatarChatEvent || !selectedPersonaId) {
			return;
		}

		const { messageId, status } = assistantSpeechPlayback;
		const speechMessage = messageId
			? messages.find((message) => message.id === messageId && message.author === "companion")
			: undefined;
		const speechText = speechMessage?.text ?? "";

		if ((status === "loading" || status === "playing") && messageId) {
			const eventKey = `${status}:${activeChatId ?? ""}:${selectedPersonaId}:${messageId}:${speechText}`;
			if (assistantSpeechAvatarEventKeyRef.current === eventKey) {
				return;
			}

			activeAssistantSpeechAvatarRef.current = {
				chatId: activeChatId,
				messageId,
				personaId: selectedPersonaId
			};
			assistantSpeechAvatarEventKeyRef.current = eventKey;
			onAvatarChatEvent({
				type:
					status === "loading" ? "assistant_speech_loading" : "assistant_speech_playing",
				chatId: activeChatId,
				personaId: selectedPersonaId,
				text: speechText
			});
			return;
		}

		if (status === "error") {
			const activeSpeechAvatar = activeAssistantSpeechAvatarRef.current;
			if (!activeSpeechAvatar && !messageId) {
				return;
			}

			const eventKey = `error:${activeChatId ?? ""}:${selectedPersonaId}:${messageId ?? ""}`;
			if (assistantSpeechAvatarEventKeyRef.current === eventKey) {
				return;
			}

			activeAssistantSpeechAvatarRef.current = null;
			assistantSpeechAvatarEventKeyRef.current = eventKey;
			onAvatarChatEvent({
				type: "assistant_speech_error",
				chatId: activeSpeechAvatar?.chatId ?? activeChatId,
				personaId: activeSpeechAvatar?.personaId ?? selectedPersonaId
			});
			return;
		}

		if (status === "idle") {
			const activeSpeechAvatar = activeAssistantSpeechAvatarRef.current;
			if (!activeSpeechAvatar) {
				assistantSpeechAvatarEventKeyRef.current = null;
				return;
			}

			activeAssistantSpeechAvatarRef.current = null;
			assistantSpeechAvatarEventKeyRef.current = null;
			onAvatarChatEvent({
				type: "assistant_speech_stopped",
				chatId: activeSpeechAvatar.chatId,
				personaId: activeSpeechAvatar.personaId
			});
		}
	}, [activeChatId, assistantSpeechPlayback, messages, onAvatarChatEvent, selectedPersonaId]);

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

		async function syncFromRoute() {
			setErrorMessage(null);

			if (routeChatId) {
				if (routeChatId === pendingCreatedChatIdRef.current) {
					return;
				}

				try {
					const chat = await getChat(routeChatId);
					if (!isCurrent) {
						return;
					}
					setActiveChatId(chat.chatId);
					setMessages(chat.messages);
					setIsActiveChatReadOnly(false);
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
						if (applyCachedChat(routeChatId)) {
							return;
						}
						setActiveChatId(null);
						setMessages([]);
						setDraft("");
						navigateToDraft();
						setErrorMessage(t("chat.session.notFound"));
						return;
					}
					const cachedMessages = readChatMessagesCache(routeChatId);
					if (cachedMessages.length > 0) {
						setActiveChatId(routeChatId);
						setMessages(cachedMessages);
						setDraft("");
						setIsActiveChatReadOnly(true);
						setErrorMessage(t("chat.session.cachedReadOnly"));
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
				setIsActiveChatReadOnly(false);
				return;
			}

			if (isInvalidChatPath(location.pathname)) {
				setActiveChatId(null);
				setMessages([]);
				setDraft("");
				setIsActiveChatReadOnly(false);
				navigateToDraft();
			}
		}

		void syncFromRoute();
		return () => {
			isCurrent = false;
		};
	}, [
		applyCachedChat,
		location.pathname,
		navigateToDraft,
		refreshVersion,
		routeChatId,
		selectedPersonaId,
		t
	]);

	const refreshRemoteState = useCallback(() => {
		setRefreshVersion((version) => version + 1);
	}, []);

	const resetToDraft = useCallback(() => {
		stopAssistantSpeech();
		cancelUserSpeechInput();
		setActiveChatId(null);
		setMessages([]);
		setDraft("");
		setSessions([]);
		setErrorMessage(null);
		setIsActiveChatReadOnly(false);
		navigateToDraft();
	}, [cancelUserSpeechInput, navigateToDraft, stopAssistantSpeech]);

	const loadMarkdownQaMessages = useCallback(() => {
		if (!isMarkdownQaEnabled) {
			return;
		}

		stopAssistantSpeech();
		cancelUserSpeechInput();
		setActiveChatId(null);
		setMessages(MARKDOWN_QA_MESSAGES.map((message) => ({ ...message })));
		setDraftFollowUp(null);
		setDraft("");
		setErrorMessage(null);
		setIsActiveChatReadOnly(false);
		setIsSidebarOpen(false);
	}, [cancelUserSpeechInput, isMarkdownQaEnabled, stopAssistantSpeech]);

	function selectPersona(personaId: string) {
		stopAssistantSpeech();
		cancelUserSpeechInput();
		setSelectedPersonaId(personaId);
		setIsSidebarOpen(false);
	}

	async function createNewSession() {
		if (!selectedPersonaId || isCreatingSession) {
			return;
		}
		stopAssistantSpeech();
		cancelUserSpeechInput();
		setErrorMessage(null);
		setIsActiveChatReadOnly(false);
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

		stopAssistantSpeech();
		cancelUserSpeechInput();
		setErrorMessage(null);
		try {
			const chat = await getChat(sessionId);
			setActiveChatId(chat.chatId);
			setMessages(chat.messages);
			setIsActiveChatReadOnly(false);
			navigateToChat(chat.chatId);
			setIsSidebarOpen(false);
		} catch (error) {
			if (isNotFound(error)) {
				if (applyCachedChat(sessionId)) {
					navigateToChat(sessionId);
					setIsSidebarOpen(false);
					return;
				}

				setSessions((currentSessions) =>
					currentSessions.filter((session) => session.id !== sessionId)
				);
				markChatDeletedAndSync(sessionId);
				setErrorMessage(t("chat.session.notFound"));
				return;
			}
			setErrorMessage(t("chat.session.connectError"));
		}
	}

	async function sendMessage(imageAttachments: PendingChatImageAttachment[] = []) {
		const trimmedDraft = draft.trim();
		const pendingImageAttachments = imageAttachments.filter(
			(attachment) => attachment.kind === "image"
		);
		const hasImageAttachments = pendingImageAttachments.length > 0;

		if (
			(!trimmedDraft && !hasImageAttachments) ||
			isSending ||
			!selectedPersonaId ||
			isActiveChatReadOnly
		) {
			return false;
		}

		stopAssistantSpeech();
		cancelUserSpeechInput();
		setIsSending(true);
		setErrorMessage(null);

		let uploadedAttachments: ChatMessageAttachment[] = [];
		try {
			for (const attachment of pendingImageAttachments) {
				const uploaded = await uploadChatImageAttachment(attachment.file);
				uploadedAttachments = [
					...uploadedAttachments,
					{
						...uploaded,
						previewUrl: attachment.previewUrl
					}
				];
			}
		} catch (error) {
			await cleanupUploadedAttachments(uploadedAttachments);
			setErrorMessage(attachmentUploadErrorMessage(error, t));
			setIsSending(false);
			return false;
		}

		const createdAt = Math.floor(Date.now() / 1000);
		const timestamp = formatMessageTime(new Date(createdAt * 1000));
		const optimisticMessage: ChatMessage = {
			id: `local-${Date.now()}`,
			author: "user",
			text: trimmedDraft,
			createdAt,
			time: timestamp,
			attachments: uploadedAttachments
		};
		const sendAttachments = uploadedAttachments.map((attachment) => ({
			id: attachment.id,
			kind: attachment.kind
		}));

		setMessages((currentMessages) => [...currentMessages, optimisticMessage]);
		setDraft("");
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
			const createdChat = activeChatId
				? null
				: await createPersonaChat(selectedPersonaId, draftFollowUp?.id);
			const chatId = activeChatId ?? createdChat?.chatId;
			if (!chatId) {
				throw new Error("chat creation did not return an id");
			}
			if (!activeChatId) {
				createdChatId = chatId;
				pendingCreatedChatIdRef.current = chatId;
				if (draftFollowUp && createdChat) {
					setDraftFollowUp(null);
					setMessages((currentMessages) => [...createdChat.messages, ...currentMessages]);
				}
				setActiveChatId(chatId);
				setIsActiveChatReadOnly(false);
				navigateToChat(chatId);
			}

			try {
				await streamChatMessage(chatId, trimmedDraft, sendAttachments, {
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
					const nextMessages = await sendChatMessage(
						chatId,
						trimmedDraft,
						sendAttachments
					);
					applyServerMessages(
						chatId,
						nextMessages,
						nextMessages.filter((message) => message.author === "companion").at(-1)
							?.text ?? ""
					);
					return;
				}

				throw streamError;
			}
			return true;
		} catch {
			await cleanupUploadedAttachments(uploadedAttachments);
			if (createdChatId) {
				void deleteChat(createdChatId);
				setActiveChatId(null);
				navigateToDraft();
			}
			setMessages((currentMessages) =>
				currentMessages.filter(
					(message) =>
						message.id !== optimisticMessage.id && message.id !== assistantMessageId
				)
			);
			setErrorMessage(t("chat.session.aiNoResponse"));
			onAvatarChatEvent?.({
				type: "assistant_error",
				chatId: createdChatId ?? activeChatId,
				personaId: selectedPersonaId
			});
			return false;
		} finally {
			if (pendingCreatedChatIdRef.current === createdChatId) {
				pendingCreatedChatIdRef.current = null;
			}
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

		stopAssistantSpeech();
		cancelUserSpeechInput();
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

		function applyLocalRemoval() {
			markChatDeletedAndSync(sessionId);
			const nextSessions = sessions.filter((session) => session.id !== sessionId);
			setSessions(nextSessions);

			if (activeChatId !== sessionId) {
				return;
			}

			stopAssistantSpeech();
			cancelUserSpeechInput();
			setActiveChatId(null);
			setMessages([]);
			setDraft("");
			setIsActiveChatReadOnly(false);
			navigateToDraft();
			setIsSidebarOpen(false);
		}

		try {
			await deleteChat(sessionId);
			applyLocalRemoval();
		} catch (error) {
			if (isNotFound(error)) {
				applyLocalRemoval();
				return;
			}
			setErrorMessage(t("chat.session.deleteError"));
		}
	}

	return {
		activePersona,
		activeChatId,
		draftFollowUpMessage,
		clearChat,
		closeSidebar: () => setIsSidebarOpen(false),
		createNewSession,
		draft,
		errorMessage,
		isActiveChatReadOnly,
		isAssistantSpeechEnabled,
		isUserTranscriptionEnabled,
		assistantSpeechPlayback,
		userSpeechInput,
		isClearing,
		isCreatingSession,
		isSidebarOpen,
		isSending,
		messages,
		openSidebar: () => setIsSidebarOpen(true),
		quickPrompts,
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
		toggleAssistantSpeech,
		cancelUserSpeechInput,
		toggleUserSpeechInput,
		setChatSearchQuery,
		removeSession
	};
}

function mergeChatSessions(
	primary: ChatSessionSummary[],
	secondary: ChatSessionSummary[]
): ChatSessionSummary[] {
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

function mergeDraftWithTranscript(currentDraft: string, transcript: string): string {
	const trimmedTranscript = transcript.trim();
	if (!trimmedTranscript) {
		return currentDraft;
	}

	if (!currentDraft.trim()) {
		return trimmedTranscript;
	}

	return /\s$/.test(currentDraft)
		? `${currentDraft}${trimmedTranscript}`
		: `${currentDraft} ${trimmedTranscript}`;
}

function createUuidV4(): string {
	if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
		return crypto.randomUUID();
	}

	return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (token) => {
		const random = Math.floor(Math.random() * 16);
		const value = token === "x" ? random : (random & 0x3) | 0x8;
		return value.toString(16);
	});
}

async function cleanupUploadedAttachments(attachments: ChatMessageAttachment[]) {
	await Promise.allSettled(attachments.map((attachment) => deleteChatAttachment(attachment.id)));
}

function attachmentUploadErrorMessage(error: unknown, t: (key: string) => string): string {
	if (isChatApiStatus(error, 413)) {
		return t("chat.session.attachmentTooLarge");
	}

	const message = error instanceof Error ? error.message.toLowerCase() : "";
	if (message.includes("too large") || message.includes("request entity too large")) {
		return t("chat.session.attachmentTooLarge");
	}
	if (message.includes("not supported")) {
		return t("chat.session.attachmentUnsupported");
	}
	if (message.includes("not a valid image") || message.includes("invalid attachment upload")) {
		return t("chat.session.attachmentInvalid");
	}

	return t("chat.session.attachmentUploadError");
}
