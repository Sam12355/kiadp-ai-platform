import { useThemeStore } from '../store/themeStore';

/**
 * Light/dark switch. Shows the icon of the theme you would get by clicking, which is the
 * convention users read fastest — a sun means "click for light", not "you are in light".
 */
export default function ThemeToggle({ className = '' }: { className?: string }) {
  const theme = useThemeStore((s) => s.theme);
  const toggleTheme = useThemeStore((s) => s.toggleTheme);
  const goingDark = theme === 'light';

  return (
    <button
      type="button"
      onClick={toggleTheme}
      title={goingDark ? 'Switch to dark theme' : 'Switch to light theme'}
      aria-label={goingDark ? 'Switch to dark theme' : 'Switch to light theme'}
      className={`p-2 rounded-lg text-ink-mute hover:text-ink hover:bg-overlay transition-colors ${className}`}
    >
      {goingDark ? (
        // Moon
        <svg className="w-[18px] h-[18px]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
        </svg>
      ) : (
        // Sun
        <svg className="w-[18px] h-[18px]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="12" cy="12" r="4" />
          <path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41" />
        </svg>
      )}
    </button>
  );
}
