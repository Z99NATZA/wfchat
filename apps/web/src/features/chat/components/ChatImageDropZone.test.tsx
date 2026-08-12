/**
 * @vitest-environment happy-dom
 */
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import ChatImageDropZone from "@/features/chat/components/ChatImageDropZone";

vi.mock("@/i18n/i18nContext", () => ({
	useI18n: () => ({
		t: (key: string) => key
	})
}));

describe("ChatImageDropZone", () => {
	afterEach(cleanup);

	it("shows the overlay for a supported image drag and stages the files on drop", () => {
		const onImageFilesDropped = vi.fn();
		const image = new File(["image"], "local.png", { type: "image/png" });
		const dataTransfer = imageDataTransfer([image]);

		render(
			<ChatImageDropZone isEnabled onImageFilesDropped={onImageFilesDropped}>
				<div>Conversation</div>
			</ChatImageDropZone>
		);

		const dropZone = screen.getByTestId("chat-image-drop-zone");
		fireEvent.dragEnter(dropZone, { dataTransfer });
		const didAllowBrowserDefault = fireEvent.dragOver(dropZone, { dataTransfer });

		expect(screen.getByTestId("chat-image-drop-overlay")).toBeTruthy();
		expect(didAllowBrowserDefault).toBe(false);
		expect(screen.getByRole("status").textContent).toContain("chat.composer.dropImages");

		fireEvent.drop(dropZone, { dataTransfer });

		expect(onImageFilesDropped).toHaveBeenCalledWith(dataTransfer.files);
		expect(screen.queryByTestId("chat-image-drop-overlay")).toBeNull();
	});

	it("keeps the overlay stable while crossing nested canvas elements", () => {
		const image = new File(["image"], "local.webp", { type: "image/webp" });
		const dataTransfer = imageDataTransfer([image]);

		render(
			<ChatImageDropZone isEnabled onImageFilesDropped={vi.fn()}>
				<div>Conversation</div>
			</ChatImageDropZone>
		);

		const dropZone = screen.getByTestId("chat-image-drop-zone");
		fireEvent.dragEnter(dropZone, { dataTransfer });
		fireEvent.dragEnter(dropZone, { dataTransfer });
		fireEvent.dragLeave(dropZone, { dataTransfer });

		expect(screen.getByTestId("chat-image-drop-overlay")).toBeTruthy();

		fireEvent.dragLeave(dropZone, { dataTransfer });

		expect(screen.queryByTestId("chat-image-drop-overlay")).toBeNull();
	});

	it("ignores unsupported files, non-file drags, and disabled drop zones", () => {
		const onImageFilesDropped = vi.fn();
		const svg = new File(["<svg />"], "local.svg", { type: "image/svg+xml" });
		const unsupportedTransfer = imageDataTransfer([svg]);
		const textTransfer = {
			files: [] as unknown as FileList,
			items: [{ kind: "string", type: "text/plain" }],
			dropEffect: "none"
		} as unknown as DataTransfer;

		const { rerender } = render(
			<ChatImageDropZone isEnabled onImageFilesDropped={onImageFilesDropped}>
				<div>Conversation</div>
			</ChatImageDropZone>
		);
		const dropZone = screen.getByTestId("chat-image-drop-zone");

		fireEvent.dragEnter(dropZone, { dataTransfer: unsupportedTransfer });
		fireEvent.drop(dropZone, { dataTransfer: unsupportedTransfer });
		fireEvent.dragEnter(dropZone, { dataTransfer: textTransfer });

		expect(screen.queryByTestId("chat-image-drop-overlay")).toBeNull();
		expect(onImageFilesDropped).not.toHaveBeenCalled();

		rerender(
			<ChatImageDropZone isEnabled={false} onImageFilesDropped={onImageFilesDropped}>
				<div>Conversation</div>
			</ChatImageDropZone>
		);
		const pngTransfer = imageDataTransfer([
			new File(["image"], "disabled.png", { type: "image/png" })
		]);

		fireEvent.dragEnter(screen.getByTestId("chat-image-drop-zone"), {
			dataTransfer: pngTransfer
		});
		fireEvent.drop(screen.getByTestId("chat-image-drop-zone"), {
			dataTransfer: pngTransfer
		});

		expect(screen.queryByTestId("chat-image-drop-overlay")).toBeNull();
		expect(onImageFilesDropped).not.toHaveBeenCalled();
	});

	it("does not stage a file twice when a child drop handler already handled it", () => {
		const onImageFilesDropped = vi.fn();
		const dataTransfer = imageDataTransfer([
			new File(["image"], "local.jpg", { type: "image/jpeg" })
		]);

		render(
			<ChatImageDropZone isEnabled onImageFilesDropped={onImageFilesDropped}>
				<div
					data-testid="composer-drop-target"
					onDrop={(event) => event.preventDefault()}
				/>
			</ChatImageDropZone>
		);

		fireEvent.drop(screen.getByTestId("composer-drop-target"), { dataTransfer });

		expect(onImageFilesDropped).not.toHaveBeenCalled();
	});

	it("clears an active overlay when the drop zone becomes unavailable", () => {
		const dataTransfer = imageDataTransfer([
			new File(["image"], "local.png", { type: "image/png" })
		]);
		const { rerender } = render(
			<ChatImageDropZone isEnabled onImageFilesDropped={vi.fn()}>
				<div>Conversation</div>
			</ChatImageDropZone>
		);

		fireEvent.dragEnter(screen.getByTestId("chat-image-drop-zone"), { dataTransfer });
		expect(screen.getByTestId("chat-image-drop-overlay")).toBeTruthy();

		rerender(
			<ChatImageDropZone isEnabled={false} onImageFilesDropped={vi.fn()}>
				<div>Conversation</div>
			</ChatImageDropZone>
		);

		expect(screen.queryByTestId("chat-image-drop-overlay")).toBeNull();
	});
});

function imageDataTransfer(files: File[]): DataTransfer {
	return {
		files: files as unknown as FileList,
		items: files.map((file) => ({ kind: "file", type: file.type })),
		dropEffect: "none"
	} as unknown as DataTransfer;
}
