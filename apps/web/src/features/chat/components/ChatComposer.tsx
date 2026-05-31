import { FormEvent, KeyboardEvent, useEffect, useRef } from "react";
import { Image, Mic, Paperclip, Send } from "lucide-react";
import { useI18n } from "@/i18n";
import IconButton from "@/components/ui/IconButton";
import type { AppFont } from "@/types/font";

type ChatComposerProps = {
	draft: string;
	font: AppFont;
	quickPrompts: string[];
	onDraftChange: (draft: string) => void;
	onSend: () => void;
	onUseQuickPrompt: (prompt: string) => void;
	isDisabled?: boolean;
	isSending?: boolean;
};

function ChatComposer({
	draft,
	font,
	quickPrompts,
	onDraftChange,
	onSend,
	onUseQuickPrompt,
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

	return (
		<div className="sticky bottom-0 z-20 border-t border-app-border bg-app-panel/95 px-4 py-4 backdrop-blur lg:px-8">
			<div className="mx-auto max-w-3xl">
				<div className="mb-3 flex gap-2 overflow-x-auto pb-1">
					{quickPrompts.map((prompt) => (
						<button
							key={prompt}
							type="button"
							className="shrink-0 rounded-lg border border-app-border bg-app-soft px-3 py-2 text-xs font-medium text-muted transition hover:border-primary hover:text-primary disabled:border-app-border disabled:bg-app-soft disabled:text-muted/50 disabled:opacity-70 disabled:cursor-not-allowed"
							onClick={() => onUseQuickPrompt(prompt)}
							disabled
							title={t("common.notSupportedYet")}
						>
							{prompt}
						</button>
					))}
				</div>

				<form
					className="flex items-end gap-2 rounded-lg border border-app-border bg-app-soft p-2 shadow-soft focus-within:border-primary focus-within:ring-4 focus-within:ring-primary/15"
					onSubmit={handleSubmit}
				>
					<IconButton className="shrink-0 opacity-45 grayscale cursor-not-allowed" aria-label={t("chat.composer.attachFile")} disabled title={t("common.notSupportedYet")}>
						<Paperclip size={18} aria-hidden="true" />
					</IconButton>
					<textarea
						ref={textareaRef}
						className="min-h-11 flex-1 resize-none bg-transparent px-2 py-2.5 text-sm leading-6 outline-none placeholder:text-muted"
						value={draft}
						placeholder={t("chat.composer.placeholder")}
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
						className="flex size-11 shrink-0 items-center justify-center rounded-lg bg-primary text-white shadow-soft transition hover:bg-primary-600 focus:outline-none focus:ring-4 focus:ring-primary/25 disabled:cursor-not-allowed disabled:opacity-60"
						aria-label={isSending ? t("chat.composer.waitingForResponse") : t("chat.composer.sendMessage")}
						disabled={isDisabled || isSending || !draft.trim()}
						title={isSending ? t("chat.composer.waitBeforeSending") : t("chat.composer.sendMessage")}
					>
						<Send size={18} aria-hidden="true" />
					</button>
				</form>
			</div>
		</div>
	);
}

export default ChatComposer;
