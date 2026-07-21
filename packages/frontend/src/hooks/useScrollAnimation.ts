import { useEffect, useRef, useState } from 'react';
import Lenis from 'lenis';

/**
 * Scroll-motion primitives for the marketing page.
 *
 * Every hook here takes an `enabled` flag rather than reading the motion preference itself.
 * The page resolves the preference once and threads it through, so a single `false` disables
 * smooth scrolling, parallax and reveals together — there is no path where one of them keeps
 * running because a hook forgot to check.
 */

const REDUCED_MOTION = '(prefers-reduced-motion: reduce)';

export function usePrefersReducedMotion(): boolean {
  const [reduced, setReduced] = useState(() => window.matchMedia(REDUCED_MOTION).matches);

  useEffect(() => {
    const query = window.matchMedia(REDUCED_MOTION);
    const onChange = (e: MediaQueryListEvent) => setReduced(e.matches);
    query.addEventListener('change', onChange);
    return () => query.removeEventListener('change', onChange);
  }, []);

  return reduced;
}

/**
 * Inertial scrolling for as long as the calling component is mounted.
 *
 * `autoRaf` is off and the loop is owned here: Lenis' own loop is only stopped by `destroy()`,
 * and this page unmounts on login. A frame loop that outlived it would keep intercepting wheel
 * events on the dashboard.
 */
export function useSmoothScroll(enabled: boolean): void {
  useEffect(() => {
    if (!enabled) return;

    const lenis = new Lenis({ duration: 1.05, autoRaf: false });
    let frame = requestAnimationFrame(function loop(time: number) {
      lenis.raf(time);
      frame = requestAnimationFrame(loop);
    });

    return () => {
      cancelAnimationFrame(frame);
      lenis.destroy();
    };
  }, [enabled]);
}

/**
 * Reveals its element once, the first time it crosses into view, then stops observing.
 * Re-animating on every scroll past is noise, not polish.
 */
export function useReveal<T extends HTMLElement>(enabled: boolean) {
  const ref = useRef<T>(null);
  const [revealed, setRevealed] = useState(!enabled);

  useEffect(() => {
    if (!enabled) {
      setRevealed(true);
      return;
    }
    const el = ref.current;
    if (!el) return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (!entry.isIntersecting) return;
        setRevealed(true);
        observer.disconnect();
      },
      // Fires a little before the edge so the element is settled by the time it is readable.
      { threshold: 0.1, rootMargin: '0px 0px -8% 0px' }
    );

    observer.observe(el);
    return () => observer.disconnect();
  }, [enabled]);

  return { ref, revealed };
}

/**
 * Translates an element vertically at a fraction of the scroll distance.
 * `speed` is a multiplier: 0.2 means the layer travels 20% as far as the page.
 */
export function useParallax<T extends HTMLElement>(speed: number, enabled: boolean) {
  const ref = useRef<T>(null);

  useEffect(() => {
    if (!enabled) return;
    const el = ref.current;
    if (!el) return;

    let frame = 0;
    let queued = false;

    const apply = () => {
      queued = false;
      // translate3d only — animating `top` would relayout the section on every frame.
      el.style.transform = `translate3d(0, ${(window.scrollY * speed).toFixed(2)}px, 0)`;
    };

    const onScroll = () => {
      if (queued) return;
      queued = true;
      frame = requestAnimationFrame(apply);
    };

    apply();
    window.addEventListener('scroll', onScroll, { passive: true });

    return () => {
      window.removeEventListener('scroll', onScroll);
      cancelAnimationFrame(frame);
      el.style.transform = '';
    };
  }, [speed, enabled]);

  return ref;
}

/** True while the tab is backgrounded. Used to stop the demo slider advancing unseen. */
export function useTabHidden(): boolean {
  const [hidden, setHidden] = useState(() => document.visibilityState === 'hidden');

  useEffect(() => {
    const onChange = () => setHidden(document.visibilityState === 'hidden');
    document.addEventListener('visibilitychange', onChange);
    return () => document.removeEventListener('visibilitychange', onChange);
  }, []);

  return hidden;
}
