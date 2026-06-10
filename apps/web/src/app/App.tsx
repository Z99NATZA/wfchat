import { useCallback, useEffect, useRef, useState } from "react";
import AuthProfileDialog from "@/components/auth/AuthProfileDialog";
import ActivityBar from "@/components/navigation/ActivityBar";
import DialogProvider from "@/components/dialog/DialogProvider";
import AppSettingsDialog from "@/components/settings/AppSettingsDialog";
import { useAppSettings } from "@/app/AppSettingsProvider";
import { useAuthSession } from "@/hooks/useAuthSession";
import { useDialog } from "@/components/dialog/DialogProvider";
import { useI18n } from "@/i18n";
import { AvatarRuntimeProvider } from "@/features/avatar/runtime/avatarRuntimeStore";
import ChatPage, { type ChatSyncSnapshot } from "@/pages/ChatPage";
import Model2DPage from "@/pages/Model2DPage";
import PngTuberPage from "@/pages/PngTuberPage";
import {
	clearLocalSyncState,
	enqueueGuestSync,
	enqueueGuestSyncWithMemory,
	flushGuestSyncQueue,
	hasPendingSyncQueue,
	markSyncRetry,
	pullSyncChanges
} from "@/services/syncService";
import { Navigate, Route, Routes } from "react-router-dom";

function App() {
	const settings = useAppSettings();
	const auth = useAuthSession();
	const { setLocale, t } = useI18n();
	const { alert } = useDialog();
	const [isProfileOpen, setIsProfileOpen] = useState(false);
	const [isSettingsOpen, setIsSettingsOpen] = useState(false);
	const [isSyncing, setIsSyncing] = useState(false);
	const [syncError, setSyncError] = useState<string | null>(null);
	const chatSyncSnapshotRef = useRef<ChatSyncSnapshot | null>(null);
	const wasAuthenticatedRef = useRef(auth.isAuthenticated);
	const activityBar = <ActivityBar />;
	const refreshMountedChat = useCallback(() => {
		chatSyncSnapshotRef.current?.refreshRemoteState();
	}, []);
	const handleChatSyncSnapshotChange = useCallback((snapshot: ChatSyncSnapshot | null) => {
		chatSyncSnapshotRef.current = snapshot;
	}, []);

	useEffect(() => {
		if (!wasAuthenticatedRef.current && auth.isAuthenticated) {
			setIsProfileOpen(true);
		}

		wasAuthenticatedRef.current = auth.isAuthenticated;
	}, [auth.isAuthenticated]);

	useEffect(() => {
		if (!auth.isAuthenticated || !hasPendingSyncQueue()) {
			return;
		}

		void flushGuestSyncQueue()
			.then(async (result) => {
				if (result) {
					auth.markGuestSyncDone();
					await pullSyncChanges(setLocale, settings.applyPulledBackgroundImageUrl);
					refreshMountedChat();
				}
			})
			.catch(() => {
				markSyncRetry();
			});
	}, [
		auth.isAuthenticated,
		auth.markGuestSyncDone,
		refreshMountedChat,
		setLocale,
		settings.applyPulledBackgroundImageUrl
	]);

	useEffect(() => {
		if (!auth.isAuthenticated) {
			return;
		}
		void pullSyncChanges(setLocale, settings.applyPulledBackgroundImageUrl).then(() => refreshMountedChat());
	}, [auth.isAuthenticated, refreshMountedChat, setLocale, settings.applyPulledBackgroundImageUrl]);

	useEffect(() => {
		if (!auth.isAuthenticated) {
			return;
		}

		function handleOnline() {
			void flushGuestSyncQueue()
				.then((result) => {
					if (result) {
						auth.markGuestSyncDone();
					}
				})
				.catch(() => {
					markSyncRetry();
				});
			void pullSyncChanges(setLocale, settings.applyPulledBackgroundImageUrl).then(() => refreshMountedChat());
		}

		window.addEventListener("online", handleOnline);
		return () => window.removeEventListener("online", handleOnline);
	}, [
		auth.isAuthenticated,
		auth.markGuestSyncDone,
		refreshMountedChat,
		setLocale,
		settings.applyPulledBackgroundImageUrl
	]);

	async function handleSyncNow() {
		const chatSnapshot = chatSyncSnapshotRef.current;
		setIsSyncing(true);
		setSyncError(null);

		try {
			if (chatSnapshot) {
				await enqueueGuestSyncWithMemory(
					chatSnapshot.memoryFacts,
					chatSnapshot.memorySummaries,
					chatSnapshot.sessions,
					chatSnapshot.messages,
					chatSnapshot.activeChatId
				);
			} else {
				await enqueueGuestSync();
			}

			const result = await flushGuestSyncQueue({ force: true });
			if (!result) {
				auth.markGuestSyncDone();
				await pullSyncChanges(setLocale, settings.applyPulledBackgroundImageUrl);
				refreshMountedChat();
				await alert({
					title: t("auth.profile.syncCompleteTitle"),
					description: t("auth.profile.syncCompleteDescription")
				});
				return;
			}
			if (!hasPendingSyncQueue()) {
				auth.markGuestSyncDone();
			}
			await pullSyncChanges(setLocale, settings.applyPulledBackgroundImageUrl);
			refreshMountedChat();
			await alert({
				title: t("auth.profile.syncCompleteTitle"),
				description: t("auth.profile.syncCompleteDescription")
			});
		} catch {
			markSyncRetry();
			setSyncError(t("auth.profile.syncError"));
		} finally {
			setIsSyncing(false);
		}
	}

	async function handleLogout() {
		await auth.logout();
		clearLocalSyncState();
		chatSyncSnapshotRef.current?.resetToDraft();
		setSyncError(null);
		setIsProfileOpen(false);
	}

	function handleUpdateBackgroundImageUrl(url: string) {
		settings.setBackgroundImageUrl(url);
		if (auth.isAuthenticated) {
			void syncAppSettings();
		}
	}

	async function syncAppSettings() {
		try {
			await enqueueGuestSync();
			while (hasPendingSyncQueue()) {
				const result = await flushGuestSyncQueue({ force: true });
				if (!result) {
					break;
				}
			}
			if (!hasPendingSyncQueue()) {
				auth.markGuestSyncDone();
			}
		} catch {
			markSyncRetry();
		}
	}

	const chatPage = (
		<ChatPage
			activityBar={activityBar}
			theme={settings.theme}
			font={settings.font}
			backgroundImageUrl={settings.backgroundImageUrl}
			isAvatarOverlayVisible={settings.isAvatarOverlayVisible}
			avatarOverlayPosition={settings.avatarOverlayPosition}
			avatarOverlaySize={settings.avatarOverlaySize}
			auth={auth}
			onFontChange={settings.setFont}
			onOpenProfile={() => setIsProfileOpen(true)}
			onOpenSettings={() => setIsSettingsOpen(true)}
			onToggleTheme={settings.toggleTheme}
			onChatSyncSnapshotChange={handleChatSyncSnapshotChange}
		/>
	);
	const headerControls = {
		theme: settings.theme,
		font: settings.font,
		isAuthenticated: auth.isAuthenticated,
		hasPendingGuestSync: auth.isAuthenticated && auth.hasPendingGuestSync,
		userAvatarUrl: auth.user?.avatarUrl,
		onFontChange: settings.setFont,
		onOpenProfile: () => setIsProfileOpen(true),
		onOpenSettings: () => setIsSettingsOpen(true),
		onToggleTheme: settings.toggleTheme
	};

	return (
		<AvatarRuntimeProvider>
			<Routes>
				<Route path="/" element={<Navigate to="/chat" replace />} />
				<Route path="/chat" element={chatPage} />
				<Route path="/chat/:chatId" element={chatPage} />
				<Route path="/avatar" element={<Navigate to="/avatar/pngtuber" replace />} />
				<Route path="/model" element={<Navigate to="/model/live2d" replace />} />
				<Route
					path="/avatar/pngtuber"
					element={
						<PngTuberPage
							activityBar={activityBar}
							backgroundImageUrl={settings.backgroundImageUrl}
							headerControls={headerControls}
						/>
					}
				/>
				<Route
					path="/model/live2d"
					element={
						<Model2DPage
							activityBar={activityBar}
							backgroundImageUrl={settings.backgroundImageUrl}
							headerControls={headerControls}
						/>
					}
				/>
				<Route path="/model3d" element={<Navigate to="/model/live2d" replace />} />
				<Route path="*" element={<Navigate to="/chat" replace />} />
			</Routes>
			<AuthProfileDialog
				isOpen={isProfileOpen}
				isAuthenticated={auth.isAuthenticated}
				profileLabel={auth.profileLabel}
				email={auth.user?.email}
				avatarUrl={auth.user?.avatarUrl}
				hasPendingGuestSync={auth.hasPendingGuestSync}
				backgroundImageUrl={settings.backgroundImageUrl}
				onClose={() => setIsProfileOpen(false)}
				onLoginWithGoogleIdToken={auth.loginGoogleWithIdToken}
				onLogout={handleLogout}
				onSyncNow={handleSyncNow}
				onUpdateProfile={auth.updateProfile}
				isSyncing={isSyncing}
				syncError={syncError}
			/>
			<AppSettingsDialog
				isOpen={isSettingsOpen}
				backgroundImageUrl={settings.backgroundImageUrl}
				isAvatarOverlayVisible={settings.isAvatarOverlayVisible}
				avatarOverlayPosition={settings.avatarOverlayPosition}
				avatarOverlaySize={settings.avatarOverlaySize}
				onClose={() => setIsSettingsOpen(false)}
				onUpdateBackgroundImageUrl={handleUpdateBackgroundImageUrl}
				onAvatarOverlayVisibleChange={settings.setAvatarOverlayVisible}
				onAvatarOverlayPositionChange={settings.setAvatarOverlayPosition}
				onAvatarOverlaySizeChange={settings.setAvatarOverlaySize}
			/>
		</AvatarRuntimeProvider>
	);
}

function AppWithDialogs() {
	return (
		<DialogProvider>
			<App />
		</DialogProvider>
	);
}

export default AppWithDialogs;
