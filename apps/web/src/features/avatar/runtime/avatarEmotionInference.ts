import type { AikoEmotionId } from "@/features/avatar/data/aikoPngTuber";

export const DEFAULT_CHAT_EXPRESSION_ID: AikoEmotionId = "neutral";
export const ERROR_CHAT_EXPRESSION_ID: AikoEmotionId = "sad";

const emotionKeywordRules: Array<{ expressionId: AikoEmotionId; keywords: string[] }> = [
	{
		expressionId: "sad",
		keywords: [
			"sad",
			"sorry",
			"hurt",
			"lonely",
			"cry",
			"เศร้า",
			"เสียใจ",
			"ขอโทษ",
			"เจ็บ",
			"เหงา",
			"ร้องไห้"
		]
	},
	{
		expressionId: "surprised",
		keywords: [
			"wow",
			"whoa",
			"surprise",
			"unexpected",
			"ตกใจ",
			"ว้าว",
			"จริงเหรอ",
			"ไม่น่าเชื่อ"
		]
	},
	{
		expressionId: "shy",
		keywords: ["blush", "shy", "embarrassed", "เขิน", "อาย", "หน้าแดง"]
	},
	{
		expressionId: "happy",
		keywords: [
			"happy",
			"glad",
			"great",
			"love",
			"nice",
			"ดีใจ",
			"เยี่ยม",
			"รัก",
			"น่ารัก",
			"ขอบคุณ"
		]
	}
];

export function inferExpressionIdFromText(text: string): AikoEmotionId {
	const normalizedText = text.trim().toLocaleLowerCase();
	if (!normalizedText) {
		return DEFAULT_CHAT_EXPRESSION_ID;
	}

	const matchedRule = emotionKeywordRules.find((rule) =>
		rule.keywords.some((keyword) => normalizedText.includes(keyword.toLocaleLowerCase()))
	);

	return matchedRule?.expressionId ?? DEFAULT_CHAT_EXPRESSION_ID;
}
