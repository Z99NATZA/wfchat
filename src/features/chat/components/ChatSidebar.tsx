import { MessageCircle, Search, Sparkles, X } from "lucide-react";
import IconButton from "@/components/ui/IconButton";
import type { ChatPersona } from "@/types/chat";
import { cn } from "@/utils/classNames";

type ChatSidebarProps = {
	personas: ChatPersona[];
	activePersonaId: string;
	isOpen: boolean;
	onCloseSidebar: () => void;
	onSelectPersona: (personaId: string) => void;
};

function ChatSidebar({
	personas,
	activePersonaId,
	isOpen,
	onCloseSidebar,
	onSelectPersona
}: ChatSidebarProps) {
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
							<p className="text-base font-semibold">WFChat</p>
							<p className="text-xs text-muted">Waifu companion UI</p>
						</div>
					</div>
					<IconButton className="lg:hidden" onClick={onCloseSidebar} aria-label="Close sidebar">
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
							className="h-11 w-full rounded-lg border border-app-border bg-app-soft pl-10 pr-3 text-sm outline-none transition focus:border-primary focus:ring-4 focus:ring-primary/15"
							placeholder="Search chats"
							type="search"
						/>
					</label>
				</div>

				<nav className="flex-1 space-y-2 overflow-y-auto p-3" aria-label="Companions">
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
							<div className={cn("size-11 shrink-0 rounded-lg bg-gradient-to-br p-0.5", persona.accentClass)}>
								<div className="flex h-full w-full items-center justify-center rounded-[7px] bg-app-panel font-semibold">
									{persona.name.slice(0, 1)}
								</div>
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

				<div className="border-t border-app-border p-4">
					<div className="rounded-lg bg-app-soft p-3">
						<div className="flex items-center gap-3">
							<div className="flex size-9 items-center justify-center rounded-lg bg-primary/10 text-primary">
								<Sparkles size={18} aria-hidden="true" />
							</div>
							<div className="min-w-0">
								<p className="text-sm font-semibold">Mood sync</p>
								<p className="truncate text-xs text-muted">Gentle, witty, attentive</p>
							</div>
						</div>
					</div>
				</div>
			</div>
		</aside>
	);
}

export default ChatSidebar;
