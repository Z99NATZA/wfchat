import { Layers, MessageCircle, type LucideIcon, UserRound } from "lucide-react";
import { NavLink } from "react-router-dom";
import { useI18n } from "@/i18n";
import { cn } from "@/utils/classNames";

export type AppPageId = "chat" | "pngtuber" | "model2d";

const navItems: Array<{ id: AppPageId; labelKey: string; icon: LucideIcon; path: string }> = [
	{ id: "chat", labelKey: "navigation.chat", icon: MessageCircle, path: "/chat" },
	{ id: "pngtuber", labelKey: "navigation.pngtuber", icon: UserRound, path: "/avatar/pngtuber" },
	{ id: "model2d", labelKey: "navigation.model2d", icon: Layers, path: "/model/live2d" }
];

function ActivityBar() {
	const { t } = useI18n();

	return (
		<nav
			className="app-surface-panel relative z-50 flex h-full w-14 shrink-0 flex-col items-center border-r border-app-border pb-3"
			aria-label={t("navigation.primary")}
		>
			<div className="mt-3 flex w-full flex-1 flex-col items-center gap-1">
				{navItems.map((item) => {
					const Icon = item.icon;

					return (
						<NavLink
							key={item.id}
							to={item.path}
							className={({ isActive }) =>
								cn(
									"relative flex size-11 items-center justify-center text-muted transition hover:bg-app-soft hover:text-app-text focus:outline-none focus:ring-2 focus:ring-primary/35",
									isActive && "bg-primary/10 text-app-text"
								)
							}
							aria-label={t(item.labelKey)}
							title={t(item.labelKey)}
						>
							{({ isActive }) => (
								<>
									{isActive && (
										<span
											className="absolute left-0 h-7 w-1 rounded-r-full bg-primary"
											aria-hidden="true"
										/>
									)}
									<Icon size={20} aria-hidden="true" />
								</>
							)}
						</NavLink>
					);
				})}
			</div>
		</nav>
	);
}

export default ActivityBar;
