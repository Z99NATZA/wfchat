import type { ButtonHTMLAttributes, ReactNode } from "react";
import { cn } from "@/utils/classNames";

type IconButtonVariant = "default" | "action" | "danger" | "ghost" | "ghostDanger" | "selected";
type IconButtonSize = "xs" | "sm" | "md" | "lg";

type IconButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
	children: ReactNode;
	fullWidth?: boolean;
	size?: IconButtonSize;
	variant?: IconButtonVariant;
};

function IconButton({
	children,
	className,
	fullWidth = false,
	size = "md",
	type = "button",
	variant = "default",
	...props
}: IconButtonProps) {
	return (
		<button
			type={type}
			className={cn(
				"icon-button",
				`icon-button--${size}`,
				`icon-button--${variant}`,
				fullWidth && "icon-button--full",
				className
			)}
			{...props}
		>
			{children}
		</button>
	);
}

export default IconButton;
