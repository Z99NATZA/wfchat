/**
 * @vitest-environment happy-dom
 */
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import ChatSidebar from "@/features/chat/components/ChatSidebar";
import type { ChatPersona } from "@/types/chat";

vi.mock("@/i18n/i18nContext", () => ({
	useI18n: () => ({
		locale: "en",
		t: (key: string) => key
	})
}));

const persona: ChatPersona = {
	id: "aiko",
	name: "Aiko",
	title: "Calm anime companion",
	status: "Online",
	lastMessage: "Ready when you are.",
	lastActiveAt: "Now",
	unreadCount: 0,
	avatarUrl: "/images/aiko-avatar.png"
};

describe("ChatSidebar", () => {
	afterEach(cleanup);

	it("keeps persona details in a compact sidebar disclosure", () => {
		render(
			<ChatSidebar
				personas={[persona]}
				sessions={[]}
				activeSessionId={null}
				activePersona={persona}
				activePersonaId={persona.id}
				isOpen={false}
				searchQuery=""
				onCreateSession={vi.fn()}
				onSearchQueryChange={vi.fn()}
				onCloseSidebar={vi.fn()}
				onDeleteSession={vi.fn(async () => undefined)}
				onSelectPersona={vi.fn()}
				onSelectSession={vi.fn()}
			/>
		);

		const disclosure = screen.getByTestId("chat-sidebar-persona-details");
		expect(disclosure.hasAttribute("open")).toBe(false);
		expect(disclosure.textContent).toContain("chat.details.about");
		expect(disclosure.textContent).toContain("chat.details.aboutText");
		expect(disclosure.textContent).toContain("chat.details.tone");
		expect(disclosure.textContent).toContain("chat.details.conversation");
		expect(disclosure.contains(screen.getByTestId("chat-persona-details"))).toBe(true);

		fireEvent.click(disclosure.querySelector("summary")!);

		expect(disclosure.hasAttribute("open")).toBe(true);
	});
});
