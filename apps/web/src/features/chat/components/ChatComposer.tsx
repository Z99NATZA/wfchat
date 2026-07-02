import { ClipboardEvent, DragEvent, FormEvent, KeyboardEvent, useEffect, useRef, useState } from "react";
import { Image, LoaderCircle, Mic, Paperclip, Send, Square, X } from "lucide-react";
import { useDialog } from "@/components/dialog/DialogProvider";
import { useI18n } from "@/i18n";
import Button from "@/components/ui/Button";
import IconButton from "@/components/ui/IconButton";
import type { UserSpeechInputState } from "@/features/chat/hooks/useUserSpeechTranscription";
import type { AppFont } from "@/types/font";
import type { PendingChatImageAttachment } from "@/types/chat";

type ChatComposerProps = {
	draft: string;
	font: AppFont;
	companionName: string;
	quickPrompts?: string[];
	onDraftChange: (draft: string) => void;
	onSend: (imageAttachments?: PendingChatImageAttachment[]) => boolean | void | Promise<boolean | void>;
	isDisabled?: boolean;
	isSending?: boolean;
	isUserSpeechInputEnabled?: boolean;
	userSpeechInput?: UserSpeechInputState;
	onCancelSpeechInput?: () => void;
	onToggleSpeechInput?: () => void;
};

const MAX_IMAGE_ATTACHMENTS = 4;
const SUPPORTED_IMAGE_TYPES = new Set(["image/png", "image/jpeg", "image/webp", "image/gif"]);
const IMAGE_INPUT_ACCEPT = "image/png,image/jpeg,image/webp,image/gif";

function shouldSkipAutomaticComposerFocus() {
	if (typeof window === "undefined" || typeof window.matchMedia !== "function") {
		return false;
	}

	return window.matchMedia("(max-width: 767px), (pointer: coarse)")?.matches === true;
}

function focusComposerTextArea(textarea: HTMLTextAreaElement | null) {
	textarea?.focus({ preventScroll: true });
}

function ChatComposer({
	draft,
	font,
	companionName,
	quickPrompts = [],
	onDraftChange,
	onSend,
	isDisabled = false,
	isSending = false,
	isUserSpeechInputEnabled = false,
	userSpeechInput = { status: "idle" },
	onCancelSpeechInput,
	onToggleSpeechInput
}: ChatComposerProps) {
	const { t } = useI18n();
	const { openCustom } = useDialog();
	const textareaRef = useRef<HTMLTextAreaElement>(null);
	const imageInputRef = useRef<HTMLInputElement>(null);
	const wasSendingRef = useRef(false);
	const selectedImagesRef = useRef<PendingChatImageAttachment[]>([]);
	const [recordingElapsedSeconds, setRecordingElapsedSeconds] = useState(0);
	const [selectedImages, setSelectedImages] = useState<PendingChatImageAttachment[]>([]);
	const [imageStatus, setImageStatus] = useState<string | null>(null);

	useEffect(() => {
		selectedImagesRef.current = selectedImages;
	}, [selectedImages]);

	useEffect(() => {
		return () => {
			revokePendingImages(selectedImagesRef.current);
		};
	}, []);

	useEffect(() => {
		const textarea = textareaRef.current;
		const minComposerHeight = 44;
		const maxComposerHeight = 160;

		if (!textarea) {
			return;
		}

		textarea.style.height = "auto";
		textarea.style.height = `${Math.min(Math.max(textarea.scrollHeight, minComposerHeight), maxComposerHeight)}px`;
		textarea.style.overflowY = textarea.scrollHeight > maxComposerHeight ? "auto" : "hidden";
	}, [draft, font]);

	useEffect(() => {
		if (wasSendingRef.current && !isSending && !isDisabled) {
			if (!shouldSkipAutomaticComposerFocus()) {
				focusComposerTextArea(textareaRef.current);
			}
		}

		wasSendingRef.current = isSending;
	}, [isDisabled, isSending]);

	useEffect(() => {
		if (userSpeechInput.status !== "recording") {
			setRecordingElapsedSeconds(0);
			return;
		}

		const startedAt = Date.now();
		const updateElapsedSeconds = () => {
			setRecordingElapsedSeconds(Math.floor((Date.now() - startedAt) / 1000));
		};

		updateElapsedSeconds();
		const intervalId = window.setInterval(updateElapsedSeconds, 1000);

		return () => window.clearInterval(intervalId);
	}, [userSpeechInput.status]);

	function handleSubmit(event: FormEvent<HTMLFormElement>) {
		event.preventDefault();

		void requestSend();
	}

	function handleDraftKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
		if (event.key !== "Enter" || event.shiftKey) {
			return;
		}

		event.preventDefault();

		void requestSend();
	}

	async function requestSend() {
		if (isSending) {
			focusComposerTextArea(textareaRef.current);
			return;
		}

		const sendImages = selectedImagesRef.current;
		const didSend = await onSend(sendImages);
		if (didSend !== false && sendImages.length > 0) {
			revokePendingImages(sendImages);
			setSelectedImages([]);
			selectedImagesRef.current = [];
			setImageStatus(null);
		}
		requestAnimationFrame(() => {
			if (!shouldSkipAutomaticComposerFocus()) {
				focusComposerTextArea(textareaRef.current);
			}
		});
	}

	function handleImagePickerClick() {
		if (isDisabled || isSending) {
			return;
		}

		imageInputRef.current?.click();
	}

	function handleImageInputChange() {
		addImageFiles(imageInputRef.current?.files);
		if (imageInputRef.current) {
			imageInputRef.current.value = "";
		}
	}

	function handlePaste(event: ClipboardEvent<HTMLTextAreaElement>) {
		const files = Array.from(event.clipboardData.files).filter((file) => file.type.startsWith("image/"));
		if (files.length === 0) {
			return;
		}

		event.preventDefault();
		addImageFiles(files);
	}

	function handleDragOver(event: DragEvent<HTMLDivElement>) {
		if (isDisabled || isSending || !hasImageFiles(event.dataTransfer.files)) {
			return;
		}

		event.preventDefault();
		event.dataTransfer.dropEffect = "copy";
	}

	function handleDrop(event: DragEvent<HTMLDivElement>) {
		if (isDisabled || isSending || !hasImageFiles(event.dataTransfer.files)) {
			return;
		}

		event.preventDefault();
		addImageFiles(event.dataTransfer.files);
	}

	function addImageFiles(files: FileList | File[] | undefined | null) {
		if (!files || isDisabled || isSending) {
			return;
		}

		const currentImages = selectedImagesRef.current;
		const availableSlots = Math.max(0, MAX_IMAGE_ATTACHMENTS - currentImages.length);
		const imageFiles = Array.from(files);
		const supportedFiles = imageFiles.filter((file) => SUPPORTED_IMAGE_TYPES.has(file.type));
		const nextFiles = supportedFiles.slice(0, availableSlots);
		const nextImages = nextFiles.map(makePendingImageAttachment);

		if (nextImages.length > 0) {
			const nextSelectedImages = [...currentImages, ...nextImages];
			selectedImagesRef.current = nextSelectedImages;
			setSelectedImages(nextSelectedImages);
		}

		if (supportedFiles.length < imageFiles.length) {
			setImageStatus(t("chat.composer.imageUnsupported"));
			return;
		}

		if (supportedFiles.length > nextFiles.length) {
			setImageStatus(t("chat.composer.imageLimit", { count: MAX_IMAGE_ATTACHMENTS }));
			return;
		}

		setImageStatus(null);
	}

	function removeSelectedImage(imageId: string) {
		const image = selectedImagesRef.current.find((item) => item.id === imageId);
		if (image) {
			URL.revokeObjectURL(image.previewUrl);
		}
		const nextImages = selectedImagesRef.current.filter((item) => item.id !== imageId);
		selectedImagesRef.current = nextImages;
		setSelectedImages(nextImages);
		setImageStatus(null);
	}

	function openSelectedImagePreview(image: PendingChatImageAttachment) {
		const label = image.name || t("chat.composer.selectedImage");

		void openCustom({
			title: label,
			isDraggable: true,
			showCancelAction: false,
			size: "wide",
			render: () => (
				<div className="flex max-h-[72vh] items-center justify-center overflow-auto rounded-md bg-black/90 p-2">
					<img
						className="max-h-[70vh] max-w-full object-contain"
						src={image.previewUrl}
						alt={label}
					/>
				</div>
			)
		});
	}

	function handleQuickPromptSelect(prompt: string) {
		if (isDisabled || isSending) {
			return;
		}

		onDraftChange(prompt);
		requestAnimationFrame(() => {
			const textarea = textareaRef.current;

			if (!textarea) {
				return;
			}

			focusComposerTextArea(textarea);
			textarea.setSelectionRange(prompt.length, prompt.length);
		});
	}

	const visibleQuickPrompts = quickPrompts.filter((prompt) => prompt.trim().length > 0);
	const speechStatus = userSpeechInput.status;
	const isSpeechInputActive =
		speechStatus === "requesting" || speechStatus === "recording" || speechStatus === "transcribing";
	const canUseSpeechInput = isUserSpeechInputEnabled && !isDisabled && !isSending;
	const speechStatusText = speechInputStatusText(userSpeechInput, t);
	const canSendMessage = draft.trim().length > 0 || selectedImages.length > 0;

	return (
		<div
			onDragOver={handleDragOver}
			onDrop={handleDrop}
			className="sticky bottom-0 z-20 border-t border-app-border bg-app-panel/62 px-4 pb-[calc(1rem+env(safe-area-inset-bottom))] pt-4 lg:px-8"
		>
			<div className="mx-auto flex max-w-3xl flex-col gap-2">
				{visibleQuickPrompts.length > 0 ? (
					<div
						className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1"
						aria-label={t("chat.composer.quickPrompts")}
					>
						{visibleQuickPrompts.map((prompt) => (
							<Button
								key={prompt}
								variant="chip"
								size="xs"
								shape="pill"
								disabled={isDisabled || isSending}
								onClick={() => handleQuickPromptSelect(prompt)}
							>
								{prompt}
							</Button>
						))}
					</div>
				) : null}
				{selectedImages.length > 0 ? (
					<div className="flex gap-2 overflow-x-auto rounded-lg border border-app-border bg-app-soft/82 p-2">
						{selectedImages.map((image) => (
							<div key={image.id} className="relative h-20 w-20 shrink-0 overflow-hidden rounded-md border border-app-border bg-app-panel">
								<button
									type="button"
									className="block h-full w-full cursor-zoom-in bg-transparent p-0 text-left focus:outline-none focus:ring-2 focus:ring-primary/35"
									aria-label={t("chat.composer.openSelectedImagePreview", {
										label: image.name || t("chat.composer.selectedImage")
									})}
									onClick={() => openSelectedImagePreview(image)}
								>
									<img
										className="h-full w-full object-cover"
										src={image.previewUrl}
										alt={image.name || t("chat.composer.selectedImage")}
									/>
								</button>
								<IconButton
									size="xs"
									variant="danger"
									className="absolute right-1 top-1 z-10"
									aria-label={t("chat.composer.removeImageAttachment")}
									title={t("chat.composer.removeImageAttachment")}
									onClick={() => removeSelectedImage(image.id)}
								>
									<X size={12} aria-hidden="true" />
								</IconButton>
							</div>
						))}
					</div>
				) : null}
				{imageStatus ? (
					<p className="px-1 text-xs text-red-500" role="alert">
						{imageStatus}
					</p>
				) : null}
				<form
					className="flex items-center gap-2 rounded-lg border border-app-border bg-app-soft/82 p-2 shadow-soft focus-within:border-primary focus-within:ring-4 focus-within:ring-primary/15"
					onSubmit={handleSubmit}
				>
					<IconButton className="shrink-0" aria-label={t("chat.composer.attachFile")} disabled title={t("common.notSupportedYet")}>
						<Paperclip size={18} aria-hidden="true" />
					</IconButton>
					<input
						ref={imageInputRef}
						className="hidden"
						type="file"
						accept={IMAGE_INPUT_ACCEPT}
						multiple
						onChange={handleImageInputChange}
					/>
					<textarea
						ref={textareaRef}
						autoCapitalize="off"
						autoCorrect="off"
						className="min-h-11 flex-1 resize-none bg-transparent px-2 py-2.5 text-sm leading-6 outline-none placeholder:text-muted"
						value={draft}
						placeholder={t("chat.composer.placeholder", { name: companionName })}
						rows={1}
						disabled={isDisabled}
						spellCheck={false}
						onChange={(event) => onDraftChange(event.target.value)}
						onKeyDown={handleDraftKeyDown}
						onPaste={handlePaste}
					/>
					{speechStatus === "recording" ? (
						<span
							className="hidden h-8 shrink-0 items-center rounded-md px-1.5 font-mono text-xs tabular-nums text-red-600 sm:flex"
							role="status"
							aria-label={speechStatusText}
							aria-live="polite"
							data-testid="chat-composer-recording-timer"
						>
							{formatElapsedTime(recordingElapsedSeconds)}
						</span>
					) : speechStatus === "error" ? (
						<span
							className="hidden max-w-36 shrink truncate text-xs text-red-600 sm:block"
							role="alert"
							aria-label={
								userSpeechInput.errorDetail
									? `${speechStatusText}: ${userSpeechInput.errorDetail}`
									: speechStatusText
							}
							title={
								userSpeechInput.errorDetail
									? `${speechStatusText}: ${userSpeechInput.errorDetail}`
									: speechStatusText
							}
						>
							{speechStatusText}
						</span>
					) : speechStatus !== "idle" ? (
						<span className="sr-only" role="status" aria-live="polite">
							{speechStatusText}
						</span>
					) : null}
					{isSpeechInputActive ? (
						<IconButton
							size="sm"
							variant="ghost"
							className="hidden sm:flex"
							aria-label={t("chat.composer.cancelVoiceMessage")}
							data-testid="chat-composer-speech-cancel"
							title={t("chat.composer.cancelVoiceMessage")}
							onClick={onCancelSpeechInput}
						>
							<X size={14} aria-hidden="true" />
						</IconButton>
					) : null}
					<IconButton
						className="hidden sm:flex"
						variant={speechStatus === "recording" ? "danger" : "default"}
						aria-label={speechInputLabel(speechStatus, t)}
						aria-pressed={speechStatus === "recording"}
						disabled={!canUseSpeechInput || speechStatus === "requesting" || speechStatus === "transcribing"}
						title={
							isUserSpeechInputEnabled
								? speechInputLabel(speechStatus, t)
								: t("common.notSupportedYet")
						}
						onClick={onToggleSpeechInput}
					>
						{speechStatus === "requesting" || speechStatus === "transcribing" ? (
							<LoaderCircle className="animate-spin" size={18} aria-hidden="true" />
						) : speechStatus === "recording" ? (
							<Square size={18} aria-hidden="true" />
						) : (
							<Mic size={18} aria-hidden="true" />
						)}
					</IconButton>
					<IconButton
						className="shrink-0"
						aria-label={t("chat.composer.attachImage")}
						disabled={isDisabled || isSending || selectedImages.length >= MAX_IMAGE_ATTACHMENTS}
						title={t("chat.composer.attachImage")}
						onClick={handleImagePickerClick}
					>
						<Image size={18} aria-hidden="true" />
					</IconButton>
					<IconButton
						type="submit"
						size="lg"
						variant="action"
						aria-label={isSending ? t("chat.composer.waitingForResponse") : t("chat.composer.sendMessage")}
						disabled={isDisabled || isSending || !canSendMessage}
						title={
							isSending
								? t("chat.composer.waitBeforeSending", { name: companionName })
								: t("chat.composer.sendMessage")
						}
					>
						<Send size={18} aria-hidden="true" />
					</IconButton>
				</form>
			</div>
		</div>
	);
}

export default ChatComposer;

function speechInputLabel(status: UserSpeechInputState["status"], t: (key: string) => string): string {
	if (status === "recording") {
		return t("chat.composer.stopVoiceMessage");
	}

	if (status === "error") {
		return t("chat.composer.retryVoiceMessage");
	}

	return t("chat.composer.voiceMessage");
}

function speechInputStatusText(
	state: UserSpeechInputState,
	t: (key: string) => string
): string {
	const { errorReason, status } = state;

	switch (status) {
		case "requesting":
			return t("chat.composer.requestingMicrophone");
		case "recording":
			return t("chat.composer.recordingVoiceMessage");
		case "transcribing":
			return t("chat.composer.transcribingVoiceMessage");
		case "error":
			if (errorReason === "unsupported") {
				return t("chat.composer.voiceMessageUnsupported");
			}
			if (errorReason === "permission") {
				return t("chat.composer.voiceMessagePermissionFailed");
			}
			if (errorReason === "empty") {
				return t("chat.composer.voiceMessageEmpty");
			}
			if (errorReason === "recording") {
				return t("chat.composer.voiceMessageRecordingFailed");
			}
			return t("chat.composer.voiceMessageFailed");
		default:
			return "";
	}
}

function formatElapsedTime(totalSeconds: number): string {
	const minutes = Math.floor(totalSeconds / 60);
	const seconds = totalSeconds % 60;

	return `${minutes}:${seconds.toString().padStart(2, "0")}`;
}

function makePendingImageAttachment(file: File): PendingChatImageAttachment {
	return {
		id: typeof crypto !== "undefined" && "randomUUID" in crypto
			? crypto.randomUUID()
			: `local-image-${Date.now()}-${Math.random().toString(16).slice(2)}`,
		file,
		name: file.name,
		previewUrl: URL.createObjectURL(file),
		kind: "image"
	};
}

function revokePendingImages(images: PendingChatImageAttachment[]) {
	for (const image of images) {
		URL.revokeObjectURL(image.previewUrl);
	}
}

function hasImageFiles(files: FileList): boolean {
	return Array.from(files).some((file) => file.type.startsWith("image/"));
}
