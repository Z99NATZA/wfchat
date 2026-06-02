import AppLayout from "@/layouts/AppLayout";
import AuthProfileDialog from "@/components/auth/AuthProfileDialog";
import ChatComposer from "@/features/chat/components/ChatComposer";
import ChatDetailsPanel from "@/features/chat/components/ChatDetailsPanel";
import ChatHeader from "@/features/chat/components/ChatHeader";
import ChatMessageList from "@/features/chat/components/ChatMessageList";
import ChatSidebar from "@/features/chat/components/ChatSidebar";
import { useChatSession } from "@/features/chat/hooks/useChatSession";
import { useAuthSession } from "@/hooks/useAuthSession";
import { useDialog } from "@/components/dialog/DialogProvider";
import {
	enqueueGuestSyncWithMemory,
	flushGuestSyncQueue,
	hasPendingSyncQueue,
	markSyncRetry,
	pullSyncChanges
} from "@/services/syncService";
import type { AppFont } from "@/types/font";
import type { Theme } from "@/types/theme";
import { useEffect, useRef, useState } from "react";
import { useI18n } from "@/i18n";

type ChatPageProps = {
	theme: Theme;
	font: AppFont;
	onFontChange: (font: AppFont) => void;
	onToggleTheme: () => void;
};

function ChatPage({ theme, font, onFontChange, onToggleTheme }: ChatPageProps) {
	const chat = useChatSession();
	const auth = useAuthSession();
	const { setLocale } = useI18n();
	const { alert } = useDialog();
	const refreshRemoteState = chat.refreshRemoteState;
	const [isProfileOpen, setIsProfileOpen] = useState(false);
	const [isSyncing, setIsSyncing] = useState(false);
	const [syncError, setSyncError] = useState<string | null>(null);
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
					await pullSyncChanges(setLocale);
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
		void pullSyncChanges(setLocale).then(() => refreshRemoteState());
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
			void pullSyncChanges(setLocale).then(() => refreshRemoteState());
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
				await pullSyncChanges(setLocale);
				refreshRemoteState();
				await alert({
					title: "Sync complete",
					description: "Merged 0 item(s)."
				});
				return;
			}
			if (!hasPendingSyncQueue()) {
				auth.markGuestSyncDone();
			}
			await pullSyncChanges(setLocale);
			refreshRemoteState();
			await alert({
				title: "Sync complete",
				description: `Merged ${result.merged_count} item(s).`
			});
		} catch {
			markSyncRetry();
			setSyncError("Could not sync now. Please try again.");
		} finally {
			setIsSyncing(false);
		}
	}

	return (
		<>
			<AppLayout
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
						onOpenProfile={() => setIsProfileOpen(true)}
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
					isDisabled={!chat.activeChatId}
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
				hasPendingGuestSync={auth.hasPendingGuestSync}
				onClose={() => setIsProfileOpen(false)}
				onLoginWithGoogleIdToken={auth.loginGoogleWithIdToken}
				onLogout={auth.logout}
				onSyncNow={handleSyncNow}
				isSyncing={isSyncing}
				syncError={syncError}
			/>
		</>
	);
}

export default ChatPage;
