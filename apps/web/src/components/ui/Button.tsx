import type { ButtonHTMLAttributes, ReactNode } from "react";
import { cn } from "@/utils/classNames";

type ButtonVariant =
	| "action"
	| "primary"
	| "secondary"
	| "destructive"
	| "chip"
	| "floating"
	| "ghost"
	| "ghostDestructive"
	| "selected";
type ButtonSize = "xs" | "sm" | "md" | "lg" | "menu" | "row";
type ButtonSurface = "app" | "dialog";
type ButtonShape = "default" | "pill";
type ButtonAlign = "center" | "start" | "between";

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
	align?: ButtonAlign;
	children: ReactNode;
	fullWidth?: boolean;
	shape?: ButtonShape;
	size?: ButtonSize;
	surface?: ButtonSurface;
	variant?: ButtonVariant;
};

function Button({
	align = "center",
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
				`button--align-${align}`,
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

	if (variant === "ghostDestructive") {
		return "button--ghost-destructive";
	}

	return `button--${variant}`;
}

export default Button;
