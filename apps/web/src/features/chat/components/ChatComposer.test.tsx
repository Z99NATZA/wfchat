/**
 * @vitest-environment happy-dom
 */
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import ChatComposer from "@/features/chat/components/ChatComposer";

vi.mock("@/i18n", () => ({
	useI18n: () => ({
		t: (key: string, params?: Record<string, string | number>) => {
			if (key === "chat.composer.placeholder") {
				return `Message ${params?.name ?? ""}`;
			}

			return key;
		}
	})
}));

describe("ChatComposer", () => {
	afterEach(() => {
		cleanup();
		vi.clearAllMocks();
	});

	it("fills the draft when a quick prompt is selected without sending", () => {
		const onDraftChange = vi.fn();
		const onSend = vi.fn();

		render(
			<ChatComposer
				draft=""
				font="inter"
				companionName="Aiko"
				quickPrompts={["Make it sweeter", "Suggest a reply"]}
				onDraftChange={onDraftChange}
				onSend={onSend}
			/>
		);

		fireEvent.click(screen.getByRole("button", { name: "Make it sweeter" }));

		expect(onDraftChange).toHaveBeenCalledWith("Make it sweeter");
		expect(onSend).not.toHaveBeenCalled();
	});

	it("places the caret at the end after selecting a quick prompt", async () => {
		function ControlledComposer() {
			const [draft, setDraft] = useState("");

			return (
				<ChatComposer
					draft={draft}
					font="inter"
					companionName="Aiko"
					quickPrompts={["Suggest a reply"]}
					onDraftChange={setDraft}
					onSend={vi.fn()}
				/>
			);
		}

		render(<ControlledComposer />);

		fireEvent.click(screen.getByRole("button", { name: "Suggest a reply" }));

		await new Promise((resolve) => requestAnimationFrame(resolve));

		const textarea = screen.getByPlaceholderText("Message Aiko") as HTMLTextAreaElement;
		expect(textarea.value).toBe("Suggest a reply");
		expect(textarea.selectionStart).toBe("Suggest a reply".length);
		expect(textarea.selectionEnd).toBe("Suggest a reply".length);
	});

	it("disables quick prompts while waiting for an assistant response", () => {
		render(
			<ChatComposer
				draft=""
				font="inter"
				companionName="Aiko"
				quickPrompts={["Suggest a reply"]}
				onDraftChange={vi.fn()}
				onSend={vi.fn()}
				isSending
			/>
		);

		expect((screen.getByRole("button", { name: "Suggest a reply" }) as HTMLButtonElement).disabled).toBe(true);
	});
});
