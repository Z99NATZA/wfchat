/**
 * @vitest-environment happy-dom
 */
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import ChatMessageList from "@/features/chat/components/ChatMessageList";
import { fetchChatAttachmentPreview } from "@/features/chat/services/chatApiService";
import type { ChatMessage } from "@/types/chat";

const dialogMocks = vi.hoisted(() => ({
	confirm: vi.fn(),
	openCustom: vi.fn()
}));

vi.mock("@/i18n/i18nContext", () => ({
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
			if (key === "chat.messageList.assistantSpeechFailed") {
				return "Voice failed";
			}
			if (key === "chat.messageList.imageAttachmentAlt") {
				return `Image ${params?.index}`;
			}
			if (key === "chat.messageList.imageAttachmentMissing") {
				return "Image unavailable";
			}
			if (key === "chat.messageList.openImagePreview") {
				return `Open preview for ${params?.label}`;
			}
			if (key === "chat.imageLightbox.title") {
				return "Image preview";
			}
			if (key === "chat.imageLightbox.position") {
				return `Image ${params?.current} of ${params?.total}`;
			}
			if (key === "chat.imageLightbox.previous") {
				return "Previous image";
			}
			if (key === "chat.imageLightbox.next") {
				return "Next image";
			}
			if (key === "chat.imageLightbox.close") {
				return "Close image preview";
			}
			if (key === "chat.imageLightbox.showImage") {
				return `Show image ${params?.index}`;
			}
			if (key === "chat.messageList.loadMarkdownQa") {
				return "Load QA";
			}
			return key;
		}
	})
}));

vi.mock("@/components/dialog/DialogContext", () => ({
	useDialog: () => ({
		confirm: dialogMocks.confirm,
		openCustom: dialogMocks.openCustom
	})
}));

vi.mock("@/features/chat/services/chatApiService", () => ({
	fetchChatAttachmentPreview: vi.fn()
}));

describe("ChatMessageList streaming state", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		HTMLElement.prototype.scrollTo = vi.fn();
		vi.mocked(fetchChatAttachmentPreview).mockResolvedValue(
			new Blob(["image"], { type: "image/png" })
		);
		Object.defineProperty(URL, "createObjectURL", {
			configurable: true,
			value: vi.fn(() => "blob:fetched-preview")
		});
		Object.defineProperty(URL, "revokeObjectURL", {
			configurable: true,
			value: vi.fn()
		});
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

	it("shows only the prompt in an empty chat", () => {
		render(
			<ChatMessageList
				messages={[]}
				companionName="Aiko"
				companionAvatarUrl="/images/aiko-avatar.png"
			/>
		);

		expect(screen.getByText("chat.messageList.emptyDesc")).toBeTruthy();
		expect(screen.queryByText("chat.messageList.emptyTitle")).toBeNull();
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

	it("keeps user bubbles compact and renders assistant content flat at full row width", () => {
		const { container } = render(
			<ChatMessageList
				messages={[
					message("user-1", "user", "hello"),
					message(
						"assistant-1",
						"companion",
						"| Feature | Status |\n| --- | --- |\n| Markdown | Ready |"
					)
				]}
				companionName="Aiko"
				companionAvatarUrl="/images/aiko-avatar.png"
			/>
		);

		const userBubble = container.querySelector('[data-message-bubble="user"]');
		const userLayout = container.querySelector('[data-user-message-layout="separated"]');
		const assistantBubble = container.querySelector('[data-message-bubble="companion"]');
		const scrollContainer = container.querySelector(".chat-scroll");

		expect(userLayout?.className).toContain("sm:max-w-[min(32rem,70%)]");
		expect(userBubble?.className).toContain("max-w-full");
		expect(userBubble?.className).toContain("rounded-lg");
		expect(userBubble?.className).toContain("px-3");
		expect(userBubble?.className).toContain("sm:px-4");
		expect(userBubble?.className).toContain("py-2.5");
		expect(userBubble?.className).toContain("sm:py-3");
		expect(userBubble?.className).toContain("bg-primary");
		expect(userBubble?.className).toContain("text-primary-text");
		expect(userBubble?.className).not.toContain("text-white");
		expect(assistantBubble?.className).toContain("min-w-0");
		expect(assistantBubble?.className).toContain("flex-1");
		expect(assistantBubble?.className).not.toContain("rounded-lg");
		expect(assistantBubble?.className).not.toContain("border-app-border");
		expect(assistantBubble?.className).not.toContain("bg-app-panel/92");
		expect(assistantBubble?.className).not.toContain("px-4");
		expect(scrollContainer?.className).toContain("px-3");
		expect(scrollContainer?.className).toContain("sm:px-4");
		expect(scrollContainer?.className).toContain("py-4");
		expect(scrollContainer?.className).toContain("sm:py-6");
	});

	it("uses the semantic app border for the chat banner in both themes", () => {
		render(
			<ChatMessageList
				messages={[]}
				companionName="Aiko"
				companionAvatarUrl="/images/aiko-avatar.png"
			/>
		);

		const banner = screen.getByText("Aiko banner").parentElement;

		expect(banner?.className).toContain("border-app-border");
		expect(banner?.className).not.toContain("border-primary/20");
		expect(banner?.className).not.toContain("dark:border-");
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

	it("uses the flat full-width assistant layout for the standalone thinking state", () => {
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
		expect(assistantBubble?.className).toContain("flex-1");
		expect(assistantBubble?.className).not.toContain("rounded-lg");
		expect(assistantBubble?.className).not.toContain("bg-app-panel/92");
		expect(assistantBubble?.className).not.toContain("px-4");
	});

	it("renders recoverable feedback as a normal companion bubble with retry", () => {
		const onRetryError = vi.fn();
		const { container } = render(
			<ChatMessageList
				messages={[message("local-user", "user", "hello")]}
				companionName="Aiko"
				companionAvatarUrl="/images/aiko-avatar.png"
				errorMessage="Please wait and try again"
				onRetryError={onRetryError}
			/>
		);

		const notice = screen.getByTestId("chat-companion-notice");
		const bubble = notice.querySelector('[data-message-bubble="companion"]');
		expect(notice.querySelector("img")?.getAttribute("src")).toBe("/images/aiko-avatar.png");
		expect(bubble?.className).toContain("text-app-text");
		expect(notice.className).not.toContain("red");
		expect(notice.querySelector("[class*='red']")).toBeNull();

		fireEvent.click(screen.getByRole("button", { name: "chat.messageList.retryMessage" }));
		expect(onRetryError).toHaveBeenCalledTimes(1);
		expect(container.textContent).toContain("Please wait and try again");
	});

	it("copies raw assistant message text", async () => {
		render(
			<ChatMessageList
				messages={[message("assistant-1", "companion", "## Heading\n\n- Item")]}
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

	it("fetches and renders user image attachments separately from the text bubble", async () => {
		const { container } = render(
			<ChatMessageList
				messages={[
					{
						...message("user-1", "user", "look"),
						attachments: [
							{
								id: "attachment-1",
								kind: "image",
								mimeType: "image/png",
								byteSize: 12,
								width: 2,
								height: 3,
								previewUrl:
									"http://localhost:8080/api/chat/attachments/attachment-1/preview"
							}
						]
					}
				]}
				companionName="Aiko"
				companionAvatarUrl="/images/aiko-avatar.png"
			/>
		);

		const image = (await screen.findByRole("img", { name: "Image 1" })) as HTMLImageElement;
		const gallery = container.querySelector('[data-message-attachments="user"]');
		const bubble = container.querySelector('[data-message-bubble="user"]');

		expect(fetchChatAttachmentPreview).toHaveBeenCalledWith("attachment-1");
		expect(image.src).toBe("blob:fetched-preview");
		expect(gallery).toBeTruthy();
		expect(bubble).toBeTruthy();
		expect(bubble?.contains(gallery)).toBe(false);
		expect(bubble?.textContent).toContain("look");
	});

	it.each([1, 2, 3, 4])(
		"lays out a separated user gallery containing %i image(s)",
		(attachmentCount) => {
			const { container } = render(
				<ChatMessageList
					messages={[
						{
							...message("user-1", "user", "gallery"),
							attachments: imageAttachments(attachmentCount)
						}
					]}
					companionName="Aiko"
					companionAvatarUrl="/images/aiko-avatar.png"
				/>
			);

			const gallery = container.querySelector('[data-message-attachments="user"]');
			const previewButtons = gallery?.querySelectorAll("button");

			expect(gallery?.getAttribute("data-attachment-count")).toBe(String(attachmentCount));
			expect(previewButtons).toHaveLength(attachmentCount);
			expect(gallery?.className).toContain(
				attachmentCount === 1 ? "grid-cols-1" : "grid-cols-2"
			);

			if (attachmentCount === 3) {
				expect(previewButtons?.[0].className).toContain("col-span-2");
				expect(previewButtons?.[0].className).toContain("aspect-[2/1]");
			}
		}
	);

	it("shows image-only message time below the gallery without an empty text bubble", () => {
		const { container } = render(
			<ChatMessageList
				messages={[
					{
						...message("user-1", "user", ""),
						attachments: imageAttachments(1)
					}
				]}
				companionName="Aiko"
				companionAvatarUrl="/images/aiko-avatar.png"
			/>
		);

		const gallery = container.querySelector('[data-message-attachments="user"]');
		const messageTime = container.querySelector('[data-message-time="user"]');

		expect(gallery).toBeTruthy();
		expect(messageTime?.textContent).toBe("12:00");
		expect(container.querySelector('[data-message-bubble="user"]')).toBeNull();
	});

	it("opens successful sent image attachments in an in-app preview dialog", async () => {
		render(
			<ChatMessageList
				messages={[
					{
						...message("user-1", "user", "look"),
						attachments: [
							{
								id: "attachment-1",
								kind: "image",
								mimeType: "image/png",
								byteSize: 12,
								width: 2,
								height: 3,
								previewUrl:
									"http://localhost:8080/api/chat/attachments/attachment-1/preview"
							}
						]
					}
				]}
				companionName="Aiko"
				companionAvatarUrl="/images/aiko-avatar.png"
			/>
		);

		await screen.findByRole("img", { name: "Image 1" });
		fireEvent.click(screen.getByRole("button", { name: "Open preview for Image 1" }));

		expect(dialogMocks.openCustom).toHaveBeenCalledWith(
			expect.objectContaining({
				title: "Image preview",
				isDraggable: false,
				variant: "lightbox"
			})
		);
		expect(dialogMocks.openCustom.mock.calls[0][0].render).toEqual(expect.any(Function));
		const renderPreview = dialogMocks.openCustom.mock.calls[0][0].render;
		const preview = render(renderPreview({ cancel: vi.fn(), close: vi.fn() }));
		const previewImage = preview.container.querySelector('img[alt="Image 1"]');
		expect(previewImage?.className).toContain("object-contain");
		expect(screen.queryByRole("button", { name: "Next image" })).toBeNull();
	});

	it("shows a compact placeholder when a sent image preview cannot be fetched", async () => {
		vi.mocked(fetchChatAttachmentPreview).mockRejectedValue(new Error("not found"));

		render(
			<ChatMessageList
				messages={[
					{
						...message("user-1", "user", "look"),
						attachments: [
							{
								id: "attachment-missing",
								kind: "image",
								mimeType: "image/png",
								byteSize: 12,
								width: 2,
								height: 3,
								previewUrl:
									"http://localhost:8080/api/chat/attachments/attachment-missing/preview"
							}
						]
					}
				]}
				companionName="Aiko"
				companionAvatarUrl="/images/aiko-avatar.png"
			/>
		);

		const placeholder = await screen.findByRole("alert", { name: "Image unavailable" });
		expect(fetchChatAttachmentPreview).toHaveBeenCalledWith("attachment-missing");
		expect(placeholder.textContent).toBe("Image unavailable");
		expect(screen.queryByRole("img", { name: "Image 1" })).toBeNull();
		expect(screen.queryByRole("button", { name: "Open preview for Image 1" })).toBeNull();
		expect(dialogMocks.openCustom).not.toHaveBeenCalled();
	});

	it("shows a compact placeholder when a fetched sent image cannot render", async () => {
		render(
			<ChatMessageList
				messages={[
					{
						...message("user-1", "user", "look"),
						attachments: [
							{
								id: "attachment-bad-image",
								kind: "image",
								mimeType: "image/png",
								byteSize: 12,
								width: 2,
								height: 3,
								previewUrl:
									"http://localhost:8080/api/chat/attachments/attachment-bad-image/preview"
							}
						]
					}
				]}
				companionName="Aiko"
				companionAvatarUrl="/images/aiko-avatar.png"
			/>
		);

		const image = await screen.findByRole("img", { name: "Image 1" });
		fireEvent.error(image);

		expect(await screen.findByRole("alert", { name: "Image unavailable" })).toBeTruthy();
		expect(screen.queryByRole("img", { name: "Image 1" })).toBeNull();
	});

	it("renders local blob image previews without fetching", () => {
		render(
			<ChatMessageList
				messages={[
					{
						...message("user-1", "user", "look"),
						attachments: [
							{
								id: "local-attachment",
								kind: "image",
								mimeType: "image/png",
								byteSize: 12,
								width: 2,
								height: 3,
								previewUrl: "blob:local-preview"
							}
						]
					}
				]}
				companionName="Aiko"
				companionAvatarUrl="/images/aiko-avatar.png"
			/>
		);

		const image = screen.getByRole("img", { name: "Image 1" }) as HTMLImageElement;
		expect(fetchChatAttachmentPreview).not.toHaveBeenCalled();
		expect(image.src).toBe("blob:local-preview");
	});

	it("opens a pending local gallery at the selected image and navigates without closing", () => {
		render(
			<ChatMessageList
				messages={[
					{
						...message("user-1", "user", "look"),
						attachments: imageAttachments(3)
					}
				]}
				companionName="Aiko"
				companionAvatarUrl="/images/aiko-avatar.png"
			/>
		);

		fireEvent.click(screen.getByRole("button", { name: "Open preview for Image 2" }));

		expect(fetchChatAttachmentPreview).not.toHaveBeenCalled();
		expect(dialogMocks.openCustom).toHaveBeenCalledWith(
			expect.objectContaining({
				title: "Image preview",
				variant: "lightbox"
			})
		);

		const renderPreview = dialogMocks.openCustom.mock.calls[0][0].render;
		const preview = render(renderPreview({ cancel: vi.fn(), close: vi.fn() }));
		const previewScreen = within(preview.container);
		expect(previewScreen.getByRole("img", { name: "Image 2" })).toBeTruthy();

		fireEvent.click(previewScreen.getByRole("button", { name: "Next image" }));
		expect(previewScreen.getByRole("img", { name: "Image 3" })).toBeTruthy();
		expect(dialogMocks.openCustom).toHaveBeenCalledTimes(1);
	});

	it("reuses loaded sent-image URLs while navigating the lightbox", async () => {
		render(
			<ChatMessageList
				messages={[
					{
						...message("user-1", "user", "look"),
						attachments: sentImageAttachments(3)
					}
				]}
				companionName="Aiko"
				companionAvatarUrl="/images/aiko-avatar.png"
			/>
		);

		await waitFor(() => expect(fetchChatAttachmentPreview).toHaveBeenCalledTimes(3));
		fireEvent.click(await screen.findByRole("button", { name: "Open preview for Image 2" }));

		const renderPreview = dialogMocks.openCustom.mock.calls[0][0].render;
		const preview = render(renderPreview({ cancel: vi.fn(), close: vi.fn() }));
		const previewScreen = within(preview.container);
		fireEvent.click(previewScreen.getByRole("button", { name: "Next image" }));

		expect(previewScreen.getByRole("img", { name: "Image 3" })).toBeTruthy();
		expect(fetchChatAttachmentPreview).toHaveBeenCalledTimes(3);
	});

	it("keeps pending local blob previews unchanged after image error events", () => {
		render(
			<ChatMessageList
				messages={[
					{
						...message("user-1", "user", "look"),
						attachments: [
							{
								id: "local-attachment",
								kind: "image",
								mimeType: "image/png",
								byteSize: 12,
								width: 2,
								height: 3,
								previewUrl: "blob:local-preview"
							}
						]
					}
				]}
				companionName="Aiko"
				companionAvatarUrl="/images/aiko-avatar.png"
			/>
		);

		const image = screen.getByRole("img", { name: "Image 1" }) as HTMLImageElement;
		fireEvent.error(image);

		expect(screen.getByRole("img", { name: "Image 1" })).toBeTruthy();
		expect(screen.queryByRole("alert", { name: "Image unavailable" })).toBeNull();
		expect(image.src).toBe("blob:local-preview");
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

	it("shows visible retry feedback when assistant speech playback fails", () => {
		const toggleAssistantSpeech = vi.fn();
		render(
			<ChatMessageList
				messages={[message("assistant-1", "companion", "Hello there")]}
				companionName="Aiko"
				companionAvatarUrl="/images/aiko-avatar.png"
				isAssistantSpeechEnabled
				assistantSpeechPlayback={{ messageId: "assistant-1", status: "error" }}
				onToggleAssistantSpeech={toggleAssistantSpeech}
			/>
		);

		expect(screen.getByRole("status").textContent).toBe("Voice failed");
		expect(screen.getByRole("status").className).toContain("text-muted");
		expect(screen.getByRole("status").className).not.toContain("text-red");
		expect(screen.getByRole("button", { name: "Retry voice" }).className).not.toContain(
			"danger"
		);

		fireEvent.click(screen.getByRole("button", { name: "Retry voice" }));

		expect(toggleAssistantSpeech).toHaveBeenCalledWith("assistant-1");
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
		const virtualList = container.querySelector(
			"[data-virtualized-message-list]"
		) as HTMLDivElement;

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
		Object.defineProperty(scrollContainer, "scrollHeight", {
			configurable: true,
			value: 2_000
		});
		scrollContainer.scrollTop = 1_500;
		fireEvent.scroll(scrollContainer);
		await new Promise((resolve) => requestAnimationFrame(resolve));
		vi.mocked(HTMLElement.prototype.scrollTo).mockClear();

		fireEvent.wheel(scrollContainer, { deltaY: -50 });
		scrollContainer.scrollTop = 1_450;
		fireEvent.scroll(scrollContainer);
		rerender(
			<ChatMessageList
				messages={[
					...initialMessages,
					message("assistant-new", "companion", "new message")
				]}
				companionName="Aiko"
				companionAvatarUrl="/images/aiko-avatar.png"
			/>
		);
		await new Promise((resolve) => requestAnimationFrame(resolve));

		expect(HTMLElement.prototype.scrollTo).not.toHaveBeenCalled();
	});

	it("does not spring a short timeline back down after touch scrolling upward", async () => {
		const initialMessages = [
			message("user-1", "user", "hello"),
			message("assistant-1", "companion", "hi"),
			message("user-2", "user", "how are you"),
			message("assistant-2", "companion", "doing well")
		];
		const { container, rerender } = render(
			<ChatMessageList
				activeChatId="short-chat"
				messages={initialMessages}
				companionName="Aiko"
				companionAvatarUrl="/images/aiko-avatar.png"
			/>
		);
		const scrollContainer = container.querySelector(".chat-scroll") as HTMLDivElement;

		Object.defineProperty(scrollContainer, "clientHeight", { configurable: true, value: 500 });
		Object.defineProperty(scrollContainer, "scrollHeight", {
			configurable: true,
			value: 560
		});
		scrollContainer.scrollTop = 60;
		fireEvent.scroll(scrollContainer);
		await new Promise((resolve) => requestAnimationFrame(resolve));
		vi.mocked(HTMLElement.prototype.scrollTo).mockClear();

		fireEvent.pointerDown(scrollContainer, { pointerId: 7, pointerType: "touch" });
		fireEvent.pointerCancel(window, { pointerId: 7, pointerType: "touch" });
		scrollContainer.scrollTop = 20;
		fireEvent.scroll(scrollContainer);
		scrollContainer.scrollTop = 0;
		fireEvent.scroll(scrollContainer);
		scrollContainer.scrollTop = 1;
		fireEvent.scroll(scrollContainer);

		rerender(
			<ChatMessageList
				activeChatId="short-chat"
				messages={[
					...initialMessages,
					message("assistant-new", "companion", "new message")
				]}
				companionName="Aiko"
				companionAvatarUrl="/images/aiko-avatar.png"
			/>
		);
		await new Promise((resolve) => requestAnimationFrame(resolve));

		expect(HTMLElement.prototype.scrollTo).not.toHaveBeenCalled();

		scrollContainer.scrollTop = 55;
		fireEvent.scroll(scrollContainer);
		rerender(
			<ChatMessageList
				activeChatId="short-chat"
				messages={[
					...initialMessages,
					message("assistant-new", "companion", "new message"),
					message("assistant-latest", "companion", "latest message")
				]}
				companionName="Aiko"
				companionAvatarUrl="/images/aiko-avatar.png"
			/>
		);
		await new Promise((resolve) => requestAnimationFrame(resolve));

		expect(HTMLElement.prototype.scrollTo).toHaveBeenCalledWith({
			top: scrollContainer.scrollHeight,
			behavior: "smooth"
		});
	});

	it("follows a send from above the bottom but still allows scrolling up during the response", async () => {
		const initialMessages = Array.from({ length: 12 }, (_, index) =>
			message(`assistant-${index}`, "companion", `message ${index}`)
		);
		const userMessage = message("local-user-new", "user", "new question");
		const { container, rerender } = render(
			<ChatMessageList
				activeChatId="active-chat"
				messages={initialMessages}
				companionName="Aiko"
				companionAvatarUrl="/images/aiko-avatar.png"
			/>
		);
		const scrollContainer = container.querySelector(".chat-scroll") as HTMLDivElement;

		Object.defineProperty(scrollContainer, "clientHeight", { configurable: true, value: 500 });
		Object.defineProperty(scrollContainer, "scrollHeight", {
			configurable: true,
			value: 2_000
		});
		scrollContainer.scrollTop = 1_500;
		fireEvent.scroll(scrollContainer);
		await new Promise((resolve) => requestAnimationFrame(resolve));
		vi.mocked(HTMLElement.prototype.scrollTo).mockClear();

		fireEvent.wheel(scrollContainer, { deltaY: -500 });
		scrollContainer.scrollTop = 300;
		fireEvent.scroll(scrollContainer);
		rerender(
			<ChatMessageList
				activeChatId="active-chat"
				messages={[...initialMessages, userMessage]}
				companionName="Aiko"
				companionAvatarUrl="/images/aiko-avatar.png"
				isSending
			/>
		);
		await new Promise((resolve) => requestAnimationFrame(resolve));

		expect(HTMLElement.prototype.scrollTo).toHaveBeenCalledWith({
			top: scrollContainer.scrollHeight,
			behavior: "smooth"
		});

		scrollContainer.scrollTop = 1_500;
		fireEvent.scroll(scrollContainer);
		vi.mocked(HTMLElement.prototype.scrollTo).mockClear();
		fireEvent.wheel(scrollContainer, { deltaY: -400 });
		scrollContainer.scrollTop = 1_100;
		fireEvent.scroll(scrollContainer);
		rerender(
			<ChatMessageList
				activeChatId="active-chat"
				messages={[
					...initialMessages,
					userMessage,
					message("local-assistant-new", "companion", "partial response")
				]}
				companionName="Aiko"
				companionAvatarUrl="/images/aiko-avatar.png"
				isSending
			/>
		);
		await new Promise((resolve) => requestAnimationFrame(resolve));

		expect(HTMLElement.prototype.scrollTo).not.toHaveBeenCalled();
	});

	it("keeps following when the final server bubble replaces a streaming row after a layout shift", async () => {
		const initialMessages = Array.from({ length: 10 }, (_, index) =>
			message(`assistant-${index}`, "companion", `message ${index}`)
		);
		const userMessage = message("local-user-new", "user", "new question");
		const streamingMessage = message(
			"local-assistant-new",
			"companion",
			"nearly complete response"
		);
		const { container, rerender } = render(
			<ChatMessageList
				activeChatId="active-chat"
				messages={[...initialMessages, userMessage, streamingMessage]}
				companionName="Aiko"
				companionAvatarUrl="/images/aiko-avatar.png"
				isSending
			/>
		);
		const scrollContainer = container.querySelector(".chat-scroll") as HTMLDivElement;

		Object.defineProperty(scrollContainer, "clientHeight", { configurable: true, value: 500 });
		Object.defineProperty(scrollContainer, "scrollHeight", {
			configurable: true,
			value: 2_000
		});
		scrollContainer.scrollTop = 1_500;
		fireEvent.scroll(scrollContainer);
		await new Promise((resolve) => requestAnimationFrame(resolve));
		vi.mocked(HTMLElement.prototype.scrollTo).mockClear();

		scrollContainer.scrollTop = 1_350;
		fireEvent.scroll(scrollContainer);
		rerender(
			<ChatMessageList
				activeChatId="active-chat"
				messages={[
					...initialMessages,
					userMessage,
					message("server-assistant-new", "companion", "complete response")
				]}
				companionName="Aiko"
				companionAvatarUrl="/images/aiko-avatar.png"
			/>
		);
		await new Promise((resolve) => requestAnimationFrame(resolve));

		expect(HTMLElement.prototype.scrollTo).toHaveBeenCalledWith({
			top: scrollContainer.scrollHeight,
			behavior: "smooth"
		});
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
		Object.defineProperty(scrollContainer, "scrollHeight", {
			configurable: true,
			value: 2_000
		});
		scrollContainer.scrollTop = 1_500;
		fireEvent.scroll(scrollContainer);
		await new Promise((resolve) => requestAnimationFrame(resolve));
		vi.mocked(HTMLElement.prototype.scrollTo).mockClear();

		fireEvent.wheel(scrollContainer, { deltaY: -400 });
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

	it("keeps following the latest message while a restored timeline grows after auto-scroll", async () => {
		const initialMessages = Array.from({ length: 12 }, (_, index) =>
			message(`restored-${index}`, "companion", `restored message ${index}`)
		);
		const { container, rerender } = render(
			<ChatMessageList
				activeChatId="restored-chat"
				messages={initialMessages}
				companionName="Aiko"
				companionAvatarUrl="/images/aiko-avatar.png"
			/>
		);
		const scrollContainer = container.querySelector(".chat-scroll") as HTMLDivElement;
		let scrollHeight = 2_000;

		Object.defineProperty(scrollContainer, "clientHeight", { configurable: true, value: 500 });
		Object.defineProperty(scrollContainer, "scrollHeight", {
			configurable: true,
			get: () => scrollHeight
		});
		await new Promise((resolve) => requestAnimationFrame(resolve));
		vi.mocked(HTMLElement.prototype.scrollTo).mockClear();

		scrollContainer.scrollTop = 1_100;
		fireEvent.scroll(scrollContainer);
		scrollHeight = 3_000;
		rerender(
			<ChatMessageList
				activeChatId="restored-chat"
				messages={initialMessages.map((item, index) =>
					index === initialMessages.length - 1
						? { ...item, text: item.text.repeat(80) }
						: item
				)}
				companionName="Aiko"
				companionAvatarUrl="/images/aiko-avatar.png"
			/>
		);
		await new Promise((resolve) => requestAnimationFrame(resolve));

		expect(HTMLElement.prototype.scrollTo).toHaveBeenCalledWith({
			top: scrollHeight,
			behavior: "smooth"
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

function imageAttachments(count: number) {
	return Array.from({ length: count }, (_, index) => ({
		id: `local-attachment-${index + 1}`,
		kind: "image" as const,
		mimeType: "image/png",
		byteSize: 12,
		width: 2,
		height: 3,
		previewUrl: `blob:local-preview-${index + 1}`
	}));
}

function sentImageAttachments(count: number) {
	return imageAttachments(count).map((attachment) => ({
		...attachment,
		previewUrl: `http://localhost:8080/api/chat/attachments/${attachment.id}/preview`
	}));
}
