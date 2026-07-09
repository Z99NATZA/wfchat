import { type ReactNode, useCallback, useMemo, useState } from "react";
import ConfirmDialog from "@/components/dialog/ConfirmDialog";
import {
	DialogContext,
	type AlertOptions,
	type CustomDialogOptions,
	type ConfirmOptions
} from "@/components/dialog/DialogContext";
import Dialog from "@/components/dialog/Dialog";
import Button from "@/components/ui/Button";
import { useI18n } from "@/i18n/i18nContext";

type ConfirmState = ConfirmOptions & {
	resolve: (result: boolean) => void;
};

type AlertState = AlertOptions & {
	resolve: () => void;
};

type CustomDialogState<TResult = unknown> = Omit<CustomDialogOptions<TResult>, "render"> & {
	resolve: (result: TResult | undefined) => void;
	render: CustomDialogOptions<TResult>["render"];
};

type DialogProviderProps = {
	children: ReactNode;
};

function DialogProvider({ children }: DialogProviderProps) {
	const { t } = useI18n();
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
				tone={confirmState?.tone}
				onCancel={() => closeConfirm(false)}
				onConfirm={() => closeConfirm(true)}
			/>
			<Dialog
				isOpen={Boolean(alertState)}
				title={alertState?.title ?? ""}
				description={alertState?.description}
				onClose={closeAlert}
				actions={
					<Button surface="dialog" variant="secondary" onClick={closeAlert}>
						{alertState?.confirmLabel ?? t("common.ok")}
					</Button>
				}
			/>
			<Dialog
				isOpen={Boolean(customDialogState)}
				title={customDialogState?.title ?? ""}
				description={customDialogState?.description}
				isDraggable={customDialogState?.isDraggable}
				size={customDialogState?.size}
				onClose={() => closeCustom(undefined)}
				content={
					customDialogState?.render({
						close: (result) => closeCustom(result),
						cancel: () => closeCustom(undefined)
					}) ?? null
				}
				actions={
					<div className="flex items-center gap-2">
						{customDialogState?.showCancelAction === false ? null : (
							<Button
								surface="dialog"
								variant="secondary"
								onClick={() => closeCustom(undefined)}
							>
								{customDialogState?.cancelLabel ?? t("common.cancel")}
							</Button>
						)}
						<Button variant="primary" onClick={() => closeCustom(undefined)}>
							{customDialogState?.confirmLabel ?? t("common.done")}
						</Button>
					</div>
				}
			/>
		</DialogContext.Provider>
	);
}

export default DialogProvider;
