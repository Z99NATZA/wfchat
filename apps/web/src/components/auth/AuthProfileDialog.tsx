import Dialog from "@/components/dialog/Dialog";
import GoogleSignInButton from "@/components/auth/GoogleSignInButton";
import { useI18n } from "@/i18n";

type AuthProfileDialogProps = {
	isOpen: boolean;
	isAuthenticated: boolean;
	profileLabel: string;
	email?: string;
	hasPendingGuestSync: boolean;
	onClose: () => void;
	onLoginWithGoogleIdToken: (idToken: string) => void;
	onLogout: () => void;
	onSyncNow: () => void;
	isSyncing?: boolean;
	syncError?: string | null;
};

function AuthProfileDialog({
	isOpen,
	isAuthenticated,
	profileLabel,
	email,
	hasPendingGuestSync,
	onClose,
	onLoginWithGoogleIdToken,
	onLogout,
	onSyncNow,
	isSyncing = false,
	syncError = null
}: AuthProfileDialogProps) {
	const { t } = useI18n();

	return (
		<Dialog
			isOpen={isOpen}
			title={isAuthenticated ? t("auth.profile.titleMember") : t("auth.profile.titleGuest")}
			description={
				isAuthenticated ? t("auth.profile.memberDescription") : t("auth.profile.guestDescription")
			}
			onClose={onClose}
			actions={
				<>
					<button
						type="button"
						className="rounded-lg border border-app-border bg-app-soft px-4 py-2 text-sm font-medium text-app-text transition hover:border-primary hover:text-primary"
						onClick={onClose}
					>
						{t("common.done")}
					</button>
				</>
			}
			content={
				<div className="space-y-4">
					<div className="rounded-lg border border-app-border bg-app-soft p-3">
						<p className="text-sm font-semibold text-app-text">{profileLabel}</p>
						<p className="mt-1 text-xs text-muted">
							{isAuthenticated ? email : t("auth.profile.guestMode")}
						</p>
					</div>

					{!isAuthenticated ? (
						<div className="space-y-2">
							<GoogleSignInButton onCredential={onLoginWithGoogleIdToken} />
						</div>
					) : (
						<div className="space-y-2">
							{hasPendingGuestSync && (
								<>
									<button
										type="button"
										className="w-full rounded-lg bg-primary px-4 py-2 text-sm font-medium text-white transition hover:bg-primary-600 disabled:cursor-not-allowed disabled:opacity-60"
										onClick={onSyncNow}
										disabled={isSyncing}
									>
										{isSyncing ? t("auth.profile.syncing") : t("auth.profile.syncNow")}
									</button>
									{syncError && <p className="text-xs text-red-500">{syncError}</p>}
								</>
							)}
							<button
								type="button"
								className="w-full rounded-lg border border-app-border bg-app-soft px-4 py-2 text-sm font-medium text-app-text transition hover:border-primary hover:text-primary"
								onClick={onLogout}
							>
								{t("auth.profile.logout")}
							</button>
						</div>
					)}
				</div>
			}
		/>
	);
}

export default AuthProfileDialog;
