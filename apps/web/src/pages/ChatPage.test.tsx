/**
 * @vitest-environment happy-dom
 */
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import ChatPage from "@/pages/ChatPage";

const mocks = vi.hoisted(() => ({
	useChatSession: vi.fn(),
	notifyAvatarChatEvent: vi.fn()
}));

vi.mock("@/layouts/AppLayout", () => ({
	default: ({
		children,
		details,
		header,
		sidebar
	}: {
		children: ReactNode;
		details: ReactNode;
		header: ReactNode;
		sidebar: ReactNode;
	}) => (
		<div>
			<div>{sidebar}</div>
			<div>{header}</div>
			<div>{details}</div>
			{children}
		</div>
	)
}));

vi.mock("@/features/avatar/components/AvatarOverlay", () => ({
	default: () => <div data-testid="avatar-overlay" />
}));

vi.mock("@/features/avatar/runtime/avatarChatBridge", () => ({
	useAvatarChatBridge: () => ({
		notifyAvatarChatEvent: mocks.notifyAvatarChatEvent
	})
}));

vi.mock("@/features/chat/hooks/useChatSession", () => ({
	useChatSession: mocks.useChatSession
}));

vi.mock("@/features/chat/components/ChatSidebar", () => ({
	default: () => <div data-testid="chat-sidebar" />
}));

vi.mock("@/features/chat/components/ChatHeader", () => ({
	default: () => <div data-testid="chat-header" />
}));

vi.mock("@/features/chat/components/ChatDetailsPanel", () => ({
	default: () => <div data-testid="chat-details" />
}));

vi.mock("@/features/chat/components/ChatComposer", () => ({
	default: ({ isUserSpeechInputEnabled }: { isUserSpeechInputEnabled?: boolean }) => (
		<div
			data-testid="chat-composer"
			data-user-speech-input-enabled={String(isUserSpeechInputEnabled)}
		/>
	)
}));

vi.mock("@/features/chat/components/ChatMessageList", () => ({
	default: ({ isAssistantSpeechEnabled }: { isAssistantSpeechEnabled?: boolean }) => (
		<div
			data-assistant-speech-enabled={String(isAssistantSpeechEnabled)}
			data-testid="chat-message-list"
		/>
	)
}));

const auth = {
	isAuthenticated: false,
	isLoading: false,
	hasPendingGuestSync: false,
	user: null,
	profileLabel: "Guest",
	loginGoogleWithIdToken: vi.fn(),
	logout: vi.fn(),
	markGuestSyncDone: vi.fn(),
	updateProfile: vi.fn()
};

describe("ChatPage assistant speech visibility", () => {
	afterEach(() => {
		cleanup();
		vi.clearAllMocks();
	});

	it("enables assistant speech actions when backend and user preference both allow it", () => {
		mocks.useChatSession.mockReturnValue(chatState({ isAssistantSpeechEnabled: true }));

		renderChatPage({ isAssistantSpeechVisible: true });

		expect(screen.getByTestId("chat-message-list").dataset.assistantSpeechEnabled).toBe("true");
	});

	it("hides assistant speech actions when user preference is disabled", () => {
		mocks.useChatSession.mockReturnValue(chatState({ isAssistantSpeechEnabled: true }));

		renderChatPage({ isAssistantSpeechVisible: false });

		expect(screen.getByTestId("chat-message-list").dataset.assistantSpeechEnabled).toBe(
			"false"
		);
	});

	it("hides assistant speech actions when backend speech support is unavailable", () => {
		mocks.useChatSession.mockReturnValue(chatState({ isAssistantSpeechEnabled: false }));

		renderChatPage({ isAssistantSpeechVisible: true });

		expect(screen.getByTestId("chat-message-list").dataset.assistantSpeechEnabled).toBe(
			"false"
		);
	});

	it("enables user speech input in the composer when backend support is available", () => {
		mocks.useChatSession.mockReturnValue(
			chatState({ isAssistantSpeechEnabled: false, isUserTranscriptionEnabled: true })
		);

		renderChatPage({ isAssistantSpeechVisible: true });

		expect(screen.getByTestId("chat-composer").dataset.userSpeechInputEnabled).toBe("true");
	});

	it("hides user speech input in read-only chats", () => {
		mocks.useChatSession.mockReturnValue(
			chatState({
				isAssistantSpeechEnabled: false,
				isActiveChatReadOnly: true,
				isUserTranscriptionEnabled: true
			})
		);

		renderChatPage({ isAssistantSpeechVisible: true });

		expect(screen.getByTestId("chat-composer").dataset.userSpeechInputEnabled).toBe("false");
	});

	it("does not auto-play the latest assistant message when auto-play is disabled", () => {
		const toggleAssistantSpeech = vi.fn();

		mocks.useChatSession.mockReturnValue(
			chatState({
				isAssistantSpeechEnabled: true,
				isSending: true,
				toggleAssistantSpeech
			})
		);

		const { rerender } = renderChatPage({
			isAssistantSpeechVisible: true,
			isAssistantSpeechAutoPlayEnabled: false
		});

		mocks.useChatSession.mockReturnValue(
			chatState({
				isAssistantSpeechEnabled: true,
				isSending: false,
				messages: [assistantMessage({ id: "assistant-1", text: "Done." })],
				toggleAssistantSpeech
			})
		);

		rerenderChatPage(rerender, {
			isAssistantSpeechVisible: true,
			isAssistantSpeechAutoPlayEnabled: false
		});

		expect(toggleAssistantSpeech).not.toHaveBeenCalled();
	});

	it("auto-plays the latest final assistant message when enabled", async () => {
		const toggleAssistantSpeech = vi.fn();

		mocks.useChatSession.mockReturnValue(
			chatState({
				isAssistantSpeechEnabled: true,
				isSending: true,
				toggleAssistantSpeech
			})
		);

		const { rerender } = renderChatPage({
			isAssistantSpeechVisible: true,
			isAssistantSpeechAutoPlayEnabled: true
		});

		mocks.useChatSession.mockReturnValue(
			chatState({
				isAssistantSpeechEnabled: true,
				isSending: false,
				messages: [assistantMessage({ id: "assistant-1", text: "Done." })],
				toggleAssistantSpeech
			})
		);

		rerenderChatPage(rerender, {
			isAssistantSpeechVisible: true,
			isAssistantSpeechAutoPlayEnabled: true
		});

		await waitFor(() => expect(toggleAssistantSpeech).toHaveBeenCalledWith("assistant-1"));
	});

	it("does not auto-play when backend speech support is unavailable", () => {
		const toggleAssistantSpeech = vi.fn();

		mocks.useChatSession.mockReturnValue(
			chatState({
				isAssistantSpeechEnabled: false,
				isSending: true,
				toggleAssistantSpeech
			})
		);

		const { rerender } = renderChatPage({
			isAssistantSpeechVisible: true,
			isAssistantSpeechAutoPlayEnabled: true
		});

		mocks.useChatSession.mockReturnValue(
			chatState({
				isAssistantSpeechEnabled: false,
				isSending: false,
				messages: [assistantMessage({ id: "assistant-1", text: "Done." })],
				toggleAssistantSpeech
			})
		);

		rerenderChatPage(rerender, {
			isAssistantSpeechVisible: true,
			isAssistantSpeechAutoPlayEnabled: true
		});

		expect(toggleAssistantSpeech).not.toHaveBeenCalled();
	});

	it("does not auto-play streaming placeholder assistant messages", () => {
		const toggleAssistantSpeech = vi.fn();

		mocks.useChatSession.mockReturnValue(
			chatState({
				isAssistantSpeechEnabled: true,
				isSending: true,
				toggleAssistantSpeech
			})
		);

		const { rerender } = renderChatPage({
			isAssistantSpeechVisible: true,
			isAssistantSpeechAutoPlayEnabled: true
		});

		mocks.useChatSession.mockReturnValue(
			chatState({
				isAssistantSpeechEnabled: true,
				isSending: false,
				messages: [assistantMessage({ id: "local-assistant-1", text: "Streaming..." })],
				toggleAssistantSpeech
			})
		);

		rerenderChatPage(rerender, {
			isAssistantSpeechVisible: true,
			isAssistantSpeechAutoPlayEnabled: true
		});

		expect(toggleAssistantSpeech).not.toHaveBeenCalled();
	});
});

type RenderChatPageOptions = {
	isAssistantSpeechVisible: boolean;
	isAssistantSpeechAutoPlayEnabled?: boolean;
};

function renderChatPage({
	isAssistantSpeechVisible,
	isAssistantSpeechAutoPlayEnabled = false
}: RenderChatPageOptions) {
	return render(chatPageElement({ isAssistantSpeechVisible, isAssistantSpeechAutoPlayEnabled }));
}

function rerenderChatPage(
	rerender: ReturnType<typeof render>["rerender"],
	{ isAssistantSpeechVisible, isAssistantSpeechAutoPlayEnabled = false }: RenderChatPageOptions
) {
	rerender(chatPageElement({ isAssistantSpeechVisible, isAssistantSpeechAutoPlayEnabled }));
}

function chatPageElement({
	isAssistantSpeechVisible,
	isAssistantSpeechAutoPlayEnabled
}: Required<RenderChatPageOptions>) {
	return (
		<ChatPage
			activityBar={null}
			theme="light"
			font="inter"
			backgroundImageUrl=""
			isAvatarOverlayVisible={false}
			isAssistantSpeechVisible={isAssistantSpeechVisible}
			isAssistantSpeechAutoPlayEnabled={isAssistantSpeechAutoPlayEnabled}
			avatarOverlayPosition="bottom-right"
			avatarOverlaySize="small"
			auth={auth}
			onFontChange={vi.fn()}
			onOpenProfile={vi.fn()}
			onOpenSettings={vi.fn()}
			onToggleTheme={vi.fn()}
			onChatSyncSnapshotChange={vi.fn()}
		/>
	);
}

type ChatStateOptions = {
	isAssistantSpeechEnabled: boolean;
	isActiveChatReadOnly?: boolean;
	isUserTranscriptionEnabled?: boolean;
	isSending?: boolean;
	messages?: ReturnType<typeof assistantMessage>[];
	toggleAssistantSpeech?: ReturnType<typeof vi.fn>;
};

function chatState({
	isAssistantSpeechEnabled,
	isActiveChatReadOnly = false,
	isUserTranscriptionEnabled = false,
	isSending = false,
	messages = [],
	toggleAssistantSpeech = vi.fn()
}: ChatStateOptions) {
	return {
		activePersona: {
			id: "aiko",
			name: "Aiko",
			title: "Calm anime companion",
			status: "Online",
			lastMessage: "Ready",
			lastActiveAt: "Now",
			unreadCount: 0,
			avatarUrl: "/images/aiko-avatar.png"
		},
		activeChatId: "chat-1",
		clearChat: vi.fn(),
		closeSidebar: vi.fn(),
		createNewSession: vi.fn(),
		draft: "",
		errorMessage: null,
		isActiveChatReadOnly,
		isAssistantSpeechEnabled,
		isUserTranscriptionEnabled,
		assistantSpeechPlayback: { messageId: null, status: "idle" },
		userSpeechInput: { status: "idle" },
		isClearing: false,
		isCreatingSession: false,
		isSavingMemoryFact: false,
		isSavingMemorySummary: false,
		isSidebarOpen: false,
		isSending,
		memoryFacts: [],
		memorySummaries: [],
		messages,
		openSidebar: vi.fn(),
		quickPrompts: [],
		refreshRemoteState: vi.fn(),
		isMarkdownQaEnabled: false,
		loadMarkdownQaMessages: vi.fn(),
		resetToDraft: vi.fn(),
		personas: [],
		chatSearchQuery: "",
		selectPersona: vi.fn(),
		selectSession: vi.fn(),
		sendMessage: vi.fn(),
		sessions: [],
		setDraft: vi.fn(),
		toggleAssistantSpeech,
		cancelUserSpeechInput: vi.fn(),
		toggleUserSpeechInput: vi.fn(),
		setChatSearchQuery: vi.fn(),
		saveMemoryFact: vi.fn(),
		saveMemorySummary: vi.fn(),
		removeMemoryFact: vi.fn(),
		removeMemorySummary: vi.fn(),
		editMemoryFact: vi.fn(),
		editMemorySummary: vi.fn(),
		removeSession: vi.fn()
	};
}

function assistantMessage({ id, text }: { id: string; text: string }) {
	return {
		id,
		author: "companion" as const,
		text,
		createdAt: "2026-01-01T00:00:00.000Z"
	};
}
