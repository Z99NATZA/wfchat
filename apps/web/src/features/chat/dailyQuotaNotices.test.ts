import { describe, expect, it } from "vitest";
import en from "@/i18n/locales/en.json";
import th from "@/i18n/locales/th.json";

describe("daily chat quota notices", () => {
	it("keeps owner and global quota wording distinct in both locales", () => {
		expect(th["chat.notice.dailyQuota"]).toBe(
			"วันนี้เราคุยกันครบโควต้าแล้ว กลับมาคุยกันใหม่พรุ่งนี้นะคะ"
		);
		expect(en["chat.notice.dailyQuota"]).toBe(
			"We've reached today's chat limit. Come back and chat again tomorrow."
		);
		expect(th["chat.notice.globalDailyQuota"]).toBe(
			"วันนี้ไอโกะหมดโควต้าแล้ว กลับมาคุยกันใหม่พรุ่งนี้นะคะ"
		);
		expect(en["chat.notice.globalDailyQuota"]).toBe(
			"Aiko has reached her quota for today. Please come back and chat again tomorrow."
		);
	});

	it("keeps the shared-IP cooldown message temporary and non-technical", () => {
		expect(th["chat.notice.requestRate"]).toBe(
			"คุยกันถี่เกินไปนิดนึงนะคะ รอประมาณ 60 วินาทีแล้วส่งมาใหม่ได้เลยค่ะ"
		);
	});
});
