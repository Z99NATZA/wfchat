import AppHeaderBar from "@/components/header/AppHeaderBar";
import {
	AppHeaderDesktopControls,
	AppHeaderMobileControls,
	type AppHeaderControlProps
} from "@/components/header/AppHeaderControls";
import IconButton from "@/components/ui/IconButton";
import AppLayout from "@/layouts/AppLayout";
import type { ReactNode } from "react";
import {
	Bell,
	CircleDot,
	Eye,
	type LucideIcon,
	Move,
	ScanFace,
	Sparkles,
	Trash2,
	UserRound
} from "lucide-react";
import { useI18n } from "@/i18n";
import { cn } from "@/utils/classNames";

type AvatarPageProps = {
	activityBar: ReactNode;
	backgroundImageUrl: string;
	headerControls: AppHeaderControlProps;
};

const avatarAssets = [
	{ name: "Aiko avatar", status: "Draft", active: true },
	{ name: "Expression set", status: "Idle", active: false },
	{ name: "Room overlay", status: "Ready", active: false }
];

const inspectorRows = [
	{ label: "Expression", value: "Soft smile" },
	{ label: "Pose", value: "Idle front" },
	{ label: "Motion", value: "Breathing loop" },
	{ label: "Layer", value: "Character" }
];

function AvatarPage({ activityBar, backgroundImageUrl, headerControls }: AvatarPageProps) {
	const { t } = useI18n();

	return (
		<AppLayout
			activityBar={activityBar}
			backgroundImageUrl={backgroundImageUrl}
			sidebar={<AvatarSidebar />}
			header={<AvatarHeader controls={headerControls} />}
			details={<AvatarInspector />}
		>
			<section className="flex min-h-0 flex-1 flex-col bg-app-bg/40">
				<div className="flex h-12 shrink-0 items-center justify-between border-b border-app-border bg-app-panel/62 px-4 text-xs text-muted">
					<div className="flex items-center gap-2">
						<span className="flex size-7 items-center justify-center rounded-lg border border-app-border bg-app-soft text-app-text">
							<ScanFace size={15} aria-hidden="true" />
						</span>
						<span>{t("avatar.viewport.stage")}</span>
					</div>
					<div className="flex items-center gap-2">
						<button
							type="button"
							className="flex size-8 items-center justify-center rounded-lg border border-app-border bg-app-soft text-muted transition hover:border-primary hover:text-primary"
							aria-label={t("avatar.viewport.poseTool")}
							title={t("avatar.viewport.poseTool")}
						>
							<Move size={16} aria-hidden="true" />
						</button>
						<button
							type="button"
							className="flex size-8 items-center justify-center rounded-lg border border-app-border bg-app-soft text-muted transition hover:border-primary hover:text-primary"
							aria-label={t("avatar.viewport.expressionTool")}
							title={t("avatar.viewport.expressionTool")}
						>
							<Sparkles size={16} aria-hidden="true" />
						</button>
					</div>
				</div>

				<div className="relative min-h-0 flex-1 overflow-hidden">
					<div className="absolute inset-0 bg-app-soft/30" />
					<div className="absolute inset-x-0 top-1/2 h-px bg-app-border/70" />
					<div className="absolute left-1/2 top-0 h-full w-px bg-app-border/70" />
					<div className="absolute inset-x-[18%] bottom-[18%] h-px bg-primary/25" />
					<div className="relative flex h-full items-center justify-center p-6">
						<div className="relative aspect-[3/4] h-[min(34rem,78vh)] max-h-full w-auto">
							<div className="absolute inset-x-[18%] top-[8%] h-[20%] rounded-full border-2 border-primary/55 bg-app-panel/72 shadow-soft" />
							<div className="absolute inset-x-[28%] top-[16%] flex justify-between">
								<span className="size-3 rounded-full bg-primary/80" />
								<span className="size-3 rounded-full bg-primary/80" />
							</div>
							<div className="absolute left-[42%] top-[27%] h-1 w-[16%] rounded-full bg-primary/60" />
							<div className="absolute inset-x-[23%] top-[32%] h-[43%] rounded-t-[38%] rounded-b-lg border border-app-border bg-app-panel/82" />
							<div className="absolute left-[8%] top-[38%] h-[32%] w-[24%] -rotate-6 rounded-full border border-app-border bg-app-soft/82" />
							<div className="absolute right-[8%] top-[38%] h-[32%] w-[24%] rotate-6 rounded-full border border-app-border bg-app-soft/82" />
							<div className="absolute inset-x-[32%] bottom-[7%] h-[24%] rounded-lg border border-app-border bg-app-soft/82" />
							<div className="absolute -right-[6%] bottom-[15%] flex size-14 items-center justify-center rounded-lg border border-app-border bg-app-panel/92 text-primary shadow-soft">
								<UserRound size={28} aria-hidden="true" />
							</div>
						</div>
					</div>
					<div className="absolute bottom-4 left-4 flex items-center gap-2 rounded-lg border border-app-border bg-app-panel/92 px-3 py-2 text-xs text-muted shadow-soft">
						<CircleDot size={14} aria-hidden="true" />
						{t("avatar.viewport.status")}
					</div>
				</div>
			</section>
		</AppLayout>
	);
}

function AvatarSidebar() {
	const { t } = useI18n();

	return (
		<aside className="hidden h-full w-[18.5rem] shrink-0 border-r border-app-border bg-app-panel/62 lg:flex lg:flex-col">
			<div className="flex h-16 items-center gap-3 border-b border-app-border px-5">
				<div className="flex size-10 items-center justify-center rounded-lg bg-primary text-white shadow-soft">
					<UserRound size={20} aria-hidden="true" />
				</div>
				<div className="min-w-0">
					<p className="text-base font-semibold text-app-text">{t("avatar.sidebar.title")}</p>
					<p className="truncate text-xs text-muted">{t("avatar.sidebar.subtitle")}</p>
				</div>
			</div>
			<div className="border-b border-app-border p-4">
				<div className="grid grid-cols-3 gap-2">
					<ToolButton icon={Move} label={t("avatar.tools.pose")} active />
					<ToolButton icon={Sparkles} label={t("avatar.tools.expression")} />
					<ToolButton icon={Eye} label={t("avatar.tools.view")} />
				</div>
			</div>
			<div className="flex-1 overflow-y-auto p-3">
				<p className="px-1 pb-2 text-xs font-semibold uppercase text-muted">
					{t("avatar.sidebar.assets")}
				</p>
				<div className="space-y-2">
					{avatarAssets.map((asset) => (
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
								<UserRound size={18} aria-hidden="true" />
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

type AvatarHeaderProps = {
	controls: AppHeaderControlProps;
};

function AvatarHeader({ controls }: AvatarHeaderProps) {
	const { t } = useI18n();
	const notificationPlaceholder = (
		<IconButton
			className="hidden cursor-not-allowed opacity-45 grayscale md:flex"
			aria-label={t("chat.header.notifications")}
			disabled
			title={t("common.notSupportedYet")}
		>
			<Bell size={18} aria-hidden="true" />
		</IconButton>
	);
	const deletePlaceholder = (
		<IconButton
			className="cursor-not-allowed border-red-400/25 bg-red-500/10 text-red-500 opacity-45 grayscale"
			aria-label={t("avatar.header.deleteDisabled")}
			disabled
			title={t("avatar.header.deleteDisabled")}
		>
			<Trash2 size={18} aria-hidden="true" />
		</IconButton>
	);

	return (
		<AppHeaderBar
			leading={
				<span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-primary text-white shadow-soft sm:size-11">
					<UserRound size={21} aria-hidden="true" />
				</span>
			}
			title={t("avatar.header.title")}
			subtitle={t("avatar.header.subtitle")}
			titleAccessory={<Sparkles size={15} className="text-primary" aria-hidden="true" />}
			desktopActions={
				<AppHeaderDesktopControls
					{...controls}
					leadingActions={notificationPlaceholder}
					trailingActions={deletePlaceholder}
				/>
			}
			mobileMenuContent={<AppHeaderMobileControls {...controls} actions={deletePlaceholder} />}
		/>
	);
}

function AvatarInspector() {
	const { t } = useI18n();

	return (
		<aside className="hidden min-h-0 border-l border-app-border bg-app-panel/62 xl:flex xl:flex-col">
			<div className="border-b border-app-border px-4 py-4">
				<p className="text-sm font-semibold text-app-text">{t("avatar.inspector.title")}</p>
				<p className="mt-1 text-xs text-muted">{t("avatar.inspector.subtitle")}</p>
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

export default AvatarPage;
