import { ArrowDown, Check, Clipboard, Ellipsis, EyeOff } from "lucide-react";
import { UIEvent, useEffect, useMemo, useRef, useState } from "react";
import { Wand2 } from "lucide-react";
import { useDialog } from "@/components/dialog/DialogProvider";
import ChatMessageContent from "@/features/chat/components/ChatMessageContent";
import { useI18n } from "@/i18n";
import type { ChatMessage } from "@/types/chat";
import { cn } from "@/utils/classNames";
import { formatLocalDateKey, formatMessageDateLabel } from "@/utils/date";

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
	const { confirm } = useDialog();
	const { t } = useI18n();
	const scrollContainerRef = useRef<HTMLDivElement>(null);
	const menuContainerRef = useRef<HTMLDivElement>(null);
	const shouldStickToBottomRef = useRef(true);
	const previousMessageCountRef = useRef(messages.length);
	const [hiddenUserMessageIds, setHiddenUserMessageIds] = useState<Set<string>>(new Set());
	const [activeMessageMenuId, setActiveMessageMenuId] = useState<string | null>(null);
	const [copiedAssistantMessageId, setCopiedAssistantMessageId] = useState<string | null>(null);
	const [showJumpToLatest, setShowJumpToLatest] = useState(false);
	const [unseenMessageCount, setUnseenMessageCount] = useState(0);
	const userMessageBubbleClassName = "max-w-[min(30rem,72vw)] sm:max-w-[min(32rem,70%)]";
	const assistantMessageBubbleClassName =
		"min-w-0 max-w-[calc(100%-2.75rem)] sm:max-w-[min(42rem,calc(100%-2.75rem))] lg:max-w-[min(44rem,calc(100%-2.75rem))]";
	const visibleMessages = useMemo(
		() => messages.filter((message) => !(message.author === "user" && hiddenUserMessageIds.has(message.id))),
		[messages, hiddenUserMessageIds]
	);
	const hasStreamingAssistantMessage = visibleMessages.some(isStreamingAssistantMessage);
	const shouldShowThinkingBubble = isSending && !hasStreamingAssistantMessage;
	const messageGroups = useMemo(() => {
		return visibleMessages.map((message, index) => {
			const createdAt = message.createdAt > 0 ? message.createdAt : Math.floor(Date.now() / 1000);
			const messageDate = new Date(createdAt * 1000);
			const dateKey = formatLocalDateKey(messageDate);
			const nextMessage = visibleMessages[index + 1];
			const nextCreatedAt = nextMessage?.createdAt && nextMessage.createdAt > 0 ? nextMessage.createdAt : null;
			const nextDateKey = nextCreatedAt ? formatLocalDateKey(new Date(nextCreatedAt * 1000)) : null;
			const dateLabel =
				dateKey === nextDateKey
					? null
					: formatMessageDateLabel(messageDate, t("common.today"), t("common.yesterday"));
			return { dateLabel, message };
		});
	}, [t, visibleMessages]);

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

	async function hideUserMessage(messageId: string) {
		const shouldHide = await confirm({
			title: t("chat.messageList.hideConfirmTitle"),
			description: t("chat.messageList.hideConfirmDesc"),
			confirmLabel: t("chat.messageList.hideConfirmLabel")
		});

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

	async function copyAssistantMessage(message: ChatMessage) {
		if (!message.text) {
			return;
		}

		await navigator.clipboard?.writeText(message.text);
		setCopiedAssistantMessageId(message.id);
		window.setTimeout(() => {
			setCopiedAssistantMessageId((currentId) => (currentId === message.id ? null : currentId));
		}, 1200);
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
				<div className="mx-auto flex max-w-3xl items-center gap-3 rounded-lg border border-primary/20 bg-primary/8 p-3 text-sm text-app-text dark:border-app-border dark:bg-app-soft">
					<div className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-primary text-white">
						<Wand2 size={17} aria-hidden="true" />
					</div>
					<p>{t("chat.messageList.banner", { name: companionName })}</p>
				</div>

				<div className="mx-auto flex max-w-3xl flex-col gap-4">
					{visibleMessages.length === 0 && !isSending && (
						<div className="rounded-lg border border-dashed border-app-border bg-app-panel/92 px-5 py-8 text-center">
							<p className="text-sm font-semibold text-app-text">{t("chat.messageList.emptyTitle", { name: companionName })}</p>
							<p className="mt-2 text-sm text-muted">
								{t("chat.messageList.emptyDesc")}
							</p>
						</div>
					)}
					{messageGroups.map(({ dateLabel, message }) => {
						const isUser = message.author === "user";
						const isMenuOpen = activeMessageMenuId === message.id;
						const didCopyAssistantMessage = copiedAssistantMessageId === message.id;
						const canCopyAssistantMessage = !isUser && message.text.length > 0;
						const messageText =
							isSending && isStreamingAssistantMessage(message) && !message.text
								? t("chat.messageList.thinking", { name: companionName })
								: message.text;

						return (
							<div key={message.id} className="space-y-4">
								<article
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
														: "opacity-100 sm:opacity-0 sm:group-hover:opacity-100 sm:group-focus-within:opacity-100 hover:bg-app-soft hover:text-app-text"
												)}
												aria-label={t("chat.messageList.openMessageActions")}
												aria-expanded={isMenuOpen}
											>
												<Ellipsis size={14} aria-hidden="true" />
											</button>
											{isMenuOpen && (
												<div className="absolute bottom-8 left-0 z-20 min-w-44 rounded-lg border border-app-border bg-app-panel/92 p-1 text-app-text shadow-soft">
													<button
														type="button"
														onClick={() => hideUserMessage(message.id)}
														className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-left text-sm transition hover:bg-app-soft"
													>
														<EyeOff size={15} aria-hidden="true" />
														{t("chat.messageList.hideMessage")}
													</button>
												</div>
											)}
										</div>
									)}
									<div
										data-message-bubble={message.author}
										className={cn(
											isUser ? userMessageBubbleClassName : assistantMessageBubbleClassName,
											"rounded-lg px-4 py-3 shadow-soft",
											isUser
												? "bg-primary text-white dark:border dark:border-app-border dark:bg-primary dark:text-app-text"
												: "border border-app-border bg-app-panel/92 text-app-text"
										)}
									>
										<ChatMessageContent author={message.author} text={messageText} />
										<div className="mt-2 flex items-center justify-between gap-3">
											<p className={cn("text-[11px]", isUser ? "text-white/75 dark:text-muted" : "text-muted")}>
												{message.time}
											</p>
											{canCopyAssistantMessage && (
												<button
													type="button"
													className="flex size-7 shrink-0 items-center justify-center rounded-md text-muted transition hover:bg-app-soft hover:text-app-text focus:outline-none focus:ring-2 focus:ring-primary/30"
													aria-label={
														didCopyAssistantMessage
															? t("chat.messageList.assistantMessageCopied")
															: t("chat.messageList.copyAssistantMessage")
													}
													title={
														didCopyAssistantMessage
															? t("chat.messageList.assistantMessageCopied")
															: t("chat.messageList.copyAssistantMessage")
													}
													onClick={() => copyAssistantMessage(message)}
												>
													{didCopyAssistantMessage ? (
														<Check size={14} aria-hidden="true" />
													) : (
														<Clipboard size={14} aria-hidden="true" />
													)}
												</button>
											)}
										</div>
									</div>
								</article>
								{dateLabel && (
									<div className="flex justify-center">
										<span className="rounded-full border border-app-border bg-app-soft px-3 py-1 text-xs font-medium text-muted shadow-soft">
											{dateLabel}
										</span>
									</div>
								)}
							</div>
						);
					})}
					{shouldShowThinkingBubble && (
						<article className="flex items-end gap-3 justify-start">
							<img className="size-9 shrink-0 rounded-lg object-cover" src={companionAvatarUrl} alt="" />
							<div
								data-message-bubble="companion"
								className={cn(
									assistantMessageBubbleClassName,
									"rounded-lg border border-app-border bg-app-panel/92 px-4 py-3 text-app-text shadow-soft"
								)}
							>
								<p className="text-sm leading-6 text-app-text">{t("chat.messageList.thinking", { name: companionName })}</p>
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
						className="pointer-events-auto inline-flex items-center gap-2 rounded-full border border-app-border bg-app-panel/92 px-4 py-2 text-sm font-medium text-app-text shadow-soft transition hover:border-primary hover:text-primary"
					>
						<ArrowDown size={16} aria-hidden="true" />
						{t("chat.messageList.jumpToLatest")}
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

function isStreamingAssistantMessage(message: ChatMessage): boolean {
	return message.author === "companion" && message.id.startsWith("local-assistant-");
}

export default ChatMessageList;
