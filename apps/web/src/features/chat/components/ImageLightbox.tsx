import { ChevronLeft, ChevronRight, X } from "lucide-react";
import { type PointerEvent as ReactPointerEvent, useEffect, useRef, useState } from "react";
import IconButton from "@/components/ui/IconButton";
import { useI18n } from "@/i18n/i18nContext";
import { cn } from "@/utils/classNames";

export type ImageLightboxItem = {
	alt: string;
	id: string;
	url: string;
};

type ImageLightboxProps = {
	initialIndex: number;
	items: ImageLightboxItem[];
	onClose: () => void;
};

const SWIPE_THRESHOLD_PX = 56;

function ImageLightbox({ initialIndex, items, onClose }: ImageLightboxProps) {
	const { t } = useI18n();
	const [currentIndex, setCurrentIndex] = useState(() => clampIndex(initialIndex, items.length));
	const swipeStartRef = useRef<{ pointerId: number; x: number } | null>(null);
	const currentItem = items[currentIndex];
	const hasPrevious = currentIndex > 0;
	const hasNext = currentIndex < items.length - 1;

	useEffect(() => {
		setCurrentIndex((index) => clampIndex(index, items.length));
	}, [items.length]);

	useEffect(() => {
		function handleKeyDown(event: KeyboardEvent) {
			if (event.key === "ArrowLeft" && hasPrevious) {
				event.preventDefault();
				setCurrentIndex((index) => index - 1);
			}
			if (event.key === "ArrowRight" && hasNext) {
				event.preventDefault();
				setCurrentIndex((index) => index + 1);
			}
		}

		window.addEventListener("keydown", handleKeyDown);
		return () => window.removeEventListener("keydown", handleKeyDown);
	}, [hasNext, hasPrevious]);

	if (!currentItem) {
		return null;
	}

	function handlePointerDown(event: ReactPointerEvent<HTMLDivElement>) {
		if (event.pointerType !== "touch") {
			return;
		}

		swipeStartRef.current = { pointerId: event.pointerId, x: event.clientX };
		event.currentTarget.setPointerCapture(event.pointerId);
	}

	function handlePointerUp(event: ReactPointerEvent<HTMLDivElement>) {
		const swipeStart = swipeStartRef.current;

		if (!swipeStart || swipeStart.pointerId !== event.pointerId) {
			return;
		}

		swipeStartRef.current = null;
		const distance = event.clientX - swipeStart.x;
		if (distance <= -SWIPE_THRESHOLD_PX && hasNext) {
			setCurrentIndex((index) => index + 1);
		} else if (distance >= SWIPE_THRESHOLD_PX && hasPrevious) {
			setCurrentIndex((index) => index - 1);
		}

		event.currentTarget.releasePointerCapture(event.pointerId);
	}

	return (
		<div className="flex h-full min-h-0 flex-col bg-app-bg/95 text-app-text">
			<div className="flex h-11 shrink-0 items-center justify-between border-b border-app-border bg-app-panel/82 px-3 sm:h-12 sm:px-4">
				<p className="min-w-0 truncate text-sm font-medium">
					{items.length > 1
						? t("chat.imageLightbox.position", {
								current: currentIndex + 1,
								total: items.length
							})
						: currentItem.alt}
				</p>
				<IconButton
					autoFocus
					size="sm"
					variant="ghost"
					aria-label={t("chat.imageLightbox.close")}
					title={t("chat.imageLightbox.close")}
					onClick={onClose}
				>
					<X size={17} aria-hidden="true" />
				</IconButton>
			</div>

			<div
				className="relative flex min-h-0 flex-1 touch-pan-y items-center justify-center overflow-hidden px-2 py-2 sm:px-14 sm:py-3"
				data-testid="image-lightbox-stage"
				onPointerDown={handlePointerDown}
				onPointerUp={handlePointerUp}
				onPointerCancel={() => {
					swipeStartRef.current = null;
				}}
			>
				<img
					className="max-h-full max-w-full select-none object-contain"
					draggable={false}
					src={currentItem.url}
					alt={currentItem.alt}
				/>
				{items.length > 1 ? (
					<>
						<IconButton
							className="absolute left-2 top-1/2 -translate-y-1/2 bg-app-panel/92 sm:left-4"
							size="md"
							variant="default"
							aria-label={t("chat.imageLightbox.previous")}
							disabled={!hasPrevious}
							onClick={() => setCurrentIndex((index) => index - 1)}
						>
							<ChevronLeft size={20} aria-hidden="true" />
						</IconButton>
						<IconButton
							className="absolute right-2 top-1/2 -translate-y-1/2 bg-app-panel/92 sm:right-4"
							size="md"
							variant="default"
							aria-label={t("chat.imageLightbox.next")}
							disabled={!hasNext}
							onClick={() => setCurrentIndex((index) => index + 1)}
						>
							<ChevronRight size={20} aria-hidden="true" />
						</IconButton>
					</>
				) : null}
			</div>

			{items.length > 1 ? (
				<div className="chat-scroll flex h-20 shrink-0 items-center justify-center gap-2 overflow-x-auto border-t border-app-border bg-app-panel/82 px-3 py-2">
					{items.map((item, index) => (
						<button
							key={item.id}
							type="button"
							className={cn(
								"h-14 w-14 shrink-0 overflow-hidden rounded-md border-2 bg-app-soft p-0 focus:outline-none focus-visible:border-control-focus-border",
								index === currentIndex
									? "border-primary"
									: "border-transparent opacity-70 hover:opacity-100"
							)}
							aria-current={index === currentIndex ? "true" : undefined}
							aria-label={t("chat.imageLightbox.showImage", { index: index + 1 })}
							onClick={() => setCurrentIndex(index)}
						>
							<img
								className="h-full w-full object-cover"
								draggable={false}
								src={item.url}
								alt=""
							/>
						</button>
					))}
				</div>
			) : null}
		</div>
	);
}

export default ImageLightbox;

function clampIndex(index: number, itemCount: number): number {
	return Math.max(0, Math.min(index, Math.max(0, itemCount - 1)));
}
