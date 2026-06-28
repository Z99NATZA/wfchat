/**
 * @vitest-environment happy-dom
 */
import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ChatMessage, ChatPersona } from "@/types/chat";
import { useChatSession, type ChatSessionAvatarEvent } from "@/features/chat/hooks/useChatSession";
import {
	createPersonaChat,
	deleteChat,
	sendChatMessage,
	streamChatMessage
} from "@/features/chat/services/chatApiService";
import { readChatMessagesCache, syncLocalDeletesNow } from "@/services/syncService";

const mocks = vi.hoisted(() => ({
	navigate: vi.fn(),
	location: { pathname: "/chat", search: "" },
	t: vi.fn((key: string) => key),
	confirm: vi.fn(),
	getChatUiConfig: vi.fn(),
	fetchAssistantMessageSpeech: vi.fn(),
	getAssistantMessageSpeech: vi.fn(),
	transcribeUserSpeech: vi.fn(),
	listPersonaChats: vi.fn(),
	listMemoryFacts: vi.fn(),
	listMemorySummaries: vi.fn(),
	createPersonaChat: vi.fn(),
	streamChatMessage: vi.fn(),
	sendChatMessage: vi.fn(),
	deleteChat: vi.fn(),
	clearChatMessages: vi.fn(),
	getChat: vi.fn(),
	isNotFound: vi.fn(),
	createMemoryFact: vi.fn(),
	createMemorySummary: vi.fn(),
	deleteMemoryFact: vi.fn(),
	deleteMemorySummary: vi.fn(),
	updateMemoryFact: vi.fn(),
	updateMemorySummary: vi.fn()
}));

vi.mock("react-router-dom", () => ({
	useLocation: () => mocks.location,
	useNavigate: () => mocks.navigate
}));

vi.mock("@/i18n", () => ({
	useI18n: () => ({
		t: mocks.t
	})
}));

vi.mock("@/components/dialog/DialogProvider", () => ({
	useDialog: () => ({
		confirm: mocks.confirm
	})
}));

vi.mock("@/services/syncService", () => ({
	markChatMessagesDeleted: vi.fn(),
	markChatSessionDeleted: vi.fn(),
	markMemoryFactDeleted: vi.fn(),
	markMemorySummaryDeleted: vi.fn(),
	readChatMessagesCache: vi.fn(() => []),
	readChatSessionsCache: vi.fn(() => []),
	readMemoryFactsCache: vi.fn(() => []),
	readMemorySummariesCache: vi.fn(() => []),
	syncLocalDeletesNow: vi.fn(() => Promise.resolve())
}));

vi.mock("@/features/chat/services/chatApiService", () => ({
	clearChatMessages: mocks.clearChatMessages,
	createMemoryFact: mocks.createMemoryFact,
	createMemorySummary: mocks.createMemorySummary,
	createPersonaChat: mocks.createPersonaChat,
	deleteChat: mocks.deleteChat,
	deleteMemoryFact: mocks.deleteMemoryFact,
	deleteMemorySummary: mocks.deleteMemorySummary,
	getChat: mocks.getChat,
	getChatUiConfig: mocks.getChatUiConfig,
	fetchAssistantMessageSpeech: mocks.fetchAssistantMessageSpeech,
	getAssistantMessageSpeech: mocks.getAssistantMessageSpeech,
	transcribeUserSpeech: mocks.transcribeUserSpeech,
	isNotFound: mocks.isNotFound,
	listMemoryFacts: mocks.listMemoryFacts,
	listMemorySummaries: mocks.listMemorySummaries,
	listPersonaChats: mocks.listPersonaChats,
	sendChatMessage: mocks.sendChatMessage,
	streamChatMessage: mocks.streamChatMessage,
	updateMemoryFact: mocks.updateMemoryFact,
	updateMemorySummary: mocks.updateMemorySummary
}));

const persona: ChatPersona = {
	id: "aiko",
	name: "Aiko",
	title: "Calm anime companion",
	status: "Online",
	lastMessage: "Ready",
	lastActiveAt: "Now",
	unreadCount: 0,
	avatarUrl: "/images/aiko-avatar.png"
};

class MockAudio {
	src: string;
	play = vi.fn(() => Promise.resolve());
	pause = vi.fn();

	constructor(src: string) {
		this.src = src;
		audioInstances.push(this);
	}

	addEventListener() {
		// Playback event behavior is covered by useAssistantSpeechPlayback tests.
	}
}

const audioInstances: MockAudio[] = [];

class FakeMediaRecorder extends EventTarget {
	static isTypeSupported = vi.fn(() => true);
	mimeType = "audio/webm";
	state: RecordingState = "inactive";

	start() {
		this.state = "recording";
	}

	requestData() {
		// No-op for session-level interruption tests.
	}

	stop() {
		this.state = "inactive";
		this.dispatchEvent(new Event("stop"));
	}
}

function installAssistantPlaybackMocks() {
	audioInstances.length = 0;
	vi.stubGlobal("Audio", MockAudio);
	vi.spyOn(URL, "createObjectURL").mockImplementation((object) => `blob:${object instanceof Blob ? object.size : 0}`);
	vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => undefined);
	mocks.getAssistantMessageSpeech.mockResolvedValue(new Blob(["audio-one"]));
}

function installMicrophoneMocks() {
	vi.stubGlobal("MediaRecorder", FakeMediaRecorder);
	Object.defineProperty(navigator, "mediaDevices", {
		configurable: true,
		value: {
			getUserMedia: vi.fn(async () => ({
				getTracks: () => [{ stop: vi.fn() }]
			}))
		}
	});
}

describe("useChatSession streaming sendMessage", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		audioInstances.length = 0;
		mocks.location.pathname = "/chat";
		mocks.location.search = "";
		mocks.confirm.mockResolvedValue(true);
		mocks.getChatUiConfig.mockResolvedValue({
			personas: [persona],
			assistantSpeechEnabled: false,
			userTranscriptionEnabled: false,
			quickPrompts: []
		});
		mocks.listPersonaChats.mockResolvedValue([]);
		mocks.listMemoryFacts.mockResolvedValue([]);
		mocks.listMemorySummaries.mockResolvedValue([]);
		mocks.createPersonaChat.mockResolvedValue({ chatId: "chat-1", messages: [] });
		mocks.deleteChat.mockResolvedValue(undefined);
		mocks.isNotFound.mockReturnValue(false);
	});

	afterEach(() => {
		cleanup();
		vi.unstubAllGlobals();
		vi.restoreAllMocks();
	});

	it("appends streaming tokens into one optimistic assistant message and replaces with server messages on done", async () => {
		const avatarEvents: ChatSessionAvatarEvent[] = [];
		const streamedMessages = [message("server-user", "user", "hello"), message("server-ai", "companion", "hello back")];
		let finishStream: (() => void) | undefined;
		let streamHandlers: Parameters<typeof streamChatMessage>[2] | undefined;
		mocks.streamChatMessage.mockImplementation((_chatId, _content, handlers) => {
			streamHandlers = handlers;
			handlers.onStart?.({ chatId: "chat-1", personaId: "aiko" });
			handlers.onToken?.("hel");
			return new Promise<void>((resolve) => {
				finishStream = () => {
					handlers.onToken?.("lo");
					handlers.onDone?.({
						chatId: "chat-1",
						userMessage: streamedMessages[0],
						assistantMessage: streamedMessages[1],
						messages: streamedMessages
					});
					resolve();
				};
			});
		});
		const { result } = renderHook(() =>
			useChatSession({ onAvatarChatEvent: (event) => avatarEvents.push(event) })
		);

		await act(async () => {
			result.current.setDraft("hello");
		});
		let sendPromise: Promise<void> | undefined;
		await act(async () => {
			sendPromise = result.current.sendMessage();
			await Promise.resolve();
		});

		await waitFor(() => expect(streamHandlers).toBeDefined());
		await waitFor(() =>
			expect(result.current.messages.map((item) => ({ author: item.author, text: item.text }))).toEqual([
				{ author: "user", text: "hello" },
				{ author: "companion", text: "hel" }
			])
		);
		expect(avatarEvents.map((event) => event.type)).toEqual(["assistant_waiting", "assistant_streaming"]);

		await act(async () => {
			finishStream?.();
			await sendPromise;
		});

		expect(result.current.messages).toEqual(streamedMessages);
		expect(result.current.activeChatId).toBe("chat-1");
		expect(result.current.sessions).toEqual([
			expect.objectContaining({ id: "chat-1", characterId: "aiko", lastMessage: "hello back" })
		]);
		expect(avatarEvents).toEqual([
			{ type: "assistant_waiting", chatId: null, personaId: "aiko" },
			{ type: "assistant_streaming", chatId: "chat-1", personaId: "aiko" },
			{ type: "assistant_replied", chatId: "chat-1", personaId: "aiko", text: "hello back" }
		]);
	});

	it("falls back to non-streaming send when streaming fails before it starts", async () => {
		const avatarEvents: ChatSessionAvatarEvent[] = [];
		const fallbackMessages = [
			message("server-user", "user", "fallback"),
			message("server-ai", "companion", "fallback response")
		];
		mocks.streamChatMessage.mockRejectedValue(new Error("network failed before stream"));
		mocks.sendChatMessage.mockResolvedValue(fallbackMessages);
		const { result } = renderHook(() =>
			useChatSession({ onAvatarChatEvent: (event) => avatarEvents.push(event) })
		);

		await act(async () => {
			result.current.setDraft("fallback");
		});
		await act(async () => {
			await result.current.sendMessage();
		});

		expect(sendChatMessage).toHaveBeenCalledWith("chat-1", "fallback");
		expect(result.current.messages).toEqual(fallbackMessages);
		expect(deleteChat).not.toHaveBeenCalled();
		expect(avatarEvents.map((event) => event.type)).toEqual(["assistant_waiting", "assistant_replied"]);
	});

	it("rolls back optimistic messages when streaming fails after starting", async () => {
		const avatarEvents: ChatSessionAvatarEvent[] = [];
		mocks.streamChatMessage.mockImplementation(async (_chatId, _content, handlers) => {
			handlers.onStart?.({ chatId: "chat-1", personaId: "aiko" });
			handlers.onToken?.("partial");
			throw new Error("stream failed after token");
		});
		const { result } = renderHook(() =>
			useChatSession({ onAvatarChatEvent: (event) => avatarEvents.push(event) })
		);

		await act(async () => {
			result.current.setDraft("broken");
		});
		await act(async () => {
			await result.current.sendMessage();
		});

		expect(sendChatMessage).not.toHaveBeenCalled();
		expect(deleteChat).toHaveBeenCalledWith("chat-1");
		expect(result.current.messages).toEqual([]);
		expect(result.current.errorMessage).toBe("chat.session.aiNoResponse");
		expect(avatarEvents.map((event) => event.type)).toEqual([
			"assistant_waiting",
			"assistant_streaming",
			"assistant_error"
		]);
	});

	it("loads markdown QA fixture messages only when the dev query flag is present", async () => {
		const { result, rerender } = renderHook(() => useChatSession());

		expect(result.current.isMarkdownQaEnabled).toBe(false);
		await act(async () => {
			result.current.loadMarkdownQaMessages();
		});
		expect(result.current.messages).toEqual([]);

		mocks.location.search = "?qa=markdown";
		rerender();

		expect(result.current.isMarkdownQaEnabled).toBe(true);
		await act(async () => {
			result.current.loadMarkdownQaMessages();
		});

		expect(result.current.activeChatId).toBeNull();
		expect(result.current.messages.length).toBeGreaterThan(0);
		expect(result.current.messages.some((item) => item.id === "qa-assistant-markdown-table")).toBe(true);
		expect(result.current.messages.some((item) => item.text.includes("<script>"))).toBe(true);
	});

	it("exposes quick prompts from chat UI config", async () => {
		mocks.getChatUiConfig.mockResolvedValue({
			personas: [persona],
			assistantSpeechEnabled: false,
			userTranscriptionEnabled: false,
			quickPrompts: ["Make it sweeter", "Suggest a reply"]
		});

		const { result } = renderHook(() => useChatSession());

		await waitFor(() =>
			expect(result.current.quickPrompts).toEqual(["Make it sweeter", "Suggest a reply"])
		);
	});

	it("exposes assistant speech capability from chat UI config", async () => {
		mocks.getChatUiConfig.mockResolvedValue({
			personas: [persona],
			assistantSpeechEnabled: true,
			userTranscriptionEnabled: false,
			quickPrompts: []
		});

		const { result } = renderHook(() => useChatSession());

		await waitFor(() => expect(result.current.isAssistantSpeechEnabled).toBe(true));
	});

	it("notifies avatar motion events while assistant speech loads, plays, and stops", async () => {
		installAssistantPlaybackMocks();
		const avatarEvents: ChatSessionAvatarEvent[] = [];
		let resolveSpeech: ((audio: Blob) => void) | undefined;
		mocks.getAssistantMessageSpeech.mockReturnValue(
			new Promise<Blob>((resolve) => {
				resolveSpeech = resolve;
			})
		);
		mocks.getChat.mockResolvedValue({
			chatId: "chat-1",
			messages: [message("assistant-1", "companion", "ขอบคุณมากนะ")]
		});
		const { result } = renderHook(() =>
			useChatSession({ onAvatarChatEvent: (event) => avatarEvents.push(event) })
		);

		await act(async () => {
			await result.current.selectSession("chat-1");
		});
		await act(async () => {
			result.current.toggleAssistantSpeech("assistant-1");
		});

		await waitFor(() => expect(result.current.assistantSpeechPlayback.status).toBe("loading"));
		expect(avatarEvents).toEqual([
			{
				type: "assistant_speech_loading",
				chatId: "chat-1",
				personaId: "aiko",
				text: "ขอบคุณมากนะ"
			}
		]);

		await act(async () => {
			resolveSpeech?.(new Blob(["audio-one"]));
			await Promise.resolve();
		});

		await waitFor(() => expect(result.current.assistantSpeechPlayback.status).toBe("playing"));
		expect(avatarEvents).toEqual([
			{
				type: "assistant_speech_loading",
				chatId: "chat-1",
				personaId: "aiko",
				text: "ขอบคุณมากนะ"
			},
			{
				type: "assistant_speech_playing",
				chatId: "chat-1",
				personaId: "aiko",
				text: "ขอบคุณมากนะ"
			}
		]);

		act(() => {
			result.current.toggleAssistantSpeech("assistant-1");
		});

		await waitFor(() => expect(result.current.assistantSpeechPlayback.status).toBe("idle"));
		expect(avatarEvents).toEqual([
			{
				type: "assistant_speech_loading",
				chatId: "chat-1",
				personaId: "aiko",
				text: "ขอบคุณมากนะ"
			},
			{
				type: "assistant_speech_playing",
				chatId: "chat-1",
				personaId: "aiko",
				text: "ขอบคุณมากนะ"
			},
			{ type: "assistant_speech_stopped", chatId: "chat-1", personaId: "aiko" }
		]);
	});

	it("notifies avatar motion errors when assistant speech playback fails", async () => {
		installAssistantPlaybackMocks();
		const avatarEvents: ChatSessionAvatarEvent[] = [];
		mocks.getAssistantMessageSpeech.mockRejectedValue(new Error("speech failed"));
		mocks.getChat.mockResolvedValue({
			chatId: "chat-1",
			messages: [message("assistant-1", "companion", "hello")]
		});
		const { result } = renderHook(() =>
			useChatSession({ onAvatarChatEvent: (event) => avatarEvents.push(event) })
		);

		await act(async () => {
			await result.current.selectSession("chat-1");
		});
		await act(async () => {
			result.current.toggleAssistantSpeech("assistant-1");
		});

		await waitFor(() => expect(result.current.assistantSpeechPlayback.status).toBe("error"));
		expect(avatarEvents).toEqual([
			{ type: "assistant_speech_error", chatId: "chat-1", personaId: "aiko" }
		]);
	});

	it("exposes user speech transcription capability from chat UI config", async () => {
		mocks.getChatUiConfig.mockResolvedValue({
			personas: [persona],
			assistantSpeechEnabled: false,
			userTranscriptionEnabled: true,
			quickPrompts: []
		});

		const { result } = renderHook(() => useChatSession());

		await waitFor(() => expect(result.current.isUserTranscriptionEnabled).toBe(true));
	});

	it("stops assistant playback when starting user speech input", async () => {
		installAssistantPlaybackMocks();
		installMicrophoneMocks();
		mocks.getChat.mockResolvedValue({
			chatId: "chat-1",
			messages: [message("assistant-1", "companion", "hello")]
		});
		const { result } = renderHook(() => useChatSession());

		await act(async () => {
			await result.current.selectSession("chat-1");
		});
		await act(async () => {
			result.current.toggleAssistantSpeech("assistant-1");
		});
		await waitFor(() => expect(result.current.assistantSpeechPlayback.status).toBe("playing"));

		act(() => {
			result.current.toggleUserSpeechInput();
		});

		await waitFor(() => expect(result.current.userSpeechInput.status).toBe("recording"));
		expect(audioInstances[0].pause).toHaveBeenCalledTimes(1);
		expect(result.current.assistantSpeechPlayback).toEqual({ messageId: null, status: "idle" });
	});

	it("stops assistant playback and cancels speech input when sending a message", async () => {
		installAssistantPlaybackMocks();
		installMicrophoneMocks();
		const serverMessages = [
			message("server-user", "user", "next"),
			message("server-ai", "companion", "reply")
		];
		mocks.getChat.mockResolvedValue({
			chatId: "chat-1",
			messages: [message("assistant-1", "companion", "hello")]
		});
		mocks.streamChatMessage.mockImplementation(async (_chatId, _content, handlers) => {
			handlers.onStart?.({ chatId: "chat-1", personaId: "aiko" });
			handlers.onDone?.({
				chatId: "chat-1",
				userMessage: serverMessages[0],
				assistantMessage: serverMessages[1],
				messages: serverMessages
			});
		});
		const { result } = renderHook(() => useChatSession());

		await act(async () => {
			await result.current.selectSession("chat-1");
		});
		await act(async () => {
			result.current.toggleAssistantSpeech("assistant-1");
		});
		await waitFor(() => expect(result.current.assistantSpeechPlayback.status).toBe("playing"));
		act(() => {
			result.current.toggleUserSpeechInput();
		});
		await waitFor(() => expect(result.current.userSpeechInput.status).toBe("recording"));
		await act(async () => {
			result.current.setDraft("next");
		});

		await act(async () => {
			await result.current.sendMessage();
		});

		expect(audioInstances[0].pause).toHaveBeenCalled();
		expect(result.current.userSpeechInput.status).toBe("idle");
		expect(result.current.messages).toEqual(serverMessages);
	});

	it("stops assistant playback and cancels speech input when clearing chat", async () => {
		installAssistantPlaybackMocks();
		installMicrophoneMocks();
		mocks.getChat.mockResolvedValue({
			chatId: "chat-1",
			messages: [message("assistant-1", "companion", "hello")]
		});
		mocks.clearChatMessages.mockResolvedValue([]);
		const { result } = renderHook(() => useChatSession());

		await act(async () => {
			await result.current.selectSession("chat-1");
		});
		await act(async () => {
			result.current.toggleAssistantSpeech("assistant-1");
		});
		await waitFor(() => expect(result.current.assistantSpeechPlayback.status).toBe("playing"));
		act(() => {
			result.current.toggleUserSpeechInput();
		});
		await waitFor(() => expect(result.current.userSpeechInput.status).toBe("recording"));

		await act(async () => {
			await result.current.clearChat();
		});

		expect(audioInstances[0].pause).toHaveBeenCalled();
		expect(result.current.userSpeechInput.status).toBe("idle");
		expect(result.current.messages).toEqual([]);
	});

	it("does not load invalid chat route segments as backend chat ids", async () => {
		mocks.location.pathname = "/chat/qa";

		renderHook(() => useChatSession());

		await waitFor(() => expect(mocks.navigate).toHaveBeenCalledWith("/chat"));
		expect(mocks.getChat).not.toHaveBeenCalled();
	});

	it("opens cached messages when a selected synced chat is missing from the backend session", async () => {
		const cachedMessages = [
			message("cached-user", "user", "cached hello"),
			message("cached-ai", "companion", "cached reply")
		];
		mocks.getChat.mockRejectedValue(new Error("not found"));
		mocks.isNotFound.mockReturnValue(true);
		vi.mocked(readChatMessagesCache).mockReturnValue(cachedMessages);
		const { result } = renderHook(() => useChatSession());

		await act(async () => {
			await result.current.selectSession("cached-chat");
		});

		expect(result.current.activeChatId).toBe("cached-chat");
		expect(result.current.messages).toEqual(cachedMessages);
		expect(result.current.errorMessage).toBe("chat.session.cachedReadOnly");
		expect(result.current.isActiveChatReadOnly).toBe(true);
		expect(mocks.navigate).toHaveBeenCalledWith("/chat/cached-chat");
	});

	it("does not send messages from a cached read-only chat", async () => {
		const cachedMessages = [message("cached-ai", "companion", "cached reply")];
		mocks.getChat.mockRejectedValue(new Error("not found"));
		mocks.isNotFound.mockReturnValue(true);
		vi.mocked(readChatMessagesCache).mockReturnValue(cachedMessages);
		const { result } = renderHook(() => useChatSession());

		await act(async () => {
			await result.current.selectSession("cached-chat");
		});
		mocks.createPersonaChat.mockClear();
		mocks.streamChatMessage.mockClear();
		mocks.sendChatMessage.mockClear();

		await act(async () => {
			result.current.setDraft("try to continue");
		});
		await act(async () => {
			await result.current.sendMessage();
		});

		expect(result.current.messages).toEqual(cachedMessages);
		expect(result.current.errorMessage).toBe("chat.session.cachedReadOnly");
		expect(createPersonaChat).not.toHaveBeenCalled();
		expect(streamChatMessage).not.toHaveBeenCalled();
		expect(sendChatMessage).not.toHaveBeenCalled();
	});

	it("removes a stale selected chat when the backend and cache do not have it", async () => {
		mocks.listPersonaChats.mockResolvedValue([
			{
				id: "stale-chat",
				characterId: "aiko",
				createdAt: 1_780_325_300,
				updatedAt: 1_780_325_400,
				lastMessage: "gone"
			}
		]);
		mocks.getChat.mockRejectedValue(new Error("not found"));
		mocks.isNotFound.mockReturnValue(true);
		vi.mocked(readChatMessagesCache).mockReturnValue([]);
		const { result } = renderHook(() => useChatSession());

		await waitFor(() => expect(result.current.sessions).toHaveLength(1));
		await act(async () => {
			await result.current.selectSession("stale-chat");
		});

		expect(result.current.sessions).toEqual([]);
		expect(result.current.errorMessage).toBe("chat.session.notFound");
		expect(syncLocalDeletesNow).toHaveBeenCalled();
	});
});

function message(id: string, author: ChatMessage["author"], text: string): ChatMessage {
	return {
		id,
		author,
		text,
		createdAt: 1_780_325_400,
		time: "12:00"
	};
}
