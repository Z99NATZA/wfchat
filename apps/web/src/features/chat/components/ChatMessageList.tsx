import { ArrowDown, Check, Clipboard, Ellipsis, EyeOff, LoaderCircle, Volume2, VolumeX, Wand2 } from "lucide-react";
import {
	type CSSProperties,
	type ReactNode,
	type UIEvent,
	useCallback,
	useEffect,
	useLayoutEffect,
	useMemo,
	useRef,
	useState
} from "react";
import { useDialog } from "@/components/dialog/DialogProvider";
import ChatMessageContent from "@/features/chat/components/ChatMessageContent";
import { useI18n } from "@/i18n";
import type { ChatMessage } from "@/types/chat";
import type { AssistantSpeechPlaybackState } from "@/features/chat/hooks/useAssistantSpeechPlayback";
import type { Theme } from "@/types/theme";
import { cn } from "@/utils/classNames";
import { formatLocalDateKey, formatMessageDateLabel } from "@/utils/date";

type ChatMessageListProps = {
	activeChatId?: string | null;
	messages: ChatMessage[];
	companionName: string;
	companionAvatarUrl: string;
	errorMessage?: string | null;
	isSending?: boolean;
	bottomClearancePx?: number;
	onLoadMarkdownQaMessages?: () => void;
	isAssistantSpeechEnabled?: boolean;
	assistantSpeechPlayback?: AssistantSpeechPlaybackState;
	onToggleAssistantSpeech?: (messageId: string) => void;
	theme?: Theme;
};

type MessageRow = {
	dateLabel: string | null;
	id: string;
	message: ChatMessage;
};

type VirtualRange = {
	endIndex: number;
	startIndex: number;
};

const DEFAULT_VIEWPORT_HEIGHT = 720;
const MESSAGE_ROW_GAP_PX = 16;
const VIRTUAL_OVERSCAN_ROWS = 8;

function ChatMessageList({
	activeChatId = null,
	messages,
	companionName,
	companionAvatarUrl,
	errorMessage,
	isSending = false,
	bottomClearancePx = 0,
	onLoadMarkdownQaMessages,
	isAssistantSpeechEnabled = false,
	assistantSpeechPlayback,
	onToggleAssistantSpeech,
	theme = "light"
}: ChatMessageListProps) {
	const { confirm } = useDialog();
	const { t } = useI18n();
	const scrollContainerRef = useRef<HTMLDivElement>(null);
	const virtualTimelineRef = useRef<HTMLDivElement>(null);
	const menuContainerRef = useRef<HTMLDivElement>(null);
	const shouldStickToBottomRef = useRef(true);
	const lastScrollTopRef = useRef(0);
	const previousMessageCountRef = useRef(messages.length);
	const previousRowIdsRef = useRef<string[]>([]);
	const shouldAutoScrollAfterChatChangeRef = useRef(false);
	const rowTopByIdRef = useRef<Map<string, number>>(new Map());
	const scrollToBottomFrameRef = useRef<number | null>(null);
	const [hiddenUserMessageIds, setHiddenUserMessageIds] = useState<Set<string>>(new Set());
	const [activeMessageMenuId, setActiveMessageMenuId] = useState<string | null>(null);
	const [copiedAssistantMessageId, setCopiedAssistantMessageId] = useState<string | null>(null);
	const [showJumpToLatest, setShowJumpToLatest] = useState(false);
	const [unseenMessageCount, setUnseenMessageCount] = useState(0);
	const [scrollTop, setScrollTop] = useState(0);
	const [viewportHeight, setViewportHeight] = useState(DEFAULT_VIEWPORT_HEIGHT);
	const [virtualTimelineTop, setVirtualTimelineTop] = useState(0);
	const [measuredRowHeights, setMeasuredRowHeights] = useState<Map<string, number>>(() => new Map());
	const userMessageBubbleClassName = "max-w-[min(30rem,72vw)] sm:max-w-[min(32rem,70%)]";
	const assistantMessageBubbleClassName =
		"min-w-0 max-w-[calc(100%-2.75rem)] sm:max-w-[min(42rem,calc(100%-2.75rem))] lg:max-w-[min(44rem,calc(100%-2.75rem))]";
	const visibleMessages = useMemo(
		() => messages.filter((message) => !(message.author === "user" && hiddenUserMessageIds.has(message.id))),
		[messages, hiddenUserMessageIds]
	);
	const hasStreamingAssistantMessage = visibleMessages.some(isStreamingAssistantMessage);
	const shouldShowThinkingBubble = isSending && !hasStreamingAssistantMessage;
	const messageRows = useMemo<MessageRow[]>(() => {
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
			return { dateLabel, id: message.id, message };
		});
	}, [t, visibleMessages]);
	const rowMetrics = useMemo(() => {
		const offsets: number[] = [];
		const heights: number[] = [];
		const topById = new Map<string, number>();
		let totalHeight = 0;

		for (const row of messageRows) {
			const rowHeight = measuredRowHeights.get(row.id) ?? estimateMessageRowHeight(row);
			offsets.push(totalHeight);
			heights.push(rowHeight);
			topById.set(row.id, totalHeight);
			totalHeight += rowHeight;
		}

		return { heights, offsets, topById, totalHeight };
	}, [measuredRowHeights, messageRows]);
	const virtualScrollTop = Math.max(0, scrollTop - virtualTimelineTop);
	const virtualRange = useMemo(
		() => getVirtualRange(rowMetrics.offsets, rowMetrics.heights, virtualScrollTop, viewportHeight),
		[rowMetrics.heights, rowMetrics.offsets, virtualScrollTop, viewportHeight]
	);
	const virtualRows = messageRows.slice(virtualRange.startIndex, virtualRange.endIndex);

	const scheduleScrollToBottom = useCallback((behavior: ScrollBehavior = "smooth") => {
		const container = scrollContainerRef.current;

		if (!container) {
			return;
		}

		if (scrollToBottomFrameRef.current !== null) {
			window.cancelAnimationFrame(scrollToBottomFrameRef.current);
		}

		scrollToBottomFrameRef.current = window.requestAnimationFrame(() => {
			scrollToBottomFrameRef.current = null;
			container.scrollTo({
				top: container.scrollHeight,
				behavior
			});
		});
	}, []);

	const updateViewportState = useCallback(() => {
		const container = scrollContainerRef.current;

		if (!container) {
			return;
		}

		setScrollTop(container.scrollTop);
		lastScrollTopRef.current = container.scrollTop;
		setViewportHeight(container.clientHeight > 0 ? container.clientHeight : DEFAULT_VIEWPORT_HEIGHT);
		setVirtualTimelineTop(getVirtualTimelineTop(container, virtualTimelineRef.current));
	}, []);

	const measureRowHeight = useCallback((rowId: string, height: number) => {
		if (height < 1) {
			return;
		}

		setMeasuredRowHeights((currentHeights) => {
			const previousHeight = currentHeights.get(rowId);

			if (previousHeight !== undefined && Math.abs(previousHeight - height) < 1) {
				return currentHeights;
			}

			const container = scrollContainerRef.current;
			const hasMeasuredHeight = previousHeight !== undefined;
			const previousOrEstimatedHeight =
				previousHeight ??
				estimateMessageRowHeightFromId(rowId, currentHeights, messageRows);
			const heightDelta = height - previousOrEstimatedHeight;
			const rowTop = rowTopByIdRef.current.get(rowId);

			if (
				container &&
				hasMeasuredHeight &&
				rowTop !== undefined &&
				rowTop < Math.max(0, container.scrollTop - virtualTimelineTop) &&
				!shouldStickToBottomRef.current
			) {
				container.scrollTop += heightDelta;
				lastScrollTopRef.current = container.scrollTop;
				setScrollTop(container.scrollTop);
			}

			const nextHeights = new Map(currentHeights);
			nextHeights.set(rowId, height);
			return nextHeights;
		});

		const container = scrollContainerRef.current;

		if (container && shouldStickToBottomRef.current && isNearScrollBottom(container, 8)) {
			scheduleScrollToBottom("auto");
		}
	}, [messageRows, scheduleScrollToBottom, virtualTimelineTop]);

	function handleScroll(event: UIEvent<HTMLDivElement>) {
		const { scrollTop: nextScrollTop, scrollHeight, clientHeight } = event.currentTarget;
		const distanceFromBottom = scrollHeight - (nextScrollTop + clientHeight);
		const isScrollingUp = nextScrollTop < lastScrollTopRef.current - 1;
		lastScrollTopRef.current = nextScrollTop;
		shouldStickToBottomRef.current = isScrollingUp ? false : distanceFromBottom < 80;
		setScrollTop(nextScrollTop);
		setViewportHeight(clientHeight > 0 ? clientHeight : DEFAULT_VIEWPORT_HEIGHT);
		setVirtualTimelineTop(getVirtualTimelineTop(event.currentTarget, virtualTimelineRef.current));
		setShowJumpToLatest(distanceFromBottom > 180);

		if (distanceFromBottom < 80) {
			setUnseenMessageCount(0);
		}
	}

	useLayoutEffect(() => {
		rowTopByIdRef.current = rowMetrics.topById;
	}, [rowMetrics.topById]);

	useLayoutEffect(() => {
		shouldStickToBottomRef.current = true;
		shouldAutoScrollAfterChatChangeRef.current = true;
		lastScrollTopRef.current = 0;
		previousMessageCountRef.current = messages.length;
		previousRowIdsRef.current = [];
		setHiddenUserMessageIds(new Set());
		setActiveMessageMenuId(null);
		setCopiedAssistantMessageId(null);
		setShowJumpToLatest(false);
		setUnseenMessageCount(0);
		setMeasuredRowHeights(new Map());
		setScrollTop(0);
		scheduleScrollToBottom("auto");
	}, [activeChatId, scheduleScrollToBottom]);

	useLayoutEffect(() => {
		const previousRowIds = previousRowIdsRef.current;
		const nextRowIds = messageRows.map((row) => row.id);
		const firstPreviousRowId = previousRowIds[0];
		const previousFirstRowNewIndex = firstPreviousRowId ? nextRowIds.indexOf(firstPreviousRowId) : -1;
		const didPrependRows = previousFirstRowNewIndex > 0;
		const container = scrollContainerRef.current;

		if (container && didPrependRows && !shouldStickToBottomRef.current) {
			const prependedHeight = messageRows
				.slice(0, previousFirstRowNewIndex)
				.reduce((total, row) => total + (measuredRowHeights.get(row.id) ?? estimateMessageRowHeight(row)), 0);
			container.scrollTop += prependedHeight;
			setScrollTop(container.scrollTop);
		}

		previousRowIdsRef.current = nextRowIds;
	}, [measuredRowHeights, messageRows]);

	useLayoutEffect(() => {
		updateViewportState();

		const container = scrollContainerRef.current;

		if (!container) {
			return;
		}

		if (typeof ResizeObserver === "undefined") {
			window.addEventListener("resize", updateViewportState);
			return () => window.removeEventListener("resize", updateViewportState);
		}

		const resizeObserver = new ResizeObserver(updateViewportState);
		resizeObserver.observe(container);

		if (virtualTimelineRef.current) {
			resizeObserver.observe(virtualTimelineRef.current);
		}

		return () => resizeObserver.disconnect();
	}, [messageRows.length, onLoadMarkdownQaMessages, updateViewportState]);

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

		const scrollBehavior = shouldAutoScrollAfterChatChangeRef.current ? "auto" : "smooth";
		shouldAutoScrollAfterChatChangeRef.current = false;
		scheduleScrollToBottom(scrollBehavior);
		setShowJumpToLatest(false);
		setUnseenMessageCount(0);
	}, [bottomClearancePx, isSending, messages, rowMetrics.totalHeight, scheduleScrollToBottom]);

	useEffect(() => {
		setActiveMessageMenuId(null);
	}, [messages]);

	useEffect(() => {
		return () => {
			if (scrollToBottomFrameRef.current !== null) {
				window.cancelAnimationFrame(scrollToBottomFrameRef.current);
			}
		};
	}, []);

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
		shouldStickToBottomRef.current = true;
		setShowJumpToLatest(false);
		setUnseenMessageCount(0);
		scheduleScrollToBottom("smooth");
	}

	function renderMessageRow(row: MessageRow) {
		const { dateLabel, message } = row;
		const isUser = message.author === "user";
		const isMenuOpen = activeMessageMenuId === message.id;
		const didCopyAssistantMessage = copiedAssistantMessageId === message.id;
		const canCopyAssistantMessage = !isUser && message.text.length > 0;
		const isStreamingAssistant = isSending && isStreamingAssistantMessage(message);
		const canPlayAssistantSpeech =
			!isUser &&
			isAssistantSpeechEnabled &&
			message.text.length > 0 &&
			!isStreamingAssistantMessage(message) &&
			Boolean(onToggleAssistantSpeech);
		const assistantSpeechStatus =
			assistantSpeechPlayback?.messageId === message.id ? assistantSpeechPlayback.status : "idle";
		const messageText =
			isStreamingAssistant && !message.text
				? t("chat.messageList.thinking", { name: companionName })
				: message.text;

		return (
			<div className="space-y-4">
				<article className={cn("group flex items-end gap-2", isUser ? "justify-end" : "justify-start")}>
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
						<ChatMessageContent
							author={message.author}
							isStreaming={isStreamingAssistant}
							text={messageText}
							theme={theme}
						/>
						<div className="mt-2 flex items-center justify-between gap-3">
							<p className={cn("text-[11px]", isUser ? "text-white/75 dark:text-muted" : "text-muted")}>
								{message.time}
							</p>

							<div className="flex items-center gap-1 justify-end">
								{canPlayAssistantSpeech && (
									<button
										type="button"
										className="flex size-7 shrink-0 items-center justify-center rounded-md text-muted transition hover:bg-app-soft hover:text-app-text focus:outline-none focus:ring-2 focus:ring-primary/30"
										aria-label={assistantSpeechLabel(assistantSpeechStatus, t)}
										title={assistantSpeechLabel(assistantSpeechStatus, t)}
										onClick={() => onToggleAssistantSpeech?.(message.id)}
									>
										{assistantSpeechStatus === "loading" ? (
											<LoaderCircle className="animate-spin" size={14} aria-hidden="true" />
										) : assistantSpeechStatus === "playing" ? (
											<VolumeX size={14} aria-hidden="true" />
										) : (
											<Volume2 size={14} aria-hidden="true" />
										)}
									</button>
								)}
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
	}

	return (
		<div className="relative flex-1 min-h-0">
			<div
				ref={scrollContainerRef}
				onScroll={handleScroll}
				className="chat-scroll h-full overflow-y-auto px-4 py-6 lg:px-8"
				style={bottomClearancePx > 0 ? { paddingBottom: `${bottomClearancePx}px` } : undefined}
			>
				<div className="mx-auto flex max-w-3xl items-center gap-3 rounded-lg border border-primary/20 bg-primary/8 p-3 text-sm text-app-text dark:border-app-border dark:bg-app-soft">
					<div className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-primary text-white">
						<Wand2 size={17} aria-hidden="true" />
					</div>
					<p className="min-w-0 flex-1">{t("chat.messageList.banner", { name: companionName })}</p>
					{onLoadMarkdownQaMessages && (
						<button
							type="button"
							className="shrink-0 rounded-md border border-app-border bg-app-soft px-3 py-1.5 text-xs font-medium text-app-text transition hover:border-primary hover:text-primary dark:hover:border-action-border dark:hover:bg-action-hover dark:hover:text-app-text"
							onClick={onLoadMarkdownQaMessages}
						>
							{t("chat.messageList.loadMarkdownQa")}
						</button>
					)}
				</div>

				<div ref={virtualTimelineRef} className="mx-auto mt-5 max-w-3xl">
					{visibleMessages.length === 0 && !isSending && (
						<div className="rounded-lg border border-dashed border-app-border bg-app-panel/92 px-5 py-8 text-center">
							<p className="text-sm font-semibold text-app-text">{t("chat.messageList.emptyTitle", { name: companionName })}</p>
							<p className="mt-2 text-sm text-muted">
								{t("chat.messageList.emptyDesc")}
							</p>
						</div>
					)}

					{messageRows.length > 0 && (
						<div
							data-virtualized-message-list
							style={{
								height: `${rowMetrics.totalHeight}px`,
								position: "relative"
							}}
						>
							{virtualRows.map((row, index) => {
								const rowIndex = virtualRange.startIndex + index;
								return (
									<VirtualMessageRow
										key={row.id}
										rowId={row.id}
										top={rowMetrics.offsets[rowIndex] ?? 0}
										onMeasuredHeight={measureRowHeight}
									>
										{renderMessageRow(row)}
									</VirtualMessageRow>
								);
							})}
						</div>
					)}

					<div className={cn("flex flex-col gap-4", messageRows.length > 0 && "mt-0")}>
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
			</div>

			{showJumpToLatest && (
				<div className="pointer-events-none absolute bottom-5 right-4 z-10 sm:right-8">
					<button
						type="button"
						onClick={scrollToLatest}
						className="pointer-events-auto inline-flex items-center gap-2 rounded-full border border-app-border bg-app-panel/92 px-4 py-2 text-sm font-medium text-app-text shadow-soft transition hover:border-primary hover:text-primary dark:border-action-border dark:bg-dialog-panel dark:text-app-text dark:hover:border-muted dark:hover:bg-action-hover dark:hover:text-app-text"
					>
						<ArrowDown size={16} aria-hidden="true" />
						{t("chat.messageList.jumpToLatest")}
						{unseenMessageCount > 0 && (
							<span className="rounded-full bg-primary px-2 py-0.5 text-xs font-semibold text-white dark:border dark:border-action-border dark:bg-muted/25 dark:text-app-text">
								+{unseenMessageCount}
							</span>
						)}
					</button>
				</div>
			)}
		</div>
	);
}

function assistantSpeechLabel(
	status: AssistantSpeechPlaybackState["status"],
	t: (key: string) => string
): string {
	if (status === "loading" || status === "playing") {
		return t("chat.messageList.stopAssistantSpeech");
	}

	if (status === "error") {
		return t("chat.messageList.retryAssistantSpeech");
	}

	return t("chat.messageList.playAssistantSpeech");
}

function isNearScrollBottom(container: HTMLDivElement, thresholdPx: number): boolean {
	return container.scrollHeight - (container.scrollTop + container.clientHeight) <= thresholdPx;
}

function VirtualMessageRow({
	children,
	onMeasuredHeight,
	rowId,
	top
}: {
	children: ReactNode;
	onMeasuredHeight: (rowId: string, height: number) => void;
	rowId: string;
	top: number;
}) {
	const rowRef = useRef<HTMLDivElement>(null);
	const rowStyle: CSSProperties = {
		left: 0,
		position: "absolute",
		right: 0,
		top: 0,
		transform: `translateY(${top}px)`
	};

	useLayoutEffect(() => {
		const rowElement = rowRef.current;

		if (!rowElement) {
			return;
		}

		const measuredRowElement: HTMLDivElement = rowElement;

		function measureHeight() {
			onMeasuredHeight(rowId, Math.ceil(measuredRowElement.getBoundingClientRect().height));
		}

		measureHeight();

		if (typeof ResizeObserver === "undefined") {
			window.addEventListener("resize", measureHeight);
			return () => window.removeEventListener("resize", measureHeight);
		}

		const resizeObserver = new ResizeObserver(measureHeight);
		resizeObserver.observe(measuredRowElement);
		return () => resizeObserver.disconnect();
	}, [onMeasuredHeight, rowId]);

	return (
		<div ref={rowRef} className="pb-4" data-virtual-message-row={rowId} style={rowStyle}>
			{children}
		</div>
	);
}

function getVirtualTimelineTop(container: HTMLDivElement, virtualTimeline: HTMLDivElement | null): number {
	if (!virtualTimeline) {
		return 0;
	}

	const containerRect = container.getBoundingClientRect();
	const timelineRect = virtualTimeline.getBoundingClientRect();
	return Math.max(0, timelineRect.top - containerRect.top + container.scrollTop);
}

function getVirtualRange(
	offsets: number[],
	heights: number[],
	scrollTop: number,
	viewportHeight: number
): VirtualRange {
	if (offsets.length === 0) {
		return { endIndex: 0, startIndex: 0 };
	}

	const viewportBottom = scrollTop + Math.max(viewportHeight, DEFAULT_VIEWPORT_HEIGHT);
	const visibleStartIndex = findFirstRowAtOrAfterOffset(offsets, heights, scrollTop);
	const visibleEndIndex = findFirstRowAfterOffset(offsets, viewportBottom);

	return {
		startIndex: Math.max(0, visibleStartIndex - VIRTUAL_OVERSCAN_ROWS),
		endIndex: Math.min(offsets.length, Math.max(visibleEndIndex + VIRTUAL_OVERSCAN_ROWS, visibleStartIndex + 1))
	};
}

function findFirstRowAtOrAfterOffset(offsets: number[], heights: number[], targetOffset: number): number {
	let low = 0;
	let high = offsets.length - 1;
	let result = offsets.length - 1;

	while (low <= high) {
		const mid = Math.floor((low + high) / 2);
		const rowBottom = offsets[mid] + heights[mid];

		if (rowBottom >= targetOffset) {
			result = mid;
			high = mid - 1;
		} else {
			low = mid + 1;
		}
	}

	return result;
}

function findFirstRowAfterOffset(offsets: number[], targetOffset: number): number {
	let low = 0;
	let high = offsets.length - 1;
	let result = offsets.length;

	while (low <= high) {
		const mid = Math.floor((low + high) / 2);

		if (offsets[mid] > targetOffset) {
			result = mid;
			high = mid - 1;
		} else {
			low = mid + 1;
		}
	}

	return result;
}

function estimateMessageRowHeight(row: MessageRow): number {
	const text = row.message.text || " ";
	const estimatedCharactersPerLine = row.message.author === "user" ? 42 : 72;
	const textLines = Math.max(
		1,
		text
			.split("\n")
			.reduce((lineCount, line) => lineCount + Math.max(1, Math.ceil(line.length / estimatedCharactersPerLine)), 0)
	);
	const codeBlockCount = (text.match(/```/g)?.length ?? 0) / 2;
	const tableLineCount = text.split("\n").filter((line) => line.trim().startsWith("|")).length;
	const dateLabelHeight = row.dateLabel ? 38 : 0;
	const markdownExtraHeight = Math.min(260, Math.ceil(codeBlockCount) * 88 + tableLineCount * 12);
	const estimatedHeight = 74 + textLines * 22 + markdownExtraHeight + dateLabelHeight + MESSAGE_ROW_GAP_PX;

	return Math.max(108, Math.min(900, estimatedHeight));
}

function estimateMessageRowHeightFromId(
	rowId: string,
	currentHeights: Map<string, number>,
	rows: MessageRow[]
): number {
	const measuredHeight = currentHeights.get(rowId);

	if (measuredHeight !== undefined) {
		return measuredHeight;
	}

	const row = rows.find((item) => item.id === rowId);
	return row ? estimateMessageRowHeight(row) : 108;
}

function isStreamingAssistantMessage(message: ChatMessage): boolean {
	return message.author === "companion" && message.id.startsWith("local-assistant-");
}

export default ChatMessageList;
