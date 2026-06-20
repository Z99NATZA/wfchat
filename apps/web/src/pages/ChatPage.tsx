import AppLayout from "@/layouts/AppLayout";
import AvatarOverlay from "@/features/avatar/components/AvatarOverlay";
import ChatComposer from "@/features/chat/components/ChatComposer";
import ChatDetailsPanel from "@/features/chat/components/ChatDetailsPanel";
import ChatHeader from "@/features/chat/components/ChatHeader";
import ChatMessageList from "@/features/chat/components/ChatMessageList";
import ChatSidebar from "@/features/chat/components/ChatSidebar";
import { useAvatarChatBridge } from "@/features/avatar/runtime/avatarChatBridge";
import { useChatSession } from "@/features/chat/hooks/useChatSession";
import type { AuthSessionController } from "@/hooks/useAuthSession";
import type { AppFont } from "@/types/font";
import type { Theme } from "@/types/theme";
import type { ChatMessage, ChatSessionSummary, MemoryFact, MemorySummary } from "@/types/chat";
import type { AvatarOverlayPosition, AvatarOverlaySize } from "@/stores/avatarOverlayStore";
import { type ReactNode, useEffect, useLayoutEffect, useRef, useState } from "react";

export type ChatSyncSnapshot = {
	activeChatId: string | null;
	messages: ChatMessage[];
	sessions: ChatSessionSummary[];
	memoryFacts: MemoryFact[];
	memorySummaries: MemorySummary[];
	refreshRemoteState: () => void;
	resetToDraft: () => void;
};

type ChatPageProps = {
	activityBar: ReactNode;
	theme: Theme;
	font: AppFont;
	backgroundImageUrl: string;
	isAvatarOverlayVisible: boolean;
	avatarOverlayPosition: AvatarOverlayPosition;
	avatarOverlaySize: AvatarOverlaySize;
	auth: AuthSessionController;
	onFontChange: (font: AppFont) => void;
	onOpenProfile: () => void;
	onOpenSettings: () => void;
	onToggleTheme: () => void;
	onChatSyncSnapshotChange: (snapshot: ChatSyncSnapshot | null) => void;
};

function ChatPage({
	activityBar,
	theme,
	font,
	backgroundImageUrl,
	isAvatarOverlayVisible,
	avatarOverlayPosition,
	avatarOverlaySize,
	auth,
	onFontChange,
	onOpenProfile,
	onOpenSettings,
	onToggleTheme,
	onChatSyncSnapshotChange
}: ChatPageProps) {
	const { notifyAvatarChatEvent } = useAvatarChatBridge();
	const chat = useChatSession({ onAvatarChatEvent: notifyAvatarChatEvent });
	const composerContainerRef = useRef<HTMLDivElement>(null);
	const avatarOverlayRef = useRef<HTMLDivElement>(null);
	const [composerHeight, setComposerHeight] = useState(104);
	const [avatarOverlayHeight, setAvatarOverlayHeight] = useState(0);
	const avatarOverlayGap = 12;
	const messageOverlayGap = avatarOverlayGap / 2;
	const messageListBottomClearance =
		isAvatarOverlayVisible && avatarOverlayHeight > 0
			? avatarOverlayHeight + avatarOverlayGap + messageOverlayGap
			: 0;

	useEffect(() => {
		onChatSyncSnapshotChange({
			activeChatId: chat.activeChatId,
			messages: chat.messages,
			sessions: chat.sessions,
			memoryFacts: chat.memoryFacts,
			memorySummaries: chat.memorySummaries,
			refreshRemoteState: chat.refreshRemoteState,
			resetToDraft: chat.resetToDraft
		});

		return () => onChatSyncSnapshotChange(null);
	}, [
		chat.activeChatId,
		chat.messages,
		chat.sessions,
		chat.memoryFacts,
		chat.memorySummaries,
		chat.refreshRemoteState,
		chat.resetToDraft,
		onChatSyncSnapshotChange
	]);

	useLayoutEffect(() => {
		const composerElement = composerContainerRef.current;

		if (!composerElement) {
			return;
		}

		const measuredComposerElement: HTMLDivElement = composerElement;

		function updateComposerHeight() {
			setComposerHeight(Math.ceil(measuredComposerElement.getBoundingClientRect().height));
		}

		updateComposerHeight();

		if (typeof ResizeObserver === "undefined") {
			window.addEventListener("resize", updateComposerHeight);
			return () => window.removeEventListener("resize", updateComposerHeight);
		}

		const resizeObserver = new ResizeObserver(updateComposerHeight);
		resizeObserver.observe(measuredComposerElement);

		return () => resizeObserver.disconnect();
	}, []);

	useLayoutEffect(() => {
		if (!isAvatarOverlayVisible) {
			setAvatarOverlayHeight(0);
			return;
		}

		const overlayElement = avatarOverlayRef.current;

		if (!overlayElement) {
			return;
		}

		const measuredOverlayElement: HTMLDivElement = overlayElement;

		function updateOverlayHeight() {
			setAvatarOverlayHeight(Math.ceil(measuredOverlayElement.getBoundingClientRect().height));
		}

		updateOverlayHeight();

		if (typeof ResizeObserver === "undefined") {
			window.addEventListener("resize", updateOverlayHeight);
			return () => window.removeEventListener("resize", updateOverlayHeight);
		}

		const resizeObserver = new ResizeObserver(updateOverlayHeight);
		resizeObserver.observe(measuredOverlayElement);

		return () => resizeObserver.disconnect();
	}, [avatarOverlaySize, isAvatarOverlayVisible]);

	return (
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
						canClearChat={!chat.isActiveChatReadOnly && chat.messages.length > 0}
						isClearing={chat.isClearing}
						onClearChat={chat.clearChat}
						onFontChange={onFontChange}
						onOpenSidebar={chat.openSidebar}
						onToggleTheme={onToggleTheme}
						isAuthenticated={auth.isAuthenticated}
						hasPendingGuestSync={auth.isAuthenticated && auth.hasPendingGuestSync}
						userAvatarUrl={auth.user?.avatarUrl}
						onOpenProfile={onOpenProfile}
						onOpenSettings={onOpenSettings}
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
			<div className="relative flex min-h-0 flex-1 flex-col">
				<div className="relative z-10 flex min-h-0 flex-1 flex-col">
					<ChatMessageList
						activeChatId={chat.activeChatId}
						messages={chat.messages}
						companionName={chat.activePersona.name}
						companionAvatarUrl={chat.activePersona.avatarUrl}
						errorMessage={chat.errorMessage}
						isSending={chat.isSending}
						isAssistantSpeechEnabled={chat.isAssistantSpeechEnabled && !chat.isActiveChatReadOnly}
						assistantSpeechPlayback={chat.assistantSpeechPlayback}
						onToggleAssistantSpeech={chat.toggleAssistantSpeech}
						theme={theme}
						bottomClearancePx={messageListBottomClearance}
						onLoadMarkdownQaMessages={
							chat.isMarkdownQaEnabled ? chat.loadMarkdownQaMessages : undefined
						}
					/>
					<div ref={composerContainerRef}>
						<ChatComposer
							draft={chat.draft}
							font={font}
							companionName={chat.activePersona.name}
							quickPrompts={chat.quickPrompts}
							isDisabled={chat.isActiveChatReadOnly}
							isSending={chat.isSending}
							onDraftChange={chat.setDraft}
							onSend={chat.sendMessage}
						/>
					</div>
				</div>
				{isAvatarOverlayVisible ? (
					<AvatarOverlay
						ref={avatarOverlayRef}
						position={avatarOverlayPosition}
						size={avatarOverlaySize}
						bottomOffsetPx={composerHeight}
					/>
				) : null}
			</div>
			</AppLayout>
	);
}

export default ChatPage;
