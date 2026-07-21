import { createFileRoute, Link } from "@tanstack/react-router";
import { Navbar } from "@/components/landing/Navbar";
import { Footer } from "@/components/landing/Footer";
import { useState, useEffect } from "react";
import { Shield, BookOpen, UserCheck, Calendar } from "lucide-react";

export const Route = createFileRoute("/privacy")({
  head: () => ({
    meta: [
      { title: "Privacy Policy — Pikadecks" },
      { name: "description", content: "How Pikadecks collects, uses, and protects your data. GDPR & CCPA compliant privacy, cookie, and terms summary." },
      { name: "robots", content: "index, follow" },
      { property: "og:title", content: "Privacy Policy — Pikadecks" },
      { property: "og:description", content: "How Pikadecks collects, uses, and protects your data." },
      { property: "og:url", content: "https://pikadecks.app/privacy" },
      { property: "og:type", content: "article" },
    ],
    links: [{ rel: "canonical", href: "https://pikadecks.app/privacy" }],
  }),
  component: PrivacyPage,
});

const sections = [
  {
    title: "1. Information We Collect",
    icon: Shield,
    color: "bg-blue-100 text-blue-600 border-blue-200",
    body: [
      "Account Information: name, email, username, hashed password, profile info.",
      "User Content: uploaded documents, notes, flashcards, audio, images, YouTube links and metadata, AI-generated outputs, study history and learning progress.",
      "Device and Usage Information: IP address, device type, browser, OS, app version, crash logs, analytics, session activity.",
      "AI and MCP Integration Data: API requests/responses, prompts, AI-generated summaries or flashcards, metadata exchanged with connected AI systems.",
      "Payment Information: billing address, subscription status, payment metadata. We do not directly store full card details — payments are handled by third-party providers.",
      "Cookies and similar tracking technologies (see Cookie Policy below).",
    ],
  },
  {
    title: "2. How We Use Your Information",
    icon: BookOpen,
    color: "bg-orange-100 text-orange-600 border-orange-200",
    body: [
      "Provide and maintain the Services; generate AI-powered flashcards, summaries, quizzes, and study materials.",
      "Sync content across devices; improve recommendations and personalization.",
      "Process payments; detect fraud, abuse, or unauthorized access.",
      "Respond to support requests; send service-related communications.",
      "Improve performance and reliability; comply with legal obligations.",
      "We do not sell personal information unless explicitly disclosed.",
    ],
  },
  {
    title: "3. Legal Bases for Processing (GDPR)",
    icon: UserCheck,
    color: "bg-green-100 text-green-600 border-green-200",
    body: [
      "If you are in the EEA, UK, or similar jurisdictions, we rely on: consent, contractual necessity, legal obligation, and legitimate interests.",
      "Example: processing uploaded notes to generate flashcards is necessary to provide the service; analytics relies on legitimate interests; marketing relies on consent.",
    ],
  },
  {
    title: "4. How We Share Information",
    icon: Shield,
    color: "bg-rose-100 text-rose-600 border-rose-200",
    body: [
      "Service Providers: cloud hosting, analytics, AI model providers, authentication, payment processors, customer support tools.",
      "AI Providers and Integrations: data may be shared with external AI or MCP-compatible tools you connect, according to your actions and permissions.",
      "Legal Compliance: to comply with the law, protect users, prevent fraud, or enforce our terms.",
      "Business Transfers: information may be transferred as part of a merger, acquisition, or sale.",
    ],
  },
  {
    title: "5. Data Retention",
    icon: Shield,
    color: "bg-cyan-100 text-cyan-600 border-cyan-200",
    body: [
      "We retain personal information only as long as necessary to provide the Services, comply with legal obligations, resolve disputes, and enforce agreements.",
      "You may request deletion of your account and associated data, subject to legal requirements.",
    ],
  },
  {
    title: "6. User Rights (GDPR)",
    icon: Shield,
    color: "bg-purple-100 text-purple-600 border-purple-200",
    body: [
      "Rights to access, correction, deletion, data portability, restriction, objection, and withdrawal of consent.",
      "Contact: privacy@pikadecks.com. You may also lodge a complaint with your local data protection authority.",
    ],
  },
  {
    title: "7. California Privacy Rights (CCPA/CPRA)",
    icon: Shield,
    color: "bg-yellow-100 text-yellow-600 border-yellow-200",
    body: [
      "Right to know, delete, correct, opt out of sale or sharing, limit use of sensitive personal information, and non-discrimination for exercising privacy rights.",
      "Requests: privacy@pikadecks.com. We verify requests before processing. We do not knowingly sell personal information.",
    ],
  },
  {
    title: "8. International Data Transfers",
    icon: Shield,
    color: "bg-blue-100 text-blue-600 border-blue-200",
    body: [
      "Information may be processed in countries outside your jurisdiction. Where required we use Standard Contractual Clauses (SCCs), data processing agreements, and encryption.",
    ],
  },
  {
    title: "9. Security Measures",
    icon: Shield,
    color: "bg-emerald-100 text-emerald-600 border-emerald-200",
    body: [
      "Encryption in transit (HTTPS/TLS), access controls, authentication systems, secure cloud infrastructure, monitoring and logging.",
      "No method of transmission or storage is completely secure.",
    ],
  },
  {
    title: "10. Children's Privacy",
    icon: Shield,
    color: "bg-rose-100 text-rose-600 border-rose-200",
    body: [
      "Pikadecks is not directed to children under 13. We do not knowingly collect personal information from children without appropriate consent. If you believe a child has provided personal information, contact us immediately.",
    ],
  },
  {
    title: "11. Third-Party Services",
    icon: Shield,
    color: "bg-purple-100 text-purple-600 border-purple-200",
    body: [
      "Pikadecks may integrate with AI providers, YouTube, cloud storage, authentication providers, and analytics services. Those parties have their own privacy policies and practices.",
    ],
  },
  {
    title: "12. Cookie Policy",
    icon: Shield,
    color: "bg-orange-100 text-orange-600 border-orange-200",
    body: [
      "Essential cookies: authentication, security, session management.",
      "Functional cookies: remember settings and preferences.",
      "Analytics cookies: measure traffic and improve performance.",
      "Marketing cookies (if applicable): relevant ads and campaign measurement.",
      "Manage cookies via browser/device settings or the consent banner. Disabling cookies may impact certain features.",
    ],
  },
  {
    title: "13. Automated Decision-Making and AI",
    icon: Shield,
    color: "bg-indigo-100 text-indigo-600 border-indigo-200",
    body: [
      "We use AI to generate flashcards, summarize documents, recommend study material, and personalize learning. AI outputs may not always be accurate and should be reviewed.",
      "We may use automated systems to detect abuse, spam, or fraud.",
    ],
  },
  {
    title: "14. Data Deletion Requests",
    icon: Shield,
    color: "bg-red-100 text-red-600 border-red-200",
    body: [
      "You may request deletion of your account, uploaded documents, notes, AI-generated content, and usage history at privacy@pikadecks.com.",
      "Some information may be retained where legally required.",
    ],
  },
  {
    title: "15. Changes to This Privacy Policy",
    icon: Shield,
    color: "bg-stone-100 text-stone-600 border-stone-200",
    body: [
      "We may update this Privacy Policy periodically. Changes become effective when posted. Continued use of the Services constitutes acceptance of the revised policy.",
    ],
  },
  {
    title: "16. Contact Information",
    icon: Shield,
    color: "bg-amber-100 text-amber-600 border-amber-200",
    body: [
      "Company: Pikadecks",
      "Email: privacy@pikadecks.com",
      "Website: https://pikadecks.app",
    ],
  },
  {
    title: "17. Terms of Service Summary",
    icon: Shield,
    color: "bg-yellow-100 text-yellow-600 border-yellow-200",
    body: [
      "By using Pikadecks you agree to: use the app lawfully; avoid uploading illegal, harmful, copyrighted, or abusive content; not attempt unauthorized access; accept that AI outputs may contain inaccuracies; review generated study material.",
      "We may suspend or terminate accounts violating policies, remove harmful or illegal content, restrict abusive API usage, and modify or discontinue features at any time. Users retain ownership of their uploaded content unless otherwise specified.",
    ],
  },
  {
    title: "18. Data Deletion Page",
    icon: Shield,
    color: "bg-red-100 text-red-600 border-red-200",
    body: [
      "Request deletion via in-app account settings or by email to privacy@pikadecks.com. Processing typically takes 7–30 days. Some data may be retained for fraud prevention, security, legal compliance, or financial reporting.",
    ],
  },
  {
    title: "19. Support",
    icon: Shield,
    color: "bg-blue-100 text-blue-600 border-blue-200",
    body: [
      "Support: support@pikadecks.com. We handle login issues, subscriptions, deletion requests, AI generation issues, MCP integration problems, bug reports, and accessibility concerns. Response time: 24–72 business hours.",
    ],
  },
  {
    title: "20. EU Consent Banner",
    icon: Shield,
    color: "bg-emerald-100 text-emerald-600 border-emerald-200",
    body: [
      "Users in the EEA, UK, and similar regions may see a consent banner for analytics cookies, marketing cookies, personalized recommendations, and optional tracking. You may accept, reject non-essential, customize, or withdraw consent at any time. Essential cookies may still be used.",
    ],
  },
  {
    title: "21. Age Restriction Disclosure",
    icon: Shield,
    color: "bg-rose-100 text-rose-600 border-rose-200",
    body: [
      "Pikadecks is intended for users aged 13 or older. Where local law requires parental consent for minors, users below the required age must obtain permission from a parent or legal guardian.",
    ],
  },
  {
    title: "22. Google Play Store Compliance Notes",
    icon: Shield,
    color: "bg-teal-100 text-teal-600 border-teal-200",
    body: [
      "Pikadecks may use AI-generated content, allow document uploads, process user-generated educational content, and connect to third-party AI systems via MCP integrations.",
      "Pikadecks does not knowingly sell personal data, collect sensitive personal information without consent, use deceptive behavior, or perform hidden background data collection.",
    ],
  },
];

function PrivacyPage() {
  const [isWebView, setIsWebView] = useState(false);

  useEffect(() => {
    if (typeof window !== "undefined") {
      setIsWebView(window.location.search.includes("webview=true"));
    }
  }, []);

  return (
    <main className="min-h-screen bg-[#FBF8F2] text-[#2A241D] pb-16 font-sans">
      {!isWebView && <Navbar />}

      {/* Brand Header */}
      <section className={`px-6 pb-8 ${isWebView ? "pt-8" : "pt-28 md:pt-32"}`}>
        <div className="mx-auto max-w-3xl">
          {!isWebView && (
            <Link
              to="/"
              className="inline-flex items-center gap-1.5 rounded-xl border border-[#111111] bg-white px-3 py-1.5 text-xs font-bold text-[#2A241D] shadow-[2px_2px_0_0_#111] hover:translate-y-[-1px] hover:shadow-[3px_3px_0_0_#111] active:translate-y-[1px] active:shadow-[1px_1px_0_0_#111] transition-all"
            >
              ← Back to home
            </Link>
          )}

          <div className="mt-6 flex flex-wrap items-center gap-3">
            <span className="inline-flex items-center gap-1.5 rounded-full border-2 border-[#111111]/10 bg-white px-3 py-1 text-xs font-bold shadow-[2px_2px_0_0_#111111]/5">
              ⚖️ LEGAL COMPLIANCE
            </span>
            <span className="flex items-center gap-1 text-xs font-bold text-[#867E70]">
              <Calendar className="h-3.5 w-3.5" />
              LAST UPDATED: MAY 21, 2026
            </span>
          </div>

          <h1 className="mt-4 font-display text-3xl font-bold md:text-5xl tracking-tight leading-tight">
            Privacy Policy
          </h1>

          <p className="mt-4 text-sm md:text-base leading-relaxed text-[#867E70] font-medium">
            Welcome to Pikadecks (&ldquo;we,&rdquo; &ldquo;our,&rdquo; or &ldquo;us&rdquo;). This Privacy Policy explains how we collect, use, disclose,
            and safeguard your information when you use our application, website, APIs, and related services
            (the &ldquo;Services&rdquo;). It is designed to help comply with the GDPR, CCPA/CPRA, and other applicable laws.
            If you do not agree with this policy, please do not use the Services.
          </p>
        </div>
      </section>

      {/* Accordion / Cards List */}
      <section className="px-6">
        <div className="mx-auto max-w-3xl space-y-6">
          {sections.map((s, idx) => {
            const Icon = s.icon;
            return (
              <article
                key={idx}
                className="group relative rounded-[2rem] border-2 border-[#111111] bg-white p-6 md:p-8 shadow-[6px_6px_0_0_#111111] hover:translate-y-[-1px] hover:shadow-[8px_8px_0_0_#111111] transition-all"
              >
                <div className="flex items-center gap-4 border-b border-[#111111]/10 pb-4 mb-4">
                  <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border-2 border-[#111111] ${s.color} shadow-[2px_2px_0_0_#111]`}>
                    <Icon className="h-5 w-5" />
                  </div>
                  <h2 className="font-display text-lg md:text-xl font-bold text-[#2A241D]">
                    {s.title}
                  </h2>
                </div>

                <ul className="space-y-3">
                  {s.body.map((p, i) => (
                    <li key={i} className="flex gap-2 text-sm md:text-base leading-relaxed text-[#2A241D]/90 font-medium">
                      <span className="text-[#5B4FE6] mt-1.5 shrink-0 h-1.5 w-1.5 rounded-full bg-[#5B4FE6]" />
                      <span>{p}</span>
                    </li>
                  ))}
                </ul>
              </article>
            );
          })}
        </div>
      </section>

      {!isWebView && <Footer />}
    </main>
  );
}
