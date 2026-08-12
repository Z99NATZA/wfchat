import { PointerEvent, ReactNode, useEffect, useRef, useState } from "react";
import { X } from "lucide-react";
import { createPortal } from "react-dom";
import IconButton from "@/components/ui/IconButton";
import type { DialogVariant } from "@/components/dialog/DialogContext";

type DialogProps = {
	isOpen: boolean;
	title: string;
	description?: string;
	content?: ReactNode;
	actions: ReactNode;
	onClose: () => void;
	isDraggable?: boolean;
	size?: "default" | "wide";
	variant?: DialogVariant;
};

function Dialog({
	isOpen,
	title,
	description,
	content,
	actions,
	onClose,
	isDraggable = true,
	size = "default",
	variant = "default"
}: DialogProps) {
	const [offset, setOffset] = useState({ x: 0, y: 0 });
	const dragStateRef = useRef<{ pointerId: number; startX: number; startY: number } | null>(null);
	const canDragDialog = useDesktopDraggableDialog(isDraggable);

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
		if (!canDragDialog || event.button !== 0) {
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
		<div
			className={
				variant === "lightbox"
					? "fixed inset-0 z-50 flex items-center justify-center p-0 sm:p-3"
					: "fixed inset-0 z-50 flex items-center justify-center p-4"
			}
			role="presentation"
		>
			<button
				type="button"
				className={
					variant === "lightbox"
						? "absolute inset-0 bg-app-bg/95"
						: "absolute inset-0 bg-slate-950/45"
				}
				tabIndex={-1}
				onClick={onClose}
				aria-label="Close dialog"
			/>
			<section
				role="dialog"
				aria-modal="true"
				aria-labelledby="wfchat-dialog-title"
				aria-describedby={description ? "wfchat-dialog-description" : undefined}
				className={
					variant === "lightbox"
						? "relative flex h-full w-full flex-col overflow-hidden bg-app-bg/95 text-app-text sm:rounded-xl sm:border sm:border-dialog-border"
						: size === "wide"
							? "relative w-full max-w-4xl overflow-hidden rounded-xl border border-dialog-border bg-dialog-soft text-app-text"
							: "relative w-full max-w-md overflow-hidden rounded-xl border border-dialog-border bg-dialog-soft text-app-text"
				}
				style={{
					transform: `translate(${offset.x}px, ${offset.y}px)`
				}}
			>
				{variant === "lightbox" ? (
					<>
						<h2 id="wfchat-dialog-title" className="sr-only">
							{title}
						</h2>
						{description ? (
							<p id="wfchat-dialog-description" className="sr-only">
								{description}
							</p>
						) : null}
						{content ? <div className="min-h-0 flex-1">{content}</div> : null}
					</>
				) : (
					<>
						<div
							className={
								canDragDialog
									? "cursor-move select-none border-b border-dialog-border bg-dialog-soft px-5 py-3"
									: "border-b border-dialog-border bg-dialog-soft px-5 py-3"
							}
							onPointerDown={handleDragStart}
							onPointerMove={handleDragMove}
							onPointerUp={handleDragEnd}
							onPointerCancel={handleDragEnd}
						>
							<h2 id="wfchat-dialog-title" className="text-base font-semibold">
								{title}
							</h2>
							<IconButton
								size="sm"
								variant="ghostDanger"
								onPointerDown={(event) => event.stopPropagation()}
								onClick={onClose}
								className="absolute right-3 top-3"
								aria-label="Close dialog"
							>
								<X size={16} aria-hidden="true" />
							</IconButton>
						</div>
						{description && (
							<p
								id="wfchat-dialog-description"
								className="px-5 pt-4 text-sm leading-6 text-muted"
							>
								{description}
							</p>
						)}
						{content && <div className="px-5 pt-4">{content}</div>}
						{actions ? (
							<div className="flex justify-end gap-2 px-5 py-5">{actions}</div>
						) : null}
					</>
				)}
			</section>
		</div>,
		document.body
	);
}

function useDesktopDraggableDialog(isDraggable: boolean) {
	const [canDragDialog, setCanDragDialog] = useState(
		() => isDraggable && matchesDesktopDraggableDialog()
	);

	useEffect(() => {
		if (!isDraggable) {
			setCanDragDialog(false);
			return;
		}

		if (typeof window === "undefined" || typeof window.matchMedia !== "function") {
			setCanDragDialog(false);
			return;
		}

		const mediaQuery = window.matchMedia("(min-width: 768px) and (pointer: fine)");
		const updateCanDragDialog = () => setCanDragDialog(mediaQuery.matches);

		updateCanDragDialog();
		mediaQuery.addEventListener("change", updateCanDragDialog);
		return () => mediaQuery.removeEventListener("change", updateCanDragDialog);
	}, [isDraggable]);

	return canDragDialog;
}

function matchesDesktopDraggableDialog() {
	if (typeof window === "undefined" || typeof window.matchMedia !== "function") {
		return false;
	}

	return window.matchMedia("(min-width: 768px) and (pointer: fine)").matches;
}

export default Dialog;
