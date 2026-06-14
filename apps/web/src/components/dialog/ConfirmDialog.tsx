import Dialog from "@/components/dialog/Dialog";
import { useI18n } from "@/i18n";
import { cn } from "@/utils/classNames";

type ConfirmTone = "default" | "destructive";

type ConfirmDialogProps = {
	isOpen: boolean;
	title: string;
	description?: string;
	confirmLabel?: string;
	cancelLabel?: string;
	tone?: ConfirmTone;
	onCancel: () => void;
	onConfirm: () => void;
};

function ConfirmDialog({
	isOpen,
	title,
	description,
	confirmLabel,
	cancelLabel,
	tone = "default",
	onCancel,
	onConfirm
}: ConfirmDialogProps) {
	const { t } = useI18n();
	const isDestructive = tone === "destructive";

	return (
		<Dialog
			isOpen={isOpen}
			title={title}
			description={description}
			onClose={onCancel}
			actions={
				<>
					<button
						type="button"
						className="rounded-lg border border-dialog-border bg-dialog-soft px-4 py-2 text-sm font-medium text-app-text transition hover:border-primary hover:text-primary dark:hover:border-action-border dark:hover:bg-dialog-panel dark:hover:text-app-text"
						onClick={onCancel}
					>
						{cancelLabel ?? t("common.cancel")}
					</button>
					<button
						type="button"
						className={cn(
							"rounded-lg px-4 py-2 text-sm font-medium transition",
							isDestructive
								? "border border-red-400/25 bg-red-500/10 text-red-500 hover:border-red-400/50 hover:bg-red-500/15 dark:border-red-300/35 dark:bg-red-500/15 dark:text-red-200 dark:hover:border-red-300/60 dark:hover:bg-red-500/25 dark:hover:text-red-100"
								: "bg-primary text-white hover:bg-primary-600 dark:border dark:border-action-border dark:bg-action dark:text-action-text dark:hover:bg-action-hover dark:hover:text-app-text"
						)}
						onClick={onConfirm}
					>
						{confirmLabel ?? t("common.confirm")}
					</button>
				</>
			}
		/>
	);
}

export default ConfirmDialog;
