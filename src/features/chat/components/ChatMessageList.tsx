import { Wand2 } from "lucide-react";
import type { ChatMessage } from "@/types/chat";
import { cn } from "@/utils/classNames";

type ChatMessageListProps = {
	messages: ChatMessage[];
	companionName: string;
	companionAvatarUrl: string;
};

function ChatMessageList({ messages, companionName, companionAvatarUrl }: ChatMessageListProps) {
	return (
		<div className="chat-scroll flex-1 space-y-5 overflow-y-auto px-4 py-6 lg:px-8">
			<div className="mx-auto flex max-w-3xl items-center gap-3 rounded-lg border border-primary/20 bg-primary/8 p-3 text-sm text-app-text">
				<div className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-primary text-white">
					<Wand2 size={17} aria-hidden="true" />
				</div>
				<p>{companionName} is tuned for warm roleplay, soft coaching, and concise creative rewrites.</p>
			</div>

			<div className="mx-auto flex max-w-3xl flex-col gap-4">
				{messages.map((message) => {
					const isUser = message.author === "user";

					return (
						<article
							key={message.id}
							className={cn("flex items-end gap-3", isUser ? "justify-end" : "justify-start")}
						>
							{!isUser && (
								<img
									className="size-9 shrink-0 rounded-lg object-cover"
									src={companionAvatarUrl}
									alt=""
								/>
							)}
							<div
								className={cn(
									"max-w-[min(36rem,82vw)] rounded-lg px-4 py-3 shadow-soft",
									isUser ? "bg-primary text-white" : "border border-app-border bg-app-panel text-app-text"
								)}
							>
								<p className="text-sm leading-6">{message.text}</p>
								<p className={cn("mt-2 text-[11px]", isUser ? "text-white/75" : "text-muted")}>
									{message.time}
								</p>
							</div>
						</article>
					);
				})}
			</div>
		</div>
	);
}

export default ChatMessageList;
