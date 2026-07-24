import AppHeaderBar from "@/components/header/AppHeaderBar";
import {
	AppHeaderDesktopControls,
	AppHeaderMobileControls
} from "@/components/header/AppHeaderControls";
import StatusDot from "@/components/ui/StatusDot";
import type { AppFont } from "@/types/font";
import type { ChatPersona } from "@/types/chat";
import type { Theme } from "@/types/theme";

type ChatHeaderProps = {
	persona: ChatPersona;
	theme: Theme;
	font: AppFont;
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
	onFontChange,
	onOpenSidebar,
	onToggleTheme,
	isAuthenticated,
	hasPendingGuestSync,
	userAvatarUrl,
	onOpenProfile,
	onOpenSettings
}: ChatHeaderProps) {
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
			desktopActions={<AppHeaderDesktopControls {...controlProps} />}
			mobileMenuContent={<AppHeaderMobileControls {...controlProps} />}
		/>
	);
}

export default ChatHeader;
