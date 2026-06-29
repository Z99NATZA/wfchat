/**
 * @vitest-environment happy-dom
 */
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
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
		vi.useRealTimers();
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

	it("keeps voice input disabled when transcription is unavailable", () => {
		render(
			<ChatComposer
				draft=""
				font="inter"
				companionName="Aiko"
				onDraftChange={vi.fn()}
				onSend={vi.fn()}
			/>
		);

		expect((screen.getByRole("button", { name: "chat.composer.voiceMessage" }) as HTMLButtonElement).disabled).toBe(true);
	});

	it("starts voice input when transcription is available", () => {
		const onToggleSpeechInput = vi.fn();

		render(
			<ChatComposer
				draft=""
				font="inter"
				companionName="Aiko"
				isUserSpeechInputEnabled
				onDraftChange={vi.fn()}
				onSend={vi.fn()}
				onToggleSpeechInput={onToggleSpeechInput}
			/>
		);

		fireEvent.click(screen.getByRole("button", { name: "chat.composer.voiceMessage" }));

		expect(onToggleSpeechInput).toHaveBeenCalledTimes(1);
	});

	it("shows stop, cancel, and compact elapsed recording feedback while recording voice input", () => {
		const onToggleSpeechInput = vi.fn();
		const onCancelSpeechInput = vi.fn();
		vi.useFakeTimers();
		vi.setSystemTime(new Date("2026-06-28T00:00:00.000Z"));

		render(
			<ChatComposer
				draft=""
				font="inter"
				companionName="Aiko"
				isUserSpeechInputEnabled
				userSpeechInput={{ status: "recording" }}
				onDraftChange={vi.fn()}
				onSend={vi.fn()}
				onCancelSpeechInput={onCancelSpeechInput}
				onToggleSpeechInput={onToggleSpeechInput}
			/>
		);

		fireEvent.click(screen.getByRole("button", { name: "chat.composer.stopVoiceMessage" }));
		fireEvent.click(screen.getByRole("button", { name: "chat.composer.cancelVoiceMessage" }));

		const status = screen.getByRole("status", { name: "chat.composer.recordingVoiceMessage" });
		expect(status.textContent).toBe("0:00");
		expect(status.textContent).not.toContain("chat.composer.recordingVoiceMessage");
		expect(screen.getByTestId("chat-composer-recording-timer")).toBeTruthy();
		expect(screen.getByTestId("chat-composer-speech-cancel").className).toContain("icon-button--sm");
		expect(onToggleSpeechInput).toHaveBeenCalledTimes(1);
		expect(onCancelSpeechInput).toHaveBeenCalledTimes(1);
	});

	it("does not render extra speech status or cancel controls when voice input is idle", () => {
		render(
			<ChatComposer
				draft=""
				font="inter"
				companionName="Aiko"
				isUserSpeechInputEnabled
				onDraftChange={vi.fn()}
				onSend={vi.fn()}
			/>
		);

		expect(screen.queryByTestId("chat-composer-recording-timer")).toBeNull();
		expect(screen.queryByTestId("chat-composer-speech-cancel")).toBeNull();
		expect(screen.queryByRole("status")).toBeNull();
		expect(screen.queryByRole("button", { name: "chat.composer.cancelVoiceMessage" })).toBeNull();
	});

	it("shows a specific microphone permission error", () => {
		render(
			<ChatComposer
				draft=""
				font="inter"
				companionName="Aiko"
				isUserSpeechInputEnabled
				userSpeechInput={{
					errorDetail: "NotAllowedError: Permission denied",
					errorReason: "permission",
					status: "error"
				}}
				onDraftChange={vi.fn()}
				onSend={vi.fn()}
			/>
		);

		const alert = screen.getByRole("alert");

		expect(alert.textContent).toContain("chat.composer.voiceMessagePermissionFailed");
		expect(alert.getAttribute("aria-label")).toContain("NotAllowedError");
	});

	it("adds and removes selected image previews", () => {
		const { revokeObjectUrl } = installObjectUrlMocks("blob:image-preview");
		const { container } = render(
			<ChatComposer
				draft=""
				font="inter"
				companionName="Aiko"
				onDraftChange={vi.fn()}
				onSend={vi.fn()}
			/>
		);
		const input = container.querySelector('input[type="file"]') as HTMLInputElement;
		const file = new File(["image"], "local.png", { type: "image/png" });

		fireEvent.change(input, { target: { files: [file] } });
		fireEvent.click(screen.getByRole("button", { name: "chat.composer.removeImageAttachment" }));

		expect(screen.queryByAltText("local.png")).toBeNull();
		expect(revokeObjectUrl).toHaveBeenCalledWith("blob:image-preview");
	});

	it("sends image-only messages and clears previews after success", async () => {
		const { revokeObjectUrl } = installObjectUrlMocks("blob:image-preview");
		const onSend = vi.fn().mockResolvedValue(true);
		const { container } = render(
			<ChatComposer
				draft=""
				font="inter"
				companionName="Aiko"
				onDraftChange={vi.fn()}
				onSend={onSend}
			/>
		);
		const input = container.querySelector('input[type="file"]') as HTMLInputElement;
		const file = new File(["image"], "local.png", { type: "image/png" });

		fireEvent.change(input, { target: { files: [file] } });
		fireEvent.click(screen.getByRole("button", { name: "chat.composer.sendMessage" }));

		await waitFor(() => expect(onSend).toHaveBeenCalledTimes(1));
		expect(onSend).toHaveBeenCalledWith([
			expect.objectContaining({
				file,
				kind: "image",
				name: "local.png",
				previewUrl: "blob:image-preview"
			})
		]);
		await waitFor(() => expect(screen.queryByAltText("local.png")).toBeNull());
		expect(revokeObjectUrl).toHaveBeenCalledWith("blob:image-preview");
	});

	it("rejects unsupported local image types before sending", () => {
		const onSend = vi.fn();
		const { container } = render(
			<ChatComposer
				draft=""
				font="inter"
				companionName="Aiko"
				onDraftChange={vi.fn()}
				onSend={onSend}
			/>
		);
		const input = container.querySelector('input[type="file"]') as HTMLInputElement;
		const file = new File(["<svg />"], "local.svg", { type: "image/svg+xml" });

		fireEvent.change(input, { target: { files: [file] } });

		expect(screen.getByRole("alert").textContent).toBe("chat.composer.imageUnsupported");
		expect(onSend).not.toHaveBeenCalled();
	});
});

function installObjectUrlMocks(previewUrl: string) {
	const createObjectUrl = vi.fn(() => previewUrl);
	const revokeObjectUrl = vi.fn();
	Object.defineProperty(URL, "createObjectURL", {
		configurable: true,
		value: createObjectUrl
	});
	Object.defineProperty(URL, "revokeObjectURL", {
		configurable: true,
		value: revokeObjectUrl
	});
	return { createObjectUrl, revokeObjectUrl };
}
