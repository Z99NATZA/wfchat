export const CAFE_PLAYER_LABEL_Y = -116;
export const CAFE_PLAYER_LABEL_WITH_COSMETIC_Y = -130;

export const CAFE_PLAYER_LABEL_STYLE = {
	fontFamily: "sans-serif",
	fontSize: "14px",
	fontStyle: "bold",
	color: "#ffffff"
} as const;

export function cafePlayerLabelY(cosmeticId: string | null): number {
	return cosmeticId ? CAFE_PLAYER_LABEL_WITH_COSMETIC_Y : CAFE_PLAYER_LABEL_Y;
}
