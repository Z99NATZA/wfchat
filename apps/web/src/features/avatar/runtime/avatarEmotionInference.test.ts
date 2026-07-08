import { describe, expect, it } from "vitest";
import {
	DEFAULT_CHAT_EXPRESSION_ID,
	inferExpressionIdFromText
} from "@/features/avatar/runtime/avatarEmotionInference";

describe("avatar emotion inference", () => {
	it("returns neutral for empty or unmatched text", () => {
		expect(inferExpressionIdFromText("")).toBe(DEFAULT_CHAT_EXPRESSION_ID);
		expect(inferExpressionIdFromText("   ")).toBe(DEFAULT_CHAT_EXPRESSION_ID);
		expect(inferExpressionIdFromText("Here is the next step.")).toBe(
			DEFAULT_CHAT_EXPRESSION_ID
		);
	});

	it("matches English keywords case-insensitively", () => {
		expect(inferExpressionIdFromText("I am HAPPY to help.")).toBe("happy");
		expect(inferExpressionIdFromText("That was unexpected.")).toBe("surprised");
		expect(inferExpressionIdFromText("I feel shy about it.")).toBe("shy");
		expect(inferExpressionIdFromText("Sorry, that hurt.")).toBe("sad");
	});

	it("matches Thai keywords", () => {
		expect(inferExpressionIdFromText("ขอบคุณมากนะ")).toBe("happy");
		expect(inferExpressionIdFromText("ว้าว จริงเหรอ")).toBe("surprised");
		expect(inferExpressionIdFromText("เขินนิดหน่อย")).toBe("shy");
		expect(inferExpressionIdFromText("ขอโทษที่ทำให้เสียใจ")).toBe("sad");
	});

	it("uses conservative priority when multiple emotions match", () => {
		expect(inferExpressionIdFromText("Sorry, but thank you.")).toBe("sad");
	});
});
