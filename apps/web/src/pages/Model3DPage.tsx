import AppLayout from "@/layouts/AppLayout";
import type { ReactNode } from "react";
import {
	Box,
	CircleDot,
	Eye,
	Lightbulb,
	type LucideIcon,
	Move3D,
	Rotate3D,
	Scan,
	SlidersHorizontal
} from "lucide-react";
import { useI18n } from "@/i18n";
import { cn } from "@/utils/classNames";

type Model3DPageProps = {
	activityBar: ReactNode;
};

const modelAssets = [
	{ name: "Aiko room", status: "Draft", active: true },
	{ name: "Character rig", status: "Idle", active: false },
	{ name: "Stage props", status: "Ready", active: false }
];

const inspectorRows = [
	{ label: "Position", value: "0, 1.2, -4" },
	{ label: "Rotation", value: "0, 32, 0" },
	{ label: "Scale", value: "1.00" },
	{ label: "Material", value: "Matte" }
];

function Model3DPage({ activityBar }: Model3DPageProps) {
	const { t } = useI18n();

	return (
		<AppLayout
			activityBar={activityBar}
			sidebar={<ModelSidebar />}
			header={<ModelHeader />}
			details={<ModelInspector />}
		>
			<section className="flex min-h-0 flex-1 flex-col bg-app-bg/40">
				<div className="flex h-12 shrink-0 items-center justify-between border-b border-app-border bg-app-panel/62 px-4 text-xs text-muted">
					<div className="flex items-center gap-2">
						<span className="flex size-7 items-center justify-center rounded-lg border border-app-border bg-app-soft text-app-text">
							<Scan size={15} aria-hidden="true" />
						</span>
						<span>{t("model3d.viewport.camera")}</span>
					</div>
					<div className="flex items-center gap-2">
						<button
							type="button"
							className="flex size-8 items-center justify-center rounded-lg border border-app-border bg-app-soft text-muted transition hover:border-primary hover:text-primary"
							aria-label={t("model3d.viewport.moveTool")}
							title={t("model3d.viewport.moveTool")}
						>
							<Move3D size={16} aria-hidden="true" />
						</button>
						<button
							type="button"
							className="flex size-8 items-center justify-center rounded-lg border border-app-border bg-app-soft text-muted transition hover:border-primary hover:text-primary"
							aria-label={t("model3d.viewport.rotateTool")}
							title={t("model3d.viewport.rotateTool")}
						>
							<Rotate3D size={16} aria-hidden="true" />
						</button>
					</div>
				</div>

				<div className="relative min-h-0 flex-1 overflow-hidden">
					<div className="absolute inset-0 bg-app-soft/30" />
					<div className="absolute left-1/2 top-0 h-full w-px bg-app-border/70" />
					<div className="absolute left-0 top-1/2 h-px w-full bg-app-border/70" />
					<div className="absolute inset-x-0 bottom-24 h-px bg-primary/25" />
					<div className="absolute bottom-0 left-1/2 h-24 w-px bg-primary/25" />
					<div className="relative flex h-full items-center justify-center p-6">
						<div className="relative aspect-square w-[min(28rem,70vw,58vh)]">
							<div className="absolute inset-[16%] rotate-6 rounded-lg border-2 border-primary/55 bg-app-panel/62 shadow-soft" />
							<div className="absolute inset-[24%] -rotate-12 rounded-lg border border-app-border bg-app-soft/82" />
							<div className="absolute left-[31%] top-[18%] h-[64%] w-px bg-primary/55" />
							<div className="absolute left-[18%] top-[32%] h-px w-[64%] bg-primary/55" />
							<div className="absolute left-[50%] top-[18%] h-[64%] w-px bg-app-border" />
							<div className="absolute left-[18%] top-[50%] h-px w-[64%] bg-app-border" />
							<div className="absolute bottom-[18%] right-[16%] flex size-14 items-center justify-center rounded-lg border border-app-border bg-app-panel/92 text-primary shadow-soft">
								<Box size={28} aria-hidden="true" />
							</div>
						</div>
					</div>
					<div className="absolute bottom-4 left-4 flex items-center gap-2 rounded-lg border border-app-border bg-app-panel/92 px-3 py-2 text-xs text-muted shadow-soft">
						<CircleDot size={14} aria-hidden="true" />
						{t("model3d.viewport.status")}
					</div>
				</div>
			</section>
		</AppLayout>
	);
}

function ModelSidebar() {
	const { t } = useI18n();

	return (
		<aside className="hidden h-full w-[18.5rem] shrink-0 border-r border-app-border bg-app-panel/62 lg:flex lg:flex-col">
			<div className="flex h-16 items-center gap-3 border-b border-app-border px-5">
				<div className="flex size-10 items-center justify-center rounded-lg bg-primary text-white shadow-soft">
					<Box size={20} aria-hidden="true" />
				</div>
				<div className="min-w-0">
					<p className="text-base font-semibold text-app-text">{t("model3d.sidebar.title")}</p>
					<p className="truncate text-xs text-muted">{t("model3d.sidebar.subtitle")}</p>
				</div>
			</div>
			<div className="border-b border-app-border p-4">
				<div className="grid grid-cols-3 gap-2">
					<ToolButton icon={Move3D} label={t("model3d.tools.move")} active />
					<ToolButton icon={Rotate3D} label={t("model3d.tools.rotate")} />
					<ToolButton icon={Eye} label={t("model3d.tools.view")} />
				</div>
			</div>
			<div className="flex-1 overflow-y-auto p-3">
				<p className="px-1 pb-2 text-xs font-semibold uppercase text-muted">
					{t("model3d.sidebar.assets")}
				</p>
				<div className="space-y-2">
					{modelAssets.map((asset) => (
						<button
							key={asset.name}
							type="button"
							className={cn(
								"flex w-full items-center gap-3 rounded-lg border p-3 text-left transition",
								asset.active
									? "border-primary/30 bg-primary/10"
									: "border-transparent hover:border-app-border hover:bg-app-soft"
							)}
						>
							<span className="flex size-10 shrink-0 items-center justify-center rounded-lg border border-app-border bg-app-soft text-muted">
								<Box size={18} aria-hidden="true" />
							</span>
							<span className="min-w-0 flex-1">
								<span className="block truncate text-sm font-semibold text-app-text">{asset.name}</span>
								<span className="text-xs text-muted">{asset.status}</span>
							</span>
						</button>
					))}
				</div>
			</div>
		</aside>
	);
}

function ModelHeader() {
	const { t } = useI18n();

	return (
		<header className="sticky top-0 z-20 border-b border-app-border bg-app-panel/62 px-4 py-2 lg:px-6">
			<div className="flex min-h-12 items-center justify-between gap-3 sm:h-16">
				<div className="min-w-0">
					<h1 className="truncate text-base font-semibold text-app-text">{t("model3d.header.title")}</h1>
					<p className="hidden text-xs text-muted sm:block">{t("model3d.header.subtitle")}</p>
				</div>
				<div className="flex items-center gap-2">
					<button
						type="button"
						className="flex size-10 items-center justify-center rounded-lg border border-app-border bg-app-soft text-muted transition hover:border-primary hover:text-primary"
						aria-label={t("model3d.header.lighting")}
						title={t("model3d.header.lighting")}
					>
						<Lightbulb size={18} aria-hidden="true" />
					</button>
					<button
						type="button"
						className="flex size-10 items-center justify-center rounded-lg border border-app-border bg-app-soft text-muted transition hover:border-primary hover:text-primary"
						aria-label={t("model3d.header.settings")}
						title={t("model3d.header.settings")}
					>
						<SlidersHorizontal size={18} aria-hidden="true" />
					</button>
				</div>
			</div>
		</header>
	);
}

function ModelInspector() {
	const { t } = useI18n();

	return (
		<aside className="hidden min-h-0 border-l border-app-border bg-app-panel/62 xl:flex xl:flex-col">
			<div className="border-b border-app-border px-4 py-4">
				<p className="text-sm font-semibold text-app-text">{t("model3d.inspector.title")}</p>
				<p className="mt-1 text-xs text-muted">{t("model3d.inspector.subtitle")}</p>
			</div>
			<div className="space-y-3 overflow-y-auto p-4">
				{inspectorRows.map((row) => (
					<div key={row.label} className="rounded-lg border border-app-border bg-app-soft p-3">
						<p className="text-xs font-semibold text-muted">{row.label}</p>
						<p className="mt-1 text-sm text-app-text">{row.value}</p>
					</div>
				))}
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
		<button
			type="button"
			className={cn(
				"flex h-10 items-center justify-center rounded-lg border text-muted transition hover:border-primary hover:text-primary",
				active ? "border-primary/30 bg-primary/10 text-app-text" : "border-app-border bg-app-soft"
			)}
			aria-label={label}
			title={label}
		>
			<Icon size={17} aria-hidden="true" />
		</button>
	);
}

export default Model3DPage;
