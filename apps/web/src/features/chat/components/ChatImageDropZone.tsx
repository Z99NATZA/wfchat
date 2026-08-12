import { ImageUp } from "lucide-react";
import { type DragEvent, type ReactNode, useEffect, useRef, useState } from "react";
import { useI18n } from "@/i18n/i18nContext";

type ChatImageDropZoneProps = {
	children: ReactNode;
	isEnabled: boolean;
	onImageFilesDropped: (files: FileList) => void;
};

const SUPPORTED_IMAGE_TYPES = new Set(["image/png", "image/jpeg", "image/webp"]);

function ChatImageDropZone({ children, isEnabled, onImageFilesDropped }: ChatImageDropZoneProps) {
	const { t } = useI18n();
	const dragDepthRef = useRef(0);
	const [isDraggingImage, setIsDraggingImage] = useState(false);

	useEffect(() => {
		if (!isEnabled) {
			dragDepthRef.current = 0;
			setIsDraggingImage(false);
		}
	}, [isEnabled]);

	function clearDragState() {
		dragDepthRef.current = 0;
		setIsDraggingImage(false);
	}

	function handleDragEnter(event: DragEvent<HTMLDivElement>) {
		if (!isEnabled || !hasSupportedImageDrag(event.dataTransfer)) {
			return;
		}

		event.preventDefault();
		dragDepthRef.current += 1;
		setIsDraggingImage(true);
	}

	function handleDragOver(event: DragEvent<HTMLDivElement>) {
		if (!isEnabled || !hasSupportedImageDrag(event.dataTransfer)) {
			return;
		}

		event.preventDefault();
		event.dataTransfer.dropEffect = "copy";
	}

	function handleDragLeave() {
		if (!isDraggingImage) {
			return;
		}

		dragDepthRef.current = Math.max(0, dragDepthRef.current - 1);
		if (dragDepthRef.current === 0) {
			setIsDraggingImage(false);
		}
	}

	function handleDrop(event: DragEvent<HTMLDivElement>) {
		const hasSupportedImage = hasSupportedImageFiles(event.dataTransfer.files);
		clearDragState();

		if (event.defaultPrevented || !isEnabled || !hasSupportedImage) {
			return;
		}

		event.preventDefault();
		onImageFilesDropped(event.dataTransfer.files);
	}

	return (
		<div
			className="relative z-10 flex min-h-0 flex-1 flex-col"
			data-testid="chat-image-drop-zone"
			onDragEnter={handleDragEnter}
			onDragLeave={handleDragLeave}
			onDragOver={handleDragOver}
			onDrop={handleDrop}
		>
			{children}
			{isDraggingImage ? (
				<div
					className="pointer-events-none absolute inset-3 z-50 flex items-center justify-center rounded-xl border-2 border-dashed border-primary bg-app-panel/92 p-6 text-app-text"
					data-testid="chat-image-drop-overlay"
					role="status"
				>
					<div className="flex flex-col items-center gap-3 rounded-lg border border-app-border bg-app-soft/82 px-6 py-5 text-center">
						<ImageUp className="size-8 text-primary" aria-hidden="true" />
						<p className="font-medium">{t("chat.composer.dropImages")}</p>
						<p className="text-xs text-muted">{t("chat.composer.dropImagesHint")}</p>
					</div>
				</div>
			) : null}
		</div>
	);
}

export default ChatImageDropZone;

function hasSupportedImageDrag(dataTransfer: DataTransfer): boolean {
	if (dataTransfer.items?.length > 0) {
		return Array.from(dataTransfer.items).some(
			(item) => item.kind === "file" && SUPPORTED_IMAGE_TYPES.has(item.type)
		);
	}

	return hasSupportedImageFiles(dataTransfer.files);
}

function hasSupportedImageFiles(files: FileList): boolean {
	return Array.from(files).some((file) => SUPPORTED_IMAGE_TYPES.has(file.type));
}
