import {
	useEffect,
	useLayoutEffect,
	useRef,
	useState,
	type CSSProperties,
	type ReactNode,
	type RefObject
} from "react";

type AppLayoutProps = {
	activityBar?: ReactNode;
	sidebar: ReactNode;
	header: ReactNode;
	children: ReactNode;
	details?: ReactNode;
	backgroundImageUrl?: string;
};

type BackgroundMetrics = {
	renderWidth: number;
	renderHeight: number;
	originX: number;
	originY: number;
};

function AppLayout({
	activityBar,
	sidebar,
	header,
	children,
	details,
	backgroundImageUrl
}: AppLayoutProps) {
	const layoutRef = useRef<HTMLElement>(null);
	const backgroundMetrics = useBackgroundMetrics(backgroundImageUrl);
	useSurfaceBackgroundSync(layoutRef, backgroundImageUrl, backgroundMetrics);

	const backgroundImageValue = backgroundImageUrl
		? `url(${JSON.stringify(backgroundImageUrl)})`
		: undefined;
	const layoutStyle = backgroundImageValue
		? ({
				"--wfchat-bg-image": backgroundImageValue,
				"--wfchat-bg-render-size": backgroundMetrics
					? `${backgroundMetrics.renderWidth}px ${backgroundMetrics.renderHeight}px`
					: "cover",
				"--wfchat-bg-root-position": backgroundMetrics
					? `${backgroundMetrics.originX}px ${backgroundMetrics.originY}px`
					: "center"
			} as CSSProperties)
		: undefined;
	const backgroundImageStyle = backgroundImageUrl
		? {
				backgroundImage: backgroundImageValue,
				backgroundPosition: "var(--wfchat-bg-root-position)",
				backgroundSize: "var(--wfchat-bg-render-size)",
				opacity: "var(--app-bg-image-opacity)"
			}
		: undefined;

	return (
		<main
			ref={layoutRef}
			className="relative h-screen overflow-hidden bg-app-bg text-app-text antialiased transition-colors"
			style={layoutStyle}
		>
			{backgroundImageStyle && (
				<div
					className="absolute inset-0 bg-no-repeat"
					style={backgroundImageStyle}
					aria-hidden="true"
				/>
			)}
			<div className="relative flex h-full overflow-hidden">
				{activityBar}
				{sidebar}

				<section className="flex min-w-0 flex-1 flex-col">
					{header}

					<div className="grid min-h-0 flex-1 overflow-hidden grid-cols-1 xl:grid-cols-[minmax(0,1fr)_21rem]">
						<div className="flex min-h-0 flex-col">{children}</div>
						{details}
					</div>
				</section>
			</div>
		</main>
	);
}

function useBackgroundMetrics(backgroundImageUrl?: string): BackgroundMetrics | null {
	const [metrics, setMetrics] = useState<BackgroundMetrics | null>(null);

	useEffect(() => {
		if (!backgroundImageUrl || typeof window === "undefined") {
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
	}, [backgroundImageUrl]);

	return metrics;
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

function useSurfaceBackgroundSync(
	layoutRef: RefObject<HTMLElement | null>,
	backgroundImageUrl: string | undefined,
	backgroundMetrics: BackgroundMetrics | null
) {
	useLayoutEffect(() => {
		const layoutElement = layoutRef.current;

		if (!layoutElement || !backgroundImageUrl || !backgroundMetrics || typeof window === "undefined") {
			return;
		}

		const rootElement = layoutElement;
		const metrics = backgroundMetrics;
		let scheduledUpdateFrameId = 0;
		let transitionFrameId = 0;
		let transitionLoopUntil = 0;

		function updateSurfacePositions() {
			rootElement
				.querySelectorAll<HTMLElement>(
					".app-surface-panel, .app-surface-soft, .mobile-app-surface-panel, .mobile-app-surface-soft"
				)
				.forEach((surfaceElement) => {
					const rect = surfaceElement.getBoundingClientRect();
					surfaceElement.style.setProperty(
						"--wfchat-surface-bg-position",
						`${metrics.originX - rect.left}px ${metrics.originY - rect.top}px`
					);
					surfaceElement.style.setProperty(
						"--wfchat-surface-bg-opacity",
						"var(--app-bg-image-opacity)"
					);
				});
		}

		function scheduleUpdate() {
			if (scheduledUpdateFrameId) {
				return;
			}

			scheduledUpdateFrameId = window.requestAnimationFrame(() => {
				scheduledUpdateFrameId = 0;
				updateSurfacePositions();
			});
		}

		function runTransitionLoop() {
			transitionFrameId = 0;
			updateSurfacePositions();

			if (performance.now() >= transitionLoopUntil) {
				return;
			}

			transitionFrameId = window.requestAnimationFrame(runTransitionLoop);
		}

		function scheduleTransitionLoop(extraDurationMs: number) {
			transitionLoopUntil = Math.max(transitionLoopUntil, performance.now() + extraDurationMs);
			updateSurfacePositions();

			if (transitionFrameId) {
				return;
			}

			transitionFrameId = window.requestAnimationFrame(runTransitionLoop);
		}

		function handleTransitionRun() {
			scheduleTransitionLoop(500);
		}

		function handleTransitionEnd() {
			scheduleTransitionLoop(80);
		}

		updateSurfacePositions();

		const resizeObserver = new ResizeObserver(scheduleUpdate);
		const mutationObserver = new MutationObserver(scheduleUpdate);

		resizeObserver.observe(rootElement);
		mutationObserver.observe(rootElement, {
			attributes: true,
			attributeFilter: ["class"],
			childList: true,
			subtree: true
		});

		window.addEventListener("resize", scheduleUpdate);
		window.addEventListener("scroll", scheduleUpdate, true);
		rootElement.addEventListener("transitionrun", handleTransitionRun, true);
		rootElement.addEventListener("transitionend", handleTransitionEnd, true);

		return () => {
			if (scheduledUpdateFrameId) {
				window.cancelAnimationFrame(scheduledUpdateFrameId);
			}

			if (transitionFrameId) {
				window.cancelAnimationFrame(transitionFrameId);
			}

			resizeObserver.disconnect();
			mutationObserver.disconnect();
			window.removeEventListener("resize", scheduleUpdate);
			window.removeEventListener("scroll", scheduleUpdate, true);
			rootElement.removeEventListener("transitionrun", handleTransitionRun, true);
			rootElement.removeEventListener("transitionend", handleTransitionEnd, true);
		};
	}, [backgroundImageUrl, backgroundMetrics, layoutRef]);
}

export default AppLayout;
