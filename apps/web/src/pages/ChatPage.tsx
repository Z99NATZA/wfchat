import AppLayout from "@/layouts/AppLayout";
import ChatComposer from "@/features/chat/components/ChatComposer";
import ChatDetailsPanel from "@/features/chat/components/ChatDetailsPanel";
import ChatHeader from "@/features/chat/components/ChatHeader";
import ChatMessageList from "@/features/chat/components/ChatMessageList";
import ChatSidebar from "@/features/chat/components/ChatSidebar";
import { useChatSession } from "@/features/chat/hooks/useChatSession";
import type { AppFont } from "@/types/font";
import type { Theme } from "@/types/theme";

type ChatPageProps = {
	theme: Theme;
	font: AppFont;
	onFontChange: (font: AppFont) => void;
	onToggleTheme: () => void;
};

function ChatPage({ theme, font, onFontChange, onToggleTheme }: ChatPageProps) {
	const chat = useChatSession();

	return (
		<AppLayout
			sidebar={
				<ChatSidebar
					personas={chat.personas}
					sessions={chat.sessions}
					activeSessionId={chat.activeChatId}
					activePersonaId={chat.activePersona.id}
					isOpen={chat.isSidebarOpen}
					isCreatingSession={chat.isCreatingSession}
					onCreateSession={chat.createNewSession}
					onCloseSidebar={chat.closeSidebar}
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
				quickPrompts={chat.quickPrompts}
				isDisabled={!chat.activeChatId}
				isSending={chat.isSending}
				onDraftChange={chat.setDraft}
				onSend={chat.sendMessage}
				onUseQuickPrompt={chat.useQuickPrompt}
			/>
		</AppLayout>
	);
}

export default ChatPage;
