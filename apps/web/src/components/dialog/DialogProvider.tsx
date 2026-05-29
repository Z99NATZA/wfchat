import { createContext, ReactNode, useCallback, useContext, useMemo, useState } from "react";
import ConfirmDialog from "@/components/dialog/ConfirmDialog";
import Dialog from "@/components/dialog/Dialog";

type ConfirmOptions = {
	title: string;
	description?: string;
	confirmLabel?: string;
	cancelLabel?: string;
};

type ConfirmState = ConfirmOptions & {
	resolve: (result: boolean) => void;
};

type AlertOptions = {
	title: string;
	description?: string;
	confirmLabel?: string;
};

type AlertState = AlertOptions & {
	resolve: () => void;
};

type CustomDialogRenderParams<TResult> = {
	close: (result: TResult) => void;
	cancel: () => void;
};

type CustomDialogOptions<TResult = void> = {
	title: string;
	description?: string;
	confirmLabel?: string;
	cancelLabel?: string;
	isDraggable?: boolean;
	render: (params: CustomDialogRenderParams<TResult>) => ReactNode;
};

type CustomDialogState<TResult = unknown> = Omit<CustomDialogOptions<TResult>, "render"> & {
	resolve: (result: TResult | undefined) => void;
	render: (params: CustomDialogRenderParams<TResult>) => ReactNode;
};

type DialogContextValue = {
	confirm: (options: ConfirmOptions) => Promise<boolean>;
	alert: (options: AlertOptions) => Promise<void>;
	openCustom: <TResult = void>(options: CustomDialogOptions<TResult>) => Promise<TResult | undefined>;
};

const DialogContext = createContext<DialogContextValue | null>(null);

type DialogProviderProps = {
	children: ReactNode;
};

function DialogProvider({ children }: DialogProviderProps) {
	const [confirmState, setConfirmState] = useState<ConfirmState | null>(null);
	const [alertState, setAlertState] = useState<AlertState | null>(null);
	const [customDialogState, setCustomDialogState] = useState<CustomDialogState | null>(null);

	const closeConfirm = useCallback((result: boolean) => {
		setConfirmState((currentState) => {
			if (!currentState) {
				return null;
			}

			currentState.resolve(result);
			return null;
		});
	}, []);

	const confirm = useCallback((options: ConfirmOptions) => {
		return new Promise<boolean>((resolve) => {
			setConfirmState({
				...options,
				resolve
			});
		});
	}, []);

	const alert = useCallback((options: AlertOptions) => {
		return new Promise<void>((resolve) => {
			setAlertState({
				...options,
				resolve
			});
		});
	}, []);

	const openCustom = useCallback(
		<TResult,>(options: CustomDialogOptions<TResult>) =>
			new Promise<TResult | undefined>((resolve) => {
				setCustomDialogState({
					...options,
					resolve
				} as CustomDialogState);
			}),
		[]
	);

	const closeAlert = useCallback(() => {
		setAlertState((currentState) => {
			if (!currentState) {
				return null;
			}

			currentState.resolve();
			return null;
		});
	}, []);

	const closeCustom = useCallback((result?: unknown) => {
		setCustomDialogState((currentState) => {
			if (!currentState) {
				return null;
			}

			currentState.resolve(result);
			return null;
		});
	}, []);

	const value = useMemo(
		() => ({
			confirm,
			alert,
			openCustom
		}),
		[alert, confirm, openCustom]
	);

	return (
		<DialogContext.Provider value={value}>
			{children}
			<ConfirmDialog
				isOpen={Boolean(confirmState)}
				title={confirmState?.title ?? ""}
				description={confirmState?.description}
				confirmLabel={confirmState?.confirmLabel}
				cancelLabel={confirmState?.cancelLabel}
				onCancel={() => closeConfirm(false)}
				onConfirm={() => closeConfirm(true)}
			/>
			<Dialog
				isOpen={Boolean(alertState)}
				title={alertState?.title ?? ""}
				description={alertState?.description}
				onClose={closeAlert}
				actions={
					<button
						type="button"
						className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-white transition hover:bg-primary-600"
						onClick={closeAlert}
					>
						{alertState?.confirmLabel ?? "OK"}
					</button>
				}
			/>
			<Dialog
				isOpen={Boolean(customDialogState)}
				title={customDialogState?.title ?? ""}
				description={customDialogState?.description}
				isDraggable={customDialogState?.isDraggable}
				onClose={() => closeCustom(undefined)}
				content={
					customDialogState?.render({
						close: (result) => closeCustom(result),
						cancel: () => closeCustom(undefined)
					}) ?? null
				}
				actions={
					<div className="flex items-center gap-2">
						<button
							type="button"
							className="rounded-lg border border-app-border bg-app-soft px-4 py-2 text-sm font-medium text-app-text transition hover:border-primary hover:text-primary"
							onClick={() => closeCustom(undefined)}
						>
							{customDialogState?.cancelLabel ?? "Cancel"}
						</button>
						<button
							type="button"
							className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-white transition hover:bg-primary-600"
							onClick={() => closeCustom(undefined)}
						>
							{customDialogState?.confirmLabel ?? "Done"}
						</button>
					</div>
				}
			/>
		</DialogContext.Provider>
	);
}

export function useDialog() {
	const context = useContext(DialogContext);

	if (!context) {
		throw new Error("useDialog must be used within DialogProvider");
	}

	return context;
}

export default DialogProvider;
