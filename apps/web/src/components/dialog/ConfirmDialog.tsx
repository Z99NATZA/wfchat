import Dialog from "@/components/dialog/Dialog";
import { useI18n } from "@/i18n";

type ConfirmDialogProps = {
	isOpen: boolean;
	title: string;
	description?: string;
	confirmLabel?: string;
	cancelLabel?: string;
	onCancel: () => void;
	onConfirm: () => void;
};

function ConfirmDialog({
	isOpen,
	title,
	description,
	confirmLabel,
	cancelLabel,
	onCancel,
	onConfirm
}: ConfirmDialogProps) {
	const { t } = useI18n();

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
						className="rounded-lg border border-dialog-border bg-dialog-soft px-4 py-2 text-sm font-medium text-app-text transition hover:border-primary hover:text-primary"
						onClick={onCancel}
					>
						{cancelLabel ?? t("common.cancel")}
					</button>
					<button
						type="button"
						className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-white transition hover:bg-primary-600"
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
