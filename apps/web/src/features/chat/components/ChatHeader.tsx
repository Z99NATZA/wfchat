import { Bell, ChevronLeft, Menu, Moon, Settings, Sun, Trash2 } from "lucide-react";
import IconButton from "@/components/ui/IconButton";
import StatusDot from "@/components/ui/StatusDot";
import type { ChatPersona } from "@/types/chat";
import type { Theme } from "@/types/theme";

type ChatHeaderProps = {
	persona: ChatPersona;
	theme: Theme;
	canClearChat: boolean;
	isClearing?: boolean;
	onClearChat: () => void;
	onOpenSidebar: () => void;
	onToggleTheme: () => void;
};

function ChatHeader({
	persona,
	theme,
	canClearChat,
	isClearing = false,
	onClearChat,
	onOpenSidebar,
	onToggleTheme
}: ChatHeaderProps) {
	const nextThemeLabel = theme === "dark" ? "Switch to light theme" : "Switch to dark theme";

	return (
		<header className="sticky top-0 z-20 flex h-16 items-center justify-between border-b border-app-border bg-app-panel/95 px-4 backdrop-blur lg:px-6">
			<div className="flex min-w-0 items-center gap-3">
				<IconButton className="lg:hidden" onClick={onOpenSidebar} aria-label="Open sidebar">
					<Menu size={18} aria-hidden="true" />
				</IconButton>
				<IconButton className="hidden opacity-45 grayscale cursor-not-allowed md:flex" aria-label="Back" disabled title="Not supported yet">
					<ChevronLeft size={18} aria-hidden="true" />
				</IconButton>
				<img
					className="size-11 shrink-0 rounded-lg object-cover ring-2 ring-primary/20"
					src={persona.avatarUrl}
					alt={`${persona.name} avatar`}
				/>
				<div className="min-w-0">
					<div className="flex items-center gap-2">
						<h1 className="truncate text-base font-semibold">{persona.name}</h1>
						<StatusDot />
					</div>
					<p className="truncate text-xs text-muted">
						{persona.title} - {persona.status}
					</p>
				</div>
			</div>

			<div className="flex items-center gap-2">
				<IconButton className="opacity-45 grayscale cursor-not-allowed" aria-label="Notifications" disabled title="Not supported yet">
					<Bell size={18} aria-hidden="true" />
				</IconButton>
				<IconButton onClick={onToggleTheme} aria-label={nextThemeLabel}>
					{theme === "dark" ? <Sun size={18} aria-hidden="true" /> : <Moon size={18} aria-hidden="true" />}
				</IconButton>
				<IconButton
					aria-label="Clear chat"
					disabled={!canClearChat || isClearing}
					title={canClearChat ? "Clear chat" : "No messages to clear"}
					onClick={onClearChat}
				>
					<Trash2 size={18} aria-hidden="true" />
				</IconButton>
				<IconButton className="opacity-45 grayscale cursor-not-allowed" aria-label="Settings" disabled title="Not supported yet">
					<Settings size={18} aria-hidden="true" />
				</IconButton>
			</div>
		</header>
	);
}

export default ChatHeader;
