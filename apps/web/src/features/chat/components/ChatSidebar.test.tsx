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

	it("starts with compact persona details and omits the companion summary card", () => {
		render(
			<ChatSidebar
				sessions={[]}
				activeSessionId={null}
				activePersona={persona}
				isOpen={false}
				searchQuery=""
				onCreateSession={vi.fn()}
				onSearchQueryChange={vi.fn()}
				onCloseSidebar={vi.fn()}
				onDeleteSession={vi.fn(async () => undefined)}
				onSelectSession={vi.fn()}
			/>
		);

		const disclosure = screen.getByTestId("chat-sidebar-persona-details");
		const sidebar = screen.getByRole("complementary");
		const sidebarBody = screen.getByTestId("chat-sidebar-body");
		const chatsSection = screen.getByTestId("chat-sidebar-chats");
		const sessionList = screen.getByTestId("chat-sidebar-session-list");
		const search = screen.getByPlaceholderText("chat.sidebar.searchChats");
		expect(disclosure.hasAttribute("open")).toBe(false);
		expect(sidebar.className).toContain("left-12");
		expect(sidebar.className).toContain("sm:left-14");
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
		expect(screen.queryByAltText("Aiko avatar")).toBeNull();
		expect(screen.queryByText("Ready when you are.")).toBeNull();
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

	it("gives the active chat a clear border and filled surface in both themes", () => {
		render(
			<ChatSidebar
				sessions={[
					{
						id: "chat-1",
						characterId: persona.id,
						createdAt: 1,
						updatedAt: 1,
						lastMessage: "Current conversation"
					}
				]}
				activeSessionId="chat-1"
				activePersona={persona}
				isOpen={false}
				searchQuery=""
				onCreateSession={vi.fn()}
				onSearchQueryChange={vi.fn()}
				onCloseSidebar={vi.fn()}
				onDeleteSession={vi.fn(async () => undefined)}
				onSelectSession={vi.fn()}
			/>
		);

		const activeChat = screen.getByRole("button", {
			name: /Current conversation/
		}).parentElement;

		expect(activeChat?.className).toContain("border-primary/50");
		expect(activeChat?.className).toContain("bg-primary/15");
		expect(activeChat?.className).toContain("dark:border-action-border");
		expect(activeChat?.className).toContain("dark:bg-action-hover");
	});

	it("shows delete failure beside the chat action area with neutral tokens", () => {
		render(
			<ChatSidebar
				sessions={[]}
				activeSessionId={null}
				activePersona={persona}
				isOpen={false}
				searchQuery=""
				actionErrorMessage="Delete failed"
				onCreateSession={vi.fn()}
				onSearchQueryChange={vi.fn()}
				onCloseSidebar={vi.fn()}
				onDeleteSession={vi.fn(async () => undefined)}
				onSelectSession={vi.fn()}
			/>
		);

		const status = screen.getByRole("status");
		expect(status.textContent).toBe("Delete failed");
		expect(status.className).toContain("border-app-border");
		expect(status.className).toContain("text-muted");
		expect(status.className).not.toContain("red");
	});
});
