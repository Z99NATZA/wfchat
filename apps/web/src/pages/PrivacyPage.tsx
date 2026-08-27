import { type ReactNode, useEffect } from "react";
import { ArrowLeft, Globe2, ShieldCheck } from "lucide-react";
import { Link } from "react-router-dom";
import { SUPPORTED_LOCALES, useI18n } from "@/i18n/i18nContext";

const CONTACT_EMAIL = "z99natza@gmail.com";

function PrivacyPage() {
	const { locale, setLocale, t } = useI18n();

	useEffect(() => {
		const previousTitle = document.title;
		document.title = t("privacy.documentTitle");
		return () => {
			document.title = previousTitle;
		};
	}, [t]);

	return (
		<div className="h-full overflow-y-auto bg-app-bg text-app-text">
			<header className="sticky top-0 z-10 border-b border-app-border bg-app-panel/95 backdrop-blur-sm">
				<div className="mx-auto flex w-full max-w-4xl items-center justify-between gap-3 px-4 py-3 sm:px-6">
					<Link
						to="/chat"
						className="inline-flex min-h-10 items-center gap-2 rounded-lg border border-app-border bg-app-soft px-3 text-sm font-semibold transition hover:border-control-focus-border focus:outline-none focus-visible:border-control-focus-border"
					>
						<ArrowLeft size={17} aria-hidden="true" />
						{t("privacy.back")}
					</Link>
					<label className="inline-flex min-h-10 items-center gap-2 rounded-lg border border-app-border bg-app-soft px-3 text-sm font-semibold">
						<Globe2 size={17} aria-hidden="true" />
						<span className="sr-only">{t("privacy.language")}</span>
						<select
							value={locale}
							aria-label={t("privacy.language")}
							onChange={(event) =>
								setLocale(
									event.target.value as (typeof SUPPORTED_LOCALES)[number]["code"]
								)
							}
							className="cursor-pointer bg-transparent outline-none"
						>
							{SUPPORTED_LOCALES.map((language) => (
								<option key={language.code} value={language.code}>
									{language.label}
								</option>
							))}
						</select>
					</label>
				</div>
			</header>

			<main className="mx-auto w-full max-w-4xl px-4 py-8 sm:px-6 sm:py-12">
				<div className="flex items-start gap-4">
					<div className="flex size-11 shrink-0 items-center justify-center rounded-xl border border-app-border bg-app-soft">
						<ShieldCheck size={24} aria-hidden="true" />
					</div>
					<div>
						<p className="text-sm font-semibold text-muted">WFChat</p>
						<h1 className="mt-1 text-3xl font-semibold tracking-tight sm:text-4xl">
							{t("privacy.title")}
						</h1>
						<p className="mt-3 text-sm text-muted">{t("privacy.lastUpdated")}</p>
					</div>
				</div>

				<p className="mt-6 max-w-3xl text-base leading-7 text-muted">
					{t("privacy.introduction")}
				</p>

				<div className="mt-8 space-y-5">
					<PolicySection title={t("privacy.google.title")} emphasized>
						<p>{t("privacy.google.optional")}</p>
						<ul>
							<li>{t("privacy.google.received")}</li>
							<li>{t("privacy.google.purpose")}</li>
							<li>{t("privacy.google.notReceived")}</li>
							<li>{t("privacy.google.token")}</li>
						</ul>
					</PolicySection>

					<PolicySection title={t("privacy.data.title")}>
						<ul>
							<li>{t("privacy.data.session")}</li>
							<li>{t("privacy.data.chat")}</li>
							<li>{t("privacy.data.sync")}</li>
							<li>{t("privacy.data.cafe")}</li>
							<li>{t("privacy.data.operations")}</li>
						</ul>
					</PolicySection>

					<PolicySection title={t("privacy.processing.title")}>
						<p>{t("privacy.processing.chat")}</p>
						<p>{t("privacy.processing.images")}</p>
						<p>{t("privacy.processing.voice")}</p>
						<p>{t("privacy.processing.external")}</p>
					</PolicySection>

					<PolicySection title={t("privacy.retention.title")}>
						<ul>
							<li>{t("privacy.retention.account")}</li>
							<li>{t("privacy.retention.guest")}</li>
							<li>{t("privacy.retention.cafe")}</li>
							<li>{t("privacy.retention.voice")}</li>
							<li>{t("privacy.retention.logs")}</li>
						</ul>
					</PolicySection>

					<PolicySection title={t("privacy.deletion.title")}>
						<p>{t("privacy.deletion.immediate")}</p>
						<ul>
							<li>{t("privacy.deletion.server")}</li>
							<li>{t("privacy.deletion.browser")}</li>
							<li>{t("privacy.deletion.files")}</li>
						</ul>
					</PolicySection>

					<PolicySection title={t("privacy.quota.title")}>
						<p>{t("privacy.quota.account")}</p>
						<p>{t("privacy.quota.global")}</p>
					</PolicySection>

					<PolicySection title={t("privacy.controls.title")}>
						<p>{t("privacy.controls.description")}</p>
					</PolicySection>

					<PolicySection title={t("privacy.contact.title")}>
						<p>{t("privacy.contact.description")}</p>
						<a
							href={`mailto:${CONTACT_EMAIL}`}
							className="inline-flex font-semibold text-app-text underline decoration-muted underline-offset-4 hover:decoration-app-text"
						>
							{CONTACT_EMAIL}
						</a>
					</PolicySection>
				</div>
			</main>
		</div>
	);
}

type PolicySectionProps = {
	title: string;
	children: ReactNode;
	emphasized?: boolean;
};

function PolicySection({ title, children, emphasized = false }: PolicySectionProps) {
	return (
		<section
			className={`rounded-2xl border p-5 sm:p-6 ${
				emphasized
					? "border-control-focus-border bg-app-panel"
					: "border-app-border bg-app-panel"
			}`}
		>
			<h2 className="text-xl font-semibold">{title}</h2>
			<div className="mt-3 space-y-3 text-sm leading-6 text-muted [&_ul]:list-disc [&_ul]:space-y-2 [&_ul]:pl-5">
				{children}
			</div>
		</section>
	);
}

export default PrivacyPage;
