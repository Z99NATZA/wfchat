import { AIKO_PNGTUBER_EMOTIONS } from "@/features/avatar/data/aikoPngTuber";

type IdleSchedulerWindow = Window &
	typeof globalThis & {
		requestIdleCallback?: (callback: () => void, options?: { timeout?: number }) => number;
		cancelIdleCallback?: (handle: number) => void;
	};

const preloadedAssetUrls = new Set<string>();
const retainedPreloadImages = new Map<string, HTMLImageElement>();

export function preloadAikoPngTuberAssets() {
	for (const assetUrl of getAikoPngTuberPreloadAssetUrls()) {
		preloadImageAsset(assetUrl);
	}
}

export function scheduleAikoPngTuberAssetPreload() {
	if (typeof window === "undefined") {
		return () => undefined;
	}

	let isCanceled = false;
	const runPreload = () => {
		if (!isCanceled) {
			preloadAikoPngTuberAssets();
		}
	};
	const idleWindow = window as IdleSchedulerWindow;

	if (typeof idleWindow.requestIdleCallback === "function") {
		const idleCallbackId = idleWindow.requestIdleCallback(runPreload, { timeout: 1500 });

		return () => {
			isCanceled = true;
			idleWindow.cancelIdleCallback?.(idleCallbackId);
		};
	}

	const timeoutId = window.setTimeout(runPreload, 0);

	return () => {
		isCanceled = true;
		window.clearTimeout(timeoutId);
	};
}

function preloadImageAsset(assetUrl: string) {
	if (preloadedAssetUrls.has(assetUrl)) {
		return;
	}

	preloadedAssetUrls.add(assetUrl);

	const image = new Image();
	retainedPreloadImages.set(assetUrl, image);

	image.decoding = "async";
	image.addEventListener("load", () => retainedPreloadImages.delete(assetUrl), { once: true });
	image.addEventListener("error", () => retainedPreloadImages.delete(assetUrl), { once: true });
	image.src = assetUrl;

	if (typeof image.decode === "function") {
		void image.decode().catch(() => undefined);
	}
}

function getAikoPngTuberPreloadAssetUrls() {
	const assetUrls = AIKO_PNGTUBER_EMOTIONS.map((emotion) => emotion.assetUrl);
	const neutralAssetUrl = AIKO_PNGTUBER_EMOTIONS.find(
		(emotion) => emotion.id === "neutral"
	)?.assetUrl;

	if (!neutralAssetUrl) {
		return assetUrls;
	}

	return [neutralAssetUrl, ...assetUrls.filter((assetUrl) => assetUrl !== neutralAssetUrl)];
}
