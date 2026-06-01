import { useEffect, useMemo, useRef } from "react";

type GoogleSignInButtonProps = {
	onCredential: (idToken: string) => void;
};

declare global {
	interface Window {
		google?: {
			accounts: {
				id: {
					initialize: (options: {
						client_id: string;
						callback: (response: { credential?: string }) => void;
					}) => void;
					renderButton: (
						element: HTMLElement,
						options: {
							theme?: "outline" | "filled_blue" | "filled_black";
							size?: "large" | "medium" | "small";
							shape?: "rectangular" | "pill" | "circle" | "square";
							text?: "signin_with" | "signup_with" | "continue_with" | "signin";
							width?: number;
						}
					) => void;
				};
			};
		};
	}
}

function GoogleSignInButton({ onCredential }: GoogleSignInButtonProps) {
	const buttonContainerRef = useRef<HTMLDivElement>(null);
	const clientId = useMemo(() => import.meta.env.VITE_GOOGLE_CLIENT_ID as string | undefined, []);

	useEffect(() => {
		if (!clientId || !buttonContainerRef.current) {
			return;
		}

		const script = document.createElement("script");
		script.src = "https://accounts.google.com/gsi/client";
		script.async = true;
		script.defer = true;
		script.onload = () => {
			if (!window.google || !buttonContainerRef.current) {
				return;
			}

			window.google.accounts.id.initialize({
				client_id: clientId,
				callback: (response) => {
					if (response.credential) {
						onCredential(response.credential);
					}
				}
			});
			buttonContainerRef.current.innerHTML = "";
			window.google.accounts.id.renderButton(buttonContainerRef.current, {
				theme: "outline",
				size: "large",
				text: "continue_with",
				width: 320
			});
		};
		document.body.appendChild(script);
		return () => {
			if (script.parentNode) {
				script.parentNode.removeChild(script);
			}
		};
	}, [clientId, onCredential]);

	if (!clientId) {
		return (
			<p className="text-xs text-muted">
				Google login is not configured. Set <code>VITE_GOOGLE_CLIENT_ID</code>.
			</p>
		);
	}

	return <div ref={buttonContainerRef} className="flex justify-center" />;
}

export default GoogleSignInButton;
