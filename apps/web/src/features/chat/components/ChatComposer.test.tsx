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
		vi.restoreAllMocks();
	});

	function mockMatchMedia(matches: boolean) {
		Object.defineProperty(window, "matchMedia", {
			configurable: true,
			writable: true,
			value: vi.fn().mockImplementation((query: string) => ({
				matches,
				media: query,
				onchange: null,
				addEventListener: vi.fn(),
				removeEventListener: vi.fn(),
				addListener: vi.fn(),
				removeListener: vi.fn(),
				dispatchEvent: vi.fn()
			}))
		});
	}

	function SendingStateComposer({
		initialIsSending,
		onSend = vi.fn()
	}: {
		initialIsSending: boolean;
		onSend?: () => void;
	}) {
		const [isSending, setIsSending] = useState(initialIsSending);

		return (
			<>
				<button type="button" onClick={() => setIsSending(false)}>
					Finish sending
				</button>
				<ChatComposer
					draft="Hello"
					font="inter"
					companionName="Aiko"
					onDraftChange={vi.fn()}
					onSend={onSend}
					isSending={isSending}
				/>
			</>
		);
	}

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

	it("disables browser writing corrections in the message input", () => {
		render(
			<ChatComposer
				draft=""
				font="inter"
				companionName="Aiko"
				onDraftChange={vi.fn()}
				onSend={vi.fn()}
			/>
		);

		const textarea = screen.getByPlaceholderText("Message Aiko") as HTMLTextAreaElement;

		expect(textarea.getAttribute("spellcheck")).toBe("false");
		expect(textarea.getAttribute("autocorrect")).toBe("off");
		expect(textarea.getAttribute("autocapitalize")).toBe("off");
	});

	it("returns focus to the textarea after sending on desktop-like viewports", () => {
		mockMatchMedia(false);
		const focusSpy = vi.spyOn(HTMLTextAreaElement.prototype, "focus");

		render(<SendingStateComposer initialIsSending />);

		fireEvent.click(screen.getByRole("button", { name: "Finish sending" }));

		expect(focusSpy).toHaveBeenCalledWith({ preventScroll: true });
	});

	it("does not automatically focus the textarea after sending on mobile or touch viewports", () => {
		mockMatchMedia(true);
		const focusSpy = vi.spyOn(HTMLTextAreaElement.prototype, "focus");

		render(<SendingStateComposer initialIsSending />);

		fireEvent.click(screen.getByRole("button", { name: "Finish sending" }));

		expect(focusSpy).not.toHaveBeenCalled();
	});
});
