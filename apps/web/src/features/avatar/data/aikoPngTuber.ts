export type AikoEmotionId = "neutral" | "happy" | "shy" | "sad" | "surprised";

export type AikoPngTuberEmotion = {
	id: AikoEmotionId;
	labelKey: string;
	descriptionKey: string;
	assetUrl: string;
};

export const AIKO_PNGTUBER_EMOTIONS: AikoPngTuberEmotion[] = [
	{
		id: "neutral",
		labelKey: "avatar.emotion.neutral",
		descriptionKey: "avatar.emotion.neutralDesc",
		assetUrl: "/images/aiko-pngtuber/aiko-neutral.png"
	},
	{
		id: "happy",
		labelKey: "avatar.emotion.happy",
		descriptionKey: "avatar.emotion.happyDesc",
		assetUrl: "/images/aiko-pngtuber/aiko-happy.png"
	},
	{
		id: "shy",
		labelKey: "avatar.emotion.shy",
		descriptionKey: "avatar.emotion.shyDesc",
		assetUrl: "/images/aiko-pngtuber/aiko-shy.png"
	},
	{
		id: "sad",
		labelKey: "avatar.emotion.sad",
		descriptionKey: "avatar.emotion.sadDesc",
		assetUrl: "/images/aiko-pngtuber/aiko-sad.png"
	},
	{
		id: "surprised",
		labelKey: "avatar.emotion.surprised",
		descriptionKey: "avatar.emotion.surprisedDesc",
		assetUrl: "/images/aiko-pngtuber/aiko-surprised.png"
	}
];

export const DEFAULT_AIKO_EMOTION_ID: AikoEmotionId = "neutral";
