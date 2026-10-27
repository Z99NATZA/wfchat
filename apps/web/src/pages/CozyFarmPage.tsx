import type { ReactNode } from "react";
import { Sprout } from "lucide-react";
import AppHeaderBar from "@/components/header/AppHeaderBar";
import {
	AppHeaderDesktopControls,
	AppHeaderMobileControls,
	type AppHeaderControlProps
} from "@/components/header/AppHeaderControls";
import CozyFarmGame from "@/features/cozy-farm/CozyFarmGame";
import AppLayout from "@/layouts/AppLayout";
export default function CozyFarmPage({
	activityBar,
	backgroundImageUrl,
	headerControls
}: {
	activityBar: ReactNode;
	backgroundImageUrl: string;
	headerControls: AppHeaderControlProps;
}) {
	return (
		<AppLayout
			activityBar={activityBar}
			sidebar={null}
			backgroundImageUrl={backgroundImageUrl}
			header={
				<AppHeaderBar
					leading={
						<span className="flex size-9 items-center justify-center rounded-lg bg-[#183d4b] text-[#bddae1]">
							<Sprout size={21} />
						</span>
					}
					title="Cozy Fantasy Farm"
					desktopActions={<AppHeaderDesktopControls {...headerControls} />}
					mobileMenuContent={<AppHeaderMobileControls {...headerControls} />}
				/>
			}
		>
			<CozyFarmGame />
		</AppLayout>
	);
}
