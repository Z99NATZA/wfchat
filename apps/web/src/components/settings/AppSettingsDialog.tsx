import { Image, ScanFace, X } from "lucide-react";
import { type FormEvent, useEffect, useState } from "react";
import { useDialogBackgroundSurface } from "@/components/dialog/useDialogBackgroundSurface";
import { useI18n } from "@/i18n";

type AppSettingsDialogProps = {
	isOpen: boolean;
	backgroundImageUrl: string;
	isAvatarOverlayVisible: boolean;
	onClose: () => void;
	onUpdateBackgroundImageUrl: (url: string) => void;
	onAvatarOverlayVisibleChange: (isVisible: boolean) => void;
};

function AppSettingsDialog({
	isOpen,
	backgroundImageUrl,
	isAvatarOverlayVisible,
	onClose,
	onUpdateBackgroundImageUrl,
	onAvatarOverlayVisibleChange
}: AppSettingsDialogProps) {
	const { t } = useI18n();
	const [draftUrl, setDraftUrl] = useState(backgroundImageUrl);
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
				className="app-surface-shell absolute inset-x-0 bottom-0 flex max-h-[92dvh] flex-col rounded-t-3xl border border-dialog-border shadow-2xl sm:inset-y-0 sm:left-auto sm:right-0 sm:h-full sm:max-h-none sm:w-[420px] sm:rounded-none sm:border-y-0 sm:border-r-0"
				style={settingsSurface.style}
			>
				<header className="flex items-start justify-between gap-4 border-b border-dialog-border px-5 py-4">
					<div>
						<h2 className="text-xl font-semibold text-app-text">{t("settings.title")}</h2>
					</div>
					<button
						type="button"
						className="rounded-full bg-primary p-2 text-white transition hover:bg-primary-600 focus:outline-none focus:ring-4 focus:ring-primary/15"
						aria-label={t("settings.close")}
						onClick={onClose}
					>
						<X size={18} aria-hidden="true" />
					</button>
				</header>

				<div className="chat-scroll flex-1 overflow-y-auto px-5 py-4">
					<section className="space-y-4">
						<div>
							<h3 className="text-sm font-semibold text-app-text">{t("settings.background.title")}</h3>
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
								<button
									type="button"
									className="rounded-xl border border-red-400/25 bg-red-500/10 px-4 py-3 text-sm font-semibold text-red-500 transition hover:border-red-400/50 hover:bg-red-500/15 focus:outline-none focus:ring-4 focus:ring-red-500/15"
									onClick={handleClear}
								>
									{t("settings.background.clear")}
								</button>
								<button
									type="submit"
									className="rounded-xl bg-primary px-4 py-3 text-sm font-semibold text-white transition hover:bg-primary-600"
								>
									{t("settings.background.apply")}
								</button>
							</div>
						</form>
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
						<button
							type="button"
							role="switch"
							aria-checked={isAvatarOverlayVisible}
							className="flex w-full items-center justify-between gap-4 rounded-xl border border-dialog-border bg-dialog-soft px-4 py-3 text-left transition hover:border-primary/40 focus:outline-none focus:ring-4 focus:ring-primary/15"
							onClick={() => onAvatarOverlayVisibleChange(!isAvatarOverlayVisible)}
						>
							<span className="text-sm font-semibold text-app-text">
								{t("settings.avatarOverlay.showInChat")}
							</span>
							<span
								className={`relative h-6 w-11 shrink-0 rounded-full transition ${
									isAvatarOverlayVisible
										? "bg-primary dark:bg-muted/35"
										: "bg-muted/35 dark:bg-primary"
								}`}
							>
								<span
									className={`absolute top-1 h-4 w-4 rounded-full bg-white shadow transition ${
										isAvatarOverlayVisible ? "left-6" : "left-1"
									}`}
								/>
							</span>
						</button>
					</section>
				</div>
			</aside>
		</div>
	);
}

export default AppSettingsDialog;
