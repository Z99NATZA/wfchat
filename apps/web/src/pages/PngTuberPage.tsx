import AppHeaderBar from "@/components/header/AppHeaderBar";
import {
	AppHeaderDesktopControls,
	AppHeaderMobileControls,
	type AppHeaderControlProps
} from "@/components/header/AppHeaderControls";
import Button from "@/components/ui/Button";
import IconButton from "@/components/ui/IconButton";
import {
	AIKO_PNGTUBER_EMOTIONS,
	type AikoEmotionId,
	type AikoPngTuberEmotion
} from "@/features/avatar/data/aikoPngTuber";
import PngTuberRenderer from "@/features/avatar/renderers/pngtuber/PngTuberRenderer";
import { useAvatarRuntime } from "@/features/avatar/runtime/avatarRuntimeContext";
import type { AvatarMotionState } from "@/features/avatar/runtime/avatarRuntimeTypes";
import AppLayout from "@/layouts/AppLayout";
import { useMemo, type ReactNode } from "react";
import {
	Brain,
	CircleDot,
	Eye,
	type LucideIcon,
	MessageCircle,
	Move,
	ScanFace,
	Sparkles,
	UserRound
} from "lucide-react";
import { useI18n } from "@/i18n/i18nContext";

type PngTuberPageProps = {
	activityBar: ReactNode;
	backgroundImageUrl: string;
	headerControls: AppHeaderControlProps;
};

const pngTuberAssets = [
	{ nameKey: "pngtuber.assets.aikoPngTuber", statusKey: "pngtuber.assets.ready", active: true },
	{ nameKey: "pngtuber.assets.expressionSet", statusKey: "pngtuber.assets.ready", active: false },
	{
		nameKey: "pngtuber.assets.aiStateBridge",
		statusKey: "pngtuber.assets.markerOnly",
		active: false
	}
];

const pngTuberMotionControls: Array<{
	id: AvatarMotionState;
	icon: LucideIcon;
	labelKey: string;
}> = [
	{ id: "idle", icon: CircleDot, labelKey: "pngtuber.controls.setIdle" },
	{ id: "thinking", icon: Brain, labelKey: "pngtuber.controls.setThinking" },
	{ id: "talking", icon: MessageCircle, labelKey: "pngtuber.controls.setTalking" }
];

function PngTuberPage({ activityBar, backgroundImageUrl, headerControls }: PngTuberPageProps) {
	const { t } = useI18n();
	const { state: runtimeState, setExpression, setMotionState } = useAvatarRuntime();
	const activeEmotion = useMemo(
		() =>
			AIKO_PNGTUBER_EMOTIONS.find((emotion) => emotion.id === runtimeState.expressionId) ??
			AIKO_PNGTUBER_EMOTIONS[0],
		[runtimeState.expressionId]
	);
	const activeEmotionId = activeEmotion.id;
	const motionState = runtimeState.motionState;

	function handleCycleExpression() {
		const activeIndex = AIKO_PNGTUBER_EMOTIONS.findIndex(
			(emotion) => emotion.id === activeEmotionId
		);
		const nextEmotion =
			AIKO_PNGTUBER_EMOTIONS[(activeIndex + 1) % AIKO_PNGTUBER_EMOTIONS.length];
		setExpression(nextEmotion.id);
	}

	return (
		<AppLayout
			activityBar={activityBar}
			backgroundImageUrl={backgroundImageUrl}
			sidebar={
				<PngTuberSidebar
					activeEmotionId={activeEmotionId}
					onEmotionChange={setExpression}
				/>
			}
			header={<PngTuberHeader controls={headerControls} />}
			details={<PngTuberInspector activeEmotion={activeEmotion} motionState={motionState} />}
		>
			<section className="flex min-h-0 flex-1 flex-col bg-app-bg/40">
				<div className="flex h-12 shrink-0 items-center justify-between border-b border-app-border bg-app-panel/62 px-4 text-xs text-muted">
					<div className="flex items-center gap-2">
						<span className="flex size-7 items-center justify-center rounded-lg border border-app-border bg-app-soft text-app-text">
							<ScanFace size={15} aria-hidden="true" />
						</span>
						<span>{t("pngtuber.viewport.stage")}</span>
					</div>
					<div className="flex items-center gap-2">
						<div className="flex items-center gap-1 rounded-lg border border-app-border bg-app-soft p-1">
							{pngTuberMotionControls.map((control) => {
								const Icon = control.icon;
								const isActive = motionState === control.id;

								return (
									<IconButton
										key={control.id}
										size="xs"
										variant={isActive ? "selected" : "ghost"}
										aria-label={t(control.labelKey)}
										title={t(control.labelKey)}
										aria-pressed={isActive}
										onClick={() => setMotionState(control.id)}
									>
										<Icon size={15} aria-hidden="true" />
									</IconButton>
								);
							})}
						</div>
						<IconButton
							size="sm"
							aria-label={t("pngtuber.viewport.expressionTool")}
							title={t("pngtuber.viewport.expressionTool")}
							onClick={handleCycleExpression}
						>
							<Sparkles size={16} aria-hidden="true" />
						</IconButton>
					</div>
				</div>

				<div className="relative min-h-0 flex-1 overflow-hidden">
					<div className="pointer-events-none absolute inset-0 bg-app-soft/30" />
					<div className="pointer-events-none absolute inset-x-0 top-1/2 h-px bg-app-border/70" />
					<div className="pointer-events-none absolute left-1/2 top-0 h-full w-px bg-app-border/70" />
					<div className="pointer-events-none absolute inset-x-[18%] bottom-[18%] h-px bg-primary/25" />
					<div className="pointer-events-none relative flex h-full items-center justify-center p-6">
						<div className="relative flex h-full max-h-[44rem] w-full max-w-[42rem] items-end justify-center">
							<div className="absolute bottom-0 h-[76%] w-[72%] rounded-full border border-primary/20 bg-primary/8" />
							<PngTuberRenderer
								emotion={activeEmotion}
								motionState={motionState}
								alt={t("pngtuber.previewAlt", {
									expression: t(activeEmotion.labelKey)
								})}
							/>
							<div className="absolute bottom-4 right-4 z-20 flex items-center gap-2 rounded-lg border border-app-border bg-app-panel/92 px-3 py-2 text-xs text-muted">
								<MessageCircle size={14} aria-hidden="true" />
								{t(motionStateLabelKey(motionState))}
							</div>
						</div>
					</div>
					<div className="pointer-events-none absolute bottom-4 left-4 flex items-center gap-2 rounded-lg border border-app-border bg-app-panel/92 px-3 py-2 text-xs text-muted">
						<CircleDot size={14} aria-hidden="true" />
						{t(activeEmotion.descriptionKey)}
					</div>
					<div
						className="absolute inset-x-4 top-4 z-30 flex flex-wrap justify-center gap-2"
						data-pngtuber-emotion-strip
					>
						{AIKO_PNGTUBER_EMOTIONS.map((emotion) => (
							<Button
								key={emotion.id}
								variant={emotion.id === activeEmotionId ? "selected" : "ghost"}
								size="sm"
								aria-pressed={emotion.id === activeEmotionId}
								onClick={() => setExpression(emotion.id)}
							>
								{t(emotion.labelKey)}
							</Button>
						))}
					</div>
				</div>
			</section>
		</AppLayout>
	);
}

type PngTuberSidebarProps = {
	activeEmotionId: AikoEmotionId;
	onEmotionChange: (emotionId: AikoEmotionId) => void;
};

function PngTuberSidebar({ activeEmotionId, onEmotionChange }: PngTuberSidebarProps) {
	const { t } = useI18n();

	return (
		<aside className="hidden h-full w-[18.5rem] shrink-0 border-r border-app-border bg-app-panel/62 lg:flex lg:flex-col">
			<div className="flex h-16 items-center border-b border-app-border px-5">
				<div>
					<p className="text-base font-semibold text-app-text">
						{t("pngtuber.sidebar.title")}
					</p>
					<p className="truncate text-xs text-muted">{t("pngtuber.sidebar.subtitle")}</p>
				</div>
			</div>

			<div className="border-b border-app-border p-4">
				<div className="grid grid-cols-3 gap-2">
					<ToolButton icon={Move} label={t("pngtuber.tools.pose")} active />
					<ToolButton icon={Sparkles} label={t("pngtuber.tools.expression")} />
					<ToolButton icon={Eye} label={t("pngtuber.tools.view")} />
				</div>
			</div>
			<div className="flex-1 overflow-y-auto p-3">
				<p className="px-1 pb-2 text-xs font-semibold uppercase text-muted">
					{t("pngtuber.sidebar.assets")}
				</p>
				<div className="space-y-2">
					{pngTuberAssets.map((asset) => (
						<Button
							key={asset.nameKey}
							variant={asset.active ? "selected" : "ghost"}
							size="row"
							align="start"
							fullWidth
						>
							<span className="flex size-10 shrink-0 items-center justify-center rounded-lg border border-app-border bg-app-soft text-muted">
								<UserRound size={18} aria-hidden="true" />
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
				<p className="px-1 pb-2 pt-5 text-xs font-semibold uppercase text-muted">
					{t("pngtuber.sidebar.expressions")}
				</p>
				<div className="space-y-2">
					{AIKO_PNGTUBER_EMOTIONS.map((emotion) => (
						<Button
							key={emotion.id}
							variant={emotion.id === activeEmotionId ? "selected" : "ghost"}
							size="row"
							align="start"
							fullWidth
							onClick={() => onEmotionChange(emotion.id)}
						>
							<span className="flex size-9 shrink-0 items-center justify-center rounded-lg border border-app-border bg-app-soft text-muted">
								<Sparkles size={16} aria-hidden="true" />
							</span>
							<span className="min-w-0 flex-1">
								<span className="block truncate text-sm font-semibold text-app-text">
									{t(emotion.labelKey)}
								</span>
								<span className="text-xs text-muted">
									{t(emotion.descriptionKey)}
								</span>
							</span>
						</Button>
					))}
				</div>
			</div>
		</aside>
	);
}

type PngTuberHeaderProps = {
	controls: AppHeaderControlProps;
};

function PngTuberHeader({ controls }: PngTuberHeaderProps) {
	const { t } = useI18n();

	return (
		<AppHeaderBar
			leading={
				<span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-primary text-primary-text sm:size-11">
					<UserRound size={21} aria-hidden="true" />
				</span>
			}
			title={t("pngtuber.header.title")}
			desktopActions={<AppHeaderDesktopControls {...controls} />}
			mobileMenuContent={<AppHeaderMobileControls {...controls} />}
		/>
	);
}

type PngTuberInspectorProps = {
	activeEmotion: AikoPngTuberEmotion;
	motionState: AvatarMotionState;
};

function PngTuberInspector({ activeEmotion, motionState }: PngTuberInspectorProps) {
	const { t } = useI18n();
	const inspectorRows = [
		{ label: t("pngtuber.inspector.expression"), value: t(activeEmotion.labelKey) },
		{ label: t("pngtuber.inspector.motion"), value: t(motionStateLabelKey(motionState)) },
		{ label: t("pngtuber.inspector.asset"), value: activeEmotion.assetUrl },
		{ label: t("pngtuber.inspector.bridge"), value: t("pngtuber.inspector.bridgePending") }
	];

	return (
		<aside className="hidden min-h-0 border-l border-app-border bg-app-panel/62 xl:flex xl:flex-col">
			<div className="border-b border-app-border px-4 py-4">
				<p className="text-sm font-semibold text-app-text">
					{t("pngtuber.inspector.title")}
				</p>
				<p className="mt-1 text-xs text-muted">{t("pngtuber.inspector.subtitle")}</p>
			</div>
			<div className="space-y-3 overflow-y-auto p-4">
				{inspectorRows.map((row) => (
					<div
						key={row.label}
						className="rounded-lg border border-app-border bg-app-soft p-3"
					>
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

function motionStateLabelKey(motionState: AvatarMotionState) {
	switch (motionState) {
		case "idle":
			return "pngtuber.state.idle";
		case "thinking":
			return "pngtuber.state.thinking";
		case "talking":
			return "pngtuber.state.talking";
	}
}

export default PngTuberPage;
