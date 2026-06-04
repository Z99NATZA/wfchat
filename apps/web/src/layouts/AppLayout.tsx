import type { ReactNode } from "react";

type AppLayoutProps = {
	sidebar: ReactNode;
	header: ReactNode;
	children: ReactNode;
	details?: ReactNode;
	backgroundImageUrl?: string;
};

function AppLayout({ sidebar, header, children, details, backgroundImageUrl }: AppLayoutProps) {
	const backgroundImageStyle = backgroundImageUrl
		? {
				backgroundImage: `url(${JSON.stringify(backgroundImageUrl)})`,
				opacity: 0.1
			}
		: undefined;

	return (
		<main className="relative h-screen overflow-hidden bg-app-bg text-app-text antialiased transition-colors">
			{backgroundImageStyle && (
				<div
					className="absolute inset-0 bg-cover bg-center bg-no-repeat"
					style={backgroundImageStyle}
					aria-hidden="true"
				/>
			)}
			<div className="relative flex h-full overflow-hidden">
				{sidebar}

				<section className="flex min-w-0 flex-1 flex-col">
					{header}

					<div className="grid min-h-0 flex-1 overflow-hidden grid-cols-1 xl:grid-cols-[minmax(0,1fr)_21rem]">
						<div className="flex min-h-0 flex-col">{children}</div>
						{details}
					</div>
				</section>
			</div>
		</main>
	);
}

export default AppLayout;
