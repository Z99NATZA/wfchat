import type { ButtonHTMLAttributes, ReactNode } from "react";
import { cn } from "@/utils/classNames";

type IconButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
	children: ReactNode;
};

function IconButton({ children, className, type = "button", ...props }: IconButtonProps) {
	return (
		<button type={type} className={cn("icon-button", className)} {...props}>
			{children}
		</button>
	);
}

export default IconButton;
