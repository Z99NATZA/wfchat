import { ArrowDown, Ellipsis, EyeOff } from "lucide-react";
import { UIEvent, useEffect, useMemo, useRef, useState } from "react";
import { Wand2 } from "lucide-react";
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
	const menuContainerRef = useRef<HTMLDivElement>(null);
	const shouldStickToBottomRef = useRef(true);
	const previousMessageCountRef = useRef(messages.length);
	const [hiddenUserMessageIds, setHiddenUserMessageIds] = useState<Set<string>>(new Set());
	const [activeMessageMenuId, setActiveMessageMenuId] = useState<string | null>(null);
	const [showJumpToLatest, setShowJumpToLatest] = useState(false);
	const [unseenMessageCount, setUnseenMessageCount] = useState(0);
	const visibleMessages = useMemo(
		() => messages.filter((message) => !(message.author === "user" && hiddenUserMessageIds.has(message.id))),
		[messages, hiddenUserMessageIds]
	);

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

	useEffect(() => {
		setActiveMessageMenuId(null);
	}, [messages]);

	useEffect(() => {
		if (!activeMessageMenuId) {
			return;
		}

		function handlePointerDown(event: MouseEvent) {
			const menuContainer = menuContainerRef.current;

			if (!menuContainer) {
				return;
			}

			if (!menuContainer.contains(event.target as Node)) {
				setActiveMessageMenuId(null);
			}
		}

		window.addEventListener("mousedown", handlePointerDown);
		return () => window.removeEventListener("mousedown", handlePointerDown);
	}, [activeMessageMenuId]);

	function hideUserMessage(messageId: string) {
		const shouldHide = window.confirm(
			"Hide this message from your view only? This will not delete it from server history."
		);

		if (!shouldHide) {
			return;
		}

		setHiddenUserMessageIds((currentIds) => {
			const nextIds = new Set(currentIds);
			nextIds.add(messageId);
			return nextIds;
		});
		setActiveMessageMenuId(null);
	}

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
					{visibleMessages.length === 0 && !isSending && (
						<div className="rounded-lg border border-dashed border-app-border bg-app-panel px-5 py-8 text-center">
							<p className="text-sm font-semibold text-app-text">Start a conversation with {companionName}</p>
							<p className="mt-2 text-sm text-muted">
								Your chat is empty. Send the first message when you are ready.
							</p>
						</div>
					)}
					{visibleMessages.map((message) => {
						const isUser = message.author === "user";
						const isMenuOpen = activeMessageMenuId === message.id;

						return (
							<article
								key={message.id}
								className={cn("group flex items-end gap-2", isUser ? "justify-end" : "justify-start")}
							>
								{!isUser && (
									<img
										className="size-9 shrink-0 rounded-lg object-cover"
										src={companionAvatarUrl}
										alt=""
									/>
								)}
								{isUser && (
									<div className="relative w-8 shrink-0 self-end" ref={isMenuOpen ? menuContainerRef : null}>
										<button
											type="button"
											onClick={() =>
												setActiveMessageMenuId((currentId) =>
													currentId === message.id ? null : message.id
												)
											}
											className={cn(
												"ml-auto flex size-7 items-center justify-center rounded-md text-muted transition focus:outline-none focus:ring-2 focus:ring-primary/35",
												isMenuOpen
													? "bg-app-soft text-app-text"
													: "opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 hover:bg-app-soft hover:text-app-text"
											)}
											aria-label="Open message actions"
											aria-expanded={isMenuOpen}
										>
											<Ellipsis size={14} aria-hidden="true" />
										</button>
										{isMenuOpen && (
											<div className="absolute bottom-8 left-0 z-20 min-w-44 rounded-lg border border-app-border bg-app-panel p-1 text-app-text shadow-soft">
												<button
													type="button"
													onClick={() => hideUserMessage(message.id)}
													className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-left text-sm transition hover:bg-app-soft"
												>
													<EyeOff size={15} aria-hidden="true" />
													Hide message
												</button>
											</div>
										)}
									</div>
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
