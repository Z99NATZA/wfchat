import { describe, expect, it } from "vitest";
import { translate } from "@/i18n/i18nContext";

describe("AI name interpolation", () => {
	it("uses the shared name parameter in English and Thai", () => {
		expect(translate("en", "chat.sidebar.subtitle", { name: "Mira" })).toBe("Chat with Mira");
		expect(translate("th", "chat.sidebar.subtitle", { name: "Mira" })).toBe("คุยกับ Mira");
		expect(translate("en", "settings.memory.reset", { name: "Mira" })).toBe(
			"Clear Mira's memory"
		);
		expect(translate("th", "settings.memory.reset", { name: "Mira" })).toBe(
			"ล้างความทรงจำของ Mira"
		);
	});
});
