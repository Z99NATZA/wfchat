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
		const sidebarBody = screen.getByTestId("chat-sidebar-body");
		const chatsSection = screen.getByTestId("chat-sidebar-chats");
		const sessionList = screen.getByTestId("chat-sidebar-session-list");
		const search = screen.getByPlaceholderText("chat.sidebar.searchChats");
		expect(disclosure.hasAttribute("open")).toBe(false);
		expect(disclosure.className).not.toContain("border-");
		expect(disclosure.className).toContain("overflow-y-auto");
		expect(sidebarBody.className).toContain("overflow-hidden");
		expect(sidebarBody.className).not.toContain("overflow-y-auto");
		expect(chatsSection.className).toContain("min-h-0");
		expect(chatsSection.className).toContain("flex-1");
		expect(chatsSection.className).not.toContain("border-");
		expect(chatsSection.contains(search)).toBe(true);
		expect(chatsSection.contains(sessionList)).toBe(true);
		expect(sessionList.className).toContain("overflow-y-auto");
		expect(chatsSection.textContent).toContain("chat.sidebar.chats");
		expect(chatsSection.textContent).toContain("chat.sidebar.newChat");
		expect(screen.queryByText("chat.sidebar.moodSync")).toBeNull();
		expect(disclosure.textContent).toContain("chat.details.about");
		expect(disclosure.textContent).toContain("chat.details.profile");
		expect(disclosure.textContent).toContain("chat.details.birthday");
		expect(disclosure.textContent).toContain("2000-05-27");
		expect(disclosure.textContent).toContain("chat.details.height");
		expect(disclosure.textContent).toContain("175 cm");
		expect(disclosure.textContent).toContain("chat.details.weight");
		expect(disclosure.textContent).toContain("58 kg");
		expect(disclosure.textContent).not.toContain("chat.details.aboutText");
		expect(disclosure.textContent).not.toContain("chat.details.tone");
		expect(disclosure.textContent).not.toContain("chat.details.conversation");
		const personaDetails = screen.getByTestId("chat-persona-details");
		const profileFacts = screen.getByTestId("chat-persona-profile-facts");
		expect(disclosure.contains(personaDetails)).toBe(true);
		expect(personaDetails.textContent).not.toContain(persona.name);
		expect(personaDetails.textContent).not.toContain(persona.title);
		expect(profileFacts.querySelector("svg")).toBeNull();
		expect(profileFacts.querySelectorAll("dt")).toHaveLength(3);
		expect(profileFacts.querySelectorAll("dd")).toHaveLength(3);
		expect(profileFacts.querySelector("[class*='border']")).toBeNull();
		expect(profileFacts.querySelector("[class*='bg-app-soft']")).toBeNull();

		fireEvent.click(disclosure.querySelector("summary")!);

		expect(disclosure.hasAttribute("open")).toBe(true);
	});
});
