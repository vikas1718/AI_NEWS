import { Link } from "@tanstack/react-router";
import {
  ArrowRight,
  BadgeCheck,
  Bot,
  BrainCircuit,
  Building2,
  ChartNoAxesColumnIncreasing,
  CircleCheckBig,
  Cloud,
  DatabaseZap,
  Facebook,
  FileText,
  Gauge,
  Image as ImageIcon,
  Instagram,
  Languages,
  LayoutTemplate,
  Linkedin,
  ListChecks,
  LockKeyhole,
  Menu,
  MessageSquareText,
  MonitorSmartphone,
  Newspaper,
  PanelsTopLeft,
  PenLine,
  Quote,
  ScanText,
  Send,
  ShieldCheck,
  Sparkles,
  Twitter,
  UploadCloud,
  UserCog,
  Users,
  Workflow,
  Youtube,
  type LucideIcon,
} from "lucide-react";
import { useEffect, useState } from "react";

import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import {
  Sheet,
  SheetClose,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { cn } from "@/lib/utils";

type IconCard = {
  icon: LucideIcon;
  title: string;
  body: string;
};

const navLinks = [
  { label: "Home", href: "#top" },
  { label: "Features", href: "#features" },
  { label: "Solutions", href: "#solutions" },
  { label: "How It Works", href: "#how-it-works" },
  { label: "About", href: "#about" },
  { label: "Contact", href: "#contact" },
];

const features: IconCard[] = [
  {
    icon: Sparkles,
    title: "AI News Generation",
    body: "Turn briefs, field notes, or extracted source material into newsroom-ready stories.",
  },
  {
    icon: PenLine,
    title: "AI Article Writing",
    body: "Draft structured articles with tone, length, section, and editorial style controls.",
  },
  {
    icon: ScanText,
    title: "OCR & PDF Extraction",
    body: "Extract clean text from scanned newspapers, PDFs, photos, and legacy archives.",
  },
  {
    icon: ImageIcon,
    title: "AI Image Generation",
    body: "Create contextual visuals and editorial artwork for print, web, and social packages.",
  },
  {
    icon: LayoutTemplate,
    title: "Newspaper Layout Generation",
    body: "Generate professional page layouts with hierarchy, columns, captions, and story balance.",
  },
  {
    icon: BrainCircuit,
    title: "Article Enhancement",
    body: "Improve clarity, structure, facts-to-check, readability, and editorial polish.",
  },
  {
    icon: BadgeCheck,
    title: "Grammar Correction",
    body: "Catch grammar, punctuation, phrasing, and consistency issues before review.",
  },
  {
    icon: MessageSquareText,
    title: "Headline Generation",
    body: "Produce sharper headlines, decks, captions, and SEO-friendly title variants.",
  },
  {
    icon: ListChecks,
    title: "Smart Summarization",
    body: "Create quick summaries, article briefs, edition rundowns, and social snippets.",
  },
  {
    icon: Languages,
    title: "Multi-language Translation",
    body: "Translate articles for regional audiences while preserving editorial intent.",
  },
  {
    icon: Instagram,
    title: "Instagram News Generation",
    body: "Create social-first news cards, captions, hooks, and post-ready summaries.",
  },
  {
    icon: Workflow,
    title: "Publishing Workflow",
    body: "Move stories from draft to review, approval, scheduling, and publication.",
  },
  {
    icon: Bot,
    title: "AI-Assisted Editing",
    body: "Give editors contextual suggestions without removing human judgment.",
  },
  {
    icon: Users,
    title: "Role-Based Collaboration",
    body: "Coordinate owners, chief editors, editors, journalists, and viewers securely.",
  },
  {
    icon: Building2,
    title: "Organization Management",
    body: "Manage teams, access requests, workspaces, approvals, and publication ownership.",
  },
  {
    icon: Cloud,
    title: "Cloud-Based Newsroom",
    body: "Access the newsroom securely from any desk, bureau, or remote editorial team.",
  },
];

const workflowSteps = [
  {
    icon: UploadCloud,
    title: "Upload source material",
    body: "Bring in an image, PDF, scanned newspaper, text document, or raw editorial brief.",
  },
  {
    icon: ScanText,
    title: "Extract and enhance",
    body: "AI reads the source, cleans OCR output, improves language, and prepares the story.",
  },
  {
    icon: Sparkles,
    title: "Generate complete packages",
    body: "Create articles, headlines, summaries, visuals, page layouts, and social posts.",
  },
  {
    icon: Send,
    title: "Review and publish",
    body: "Editors approve changes, collaborate by role, and publish through the newsroom workflow.",
  },
];

const benefits: IconCard[] = [
  {
    icon: Gauge,
    title: "Faster publishing cycles",
    body: "Automate repetitive newsroom work so teams can move from source to publication faster.",
  },
  {
    icon: LayoutTemplate,
    title: "Professional newspaper layouts",
    body: "Generate edition-ready visual structure while preserving editorial control.",
  },
  {
    icon: LockKeyhole,
    title: "Enterprise-grade security",
    body: "Keep organization data, user access, and editorial review paths controlled.",
  },
  {
    icon: Languages,
    title: "Multilingual reach",
    body: "Support regional language publishing and cross-market story distribution.",
  },
  {
    icon: ImageIcon,
    title: "AI-generated visuals",
    body: "Create story visuals and social graphics without slowing the desk down.",
  },
  {
    icon: DatabaseZap,
    title: "Intelligent OCR",
    body: "Convert archives, scans, and image-heavy material into editable newsroom content.",
  },
  {
    icon: PanelsTopLeft,
    title: "Scalable architecture",
    body: "Support multiple desks, editions, roles, and workflows as the organization grows.",
  },
  {
    icon: MonitorSmartphone,
    title: "Cloud accessibility",
    body: "Work across print, digital, and social operations from one accessible platform.",
  },
];

const solutions: IconCard[] = [
  {
    icon: Building2,
    title: "Newspaper Organizations",
    body: "Unify article creation, OCR, manual layout editing, approvals, and publication planning.",
  },
  {
    icon: Newspaper,
    title: "Publishers",
    body: "Reduce production delays, standardize output quality, and expand digital publishing capacity.",
  },
  {
    icon: ShieldCheck,
    title: "Chief Editors",
    body: "Review AI-assisted drafts, control final approvals, and keep editorial standards consistent.",
  },
  {
    icon: Workflow,
    title: "Managing Editors",
    body: "Coordinate assignments, track article status, and move editions through a cleaner workflow.",
  },
  {
    icon: PenLine,
    title: "Editors",
    body: "Improve drafts, correct grammar, generate headlines, and prepare articles for approval.",
  },
  {
    icon: FileText,
    title: "Journalists",
    body: "Turn field notes, documents, interviews, and source material into polished story drafts.",
  },
  {
    icon: Instagram,
    title: "Digital Media Teams",
    body: "Create social news posts, summaries, captions, and visuals from approved stories.",
  },
  {
    icon: Sparkles,
    title: "Content Creators",
    body: "Produce professional news-style content faster with AI guidance and editorial structure.",
  },
];

const stats = [
  { label: "Articles Generated", value: 128000, suffix: "+", icon: FileText },
  { label: "AI Images Created", value: 42000, suffix: "+", icon: ImageIcon },
  { label: "Organizations Using the Platform", value: 320, suffix: "+", icon: Building2 },
  { label: "Supported Languages", value: 24, suffix: "+", icon: Languages },
  { label: "Publishing Accuracy", value: 99.2, suffix: "%", icon: CircleCheckBig, decimals: 1 },
];

const roles = [
  {
    title: "Owner",
    body: "Controls the organization, billing ownership, access requests, and user lifecycle.",
  },
  {
    title: "Chief Editor",
    body: "Approves stories, validates edition quality, and governs editorial standards.",
  },
  {
    title: "Managing Editor",
    body: "Coordinates desks, assignments, deadlines, and publication readiness.",
  },
  {
    title: "Editor",
    body: "Edits articles, improves language, manages corrections, and prepares packages.",
  },
  {
    title: "Journalist",
    body: "Creates drafts from reporting material, uploads documents, and collaborates on stories.",
  },
  {
    title: "Viewer",
    body: "Reviews approved content and follows newsroom activity with limited permissions.",
  },
];

const testimonials = [
  {
    quote:
      "AI News Studio removed hours of repetitive copy cleanup from our daily desk. Our editors spend more time improving stories and less time formatting them.",
    name: "Ananya Rao",
    role: "Chief Editor, Metro Daily",
  },
  {
    quote:
      "The OCR and layout tools helped our team revive scanned archives and produce edition previews with remarkable speed.",
    name: "Vikram Sethi",
    role: "Publisher, Regional Press Network",
  },
  {
    quote:
      "Our digital team now turns approved articles into social posts, summaries, and multilingual versions from the same workspace.",
    name: "Meera Shah",
    role: "Digital Desk Lead, City Chronicle",
  },
];

const faqs = [
  {
    question: "Can AI News Studio generate complete news articles?",
    answer:
      "Yes. Teams can use AI News Studio to draft professional articles from text, uploaded source material, OCR output, or editorial briefs, then route the work through human review and approval.",
  },
  {
    question: "Does the platform support OCR for scanned newspapers and PDFs?",
    answer:
      "Yes. AI News Studio is designed to extract editable content from scanned newspapers, PDFs, image files, and document uploads so older or image-based material can become usable newsroom text.",
  },
  {
    question: "Which file formats can teams upload?",
    answer:
      "The workflow is built around common newsroom inputs such as images, PDFs, scanned pages, and text documents. The extracted text can then be enhanced, summarized, translated, and prepared for publishing.",
  },
  {
    question: "Is AI-generated content automatically published?",
    answer:
      "No. AI News Studio keeps editors in control. Generated content can be reviewed, corrected, approved, and published through the organization's editorial workflow.",
  },
  {
    question: "How does organization management work?",
    answer:
      "Each newspaper or media company can operate inside its own secure workspace. Owners manage users, assign roles, approve access requests, and control collaboration across editorial teams.",
  },
  {
    question: "Is the platform built for secure publishing workflows?",
    answer:
      "Yes. Role-based permissions, approval steps, organization workspaces, and controlled access help media teams protect editorial operations while collaborating in the cloud.",
  },
];

const footerGroups = [
  {
    title: "Product",
    links: [
      { label: "Home", href: "#top" },
      { label: "Features", href: "#features" },
      { label: "Solutions", href: "#solutions" },
      { label: "Documentation", href: "#faq" },
    ],
  },
  {
    title: "Company",
    links: [
      { label: "About", href: "#about" },
      { label: "Contact", href: "#contact" },
      { label: "Privacy Policy", href: "/privacy-policy" },
      { label: "Terms of Service", href: "/terms-of-service" },
    ],
  },
];

const capabilityPills = [
  "AI article writing",
  "OCR extraction",
  "PDF processing",
  "AI-assisted editing",
  "AI image generation",
  "Automatic layouts",
  "Headline generation",
  "Smart summaries",
  "Translation",
  "Instagram news posts",
  "Publishing workflows",
  "Secure collaboration",
];

export function AiNewsStudioLanding() {
  return (
    <div
      id="top"
      className="landing-page-bg min-h-screen overflow-hidden bg-background text-foreground"
    >
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-[80] focus:rounded-md focus:bg-background focus:px-4 focus:py-2 focus:text-sm focus:font-semibold focus:shadow-lg"
      >
        Skip to content
      </a>
      <LandingNav />
      <main id="main">
        <HeroSection />
        <AboutSection />
        <FeaturesSection />
        <HowItWorksSection />
        <WhyChooseSection />
        <SolutionsSection />
        <StatsSection />
        <WorkspaceSection />
        <TestimonialsSection />
        <FaqSection />
        <CtaSection />
      </main>
      <LandingFooter />
    </div>
  );
}

function LandingNav() {
  return (
    <header className="fixed inset-x-0 top-0 z-50 border-b border-white/60 bg-white/80 backdrop-blur-xl">
      <nav
        aria-label="Primary navigation"
        className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8"
      >
        <Logo />

        <div className="hidden items-center gap-1 lg:flex">
          {navLinks.map((link) => (
            <a
              key={link.href}
              href={link.href}
              className="rounded-md px-3 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-950/5 hover:text-slate-950 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
            >
              {link.label}
            </a>
          ))}
        </div>

        <div className="hidden items-center gap-3 lg:flex">
          <Button asChild variant="ghost" className="text-slate-800">
            <Link to="/auth">Sign In</Link>
          </Button>
          <Button
            asChild
            className="bg-slate-950 text-white shadow-lg shadow-slate-950/15 hover:bg-slate-800"
          >
            <Link to="/auth" search={{ mode: "signup" }}>
              Get Started
              <ArrowRight aria-hidden="true" />
            </Link>
          </Button>
        </div>

        <div className="lg:hidden">
          <Sheet>
            <SheetTrigger asChild>
              <Button
                variant="outline"
                size="icon"
                aria-label="Open navigation menu"
                className="bg-white/80"
              >
                <Menu aria-hidden="true" />
              </Button>
            </SheetTrigger>
            <SheetContent className="w-[88vw] max-w-sm border-slate-200 bg-white">
              <SheetHeader className="text-left">
                <SheetTitle>
                  <Logo compact />
                </SheetTitle>
                <SheetDescription className="sr-only">
                  Primary navigation for AI News Studio.
                </SheetDescription>
              </SheetHeader>
              <div className="mt-8 grid gap-2">
                {navLinks.map((link) => (
                  <SheetClose asChild key={link.href}>
                    <a
                      href={link.href}
                      className="rounded-md px-3 py-3 text-sm font-semibold text-slate-800 transition hover:bg-slate-100"
                    >
                      {link.label}
                    </a>
                  </SheetClose>
                ))}
              </div>
              <Separator className="my-6" />
              <div className="grid gap-3">
                <Button asChild variant="outline">
                  <Link to="/auth">Sign In</Link>
                </Button>
                <Button asChild className="bg-slate-950 text-white hover:bg-slate-800">
                  <Link to="/auth" search={{ mode: "signup" }}>
                    Get Started
                    <ArrowRight aria-hidden="true" />
                  </Link>
                </Button>
              </div>
            </SheetContent>
          </Sheet>
        </div>
      </nav>
    </header>
  );
}

function Logo({ compact = false }: { compact?: boolean }) {
  return (
    <a
      href="#top"
      className="flex items-center gap-3 rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
    >
      <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-slate-950 text-white shadow-lg shadow-slate-950/20">
        <Newspaper aria-hidden="true" className="h-5 w-5" />
      </span>
      <span className={cn("font-bold text-slate-950", compact ? "text-base" : "text-lg")}>
        AI News Studio
      </span>
    </a>
  );
}

function HeroSection() {
  return (
    <section className="relative pt-28 sm:pt-32 lg:pt-36" aria-labelledby="hero-title">
      <div className="mx-auto grid max-w-7xl items-center gap-12 px-4 pb-20 sm:px-6 lg:grid-cols-[1fr_0.92fr] lg:px-8 lg:pb-28">
        <div className="landing-reveal max-w-3xl">
          <div className="inline-flex items-center gap-2 rounded-full border border-red-900/10 bg-white/75 px-3 py-1.5 text-sm font-semibold text-slate-800 shadow-sm backdrop-blur">
            <Sparkles aria-hidden="true" className="h-4 w-4 text-primary" />
            AI-powered newsroom platform for modern media teams
          </div>
          <h1
            id="hero-title"
            className="mt-7 text-5xl font-semibold leading-[1.02] text-slate-950 sm:text-6xl lg:text-7xl"
          >
            The Future of AI-Powered Newsrooms Starts Here
          </h1>
          <p className="mt-6 max-w-2xl text-lg leading-8 text-slate-600 sm:text-xl">
            AI News Studio is a complete AI-powered newsroom platform designed to help newspapers,
            publishers, and media organizations automate content creation, editing, publishing, and
            digital media workflows using Artificial Intelligence.
          </p>
          <div className="mt-9 flex flex-col gap-3 sm:flex-row">
            <Button
              asChild
              size="lg"
              className="h-12 bg-slate-950 px-6 text-white shadow-xl shadow-slate-950/20 hover:bg-slate-800"
            >
              <Link to="/auth" search={{ mode: "signup" }}>
                Get Started
                <ArrowRight aria-hidden="true" />
              </Link>
            </Button>
            <Button
              asChild
              size="lg"
              variant="outline"
              className="h-12 border-slate-300 bg-white/75 px-6 text-slate-900 backdrop-blur hover:bg-white"
            >
              <a href="#about">Learn More</a>
            </Button>
          </div>
          <div className="mt-9 grid max-w-2xl grid-cols-3 gap-3 text-sm text-slate-700">
            {["AI articles", "OCR extraction", "Secure workflows"].map((item) => (
              <div
                key={item}
                className="flex items-center gap-2 rounded-lg border border-white/70 bg-white/70 p-3 shadow-sm backdrop-blur"
              >
                <CircleCheckBig aria-hidden="true" className="h-4 w-4 text-emerald-600" />
                <span className="font-medium">{item}</span>
              </div>
            ))}
          </div>
        </div>
        <DashboardPreview />
      </div>
    </section>
  );
}

function DashboardPreview() {
  return (
    <div
      className="landing-reveal landing-reveal-delay-1 relative"
      aria-label="AI newsroom dashboard preview"
    >
      <div className="absolute -left-6 top-8 hidden rounded-lg border border-white/70 bg-white/80 p-3 shadow-2xl shadow-slate-950/10 backdrop-blur-xl md:block">
        <div className="flex items-center gap-2 text-xs font-semibold text-slate-700">
          <ScanText aria-hidden="true" className="h-4 w-4 text-cyan-700" />
          OCR confidence
        </div>
        <div className="mt-2 h-2 w-36 overflow-hidden rounded-full bg-slate-200">
          <div className="h-full w-[92%] rounded-full bg-cyan-600" />
        </div>
        <div className="mt-1 text-xs text-slate-500">92% extracted cleanly</div>
      </div>

      <div className="absolute -right-2 bottom-8 hidden rounded-lg border border-white/70 bg-white/85 p-4 shadow-2xl shadow-slate-950/10 backdrop-blur-xl sm:block">
        <div className="flex items-center gap-2 text-xs font-semibold text-slate-700">
          <Instagram aria-hidden="true" className="h-4 w-4 text-rose-600" />
          Social package ready
        </div>
        <div className="mt-3 grid grid-cols-3 gap-1.5">
          <div className="h-12 w-12 rounded-md bg-gradient-to-br from-rose-500 to-amber-400" />
          <div className="h-12 w-12 rounded-md bg-gradient-to-br from-cyan-500 to-emerald-400" />
          <div className="h-12 w-12 rounded-md bg-gradient-to-br from-slate-800 to-red-700" />
        </div>
      </div>

      <div className="relative overflow-hidden rounded-lg border border-white/70 bg-white/75 p-3 shadow-2xl shadow-slate-950/15 backdrop-blur-2xl">
        <div className="overflow-hidden rounded-md border border-slate-200 bg-slate-950">
          <div className="flex items-center justify-between border-b border-white/10 bg-white/[0.06] px-4 py-3">
            <div className="flex items-center gap-2">
              <span className="h-2.5 w-2.5 rounded-full bg-red-400" />
              <span className="h-2.5 w-2.5 rounded-full bg-amber-300" />
              <span className="h-2.5 w-2.5 rounded-full bg-emerald-400" />
            </div>
            <div className="text-xs font-medium text-slate-300">Newsroom Command</div>
          </div>

          <div className="grid gap-0 lg:grid-cols-[0.92fr_1.08fr]">
            <div className="border-b border-white/10 p-5 lg:border-b-0 lg:border-r">
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-xs font-semibold uppercase text-cyan-200">AI Pipeline</div>
                  <h2 className="mt-1 text-lg font-semibold text-white">Morning Edition</h2>
                </div>
                <div className="rounded-full bg-emerald-400/12 px-3 py-1 text-xs font-semibold text-emerald-200">
                  Live
                </div>
              </div>

              <div className="mt-5 space-y-3">
                {[
                  {
                    icon: FileText,
                    label: "Article draft",
                    value: "842 words",
                    color: "text-amber-200",
                  },
                  {
                    icon: MessageSquareText,
                    label: "Headline set",
                    value: "6 options",
                    color: "text-cyan-200",
                  },
                  {
                    icon: ImageIcon,
                    label: "Visual prompt",
                    value: "Approved",
                    color: "text-rose-200",
                  },
                  {
                    icon: Languages,
                    label: "Translation",
                    value: "Ready",
                    color: "text-emerald-200",
                  },
                ].map(({ icon: Icon, label, value, color }) => (
                  <div
                    key={label}
                    className="rounded-lg border border-white/10 bg-white/[0.06] p-3"
                  >
                    <div className="flex items-center justify-between gap-3">
                      <div className="flex items-center gap-3">
                        <Icon aria-hidden="true" className={cn("h-4 w-4", color)} />
                        <span className="text-sm font-medium text-white">{label}</span>
                      </div>
                      <span className="text-xs text-slate-300">{value}</span>
                    </div>
                  </div>
                ))}
              </div>

              <div className="relative mt-5 rounded-lg border border-cyan-300/20 bg-cyan-300/10 p-4">
                <div className="landing-scan absolute inset-x-4 top-0 h-px bg-cyan-200/80" />
                <div className="flex items-start gap-3">
                  <Sparkles aria-hidden="true" className="mt-0.5 h-5 w-5 text-cyan-200" />
                  <div>
                    <div className="text-sm font-semibold text-white">Suggested improvement</div>
                    <p className="mt-1 text-xs leading-5 text-slate-300">
                      Strengthen the lead, add a local context paragraph, and shorten the second
                      headline.
                    </p>
                  </div>
                </div>
              </div>
            </div>

            <div className="bg-[#f7f1e8] p-5 text-slate-900">
              <div className="flex items-center justify-between border-b border-slate-300 pb-3">
                <div>
                  <div className="text-xs font-bold uppercase text-red-800">Front Page Preview</div>
                  <div className="mt-1 text-2xl font-black leading-none">CITY EDITION</div>
                </div>
                <div className="text-right text-xs font-semibold text-slate-500">
                  AI layout
                  <br />4 columns
                </div>
              </div>
              <div className="mt-4 grid grid-cols-[1.1fr_0.9fr] gap-4">
                <article>
                  <div className="h-28 rounded-md bg-gradient-to-br from-slate-800 via-red-900 to-amber-500" />
                  <h3 className="mt-3 text-xl font-black leading-tight">
                    Editorial teams accelerate digital-first publishing
                  </h3>
                  <div className="mt-3 space-y-2">
                    <div className="h-2 rounded bg-slate-800/80" />
                    <div className="h-2 rounded bg-slate-700/60" />
                    <div className="h-2 w-3/4 rounded bg-slate-700/60" />
                  </div>
                </article>
                <div className="space-y-3">
                  {[1, 2, 3].map((item) => (
                    <div key={item} className="border-b border-slate-300 pb-3">
                      <div className="h-3 w-3/4 rounded bg-slate-900" />
                      <div className="mt-2 space-y-1.5">
                        <div className="h-1.5 rounded bg-slate-600/60" />
                        <div className="h-1.5 w-5/6 rounded bg-slate-600/50" />
                      </div>
                    </div>
                  ))}
                </div>
              </div>
              <div className="mt-4 grid grid-cols-4 gap-2">
                {[1, 2, 3, 4].map((item) => (
                  <div key={item} className="h-16 rounded-md bg-white/60 p-2">
                    <div className="h-2 rounded bg-slate-800/70" />
                    <div className="mt-2 h-1.5 rounded bg-slate-500/50" />
                    <div className="mt-1 h-1.5 w-2/3 rounded bg-slate-500/40" />
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function AboutSection() {
  return (
    <section id="about" className="bg-white/70 py-20 sm:py-24" aria-labelledby="about-title">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <SectionIntro
          eyebrow="What is AI News Studio?"
          title="An all-in-one AI operating system for professional newsrooms."
          body="AI News Studio helps media organizations create, improve, organize, and publish news content from one secure workspace."
        />
        <div className="mt-12 grid gap-8 lg:grid-cols-[0.9fr_1.1fr]">
          <div className="landing-reveal rounded-lg border border-slate-200 bg-white p-8 shadow-sm">
            <p className="text-lg leading-8 text-slate-700">
              AI News Studio enables organizations to create professional news articles using AI,
              generate newspaper layouts automatically, extract content from scanned newspapers,
              PDFs, and images using OCR, improve article quality with AI-assisted editing, generate
              AI images, translate articles into multiple languages, create Instagram and social
              media news posts, generate headlines and summaries, manage publishing workflows, and
              collaborate securely across editorial teams.
            </p>
          </div>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {capabilityPills.map((item, index) => (
              <div
                key={item}
                className="landing-reveal rounded-lg border border-slate-200 bg-white/80 p-4 text-sm font-semibold text-slate-800 shadow-sm"
                style={{ animationDelay: `${index * 35}ms` }}
              >
                <CircleCheckBig aria-hidden="true" className="mb-3 h-4 w-4 text-emerald-600" />
                {item}
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}

function FeaturesSection() {
  return (
    <section id="features" className="py-20 sm:py-24" aria-labelledby="features-title">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <SectionIntro
          eyebrow="Features"
          title="Everything a modern newsroom needs to move faster with AI."
          body="Premium AI tools for print teams, digital publishers, editors, journalists, and social desks."
        />
        <div className="mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {features.map((feature, index) => (
            <FeatureCard key={feature.title} feature={feature} delay={index * 25} />
          ))}
        </div>
      </div>
    </section>
  );
}

function FeatureCard({ feature, delay = 0 }: { feature: IconCard; delay?: number }) {
  const Icon = feature.icon;
  return (
    <Card
      className="landing-reveal group h-full rounded-lg border-slate-200/80 bg-white/80 p-5 shadow-sm transition duration-300 hover:-translate-y-1 hover:border-red-900/20 hover:shadow-xl hover:shadow-slate-950/10"
      style={{ animationDelay: `${delay}ms` }}
    >
      <div className="flex h-11 w-11 items-center justify-center rounded-lg bg-slate-950 text-white transition group-hover:bg-primary">
        <Icon aria-hidden="true" className="h-5 w-5" />
      </div>
      <h3 className="mt-5 text-base font-semibold text-slate-950">{feature.title}</h3>
      <p className="mt-3 text-sm leading-6 text-slate-600">{feature.body}</p>
    </Card>
  );
}

function HowItWorksSection() {
  return (
    <section
      id="how-it-works"
      className="bg-slate-950 py-20 text-white sm:py-24"
      aria-labelledby="how-title"
    >
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <SectionIntro
          eyebrow="How It Works"
          title="From source material to publish-ready newsroom packages."
          body="A clear editorial workflow keeps AI assistance fast, accountable, and easy for teams to adopt."
          inverted
        />
        <div className="relative mt-14 grid gap-4 lg:grid-cols-4">
          <div className="absolute left-0 right-0 top-10 hidden h-px bg-gradient-to-r from-red-400/0 via-cyan-300/50 to-amber-300/0 lg:block" />
          {workflowSteps.map((step, index) => {
            const Icon = step.icon;
            return (
              <div
                key={step.title}
                className="landing-reveal relative rounded-lg border border-white/10 bg-white/[0.06] p-6 shadow-lg shadow-black/20 backdrop-blur"
                style={{ animationDelay: `${index * 90}ms` }}
              >
                <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-white text-slate-950">
                  <Icon aria-hidden="true" className="h-5 w-5" />
                </div>
                <div className="mt-6 text-sm font-bold text-cyan-200">Step {index + 1}</div>
                <h3 className="mt-2 text-xl font-semibold">{step.title}</h3>
                <p className="mt-3 text-sm leading-6 text-slate-300">{step.body}</p>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}

function WhyChooseSection() {
  return (
    <section className="py-20 sm:py-24" aria-labelledby="why-title">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <SectionIntro
          eyebrow="Why Choose AI News Studio?"
          title="Built for the pressure, precision, and pace of newsroom operations."
          body="AI News Studio combines newsroom automation with professional editorial controls, secure collaboration, and scalable cloud delivery."
        />
        <div className="mt-12 grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          {benefits.map((benefit, index) => (
            <FeatureCard key={benefit.title} feature={benefit} delay={index * 35} />
          ))}
        </div>
      </div>
    </section>
  );
}

function SolutionsSection() {
  return (
    <section
      id="solutions"
      className="bg-white/75 py-20 sm:py-24"
      aria-labelledby="solutions-title"
    >
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <SectionIntro
          eyebrow="Solutions"
          title="Purpose-built workflows for every newsroom role."
          body="From ownership to reporting, AI News Studio helps each contributor do better work with less operational drag."
        />
        <div className="mt-12 grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          {solutions.map((solution, index) => (
            <FeatureCard key={solution.title} feature={solution} delay={index * 35} />
          ))}
        </div>
      </div>
    </section>
  );
}

function StatsSection() {
  return (
    <section className="py-20 sm:py-24" aria-labelledby="stats-title">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="overflow-hidden rounded-lg border border-slate-200 bg-white shadow-xl shadow-slate-950/10">
          <div className="grid gap-0 lg:grid-cols-[0.82fr_1.18fr]">
            <div className="bg-gradient-to-br from-slate-950 via-red-950 to-cyan-950 p-8 text-white sm:p-10">
              <div className="inline-flex items-center gap-2 rounded-full bg-white/10 px-3 py-1.5 text-sm font-semibold text-cyan-100">
                <ChartNoAxesColumnIncreasing aria-hidden="true" className="h-4 w-4" />
                Example platform metrics
              </div>
              <h2 id="stats-title" className="mt-6 text-3xl font-semibold sm:text-4xl">
                Built to scale across editions, desks, and channels.
              </h2>
              <p className="mt-4 text-sm leading-6 text-slate-300">
                Use AI automation to support high-volume article production, visual creation,
                multilingual publishing, and controlled editorial accuracy.
              </p>
            </div>
            <div className="grid gap-0 sm:grid-cols-2 lg:grid-cols-5">
              {stats.map((stat) => {
                const Icon = stat.icon;
                return (
                  <div
                    key={stat.label}
                    className="border-b border-r border-slate-200 p-6 last:border-r-0 sm:last:border-r lg:border-b-0"
                  >
                    <Icon aria-hidden="true" className="h-5 w-5 text-primary" />
                    <div className="mt-6 text-3xl font-semibold text-slate-950">
                      <AnimatedCounter
                        value={stat.value}
                        suffix={stat.suffix}
                        decimals={stat.decimals}
                      />
                    </div>
                    <div className="mt-2 text-sm font-medium leading-5 text-slate-600">
                      {stat.label}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

function AnimatedCounter({
  value,
  suffix,
  decimals = 0,
}: {
  value: number;
  suffix: string;
  decimals?: number;
}) {
  const [current, setCurrent] = useState(0);

  useEffect(() => {
    const duration = 1500;
    const start = performance.now();
    let frame = 0;

    const tick = (time: number) => {
      const progress = Math.min((time - start) / duration, 1);
      const eased = 1 - Math.pow(1 - progress, 3);
      setCurrent(value * eased);
      if (progress < 1) frame = requestAnimationFrame(tick);
    };

    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [value]);

  const formatted =
    decimals > 0
      ? current.toFixed(decimals)
      : Math.round(current).toLocaleString(undefined, { maximumFractionDigits: 0 });

  return (
    <span aria-label={`${value}${suffix}`} suppressHydrationWarning>
      {formatted}
      {suffix}
    </span>
  );
}

function WorkspaceSection() {
  return (
    <section className="bg-white/75 py-20 sm:py-24" aria-labelledby="workspace-title">
      <div className="mx-auto grid max-w-7xl gap-10 px-4 sm:px-6 lg:grid-cols-[0.78fr_1.22fr] lg:px-8">
        <div>
          <p className="text-sm font-bold uppercase text-primary">Organization Workspace</p>
          <h2
            id="workspace-title"
            className="mt-4 text-4xl font-semibold leading-tight text-slate-950 sm:text-5xl"
          >
            Every media company gets its own secure newsroom.
          </h2>
          <p className="mt-5 text-lg leading-8 text-slate-600">
            Every newspaper or media company has its own secure organization where owners can manage
            users, assign roles, approve access requests, and collaborate securely across editorial
            teams.
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            {[
              "Access requests",
              "Role assignment",
              "Editorial approval",
              "Secure collaboration",
            ].map((item) => (
              <span
                key={item}
                className="rounded-full border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 shadow-sm"
              >
                {item}
              </span>
            ))}
          </div>
        </div>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {roles.map((role, index) => (
            <Card
              key={role.title}
              className="landing-reveal rounded-lg border-slate-200 bg-white p-5 shadow-sm"
              style={{ animationDelay: `${index * 45}ms` }}
            >
              <UserCog aria-hidden="true" className="h-5 w-5 text-primary" />
              <h3 className="mt-4 text-lg font-semibold text-slate-950">{role.title}</h3>
              <p className="mt-2 text-sm leading-6 text-slate-600">{role.body}</p>
            </Card>
          ))}
        </div>
      </div>
    </section>
  );
}

function TestimonialsSection() {
  return (
    <section className="py-20 sm:py-24" aria-labelledby="testimonials-title">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <SectionIntro
          eyebrow="Testimonials"
          title="Trusted by editorial teams moving from manual workflows to AI-assisted publishing."
          body="Sample feedback from publishers, editors, and digital desk leaders using AI-powered newsroom automation."
        />
        <div className="mt-12 grid gap-4 lg:grid-cols-3">
          {testimonials.map((testimonial, index) => (
            <Card
              key={testimonial.name}
              className="landing-reveal rounded-lg border-slate-200 bg-white p-6 shadow-sm"
              style={{ animationDelay: `${index * 80}ms` }}
            >
              <Quote aria-hidden="true" className="h-8 w-8 text-primary/70" />
              <p className="mt-5 text-base leading-7 text-slate-700">"{testimonial.quote}"</p>
              <div className="mt-6">
                <div className="font-semibold text-slate-950">{testimonial.name}</div>
                <div className="text-sm text-slate-500">{testimonial.role}</div>
              </div>
            </Card>
          ))}
        </div>
      </div>
    </section>
  );
}

function FaqSection() {
  return (
    <section id="faq" className="bg-white/75 py-20 sm:py-24" aria-labelledby="faq-title">
      <div className="mx-auto grid max-w-7xl gap-10 px-4 sm:px-6 lg:grid-cols-[0.75fr_1.25fr] lg:px-8">
        <div>
          <p className="text-sm font-bold uppercase text-primary">FAQ</p>
          <h2
            id="faq-title"
            className="mt-4 text-4xl font-semibold leading-tight text-slate-950 sm:text-5xl"
          >
            Questions newsrooms ask before adopting AI.
          </h2>
          <p className="mt-5 text-lg leading-8 text-slate-600">
            Clear answers about AI-generated news, OCR support, supported source material, security,
            organization management, and publishing workflows.
          </p>
        </div>
        <Card className="rounded-lg border-slate-200 bg-white p-2 shadow-sm">
          <Accordion type="single" collapsible className="w-full">
            {faqs.map((faq) => (
              <AccordionItem
                key={faq.question}
                value={faq.question}
                className="border-slate-200 px-4"
              >
                <AccordionTrigger className="text-base font-semibold text-slate-950 hover:no-underline">
                  {faq.question}
                </AccordionTrigger>
                <AccordionContent className="text-sm leading-6 text-slate-600">
                  {faq.answer}
                </AccordionContent>
              </AccordionItem>
            ))}
          </Accordion>
        </Card>
      </div>
    </section>
  );
}

function CtaSection() {
  return (
    <section
      id="contact"
      className="px-4 py-20 sm:px-6 sm:py-24 lg:px-8"
      aria-labelledby="cta-title"
    >
      <div className="mx-auto max-w-6xl overflow-hidden rounded-lg border border-white/70 bg-slate-950 px-6 py-14 text-center text-white shadow-2xl shadow-slate-950/20 sm:px-10 sm:py-16">
        <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-lg bg-white text-slate-950">
          <Sparkles aria-hidden="true" className="h-7 w-7" />
        </div>
        <h2
          id="cta-title"
          className="mx-auto mt-6 max-w-3xl text-4xl font-semibold leading-tight sm:text-5xl"
        >
          Ready to Transform Your Newsroom with AI?
        </h2>
        <p className="mx-auto mt-5 max-w-2xl text-lg leading-8 text-slate-300">
          Start using AI News Studio today to create faster, edit smarter, collaborate securely, and
          publish across print, web, and social channels.
        </p>
        <Button
          asChild
          size="lg"
          className="mt-8 h-12 bg-white px-7 text-slate-950 hover:bg-slate-100"
        >
          <Link to="/auth" search={{ mode: "signup" }}>
            Get Started
            <ArrowRight aria-hidden="true" />
          </Link>
        </Button>
      </div>
    </section>
  );
}

function LandingFooter() {
  const socialLinks = [
    { label: "Twitter", icon: Twitter, href: "https://twitter.com" },
    { label: "LinkedIn", icon: Linkedin, href: "https://linkedin.com" },
    { label: "Instagram", icon: Instagram, href: "https://instagram.com" },
    { label: "Facebook", icon: Facebook, href: "https://facebook.com" },
    { label: "YouTube", icon: Youtube, href: "https://youtube.com" },
  ];

  return (
    <footer className="border-t border-slate-200 bg-white" aria-label="Footer">
      <div className="mx-auto grid max-w-7xl gap-10 px-4 py-12 sm:px-6 lg:grid-cols-[1.1fr_0.9fr] lg:px-8">
        <div>
          <Logo />
          <p className="mt-5 max-w-md text-sm leading-6 text-slate-600">
            AI News Studio is a premium AI newsroom platform for newspapers, publishers, and media
            organizations that need faster content creation, smarter editing, secure collaboration,
            and modern publishing workflows.
          </p>
          <div className="mt-6 flex flex-wrap gap-2">
            {socialLinks.map(({ label, href, icon: Icon }) => (
              <a
                key={label}
                href={href}
                aria-label={label}
                className="flex h-10 w-10 items-center justify-center rounded-md border border-slate-200 text-slate-600 transition hover:border-slate-950 hover:bg-slate-950 hover:text-white"
              >
                <Icon aria-hidden="true" className="h-4 w-4" />
              </a>
            ))}
          </div>
        </div>
        <div className="grid gap-8 sm:grid-cols-2">
          {footerGroups.map((group) => (
            <div key={group.title}>
              <h3 className="text-sm font-semibold text-slate-950">{group.title}</h3>
              <ul className="mt-4 space-y-3">
                {group.links.map((link) => (
                  <li key={link.label}>
                    <a
                      href={link.href}
                      className="text-sm text-slate-600 transition hover:text-slate-950"
                    >
                      {link.label}
                    </a>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </div>
      <div className="border-t border-slate-200 px-4 py-6 sm:px-6 lg:px-8">
        <div className="mx-auto flex max-w-7xl flex-col gap-3 text-sm text-slate-500 sm:flex-row sm:items-center sm:justify-between">
          <span>Copyright 2026 AI News Studio. All rights reserved.</span>
          <span>Built for secure, AI-powered media organizations.</span>
        </div>
      </div>
    </footer>
  );
}

function SectionIntro({
  eyebrow,
  title,
  body,
  inverted = false,
}: {
  eyebrow: string;
  title: string;
  body: string;
  inverted?: boolean;
}) {
  return (
    <div className="landing-reveal mx-auto max-w-3xl text-center">
      <p className={cn("text-sm font-bold uppercase", inverted ? "text-cyan-200" : "text-primary")}>
        {eyebrow}
      </p>
      <h2
        className={cn(
          "mt-4 text-4xl font-semibold leading-tight sm:text-5xl",
          inverted ? "text-white" : "text-slate-950",
        )}
      >
        {title}
      </h2>
      <p className={cn("mt-5 text-lg leading-8", inverted ? "text-slate-300" : "text-slate-600")}>
        {body}
      </p>
    </div>
  );
}
