import { Image, X } from "lucide-react";
import { type FormEvent, useEffect, useState } from "react";
import { useI18n } from "@/i18n";

type AppSettingsDialogProps = {
	isOpen: boolean;
	backgroundImageUrl: string;
	onClose: () => void;
	onUpdateBackgroundImageUrl: (url: string) => void;
};

function AppSettingsDialog({
	isOpen,
	backgroundImageUrl,
	onClose,
	onUpdateBackgroundImageUrl
}: AppSettingsDialogProps) {
	const { t } = useI18n();
	const [draftUrl, setDraftUrl] = useState(backgroundImageUrl);

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
				className="absolute inset-0 bg-black/35 backdrop-blur-[2px]"
				aria-label={t("settings.close")}
				onClick={onClose}
			/>
			<aside className="absolute inset-x-0 bottom-0 flex max-h-[92dvh] flex-col rounded-t-3xl border border-app-border bg-app-panel shadow-2xl backdrop-blur-xl sm:inset-y-0 sm:left-auto sm:right-0 sm:h-full sm:max-h-none sm:w-[420px] sm:rounded-none sm:border-y-0 sm:border-r-0">
				<header className="flex items-start justify-between gap-4 border-b border-app-border px-5 py-4">
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

						<div className="overflow-hidden rounded-xl border border-app-border bg-app-soft">
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
									className="mt-1 w-full rounded-xl border border-app-border bg-app-soft px-3 py-3 text-sm text-app-text outline-none transition placeholder:text-muted/70 focus:border-primary"
									value={draftUrl}
									placeholder={t("settings.background.imageUrlPlaceholder")}
									onChange={(event) => setDraftUrl(event.target.value)}
								/>
							</label>
							<div className="grid grid-cols-2 gap-2">
								<button
									type="button"
									className="rounded-xl border border-app-border bg-app-soft px-4 py-3 text-sm font-semibold text-app-text transition hover:border-primary hover:text-primary"
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
				</div>
			</aside>
		</div>
	);
}

export default AppSettingsDialog;
