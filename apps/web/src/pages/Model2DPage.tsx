import AppHeaderBar from "@/components/header/AppHeaderBar";
import {
	AppHeaderDesktopControls,
	AppHeaderMobileControls,
	type AppHeaderControlProps
} from "@/components/header/AppHeaderControls";
import Button from "@/components/ui/Button";
import IconButton from "@/components/ui/IconButton";
import AppLayout from "@/layouts/AppLayout";
import { useI18n } from "@/i18n/i18nContext";
import {
	Box,
	Construction,
	Layers,
	ScanFace,
	Settings2,
	Sparkles,
	type LucideIcon
} from "lucide-react";
import type { ReactNode } from "react";

type Model2DPageProps = {
	activityBar: ReactNode;
	backgroundImageUrl: string;
	headerControls: AppHeaderControlProps;
};

const modelAssets = [
	{ nameKey: "model2d.assets.aikoLive2D", statusKey: "model2d.assets.rigPending", active: true },
	{ nameKey: "model2d.assets.motionSet", statusKey: "model2d.assets.notImported", active: false },
	{ nameKey: "model2d.assets.physics", statusKey: "model2d.assets.notImported", active: false }
];

function Model2DPage({ activityBar, backgroundImageUrl, headerControls }: Model2DPageProps) {
	return (
		<AppLayout
			activityBar={activityBar}
			backgroundImageUrl={backgroundImageUrl}
			sidebar={<Model2DSidebar />}
			header={<Model2DHeader controls={headerControls} />}
			details={<Model2DInspector />}
		>
			<Model2DStage />
		</AppLayout>
	);
}

function Model2DSidebar() {
	const { t } = useI18n();

	return (
		<aside
			className="hidden h-full w-[18.5rem] shrink-0 border-r border-app-border bg-app-panel/62 lg:flex lg:flex-col"
			data-testid="model2d-sidebar"
		>
			<div className="flex h-16 items-center border-b border-app-border px-5">
				<div>
					<p className="text-base font-semibold text-app-text">
						{t("model2d.sidebar.title")}
					</p>
					<p className="truncate text-xs text-muted">{t("model2d.sidebar.subtitle")}</p>
				</div>
			</div>

			<div
				className="pointer-events-none flex min-h-0 flex-1 select-none flex-col opacity-30"
				aria-disabled="true"
				data-testid="model2d-disabled-controls"
			>
				<div className="border-b border-app-border p-4">
					<div className="grid grid-cols-3 gap-2">
						<ToolButton icon={ScanFace} label={t("model2d.tools.model")} active />
						<ToolButton icon={Sparkles} label={t("model2d.tools.motion")} />
						<ToolButton icon={Settings2} label={t("model2d.tools.runtime")} />
					</div>
				</div>
				<div className="flex-1 overflow-y-auto p-3">
					<p className="px-1 pb-2 text-xs font-semibold uppercase text-muted">
						{t("model2d.sidebar.assets")}
					</p>
					<div className="space-y-2">
						{modelAssets.map((asset) => (
							<Button
								key={asset.nameKey}
								variant={asset.active ? "selected" : "ghost"}
								size="row"
								align="start"
								fullWidth
								disabled
							>
								<span className="flex size-10 shrink-0 items-center justify-center rounded-lg border border-app-border bg-app-soft text-muted">
									<Box size={18} aria-hidden="true" />
								</span>
								<span className="min-w-0 flex-1">
									<span className="block truncate text-sm font-semibold text-app-text">
										{t(asset.nameKey)}
									</span>
									<span className="text-xs text-muted">{t(asset.statusKey)}</span>
								</span>
							</Button>
						))}
					</div>
				</div>
			</div>
		</aside>
	);
}

function Model2DStage() {
	const { t } = useI18n();

	return (
		<section
			className="flex min-h-0 flex-1 flex-col bg-app-bg/40"
			aria-disabled="true"
			data-testid="model2d-stage"
		>
			<div className="flex h-12 shrink-0 items-center justify-between border-b border-app-border bg-app-panel/62 px-4 text-xs text-muted">
				<div className="flex items-center gap-2">
					<span className="flex size-7 items-center justify-center rounded-lg border border-app-border bg-app-soft text-app-text">
						<Layers size={15} aria-hidden="true" />
					</span>
					<span>{t("model2d.viewport.stage")}</span>
				</div>
				<span className="rounded-lg border border-app-border bg-app-soft px-3 py-1.5 text-xs font-semibold text-muted">
					{t("model2d.viewport.status")}
				</span>
			</div>

			<div className="relative min-h-0 flex-1 overflow-hidden">
				<div
					className="pointer-events-none absolute inset-0 select-none opacity-30"
					aria-hidden="true"
					data-testid="model2d-disabled-preview"
				>
					<div className="absolute inset-0 bg-app-soft/30" />
					<div className="absolute inset-x-0 top-1/2 h-px bg-app-border/70" />
					<div className="absolute left-1/2 top-0 h-full w-px bg-app-border/70" />
					<div className="absolute inset-x-[18%] bottom-[18%] h-px bg-primary/25" />
					<div className="relative flex h-full items-center justify-center p-6">
						<div className="aspect-[3/4] h-full max-h-[42rem] min-h-0 w-full max-w-[32rem] rounded-lg border border-dashed border-app-border bg-app-panel/60" />
					</div>
				</div>
				<div className="absolute inset-0 z-10 flex items-center justify-center p-5">
					<div
						className="max-w-md rounded-2xl border border-app-border bg-app-panel p-6 text-center"
						role="status"
						data-testid="model2d-unavailable"
					>
						<span className="mx-auto flex size-12 items-center justify-center rounded-xl border border-app-border bg-app-soft text-muted">
							<Construction size={24} aria-hidden="true" />
						</span>
						<h2 className="mt-4 text-xl font-semibold text-app-text">
							{t("model2d.viewport.unavailableTitle")}
						</h2>
						<p className="mt-2 text-sm leading-6 text-muted">
							{t("model2d.viewport.unavailableDescription")}
						</p>
					</div>
				</div>
			</div>
		</section>
	);
}

type Model2DHeaderProps = {
	controls: AppHeaderControlProps;
};

function Model2DHeader({ controls }: Model2DHeaderProps) {
	const { t } = useI18n();

	return (
		<AppHeaderBar
			leading={
				<span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-primary text-primary-text sm:size-11">
					<Layers size={21} aria-hidden="true" />
				</span>
			}
			title={t("model2d.header.title")}
			desktopActions={<AppHeaderDesktopControls {...controls} />}
			mobileMenuContent={<AppHeaderMobileControls {...controls} />}
		/>
	);
}

function Model2DInspector() {
	return (
		<aside
			className="hidden min-h-0 w-14 shrink-0 border-l border-app-border bg-app-panel/62 xl:flex xl:flex-col"
			data-testid="model2d-details"
		/>
	);
}

type ToolButtonProps = {
	icon: LucideIcon;
	label: string;
	active?: boolean;
};

function ToolButton({ icon: Icon, label, active = false }: ToolButtonProps) {
	return (
		<IconButton
			variant={active ? "selected" : "default"}
			fullWidth
			disabled
			aria-label={label}
			title={label}
		>
			<Icon size={17} aria-hidden="true" />
		</IconButton>
	);
}

export default Model2DPage;
