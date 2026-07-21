import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import {
  ArrowLeft, ArrowRight, BarChart3, BookOpen, Check, ChevronDown, FileQuestion,
  FileText, Languages, MessageCircle, Mic, Quote, ShieldCheck, Upload, Users,
} from 'lucide-react';
import ThemeToggle from '../components/ThemeToggle';
import { useLanguageStore, LANGUAGE_LABELS, type SupportedLang } from '../store/languageStore';
import { landingCopy, type LandingCopy } from '../i18n/landing';
import {
  usePrefersReducedMotion, useSmoothScroll, useReveal, useParallax, useTabHidden,
} from '../hooks/useScrollAnimation';
import 'lenis/dist/lenis.css';

/**
 * Primary action pins to palm-700 in both themes rather than following `bg-accent`.
 * The dark accent (#22c55e) is a signal colour meant for text and hairlines — white
 * sitting on it measures ~2.2:1, which is unreadable at button weight. palm-700 is the
 * same brand green one stop down and carries white at ~4.9:1 on either canvas.
 */
const PRIMARY_BTN =
  'inline-flex items-center justify-center gap-2 rounded-xl bg-[var(--color-palm-700)] ' +
  'hover:bg-[var(--color-palm-600)] text-white font-bold transition-colors ' +
  'focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-palm-500)] ' +
  'focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--color-surface)]';

const SECONDARY_BTN =
  'inline-flex items-center justify-center gap-2 rounded-xl bg-raised hover:bg-overlay ' +
  'border border-line text-ink font-bold transition-colors';

const LANGS: SupportedLang[] = ['en', 'ar', 'si', 'ta'];

/** Icons live in code, prose lives in `i18n/landing.ts`. Order matches `copy.features.items`. */
const FEATURE_ICONS = [FileText, ShieldCheck, Quote, Mic, Languages, BarChart3];
/** Order matches `copy.how.steps`. */
const STEP_ICONS = [Users, Upload, BookOpen];

const EASE = 'cubic-bezier(0.22, 1, 0.36, 1)';

function Wordmark({ size = '1.05rem' }: { size?: string }) {
  return (
    <span className="app-logo uppercase" style={{ fontSize: size }}>
      <span className="kiadp-text">Edu</span><span className="ai-highlight">AI</span>
    </span>
  );
}

function Reveal({
  children, motion, delay = 0, className = '',
}: { children: ReactNode; motion: boolean; delay?: number; className?: string }) {
  const { ref, revealed } = useReveal<HTMLDivElement>(motion);

  return (
    <div
      ref={ref}
      className={className}
      style={
        motion
          ? {
              opacity: revealed ? 1 : 0,
              transform: revealed ? 'translate3d(0,0,0)' : 'translate3d(0,20px,0)',
              transition: `opacity 600ms ${EASE} ${delay}ms, transform 600ms ${EASE} ${delay}ms`,
            }
          : undefined
      }
    >
      {children}
    </div>
  );
}

function LanguageMenu({ tracking }: { tracking: string }) {
  const { lang, setLanguage } = useLanguageStore();
  const [open, setOpen] = useState(false);
  const wrap = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (wrap.current && !wrap.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  return (
    <div className="relative" ref={wrap}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={LANGUAGE_LABELS[lang]}
        className={`px-2.5 sm:px-3 py-1.5 rounded-lg flex items-center gap-1.5 text-[11px] font-semibold border border-line bg-raised text-ink-soft hover:text-ink hover:bg-overlay transition-colors ${tracking}`}
      >
        <Languages className="w-3.5 h-3.5" />
        <span className="hidden sm:inline">{LANGUAGE_LABELS[lang]}</span>
        <span className="sm:hidden">{lang.toUpperCase()}</span>
        <ChevronDown className="w-3 h-3" />
      </button>

      {open && (
        <div
          role="menu"
          className="absolute top-full end-0 mt-2 w-40 bg-raised border border-line rounded-xl overflow-hidden z-50 shadow-[var(--shadow-elevated)]"
        >
          {LANGS.map((l) => (
            <button
              key={l}
              type="button"
              role="menuitemradio"
              aria-checked={l === lang}
              onClick={() => { setLanguage(l); setOpen(false); }}
              className={`w-full text-start px-4 py-2 text-[12px] hover:bg-overlay transition-colors ${
                l === lang ? 'text-accent font-bold' : 'text-ink'
              }`}
            >
              {LANGUAGE_LABELS[l]}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/**
 * Rotating worked examples. Slides are stacked in one grid cell rather than absolutely
 * positioned, so the card is always as tall as the longest slide and nothing reflows when
 * it advances — the Sinhala and Tamil answers run considerably longer than the English.
 */
function DemoSlider({ copy, motion, tracking }: { copy: LandingCopy; motion: boolean; tracking: string }) {
  const items = copy.demo.items;
  const [index, setIndex] = useState(0);
  const [paused, setPaused] = useState(false);
  const tabHidden = useTabHidden();

  const running = motion && !paused && !tabHidden;

  // `index` is a dependency on purpose: picking a dot restarts the countdown rather than
  // leaving the new slide to inherit whatever was left of the previous one.
  useEffect(() => {
    if (!running) return;
    const id = window.setTimeout(() => setIndex((i) => (i + 1) % items.length), 5000);
    return () => window.clearTimeout(id);
  }, [running, index, items.length]);

  return (
    <div
      className="glass rounded-2xl p-5 sm:p-6 shadow-[var(--shadow-elevated)]"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onFocus={() => setPaused(true)}
      onBlur={() => setPaused(false)}
      aria-roledescription="carousel"
    >
      <div className="grid">
        {items.map((item, i) => {
          const active = i === index;
          return (
            <div
              key={i}
              aria-hidden={!active}
              className={`col-start-1 row-start-1 ${active ? '' : 'pointer-events-none'}`}
              style={{
                opacity: active ? 1 : 0,
                transform: motion && !active ? 'translate3d(0,12px,0)' : 'translate3d(0,0,0)',
                transition: motion
                  ? `opacity 500ms ${EASE}, transform 500ms ${EASE}`
                  : undefined,
              }}
            >
              <div className="flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-[var(--color-palm-500)] shrink-0" />
                <span className={`text-[10px] font-black uppercase text-accent ${tracking}`}>
                  {item.subject}
                </span>
              </div>

              <div className="mt-4 flex justify-end">
                <p className="max-w-[90%] rounded-2xl bg-select border border-select-line px-4 py-2.5 text-sm text-ink text-start">
                  {item.question}
                </p>
              </div>

              <div className="mt-3 rounded-2xl bg-raised border border-line-soft px-4 py-3">
                <p className="text-sm text-ink-soft leading-relaxed text-start">{item.answer}</p>

                {/* The unanswerable slide is the product working, so its citation is toned
                    down rather than reddened — amber reads as "noted", not "failed". */}
                <div className="mt-3">
                  {item.ungrounded ? (
                    <span className="inline-flex items-start gap-1.5 rounded-lg border border-dashed border-amber-600/40 bg-amber-500/10 px-2 py-1 text-[10px] font-bold text-amber-700 dark:text-amber-400 text-start">
                      <FileQuestion className="w-3 h-3 mt-px shrink-0" />
                      {item.source}
                    </span>
                  ) : (
                    <span className="inline-flex items-start gap-1.5 rounded-lg border border-select-line bg-select px-2 py-1 text-[10px] font-bold text-accent text-start">
                      <FileText className="w-3 h-3 mt-px shrink-0" />
                      {item.source}
                    </span>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      <div className="mt-5 flex items-center justify-center gap-1.5">
        {items.map((item, i) => (
          <button
            key={i}
            type="button"
            onClick={() => setIndex(i)}
            aria-label={item.subject}
            aria-current={i === index}
            className="group h-6 px-1 flex items-center focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-palm-500)] rounded-full"
          >
            <span
              className={`block h-1.5 rounded-full transition-all duration-300 ${
                i === index
                  ? 'w-6 bg-[var(--color-palm-600)]'
                  : 'w-1.5 bg-line-strong group-hover:bg-ink-faint'
              }`}
            />
          </button>
        ))}
      </div>
    </div>
  );
}

export default function Landing() {
  const { lang } = useLanguageStore();
  const copy = landingCopy[lang];
  const isRtl = lang === 'ar';

  const reduced = usePrefersReducedMotion();
  const motion = !reduced;

  useSmoothScroll(motion);
  const blobA = useParallax<HTMLDivElement>(0.24, motion);
  const blobB = useParallax<HTMLDivElement>(0.12, motion);

  // Letter-spacing breaks the cursive joins in Arabic, so the tracked micro-labels lose it.
  const tracking = isRtl ? '' : 'tracking-widest';
  const Arrow = isRtl ? ArrowLeft : ArrowRight;

  return (
    <div className="min-h-screen text-ink">
      {/* ── Header ── */}
      <header className="sticky top-0 z-50 border-b border-line-soft bg-surface/85 backdrop-blur-xl">
        <div className="mx-auto max-w-6xl px-4 sm:px-6 h-16 flex items-center justify-between gap-2 sm:gap-3">
          <Link to="/" aria-label="EduAI" className="flex items-center shrink-0">
            <Wordmark />
          </Link>

          <div className="flex items-center gap-1 sm:gap-2">
            <LanguageMenu tracking={tracking} />
            <ThemeToggle />
            <Link
              to="/login"
              className="hidden sm:block px-3 py-2 rounded-lg text-sm font-bold text-ink-soft hover:text-ink hover:bg-overlay transition-colors"
            >
              {copy.nav.login}
            </Link>
            <Link to="/signup" className={`${PRIMARY_BTN} px-3 sm:px-4 py-2 text-xs sm:text-sm`}>
              {copy.nav.startTrial}
            </Link>
          </div>
        </div>
      </header>

      <main>
        {/* ── Hero ── */}
        <section className="relative mx-auto max-w-6xl px-4 sm:px-6 pt-14 pb-16 sm:pt-20 sm:pb-24">
          {/* Decorative depth layers. Clipped by the wrapper so the offsets can never open a
              horizontal scrollbar, and inert to the pointer so they cannot eat clicks. */}
          <div aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden">
            <div
              ref={blobA}
              className="absolute -top-32 start-[-8rem] w-[26rem] h-[26rem] rounded-full blur-3xl opacity-25 bg-[radial-gradient(circle,var(--color-palm-400),transparent_65%)]"
            />
            <div
              ref={blobB}
              className="absolute top-48 end-[-10rem] w-[30rem] h-[30rem] rounded-full blur-3xl opacity-20 bg-[radial-gradient(circle,var(--color-palm-600),transparent_65%)]"
            />
          </div>

          <div className="relative grid lg:grid-cols-2 gap-12 lg:gap-16 items-center">
            <div className="animate-fade-in">
              <span className={`inline-flex items-center gap-2 rounded-full border border-select-line bg-select px-3 py-1.5 text-[11px] font-black uppercase text-accent ${tracking}`}>
                <Check className="w-3.5 h-3.5 shrink-0" />
                {copy.hero.badge}
              </span>

              <h1 className="mt-6 text-4xl sm:text-5xl lg:text-[3.4rem] font-bold leading-[1.14] tracking-tight">
                {copy.hero.title}{' '}
                <span className="text-accent">{copy.hero.titleAccent}</span>
              </h1>

              <p className="mt-6 text-base sm:text-lg text-ink-soft leading-relaxed max-w-xl">
                {copy.hero.subtitle}
              </p>

              <div className="mt-8 flex flex-col sm:flex-row gap-3">
                <Link to="/signup" className={`${PRIMARY_BTN} px-6 py-3.5 text-sm`}>
                  {copy.hero.ctaPrimary} <Arrow className="w-4 h-4 shrink-0" />
                </Link>
                <Link to="/login" className={`${SECONDARY_BTN} px-6 py-3.5 text-sm`}>
                  {copy.hero.ctaSecondary}
                </Link>
              </div>

              <p className="mt-5 text-xs text-ink-mute">{copy.hero.noCard}</p>
            </div>

            <div className="animate-fade-in">
              <h2 className="text-lg sm:text-xl font-bold tracking-tight">{copy.demo.heading}</h2>
              <p className="mt-1.5 mb-4 text-sm text-ink-mute">{copy.demo.sub}</p>
              <DemoSlider copy={copy} motion={motion} tracking={tracking} />
            </div>
          </div>
        </section>

        {/* ── Features ── */}
        <section className="mx-auto max-w-6xl px-4 sm:px-6 py-16 sm:py-20">
          <Reveal motion={motion}>
            <div className="max-w-2xl">
              <h2 className="text-2xl sm:text-3xl font-bold tracking-tight">
                {copy.features.heading}
              </h2>
              <p className="mt-3 text-ink-soft">{copy.features.sub}</p>
            </div>
          </Reveal>

          <div className="mt-10 grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {copy.features.items.map(({ title, body }, i) => {
              const Icon = FEATURE_ICONS[i] ?? FileText;
              return (
                <Reveal key={title} motion={motion} delay={i * 60} className="h-full">
                  <div className="glass h-full rounded-2xl p-5 sm:p-6 hover:border-select-line transition-colors">
                    <div className="w-10 h-10 rounded-xl bg-select border border-select-line flex items-center justify-center">
                      <Icon className="w-[18px] h-[18px] text-accent" />
                    </div>
                    <h3 className="mt-4 text-base font-bold text-ink">{title}</h3>
                    <p className="mt-2 text-sm text-ink-mute leading-relaxed">{body}</p>
                  </div>
                </Reveal>
              );
            })}
          </div>

          {/* Product names only — there is no translated copy for this strip, and inventing
              English sentences here would undercut a page that is otherwise fully localised. */}
          <Reveal motion={motion} delay={120}>
            <div className="mt-4 grid grid-cols-2 gap-4 sm:max-w-md">
              {[{ icon: MessageCircle, label: 'WhatsApp' }, { icon: BookOpen, label: 'Moodle' }].map(
                ({ icon: Icon, label }) => (
                  <div
                    key={label}
                    className="flex items-center gap-3 rounded-2xl border border-line-soft bg-raised px-5 py-4"
                  >
                    <Icon className="w-4 h-4 text-accent shrink-0" />
                    <p className="text-sm font-bold text-ink">{label}</p>
                  </div>
                )
              )}
            </div>
          </Reveal>
        </section>

        {/* ── How it works ── */}
        <section className="mx-auto max-w-6xl px-4 sm:px-6 py-16 sm:py-20">
          <Reveal motion={motion}>
            <h2 className="text-2xl sm:text-3xl font-bold tracking-tight text-center">
              {copy.how.heading}
            </h2>
          </Reveal>

          <div className="mt-12 grid md:grid-cols-3 gap-6 md:gap-8">
            {copy.how.steps.map(({ title, body }, i) => {
              const Icon = STEP_ICONS[i] ?? Users;
              return (
                <Reveal key={title} motion={motion} delay={i * 90}>
                  <div className="flex items-center gap-3">
                    <span className="w-9 h-9 shrink-0 rounded-xl bg-[var(--color-palm-700)] text-white text-sm font-black flex items-center justify-center">
                      {i + 1}
                    </span>
                    <Icon className="w-4 h-4 text-ink-faint" />
                  </div>
                  <h3 className="mt-4 text-lg font-bold text-ink">{title}</h3>
                  <p className="mt-2 text-sm text-ink-mute leading-relaxed">{body}</p>
                </Reveal>
              );
            })}
          </div>
        </section>

        {/* ── Closing CTA ── */}
        <section className="mx-auto max-w-6xl px-4 sm:px-6 pt-6 pb-20">
          <Reveal motion={motion}>
            <div className="glass rounded-3xl px-6 py-12 sm:px-12 sm:py-16 text-center shadow-[var(--shadow-elevated)]">
              <h2 className="text-2xl sm:text-4xl font-bold tracking-tight max-w-2xl mx-auto leading-tight">
                {copy.closing.title}
              </h2>
              <p className="mt-4 text-ink-soft max-w-lg mx-auto">{copy.closing.body}</p>
              <div className="mt-8 flex flex-col sm:flex-row gap-3 justify-center">
                <Link to="/signup" className={`${PRIMARY_BTN} px-7 py-3.5 text-sm`}>
                  {copy.closing.cta} <Arrow className="w-4 h-4 shrink-0" />
                </Link>
                <Link to="/login" className={`${SECONDARY_BTN} px-7 py-3.5 text-sm`}>
                  {copy.nav.login}
                </Link>
              </div>
              <p className={`mt-5 text-xs font-bold uppercase text-ink-mute ${tracking}`}>
                {copy.hero.badge}
              </p>
            </div>
          </Reveal>
        </section>
      </main>

      {/* ── Footer ── */}
      <footer className="border-t border-line-soft">
        <div className="mx-auto max-w-6xl px-4 sm:px-6 py-8 flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex flex-col items-center sm:items-start gap-1">
            <Wordmark size="0.85rem" />
            <p className="text-xs text-ink-mute text-center sm:text-start max-w-xs">
              {copy.footer}
            </p>
          </div>
          <div className="flex items-center gap-5 text-sm">
            <Link to="/login" className="text-ink-mute hover:text-ink transition-colors">
              {copy.nav.login}
            </Link>
            <Link to="/signup" className="text-ink-mute hover:text-ink transition-colors">
              {copy.nav.startTrial}
            </Link>
          </div>
          <p className="text-xs text-ink-faint">
            © {new Date().getFullYear()} KIADP AI Knowledge Platform
          </p>
        </div>
      </footer>
    </div>
  );
}
