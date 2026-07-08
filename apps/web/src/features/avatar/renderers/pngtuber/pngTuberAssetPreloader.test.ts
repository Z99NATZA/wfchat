/**
 * @vitest-environment happy-dom
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { AIKO_PNGTUBER_EMOTIONS } from "@/features/avatar/data/aikoPngTuber";

describe("pngTuberAssetPreloader", () => {
	afterEach(() => {
		vi.restoreAllMocks();
		vi.unstubAllGlobals();
		vi.resetModules();
	});

	function stubImageConstructor(loadedAssetUrls: string[]) {
		class MockImage {
			decoding = "auto";

			addEventListener = vi.fn();
			decode = vi.fn().mockResolvedValue(undefined);

			set src(assetUrl: string) {
				loadedAssetUrls.push(assetUrl);
			}
		}

		vi.stubGlobal("Image", MockImage);
	}

	it("preloads every Aiko PNGTuber asset with neutral first", async () => {
		const loadedAssetUrls: string[] = [];
		stubImageConstructor(loadedAssetUrls);
		const neutralAssetUrl = AIKO_PNGTUBER_EMOTIONS.find(
			(emotion) => emotion.id === "neutral"
		)?.assetUrl;
		expect(neutralAssetUrl).toBeDefined();
		const expectedAssetUrls = [
			neutralAssetUrl as string,
			...AIKO_PNGTUBER_EMOTIONS.map((emotion) => emotion.assetUrl).filter(
				(assetUrl) => assetUrl !== neutralAssetUrl
			)
		];

		const { preloadAikoPngTuberAssets } = await import("./pngTuberAssetPreloader");

		preloadAikoPngTuberAssets();

		expect(loadedAssetUrls).toEqual(expectedAssetUrls);
	});

	it("does not preload the same asset more than once", async () => {
		const loadedAssetUrls: string[] = [];
		stubImageConstructor(loadedAssetUrls);

		const { preloadAikoPngTuberAssets } = await import("./pngTuberAssetPreloader");

		preloadAikoPngTuberAssets();
		preloadAikoPngTuberAssets();

		expect(loadedAssetUrls).toHaveLength(AIKO_PNGTUBER_EMOTIONS.length);
	});
});
