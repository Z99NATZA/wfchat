import type { ReactNode } from "react";
import { Droplets } from "lucide-react";
import AppHeaderBar from "@/components/header/AppHeaderBar";
import {
	AppHeaderDesktopControls,
	AppHeaderMobileControls,
	type AppHeaderControlProps
} from "@/components/header/AppHeaderControls";
import MistwaterGame from "@/features/mistwater/components/MistwaterGame";
import { useI18n } from "@/i18n/i18nContext";
import AppLayout from "@/layouts/AppLayout";

type MistwaterPageProps = {
	activityBar: ReactNode;
	backgroundImageUrl: string;
	headerControls: AppHeaderControlProps;
};

function MistwaterPage({ activityBar, backgroundImageUrl, headerControls }: MistwaterPageProps) {
	const { t } = useI18n();

	return (
		<AppLayout
			activityBar={activityBar}
			backgroundImageUrl={backgroundImageUrl}
			sidebar={null}
			header={<MistwaterHeader controls={headerControls} />}
		>
			<section
				className="relative min-h-0 flex-1 select-none overflow-hidden bg-[#061d24] [-webkit-touch-callout:none]"
				data-testid="mistwater-stage"
			>
				<MistwaterGame ariaLabel={t("mistwater.game.ariaLabel")} />
			</section>
		</AppLayout>
	);
}

function MistwaterHeader({ controls }: { controls: AppHeaderControlProps }) {
	const { t } = useI18n();

	return (
		<AppHeaderBar
			leading={
				<span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-[#123e40] text-emerald-100 sm:size-11">
					<Droplets size={21} aria-hidden="true" />
				</span>
			}
			title={t("mistwater.header.title")}
			titleAccessory={
				<span className="hidden rounded-full border border-app-border bg-app-soft px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.12em] text-muted sm:inline-flex">
					{t("mistwater.header.mode")}
				</span>
			}
			desktopActions={<AppHeaderDesktopControls {...controls} />}
			mobileMenuContent={<AppHeaderMobileControls {...controls} />}
		/>
	);
}

export default MistwaterPage;
