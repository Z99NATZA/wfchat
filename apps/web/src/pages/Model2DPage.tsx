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
	FileClock,
	Gauge,
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

const runtimeRows = [
	{ icon: FileClock, labelKey: "model2d.runtime.modelFile", valueKey: "model2d.runtime.pending" },
	{ icon: Sparkles, labelKey: "model2d.runtime.expression", valueKey: "model2d.runtime.pending" },
	{ icon: Gauge, labelKey: "model2d.runtime.motionPriority", valueKey: "model2d.runtime.pending" }
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
		<aside className="hidden h-full w-[18.5rem] shrink-0 border-r border-app-border bg-app-panel/62 lg:flex lg:flex-col">
			<div className="flex h-16 items-center border-b border-app-border px-5">
				<div>
					<p className="text-base font-semibold text-app-text">
						{t("model2d.sidebar.title")}
					</p>
					<p className="truncate text-xs text-muted">{t("model2d.sidebar.subtitle")}</p>
				</div>
			</div>

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
		</aside>
	);
}

function Model2DStage() {
	const { t } = useI18n();

	return (
		<section className="flex min-h-0 flex-1 flex-col bg-app-bg/40">
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
				<div className="absolute inset-0 bg-app-soft/30" />
				<div className="absolute inset-x-0 top-1/2 h-px bg-app-border/70" />
				<div className="absolute left-1/2 top-0 h-full w-px bg-app-border/70" />
				<div className="absolute inset-x-[18%] bottom-[18%] h-px bg-primary/25" />
				<div className="relative flex h-full items-center justify-center p-6">
					<div className="flex aspect-[3/4] h-full max-h-[42rem] min-h-0 w-full max-w-[32rem] flex-col items-center justify-center rounded-lg border border-dashed border-app-border bg-app-panel/60">
						<div className="flex size-24 items-center justify-center rounded-2xl border border-app-border bg-app-soft text-muted">
							<ScanFace size={42} aria-hidden="true" />
						</div>
						<p className="mt-5 text-sm font-semibold text-app-text">
							{t("model2d.viewport.modelSlot")}
						</p>
						<p className="mt-1 text-xs text-muted">
							{t("model2d.viewport.modelSlotStatus")}
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
	const { t } = useI18n();

	return (
		<aside className="hidden min-h-0 border-l border-app-border bg-app-panel/62 xl:flex xl:flex-col">
			<div className="border-b border-app-border px-4 py-4">
				<p className="text-sm font-semibold text-app-text">
					{t("model2d.inspector.title")}
				</p>
				<p className="mt-1 text-xs text-muted">{t("model2d.inspector.subtitle")}</p>
			</div>
			<div className="space-y-3 overflow-y-auto p-4">
				{runtimeRows.map((row) => {
					const Icon = row.icon;

					return (
						<div
							key={row.labelKey}
							className="rounded-lg border border-app-border bg-app-soft p-3"
						>
							<div className="flex items-center gap-2 text-xs font-semibold text-muted">
								<Icon size={14} aria-hidden="true" />
								{t(row.labelKey)}
							</div>
							<p className="mt-2 text-sm text-app-text">{t(row.valueKey)}</p>
						</div>
					);
				})}
			</div>
		</aside>
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
			aria-label={label}
			title={label}
		>
			<Icon size={17} aria-hidden="true" />
		</IconButton>
	);
}

export default Model2DPage;
