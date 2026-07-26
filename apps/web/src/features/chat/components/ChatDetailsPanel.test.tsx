/**
 * @vitest-environment happy-dom
 */
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import ChatDetailsPanel from "@/features/chat/components/ChatDetailsPanel";

describe("ChatDetailsPanel", () => {
	afterEach(cleanup);

	it("keeps the page-owned right rail empty and desktop-only", () => {
		render(
			<ChatDetailsPanel
				persona={{
					id: "aiko",
					name: "Aiko",
					title: "Calm anime companion",
					status: "Online",
					lastMessage: "Ready",
					lastActiveAt: "Now",
					unreadCount: 0,
					avatarUrl: "/images/aiko-avatar.png"
				}}
			/>
		);

		const details = screen.getByTestId("chat-details-panel");
		expect(details.childElementCount).toBe(0);
		expect(details.className).toContain("hidden");
		expect(details.className).toContain("w-14");
		expect(details.className).toContain("xl:flex");
		expect(details.dataset.personaId).toBe("aiko");
	});
});
