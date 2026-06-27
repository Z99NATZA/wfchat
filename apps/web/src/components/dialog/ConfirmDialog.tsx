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
						className="rounded-lg border border-dialog-border bg-dialog-soft/65 px-4 py-2 text-sm font-medium text-muted transition hover:border-app-border hover:bg-app-soft hover:text-app-text focus:outline-none focus:ring-2 focus:ring-primary/20 dark:border-dialog-border/80 dark:bg-dialog-soft/70 dark:hover:border-action-border/70 dark:hover:bg-dialog-panel dark:hover:text-app-text dark:focus:ring-action-ring/25"
						onClick={onCancel}
					>
						{cancelLabel ?? t("common.cancel")}
					</button>
					<button
						type="button"
						className={cn(
							"rounded-lg border px-4 py-2 text-sm font-medium transition focus:outline-none focus:ring-2",
							isDestructive
								? "border-red-200/80 bg-red-50/75 text-red-600 hover:border-red-300/80 hover:bg-red-100/80 hover:text-red-700 focus:ring-red-500/15 dark:border-red-400/25 dark:bg-red-500/10 dark:text-red-500 dark:hover:border-red-400/50 dark:hover:bg-red-500/15 dark:hover:text-red-500 dark:focus:ring-red-500/15"
								: "border-action-border/75 bg-action text-action-text hover:border-primary hover:bg-action-hover dark:border-action-border dark:bg-action dark:hover:bg-action-hover dark:hover:text-app-text focus:ring-action-ring/25"
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
