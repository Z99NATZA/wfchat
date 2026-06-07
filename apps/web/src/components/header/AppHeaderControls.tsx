import type { ReactNode } from "react";
import { Globe, Moon, Settings, Sun, Type, User } from "lucide-react";
import IconButton from "@/components/ui/IconButton";
import { FONT_OPTIONS, type AppFont } from "@/types/font";
import type { Theme } from "@/types/theme";
import { SUPPORTED_LOCALES, useI18n } from "@/i18n";

export type AppHeaderControlProps = {
	theme: Theme;
	font: AppFont;
	isAuthenticated: boolean;
	hasPendingGuestSync: boolean;
	userAvatarUrl?: string;
	onFontChange: (font: AppFont) => void;
	onOpenProfile: () => void;
	onOpenSettings: () => void;
	onToggleTheme: () => void;
};

type AppHeaderDesktopControlsProps = AppHeaderControlProps & {
	leadingActions?: ReactNode;
	trailingActions?: ReactNode;
};

const themeButtonClassName =
	"hover:border-action-border hover:bg-action hover:text-action-text focus:ring-action-ring/25";

export function AppHeaderDesktopControls({
	theme,
	font,
	isAuthenticated,
	hasPendingGuestSync,
	userAvatarUrl,
	leadingActions,
	trailingActions,
	onFontChange,
	onOpenProfile,
	onOpenSettings,
	onToggleTheme
}: AppHeaderDesktopControlsProps) {
	const { locale, setLocale, t } = useI18n();
	const nextThemeLabel =
		theme === "dark" ? t("chat.header.switchToLightTheme") : t("chat.header.switchToDarkTheme");

	return (
		<>
			{leadingActions}
			<label className="relative inline-flex h-9 w-[5.5rem] shrink-0 items-center rounded-lg border border-app-border bg-app-soft pl-2 pr-1 text-xs font-semibold text-app-text transition hover:border-primary focus-within:border-primary focus-within:ring-2 focus-within:ring-primary/35 sm:h-10 sm:w-[6.25rem]">
				<Globe size={18} aria-hidden="true" />
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
			<label className="relative inline-flex h-9 w-28 shrink-0 items-center rounded-lg border border-app-border bg-app-soft pl-2 pr-1 text-xs font-semibold text-app-text transition hover:border-primary focus-within:border-primary focus-within:ring-2 focus-within:ring-primary/35 sm:h-10 sm:w-40">
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
			<IconButton className={themeButtonClassName} onClick={onToggleTheme} aria-label={nextThemeLabel}>
				{theme === "dark" ? <Sun size={18} aria-hidden="true" /> : <Moon size={18} aria-hidden="true" />}
			</IconButton>
			{trailingActions}
			<IconButton className="hidden md:flex" aria-label={t("chat.header.settings")} onClick={onOpenSettings}>
				<Settings size={18} aria-hidden="true" />
			</IconButton>
			<ProfileButton
				avatarUrl={userAvatarUrl}
				hasAttentionBadge={!isAuthenticated || hasPendingGuestSync}
				onOpenProfile={onOpenProfile}
			/>
		</>
	);
}

type AppHeaderMobileControlsProps = AppHeaderControlProps & {
	actions?: ReactNode;
};

export function AppHeaderMobileControls({
	theme,
	font,
	isAuthenticated,
	hasPendingGuestSync,
	userAvatarUrl,
	actions,
	onFontChange,
	onOpenProfile,
	onOpenSettings,
	onToggleTheme
}: AppHeaderMobileControlsProps) {
	const { locale, setLocale, t } = useI18n();
	const nextThemeLabel =
		theme === "dark" ? t("chat.header.switchToLightTheme") : t("chat.header.switchToDarkTheme");

	return (
		<div className="space-y-2">
			<label className="flex h-10 items-center rounded-lg border border-app-border bg-app-soft pl-2 pr-1 text-xs font-semibold text-app-text">
				<Globe size={18} aria-hidden="true" />
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
				<ProfileButton
					avatarUrl={userAvatarUrl}
					hasAttentionBadge={!isAuthenticated || hasPendingGuestSync}
					onOpenProfile={onOpenProfile}
				/>
				<IconButton aria-label={t("chat.header.settings")} onClick={onOpenSettings}>
					<Settings size={18} aria-hidden="true" />
				</IconButton>
				<IconButton className={themeButtonClassName} onClick={onToggleTheme} aria-label={nextThemeLabel}>
					{theme === "dark" ? <Sun size={18} aria-hidden="true" /> : <Moon size={18} aria-hidden="true" />}
				</IconButton>
				{actions}
			</div>
		</div>
	);
}

type ProfileButtonProps = {
	avatarUrl?: string;
	hasAttentionBadge: boolean;
	onOpenProfile: () => void;
};

function ProfileButton({ avatarUrl, hasAttentionBadge, onOpenProfile }: ProfileButtonProps) {
	return (
		<button
			type="button"
			className="relative inline-flex h-10 w-10 items-center justify-center overflow-hidden rounded-lg border border-app-border bg-app-soft text-xs font-semibold text-app-text transition hover:border-primary hover:text-primary"
			onClick={onOpenProfile}
		>
			{avatarUrl ? (
				<img src={avatarUrl} alt="" className="h-full w-full object-cover" aria-hidden="true" />
			) : (
				<User size={16} aria-hidden="true" />
			)}
			{hasAttentionBadge && (
				<span
					className="absolute right-1 top-1 size-2 rounded-full bg-amber-400 ring-2 ring-app-soft"
					aria-hidden="true"
				/>
			)}
		</button>
	);
}
