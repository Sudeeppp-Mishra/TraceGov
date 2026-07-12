import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { Container, Button, Icons, Reveal, SectionLabel, useCountUp } from '../components/ui';
import { Logo, ThemeToggle } from '../components/layout';

/* ═══════════════════════════ Navbar ═══════════════════════════ */
function LandingNav() {
  const [open, setOpen] = useState(false);
  const links = [
    { href: '#features', label: 'Features' },
    { href: '#how', label: 'How it works' },
    { href: '#workflows', label: 'Workflows' },
    { href: '#faq', label: 'FAQ' },
  ];
  return (
    <header className="fixed inset-x-0 top-0 z-50 border-b border-border/70 glass">
      <Container size="wide" className="flex h-16 items-center justify-between gap-4">
        <Logo />
        <nav className="hidden items-center gap-1 md:flex">
          {links.map((l) => (
            <a key={l.href} href={l.href} className="rounded-lg px-3 py-2 text-[13px] font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground">
              {l.label}
            </a>
          ))}
        </nav>
        <div className="flex items-center gap-2">
          <ThemeToggle className="hidden sm:flex" />
          <Button as={Link} to="/track" variant="ghost" size="sm" className="hidden sm:inline-flex">Track a file</Button>
          <Button as={Link} to="/login" variant="primary" size="sm">Officer sign in</Button>
          <button onClick={() => setOpen((v) => !v)} className="flex h-9 w-9 items-center justify-center rounded-lg border border-border md:hidden cursor-pointer" aria-label="Menu">
            {open ? <Icons.X className="h-5 w-5" /> : <Icons.Menu className="h-5 w-5" />}
          </button>
        </div>
      </Container>
      {open && (
        <div className="border-t border-border bg-card md:hidden animate-fade-down">
          <Container size="wide" className="flex flex-col gap-1 py-3">
            {links.map((l) => (
              <a key={l.href} href={l.href} onClick={() => setOpen(false)} className="rounded-lg px-3 py-2.5 text-sm font-medium text-muted-foreground">{l.label}</a>
            ))}
            <Link to="/track" className="rounded-lg px-3 py-2.5 text-sm font-medium text-foreground">Track a file</Link>
          </Container>
        </div>
      )}
    </header>
  );
}

/* ═══════════════════════════ Hero ═══════════════════════════ */
function Hero() {
  return (
    <section className="relative overflow-hidden pt-32 pb-20 sm:pt-40 sm:pb-28">
      <div className="pointer-events-none absolute inset-0 bg-grid mask-fade-b opacity-60" aria-hidden="true" />
      <div className="pointer-events-none absolute left-1/2 top-0 h-[420px] w-[820px] -translate-x-1/2 rounded-full bg-emerald-500/10 blur-[120px]" aria-hidden="true" />
      <Container className="relative">
        <div className="mx-auto max-w-3xl text-center">
          <Reveal>
            <span className="inline-flex items-center gap-2 rounded-full border border-border bg-card px-3.5 py-1.5 text-xs font-medium text-muted-foreground shadow-sm">
              <span className="flex h-2 w-2 items-center justify-center">
                <span className="absolute h-2 w-2 animate-ping rounded-full bg-emerald-500/60" />
                <span className="h-2 w-2 rounded-full bg-emerald-500" />
              </span>
              Digital transparency for public services
            </span>
          </Reveal>
          <Reveal delay={80}>
            <h1 className="mt-6 text-4xl font-bold tracking-tight text-foreground sm:text-6xl">
              Track every government file,
              <span className="block bg-gradient-to-r from-navy-700 to-emerald-600 bg-clip-text text-transparent dark:from-navy-200 dark:to-emerald-400">
                from desk to decision.
              </span>
            </h1>
          </Reveal>
          <Reveal delay={160}>
            <p className="mx-auto mt-6 max-w-xl text-lg leading-relaxed text-muted-foreground">
              TraceGov digitizes the movement of physical government files. Citizens follow their applications in real time, and officers process them on an immutable, tamper-proof audit ledger.
            </p>
          </Reveal>
          <Reveal delay={240}>
            <div className="mt-9 flex flex-col items-center justify-center gap-3 sm:flex-row">
              <Button as={Link} to="/track" variant="primary" size="lg" className="w-full sm:w-auto">
                Track your file <Icons.ArrowRight className="h-4 w-4" />
              </Button>
              <Button as={Link} to="/login" variant="outline" size="lg" className="w-full sm:w-auto">
                <Icons.Lock className="h-4 w-4" /> Officer portal
              </Button>
            </div>
          </Reveal>
          <Reveal delay={320}>
            <p className="mt-6 flex items-center justify-center gap-2 text-xs text-muted-foreground">
              <Icons.ShieldCheck className="h-4 w-4 text-emerald-600" />
              SHA-256 cryptographic ledger · No login required to track
            </p>
          </Reveal>
        </div>

        <Reveal delay={200} className="mx-auto mt-16 max-w-4xl">
          <HeroPreview />
        </Reveal>
      </Container>
    </section>
  );
}

/* Government-inspired illustrated preview (pure SVG/markup, no external asset) */
function HeroPreview() {
  const steps = [
    { label: 'Received', done: true }, { label: 'Verification', done: true },
    { label: 'Ward Chair', active: true }, { label: 'Dispatched', done: false },
  ];
  return (
    <div className="relative rounded-2xl border border-border bg-card p-2 shadow-[0_30px_80px_-30px_rgba(15,31,54,0.35)]">
      <div className="rounded-xl border border-border bg-surface/60 p-5 sm:p-7">
        <div className="flex items-center justify-between border-b border-border pb-4">
          <div className="flex items-center gap-2.5">
            <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary text-primary-foreground"><Icons.FileText className="h-4.5 w-4.5" /></span>
            <div className="text-left">
              <p className="text-sm font-semibold text-foreground">Land Valuation Claim</p>
              <p className="font-mono text-[11px] text-muted-foreground">TGTRACKA82 · Ward 01</p>
            </div>
          </div>
          <span className="inline-flex items-center gap-1.5 rounded-full border border-amber-200 bg-amber-50 px-2.5 py-0.5 text-xs font-semibold text-amber-700 dark:border-amber-900/50 dark:bg-amber-950/40 dark:text-amber-300">
            <span className="h-1.5 w-1.5 rounded-full bg-amber-500" /> Under Review
          </span>
        </div>
        <div className="mt-6 grid grid-cols-4 gap-2 sm:gap-3">
          {steps.map((s, i) => (
            <div key={s.label} className="text-left">
              <div className="flex items-center gap-1">
                <span className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[11px] font-bold ${s.done ? 'bg-emerald-500 text-white' : s.active ? 'bg-primary text-primary-foreground animate-pulse-ring' : 'bg-muted text-muted-foreground'}`}>
                  {s.done ? '✓' : i + 1}
                </span>
                {i < steps.length - 1 && <span className={`h-0.5 flex-1 rounded ${s.done ? 'bg-emerald-500' : 'bg-border'}`} />}
              </div>
              <p className="mt-2 text-[11px] font-semibold text-foreground">{s.label}</p>
            </div>
          ))}
        </div>
        <div className="mt-6 grid gap-3 sm:grid-cols-3">
          {[['Expected wait', '~42 min'], ['Current desk', 'Ward Chair'], ['Ledger', 'Verified']].map(([k, v]) => (
            <div key={k} className="rounded-lg border border-border bg-card p-3">
              <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">{k}</p>
              <p className="mt-1 text-sm font-bold text-foreground">{v}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

/* ═══════════════════════════ Trust bar / stats ═══════════════════════════ */
function StatItem({ value, suffix, label }) {
  const n = useCountUp(value, { duration: 1600 });
  const display = value >= 1000 ? Math.round(n).toLocaleString() : n.toFixed(value % 1 !== 0 ? 1 : 0);
  return (
    <div className="text-center">
      <p className="text-3xl font-bold tracking-tight text-foreground sm:text-4xl tabular-nums">{display}{suffix}</p>
      <p className="mt-1.5 text-sm text-muted-foreground">{label}</p>
    </div>
  );
}

function Stats() {
  return (
    <section className="border-y border-border bg-surface/50 py-14">
      <Container>
        <Reveal className="grid grid-cols-2 gap-8 lg:grid-cols-4">
          <StatItem value={98.6} suffix="%" label="Files traced end-to-end" />
          <StatItem value={42} suffix="k" label="Movements logged" />
          <StatItem value={3.2} suffix="×" label="Faster status lookups" />
          <StatItem value={100} suffix="%" label="Tamper-proof audit trail" />
        </Reveal>
      </Container>
    </section>
  );
}

/* ═══════════════════════════ Features ═══════════════════════════ */
const FEATURES = [
  { icon: Icons.QrCode, title: 'QR-tagged files', desc: 'Every physical folder gets a unique QR tag at registration. Scan to instantly pull its full ledger at any desk.' },
  { icon: Icons.ShieldCheck, title: 'Immutable audit ledger', desc: 'Each movement is chained with SHA-256 hashes. Updates and deletions are cryptographically blocked.' },
  { icon: Icons.Eye, title: 'Citizen transparency', desc: 'Applicants track progress live with a tracking ID — no account, no queues, no phone calls.' },
  { icon: Icons.Sparkles, title: 'AI delay prediction', desc: 'M/M/1 queue modeling estimates wait times and surfaces bottleneck departments before they stall.' },
  { icon: Icons.Route, title: 'Smart routing', desc: 'Forward, backtrack, and assign files between desks with reasons captured on the record.' },
  { icon: Icons.BarChart, title: 'Operational analytics', desc: 'Dwell-time heatmaps and officer throughput give administrators a real-time view of the ward.' },
];

function Features() {
  return (
    <section id="features" className="py-24">
      <Container>
        <Reveal className="mx-auto max-w-2xl text-center">
          <SectionLabel>Platform</SectionLabel>
          <h2 className="mt-4 text-3xl font-bold tracking-tight text-foreground sm:text-4xl">Everything a modern registry needs</h2>
          <p className="mt-4 text-lg text-muted-foreground">Built for accountability first — transparent to citizens, rigorous for officers, insightful for administrators.</p>
        </Reveal>
        <div className="mt-14 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {FEATURES.map((f, i) => (
            <Reveal key={f.title} delay={i * 70}>
              <div className="group h-full rounded-2xl border border-border bg-card p-6 transition-all duration-300 hover:-translate-y-1 hover:border-border-strong hover:shadow-[0_18px_40px_-20px_rgba(15,31,54,0.25)]">
                <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-primary/5 text-primary transition-colors group-hover:bg-primary group-hover:text-primary-foreground">
                  <f.icon className="h-5.5 w-5.5" />
                </div>
                <h3 className="mt-5 text-base font-semibold text-foreground">{f.title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{f.desc}</p>
              </div>
            </Reveal>
          ))}
        </div>
      </Container>
    </section>
  );
}

/* ═══════════════════════════ How it works ═══════════════════════════ */
const HOW = [
  { n: '01', title: 'File is registered', desc: 'An officer creates a digital record for the physical folder and prints a QR tag stuck to the envelope.', icon: Icons.FileText },
  { n: '02', title: 'Movement is tracked', desc: 'At each desk the QR is scanned. Forward, review, or backtrack — every action is written to the ledger.', icon: Icons.Route },
  { n: '03', title: 'Citizen follows live', desc: 'The applicant enters their tracking ID and sees exactly where their file is and what happens next.', icon: Icons.Eye },
  { n: '04', title: 'Decision & dispatch', desc: 'Once approved the file is dispatched for collection, closing a fully auditable, transparent loop.', icon: Icons.CheckCircle },
];

function HowItWorks() {
  return (
    <section id="how" className="border-y border-border bg-surface/40 py-24">
      <Container>
        <Reveal className="mx-auto max-w-2xl text-center">
          <SectionLabel>How TraceGov works</SectionLabel>
          <h2 className="mt-4 text-3xl font-bold tracking-tight text-foreground sm:text-4xl">From counter to conclusion in four steps</h2>
        </Reveal>
        <div className="relative mt-16">
          <div className="absolute left-0 right-0 top-9 hidden h-px bg-gradient-to-r from-transparent via-border-strong to-transparent lg:block" aria-hidden="true" />
          <div className="grid gap-8 lg:grid-cols-4">
            {HOW.map((s, i) => (
              <Reveal key={s.n} delay={i * 100} className="relative">
                <div className="flex flex-col items-center text-center lg:items-start lg:text-left">
                  <div className="relative z-10 flex h-[72px] w-[72px] items-center justify-center rounded-2xl border border-border bg-card shadow-sm">
                    <s.icon className="h-7 w-7 text-primary" />
                  </div>
                  <span className="mt-5 font-mono text-xs font-bold text-emerald-600 dark:text-emerald-400">{s.n}</span>
                  <h3 className="mt-1.5 text-lg font-semibold text-foreground">{s.title}</h3>
                  <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{s.desc}</p>
                </div>
              </Reveal>
            ))}
          </div>
        </div>
      </Container>
    </section>
  );
}

/* ═══════════════════════════ Workflows (officer / citizen) ═══════════════════════════ */
function Workflows() {
  const officer = ['Register files & print QR tags', 'Scan to open the full audit ledger', 'Forward, backtrack or assign with reasons', 'Get AI congestion & delay warnings'];
  const citizen = ['Enter a tracking ID — no account needed', 'See the live desk and status', 'Understand what happens next', 'Get an AI estimate of the wait time'];
  return (
    <section id="workflows" className="py-24">
      <Container>
        <Reveal className="mx-auto max-w-2xl text-center">
          <SectionLabel>Built for both sides of the counter</SectionLabel>
          <h2 className="mt-4 text-3xl font-bold tracking-tight text-foreground sm:text-4xl">One system, two experiences</h2>
        </Reveal>
        <div className="mt-14 grid gap-6 lg:grid-cols-2">
          <Reveal>
            <WorkflowCard tone="navy" eyebrow="For officers" title="A rigorous processing terminal" icon={Icons.Building} items={officer} cta={{ to: '/login', label: 'Open officer portal' }} />
          </Reveal>
          <Reveal delay={100}>
            <WorkflowCard tone="emerald" eyebrow="For citizens" title="Radical transparency, zero friction" icon={Icons.Users} items={citizen} cta={{ to: '/track', label: 'Track a file' }} />
          </Reveal>
        </div>
      </Container>
    </section>
  );
}

function WorkflowCard({ tone, eyebrow, title, icon: Icon, items, cta }) {
  const accent = tone === 'emerald' ? 'text-emerald-600 dark:text-emerald-400' : 'text-navy-600 dark:text-navy-300';
  const bg = tone === 'emerald' ? 'bg-emerald-500/10' : 'bg-navy-500/10';
  return (
    <div className="flex h-full flex-col rounded-2xl border border-border bg-card p-8">
      <div className={`flex h-12 w-12 items-center justify-center rounded-xl ${bg} ${accent}`}>
        <Icon className="h-6 w-6" />
      </div>
      <p className={`mt-6 text-xs font-semibold uppercase tracking-wider ${accent}`}>{eyebrow}</p>
      <h3 className="mt-1.5 text-xl font-bold text-foreground">{title}</h3>
      <ul className="mt-6 space-y-3.5">
        {items.map((it) => (
          <li key={it} className="flex items-start gap-3 text-sm text-muted-foreground">
            <Icons.CheckCircle className={`mt-0.5 h-4.5 w-4.5 shrink-0 ${accent}`} />
            {it}
          </li>
        ))}
      </ul>
      <div className="mt-8 pt-2">
        <Button as={Link} to={cta.to} variant={tone === 'emerald' ? 'accent' : 'primary'} className="w-full sm:w-auto">
          {cta.label} <Icons.ArrowRight className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}

/* ═══════════════════════════ Benefits ═══════════════════════════ */
const BENEFITS = [
  { icon: Icons.Eye, title: 'Transparency', desc: 'Citizens always know where their file is.' },
  { icon: Icons.ShieldCheck, title: 'Accountability', desc: 'Every action is attributed and permanent.' },
  { icon: Icons.Lock, title: 'Reduced corruption', desc: 'Tamper-proof records remove blind spots.' },
  { icon: Icons.Zap, title: 'Better experience', desc: 'Less waiting, fewer queues, clearer outcomes.' },
];

function Benefits() {
  return (
    <section className="border-y border-border bg-surface/40 py-20">
      <Container>
        <div className="grid gap-8 sm:grid-cols-2 lg:grid-cols-4">
          {BENEFITS.map((b, i) => (
            <Reveal key={b.title} delay={i * 80}>
              <div className="flex items-start gap-4">
                <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-card text-primary shadow-sm">
                  <b.icon className="h-5.5 w-5.5" />
                </div>
                <div>
                  <h3 className="text-base font-semibold text-foreground">{b.title}</h3>
                  <p className="mt-1 text-sm text-muted-foreground">{b.desc}</p>
                </div>
              </div>
            </Reveal>
          ))}
        </div>
      </Container>
    </section>
  );
}

/* ═══════════════════════════ Testimonials ═══════════════════════════ */
const QUOTES = [
  { quote: 'For the first time I could see my land file move between desks without visiting the office five times. It saved me two weeks.', name: 'Anita Sharma', role: 'Citizen, Ward 01' },
  { quote: 'The audit ledger ended the "your file is somewhere in the building" problem. Accountability is now automatic.', name: 'Rajesh Thapa', role: 'Ward Officer' },
  { quote: 'Bottleneck analytics let me reassign staff before queues built up. Processing times dropped noticeably.', name: 'Sunita Karki', role: 'Ward Administrator' },
];

function Testimonials() {
  return (
    <section className="py-24">
      <Container>
        <Reveal className="mx-auto max-w-2xl text-center">
          <SectionLabel>Voices</SectionLabel>
          <h2 className="mt-4 text-3xl font-bold tracking-tight text-foreground sm:text-4xl">Trusted across the counter</h2>
        </Reveal>
        <div className="mt-14 grid gap-6 lg:grid-cols-3">
          {QUOTES.map((q, i) => (
            <Reveal key={q.name} delay={i * 90}>
              <figure className="flex h-full flex-col rounded-2xl border border-border bg-card p-7">
                <div className="flex gap-0.5 text-emerald-500">
                  {Array.from({ length: 5 }).map((_, s) => <Icons.Star key={s} className="h-4 w-4 fill-current" />)}
                </div>
                <blockquote className="mt-4 flex-1 text-sm leading-relaxed text-foreground">“{q.quote}”</blockquote>
                <figcaption className="mt-6 flex items-center gap-3 border-t border-border pt-5">
                  <span className="flex h-10 w-10 items-center justify-center rounded-full bg-primary text-sm font-bold text-primary-foreground">{q.name[0]}</span>
                  <div>
                    <p className="text-sm font-semibold text-foreground">{q.name}</p>
                    <p className="text-xs text-muted-foreground">{q.role}</p>
                  </div>
                </figcaption>
              </figure>
            </Reveal>
          ))}
        </div>
      </Container>
    </section>
  );
}

/* ═══════════════════════════ FAQ ═══════════════════════════ */
const FAQS = [
  { q: 'Do citizens need an account to track a file?', a: 'No. Anyone with a tracking ID can view their file status instantly — no registration, login, or personal data required.' },
  { q: 'How is the audit trail tamper-proof?', a: 'Each movement record is chained to the previous one with a SHA-256 hash. Any edit or deletion breaks the chain and is immediately flagged during a ledger integrity audit.' },
  { q: 'What happens if the AI service is offline?', a: 'Wait-time estimates gracefully fall back to locally computed averages, so the platform keeps working even without the prediction microservice.' },
  { q: 'Can files be routed backwards for corrections?', a: 'Yes. Officers can backtrack a file to any desk with a required reason, and the citizen sees a clear "returned for correction" notice.' },
  { q: 'Is TraceGov suitable for any government office?', a: 'It is designed for ward-level registries but the desk, department, and document-type model is fully configurable for other agencies.' },
];

function FaqItem({ q, a, open, onToggle }) {
  return (
    <div className="border-b border-border">
      <button onClick={onToggle} className="flex w-full items-center justify-between gap-4 py-5 text-left cursor-pointer">
        <span className="text-[15px] font-semibold text-foreground">{q}</span>
        <Icons.ChevronDown className={`h-5 w-5 shrink-0 text-muted-foreground transition-transform duration-300 ${open ? 'rotate-180' : ''}`} />
      </button>
      <div className={`grid transition-all duration-300 ${open ? 'grid-rows-[1fr] pb-5' : 'grid-rows-[0fr]'}`}>
        <div className="overflow-hidden">
          <p className="text-sm leading-relaxed text-muted-foreground">{a}</p>
        </div>
      </div>
    </div>
  );
}

function Faq() {
  const [open, setOpen] = useState(0);
  return (
    <section id="faq" className="border-t border-border bg-surface/40 py-24">
      <Container size="narrow">
        <Reveal className="text-center">
          <SectionLabel>FAQ</SectionLabel>
          <h2 className="mt-4 text-3xl font-bold tracking-tight text-foreground sm:text-4xl">Questions, answered</h2>
        </Reveal>
        <Reveal delay={100} className="mt-10">
          {FAQS.map((f, i) => (
            <FaqItem key={f.q} {...f} open={open === i} onToggle={() => setOpen(open === i ? -1 : i)} />
          ))}
        </Reveal>
      </Container>
    </section>
  );
}

/* ═══════════════════════════ CTA ═══════════════════════════ */
function CtaBand() {
  return (
    <section className="py-24">
      <Container>
        <Reveal>
          <div className="relative overflow-hidden rounded-3xl border border-navy-800 bg-navy-900 px-8 py-16 text-center shadow-2xl sm:px-16">
            <div className="pointer-events-none absolute inset-0 bg-dots opacity-20" aria-hidden="true" />
            <div className="pointer-events-none absolute -right-16 -top-16 h-64 w-64 rounded-full bg-emerald-500/20 blur-3xl" aria-hidden="true" />
            <div className="relative">
              <h2 className="mx-auto max-w-2xl text-3xl font-bold tracking-tight text-white sm:text-4xl">Bring transparency to your registry</h2>
              <p className="mx-auto mt-4 max-w-xl text-lg text-navy-100">Start tracking files today, or sign in to the officer terminal to process the queue.</p>
              <div className="mt-9 flex flex-col items-center justify-center gap-3 sm:flex-row">
                <Button as={Link} to="/track" variant="accent" size="lg" className="w-full sm:w-auto">Track a file <Icons.ArrowRight className="h-4 w-4" /></Button>
                <Button as={Link} to="/login" size="lg" className="w-full bg-white text-navy-900 hover:bg-navy-50 sm:w-auto">Officer sign in</Button>
              </div>
            </div>
          </div>
        </Reveal>
      </Container>
    </section>
  );
}

/* ═══════════════════════════ Footer ═══════════════════════════ */
function Footer() {
  const cols = [
    { title: 'Product', links: [['Features', '#features'], ['How it works', '#how'], ['Workflows', '#workflows'], ['FAQ', '#faq']] },
    { title: 'Portals', links: [['Track a file', '/track'], ['Officer sign in', '/login'], ['Administration', '/login?role=admin']] },
    { title: 'Resources', links: [['Documentation', '#'], ['API status', '#'], ['Accessibility', '#']] },
  ];
  return (
    <footer className="border-t border-border bg-card">
      <Container className="py-16">
        <div className="grid gap-10 lg:grid-cols-[1.4fr_1fr_1fr_1fr]">
          <div>
            <Logo />
            <p className="mt-4 max-w-xs text-sm text-muted-foreground">Digital transparency and tamper-proof audit trails for public-service file movement.</p>
          </div>
          {cols.map((c) => (
            <div key={c.title}>
              <h4 className="text-xs font-semibold uppercase tracking-wider text-foreground">{c.title}</h4>
              <ul className="mt-4 space-y-2.5">
                {c.links.map(([label, href]) => (
                  <li key={label}>
                    {href.startsWith('#') ? (
                      <a href={href} className="text-sm text-muted-foreground transition-colors hover:text-foreground">{label}</a>
                    ) : (
                      <Link to={href} className="text-sm text-muted-foreground transition-colors hover:text-foreground">{label}</Link>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
        <div className="mt-14 flex flex-col items-center justify-between gap-4 border-t border-border pt-8 sm:flex-row">
          <p className="text-xs text-muted-foreground">© {new Date().getFullYear()} TraceGov · A digital government initiative.</p>
          <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <Icons.ShieldCheck className="h-4 w-4 text-emerald-600" /> Secured with cryptographic audit ledgers
          </p>
        </div>
      </Container>
    </footer>
  );
}

/* ═══════════════════════════ Page ═══════════════════════════ */
export default function LandingPage() {
  return (
    <div className="min-h-screen bg-background">
      <LandingNav />
      <Hero />
      <Stats />
      <Features />
      <HowItWorks />
      <Workflows />
      <Benefits />
      <Testimonials />
      <Faq />
      <CtaBand />
      <Footer />
    </div>
  );
}
