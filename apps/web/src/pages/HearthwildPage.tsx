import type { ReactNode } from "react";
import { TreePine } from "lucide-react";
import AppHeaderBar from "@/components/header/AppHeaderBar";
import {
	AppHeaderDesktopControls,
	AppHeaderMobileControls,
	type AppHeaderControlProps
} from "@/components/header/AppHeaderControls";
import HearthwildGame from "@/features/hearthwild/HearthwildGame";
import AppLayout from "@/layouts/AppLayout";
export default function HearthwildPage({
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
							<TreePine size={21} />
						</span>
					}
					title="Hearthwild"
					desktopActions={<AppHeaderDesktopControls {...headerControls} />}
					mobileMenuContent={<AppHeaderMobileControls {...headerControls} />}
				/>
			}
		>
			<HearthwildGame />
		</AppLayout>
	);
}
