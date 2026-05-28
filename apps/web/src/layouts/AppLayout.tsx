import type { ReactNode } from "react";

type AppLayoutProps = {
	sidebar: ReactNode;
	header: ReactNode;
	children: ReactNode;
	details?: ReactNode;
};

function AppLayout({ sidebar, header, children, details }: AppLayoutProps) {
	return (
		<main className="min-h-screen bg-app-bg text-app-text antialiased transition-colors">
			<div className="flex min-h-screen overflow-hidden">
				{sidebar}

				<section className="flex min-w-0 flex-1 flex-col">
					{header}

					<div className="grid min-h-0 flex-1 grid-cols-1 xl:grid-cols-[minmax(0,1fr)_21rem]">
						<div className="flex min-h-0 flex-col">{children}</div>
						{details}
					</div>
				</section>
			</div>
		</main>
	);
}

export default AppLayout;
