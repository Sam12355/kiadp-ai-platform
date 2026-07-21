import { Link } from 'react-router-dom';
import {
  ArrowRight, BarChart3, BookOpen, Check, FileText, Languages, Lock,
  MessageCircle, Mic, Quote, ShieldCheck, Upload, Users,
} from 'lucide-react';
import ThemeToggle from '../components/ThemeToggle';

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

const FEATURES = [
  {
    icon: FileText,
    title: 'Answers with page citations',
    body: 'Every answer names the document and the page it came from, so a student can open the source and check it for themselves.',
  },
  {
    icon: ShieldCheck,
    title: 'It says when it does not know',
    body: 'If your uploaded material does not cover the question, the assistant says so instead of filling the gap with something plausible.',
  },
  {
    icon: Quote,
    title: 'Verbatim when it matters',
    body: 'Ask for a definition or a clause "as it is" and you get the exact wording from the document — not a paraphrase of it.',
  },
  {
    icon: Mic,
    title: 'Voice mode',
    body: 'Students can ask out loud and hear the answer back — useful on a phone, between classes, or for revision on the move.',
  },
  {
    icon: Languages,
    title: 'English, Sinhala, Tamil, Arabic',
    body: 'The whole interface and the answers work in all four, with full right-to-left layout for Arabic.',
  },
  {
    icon: BarChart3,
    title: 'An admin panel that tells you something',
    body: 'Question volume, how much was answered from your own documents, which documents get used — and the questions your material could not answer.',
  },
];

const STEPS = [
  {
    icon: Users,
    title: 'Sign up',
    body: 'Create your institution account in under a minute. Seven days free, no card required.',
  },
  {
    icon: Upload,
    title: 'Upload your documents',
    body: 'Syllabi, lecture decks, handbooks, past papers. They are indexed and stay yours alone.',
  },
  {
    icon: BookOpen,
    title: 'Students ask questions',
    body: 'They get answers drawn from your material, with the source and page attached to each one.',
  },
];

function Wordmark({ size = '1.05rem' }: { size?: string }) {
  return (
    <span className="app-logo uppercase" style={{ fontSize: size }}>
      <span className="kiadp-text">Edu</span><span className="ai-highlight">AI</span>
    </span>
  );
}

export default function Landing() {
  return (
    <div className="min-h-screen text-ink">
      {/* ── Header ── */}
      <header className="sticky top-0 z-50 border-b border-line-soft bg-surface/85 backdrop-blur-xl">
        <div className="mx-auto max-w-6xl px-4 sm:px-6 h-16 flex items-center justify-between gap-3">
          <Link to="/" aria-label="EduAI home" className="flex items-center">
            <Wordmark />
          </Link>

          <div className="flex items-center gap-1 sm:gap-2">
            <ThemeToggle />
            <Link
              to="/login"
              className="px-3 py-2 rounded-lg text-sm font-bold text-ink-soft hover:text-ink hover:bg-overlay transition-colors"
            >
              Log in
            </Link>
            <Link to="/signup" className={`${PRIMARY_BTN} px-3 sm:px-4 py-2 text-xs sm:text-sm`}>
              <span className="hidden sm:inline">Start free trial</span>
              <span className="sm:hidden">Free trial</span>
            </Link>
          </div>
        </div>
      </header>

      <main>
        {/* ── Hero ── */}
        <section className="mx-auto max-w-6xl px-4 sm:px-6 pt-14 pb-16 sm:pt-20 sm:pb-24">
          <div className="grid lg:grid-cols-2 gap-12 lg:gap-16 items-center">
            <div className="animate-fade-in">
              <span className="inline-flex items-center gap-2 rounded-full border border-select-line bg-select px-3 py-1.5 text-[11px] font-black uppercase tracking-widest text-accent">
                <Check className="w-3.5 h-3.5" />
                7 days free · no card required
              </span>

              <h1 className="mt-6 text-4xl sm:text-5xl lg:text-[3.4rem] font-bold leading-[1.08] tracking-tight">
                An AI that only knows{' '}
                <span className="text-accent">your institution's</span> material.
              </h1>

              <p className="mt-6 text-base sm:text-lg text-ink-soft leading-relaxed max-w-xl">
                EduAI turns the documents you already have — syllabi, lecture decks,
                handbooks — into an assistant your students can question directly. Every
                answer is grounded in your material and cites the document and page it
                came from.
              </p>

              <div className="mt-8 flex flex-col sm:flex-row gap-3">
                <Link to="/signup" className={`${PRIMARY_BTN} px-6 py-3.5 text-sm`}>
                  Start free trial <ArrowRight className="w-4 h-4" />
                </Link>
                <Link to="/login" className={`${SECONDARY_BTN} px-6 py-3.5 text-sm`}>
                  Log in
                </Link>
              </div>

              <p className="mt-5 text-xs text-ink-mute">
                Built for schools, private institutes and universities in Sri Lanka.
              </p>
            </div>

            {/* A worked example carries the product better than an abstract graphic: it shows
                the citation and the refusal, which are the two things that make it different. */}
            <div className="glass rounded-2xl p-5 sm:p-6 shadow-[var(--shadow-elevated)]">
              <div className="flex items-center gap-2 pb-4 mb-4 border-b border-line-soft">
                <span className="w-2 h-2 rounded-full bg-[var(--color-palm-500)]" />
                <span className="text-[10px] font-black uppercase tracking-widest text-ink-mute">
                  Knowledge Assistant
                </span>
              </div>

              <div className="space-y-4">
                <div className="flex justify-end">
                  <p className="max-w-[85%] rounded-2xl bg-select border border-select-line px-4 py-2.5 text-sm text-ink">
                    What does the syllabus say about the practical assessment weighting?
                  </p>
                </div>

                <div className="rounded-2xl bg-raised border border-line-soft px-4 py-3">
                  <p className="text-sm text-ink-soft leading-relaxed">
                    The practical component carries 30% of the final grade, assessed across
                    the three lab modules in Term 2.
                  </p>
                  <div className="mt-3 flex flex-wrap gap-2">
                    <span className="inline-flex items-center gap-1.5 rounded-lg bg-overlay border border-line px-2 py-1 text-[10px] font-bold text-ink-mute">
                      <FileText className="w-3 h-3" />
                      Chemistry Syllabus 2026 · p. 47
                    </span>
                  </div>
                </div>

                <div className="flex justify-end">
                  <p className="max-w-[85%] rounded-2xl bg-select border border-select-line px-4 py-2.5 text-sm text-ink">
                    And the exam fee?
                  </p>
                </div>

                <div className="rounded-2xl border border-dashed border-line px-4 py-3">
                  <p className="text-sm text-ink-mute leading-relaxed italic">
                    That is not covered in the documents your institution has uploaded.
                  </p>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* ── Features ── */}
        <section className="mx-auto max-w-6xl px-4 sm:px-6 py-16 sm:py-20">
          <div className="max-w-2xl">
            <h2 className="text-2xl sm:text-3xl font-bold tracking-tight">
              Grounded, checkable, and honest about its limits
            </h2>
            <p className="mt-3 text-ink-soft">
              A general chatbot will answer anything. That is exactly the problem when a
              student is revising for an exam.
            </p>
          </div>

          <div className="mt-10 grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {FEATURES.map(({ icon: Icon, title, body }) => (
              <div
                key={title}
                className="glass rounded-2xl p-5 sm:p-6 hover:border-select-line transition-colors"
              >
                <div className="w-10 h-10 rounded-xl bg-select border border-select-line flex items-center justify-center">
                  <Icon className="w-[18px] h-[18px] text-accent" />
                </div>
                <h3 className="mt-4 text-base font-bold text-ink">{title}</h3>
                <p className="mt-2 text-sm text-ink-mute leading-relaxed">{body}</p>
              </div>
            ))}
          </div>

          <div className="mt-4 grid sm:grid-cols-3 gap-4">
            {[
              { icon: MessageCircle, label: 'WhatsApp', note: 'Students ask from the app they already use' },
              { icon: BookOpen, label: 'Moodle', note: 'Drops into the LMS you already run' },
              { icon: Lock, label: 'Tenant isolation', note: 'No institution can ever see another’s material' },
            ].map(({ icon: Icon, label, note }) => (
              <div
                key={label}
                className="flex items-start gap-3 rounded-2xl border border-line-soft bg-raised px-5 py-4"
              >
                <Icon className="w-4 h-4 mt-0.5 text-accent shrink-0" />
                <div>
                  <p className="text-sm font-bold text-ink">{label}</p>
                  <p className="text-xs text-ink-mute mt-0.5 leading-relaxed">{note}</p>
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* ── How it works ── */}
        <section className="mx-auto max-w-6xl px-4 sm:px-6 py-16 sm:py-20">
          <h2 className="text-2xl sm:text-3xl font-bold tracking-tight text-center">
            Running in an afternoon
          </h2>

          <div className="mt-12 grid md:grid-cols-3 gap-6 md:gap-8">
            {STEPS.map(({ icon: Icon, title, body }, i) => (
              <div key={title} className="relative">
                <div className="flex items-center gap-3">
                  <span className="w-9 h-9 shrink-0 rounded-xl bg-[var(--color-palm-700)] text-white text-sm font-black flex items-center justify-center">
                    {i + 1}
                  </span>
                  <Icon className="w-4 h-4 text-ink-faint" />
                </div>
                <h3 className="mt-4 text-lg font-bold text-ink">{title}</h3>
                <p className="mt-2 text-sm text-ink-mute leading-relaxed">{body}</p>
              </div>
            ))}
          </div>
        </section>

        {/* ── Closing CTA ── */}
        <section className="mx-auto max-w-6xl px-4 sm:px-6 pt-6 pb-20">
          <div className="glass rounded-3xl px-6 py-12 sm:px-12 sm:py-16 text-center shadow-[var(--shadow-elevated)]">
            <h2 className="text-2xl sm:text-4xl font-bold tracking-tight max-w-2xl mx-auto leading-tight">
              Try it with one of your own documents
            </h2>
            <p className="mt-4 text-ink-soft max-w-lg mx-auto">
              Upload a single syllabus and ask it something you already know the answer to.
              That is the fastest way to judge whether this is any good.
            </p>
            <div className="mt-8 flex flex-col sm:flex-row gap-3 justify-center">
              <Link to="/signup" className={`${PRIMARY_BTN} px-7 py-3.5 text-sm`}>
                Start free trial <ArrowRight className="w-4 h-4" />
              </Link>
              <Link to="/login" className={`${SECONDARY_BTN} px-7 py-3.5 text-sm`}>
                Log in
              </Link>
            </div>
            <p className="mt-5 text-xs font-bold uppercase tracking-widest text-ink-mute">
              7 days free · no card required
            </p>
          </div>
        </section>
      </main>

      {/* ── Footer ── */}
      <footer className="border-t border-line-soft">
        <div className="mx-auto max-w-6xl px-4 sm:px-6 py-8 flex flex-col sm:flex-row items-center justify-between gap-4">
          <Wordmark size="0.85rem" />
          <div className="flex items-center gap-5 text-sm">
            <Link to="/login" className="text-ink-mute hover:text-ink transition-colors">
              Log in
            </Link>
            <Link to="/signup" className="text-ink-mute hover:text-ink transition-colors">
              Start free trial
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
