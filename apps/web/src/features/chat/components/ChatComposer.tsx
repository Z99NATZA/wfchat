import { FormEvent, KeyboardEvent } from "react";
import { Image, Mic, Paperclip, Send } from "lucide-react";
import IconButton from "@/components/ui/IconButton";

type ChatComposerProps = {
	draft: string;
	quickPrompts: string[];
	onDraftChange: (draft: string) => void;
	onSend: () => void;
	onUseQuickPrompt: (prompt: string) => void;
	isDisabled?: boolean;
	isSending?: boolean;
};

function ChatComposer({
	draft,
	quickPrompts,
	onDraftChange,
	onSend,
	onUseQuickPrompt,
	isDisabled = false,
	isSending = false
}: ChatComposerProps) {
	function handleSubmit(event: FormEvent<HTMLFormElement>) {
		event.preventDefault();
		onSend();
	}

	function handleDraftKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
		if (event.key !== "Enter" || event.shiftKey) {
			return;
		}

		event.preventDefault();
		onSend();
	}

	return (
		<div className="border-t border-app-border bg-app-panel px-4 py-4 lg:px-8">
			<div className="mx-auto max-w-3xl">
				<div className="mb-3 flex gap-2 overflow-x-auto pb-1">
					{quickPrompts.map((prompt) => (
						<button
							key={prompt}
							type="button"
							className="shrink-0 rounded-lg border border-app-border bg-app-soft px-3 py-2 text-xs font-medium text-muted transition hover:border-primary hover:text-primary disabled:border-app-border disabled:bg-app-soft disabled:text-muted/50 disabled:opacity-70 disabled:cursor-not-allowed"
							onClick={() => onUseQuickPrompt(prompt)}
							disabled
							title="Not supported yet"
						>
							{prompt}
						</button>
					))}
				</div>

				<form
					className="flex items-end gap-2 rounded-lg border border-app-border bg-app-soft p-2 shadow-soft focus-within:border-primary focus-within:ring-4 focus-within:ring-primary/15"
					onSubmit={handleSubmit}
				>
					<IconButton className="shrink-0 opacity-45 grayscale cursor-not-allowed" aria-label="Attach file" disabled title="Not supported yet">
						<Paperclip size={18} aria-hidden="true" />
					</IconButton>
					<textarea
						className="max-h-32 min-h-11 flex-1 resize-none bg-transparent px-2 py-3 text-sm outline-none placeholder:text-muted"
						value={draft}
						placeholder="Message Aiko"
						rows={1}
						disabled={isDisabled || isSending}
						onChange={(event) => onDraftChange(event.target.value)}
						onKeyDown={handleDraftKeyDown}
					/>
					<IconButton className="hidden shrink-0 opacity-45 grayscale cursor-not-allowed sm:flex" aria-label="Voice message" disabled title="Not supported yet">
						<Mic size={18} aria-hidden="true" />
					</IconButton>
					<IconButton className="hidden shrink-0 opacity-45 grayscale cursor-not-allowed sm:flex" aria-label="Image prompt" disabled title="Not supported yet">
						<Image size={18} aria-hidden="true" />
					</IconButton>
					<button
						type="submit"
						className="flex size-11 shrink-0 items-center justify-center rounded-lg bg-primary text-white shadow-soft transition hover:bg-primary-600 focus:outline-none focus:ring-4 focus:ring-primary/25 disabled:cursor-not-allowed disabled:opacity-60"
						aria-label="Send message"
						disabled={isDisabled || isSending || !draft.trim()}
					>
						<Send size={18} aria-hidden="true" />
					</button>
				</form>
			</div>
		</div>
	);
}

export default ChatComposer;
