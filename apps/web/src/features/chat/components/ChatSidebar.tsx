import { useEffect, useRef, useState } from "react";
import { Ellipsis, Plus, Search, Trash2, X } from "lucide-react";
import Button from "@/components/ui/Button";
import IconButton from "@/components/ui/IconButton";
import { ChatPersonaDetails } from "@/features/chat/components/ChatDetailsPanel";
import { useI18n } from "@/i18n/i18nContext";
import type { ChatPersona, ChatSessionSummary } from "@/types/chat";
import { cn } from "@/utils/classNames";
import { formatMessageTime } from "@/utils/date";

type ChatSidebarProps = {
	sessions: ChatSessionSummary[];
	activeSessionId: string | null;
	activePersona: ChatPersona;
	isOpen: boolean;
	isCreatingSession?: boolean;
	searchQuery: string;
	onCreateSession: () => void;
	onSearchQueryChange: (value: string) => void;
	onCloseSidebar: () => void;
	onSelectSession: (sessionId: string) => void;
	onDeleteSession: (sessionId: string) => Promise<void>;
	actionErrorMessage?: string | null;
};

function ChatSidebar({
	sessions,
	activeSessionId,
	activePersona,
	isOpen,
	isCreatingSession = false,
	searchQuery,
	onCreateSession,
	onSearchQueryChange,
	onCloseSidebar,
	onSelectSession,
	onDeleteSession,
	actionErrorMessage
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
		<>
			{isOpen && (
				<button
					type="button"
					className="fixed inset-y-0 left-12 right-0 z-30 bg-black/30 sm:left-14 lg:hidden"
					tabIndex={-1}
					aria-label={t("chat.sidebar.closeSidebar")}
					onClick={onCloseSidebar}
				/>
			)}
			<aside
				className={cn(
					"mobile-app-surface-panel fixed inset-y-0 left-12 z-40 w-[18.5rem] border-r border-app-border transition-transform duration-300 sm:left-14 lg:static lg:translate-x-0 lg:bg-app-panel/62",
					isOpen ? "translate-x-0" : "-translate-x-full"
				)}
			>
				<div className="flex h-full flex-col">
					<div className="flex h-16 shrink-0 items-center justify-between border-b border-app-border px-5">
						<div className="flex items-center gap-3">
							<div>
								<p className="text-base font-semibold">{t("chat.sidebar.title")}</p>
								<p className="text-xs text-muted">{t("chat.sidebar.subtitle")}</p>
							</div>
						</div>

						<IconButton
							className="lg:hidden"
							onClick={onCloseSidebar}
							aria-label={t("chat.sidebar.closeSidebar")}
						>
							<X size={18} aria-hidden="true" />
						</IconButton>
					</div>

					<div
						className="flex min-h-0 flex-1 flex-col overflow-hidden"
						data-testid="chat-sidebar-body"
					>
						<details
							className="chat-scroll max-h-[40vh] shrink-0 overflow-y-auto bg-app-soft/25"
							data-testid="chat-sidebar-persona-details"
						>
							<summary className="sticky top-0 z-10 cursor-pointer bg-app-panel/95 px-4 py-3 text-sm font-semibold text-app-text transition hover:bg-app-soft">
								{t("chat.details.about", { name: activePersona.name })}
							</summary>
							<ChatPersonaDetails persona={activePersona} compact />
						</details>

						<section
							className="flex min-h-0 flex-1 flex-col pt-3"
							data-testid="chat-sidebar-chats"
						>
							<div className="flex items-center justify-between px-4">
								<p className="text-xs font-semibold uppercase tracking-wide text-muted">
									{t("chat.sidebar.chats")}
								</p>
								<Button
									onClick={onCreateSession}
									disabled={isCreatingSession}
									variant="action"
									size="sm"
								>
									<Plus size={14} aria-hidden="true" />
									{t("chat.sidebar.newChat")}
								</Button>
							</div>
							<div className="px-3 pt-3">
								<label className="relative block">
									<Search
										className="absolute left-3 top-1/2 -translate-y-1/2 text-muted"
										size={18}
										aria-hidden="true"
									/>
									<input
										className="h-11 w-full rounded-lg border border-app-border bg-app-soft pl-10 pr-3 text-sm outline-none transition placeholder:text-muted focus:border-control-focus-border"
										placeholder={t("chat.sidebar.searchChats")}
										type="search"
										value={searchQuery}
										onChange={(event) =>
											onSearchQueryChange(event.target.value)
										}
									/>
								</label>
							</div>
							{actionErrorMessage ? (
								<p
									className="mx-3 mt-2 rounded-lg border border-app-border bg-app-soft px-3 py-2 text-xs text-muted"
									role="status"
								>
									{actionErrorMessage}
								</p>
							) : null}
							<div
								className="chat-scroll min-h-0 flex-1 space-y-1 overflow-y-auto px-3 py-3"
								data-testid="chat-sidebar-session-list"
							>
								{sessions.map((session) => {
									const isMenuOpen = activeSessionMenuId === session.id;
									return (
										<div
											key={session.id}
											ref={isMenuOpen ? sessionMenuRef : null}
											className={cn(
												"group relative rounded-lg border transition",
												session.id === activeSessionId
													? "border-primary/50 bg-primary/15 dark:border-action-border dark:bg-action-hover"
													: "border-transparent hover:border-app-border hover:bg-app-soft"
											)}
										>
											<Button
												onClick={() => onSelectSession(session.id)}
												variant="ghost"
												size="menu"
												align="start"
												fullWidth
												className="pr-10"
											>
												<span className="min-w-0">
													<span className="block truncate text-sm font-medium text-app-text">
														{session.lastMessage ||
															t("chat.sidebar.newChat")}
													</span>
													<span className="mt-1 block text-[11px] text-muted">
														{formatMessageTime(
															new Date(session.updatedAt * 1000)
														)}
													</span>
												</span>
											</Button>
											<IconButton
												size="xs"
												variant={isMenuOpen ? "selected" : "ghost"}
												aria-label={t("chat.sidebar.chatActions")}
												onClick={() =>
													setActiveSessionMenuId((currentId) =>
														currentId === session.id ? null : session.id
													)
												}
												className={cn(
													"absolute right-1.5 top-1.5",
													isMenuOpen
														? "opacity-100"
														: "opacity-100 lg:opacity-0 lg:group-hover:opacity-100 lg:group-focus-within:opacity-100"
												)}
											>
												<Ellipsis size={14} aria-hidden="true" />
											</IconButton>
											{isMenuOpen && (
												<div className="absolute right-1.5 top-9 z-20 min-w-36 rounded-lg border border-app-border bg-app-panel/82 p-1">
													<Button
														onClick={async () => {
															setActiveSessionMenuId(null);
															await onDeleteSession(session.id);
														}}
														variant="ghostDestructive"
														size="menu"
														align="start"
														fullWidth
													>
														<Trash2 size={14} aria-hidden="true" />
														{t("chat.sidebar.deleteChat")}
													</Button>
												</div>
											)}
										</div>
									);
								})}
								{sessions.length === 0 && (
									<p className="rounded-lg border border-dashed border-app-border px-3 py-3 text-xs text-muted">
										{t("chat.sidebar.noChatsFound")}
									</p>
								)}
							</div>
						</section>
					</div>
				</div>
			</aside>
		</>
	);
}

export default ChatSidebar;
