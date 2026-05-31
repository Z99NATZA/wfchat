import { useEffect, useRef, useState } from "react";
import { Ellipsis, MessageCircle, Plus, Search, Sparkles, Trash2, X } from "lucide-react";
import IconButton from "@/components/ui/IconButton";
import { useI18n } from "@/i18n";
import type { ChatPersona, ChatSessionSummary } from "@/types/chat";
import { cn } from "@/utils/classNames";
import { formatMessageTime } from "@/utils/date";

type ChatSidebarProps = {
	personas: ChatPersona[];
	sessions: ChatSessionSummary[];
	activeSessionId: string | null;
	activePersonaId: string;
	isOpen: boolean;
	isCreatingSession?: boolean;
	onCreateSession: () => void;
	onCloseSidebar: () => void;
	onSelectPersona: (personaId: string) => void;
	onSelectSession: (sessionId: string) => void;
	onDeleteSession: (sessionId: string) => Promise<void>;
};

function ChatSidebar({
	personas,
	sessions,
	activeSessionId,
	activePersonaId,
	isOpen,
	isCreatingSession = false,
	onCreateSession,
	onCloseSidebar,
	onSelectPersona,
	onSelectSession,
	onDeleteSession
}: ChatSidebarProps) {
	const { t } = useI18n();
	const [activeSessionMenuId, setActiveSessionMenuId] = useState<string | null>(null);
	const sessionMenuRef = useRef<HTMLDivElement>(null);

	useEffect(() => {
		if (!activeSessionMenuId) {
			return;
		}

		function handlePointerDown(event: MouseEvent) {
			const menuRoot = sessionMenuRef.current;
			if (!menuRoot) {
				return;
			}
			if (!menuRoot.contains(event.target as Node)) {
				setActiveSessionMenuId(null);
			}
		}

		window.addEventListener("mousedown", handlePointerDown);
		return () => window.removeEventListener("mousedown", handlePointerDown);
	}, [activeSessionMenuId]);

	return (
		<aside
			className={cn(
				"fixed inset-y-0 left-0 z-40 w-[18.5rem] border-r border-app-border bg-app-panel transition-transform duration-300 lg:static lg:translate-x-0",
				isOpen ? "translate-x-0" : "-translate-x-full"
			)}
		>
			<div className="flex h-full flex-col">
				<div className="flex h-16 items-center justify-between border-b border-app-border px-5">
					<div className="flex items-center gap-3">
						<div className="flex size-10 items-center justify-center rounded-lg bg-primary text-white shadow-soft">
							<MessageCircle size={20} aria-hidden="true" />
						</div>
						<div>
							<p className="text-base font-semibold">{t("chat.sidebar.title")}</p>
							<p className="text-xs text-muted">{t("chat.sidebar.subtitle")}</p>
						</div>
					</div>
					<IconButton className="lg:hidden" onClick={onCloseSidebar} aria-label={t("chat.sidebar.closeSidebar")}>
						<X size={18} aria-hidden="true" />
					</IconButton>
				</div>

				<div className="border-b border-app-border p-4">
					<label className="relative block">
						<Search
							className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted"
							size={17}
							aria-hidden="true"
						/>
						<input
							className="h-11 w-full cursor-not-allowed rounded-lg border border-app-border bg-app-soft pl-10 pr-3 text-sm text-muted/50 opacity-70 outline-none"
							placeholder={t("chat.sidebar.searchChats")}
							type="search"
							disabled
							title={t("common.notSupportedYet")}
						/>
					</label>
				</div>

				<nav className="space-y-2 border-b border-app-border p-3" aria-label={t("chat.sidebar.companions")}>
					{personas.map((persona) => (
						<button
							key={persona.id}
							type="button"
							className={cn(
								"flex w-full items-center gap-3 rounded-lg p-3 text-left transition",
								persona.id === activePersonaId
									? "bg-primary/10 text-app-text ring-1 ring-primary/20"
									: "hover:bg-app-soft"
							)}
							onClick={() => onSelectPersona(persona.id)}
						>
							<div className="size-11 shrink-0 overflow-hidden rounded-lg border-2 border-primary/35 bg-app-soft">
								<img
									className="h-full w-full object-cover"
									src={persona.avatarUrl}
									alt={`${persona.name} avatar`}
								/>
							</div>
							<span className="min-w-0 flex-1">
								<span className="flex items-center justify-between gap-3">
									<span className="truncate text-sm font-semibold">{persona.name}</span>
									<span className="text-xs text-muted">{persona.lastActiveAt}</span>
								</span>
								<span className="mt-1 block truncate text-xs text-muted">{persona.lastMessage}</span>
							</span>
							{persona.unreadCount > 0 && (
								<span className="flex size-5 shrink-0 items-center justify-center rounded-full bg-primary text-[11px] font-semibold text-white">
									{persona.unreadCount}
								</span>
							)}
						</button>
					))}
				</nav>

				<div className="flex items-center justify-between px-4 pt-3">
					<p className="text-xs font-semibold uppercase tracking-wide text-muted">{t("chat.sidebar.chats")}</p>
					<button
						type="button"
						onClick={onCreateSession}
						disabled={isCreatingSession}
						className="inline-flex h-8 items-center gap-1 rounded-lg border border-app-border bg-app-soft px-2 text-xs font-semibold text-app-text transition hover:border-primary hover:text-primary disabled:cursor-not-allowed disabled:opacity-60"
					>
						<Plus size={14} aria-hidden="true" />
						{t("chat.sidebar.newChat")}
					</button>
				</div>
				<div className="flex-1 space-y-1 overflow-y-auto px-3 py-3">
					{sessions.map((session) => {
						const isMenuOpen = activeSessionMenuId === session.id;
						return (
							<div
								key={session.id}
								ref={isMenuOpen ? sessionMenuRef : null}
								className={cn(
									"group relative rounded-lg border transition",
									session.id === activeSessionId
										? "border-primary/30 bg-primary/10"
										: "border-transparent hover:border-app-border hover:bg-app-soft"
								)}
							>
								<button
									type="button"
									onClick={() => onSelectSession(session.id)}
									className="w-full px-3 py-2 pr-10 text-left"
								>
									<p className="truncate text-sm font-medium text-app-text">
										{session.lastMessage || t("chat.sidebar.newChat")}
									</p>
									<p className="mt-1 text-[11px] text-muted">
										{formatMessageTime(new Date(session.updatedAt * 1000))}
									</p>
								</button>
								<button
									type="button"
									aria-label={t("chat.sidebar.chatActions")}
									onClick={() =>
										setActiveSessionMenuId((currentId) =>
											currentId === session.id ? null : session.id
										)
									}
									className={cn(
										"absolute right-1.5 top-1.5 flex size-7 items-center justify-center rounded-md text-muted transition hover:bg-app-panel hover:text-app-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40",
										isMenuOpen
											? "opacity-100"
											: "opacity-100 lg:opacity-0 lg:group-hover:opacity-100 lg:group-focus-within:opacity-100"
									)}
								>
									<Ellipsis size={14} aria-hidden="true" />
								</button>
								{isMenuOpen && (
									<div className="absolute right-1.5 top-9 z-20 min-w-36 rounded-lg border border-app-border bg-app-panel p-1 shadow-soft">
										<button
											type="button"
											onClick={async () => {
												setActiveSessionMenuId(null);
												await onDeleteSession(session.id);
											}}
											className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-left text-sm text-red-500 transition hover:bg-app-soft"
										>
											<Trash2 size={14} aria-hidden="true" />
											{t("chat.sidebar.deleteChat")}
										</button>
									</div>
								)}
							</div>
						);
					})}
				</div>

				<div className="border-t border-app-border p-4">
					<div className="rounded-lg bg-app-soft p-3 opacity-55 grayscale" title={t("common.notSupportedYet")}>
						<div className="flex items-center gap-3">
							<div className="flex size-9 items-center justify-center rounded-lg bg-primary/10 text-primary">
								<Sparkles size={18} aria-hidden="true" />
							</div>
							<div className="min-w-0">
								<p className="text-sm font-semibold">{t("chat.sidebar.moodSync")}</p>
								<p className="truncate text-xs text-muted">{t("chat.sidebar.moodSyncDetail")}</p>
							</div>
						</div>
					</div>
				</div>
			</div>
		</aside>
	);
}

export default ChatSidebar;
