/**
 * @vitest-environment happy-dom
 */
import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
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

describe("useChatSession streaming sendMessage", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		mocks.location.pathname = "/chat";
		mocks.location.search = "";
		mocks.confirm.mockResolvedValue(true);
		mocks.getChatUiConfig.mockResolvedValue({ personas: [persona], quickPrompts: [] });
		mocks.listPersonaChats.mockResolvedValue([]);
		mocks.listMemoryFacts.mockResolvedValue([]);
		mocks.listMemorySummaries.mockResolvedValue([]);
		mocks.createPersonaChat.mockResolvedValue({ chatId: "chat-1", messages: [] });
		mocks.deleteChat.mockResolvedValue(undefined);
		mocks.isNotFound.mockReturnValue(false);
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
			quickPrompts: ["Make it sweeter", "Suggest a reply"]
		});

		const { result } = renderHook(() => useChatSession());

		await waitFor(() =>
			expect(result.current.quickPrompts).toEqual(["Make it sweeter", "Suggest a reply"])
		);
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
