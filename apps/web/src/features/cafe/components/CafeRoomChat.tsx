import { useEffect, useRef, useState, type FormEvent } from "react";
import { Send, X } from "lucide-react";
import { useI18n } from "@/i18n/i18nContext";
import type { CafeChatErrorCode, CafeChatEvent } from "@/features/cafe/types";

const MAX_CHAT_MESSAGE_CHARS = 200;

type CafeRoomChatProps = {
	events: CafeChatEvent[];
	selfPlayerId: string | null;
	connected: boolean;
	error: CafeChatErrorCode | null;
	onClose: () => void;
	onSend: (text: string) => boolean;
};

function CafeRoomChat({
	events,
	selfPlayerId,
	connected,
	error,
	onClose,
	onSend
}: CafeRoomChatProps) {
	const { t } = useI18n();
	const [text, setText] = useState("");
	const historyRef = useRef<HTMLDivElement>(null);
	const characterCount = Array.from(text).length;

	useEffect(() => {
		const history = historyRef.current;
		if (history) {
			history.scrollTop = history.scrollHeight;
		}
	}, [events]);

	function send(value: string) {
		const normalized = value.trim();
		if (!normalized || !connected || Array.from(normalized).length > MAX_CHAT_MESSAGE_CHARS) {
			return;
		}
		if (onSend(normalized)) {
			setText("");
		}
	}

	function submit(event: FormEvent<HTMLFormElement>) {
		event.preventDefault();
		send(text);
	}

	return (
		<section
			className="flex h-full min-h-0 flex-col overflow-hidden rounded-2xl border border-dialog-border bg-dialog-soft text-app-text shadow-xl"
			aria-label={t("cafe.chat.title")}
			data-testid="cafe-room-chat"
		>
			<header className="flex items-start justify-between gap-3 border-b border-dialog-border px-4 py-3">
				<div>
					<h2 className="text-sm font-bold">{t("cafe.chat.title")}</h2>
					<p className="mt-0.5 text-[11px] leading-4 text-muted">
						{t("cafe.chat.ephemeral")}
					</p>
				</div>
				<button
					type="button"
					className="rounded-lg p-1.5 text-muted transition hover:bg-dialog-panel hover:text-app-text focus:outline-none focus:ring-2 focus:ring-primary/35"
					aria-label={t("cafe.chat.close")}
					onClick={onClose}
				>
					<X size={17} aria-hidden="true" />
				</button>
			</header>

			<div
				ref={historyRef}
				className="min-h-0 flex-1 space-y-2 overflow-y-auto px-3 py-3"
				aria-live="polite"
				data-testid="cafe-chat-history"
			>
				{events.length === 0 && (
					<p className="px-3 py-8 text-center text-xs leading-5 text-muted">
						{t("cafe.chat.empty")}
					</p>
				)}
				{events.map((event) =>
					event.kind === "message" && event.text ? (
						<div
							key={event.id}
							className={`flex ${event.playerId === selfPlayerId ? "justify-end" : "justify-start"}`}
							data-testid="cafe-chat-message"
						>
							<div
								className={`max-w-[88%] rounded-2xl px-3 py-2 ${
									event.playerId === selfPlayerId
										? "bg-action text-action-text"
										: "border border-dialog-border bg-dialog-panel text-app-text"
								}`}
							>
								<div className="flex items-baseline justify-between gap-3">
									<span className="truncate text-[11px] font-bold">
										{event.playerName}
									</span>
									<time className="shrink-0 text-[10px] opacity-70">
										{formatChatTime(event.createdAt)}
									</time>
								</div>
								<p className="mt-0.5 whitespace-pre-wrap break-words text-sm leading-5">
									{event.text}
								</p>
							</div>
						</div>
					) : (
						<p
							key={event.id}
							className="px-2 text-center text-[11px] leading-4 text-muted"
							data-testid="cafe-chat-presence"
						>
							{t(
								event.kind === "joined"
									? "cafe.chat.playerJoined"
									: "cafe.chat.playerLeft",
								{ name: event.playerName }
							)}
						</p>
					)
				)}
			</div>

			<div className="border-t border-dialog-border px-3 py-3">
				<div className="mb-2 flex gap-1.5 overflow-x-auto pb-0.5">
					{[
						["cafe.chat.quickHello", "👋"],
						["cafe.chat.quickNice", "✨"],
						["cafe.chat.quickThanks", "💗"]
					].map(([key, icon]) => (
						<button
							key={key}
							type="button"
							className="shrink-0 rounded-full border border-dialog-border bg-dialog-panel px-2.5 py-1 text-xs font-semibold text-app-text transition hover:bg-app-soft disabled:cursor-not-allowed disabled:opacity-50"
							disabled={!connected}
							onClick={() => send(t(key))}
						>
							{icon} {t(key)}
						</button>
					))}
				</div>
				<form className="flex items-end gap-2" onSubmit={submit}>
					<div className="min-w-0 flex-1">
						<label className="sr-only" htmlFor="cafe-room-chat-input">
							{t("cafe.chat.inputLabel")}
						</label>
						<input
							id="cafe-room-chat-input"
							className="w-full rounded-xl border border-dialog-border bg-dialog-panel px-3 py-2 text-sm text-app-text outline-none placeholder:text-muted focus:border-primary focus:ring-2 focus:ring-primary/20 disabled:cursor-not-allowed disabled:opacity-60"
							value={text}
							maxLength={MAX_CHAT_MESSAGE_CHARS}
							disabled={!connected}
							placeholder={
								connected ? t("cafe.chat.placeholder") : t("cafe.chat.disconnected")
							}
							autoComplete="off"
							onChange={(event) => setText(event.target.value)}
						/>
						<div className="mt-1 flex min-h-4 items-start justify-between gap-2 px-1">
							<p className="text-[10px] text-red-500" role="status">
								{error ? t(chatErrorTranslationKey(error)) : ""}
							</p>
							<span className="shrink-0 text-[10px] text-muted">
								{characterCount}/{MAX_CHAT_MESSAGE_CHARS}
							</span>
						</div>
					</div>
					<button
						type="submit"
						className="mb-5 flex size-9 shrink-0 items-center justify-center rounded-xl border border-action-border bg-action text-action-text transition hover:bg-action-hover focus:outline-none focus:ring-4 focus:ring-action-ring/25 disabled:cursor-not-allowed disabled:opacity-50"
						disabled={!connected || text.trim().length === 0}
						aria-label={t("cafe.chat.send")}
					>
						<Send size={16} aria-hidden="true" />
					</button>
				</form>
			</div>
		</section>
	);
}

function chatErrorTranslationKey(error: CafeChatErrorCode) {
	switch (error) {
		case "too_long":
			return "cafe.chat.errorTooLong";
		case "links_not_allowed":
			return "cafe.chat.errorLinks";
		case "rate_limited":
			return "cafe.chat.errorRateLimited";
		default:
			return "cafe.chat.errorEmpty";
	}
}

function formatChatTime(timestamp: number) {
	return new Date(timestamp).toLocaleTimeString([], {
		hour: "2-digit",
		minute: "2-digit"
	});
}

export default CafeRoomChat;
