/**
 * @vitest-environment happy-dom
 */
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import ChatMessageList from "@/features/chat/components/ChatMessageList";
import type { ChatMessage } from "@/types/chat";

vi.mock("@/i18n", () => ({
	useI18n: () => ({
		t: (key: string, params?: Record<string, string | number>) => {
			if (key === "chat.messageList.thinking") {
				return `${params?.name} is thinking...`;
			}
			if (key === "chat.messageList.banner") {
				return `${params?.name} banner`;
			}
			if (key === "chat.messageList.copyAssistantMessage") {
				return "Copy message";
			}
			if (key === "chat.messageList.assistantMessageCopied") {
				return "Copied";
			}
			if (key === "chat.messageList.playAssistantSpeech") {
				return "Play voice";
			}
			if (key === "chat.messageList.stopAssistantSpeech") {
				return "Stop voice";
			}
			if (key === "chat.messageList.retryAssistantSpeech") {
				return "Retry voice";
			}
			if (key === "chat.messageList.loadMarkdownQa") {
				return "Load QA";
			}
			return key;
		}
	})
}));

vi.mock("@/components/dialog/DialogProvider", () => ({
	useDialog: () => ({
		confirm: vi.fn()
	})
}));

describe("ChatMessageList streaming state", () => {
	beforeEach(() => {
		HTMLElement.prototype.scrollTo = vi.fn();
		Object.defineProperty(navigator, "clipboard", {
			configurable: true,
			value: {
				writeText: vi.fn().mockResolvedValue(undefined)
			}
		});
	});

	afterEach(() => {
		cleanup();
	});

	it("shows the thinking bubble while waiting for streaming to start", () => {
		render(
			<ChatMessageList
				messages={[message("local-user", "user", "hello")]}
				companionName="Aiko"
				companionAvatarUrl="/images/aiko-avatar.png"
				isSending
			/>
		);

		expect(screen.getByText("Aiko is thinking...")).toBeTruthy();
	});

	it("does not show a duplicate thinking bubble once the streaming assistant placeholder exists", () => {
		render(
			<ChatMessageList
				messages={[
					message("local-user", "user", "hello"),
					message("local-assistant-1", "companion", "partial")
				]}
				companionName="Aiko"
				companionAvatarUrl="/images/aiko-avatar.png"
				isSending
			/>
		);

		expect(screen.getByText("partial")).toBeTruthy();
		expect(screen.queryByText("Aiko is thinking...")).toBeNull();
	});

	it("uses the streaming assistant placeholder for the thinking text before the first token", () => {
		render(
			<ChatMessageList
				messages={[
					message("local-user", "user", "hello"),
					message("local-assistant-1", "companion", "")
				]}
				companionName="Aiko"
				companionAvatarUrl="/images/aiko-avatar.png"
				isSending
			/>
		);

		expect(screen.getAllByText("Aiko is thinking...")).toHaveLength(1);
	});

	it("keeps user bubbles compact and gives assistant bubbles more readable width", () => {
		const { container } = render(
			<ChatMessageList
				messages={[
					message("user-1", "user", "hello"),
					message("assistant-1", "companion", "| Feature | Status |\n| --- | --- |\n| Markdown | Ready |")
				]}
				companionName="Aiko"
				companionAvatarUrl="/images/aiko-avatar.png"
			/>
		);

		const userBubble = container.querySelector('[data-message-bubble="user"]');
		const assistantBubble = container.querySelector('[data-message-bubble="companion"]');

		expect(userBubble?.className).toContain("sm:max-w-[min(32rem,70%)]");
		expect(assistantBubble?.className).toContain("min-w-0");
		expect(assistantBubble?.className).toContain("sm:max-w-[min(42rem,calc(100%-2.75rem))]");
		expect(assistantBubble?.className).not.toContain("sm:max-w-[min(32rem,70%)]");
	});

	it("reserves bottom space when an overlay clearance is provided", () => {
		const { container } = render(
			<ChatMessageList
				messages={[message("assistant-1", "companion", "hello")]}
				companionName="Aiko"
				companionAvatarUrl="/images/aiko-avatar.png"
				bottomClearancePx={320}
			/>
		);

		const scrollContainer = container.querySelector(".chat-scroll") as HTMLDivElement;

		expect(scrollContainer.style.paddingBottom).toBe("320px");
	});

	it("uses the wider assistant layout for the standalone thinking bubble", () => {
		const { container } = render(
			<ChatMessageList
				messages={[message("local-user", "user", "hello")]}
				companionName="Aiko"
				companionAvatarUrl="/images/aiko-avatar.png"
				isSending
			/>
		);

		const assistantBubble = container.querySelector('[data-message-bubble="companion"]');

		expect(assistantBubble?.className).toContain("min-w-0");
		expect(assistantBubble?.className).toContain("sm:max-w-[min(42rem,calc(100%-2.75rem))]");
	});

	it("copies raw assistant message text", async () => {
		render(
			<ChatMessageList
				messages={[
					message("assistant-1", "companion", "## Heading\n\n- Item")
				]}
				companionName="Aiko"
				companionAvatarUrl="/images/aiko-avatar.png"
			/>
		);

		fireEvent.click(screen.getByRole("button", { name: "Copy message" }));

		expect(navigator.clipboard.writeText).toHaveBeenCalledWith("## Heading\n\n- Item");
		await waitFor(() => expect(screen.getByRole("button", { name: "Copied" })).toBeTruthy());
	});

	it("does not show copy actions on user messages", () => {
		render(
			<ChatMessageList
				messages={[message("user-1", "user", "## User text")]}
				companionName="Aiko"
				companionAvatarUrl="/images/aiko-avatar.png"
			/>
		);

		expect(screen.queryByRole("button", { name: "Copy message" })).toBeNull();
	});

	it("shows assistant speech action for persisted assistant messages when enabled", () => {
		const toggleAssistantSpeech = vi.fn();
		render(
			<ChatMessageList
				messages={[message("assistant-1", "companion", "Hello there")]}
				companionName="Aiko"
				companionAvatarUrl="/images/aiko-avatar.png"
				isAssistantSpeechEnabled
				onToggleAssistantSpeech={toggleAssistantSpeech}
			/>
		);

		fireEvent.click(screen.getByRole("button", { name: "Play voice" }));

		expect(toggleAssistantSpeech).toHaveBeenCalledWith("assistant-1");
	});

	it("shows stop voice label for the active assistant playback", () => {
		render(
			<ChatMessageList
				messages={[message("assistant-1", "companion", "Hello there")]}
				companionName="Aiko"
				companionAvatarUrl="/images/aiko-avatar.png"
				isAssistantSpeechEnabled
				assistantSpeechPlayback={{ messageId: "assistant-1", status: "playing" }}
				onToggleAssistantSpeech={vi.fn()}
			/>
		);

		expect(screen.getByRole("button", { name: "Stop voice" })).toBeTruthy();
	});

	it("does not show assistant speech action for streaming assistant placeholders", () => {
		render(
			<ChatMessageList
				messages={[message("local-assistant-1", "companion", "partial")]}
				companionName="Aiko"
				companionAvatarUrl="/images/aiko-avatar.png"
				isAssistantSpeechEnabled
				onToggleAssistantSpeech={vi.fn()}
				isSending
			/>
		);

		expect(screen.queryByRole("button", { name: "Play voice" })).toBeNull();
	});

	it("does not copy generated thinking text from an empty assistant placeholder", () => {
		render(
			<ChatMessageList
				messages={[
					message("local-user", "user", "hello"),
					message("local-assistant-1", "companion", "")
				]}
				companionName="Aiko"
				companionAvatarUrl="/images/aiko-avatar.png"
				isSending
			/>
		);

		expect(screen.getAllByText("Aiko is thinking...")).toHaveLength(1);
		expect(screen.queryByRole("button", { name: "Copy message" })).toBeNull();
	});

	it("shows the markdown QA loader only when provided", () => {
		const loadMarkdownQaMessages = vi.fn();
		const { rerender } = render(
			<ChatMessageList
				messages={[]}
				companionName="Aiko"
				companionAvatarUrl="/images/aiko-avatar.png"
			/>
		);

		expect(screen.queryByRole("button", { name: "Load QA" })).toBeNull();

		rerender(
			<ChatMessageList
				messages={[]}
				companionName="Aiko"
				companionAvatarUrl="/images/aiko-avatar.png"
				onLoadMarkdownQaMessages={loadMarkdownQaMessages}
			/>
		);

		fireEvent.click(screen.getByRole("button", { name: "Load QA" }));

		expect(loadMarkdownQaMessages).toHaveBeenCalledTimes(1);
	});

	it("mounts only the virtualized window for long conversations", () => {
		const longConversation = Array.from({ length: 80 }, (_, index) =>
			message(`assistant-${index}`, "companion", `message ${index}`)
		);
		const { container } = render(
			<ChatMessageList
				messages={longConversation}
				companionName="Aiko"
				companionAvatarUrl="/images/aiko-avatar.png"
			/>
		);

		const mountedRows = container.querySelectorAll("[data-virtual-message-row]");
		const virtualList = container.querySelector("[data-virtualized-message-list]") as HTMLDivElement;

		expect(mountedRows.length).toBeGreaterThan(0);
		expect(mountedRows.length).toBeLessThan(longConversation.length);
		expect(virtualList.style.height).not.toBe("");
		expect(screen.getByText("message 0")).toBeTruthy();
		expect(screen.queryByText("message 79")).toBeNull();
	});

	it("does not pull back to the latest message after the user scrolls upward near the bottom", async () => {
		const initialMessages = Array.from({ length: 12 }, (_, index) =>
			message(`assistant-${index}`, "companion", `message ${index}`)
		);
		const { container, rerender } = render(
			<ChatMessageList
				messages={initialMessages}
				companionName="Aiko"
				companionAvatarUrl="/images/aiko-avatar.png"
			/>
		);
		const scrollContainer = container.querySelector(".chat-scroll") as HTMLDivElement;

		Object.defineProperty(scrollContainer, "clientHeight", { configurable: true, value: 500 });
		Object.defineProperty(scrollContainer, "scrollHeight", { configurable: true, value: 2_000 });
		scrollContainer.scrollTop = 1_500;
		fireEvent.scroll(scrollContainer);
		await new Promise((resolve) => requestAnimationFrame(resolve));
		vi.mocked(HTMLElement.prototype.scrollTo).mockClear();

		scrollContainer.scrollTop = 1_450;
		fireEvent.scroll(scrollContainer);
		rerender(
			<ChatMessageList
				messages={[...initialMessages, message("assistant-new", "companion", "new message")]}
				companionName="Aiko"
				companionAvatarUrl="/images/aiko-avatar.png"
			/>
		);
		await new Promise((resolve) => requestAnimationFrame(resolve));

		expect(HTMLElement.prototype.scrollTo).not.toHaveBeenCalled();
	});

	it("scrolls to the latest message when switching chats after the user scrolled upward", async () => {
		const firstChatMessages = Array.from({ length: 12 }, (_, index) =>
			message(`first-${index}`, "companion", `first chat message ${index}`)
		);
		const secondChatMessages = Array.from({ length: 12 }, (_, index) =>
			message(`second-${index}`, "companion", `second chat message ${index}`)
		);
		const { container, rerender } = render(
			<ChatMessageList
				activeChatId="first-chat"
				messages={firstChatMessages}
				companionName="Aiko"
				companionAvatarUrl="/images/aiko-avatar.png"
			/>
		);
		const scrollContainer = container.querySelector(".chat-scroll") as HTMLDivElement;

		Object.defineProperty(scrollContainer, "clientHeight", { configurable: true, value: 500 });
		Object.defineProperty(scrollContainer, "scrollHeight", { configurable: true, value: 2_000 });
		scrollContainer.scrollTop = 1_500;
		fireEvent.scroll(scrollContainer);
		await new Promise((resolve) => requestAnimationFrame(resolve));
		vi.mocked(HTMLElement.prototype.scrollTo).mockClear();

		scrollContainer.scrollTop = 1_100;
		fireEvent.scroll(scrollContainer);
		rerender(
			<ChatMessageList
				activeChatId="second-chat"
				messages={secondChatMessages}
				companionName="Aiko"
				companionAvatarUrl="/images/aiko-avatar.png"
			/>
		);
		await new Promise((resolve) => requestAnimationFrame(resolve));

		expect(HTMLElement.prototype.scrollTo).toHaveBeenCalledWith({
			top: scrollContainer.scrollHeight,
			behavior: "auto"
		});
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
