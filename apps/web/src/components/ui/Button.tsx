import type { ButtonHTMLAttributes, ReactNode } from "react";
import { cn } from "@/utils/classNames";

type ButtonVariant = "action" | "primary" | "secondary" | "destructive" | "chip" | "floating";
type ButtonSize = "xs" | "sm" | "md" | "lg";
type ButtonSurface = "app" | "dialog";
type ButtonShape = "default" | "pill";

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
	children: ReactNode;
	fullWidth?: boolean;
	shape?: ButtonShape;
	size?: ButtonSize;
	surface?: ButtonSurface;
	variant?: ButtonVariant;
};

function Button({
	children,
	className,
	fullWidth = false,
	shape = "default",
	size = "md",
	surface = "app",
	type = "button",
	variant = "secondary",
	...props
}: ButtonProps) {
	return (
		<button
			type={type}
			className={cn(
				"button",
				`button--${size}`,
				variantClassName(variant, surface),
				shape === "pill" && "button--pill",
				fullWidth && "button--full",
				className
			)}
			{...props}
		>
			{children}
		</button>
	);
}

function variantClassName(variant: ButtonVariant, surface: ButtonSurface): string {
	if (variant === "secondary") {
		return surface === "dialog" ? "button--dialog-secondary" : "button--app-secondary";
	}

	return `button--${variant}`;
}

export default Button;
