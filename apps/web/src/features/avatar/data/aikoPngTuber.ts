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
		labelKey: "pngtuber.emotion.neutral",
		descriptionKey: "pngtuber.emotion.neutralDesc",
		assetUrl: "/images/aiko-pngtuber/aiko-neutral.png"
	},
	{
		id: "happy",
		labelKey: "pngtuber.emotion.happy",
		descriptionKey: "pngtuber.emotion.happyDesc",
		assetUrl: "/images/aiko-pngtuber/aiko-happy.png"
	},
	{
		id: "shy",
		labelKey: "pngtuber.emotion.shy",
		descriptionKey: "pngtuber.emotion.shyDesc",
		assetUrl: "/images/aiko-pngtuber/aiko-shy.png"
	},
	{
		id: "sad",
		labelKey: "pngtuber.emotion.sad",
		descriptionKey: "pngtuber.emotion.sadDesc",
		assetUrl: "/images/aiko-pngtuber/aiko-sad.png"
	},
	{
		id: "surprised",
		labelKey: "pngtuber.emotion.surprised",
		descriptionKey: "pngtuber.emotion.surprisedDesc",
		assetUrl: "/images/aiko-pngtuber/aiko-surprised.png"
	}
];
