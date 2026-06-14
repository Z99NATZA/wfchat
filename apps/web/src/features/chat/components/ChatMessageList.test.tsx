/**
 * @vitest-environment happy-dom
 */
import { cleanup, render, screen } from "@testing-library/react";
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
