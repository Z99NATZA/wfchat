import AppHeaderBar from "@/components/header/AppHeaderBar";
import {
	AppHeaderDesktopControls,
	AppHeaderMobileControls,
	type AppHeaderControlProps
} from "@/components/header/AppHeaderControls";
import IconButton from "@/components/ui/IconButton";
import {
	AIKO_PNGTUBER_EMOTIONS,
	DEFAULT_AIKO_EMOTION_ID,
	type AikoEmotionId,
	type AikoPngTuberEmotion
} from "@/features/avatar/data/aikoPngTuber";
import AppLayout from "@/layouts/AppLayout";
import { useMemo, useState, type ReactNode } from "react";
import {
	Bell,
	CircleDot,
	Eye,
	type LucideIcon,
	MessageCircle,
	Move,
	Pause,
	Play,
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
	{ nameKey: "avatar.assets.aikoPngTuber", statusKey: "avatar.assets.ready", active: true },
	{ nameKey: "avatar.assets.expressionSet", statusKey: "avatar.assets.ready", active: false },
	{ nameKey: "avatar.assets.aiStateBridge", statusKey: "avatar.assets.markerOnly", active: false }
];

const darkAppControlHoverClassName =
	"dark:hover:border-action-border dark:hover:bg-action-hover dark:hover:text-app-text dark:focus-visible:ring-action-ring/25";

function AvatarPage({ activityBar, backgroundImageUrl, headerControls }: AvatarPageProps) {
	const { t } = useI18n();
	const [activeEmotionId, setActiveEmotionId] = useState<AikoEmotionId>(DEFAULT_AIKO_EMOTION_ID);
	const [isTalking, setIsTalking] = useState(false);
	const activeEmotion = useMemo(
		() =>
			AIKO_PNGTUBER_EMOTIONS.find((emotion) => emotion.id === activeEmotionId) ??
			AIKO_PNGTUBER_EMOTIONS[0],
		[activeEmotionId]
	);

	function handleCycleExpression() {
		const activeIndex = AIKO_PNGTUBER_EMOTIONS.findIndex((emotion) => emotion.id === activeEmotionId);
		const nextEmotion = AIKO_PNGTUBER_EMOTIONS[(activeIndex + 1) % AIKO_PNGTUBER_EMOTIONS.length];
		setActiveEmotionId(nextEmotion.id);
	}

	return (
		<AppLayout
			activityBar={activityBar}
			backgroundImageUrl={backgroundImageUrl}
			sidebar={<AvatarSidebar activeEmotionId={activeEmotionId} onEmotionChange={setActiveEmotionId} />}
			header={<AvatarHeader controls={headerControls} />}
			details={<AvatarInspector activeEmotion={activeEmotion} isTalking={isTalking} />}
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
							className={cn(
								"flex size-8 items-center justify-center rounded-lg border text-muted transition hover:border-primary hover:text-primary",
								darkAppControlHoverClassName,
								isTalking ? "border-primary/35 bg-primary/10 text-app-text" : "border-app-border bg-app-soft"
							)}
							aria-label={isTalking ? t("avatar.controls.stopTalking") : t("avatar.controls.startTalking")}
							title={isTalking ? t("avatar.controls.stopTalking") : t("avatar.controls.startTalking")}
							onClick={() => setIsTalking((current) => !current)}
						>
							{isTalking ? <Pause size={16} aria-hidden="true" /> : <Play size={16} aria-hidden="true" />}
						</button>
						<button
							type="button"
							className={cn(
								"flex size-8 items-center justify-center rounded-lg border border-app-border bg-app-soft text-muted transition hover:border-primary hover:text-primary",
								darkAppControlHoverClassName
							)}
							aria-label={t("avatar.viewport.expressionTool")}
							title={t("avatar.viewport.expressionTool")}
							onClick={handleCycleExpression}
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
						<div className="relative flex h-full max-h-[44rem] w-full max-w-[42rem] items-end justify-center">
							<div className="absolute bottom-0 h-[76%] w-[72%] rounded-full border border-primary/20 bg-primary/8" />
							<img
								src={activeEmotion.assetUrl}
								alt={t("avatar.previewAlt", { expression: t(activeEmotion.labelKey) })}
								className={cn(
									"pngtuber-avatar relative z-10 h-full max-h-full w-full object-contain object-bottom",
									isTalking && "pngtuber-avatar--talking"
								)}
							/>
							<div className="absolute bottom-4 right-4 z-20 flex items-center gap-2 rounded-lg border border-app-border bg-app-panel/92 px-3 py-2 text-xs text-muted shadow-soft">
								<MessageCircle size={14} aria-hidden="true" />
								{isTalking ? t("avatar.state.talking") : t("avatar.state.idle")}
							</div>
						</div>
					</div>
					<div className="absolute bottom-4 left-4 flex items-center gap-2 rounded-lg border border-app-border bg-app-panel/92 px-3 py-2 text-xs text-muted shadow-soft">
						<CircleDot size={14} aria-hidden="true" />
						{t(activeEmotion.descriptionKey)}
					</div>
					<div className="absolute inset-x-4 top-4 flex flex-wrap justify-center gap-2">
						{AIKO_PNGTUBER_EMOTIONS.map((emotion) => (
							<button
								key={emotion.id}
								type="button"
								className={cn(
									"rounded-lg border px-3 py-2 text-xs font-semibold shadow-soft transition",
									emotion.id === activeEmotionId
										? "border-primary/35 bg-primary/10 text-app-text"
										: cn(
												"border-app-border bg-app-panel/92 text-muted hover:border-primary hover:text-primary",
												darkAppControlHoverClassName
											)
								)}
								onClick={() => setActiveEmotionId(emotion.id)}
							>
								{t(emotion.labelKey)}
							</button>
						))}
					</div>
				</div>
			</section>
		</AppLayout>
	);
}

type AvatarSidebarProps = {
	activeEmotionId: AikoEmotionId;
	onEmotionChange: (emotionId: AikoEmotionId) => void;
};

function AvatarSidebar({ activeEmotionId, onEmotionChange }: AvatarSidebarProps) {
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
							key={asset.nameKey}
							type="button"
							className={cn(
								"flex w-full items-center gap-3 rounded-lg border p-3 text-left transition",
								asset.active
									? "border-primary/30 bg-primary/10"
									: cn(
											"border-transparent hover:border-app-border hover:bg-app-soft",
											darkAppControlHoverClassName
										)
							)}
						>
							<span className="flex size-10 shrink-0 items-center justify-center rounded-lg border border-app-border bg-app-soft text-muted">
								<UserRound size={18} aria-hidden="true" />
							</span>
							<span className="min-w-0 flex-1">
								<span className="block truncate text-sm font-semibold text-app-text">{t(asset.nameKey)}</span>
								<span className="text-xs text-muted">{t(asset.statusKey)}</span>
							</span>
						</button>
					))}
				</div>
				<p className="px-1 pb-2 pt-5 text-xs font-semibold uppercase text-muted">
					{t("avatar.sidebar.expressions")}
				</p>
				<div className="space-y-2">
					{AIKO_PNGTUBER_EMOTIONS.map((emotion) => (
						<button
							key={emotion.id}
							type="button"
							className={cn(
								"flex w-full items-center gap-3 rounded-lg border p-3 text-left transition",
								emotion.id === activeEmotionId
									? "border-primary/30 bg-primary/10"
									: cn(
											"border-transparent hover:border-app-border hover:bg-app-soft",
											darkAppControlHoverClassName
										)
							)}
							onClick={() => onEmotionChange(emotion.id)}
						>
							<span className="flex size-9 shrink-0 items-center justify-center rounded-lg border border-app-border bg-app-soft text-muted">
								<Sparkles size={16} aria-hidden="true" />
							</span>
							<span className="min-w-0 flex-1">
								<span className="block truncate text-sm font-semibold text-app-text">
									{t(emotion.labelKey)}
								</span>
								<span className="text-xs text-muted">{t(emotion.descriptionKey)}</span>
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

type AvatarInspectorProps = {
	activeEmotion: AikoPngTuberEmotion;
	isTalking: boolean;
};

function AvatarInspector({ activeEmotion, isTalking }: AvatarInspectorProps) {
	const { t } = useI18n();
	const inspectorRows = [
		{ label: t("avatar.inspector.expression"), value: t(activeEmotion.labelKey) },
		{ label: t("avatar.inspector.motion"), value: isTalking ? t("avatar.state.talking") : t("avatar.state.idle") },
		{ label: t("avatar.inspector.asset"), value: activeEmotion.assetUrl },
		{ label: t("avatar.inspector.bridge"), value: t("avatar.inspector.bridgePending") }
	];

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
				darkAppControlHoverClassName,
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
