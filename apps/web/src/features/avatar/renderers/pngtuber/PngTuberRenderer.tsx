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
		<div
			key={emotion.id}
			className={cn("pngtuber-avatar-expression relative z-10 h-full max-h-full w-full", className)}
		>
			<img
				src={emotion.assetUrl}
				alt={alt}
				decoding="async"
				className={cn(
					"pngtuber-avatar h-full max-h-full w-full object-contain object-bottom",
					motionState === "thinking" && "pngtuber-avatar--thinking",
					motionState === "talking" && "pngtuber-avatar--talking"
				)}
			/>
		</div>
	);
}

export default PngTuberRenderer;
