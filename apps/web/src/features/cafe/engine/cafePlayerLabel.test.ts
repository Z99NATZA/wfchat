import { describe, expect, it } from "vitest";
import {
	CAFE_PLAYER_LABEL_STYLE,
	CAFE_PLAYER_LABEL_WITH_COSMETIC_Y,
	CAFE_PLAYER_LABEL_Y,
	cafePlayerLabelY
} from "./cafePlayerLabel";

describe("Cafe player labels", () => {
	it("uses plain white text without decoration or a background panel", () => {
		expect(CAFE_PLAYER_LABEL_STYLE.color).toBe("#ffffff");
		expect("backgroundColor" in CAFE_PLAYER_LABEL_STYLE).toBe(false);
		expect("padding" in CAFE_PLAYER_LABEL_STYLE).toBe(false);
		expect("stroke" in CAFE_PLAYER_LABEL_STYLE).toBe(false);
		expect("strokeThickness" in CAFE_PLAYER_LABEL_STYLE).toBe(false);
		expect("shadow" in CAFE_PLAYER_LABEL_STYLE).toBe(false);
	});

	it("keeps labels above the sprite and leaves more room for cosmetics", () => {
		expect(cafePlayerLabelY(null)).toBe(CAFE_PLAYER_LABEL_Y);
		expect(cafePlayerLabelY("tea_hat")).toBe(CAFE_PLAYER_LABEL_WITH_COSMETIC_Y);
		expect(CAFE_PLAYER_LABEL_WITH_COSMETIC_Y).toBeLessThan(CAFE_PLAYER_LABEL_Y);
	});
});
