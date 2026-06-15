import { FormEvent, KeyboardEvent, useEffect, useRef } from "react";
import { Image, Mic, Paperclip, Send } from "lucide-react";
import { useI18n } from "@/i18n";
import IconButton from "@/components/ui/IconButton";
import type { AppFont } from "@/types/font";
import { cn } from "@/utils/classNames";

type ChatComposerProps = {
	draft: string;
	font: AppFont;
	companionName: string;
	quickPrompts?: string[];
	onDraftChange: (draft: string) => void;
	onSend: () => void;
	isDisabled?: boolean;
	isSending?: boolean;
};

function ChatComposer({
	draft,
	font,
	companionName,
	quickPrompts = [],
	onDraftChange,
	onSend,
	isDisabled = false,
	isSending = false
}: ChatComposerProps) {
	const { t } = useI18n();
	const textareaRef = useRef<HTMLTextAreaElement>(null);
	const wasSendingRef = useRef(false);

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
			textareaRef.current?.focus();
		}

		wasSendingRef.current = isSending;
	}, [isDisabled, isSending]);

	function handleSubmit(event: FormEvent<HTMLFormElement>) {
		event.preventDefault();

		if (isSending) {
			textareaRef.current?.focus();
			return;
		}

		onSend();
		requestAnimationFrame(() => textareaRef.current?.focus());
	}

	function handleDraftKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
		if (event.key !== "Enter" || event.shiftKey) {
			return;
		}

		event.preventDefault();

		if (isSending) {
			textareaRef.current?.focus();
			return;
		}

		onSend();
		requestAnimationFrame(() => textareaRef.current?.focus());
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

			textarea.focus();
			textarea.setSelectionRange(prompt.length, prompt.length);
		});
	}

	const visibleQuickPrompts = quickPrompts.filter((prompt) => prompt.trim().length > 0);

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
							<button
								key={prompt}
								type="button"
								className={cn(
									"shrink-0 rounded-full border border-app-border bg-app-soft/76 px-3 py-1.5 text-xs font-medium text-app-text shadow-soft transition hover:border-primary/50 hover:bg-app-panel/86 focus:outline-none focus:ring-2 focus:ring-primary/25",
									(isDisabled || isSending) &&
										"cursor-not-allowed opacity-50 hover:border-app-border hover:bg-app-soft/76"
								)}
								disabled={isDisabled || isSending}
								onClick={() => handleQuickPromptSelect(prompt)}
							>
								{prompt}
							</button>
						))}
					</div>
				) : null}
				<form
					className="flex items-end gap-2 rounded-lg border border-app-border bg-app-soft/82 p-2 shadow-soft focus-within:border-primary focus-within:ring-4 focus-within:ring-primary/15"
					onSubmit={handleSubmit}
				>
					<IconButton className="shrink-0 opacity-45 grayscale cursor-not-allowed" aria-label={t("chat.composer.attachFile")} disabled title={t("common.notSupportedYet")}>
						<Paperclip size={18} aria-hidden="true" />
					</IconButton>
					<textarea
						ref={textareaRef}
						className="min-h-11 flex-1 resize-none bg-transparent px-2 py-2.5 text-sm leading-6 outline-none placeholder:text-muted"
						value={draft}
						placeholder={t("chat.composer.placeholder", { name: companionName })}
						rows={1}
						disabled={isDisabled}
						onChange={(event) => onDraftChange(event.target.value)}
						onKeyDown={handleDraftKeyDown}
					/>
					<IconButton className="hidden shrink-0 opacity-45 grayscale cursor-not-allowed sm:flex" aria-label={t("chat.composer.voiceMessage")} disabled title={t("common.notSupportedYet")}>
						<Mic size={18} aria-hidden="true" />
					</IconButton>
					<IconButton className="hidden shrink-0 opacity-45 grayscale cursor-not-allowed sm:flex" aria-label={t("chat.composer.imagePrompt")} disabled title={t("common.notSupportedYet")}>
						<Image size={18} aria-hidden="true" />
					</IconButton>
					<button
						type="submit"
						className="flex size-11 shrink-0 items-center justify-center rounded-lg border border-action-border bg-action text-action-text shadow-soft transition hover:bg-action-hover focus:outline-none focus:ring-4 focus:ring-action-ring/25 disabled:cursor-not-allowed disabled:border-app-border disabled:bg-app-border disabled:text-muted disabled:opacity-60 disabled:shadow-none"
						aria-label={isSending ? t("chat.composer.waitingForResponse") : t("chat.composer.sendMessage")}
						disabled={isDisabled || isSending || !draft.trim()}
						title={
							isSending
								? t("chat.composer.waitBeforeSending", { name: companionName })
								: t("chat.composer.sendMessage")
						}
					>
						<Send size={18} aria-hidden="true" />
					</button>
				</form>
			</div>
		</div>
	);
}

export default ChatComposer;
