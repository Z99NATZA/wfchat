import { type ReactNode, useEffect, useRef, useState } from "react";
import { ChevronLeft, Ellipsis, Menu } from "lucide-react";
import IconButton from "@/components/ui/IconButton";
import { useI18n } from "@/i18n";

type AppHeaderBarProps = {
	leading?: ReactNode;
	title: ReactNode;
	subtitle?: ReactNode;
	titleAccessory?: ReactNode;
	desktopActions?: ReactNode;
	mobileMenuContent?: ReactNode;
	onOpenSidebar?: () => void;
};

function AppHeaderBar({
	leading,
	title,
	subtitle,
	titleAccessory,
	desktopActions,
	mobileMenuContent,
	onOpenSidebar
}: AppHeaderBarProps) {
	const { t } = useI18n();
	const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
	const mobileMenuRef = useRef<HTMLDivElement>(null);

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
		<header className="sticky top-0 z-20 border-b border-app-border bg-app-panel/62 px-3 py-2 sm:px-4 sm:py-0 lg:px-6">
			<div className="flex min-h-12 items-center justify-between gap-2 sm:h-16 sm:gap-3">
				<div className="flex min-w-0 flex-1 items-center gap-2 sm:gap-3">
					{onOpenSidebar && (
						<IconButton className="lg:hidden" onClick={onOpenSidebar} aria-label={t("chat.header.openSidebar")}>
							<Menu size={18} aria-hidden="true" />
						</IconButton>
					)}
					<IconButton
						className="hidden cursor-not-allowed opacity-45 grayscale md:flex"
						aria-label={t("chat.header.back")}
						disabled
						title={t("common.notSupportedYet")}
					>
						<ChevronLeft size={18} aria-hidden="true" />
					</IconButton>
					{leading}
					<div className="min-w-0">
						<div className="flex items-center gap-2">
							<h1 className="truncate text-base font-semibold">{title}</h1>
							{titleAccessory}
						</div>
						{subtitle && <p className="hidden truncate text-xs text-muted sm:block">{subtitle}</p>}
					</div>
				</div>

				{desktopActions && <div className="hidden flex-wrap items-center gap-2 pl-11 sm:flex sm:pl-0">{desktopActions}</div>}

				{mobileMenuContent && (
					<div className="relative ml-auto flex sm:hidden" ref={mobileMenuRef}>
						<IconButton
							aria-label={t("chat.header.moreActions")}
							onClick={() => setIsMobileMenuOpen((current) => !current)}
						>
							<Ellipsis size={18} aria-hidden="true" />
						</IconButton>
						{isMobileMenuOpen && (
							<div className="mobile-app-surface-panel absolute right-0 top-11 z-30 w-64 rounded-lg border border-app-border p-2 shadow-soft">
								{mobileMenuContent}
							</div>
						)}
					</div>
				)}
			</div>
		</header>
	);
}

export default AppHeaderBar;
