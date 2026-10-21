import type { ReactNode } from "react";
import { Leaf, MousePointer2 } from "lucide-react";
import AppHeaderBar from "@/components/header/AppHeaderBar";
import {
	AppHeaderDesktopControls,
	AppHeaderMobileControls,
	type AppHeaderControlProps
} from "@/components/header/AppHeaderControls";
import WillowGame from "@/features/willow-glade/components/WillowGame";
import { useI18n } from "@/i18n/i18nContext";
import AppLayout from "@/layouts/AppLayout";

type WillowGladePageProps = {
	activityBar: ReactNode;
	backgroundImageUrl: string;
	headerControls: AppHeaderControlProps;
};

function WillowGladePage({
	activityBar,
	backgroundImageUrl,
	headerControls
}: WillowGladePageProps) {
	const { t } = useI18n();
	return (
		<AppLayout
			activityBar={activityBar}
			backgroundImageUrl={backgroundImageUrl}
			sidebar={null}
			header={
				<AppHeaderBar
					leading={
						<span className="flex size-9 items-center justify-center rounded-lg bg-[#405c42] text-[#e6e8c9] sm:size-11">
							<Leaf size={21} aria-hidden="true" />
						</span>
					}
					title={t("willow.title")}
					desktopActions={<AppHeaderDesktopControls {...headerControls} />}
					mobileMenuContent={<AppHeaderMobileControls {...headerControls} />}
				/>
			}
		>
			<section
				className="relative min-h-0 flex-1 select-none overflow-hidden bg-[#6c8050]"
				data-testid="willow-stage"
			>
				<WillowGame />
				<div className="pointer-events-none absolute left-5 top-5 rounded-2xl border border-[#e9ead0]/20 bg-[#304632]/80 px-4 py-3 text-[#f2edd7] shadow-lg backdrop-blur-sm sm:left-7 sm:top-7">
					<p className="text-[10px] tracking-[0.2em] opacity-70">
						{t("willow.place.eyebrow")}
					</p>
					<p className="mt-1 text-lg font-medium">{t("willow.place.name")}</p>
				</div>
				<div
					id="willow-hint"
					className="pointer-events-none absolute inset-x-4 bottom-5 flex justify-center pb-[env(safe-area-inset-bottom)]"
				>
					<p className="flex max-w-full items-center gap-2 rounded-full border border-[#e9ead0]/20 bg-[#304632]/85 px-4 py-2.5 text-center text-xs leading-relaxed text-[#f2edd7] shadow-lg backdrop-blur-sm sm:text-sm">
						<MousePointer2 size={14} className="shrink-0" aria-hidden="true" />
						{t("willow.game.hint")}
					</p>
				</div>
			</section>
		</AppLayout>
	);
}

export default WillowGladePage;
