import { useState, useRef, useEffect, useLayoutEffect, useMemo, useId } from 'react';
import { Search, ChevronDown, Check } from 'lucide-react';
import { useLanguageStore } from '../store/languageStore';
import { translations } from '../i18n/translations';

interface Option {
  value: string;
  label: string;
}

interface SearchableSelectProps {
  options: Option[];
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  searchPlaceholder?: string;
}

export default function SearchableSelect({
  options,
  value,
  onChange,
  placeholder,
  searchPlaceholder,
}: SearchableSelectProps) {
  const { lang } = useLanguageStore();
  const t = translations[lang];
  const finalPlaceholder = placeholder || t.selectOption;
  const finalSearchPlaceholder = searchPlaceholder || t.searchLibrary;

  const [isOpen, setIsOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [activeIndex, setActiveIndex] = useState(-1);
  const [dropUp, setDropUp] = useState(false);

  const wrapperRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const listboxId = useId();

  const selectedOption = options.find((opt) => opt.value === value);

  const filteredOptions = useMemo(() => {
    const query = searchTerm.trim().toLowerCase();
    if (!query) return options;
    return options.filter(
      (opt) =>
        opt.label.toLowerCase().includes(query) || opt.value.toLowerCase().includes(query)
    );
  }, [options, searchTerm]);

  const reset = () => {
    setIsOpen(false);
    setSearchTerm('');
    setActiveIndex(-1);
  };

  const close = () => {
    reset();
    triggerRef.current?.focus();
  };

  const open = () => {
    // Flip the panel upwards when a downward one would be clipped — the field often sits
    // low on short or mobile viewports, where a clipped list is unusable.
    const rect = triggerRef.current?.getBoundingClientRect();
    if (rect) {
      const spaceBelow = window.innerHeight - rect.bottom;
      setDropUp(spaceBelow < 300 && rect.top > spaceBelow);
    }
    setSearchTerm('');
    setActiveIndex(options.findIndex((opt) => opt.value === value));
    setIsOpen(true);
  };

  const select = (next: string) => {
    onChange(next);
    reset();
    triggerRef.current?.focus();
  };

  useEffect(() => {
    if (!isOpen) return;
    // touchstart as well as mousedown: on touch devices a tap outside fires no mousedown
    // until after the tap completes, which leaves the panel open over the content beneath.
    const handlePointerDown = (event: MouseEvent | TouchEvent) => {
      if (wrapperRef.current && !wrapperRef.current.contains(event.target as Node)) {
        reset();
      }
    };
    document.addEventListener('mousedown', handlePointerDown);
    document.addEventListener('touchstart', handlePointerDown);
    return () => {
      document.removeEventListener('mousedown', handlePointerDown);
      document.removeEventListener('touchstart', handlePointerDown);
    };
  }, [isOpen]);

  useLayoutEffect(() => {
    if (!isOpen) return;
    // Only steal focus where there is a real pointer. On touch, focusing the field raises
    // the on-screen keyboard over the very list the user is trying to read.
    const finePointer =
      typeof window.matchMedia === 'function' && window.matchMedia('(pointer: fine)').matches;
    if (finePointer) inputRef.current?.focus();
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen || activeIndex < 0) return;
    listRef.current
      ?.querySelector<HTMLElement>(`[data-index="${activeIndex}"]`)
      ?.scrollIntoView({ block: 'nearest' });
  }, [activeIndex, isOpen]);

  const handleKeyDown = (event: React.KeyboardEvent) => {
    if (!isOpen) {
      if (event.key === 'ArrowDown' || event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        open();
      }
      return;
    }

    const count = filteredOptions.length;

    switch (event.key) {
      case 'ArrowDown':
        event.preventDefault();
        setActiveIndex((i) => (count === 0 ? -1 : (i + 1) % count));
        break;
      case 'ArrowUp':
        event.preventDefault();
        setActiveIndex((i) => (count === 0 ? -1 : i <= 0 ? count - 1 : i - 1));
        break;
      case 'Home':
        event.preventDefault();
        setActiveIndex(count === 0 ? -1 : 0);
        break;
      case 'End':
        event.preventDefault();
        setActiveIndex(count - 1);
        break;
      case 'Enter': {
        // Always swallowed: this control lives inside forms, where a stray Enter would
        // submit rather than choose.
        event.preventDefault();
        const option = filteredOptions[activeIndex];
        if (option) select(option.value);
        break;
      }
      case 'Escape':
        event.preventDefault();
        close();
        break;
      case 'Tab':
        reset();
        break;
    }
  };

  return (
    <div className="relative" ref={wrapperRef} onKeyDown={handleKeyDown}>
      <button
        ref={triggerRef}
        type="button"
        aria-haspopup="listbox"
        aria-expanded={isOpen}
        aria-controls={listboxId}
        onClick={() => (isOpen ? reset() : open())}
        className="w-full flex items-center justify-between gap-2 px-4 py-3 bg-raised border border-line rounded-xl text-sm font-medium text-ink text-start shadow-[var(--shadow-card)] transition-colors hover:border-line-strong focus:outline-none focus:border-[var(--color-palm-500)] focus:ring-1 focus:ring-[var(--color-palm-500)]"
      >
        <span className={`truncate ${selectedOption ? 'text-ink' : 'text-ink-faint'}`}>
          {selectedOption ? selectedOption.label : finalPlaceholder}
        </span>
        <ChevronDown
          className={`w-4 h-4 flex-none text-ink-mute transition-transform duration-200 ${isOpen ? 'rotate-180' : ''}`}
        />
      </button>

      {isOpen && (
        <div
          className={`absolute z-[1000] w-full rounded-xl border border-line-strong bg-raised shadow-[var(--shadow-elevated)] overflow-hidden animate-fade-in ${
            dropUp ? 'bottom-full mb-2' : 'top-full mt-2'
          }`}
        >
          <div className="p-2 border-b border-line-soft">
            <div className="relative">
              <Search className="pointer-events-none absolute ltr:left-3 rtl:right-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-ink-faint" />
              <input
                ref={inputRef}
                type="text"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder={finalSearchPlaceholder}
                aria-label={finalSearchPlaceholder}
                aria-controls={listboxId}
                aria-activedescendant={
                  activeIndex >= 0 ? `${listboxId}-opt-${activeIndex}` : undefined
                }
                className="w-full bg-overlay border border-line-soft rounded-lg py-2 ltr:pl-9 rtl:pr-9 ltr:pr-3 rtl:pl-3 text-sm text-ink placeholder:text-ink-faint transition-colors focus:outline-none focus:border-[var(--color-palm-500)]"
              />
            </div>
          </div>

          <div
            ref={listRef}
            id={listboxId}
            role="listbox"
            className="max-h-60 overflow-y-auto overscroll-contain p-1.5"
          >
            {filteredOptions.length === 0 ? (
              <div className="p-4 text-center text-xs text-ink-mute italic">{t.noMatches}</div>
            ) : (
              filteredOptions.map((opt, index) => {
                const isSelected = opt.value === value;
                const isActive = index === activeIndex;
                return (
                  <button
                    key={opt.value}
                    id={`${listboxId}-opt-${index}`}
                    data-index={index}
                    type="button"
                    role="option"
                    aria-selected={isSelected}
                    onClick={() => select(opt.value)}
                    onMouseEnter={() => setActiveIndex(index)}
                    className={`w-full flex items-center justify-between gap-2 px-3 py-3 rounded-lg text-sm text-start transition-colors ${
                      isSelected
                        ? 'bg-select text-emerald-700 dark:text-emerald-400 font-bold'
                        : isActive
                          ? 'bg-overlay text-ink'
                          : 'text-ink-soft'
                    }`}
                  >
                    <span className="truncate">{opt.label}</span>
                    {isSelected && <Check className="w-4 h-4 flex-none" />}
                  </button>
                );
              })
            )}
          </div>
        </div>
      )}
    </div>
  );
}
