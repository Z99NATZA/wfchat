import { Bell, ChevronLeft, Languages, Menu, Moon, Settings, Sun, Trash2, Type } from "lucide-react";
import IconButton from "@/components/ui/IconButton";
import StatusDot from "@/components/ui/StatusDot";
import { SUPPORTED_LOCALES, useI18n } from "@/i18n";
import { FONT_OPTIONS, type AppFont } from "@/types/font";
import type { ChatPersona } from "@/types/chat";
import type { Theme } from "@/types/theme";

type ChatHeaderProps = {
	persona: ChatPersona;
	theme: Theme;
	font: AppFont;
	canClearChat: boolean;
	isClearing?: boolean;
	onClearChat: () => void;
	onFontChange: (font: AppFont) => void;
	onOpenSidebar: () => void;
	onToggleTheme: () => void;
};

function ChatHeader({
	persona,
	theme,
	font,
	canClearChat,
	isClearing = false,
	onClearChat,
	onFontChange,
	onOpenSidebar,
	onToggleTheme
}: ChatHeaderProps) {
	const { locale, setLocale, t } = useI18n();
	const nextThemeLabel =
		theme === "dark" ? t("chat.header.switchToLightTheme") : t("chat.header.switchToDarkTheme");

	return (
		<header className="sticky top-0 z-20 flex h-16 items-center justify-between border-b border-app-border bg-app-panel/95 px-4 backdrop-blur lg:px-6">
			<div className="flex min-w-0 items-center gap-3">
				<IconButton className="lg:hidden" onClick={onOpenSidebar} aria-label={t("chat.header.openSidebar")}>
					<Menu size={18} aria-hidden="true" />
				</IconButton>
				<IconButton className="hidden opacity-45 grayscale cursor-not-allowed md:flex" aria-label={t("chat.header.back")} disabled title={t("common.notSupportedYet")}>
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
				<IconButton className="opacity-45 grayscale cursor-not-allowed" aria-label={t("chat.header.notifications")} disabled title={t("common.notSupportedYet")}>
					<Bell size={18} aria-hidden="true" />
				</IconButton>
				<label className="relative inline-flex h-10 items-center rounded-lg border border-app-border bg-app-soft pl-2 pr-1 text-xs font-semibold text-app-text transition hover:border-primary focus-within:border-primary focus-within:ring-2 focus-within:ring-primary/35">
					<Languages size={18} aria-hidden="true" />
					<select
						value={locale}
						aria-label={t("chat.header.language")}
						title={t("chat.header.language")}
						onChange={(event) => setLocale(event.target.value as (typeof SUPPORTED_LOCALES)[number]["code"])}
						className="h-full cursor-pointer appearance-none bg-transparent pl-2 pr-6 uppercase text-app-text outline-none"
					>
						{SUPPORTED_LOCALES.map((language) => (
							<option key={language.code} value={language.code}>
								{language.label}
							</option>
						))}
					</select>
				</label>
				<label
					className="relative inline-flex h-10 w-40 shrink-0 items-center rounded-lg border border-app-border bg-app-soft pl-2 pr-1 text-xs font-semibold text-app-text transition hover:border-primary focus-within:border-primary focus-within:ring-2 focus-within:ring-primary/35"
				>
					<Type size={18} aria-hidden="true" />
					<select
						value={font}
						aria-label={t("chat.header.font")}
						title={t("chat.header.font")}
						onChange={(event) => onFontChange(event.target.value as AppFont)}
						className="h-full min-w-0 flex-1 cursor-pointer appearance-none bg-transparent pl-2 pr-6 text-app-text outline-none"
					>
						{FONT_OPTIONS.map((fontOption) => (
							<option key={fontOption.id} value={fontOption.id}>
								{fontOption.label}
							</option>
						))}
					</select>
				</label>
				<IconButton onClick={onToggleTheme} aria-label={nextThemeLabel}>
					{theme === "dark" ? <Sun size={18} aria-hidden="true" /> : <Moon size={18} aria-hidden="true" />}
				</IconButton>
				<IconButton
					aria-label={t("chat.header.clearChat")}
					disabled={!canClearChat || isClearing}
					title={canClearChat ? t("chat.header.clearChat") : t("chat.header.noMessagesToClear")}
					onClick={onClearChat}
				>
					<Trash2 size={18} aria-hidden="true" />
				</IconButton>
				<IconButton className="opacity-45 grayscale cursor-not-allowed" aria-label={t("chat.header.settings")} disabled title={t("common.notSupportedYet")}>
					<Settings size={18} aria-hidden="true" />
				</IconButton>
			</div>
		</header>
	);
}

export default ChatHeader;
