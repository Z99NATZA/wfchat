import { hash, type WorldObject } from "./world";
export const PALETTE = {
	grass: ["#234d4b", "#254f50", "#285351"],
	grassLight: "#38625e",
	grassShade: "#1b4143",
	grassTip: "#466f68",
	path: "#5f7474",
	pathLight: "#738686",
	pathShade: "#506767",
	water: "#204c66",
	waterLight: "#2c6179",
	waterShade: "#1d435d",
	forest: "#142f38"
} as const;
// Coordinates define stable variation. Object position never depends on animation time.
export function treeAppearance(o: Pick<WorldObject, "x" | "y">) {
	const scale = 0.65 + hash(o.x + 47, o.y + 19) * 0.7;
	return {
		width: 76 * scale * (0.88 + hash(o.x + 83, o.y) * 0.22),
		height: 94 * scale * (0.9 + hash(o.x, o.y + 67) * 0.24),
		offsetX: Math.round((hash(o.x + 139, o.y + 37) - 0.5) * 18),
		offsetY: Math.round((hash(o.x + 59, o.y + 173) - 0.5) * 18)
	};
}
// A cached rendering material shifts foliage toward deep blue-green without tinting wood or roofs.
export function woodlandMaterial(art: HTMLImageElement) {
	const canvas = document.createElement("canvas");
	canvas.width = art.naturalWidth;
	canvas.height = art.naturalHeight;
	const ctx = canvas.getContext("2d")!;
	ctx.drawImage(art, 0, 0);
	const pixels = ctx.getImageData(0, 0, canvas.width, canvas.height),
		p = pixels.data;
	for (let i = 0; i < p.length; i += 4) {
		const r = p[i],
			g = p[i + 1],
			b = p[i + 2];
		if (!p[i + 3] || g < r * 0.92 || g < b * 1.05) continue;
		const strength = Math.min(1, Math.max(0, (g - b - 7) / 30));
		const mix = (a: number, target: number) => Math.round(a + (target - a) * strength);
		p[i] = mix(r, r * 0.35);
		p[i + 1] = mix(g, g * 0.69);
		p[i + 2] = mix(b, Math.min(210, b * 0.65 + g * 0.45));
	}
	ctx.putImageData(pixels, 0, 0);
	return canvas;
}
