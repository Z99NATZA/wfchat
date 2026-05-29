import { ArrowDown } from "lucide-react";
import { Wand2 } from "lucide-react";
import { UIEvent, useEffect, useRef, useState } from "react";
import type { ChatMessage } from "@/types/chat";
import { cn } from "@/utils/classNames";

type ChatMessageListProps = {
	messages: ChatMessage[];
	companionName: string;
	companionAvatarUrl: string;
	errorMessage?: string | null;
	isSending?: boolean;
};

function ChatMessageList({
	messages,
	companionName,
	companionAvatarUrl,
	errorMessage,
	isSending = false
}: ChatMessageListProps) {
	const scrollContainerRef = useRef<HTMLDivElement>(null);
	const shouldStickToBottomRef = useRef(true);
	const previousMessageCountRef = useRef(messages.length);
	const [showJumpToLatest, setShowJumpToLatest] = useState(false);
	const [unseenMessageCount, setUnseenMessageCount] = useState(0);

	function handleScroll(event: UIEvent<HTMLDivElement>) {
		const { scrollTop, scrollHeight, clientHeight } = event.currentTarget;
		const distanceFromBottom = scrollHeight - (scrollTop + clientHeight);
		shouldStickToBottomRef.current = distanceFromBottom < 80;
		setShowJumpToLatest(distanceFromBottom > 180);

		if (distanceFromBottom < 80) {
			setUnseenMessageCount(0);
		}
	}

	useEffect(() => {
		const previousMessageCount = previousMessageCountRef.current;
		const nextMessageCount = messages.length;
		const newMessageCount = Math.max(nextMessageCount - previousMessageCount, 0);
		previousMessageCountRef.current = nextMessageCount;

		if (newMessageCount > 0 && !shouldStickToBottomRef.current) {
			setUnseenMessageCount((count) => count + newMessageCount);
		}

		if (!shouldStickToBottomRef.current) {
			return;
		}

		const container = scrollContainerRef.current;

		if (!container) {
			return;
		}

		container.scrollTo({
			top: container.scrollHeight,
			behavior: "smooth"
		});
		setShowJumpToLatest(false);
		setUnseenMessageCount(0);
	}, [messages, isSending]);

	function scrollToLatest() {
		const container = scrollContainerRef.current;

		if (!container) {
			return;
		}

		shouldStickToBottomRef.current = true;
		setShowJumpToLatest(false);
		setUnseenMessageCount(0);
		container.scrollTo({
			top: container.scrollHeight,
			behavior: "smooth"
		});
	}

	return (
		<div className="relative flex-1 min-h-0">
			<div
				ref={scrollContainerRef}
				onScroll={handleScroll}
				className="chat-scroll h-full space-y-5 overflow-y-auto px-4 py-6 lg:px-8"
			>
				<div className="mx-auto flex max-w-3xl items-center gap-3 rounded-lg border border-primary/20 bg-primary/8 p-3 text-sm text-app-text">
					<div className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-primary text-white">
						<Wand2 size={17} aria-hidden="true" />
					</div>
					<p>{companionName} is tuned for warm roleplay, soft coaching, and concise creative rewrites.</p>
				</div>

				<div className="mx-auto flex max-w-3xl flex-col gap-4">
					{messages.length === 0 && !isSending && (
						<div className="rounded-lg border border-dashed border-app-border bg-app-panel px-5 py-8 text-center">
							<p className="text-sm font-semibold text-app-text">Start a conversation with {companionName}</p>
							<p className="mt-2 text-sm text-muted">
								Your chat is empty. Send the first message when you are ready.
							</p>
						</div>
					)}
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
					{isSending && (
						<article className="flex items-end gap-3 justify-start">
							<img className="size-9 shrink-0 rounded-lg object-cover" src={companionAvatarUrl} alt="" />
							<div className="max-w-[min(36rem,82vw)] rounded-lg border border-app-border bg-app-panel px-4 py-3 text-app-text shadow-soft">
								<p className="text-sm leading-6 text-muted">{companionName} is thinking...</p>
							</div>
						</article>
					)}
					{errorMessage && (
						<div className="rounded-lg border border-red-400/30 bg-red-500/10 px-4 py-3 text-sm text-red-500">
							{errorMessage}
						</div>
					)}
				</div>
			</div>

			{showJumpToLatest && (
				<div className="pointer-events-none absolute bottom-5 right-4 z-10 sm:right-8">
					<button
						type="button"
						onClick={scrollToLatest}
						className="pointer-events-auto inline-flex items-center gap-2 rounded-full border border-app-border bg-app-panel/95 px-4 py-2 text-sm font-medium text-app-text shadow-soft backdrop-blur transition hover:border-primary hover:text-primary"
					>
						<ArrowDown size={16} aria-hidden="true" />
						Jump to latest
						{unseenMessageCount > 0 && (
							<span className="rounded-full bg-primary px-2 py-0.5 text-xs font-semibold text-white">
								+{unseenMessageCount}
							</span>
						)}
					</button>
				</div>
			)}
		</div>
	);
}

export default ChatMessageList;
