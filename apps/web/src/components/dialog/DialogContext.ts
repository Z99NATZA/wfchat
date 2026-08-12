import { createContext, useContext, type ReactNode } from "react";

export type ConfirmOptions = {
	title: string;
	description?: string;
	confirmLabel?: string;
	cancelLabel?: string;
	tone?: "default" | "destructive";
};

export type AlertOptions = {
	title: string;
	description?: string;
	confirmLabel?: string;
};

export type CustomDialogRenderParams<TResult> = {
	close: (result: TResult) => void;
	cancel: () => void;
};

export type DialogVariant = "default" | "lightbox" | "sheet";

export type CustomDialogOptions<TResult = void> = {
	title: string;
	description?: string;
	confirmLabel?: string;
	cancelLabel?: string;
	isDraggable?: boolean;
	showCancelAction?: boolean;
	size?: "default" | "wide";
	variant?: DialogVariant;
	render: (params: CustomDialogRenderParams<TResult>) => ReactNode;
};

export type DialogContextValue = {
	confirm: (options: ConfirmOptions) => Promise<boolean>;
	alert: (options: AlertOptions) => Promise<void>;
	openCustom: <TResult = void>(
		options: CustomDialogOptions<TResult>
	) => Promise<TResult | undefined>;
};

export const DialogContext = createContext<DialogContextValue | null>(null);

export function useDialog() {
	const context = useContext(DialogContext);

	if (!context) {
		throw new Error("useDialog must be used within DialogProvider");
	}

	return context;
}
