import GoogleSignInButton from "@/components/auth/GoogleSignInButton";
import { useI18n } from "@/i18n";
import { CheckCircle2, LogOut, Mail, RefreshCw, User, X } from "lucide-react";
import {
	type CSSProperties,
	type FormEvent,
	useEffect,
	useLayoutEffect,
	useMemo,
	useRef,
	useState
} from "react";

type AuthProfileDialogProps = {
	isOpen: boolean;
	isAuthenticated: boolean;
	profileLabel: string;
	email?: string;
	avatarUrl?: string;
	hasPendingGuestSync: boolean;
	backgroundImageUrl: string;
	onClose: () => void;
	onLoginWithGoogleIdToken: (idToken: string) => void;
	onLogout: () => void;
	onSyncNow: () => void;
	onUpdateProfile: (displayName: string, avatarUrl: string) => Promise<void>;
	isSyncing?: boolean;
	syncError?: string | null;
};

function AuthProfileDialog({
	isOpen,
	isAuthenticated,
	profileLabel,
	email,
	avatarUrl,
	hasPendingGuestSync,
	backgroundImageUrl,
	onClose,
	onLoginWithGoogleIdToken,
	onLogout,
	onSyncNow,
	onUpdateProfile,
	isSyncing = false,
	syncError = null
}: AuthProfileDialogProps) {
	const { t } = useI18n();
	const [displayNameDraft, setDisplayNameDraft] = useState(profileLabel);
	const [avatarUrlDraft, setAvatarUrlDraft] = useState(avatarUrl ?? "");
	const [isSavingProfile, setIsSavingProfile] = useState(false);
	const [profileMessage, setProfileMessage] = useState<string | null>(null);
	const [profileError, setProfileError] = useState<string | null>(null);
	const profileSurface = useDialogBackgroundSurface(backgroundImageUrl, isOpen);

	useEffect(() => {
		if (!isOpen) {
			return;
		}

		setDisplayNameDraft(profileLabel);
		setAvatarUrlDraft(avatarUrl ?? "");
		setProfileMessage(null);
		setProfileError(null);
	}, [avatarUrl, isOpen, profileLabel]);

	const initials = useMemo(() => {
		const source = displayNameDraft.trim() || profileLabel || "Guest";
		return source
			.split(/\s+/)
			.slice(0, 2)
			.map((part) => part.at(0)?.toUpperCase())
			.join("");
	}, [displayNameDraft, profileLabel]);

	if (!isOpen) {
		return null;
	}

	async function handleProfileSubmit(event: FormEvent<HTMLFormElement>) {
		event.preventDefault();

		const displayName = displayNameDraft.trim();
		if (!displayName || isSavingProfile) {
			return;
		}

		setIsSavingProfile(true);
		setProfileMessage(null);
		setProfileError(null);
		try {
			await onUpdateProfile(displayName, avatarUrlDraft.trim());
			setProfileMessage(t("auth.profile.profileSaved"));
		} catch {
			setProfileError(t("auth.profile.profileSaveError"));
		} finally {
			setIsSavingProfile(false);
		}
	}

	return (
		<div className="fixed inset-0 z-50">
			<button
				type="button"
				className="absolute inset-0 bg-black/35"
				aria-label={t("auth.profile.close")}
				onClick={onClose}
			/>
			<aside
				ref={profileSurface.ref}
				className="app-surface-shell absolute inset-x-0 bottom-0 flex max-h-[92dvh] flex-col rounded-t-3xl border border-dialog-border shadow-2xl sm:inset-y-0 sm:left-auto sm:right-0 sm:h-full sm:max-h-none sm:w-[420px] sm:rounded-none sm:border-y-0 sm:border-r-0"
				style={profileSurface.style}
			>
				<header className="flex items-start justify-between gap-4 border-b border-dialog-border px-5 py-4">
					<div>
						<h2 className="text-xl font-semibold text-app-text">
							{isAuthenticated ? t("auth.profile.titleMember") : t("auth.profile.titleGuest")}
						</h2>
						{!isAuthenticated && <p className="mt-1 text-sm text-muted">{t("auth.profile.guestDescription")}</p>}
					</div>
					<button
						type="button"
						className="rounded-full bg-primary p-2 text-white transition hover:bg-primary-600 focus:outline-none focus:ring-4 focus:ring-primary/15"
						aria-label={t("auth.profile.close")}
						onClick={onClose}
					>
						<X size={18} aria-hidden="true" />
					</button>
				</header>

				<div className="flex-1 space-y-4 overflow-y-auto px-5 py-4">
					<section className="rounded-2xl border border-dialog-border bg-dialog-soft p-4">
						<div className="flex items-center justify-between gap-3">
							<div className="flex min-w-0 items-center gap-3">
								<div className="flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-2xl bg-sky-500/10 text-lg font-semibold text-sky-600 dark:bg-sky-300/15 dark:text-sky-200">
									{avatarUrlDraft ? (
										<img
											src={avatarUrlDraft}
											alt={t("auth.profile.avatarAlt")}
											className="h-full w-full object-cover"
										/>
									) : (
										initials || <User size={24} aria-hidden="true" />
									)}
								</div>
								<div className="min-w-0">
									<p className="truncate text-base font-semibold text-app-text">{profileLabel}</p>
									<p className="mt-1 truncate text-sm text-muted">
										{isAuthenticated ? email : t("auth.profile.guestMode")}
									</p>
								</div>
							</div>
							{isAuthenticated && (
								<button
									type="button"
									className="inline-flex h-10 shrink-0 items-center gap-2 rounded-xl border border-red-400/25 bg-red-500/10 px-3 text-sm font-semibold text-red-500 transition hover:border-red-400/50 hover:bg-red-500/15 focus:outline-none focus:ring-4 focus:ring-red-500/15"
									onClick={onLogout}
								>
									<LogOut size={16} aria-hidden="true" />
									{t("auth.profile.logout")}
								</button>
							)}
						</div>
					</section>

					{!isAuthenticated ? (
						<section className="space-y-3">
							<div className="rounded-2xl border border-dialog-border bg-dialog-soft p-4 text-sm text-muted">
								<p className="font-semibold text-app-text">{t("auth.profile.beforeLoginTitle")}</p>
								<ul className="mt-3 list-disc space-y-2 pl-5">
									<li>{t("auth.profile.beforeLoginItemSync")}</li>
									<li>{t("auth.profile.beforeLoginItemResume")}</li>
									<li>{t("auth.profile.beforeLoginItemBackup")}</li>
								</ul>
							</div>
							<GoogleSignInButton onCredential={onLoginWithGoogleIdToken} />
						</section>
					) : (
						<>
							<section className="rounded-2xl border border-dialog-border bg-dialog-panel p-4">
								<h3 className="text-sm font-semibold text-app-text">
									{t("auth.profile.profileSection")}
								</h3>
								<form className="mt-4 space-y-3" onSubmit={handleProfileSubmit}>
									<label className="block">
										<span className="text-xs font-medium text-muted">
											{t("auth.profile.displayName")}
										</span>
										<input
											type="text"
											className="mt-1 w-full rounded-xl border border-dialog-border bg-dialog-soft px-3 py-3 text-sm text-app-text outline-none transition placeholder:text-muted/70 focus:border-primary"
											value={displayNameDraft}
											placeholder={t("auth.profile.displayNamePlaceholder")}
											onChange={(event) => setDisplayNameDraft(event.target.value)}
										/>
									</label>
									<label className="block">
										<span className="text-xs font-medium text-muted">
											{t("auth.profile.avatarUrl")}
										</span>
										<input
											type="url"
											className="mt-1 w-full rounded-xl border border-dialog-border bg-dialog-soft px-3 py-3 text-sm text-app-text outline-none transition placeholder:text-muted/70 focus:border-primary"
											value={avatarUrlDraft}
											placeholder={t("auth.profile.avatarUrlPlaceholder")}
											onChange={(event) => setAvatarUrlDraft(event.target.value)}
										/>
									</label>
									<button
										type="submit"
										className="w-full rounded-xl bg-primary px-4 py-3 text-sm font-semibold text-white transition hover:bg-primary-600 disabled:cursor-not-allowed disabled:opacity-60"
										disabled={!displayNameDraft.trim() || isSavingProfile}
									>
										{isSavingProfile
											? t("auth.profile.savingProfile")
											: t("auth.profile.saveProfile")}
									</button>
									{profileMessage && (
										<p className="flex items-center gap-2 text-xs text-emerald-500">
											<CheckCircle2 size={14} aria-hidden="true" />
											{profileMessage}
										</p>
									)}
									{profileError && <p className="text-xs text-red-500">{profileError}</p>}
								</form>
							</section>

							<section className="rounded-2xl border border-dialog-border bg-dialog-panel p-4">
								<div className="flex items-start gap-3">
									<div className="rounded-xl bg-sky-500/10 p-2 text-sky-600 dark:bg-sky-300/15 dark:text-sky-200">
										<RefreshCw size={18} aria-hidden="true" />
									</div>
									<div className="min-w-0 flex-1">
										<h3 className="text-sm font-semibold text-app-text">
											{t("auth.profile.syncSection")}
										</h3>
										<p className="mt-1 text-sm text-muted">{t("auth.profile.syncReady")}</p>
									</div>
								</div>
								{hasPendingGuestSync && (
									<div className="mt-4 space-y-2">
										<button
											type="button"
											className="w-full rounded-xl bg-primary px-4 py-3 text-sm font-semibold text-white transition hover:bg-primary-600 disabled:cursor-not-allowed disabled:opacity-60"
											onClick={onSyncNow}
											disabled={isSyncing}
										>
											{isSyncing ? t("auth.profile.syncing") : t("auth.profile.syncNow")}
										</button>
										{syncError && <p className="text-xs text-red-500">{syncError}</p>}
									</div>
								)}
							</section>

							<section className="rounded-2xl border border-dialog-border bg-dialog-panel p-4">
								<h3 className="text-sm font-semibold text-app-text">
									{t("auth.profile.accountSection")}
								</h3>
								<div className="mt-3 flex items-center gap-3 rounded-xl bg-dialog-soft px-3 py-3 text-sm text-muted">
									<Mail size={16} aria-hidden="true" />
									<div className="min-w-0">
										<p className="text-xs">{t("auth.profile.emailLabel")}</p>
										<p className="truncate text-app-text">{email}</p>
									</div>
								</div>
							</section>
						</>
					)}
				</div>
			</aside>
		</div>
	);
}

type BackgroundMetrics = {
	renderWidth: number;
	renderHeight: number;
	originX: number;
	originY: number;
};

function useDialogBackgroundSurface(backgroundImageUrl: string, isOpen: boolean) {
	const surfaceRef = useRef<HTMLElement>(null);
	const [metrics, setMetrics] = useState<BackgroundMetrics | null>(null);

	useEffect(() => {
		if (!isOpen || !backgroundImageUrl || typeof window === "undefined") {
			setMetrics(null);
			return;
		}

		let isCancelled = false;
		const image = new Image();

		function updateMetrics() {
			if (isCancelled || image.naturalWidth <= 0 || image.naturalHeight <= 0) {
				return;
			}

			setMetrics(calculateCoverMetrics(image.naturalWidth, image.naturalHeight));
		}

		image.onload = updateMetrics;
		image.onerror = () => {
			if (!isCancelled) {
				setMetrics(null);
			}
		};
		image.src = backgroundImageUrl;
		window.addEventListener("resize", updateMetrics);

		return () => {
			isCancelled = true;
			window.removeEventListener("resize", updateMetrics);
		};
	}, [backgroundImageUrl, isOpen]);

	useLayoutEffect(() => {
		const surfaceElement = surfaceRef.current;

		if (!isOpen || !surfaceElement || !backgroundImageUrl || !metrics || typeof window === "undefined") {
			return;
		}

		const syncedSurfaceElement = surfaceElement;
		const syncedMetrics = metrics;
		let animationFrameId = 0;

		function updateSurfacePosition() {
			animationFrameId = 0;

			const rect = syncedSurfaceElement.getBoundingClientRect();
			syncedSurfaceElement.style.setProperty(
				"--wfchat-surface-bg-position",
				`${syncedMetrics.originX - rect.left}px ${syncedMetrics.originY - rect.top}px`
			);
			syncedSurfaceElement.style.setProperty("--wfchat-surface-bg-opacity", "var(--app-bg-image-opacity)");
		}

		function scheduleUpdate() {
			if (animationFrameId) {
				return;
			}

			animationFrameId = window.requestAnimationFrame(updateSurfacePosition);
		}

		updateSurfacePosition();

		const resizeObserver = new ResizeObserver(scheduleUpdate);
		resizeObserver.observe(syncedSurfaceElement);
		window.addEventListener("resize", scheduleUpdate);

		return () => {
			if (animationFrameId) {
				window.cancelAnimationFrame(animationFrameId);
			}

			resizeObserver.disconnect();
			window.removeEventListener("resize", scheduleUpdate);
		};
	}, [backgroundImageUrl, isOpen, metrics]);

	const backgroundImageValue = backgroundImageUrl
		? `url(${JSON.stringify(backgroundImageUrl)})`
		: undefined;
	const style = backgroundImageValue
		? ({
				"--wfchat-bg-image": backgroundImageValue,
				"--wfchat-bg-render-size": metrics
					? `${metrics.renderWidth}px ${metrics.renderHeight}px`
					: "cover"
			} as CSSProperties)
		: undefined;

	return { ref: surfaceRef, style };
}

function calculateCoverMetrics(imageWidth: number, imageHeight: number): BackgroundMetrics {
	const viewportWidth = window.innerWidth;
	const viewportHeight = window.innerHeight;
	const scale = Math.max(viewportWidth / imageWidth, viewportHeight / imageHeight);
	const renderWidth = imageWidth * scale;
	const renderHeight = imageHeight * scale;

	return {
		renderWidth,
		renderHeight,
		originX: (viewportWidth - renderWidth) / 2,
		originY: (viewportHeight - renderHeight) / 2
	};
}

export default AuthProfileDialog;
