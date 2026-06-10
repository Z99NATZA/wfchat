import type { AikoPngTuberEmotion } from "@/features/avatar/data/aikoPngTuber";
import type { AvatarMotionState } from "@/features/avatar/runtime/avatarRuntimeTypes";
import { cn } from "@/utils/classNames";

type PngTuberRendererProps = {
	alt: string;
	className?: string;
	emotion: AikoPngTuberEmotion;
	motionState: AvatarMotionState;
};

function PngTuberRenderer({ alt, className, emotion, motionState }: PngTuberRendererProps) {
	return (
		<img
			src={emotion.assetUrl}
			alt={alt}
			className={cn(
				"pngtuber-avatar relative z-10 h-full max-h-full w-full object-contain object-bottom",
				motionState === "talking" && "pngtuber-avatar--talking",
				className
			)}
		/>
	);
}

export default PngTuberRenderer;
