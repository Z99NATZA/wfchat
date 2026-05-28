import AppLayout from "@/layouts/AppLayout";
import ChatComposer from "@/features/chat/components/ChatComposer";
import ChatDetailsPanel from "@/features/chat/components/ChatDetailsPanel";
import ChatHeader from "@/features/chat/components/ChatHeader";
import ChatMessageList from "@/features/chat/components/ChatMessageList";
import ChatSidebar from "@/features/chat/components/ChatSidebar";
import { useChatSession } from "@/features/chat/hooks/useChatSession";
import type { Theme } from "@/types/theme";

type ChatPageProps = {
	theme: Theme;
	onToggleTheme: () => void;
};

function ChatPage({ theme, onToggleTheme }: ChatPageProps) {
	const chat = useChatSession();

	return (
		<AppLayout
			sidebar={
				<ChatSidebar
					personas={chat.personas}
					activePersonaId={chat.activePersona.id}
					isOpen={chat.isSidebarOpen}
					onCloseSidebar={chat.closeSidebar}
					onSelectPersona={chat.selectPersona}
				/>
			}
			header={
				<ChatHeader
					persona={chat.activePersona}
					theme={theme}
					onOpenSidebar={chat.openSidebar}
					onToggleTheme={onToggleTheme}
				/>
			}
			details={<ChatDetailsPanel persona={chat.activePersona} />}
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
