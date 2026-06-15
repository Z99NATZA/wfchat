import { MessageCircle } from "lucide-react";
import {
	AIKO_PNGTUBER_EMOTIONS,
	type AikoPngTuberEmotion
} from "@/features/avatar/data/aikoPngTuber";
import PngTuberRenderer from "@/features/avatar/renderers/pngtuber/PngTuberRenderer";
import { useAvatarRuntime } from "@/features/avatar/runtime/avatarRuntimeStore";
import type { AvatarMotionState } from "@/features/avatar/runtime/avatarRuntimeTypes";
import { useI18n } from "@/i18n";
import { cn } from "@/utils/classNames";
import type { AvatarOverlayPosition, AvatarOverlaySize } from "@/stores/avatarOverlayStore";

type AvatarOverlayProps = {
	position: AvatarOverlayPosition;
	size: AvatarOverlaySize;
	bottomOffsetPx?: number;
};

const positionClassNames: Record<AvatarOverlayPosition, string> = {
	"bottom-right": "right-3 md:right-4 lg:right-6",
	"bottom-left": "left-3 md:left-4 lg:left-6"
};

const sizeClassNames: Record<AvatarOverlaySize, string> = {
	small: "h-32 w-24 md:h-44 md:w-32",
	medium: "h-36 w-28 md:h-56 md:w-40"
};

function AvatarOverlay({ position, size, bottomOffsetPx = 104 }: AvatarOverlayProps) {
	const { t } = useI18n();
	const { state } = useAvatarRuntime();

	if (state.rendererKind !== "pngtuber") {
		return null;
	}

	const activeEmotion = resolvePngTuberEmotion(state.expressionId);

	return (
		<div
			className={cn(
				"pointer-events-none absolute z-20 block md:z-0",
				positionClassNames[position],
				sizeClassNames[size]
			)}
			style={{ bottom: `calc(${bottomOffsetPx}px + 0.75rem)` }}
			aria-label={t("pngtuber.header.title")}
		>
			<div className="relative h-full overflow-hidden rounded-lg border border-app-border bg-app-panel/92 shadow-soft">
				<div className="absolute inset-x-3 bottom-5 h-14 rounded-full border border-primary/15 bg-primary/8 md:h-20" />
				<div className="absolute inset-2 flex items-end justify-center">
					<PngTuberRenderer
						emotion={activeEmotion}
						motionState={state.motionState}
						alt={t("pngtuber.previewAlt", { expression: t(activeEmotion.labelKey) })}
					/>
				</div>
				<div className="absolute bottom-1.5 right-1.5 z-20 flex max-w-[calc(100%-0.75rem)] items-center gap-1 rounded-md border border-app-border bg-app-soft/92 px-1.5 py-1 text-[10px] text-muted md:bottom-2 md:right-2 md:gap-1.5 md:px-2 md:text-[11px]">
					<MessageCircle size={12} aria-hidden="true" />
					<span className="truncate">{t(motionStateShortLabelKey(state.motionState))}</span>
				</div>
			</div>
		</div>
	);
}

function resolvePngTuberEmotion(expressionId: string): AikoPngTuberEmotion {
	return (
		AIKO_PNGTUBER_EMOTIONS.find((emotion) => emotion.id === expressionId) ??
		AIKO_PNGTUBER_EMOTIONS[0]
	);
}

function motionStateShortLabelKey(motionState: AvatarMotionState) {
	switch (motionState) {
		case "idle":
			return "pngtuber.stateShort.idle";
		case "thinking":
			return "pngtuber.stateShort.thinking";
		case "talking":
			return "pngtuber.stateShort.talking";
	}
}

export default AvatarOverlay;
