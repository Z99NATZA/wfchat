import { useEffect, useRef, useState } from "react";
import { Bell, ChevronLeft, Ellipsis, Languages, Menu, Moon, Settings, Sun, Trash2, Type, User } from "lucide-react";
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
	isAuthenticated: boolean;
	hasPendingGuestSync: boolean;
	onOpenProfile: () => void;
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
	onToggleTheme,
	isAuthenticated,
	hasPendingGuestSync,
	onOpenProfile
}: ChatHeaderProps) {
	const { locale, setLocale, t } = useI18n();
	const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
	const mobileMenuRef = useRef<HTMLDivElement>(null);
	const nextThemeLabel =
		theme === "dark" ? t("chat.header.switchToLightTheme") : t("chat.header.switchToDarkTheme");

	useEffect(() => {
		if (!isMobileMenuOpen) {
			return;
		}

		function handlePointerDown(event: MouseEvent) {
			const menuRoot = mobileMenuRef.current;
			if (!menuRoot) {
				return;
			}
			if (!menuRoot.contains(event.target as Node)) {
				setIsMobileMenuOpen(false);
			}
		}

		window.addEventListener("mousedown", handlePointerDown);
		return () => window.removeEventListener("mousedown", handlePointerDown);
	}, [isMobileMenuOpen]);

	return (
		<header className="sticky top-0 z-20 border-b border-app-border bg-app-panel/95 px-3 py-2 backdrop-blur sm:px-4 sm:py-0 lg:px-6">
			<div className="flex min-h-12 items-center justify-between gap-2 sm:h-16 sm:gap-3">
				<div className="flex min-w-0 flex-1 items-center gap-2 sm:gap-3">
				<IconButton className="lg:hidden" onClick={onOpenSidebar} aria-label={t("chat.header.openSidebar")}>
					<Menu size={18} aria-hidden="true" />
				</IconButton>
				<IconButton className="hidden opacity-45 grayscale cursor-not-allowed md:flex" aria-label={t("chat.header.back")} disabled title={t("common.notSupportedYet")}>
					<ChevronLeft size={18} aria-hidden="true" />
				</IconButton>
				<img
					className="size-9 shrink-0 rounded-lg object-cover ring-2 ring-primary/20 sm:size-11"
					src={persona.avatarUrl}
					alt={`${persona.name} avatar`}
				/>
				<div className="min-w-0">
					<div className="flex items-center gap-2">
						<h1 className="truncate text-base font-semibold">{persona.name}</h1>
						<StatusDot />
					</div>
					<p className="hidden truncate text-xs text-muted sm:block">
						{persona.title} - {persona.status}
					</p>
				</div>
			</div>

			<div className="hidden flex-wrap items-center gap-2 pl-11 sm:flex sm:pl-0">
				<IconButton className="hidden opacity-45 grayscale cursor-not-allowed md:flex" aria-label={t("chat.header.notifications")} disabled title={t("common.notSupportedYet")}>
					<Bell size={18} aria-hidden="true" />
				</IconButton>
				<label className="relative inline-flex h-9 w-[5.5rem] shrink-0 items-center rounded-lg border border-app-border bg-app-soft pl-2 pr-1 text-xs font-semibold text-app-text transition hover:border-primary focus-within:border-primary focus-within:ring-2 focus-within:ring-primary/35 sm:h-10 sm:w-[6.25rem]">
					<Languages size={18} aria-hidden="true" />
					<select
						value={locale}
						aria-label={t("chat.header.language")}
						title={t("chat.header.language")}
						onChange={(event) => setLocale(event.target.value as (typeof SUPPORTED_LOCALES)[number]["code"])}
						className="h-full min-w-0 flex-1 cursor-pointer appearance-none bg-transparent pl-2 pr-6 uppercase text-app-text outline-none"
					>
						{SUPPORTED_LOCALES.map((language) => (
							<option key={language.code} value={language.code}>
								{language.label}
							</option>
						))}
					</select>
				</label>
				<label
					className="relative inline-flex h-9 w-28 shrink-0 items-center rounded-lg border border-app-border bg-app-soft pl-2 pr-1 text-xs font-semibold text-app-text transition hover:border-primary focus-within:border-primary focus-within:ring-2 focus-within:ring-primary/35 sm:h-10 sm:w-40"
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
				<IconButton className="hidden opacity-45 grayscale cursor-not-allowed md:flex" aria-label={t("chat.header.settings")} disabled title={t("common.notSupportedYet")}>
					<Settings size={18} aria-hidden="true" />
				</IconButton>
				<button
					type="button"
					className="relative inline-flex h-10 w-10 items-center justify-center rounded-lg border border-app-border bg-app-soft text-xs font-semibold text-app-text transition hover:border-primary hover:text-primary"
					onClick={onOpenProfile}
				>
					<User size={16} aria-hidden="true" />
					{(!isAuthenticated || hasPendingGuestSync) && (
						<span className="size-2 rounded-full bg-amber-400" aria-hidden="true" />
					)}
				</button>
			</div>
			<div className="relative ml-auto flex sm:hidden" ref={mobileMenuRef}>
				<IconButton
					aria-label={t("chat.header.moreActions")}
					onClick={() => setIsMobileMenuOpen((current) => !current)}
				>
					<Ellipsis size={18} aria-hidden="true" />
				</IconButton>
				{isMobileMenuOpen && (
					<div className="absolute right-0 top-11 z-30 w-64 rounded-lg border border-app-border bg-app-panel p-2 shadow-soft">
						<div className="space-y-2">
							<label className="flex h-10 items-center rounded-lg border border-app-border bg-app-soft pl-2 pr-1 text-xs font-semibold text-app-text">
								<Languages size={18} aria-hidden="true" />
								<select
									value={locale}
									aria-label={t("chat.header.language")}
									title={t("chat.header.language")}
									onChange={(event) =>
										setLocale(event.target.value as (typeof SUPPORTED_LOCALES)[number]["code"])
									}
									className="h-full min-w-0 flex-1 cursor-pointer appearance-none bg-transparent pl-2 pr-6 uppercase text-app-text outline-none"
								>
									{SUPPORTED_LOCALES.map((language) => (
										<option key={language.code} value={language.code}>
											{language.label}
										</option>
									))}
								</select>
							</label>
							<label className="flex h-10 items-center rounded-lg border border-app-border bg-app-soft pl-2 pr-1 text-xs font-semibold text-app-text">
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
							<div className="flex justify-end gap-2 p-1">
								<button
									type="button"
									className="relative inline-flex h-10 w-10 items-center justify-center rounded-lg border border-app-border bg-app-soft text-xs font-semibold text-app-text transition hover:border-primary hover:text-primary"
									onClick={onOpenProfile}
								>
									<User size={16} aria-hidden="true" />
									{(!isAuthenticated || hasPendingGuestSync) && (
										<span className="size-2 rounded-full bg-amber-400" aria-hidden="true" />
									)}
								</button>
								<IconButton onClick={onToggleTheme} aria-label={nextThemeLabel}>
									{theme === "dark" ? (
										<Sun size={18} aria-hidden="true" />
									) : (
										<Moon size={18} aria-hidden="true" />
									)}
								</IconButton>
								<IconButton
									className="border-red-300/40 bg-red-500/10 text-red-500 hover:border-red-300/70 hover:text-red-400"
									aria-label={t("chat.header.clearChat")}
									disabled={!canClearChat || isClearing}
									title={canClearChat ? t("chat.header.clearChat") : t("chat.header.noMessagesToClear")}
									onClick={onClearChat}
								>
									<Trash2 size={18} aria-hidden="true" />
								</IconButton>
							</div>
						</div>
					</div>
				)}
			</div>
			</div>
		</header>
	);
}

export default ChatHeader;
