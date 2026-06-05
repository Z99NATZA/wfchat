import { Box, MessageCircle, type LucideIcon } from "lucide-react";
import { useI18n } from "@/i18n";
import { cn } from "@/utils/classNames";

export type AppPageId = "chat" | "model3d";

type ActivityBarProps = {
	activePage: AppPageId;
	onSelectPage: (page: AppPageId) => void;
};

const navItems: Array<{ id: AppPageId; labelKey: string; icon: LucideIcon }> = [
	{ id: "chat", labelKey: "navigation.chat", icon: MessageCircle },
	{ id: "model3d", labelKey: "navigation.model3d", icon: Box }
];

function ActivityBar({ activePage, onSelectPage }: ActivityBarProps) {
	const { t } = useI18n();

	return (
		<nav
			className="relative z-50 flex h-full w-14 shrink-0 flex-col items-center border-r border-app-border bg-app-panel/82 pb-3"
			aria-label={t("navigation.primary")}
		>
			<div className="mt-3 flex w-full flex-1 flex-col items-center gap-1">
				{navItems.map((item) => {
					const Icon = item.icon;
					const isActive = item.id === activePage;

					return (
						<button
							key={item.id}
							type="button"
							className={cn(
								"relative flex size-11 items-center justify-center text-muted transition hover:bg-app-soft hover:text-app-text focus:outline-none focus:ring-2 focus:ring-primary/35",
								isActive && "bg-primary/10 text-app-text"
							)}
							aria-label={t(item.labelKey)}
							title={t(item.labelKey)}
							aria-current={isActive ? "page" : undefined}
							onClick={() => onSelectPage(item.id)}
						>
							{isActive && (
								<span
									className="absolute left-0 h-7 w-1 rounded-r-full bg-primary"
									aria-hidden="true"
								/>
							)}
							<Icon size={20} aria-hidden="true" />
						</button>
					);
				})}
			</div>
		</nav>
	);
}

export default ActivityBar;
