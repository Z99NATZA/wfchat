import AppLayout from "@/layouts/AppLayout";
import AuthProfileDialog from "@/components/auth/AuthProfileDialog";
import AppSettingsDialog from "@/components/settings/AppSettingsDialog";
import ChatComposer from "@/features/chat/components/ChatComposer";
import ChatDetailsPanel from "@/features/chat/components/ChatDetailsPanel";
import ChatHeader from "@/features/chat/components/ChatHeader";
import ChatMessageList from "@/features/chat/components/ChatMessageList";
import ChatSidebar from "@/features/chat/components/ChatSidebar";
import { useChatSession } from "@/features/chat/hooks/useChatSession";
import { useAuthSession } from "@/hooks/useAuthSession";
import { useDialog } from "@/components/dialog/DialogProvider";
import {
	clearLocalSyncState,
	enqueueGuestSync,
	enqueueGuestSyncWithMemory,
	flushGuestSyncQueue,
	hasPendingSyncQueue,
	markSyncRetry,
	pullSyncChanges
} from "@/services/syncService";
import type { AppFont } from "@/types/font";
import type { Theme } from "@/types/theme";
import { type ReactNode, useEffect, useRef, useState } from "react";
import { useI18n } from "@/i18n";
import { persistBackgroundImageUrl, readBackgroundImageUrl } from "@/stores/backgroundStore";

type ChatPageProps = {
	activityBar: ReactNode;
	theme: Theme;
	font: AppFont;
	onFontChange: (font: AppFont) => void;
	onToggleTheme: () => void;
};

function ChatPage({ activityBar, theme, font, onFontChange, onToggleTheme }: ChatPageProps) {
	const chat = useChatSession();
	const auth = useAuthSession();
	const { setLocale, t } = useI18n();
	const { alert } = useDialog();
	const refreshRemoteState = chat.refreshRemoteState;
	const [isProfileOpen, setIsProfileOpen] = useState(false);
	const [isSettingsOpen, setIsSettingsOpen] = useState(false);
	const [isSyncing, setIsSyncing] = useState(false);
	const [syncError, setSyncError] = useState<string | null>(null);
	const [backgroundImageUrl, setBackgroundImageUrl] = useState(readBackgroundImageUrl);
	const wasAuthenticatedRef = useRef(auth.isAuthenticated);

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
					await pullSyncChanges(setLocale, setBackgroundImageUrl);
					refreshRemoteState();
				}
			})
			.catch(() => {
				markSyncRetry();
			});
	}, [auth, auth.isAuthenticated, refreshRemoteState, setLocale]);

	useEffect(() => {
		if (!auth.isAuthenticated) {
			return;
		}
		void pullSyncChanges(setLocale, setBackgroundImageUrl).then(() => refreshRemoteState());
	}, [auth.isAuthenticated, refreshRemoteState, setLocale]);

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
			void pullSyncChanges(setLocale, setBackgroundImageUrl).then(() => refreshRemoteState());
		}

		window.addEventListener("online", handleOnline);
		return () => window.removeEventListener("online", handleOnline);
	}, [auth, auth.isAuthenticated, refreshRemoteState, setLocale]);

	async function handleSyncNow() {
		setIsSyncing(true);
		setSyncError(null);
		try {
			await enqueueGuestSyncWithMemory(
				chat.memoryFacts,
				chat.memorySummaries,
				chat.sessions,
				chat.messages,
				chat.activeChatId
			);
			const result = await flushGuestSyncQueue({ force: true });
			if (!result) {
				auth.markGuestSyncDone();
				await pullSyncChanges(setLocale, setBackgroundImageUrl);
				refreshRemoteState();
				await alert({
					title: t("auth.profile.syncCompleteTitle"),
					description: t("auth.profile.syncCompleteDescription")
				});
				return;
			}
			if (!hasPendingSyncQueue()) {
				auth.markGuestSyncDone();
			}
			await pullSyncChanges(setLocale, setBackgroundImageUrl);
			refreshRemoteState();
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
		chat.resetToDraft();
		setSyncError(null);
		setIsProfileOpen(false);
	}

	function handleUpdateBackgroundImageUrl(url: string) {
		persistBackgroundImageUrl(url);
		setBackgroundImageUrl(url.trim());
		if (auth.isAuthenticated) {
			void syncBackgroundImageSetting();
		}
	}

	async function syncBackgroundImageSetting() {
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

	return (
		<>
			<AppLayout
				activityBar={activityBar}
				backgroundImageUrl={backgroundImageUrl}
				sidebar={
					<ChatSidebar
						personas={chat.personas}
						sessions={chat.sessions}
						activeSessionId={chat.activeChatId}
						activePersonaId={chat.activePersona.id}
						isOpen={chat.isSidebarOpen}
						isCreatingSession={chat.isCreatingSession}
						searchQuery={chat.chatSearchQuery}
						onCreateSession={chat.createNewSession}
						onSearchQueryChange={chat.setChatSearchQuery}
						onCloseSidebar={chat.closeSidebar}
						onDeleteSession={chat.removeSession}
						onSelectPersona={chat.selectPersona}
						onSelectSession={chat.selectSession}
					/>
				}
				header={
					<ChatHeader
						persona={chat.activePersona}
						theme={theme}
						font={font}
						canClearChat={chat.messages.length > 0}
						isClearing={chat.isClearing}
						onClearChat={chat.clearChat}
						onFontChange={onFontChange}
						onOpenSidebar={chat.openSidebar}
						onToggleTheme={onToggleTheme}
						isAuthenticated={auth.isAuthenticated}
						hasPendingGuestSync={auth.isAuthenticated && auth.hasPendingGuestSync}
						userAvatarUrl={auth.user?.avatarUrl}
						onOpenProfile={() => setIsProfileOpen(true)}
						onOpenSettings={() => setIsSettingsOpen(true)}
					/>
				}
				details={
					<ChatDetailsPanel
						persona={chat.activePersona}
						memoryFacts={chat.memoryFacts}
						memorySummaries={chat.memorySummaries}
						isSavingMemoryFact={chat.isSavingMemoryFact}
						isSavingMemorySummary={chat.isSavingMemorySummary}
						onSaveMemoryFact={chat.saveMemoryFact}
						onSaveMemorySummary={chat.saveMemorySummary}
						onDeleteMemoryFact={chat.removeMemoryFact}
						onDeleteMemorySummary={chat.removeMemorySummary}
						onEditMemoryFact={chat.editMemoryFact}
						onEditMemorySummary={chat.editMemorySummary}
					/>
				}
			>
				<ChatMessageList
					messages={chat.messages}
					companionName={chat.activePersona.name}
					companionAvatarUrl={chat.activePersona.avatarUrl}
					errorMessage={chat.errorMessage}
					isSending={chat.isSending}
				/>
				<ChatComposer
					draft={chat.draft}
					font={font}
					companionName={chat.activePersona.name}
					isDisabled={false}
					isSending={chat.isSending}
					onDraftChange={chat.setDraft}
					onSend={chat.sendMessage}
				/>
			</AppLayout>
			<AuthProfileDialog
				isOpen={isProfileOpen}
				isAuthenticated={auth.isAuthenticated}
				profileLabel={auth.profileLabel}
				email={auth.user?.email}
				avatarUrl={auth.user?.avatarUrl}
				hasPendingGuestSync={auth.hasPendingGuestSync}
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
				backgroundImageUrl={backgroundImageUrl}
				onClose={() => setIsSettingsOpen(false)}
				onUpdateBackgroundImageUrl={handleUpdateBackgroundImageUrl}
			/>
		</>
	);
}

export default ChatPage;
