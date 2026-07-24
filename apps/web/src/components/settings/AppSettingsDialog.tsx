import { Image, ScanFace, Volume2, X } from "lucide-react";
import { type FormEvent, useEffect, useState } from "react";
import { useDialogBackgroundSurface } from "@/components/dialog/useDialogBackgroundSurface";
import Button from "@/components/ui/Button";
import IconButton from "@/components/ui/IconButton";
import { useDialog } from "@/components/dialog/DialogContext";
import { useI18n } from "@/i18n/i18nContext";
import type { AvatarOverlayPosition, AvatarOverlaySize } from "@/stores/avatarOverlayStore";

type AppSettingsDialogProps = {
	isOpen: boolean;
	backgroundImageUrl: string;
	voiceCredits: Array<{ text: string }>;
	isAvatarOverlayVisible: boolean;
	isAssistantSpeechVisible: boolean;
	isAssistantSpeechAutoPlayEnabled: boolean;
	avatarOverlayPosition: AvatarOverlayPosition;
	avatarOverlaySize: AvatarOverlaySize;
	aikoName: string;
	onClose: () => void;
	onUpdateBackgroundImageUrl: (url: string) => void;
	onAvatarOverlayVisibleChange: (isVisible: boolean) => void;
	onAvatarOverlayPositionChange: (position: AvatarOverlayPosition) => void;
	onAvatarOverlaySizeChange: (size: AvatarOverlaySize) => void;
	onAssistantSpeechVisibleChange: (isVisible: boolean) => void;
	onAssistantSpeechAutoPlayEnabledChange: (isEnabled: boolean) => void;
	onResetLearnedContext: () => Promise<void>;
};

function AppSettingsDialog({
	isOpen,
	backgroundImageUrl,
	voiceCredits,
	isAvatarOverlayVisible,
	isAssistantSpeechVisible,
	isAssistantSpeechAutoPlayEnabled,
	avatarOverlayPosition,
	avatarOverlaySize,
	aikoName,
	onClose,
	onUpdateBackgroundImageUrl,
	onAvatarOverlayVisibleChange,
	onAvatarOverlayPositionChange,
	onAvatarOverlaySizeChange,
	onAssistantSpeechVisibleChange,
	onAssistantSpeechAutoPlayEnabledChange,
	onResetLearnedContext
}: AppSettingsDialogProps) {
	const { t } = useI18n();
	const { alert, confirm } = useDialog();
	const [draftUrl, setDraftUrl] = useState(backgroundImageUrl);
	const [isResettingMemory, setIsResettingMemory] = useState(false);
	const settingsSurface = useDialogBackgroundSurface(backgroundImageUrl, isOpen);

	useEffect(() => {
		if (!isOpen) {
			return;
		}

		setDraftUrl(backgroundImageUrl);
	}, [backgroundImageUrl, isOpen]);

	if (!isOpen) {
		return null;
	}

	function handleSubmit(event: FormEvent<HTMLFormElement>) {
		event.preventDefault();
		onUpdateBackgroundImageUrl(draftUrl);
	}

	function handleClear() {
		setDraftUrl("");
		onUpdateBackgroundImageUrl("");
	}

	async function handleResetLearnedContext() {
		const shouldReset = await confirm({
			title: t("settings.memory.resetConfirm", { aiko: aikoName }),
			confirmLabel: t("settings.memory.reset", { aiko: aikoName }),
			tone: "destructive"
		});
		if (!shouldReset) {
			return;
		}

		setIsResettingMemory(true);
		try {
			await onResetLearnedContext();
		} catch {
			await alert({ title: t("settings.memory.resetError", { aiko: aikoName }) });
		} finally {
			setIsResettingMemory(false);
		}
	}

	const trimmedDraftUrl = draftUrl.trim();

	return (
		<div className="fixed inset-0 z-50">
			<button
				type="button"
				className="absolute inset-0 bg-black/35"
				aria-label={t("settings.close")}
				onClick={onClose}
			/>
			<aside
				ref={settingsSurface.ref}
				className="app-surface-shell absolute inset-x-0 bottom-0 flex max-h-[92dvh] flex-col rounded-t-3xl border border-dialog-border sm:inset-y-0 sm:left-auto sm:right-0 sm:h-full sm:max-h-none sm:w-[420px] sm:rounded-none sm:border-y-0 sm:border-r-0"
				style={settingsSurface.style}
			>
				<header className="flex items-start justify-between gap-4 border-b border-dialog-border px-5 py-4">
					<div>
						<h2 className="text-xl font-semibold text-app-text">
							{t("settings.title")}
						</h2>
					</div>
					<IconButton
						variant="ghostDanger"
						size="sm"
						aria-label={t("settings.close")}
						onClick={onClose}
					>
						<X size={18} aria-hidden="true" />
					</IconButton>
				</header>

				<div className="chat-scroll flex-1 overflow-y-auto px-5 py-4">
					<section className="space-y-4">
						<div>
							<h3 className="text-sm font-semibold text-app-text">
								{t("settings.background.title")}
							</h3>
						</div>

						<div className="overflow-hidden rounded-xl border border-dialog-border bg-dialog-soft">
							{trimmedDraftUrl ? (
								<img
									src={trimmedDraftUrl}
									alt={t("settings.background.previewAlt")}
									className="aspect-video w-full object-cover"
								/>
							) : (
								<div className="flex aspect-video w-full items-center justify-center text-muted">
									<Image size={28} aria-hidden="true" />
								</div>
							)}
						</div>

						<form className="space-y-3" onSubmit={handleSubmit}>
							<label className="block">
								<span className="text-xs font-medium text-muted">
									{t("settings.background.imageUrl")}
								</span>
								<input
									type="url"
									className="mt-1 w-full rounded-xl border border-dialog-border bg-dialog-soft px-3 py-3 text-sm text-app-text outline-none transition placeholder:text-muted/70 focus:border-primary"
									value={draftUrl}
									placeholder={t("settings.background.imageUrlPlaceholder")}
									onChange={(event) => setDraftUrl(event.target.value)}
								/>
							</label>
							<div className="grid grid-cols-2 gap-2">
								<Button variant="destructive" size="lg" onClick={handleClear}>
									{t("settings.background.clear")}
								</Button>
								<Button type="submit" variant="primary" size="lg">
									{t("settings.background.apply")}
								</Button>
							</div>
						</form>
					</section>
					<section className="mt-6 space-y-3 border-t border-dialog-border pt-5">
						<div className="flex items-center gap-3">
							<div className="mt-0.5 rounded-xl bg-sky-500/10 p-2 text-sky-600 dark:bg-sky-300/15 dark:text-sky-200">
								<Volume2 size={18} aria-hidden="true" />
							</div>
							<div className="min-w-0 flex-1">
								<h3 className="text-sm font-semibold text-app-text">
									{t("settings.assistantSpeech.title")}
								</h3>
							</div>
						</div>
						<SwitchSetting
							checked={isAssistantSpeechVisible}
							label={t("settings.assistantSpeech.showInChat")}
							onChange={onAssistantSpeechVisibleChange}
						/>
						<SwitchSetting
							checked={isAssistantSpeechAutoPlayEnabled}
							label={t("settings.assistantSpeech.autoPlayLatest")}
							onChange={onAssistantSpeechAutoPlayEnabledChange}
						/>
						{voiceCredits.length > 0 ? (
							<div className="rounded-xl border border-dialog-border bg-dialog-soft px-4 py-3">
								<p className="text-xs font-semibold text-muted">
									{t("settings.assistantSpeech.credits")}
								</p>
								<ul className="mt-2 space-y-1">
									{voiceCredits.map((credit) => (
										<li
											key={credit.text}
											className="text-sm font-semibold text-app-text"
										>
											{credit.text}
										</li>
									))}
								</ul>
							</div>
						) : null}
					</section>
					<section className="mt-6 space-y-3 border-t border-dialog-border pt-5">
						<div className="flex items-center gap-3">
							<div className="mt-0.5 rounded-xl bg-sky-500/10 p-2 text-sky-600 dark:bg-sky-300/15 dark:text-sky-200">
								<ScanFace size={18} aria-hidden="true" />
							</div>
							<div className="min-w-0 flex-1">
								<h3 className="text-sm font-semibold text-app-text">
									{t("settings.avatarOverlay.title")}
								</h3>
							</div>
						</div>
						<SwitchSetting
							checked={isAvatarOverlayVisible}
							label={t("settings.avatarOverlay.showInChat")}
							onChange={onAvatarOverlayVisibleChange}
						/>
						<SegmentedSetting
							label={t("settings.avatarOverlay.position")}
							options={[
								{
									value: "bottom-left",
									label: t("settings.avatarOverlay.positionBottomLeft")
								},
								{
									value: "bottom-right",
									label: t("settings.avatarOverlay.positionBottomRight")
								}
							]}
							value={avatarOverlayPosition}
							onChange={onAvatarOverlayPositionChange}
						/>
						<SegmentedSetting
							label={t("settings.avatarOverlay.size")}
							options={[
								{ value: "small", label: t("settings.avatarOverlay.sizeSmall") },
								{ value: "medium", label: t("settings.avatarOverlay.sizeMedium") }
							]}
							value={avatarOverlaySize}
							onChange={onAvatarOverlaySizeChange}
						/>
					</section>
					<section className="mt-6 border-t border-dialog-border pt-5">
						<Button
							variant="destructive"
							size="lg"
							fullWidth
							disabled={isResettingMemory}
							onClick={() => void handleResetLearnedContext()}
						>
							{isResettingMemory
								? t("settings.memory.resetting", { aiko: aikoName })
								: t("settings.memory.reset", { aiko: aikoName })}
						</Button>
					</section>
				</div>
			</aside>
		</div>
	);
}

function SwitchSetting({
	checked,
	label,
	onChange
}: {
	checked: boolean;
	label: string;
	onChange: (checked: boolean) => void;
}) {
	return (
		<Button
			role="switch"
			aria-checked={checked}
			surface="dialog"
			variant="secondary"
			size="lg"
			align="between"
			fullWidth
			onClick={() => onChange(!checked)}
		>
			<span className="text-sm font-semibold text-app-text">{label}</span>
			<span
				className={`relative h-6 w-11 shrink-0 rounded-full transition ${
					checked ? "bg-primary dark:bg-muted/35" : "bg-muted/35 dark:bg-primary"
				}`}
			>
				<span
					className={`absolute top-1 h-4 w-4 rounded-full bg-primary-text transition ${
						checked ? "left-6" : "left-1"
					}`}
				/>
			</span>
		</Button>
	);
}

type SegmentedSettingProps<TValue extends string> = {
	label: string;
	options: Array<{ value: TValue; label: string }>;
	value: TValue;
	onChange: (value: TValue) => void;
};

function SegmentedSetting<TValue extends string>({
	label,
	options,
	value,
	onChange
}: SegmentedSettingProps<TValue>) {
	return (
		<div className="space-y-2">
			<p className="text-xs font-semibold text-muted">{label}</p>
			<div className="grid grid-cols-2 gap-1 rounded-xl border border-dialog-border bg-dialog-soft p-1">
				{options.map((option) => {
					const isActive = option.value === value;

					return (
						<Button
							key={option.value}
							variant={isActive ? "selected" : "ghost"}
							size="sm"
							fullWidth
							aria-pressed={isActive}
							onClick={() => onChange(option.value)}
						>
							{option.label}
						</Button>
					);
				})}
			</div>
		</div>
	);
}

export default AppSettingsDialog;
