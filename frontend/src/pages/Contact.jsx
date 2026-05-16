import React, { useMemo } from 'react'
import { ArrowUpRight, Github, Mail, Sparkles } from 'lucide-react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import './Contact.css'

const buildAvatarDataUrl = (label, background = '#f472b6', foreground = '#ffffff') => {
  const safeLabel = String(label || '').trim().slice(0, 2).toUpperCase() || 'MB';
  const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 240 240" role="img" aria-label="${safeLabel}">
      <defs>
        <linearGradient id="g" x1="0" x2="1" y1="0" y2="1">
          <stop offset="0%" stop-color="${background}" />
          <stop offset="100%" stop-color="#fb7185" />
        </linearGradient>
      </defs>
      <rect width="240" height="240" rx="120" fill="url(#g)" />
      <text x="50%" y="54%" text-anchor="middle" dominant-baseline="middle" font-family="Inter, Arial, sans-serif" font-size="86" font-weight="700" fill="${foreground}">
        ${safeLabel}
      </text>
    </svg>
  `;
  return `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`;
};

const CONTRIBUTORS = [
  {
    name: 'Võ Xuân Quang',
    role: 'Web Development, Architecture & Integration',
    github: 'QuangVoAI',
    email: 'vxq123@icloud.com',
    avatar: buildAvatarDataUrl('VQ'),
    bio: 'Responsible for the web stack, system architecture, backend integration, media handling, and cloud deployment.'
  },
  {
    name: 'Hoàng Xuân Thành',
    role: 'EmpathAI & Agentic Experience',
    github: 'Thanh281105',
    email: '',
    avatar: buildAvatarDataUrl('HT', '#60a5fa'),
    bio: 'Responsible for EmpathAI, agentic workflows, and the customer support intelligence layer.'
  }
]

const CONTACT_POINTS = [
  {
    title: 'Product Support',
    description: 'Ask about the catalog, pricing, variants, images, or product videos.',
  },
  {
    title: 'Orders & Shipping',
    description: 'Check order status, update an address, cancel an order, or track delivery.',
  },
  {
    title: 'Returns & Feedback',
    description: 'Send feedback, request a return, report bugs, or suggest improvements.',
  },
]

const CRYSTALS = [
  { top: '4%', left: '6%', delay: '0s', twinkle: '3s', drift: '14s', scale: 1.08, wanderX: '20px', wanderY: '16px' },
  { top: '8%', left: '22%', delay: '0.6s', twinkle: '2.8s', drift: '15s', scale: 0.9, wanderX: '18px', wanderY: '14px' },
  { top: '6%', left: '40%', delay: '1s', twinkle: '3.3s', drift: '17s', scale: 1.12, wanderX: '22px', wanderY: '18px' },
  { top: '10%', left: '58%', delay: '0.3s', twinkle: '3s', drift: '18s', scale: 0.96, wanderX: '20px', wanderY: '15px' },
  { top: '14%', left: '76%', delay: '1.2s', twinkle: '2.7s', drift: '19s', scale: 1.05, wanderX: '22px', wanderY: '17px' },
  { top: '18%', left: '90%', delay: '1.6s', twinkle: '3.2s', drift: '16s', scale: 0.88, wanderX: '18px', wanderY: '14px' },
  { top: '24%', left: '12%', delay: '0.9s', twinkle: '3.4s', drift: '18s', scale: 1.1, wanderX: '22px', wanderY: '18px' },
  { top: '28%', left: '32%', delay: '2s', twinkle: '2.9s', drift: '20s', scale: 0.94, wanderX: '20px', wanderY: '16px' },
  { top: '32%', left: '50%', delay: '1.4s', twinkle: '3.1s', drift: '17s', scale: 1.06, wanderX: '22px', wanderY: '17px' },
  { top: '36%', left: '70%', delay: '0.8s', twinkle: '3.3s', drift: '15.5s', scale: 0.92, wanderX: '20px', wanderY: '16px' },
]

const FLOW_LINES = [
  { top: '14%', blur: '10px', alpha: 0.4, duration: 16, delay: 0 },
  { top: '30%', blur: '12px', alpha: 0.28, duration: 18, delay: 2 },
  { top: '46%', blur: '8px', alpha: 0.35, duration: 15, delay: 1 },
  { top: '62%', blur: '14px', alpha: 0.22, duration: 20, delay: 3 },
  { top: '78%', blur: '10px', alpha: 0.3, duration: 17, delay: 4 },
]

const GLOW_ORBS = [
  { size: 160, top: '12%', left: '14%', hue: 'rgba(99,102,241,0.25)', delay: 0 },
  { size: 190, top: '68%', left: '12%', hue: 'rgba(14,165,233,0.22)', delay: 1.2 },
  { size: 140, top: '26%', left: '76%', hue: 'rgba(236,72,153,0.24)', delay: 0.7 },
  { size: 200, top: '70%', left: '78%', hue: 'rgba(126,87,194,0.22)', delay: 1.5 },
]

const Contact = () => {
  // Memoize animated elements to prevent re-renders
  const flowLinesElements = useMemo(() => FLOW_LINES.map((line, idx) => (
    <span
      key={idx}
      className="flow-line"
      style={{
        top: line.top,
        filter: `blur(${line.blur})`,
        opacity: line.alpha,
        animationDuration: `${line.duration}s`,
        animationDelay: `${line.delay}s`,
      }}
    />
  )), [])

  const glowOrbsElements = useMemo(() => GLOW_ORBS.map((orb, idx) => (
    <span
      key={idx}
      className="floating-orb"
      style={{
        width: `${orb.size}px`,
        height: `${orb.size}px`,
        top: orb.top,
        left: orb.left,
        background: orb.hue,
        animationDelay: `${orb.delay}s`,
      }}
    />
  )), [])

  const crystalsElements = useMemo(() => CRYSTALS.map((c, idx) => (
    <span
      key={idx}
      className="butterfly"
      style={{
        top: c.top,
        left: c.left,
        '--twinkle-delay': c.delay,
        '--twinkle-duration': c.twinkle,
        '--drift-duration': c.drift,
        '--crystal-scale': c.scale,
        '--wander-x': c.wanderX,
        '--wander-y': c.wanderY,
      }}
    />
  )), [])

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-100 via-white to-indigo-100 text-gray-900 dark:from-slate-900 dark:via-slate-950 dark:to-[#0b1021] relative overflow-hidden">
      <div className="contact-animated-bg animated-gradient" aria-hidden="true" />
      
      <div className="flow-lines" aria-hidden="true">
        {flowLinesElements}
      </div>
      
      <div className="floating-orbs" aria-hidden="true">
        {glowOrbsElements}
      </div>
      
      <div className="butterfly-layer" aria-hidden="true">
        {crystalsElements}
      </div>

      <div className="relative z-10 max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-12 sm:py-16 space-y-10">
        {/* Hero section */}
        <section className="relative overflow-hidden rounded-3xl border border-indigo-100/70 bg-white/80 dark:bg-slate-900/70 backdrop-blur shadow-[0_20px_80px_-24px_rgba(79,70,229,0.35)]">
          <div className="animated-gradient absolute inset-0 opacity-80 bg-[radial-gradient(circle_at_20%_20%,rgba(79,70,229,0.28),transparent_32%),radial-gradient(circle_at_80%_0%,rgba(14,165,233,0.3),transparent_32%),radial-gradient(circle_at_50%_90%,rgba(236,72,153,0.24),transparent_42%)]" />
          <div className="relative p-8 sm:p-12 space-y-4">
            <p className="inline-flex items-center gap-2 text-sm font-semibold text-indigo-600 dark:text-indigo-300">
              <Sparkles className="size-4" />
              Contact MilkyBloom
            </p>
            <h1 className="text-3xl sm:text-4xl font-bold tracking-tight text-slate-900 dark:text-white">
              Connect quickly with the team building MilkyBloom
            </h1>
            <p className="text-base sm:text-lg text-slate-600 dark:text-slate-300 max-w-3xl">
              Need help with products, orders, shipping, returns, or project feedback?
              Reach out to the right contributor directly or send a shared email to the team, and we'll respond as quickly as possible.
            </p>
            <div className="flex flex-wrap gap-3 pt-2">
              <Button asChild size="lg" className="px-5">
                <a href="mailto:vxq123@icloud.com">
                  <Mail className="size-4" />
                  Email the team
                </a>
              </Button>
              <Button asChild variant="outline" size="lg" className="px-5">
                <a href="https://github.com/QuangVoAI/MilkyBloomVibeCode" target="_blank" rel="noreferrer" className="flex items-center gap-2">
                  <Github className="size-4" />
                  View source
                  <ArrowUpRight className="size-4" />
                </a>
              </Button>
            </div>
          </div>
        </section>

        {/* Contact points */}
        <section className="grid gap-4 md:grid-cols-3">
          {CONTACT_POINTS.map((point) => (
            <Card key={point.title} className="bg-white/90 dark:bg-slate-900/70 border-slate-200/80 dark:border-slate-800/80 shadow-sm">
              <CardHeader className="pb-2">
                <CardTitle className="text-lg text-slate-900 dark:text-white">
                  {point.title}
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-sm leading-relaxed text-slate-600 dark:text-slate-300">
                  {point.description}
                </p>
              </CardContent>
            </Card>
          ))}
        </section>

        {/* Contributors section */}
        <section className="space-y-4">
          <div className="flex items-center justify-between gap-4 flex-wrap">
            <div>
              <h2 className="text-2xl font-semibold text-slate-900 dark:text-white">Project Contributors</h2>
              <p className="text-sm text-slate-600 dark:text-slate-300">
                Direct contact details for each primary contributor.
              </p>
            </div>
          </div>

          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {CONTRIBUTORS.map((person, idx) => (
              <Card
                key={person.github}
                className="floating-card group h-full border-slate-200/80 dark:border-slate-800/80 bg-white/90 dark:bg-slate-900/70 shadow-sm hover:-translate-y-1 hover:shadow-2xl transition-all duration-300 card-enter"
                style={{ animationDelay: `${idx * 0.18}s` }}
              >
                <CardHeader className="pb-2 flex-row items-center gap-4">
                  <div className="relative">
                    <div className="absolute inset-0 rounded-full bg-gradient-to-br from-indigo-200 via-sky-200 to-rose-200 blur-2xl opacity-60 group-hover:opacity-80 transition-opacity" />
                    <img
                      src={person.avatar}
                      alt={`Photo of ${person.name}`}
                      className="relative size-16 rounded-full border-2 border-white dark:border-slate-800 shadow-md object-cover"
                      loading="lazy"
                    />
                  </div>
                  <div>
                    <CardTitle className="text-lg text-slate-900 dark:text-white">{person.name}</CardTitle>
                    <CardDescription className="text-sm font-medium text-indigo-700 dark:text-indigo-300">
                      {person.role}
                    </CardDescription>
                  </div>
                </CardHeader>
                <CardContent className="space-y-3">
                  <p className="text-sm text-slate-600 dark:text-slate-300 leading-relaxed">{person.bio}</p>
                  <div className="space-y-2">
                    <a
                      href={`https://github.com/${person.github}`}
                      target="_blank"
                      rel="noreferrer"
                      className="flex items-center gap-2 text-sm font-semibold text-slate-800 dark:text-slate-100 hover:text-indigo-600 dark:hover:text-indigo-300 transition-colors"
                    >
                      <Github className="size-4 text-indigo-600 dark:text-indigo-300" />
                      {person.github}
                      <ArrowUpRight className="size-3.5 opacity-70" />
                    </a>
                    {person.email ? (
                      <a
                        href={`mailto:${person.email}`}
                        className="flex items-center gap-2 text-sm text-slate-600 dark:text-slate-300 hover:text-indigo-600 dark:hover:text-indigo-300 transition-colors"
                      >
                        <Mail className="size-4 text-indigo-600 dark:text-indigo-300" />
                        {person.email}
                      </a>
                    ) : null}
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </section>
      </div>
    </div>
  )
}

export default Contact
