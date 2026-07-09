import Dialog from "@/components/dialog/Dialog";
import Button from "@/components/ui/Button";
import { useI18n } from "@/i18n/i18nContext";

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
					<Button surface="dialog" variant="secondary" onClick={onCancel}>
						{cancelLabel ?? t("common.cancel")}
					</Button>
					<Button variant={isDestructive ? "destructive" : "action"} onClick={onConfirm}>
						{confirmLabel ?? t("common.confirm")}
					</Button>
				</>
			}
		/>
	);
}

export default ConfirmDialog;
