import { PointerEvent, ReactNode, useEffect, useRef, useState } from "react";
import { X } from "lucide-react";
import { createPortal } from "react-dom";

type DialogProps = {
	isOpen: boolean;
	title: string;
	description?: string;
	content?: ReactNode;
	actions: ReactNode;
	onClose: () => void;
	isDraggable?: boolean;
};

function Dialog({
	isOpen,
	title,
	description,
	content,
	actions,
	onClose,
	isDraggable = true
}: DialogProps) {
	const [offset, setOffset] = useState({ x: 0, y: 0 });
	const dragStateRef = useRef<{ pointerId: number; startX: number; startY: number } | null>(null);

	useEffect(() => {
		if (isOpen) {
			setOffset({ x: 0, y: 0 });
		}
	}, [isOpen]);

	useEffect(() => {
		if (!isOpen) {
			return;
		}

		function handleKeyDown(event: KeyboardEvent) {
			if (event.key === "Escape") {
				onClose();
			}
		}

		window.addEventListener("keydown", handleKeyDown);
		return () => window.removeEventListener("keydown", handleKeyDown);
	}, [isOpen, onClose]);

	if (!isOpen) {
		return null;
	}

	function handleDragStart(event: PointerEvent<HTMLDivElement>) {
		if (!isDraggable || event.button !== 0) {
			return;
		}

		const targetElement = event.target as HTMLElement;
		if (targetElement.closest("button, a, input, textarea, select")) {
			return;
		}

		dragStateRef.current = {
			pointerId: event.pointerId,
			startX: event.clientX - offset.x,
			startY: event.clientY - offset.y
		};

		event.currentTarget.setPointerCapture(event.pointerId);
	}

	function handleDragMove(event: PointerEvent<HTMLDivElement>) {
		const dragState = dragStateRef.current;

		if (!dragState || dragState.pointerId !== event.pointerId) {
			return;
		}

		setOffset({
			x: event.clientX - dragState.startX,
			y: event.clientY - dragState.startY
		});
	}

	function handleDragEnd(event: PointerEvent<HTMLDivElement>) {
		const dragState = dragStateRef.current;

		if (!dragState || dragState.pointerId !== event.pointerId) {
			return;
		}

		dragStateRef.current = null;
		event.currentTarget.releasePointerCapture(event.pointerId);
	}

	return createPortal(
		<div className="fixed inset-0 z-50 flex items-center justify-center p-4" role="presentation">
			<button
				type="button"
				className="absolute inset-0 bg-slate-950/45"
				onClick={onClose}
				aria-label="Close dialog"
			/>
			<section
				role="dialog"
				aria-modal="true"
				aria-labelledby="wfchat-dialog-title"
				aria-describedby={description ? "wfchat-dialog-description" : undefined}
				className="relative w-full max-w-md overflow-hidden rounded-xl border border-app-border bg-app-panel/62 text-app-text shadow-soft"
				style={{
					transform: `translate(${offset.x}px, ${offset.y}px)`
				}}
			>
				<div
					className={
						isDraggable
							? "cursor-move select-none border-b border-app-border bg-app-soft/82 px-5 py-3"
							: "border-b border-app-border bg-app-soft/82 px-5 py-3"
					}
					onPointerDown={handleDragStart}
					onPointerMove={handleDragMove}
					onPointerUp={handleDragEnd}
					onPointerCancel={handleDragEnd}
				>
					<h2 id="wfchat-dialog-title" className="text-base font-semibold">
						{title}
					</h2>
					<button
						type="button"
						onPointerDown={(event) => event.stopPropagation()}
						onClick={onClose}
						className="absolute right-3 top-3 flex size-8 items-center justify-center rounded-md text-red-500/70 transition hover:bg-red-500/10 hover:text-red-500 focus:outline-none focus:ring-2 focus:ring-red-500/30"
						aria-label="Close dialog"
					>
						<X size={16} aria-hidden="true" />
					</button>
				</div>
				{description && (
					<p id="wfchat-dialog-description" className="px-5 pt-4 text-sm leading-6 text-muted">
						{description}
					</p>
				)}
				{content && <div className="px-5 pt-4">{content}</div>}
				<div className="flex justify-end gap-2 px-5 py-5">{actions}</div>
			</section>
		</div>,
		document.body
	);
}

export default Dialog;
