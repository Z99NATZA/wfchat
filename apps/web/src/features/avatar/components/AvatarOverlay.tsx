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
};

const positionClassNames: Record<AvatarOverlayPosition, string> = {
	"bottom-right": "bottom-24 right-4 lg:right-6",
	"bottom-left": "bottom-24 left-4 lg:left-6"
};

const sizeClassNames: Record<AvatarOverlaySize, string> = {
	small: "h-44 w-32",
	medium: "h-56 w-40"
};

function AvatarOverlay({ position, size }: AvatarOverlayProps) {
	const { t } = useI18n();
	const { state } = useAvatarRuntime();

	if (state.rendererKind !== "pngtuber") {
		return null;
	}

	const activeEmotion = resolvePngTuberEmotion(state.expressionId);

	return (
		<div
			className={cn(
				"pointer-events-none absolute z-0 hidden md:block",
				positionClassNames[position],
				sizeClassNames[size]
			)}
			aria-label={t("pngtuber.header.title")}
		>
			<div className="relative h-full overflow-hidden rounded-lg border border-app-border bg-app-panel/92 shadow-soft">
				<div className="absolute inset-x-3 bottom-5 h-20 rounded-full border border-primary/15 bg-primary/8" />
				<div className="absolute inset-2 flex items-end justify-center">
					<PngTuberRenderer
						emotion={activeEmotion}
						motionState={state.motionState}
						alt={t("pngtuber.previewAlt", { expression: t(activeEmotion.labelKey) })}
					/>
				</div>
				<div className="absolute bottom-2 right-2 z-20 flex items-center gap-1.5 rounded-md border border-app-border bg-app-soft/92 px-2 py-1 text-[11px] text-muted">
					<MessageCircle size={12} aria-hidden="true" />
					{t(motionStateShortLabelKey(state.motionState))}
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
