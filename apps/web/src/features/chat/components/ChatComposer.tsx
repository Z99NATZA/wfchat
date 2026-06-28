import { FormEvent, KeyboardEvent, useEffect, useRef, useState } from "react";
import { Image, LoaderCircle, Mic, Paperclip, Send, Square, X } from "lucide-react";
import { useI18n } from "@/i18n";
import Button from "@/components/ui/Button";
import IconButton from "@/components/ui/IconButton";
import type { UserSpeechInputState } from "@/features/chat/hooks/useUserSpeechTranscription";
import type { AppFont } from "@/types/font";

type ChatComposerProps = {
	draft: string;
	font: AppFont;
	companionName: string;
	quickPrompts?: string[];
	onDraftChange: (draft: string) => void;
	onSend: () => void;
	isDisabled?: boolean;
	isSending?: boolean;
	isUserSpeechInputEnabled?: boolean;
	userSpeechInput?: UserSpeechInputState;
	onCancelSpeechInput?: () => void;
	onToggleSpeechInput?: () => void;
};

function shouldSkipAutomaticComposerFocus() {
	if (typeof window === "undefined" || typeof window.matchMedia !== "function") {
		return false;
	}

	return window.matchMedia("(max-width: 767px), (pointer: coarse)").matches;
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
	const textareaRef = useRef<HTMLTextAreaElement>(null);
	const wasSendingRef = useRef(false);
	const [recordingElapsedSeconds, setRecordingElapsedSeconds] = useState(0);

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

		if (isSending) {
			focusComposerTextArea(textareaRef.current);
			return;
		}

		onSend();
		requestAnimationFrame(() => {
			if (!shouldSkipAutomaticComposerFocus()) {
				focusComposerTextArea(textareaRef.current);
			}
		});
	}

	function handleDraftKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
		if (event.key !== "Enter" || event.shiftKey) {
			return;
		}

		event.preventDefault();

		if (isSending) {
			focusComposerTextArea(textareaRef.current);
			return;
		}

		onSend();
		requestAnimationFrame(() => {
			if (!shouldSkipAutomaticComposerFocus()) {
				focusComposerTextArea(textareaRef.current);
			}
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

	return (
		<div
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
				<form
					className="flex items-center gap-2 rounded-lg border border-app-border bg-app-soft/82 p-2 shadow-soft focus-within:border-primary focus-within:ring-4 focus-within:ring-primary/15"
					onSubmit={handleSubmit}
				>
					<IconButton className="shrink-0" aria-label={t("chat.composer.attachFile")} disabled title={t("common.notSupportedYet")}>
						<Paperclip size={18} aria-hidden="true" />
					</IconButton>
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
					<IconButton className="hidden sm:flex" aria-label={t("chat.composer.imagePrompt")} disabled title={t("common.notSupportedYet")}>
						<Image size={18} aria-hidden="true" />
					</IconButton>
					<IconButton
						type="submit"
						size="lg"
						variant="action"
						aria-label={isSending ? t("chat.composer.waitingForResponse") : t("chat.composer.sendMessage")}
						disabled={isDisabled || isSending || !draft.trim()}
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
