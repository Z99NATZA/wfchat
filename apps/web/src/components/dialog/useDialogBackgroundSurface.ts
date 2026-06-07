import { type CSSProperties, useEffect, useLayoutEffect, useRef, useState } from "react";

type BackgroundMetrics = {
	renderWidth: number;
	renderHeight: number;
	originX: number;
	originY: number;
};

export function useDialogBackgroundSurface(backgroundImageUrl: string, isOpen: boolean) {
	const surfaceRef = useRef<HTMLElement>(null);
	const [metrics, setMetrics] = useState<BackgroundMetrics | null>(null);

	useEffect(() => {
		if (!isOpen || !backgroundImageUrl || typeof window === "undefined") {
			setMetrics(null);
			return;
		}

		let isCancelled = false;
		const image = new Image();

		function updateMetrics() {
			if (isCancelled || image.naturalWidth <= 0 || image.naturalHeight <= 0) {
				return;
			}

			setMetrics(calculateCoverMetrics(image.naturalWidth, image.naturalHeight));
		}

		image.onload = updateMetrics;
		image.onerror = () => {
			if (!isCancelled) {
				setMetrics(null);
			}
		};
		image.src = backgroundImageUrl;
		window.addEventListener("resize", updateMetrics);

		return () => {
			isCancelled = true;
			window.removeEventListener("resize", updateMetrics);
		};
	}, [backgroundImageUrl, isOpen]);

	useLayoutEffect(() => {
		const surfaceElement = surfaceRef.current;

		if (!isOpen || !surfaceElement || !backgroundImageUrl || !metrics || typeof window === "undefined") {
			return;
		}

		const syncedSurfaceElement = surfaceElement;
		const syncedMetrics = metrics;
		let animationFrameId = 0;

		function updateSurfacePosition() {
			animationFrameId = 0;

			const rect = syncedSurfaceElement.getBoundingClientRect();
			syncedSurfaceElement.style.setProperty(
				"--wfchat-surface-bg-position",
				`${syncedMetrics.originX - rect.left}px ${syncedMetrics.originY - rect.top}px`
			);
			syncedSurfaceElement.style.setProperty("--wfchat-surface-bg-opacity", "var(--app-bg-image-opacity)");
		}

		function scheduleUpdate() {
			if (animationFrameId) {
				return;
			}

			animationFrameId = window.requestAnimationFrame(updateSurfacePosition);
		}

		updateSurfacePosition();

		const resizeObserver = new ResizeObserver(scheduleUpdate);
		resizeObserver.observe(syncedSurfaceElement);
		window.addEventListener("resize", scheduleUpdate);

		return () => {
			if (animationFrameId) {
				window.cancelAnimationFrame(animationFrameId);
			}

			resizeObserver.disconnect();
			window.removeEventListener("resize", scheduleUpdate);
		};
	}, [backgroundImageUrl, isOpen, metrics]);

	const backgroundImageValue = backgroundImageUrl
		? `url(${JSON.stringify(backgroundImageUrl)})`
		: undefined;
	const style = backgroundImageValue
		? ({
				"--wfchat-bg-image": backgroundImageValue,
				"--wfchat-bg-render-size": metrics
					? `${metrics.renderWidth}px ${metrics.renderHeight}px`
					: "cover"
			} as CSSProperties)
		: undefined;

	return { ref: surfaceRef, style };
}

function calculateCoverMetrics(imageWidth: number, imageHeight: number): BackgroundMetrics {
	const viewportWidth = window.innerWidth;
	const viewportHeight = window.innerHeight;
	const scale = Math.max(viewportWidth / imageWidth, viewportHeight / imageHeight);
	const renderWidth = imageWidth * scale;
	const renderHeight = imageHeight * scale;

	return {
		renderWidth,
		renderHeight,
		originX: (viewportWidth - renderWidth) / 2,
		originY: (viewportHeight - renderHeight) / 2
	};
}
