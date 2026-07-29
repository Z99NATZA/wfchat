import { useEffect, useRef, useState, type FormEvent } from "react";
import { Send, X } from "lucide-react";
import { useI18n } from "@/i18n/i18nContext";
import type { CafeChatErrorCode, CafeChatEvent } from "@/features/cafe/types";

const MAX_CHAT_MESSAGE_CHARS = 200;
const MAX_DISPLAY_NAME_CHARS = 6;

type CafeRoomChatProps = {
	events: CafeChatEvent[];
	selfPlayerId: string | null;
	connected: boolean;
	error: CafeChatErrorCode | null;
	onClose: () => void;
	onInputFocusChange: (focused: boolean) => void;
	onSend: (text: string) => boolean;
};

function CafeRoomChat({
	events,
	selfPlayerId,
	connected,
	error,
	onClose,
	onInputFocusChange,
	onSend
}: CafeRoomChatProps) {
	const { t } = useI18n();
	const [text, setText] = useState("");
	const historyRef = useRef<HTMLDivElement>(null);
	const inputRef = useRef<HTMLInputElement>(null);
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
			inputRef.current?.blur();
		}
	}

	function submit(event: FormEvent<HTMLFormElement>) {
		event.preventDefault();
		send(text);
	}

	return (
		<section
			className="cafe-chat-shell flex h-full min-h-0 flex-col overflow-hidden rounded-xl"
			aria-label={t("cafe.chat.title")}
			data-testid="cafe-room-chat"
		>
			<header className="cafe-chat-header flex items-center justify-between gap-2 px-3 py-2">
				<div className="flex min-w-0 items-baseline gap-2">
					<h2 className="cafe-chat-title shrink-0 text-xs">{t("cafe.chat.title")}</h2>
					<p className="cafe-chat-muted truncate text-[10px]">
						{t("cafe.chat.ephemeral")}
					</p>
				</div>
				<button
					type="button"
					className="cafe-chat-close shrink-0 rounded-md border border-transparent p-1 transition focus:outline-none"
					aria-label={t("cafe.chat.close")}
					onClick={onClose}
				>
					<X size={15} aria-hidden="true" />
				</button>
			</header>

			<div
				ref={historyRef}
				className="cafe-chat-history chat-scroll min-h-0 flex-1 space-y-1 overflow-y-auto px-3 py-2"
				aria-live="polite"
				data-testid="cafe-chat-history"
			>
				{events.length === 0 && (
					<p className="cafe-chat-muted px-3 py-6 text-center text-xs leading-5">
						{t("cafe.chat.empty")}
					</p>
				)}
				{events.map((event) =>
					event.kind === "message" && event.text ? (
						<div
							key={event.id}
							className="cafe-chat-line grid grid-cols-[max-content_minmax(0,1fr)] items-baseline gap-x-1.5"
							data-self={event.playerId === selfPlayerId}
							data-testid="cafe-chat-message"
						>
							<span
								className="cafe-chat-name"
								title={event.playerName}
								aria-label={event.playerName}
								data-testid="cafe-chat-name"
							>
								[{compactPlayerName(event.playerName)}]
							</span>
							<p className="cafe-chat-message whitespace-pre-wrap break-words">
								{event.text}
							</p>
						</div>
					) : (
						<p
							key={event.id}
							className="cafe-chat-presence text-center"
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

			<div className="cafe-chat-composer px-2.5 py-2">
				<div className="cafe-chat-quick-list mb-1.5 grid grid-cols-3 gap-1.5">
					{[
						["cafe.chat.quickHello", "👋"],
						["cafe.chat.quickNice", "✨"],
						["cafe.chat.quickThanks", "💗"]
					].map(([key, icon]) => (
						<button
							key={key}
							type="button"
							className="cafe-chat-quick min-w-0 rounded-md py-0.5 transition focus:outline-none disabled:cursor-not-allowed disabled:opacity-50"
							disabled={!connected}
							onClick={() => send(t(key))}
						>
							{icon} {t(key)}
						</button>
					))}
				</div>
				<p className={error ? "mb-1 text-[10px] text-red-300" : "sr-only"} role="status">
					{error ? t(chatErrorTranslationKey(error)) : ""}
				</p>
				<form className="flex items-center gap-1.5" onSubmit={submit}>
					<div className="relative min-w-0 flex-1">
						<label className="sr-only" htmlFor="cafe-room-chat-input">
							{t("cafe.chat.inputLabel")}
						</label>
						<input
							ref={inputRef}
							id="cafe-room-chat-input"
							className="cafe-chat-input w-full rounded-lg py-1.5 pl-2.5 pr-12 text-xs outline-none disabled:cursor-not-allowed disabled:opacity-60"
							value={text}
							maxLength={MAX_CHAT_MESSAGE_CHARS}
							disabled={!connected}
							placeholder={
								connected ? t("cafe.chat.placeholder") : t("cafe.chat.disconnected")
							}
							autoComplete="off"
							onChange={(event) => setText(event.target.value)}
							onFocus={() => onInputFocusChange(true)}
							onBlur={() => onInputFocusChange(false)}
						/>
						<span className="cafe-chat-count pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-[9px]">
							{characterCount}/{MAX_CHAT_MESSAGE_CHARS}
						</span>
					</div>
					<button
						type="submit"
						className="cafe-chat-send flex size-8 shrink-0 items-center justify-center rounded-lg transition focus:outline-none disabled:cursor-not-allowed disabled:opacity-50"
						disabled={!connected || text.trim().length === 0}
						aria-label={t("cafe.chat.send")}
					>
						<Send size={15} aria-hidden="true" />
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

function compactPlayerName(name: string) {
	const characters = Array.from(name);
	return characters.length > MAX_DISPLAY_NAME_CHARS
		? `${characters.slice(0, MAX_DISPLAY_NAME_CHARS).join("")}..`
		: name;
}

export default CafeRoomChat;
