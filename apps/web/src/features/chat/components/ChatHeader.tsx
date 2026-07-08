import { Bell, Trash2 } from "lucide-react";
import AppHeaderBar from "@/components/header/AppHeaderBar";
import {
	AppHeaderDesktopControls,
	AppHeaderMobileControls
} from "@/components/header/AppHeaderControls";
import IconButton from "@/components/ui/IconButton";
import StatusDot from "@/components/ui/StatusDot";
import { useI18n } from "@/i18n";
import type { AppFont } from "@/types/font";
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
	userAvatarUrl?: string;
	onOpenProfile: () => void;
	onOpenSettings: () => void;
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
	userAvatarUrl,
	onOpenProfile,
	onOpenSettings
}: ChatHeaderProps) {
	const { t } = useI18n();
	const controlProps = {
		theme,
		font,
		isAuthenticated,
		hasPendingGuestSync,
		userAvatarUrl,
		onFontChange,
		onOpenProfile,
		onOpenSettings,
		onToggleTheme
	};
	const clearChatAction = (
		<IconButton
			variant="danger"
			aria-label={t("chat.header.clearChat")}
			disabled={!canClearChat || isClearing}
			title={canClearChat ? t("chat.header.clearChat") : t("chat.header.noMessagesToClear")}
			onClick={onClearChat}
		>
			<Trash2 size={18} aria-hidden="true" />
		</IconButton>
	);

	return (
		<AppHeaderBar
			onOpenSidebar={onOpenSidebar}
			leading={
				<img
					className="size-9 shrink-0 rounded-lg object-cover ring-2 ring-primary/20 sm:size-11"
					src={persona.avatarUrl}
					alt={`${persona.name} avatar`}
				/>
			}
			title={persona.name}
			titleAccessory={<StatusDot />}
			subtitle={`${persona.title} - ${persona.status}`}
			desktopActions={
				<AppHeaderDesktopControls
					{...controlProps}
					leadingActions={
						<IconButton
							className="hidden md:flex"
							aria-label={t("chat.header.notifications")}
							disabled
							title={t("common.notSupportedYet")}
						>
							<Bell size={18} aria-hidden="true" />
						</IconButton>
					}
					trailingActions={clearChatAction}
				/>
			}
			mobileMenuContent={
				<AppHeaderMobileControls {...controlProps} actions={clearChatAction} />
			}
		/>
	);
}

export default ChatHeader;
