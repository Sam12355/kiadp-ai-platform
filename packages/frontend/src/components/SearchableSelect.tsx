import { useState, useRef, useEffect } from 'react';
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
}

export default function SearchableSelect({ options, value, onChange, placeholder }: SearchableSelectProps) {
  const { lang } = useLanguageStore();
  const t = translations[lang];
  const finalPlaceholder = placeholder || t.selectOption;
  
  const [isOpen, setIsOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const wrapperRef = useRef<HTMLDivElement>(null);

  const selectedOption = options.find(opt => opt.value === value);

  const filteredOptions = options.filter(opt => 
    opt.label.toLowerCase().includes(searchTerm.toLowerCase()) ||
    opt.value.toLowerCase().includes(searchTerm.toLowerCase())
  );

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (wrapperRef.current && !wrapperRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  return (
    <div className="relative" ref={wrapperRef}>
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className="w-full px-5 py-4 bg-white/[0.03] border border-white/10 rounded-2xl focus:border-emerald-500/50 focus:outline-none text-white transition-all text-sm font-medium flex items-center justify-between shadow-inner"
      >
        <span className={selectedOption ? 'text-white' : 'text-gray-500'}>
          {selectedOption ? selectedOption.label : finalPlaceholder}
        </span>
        <ChevronDown className={`w-4 h-4 text-gray-500 transition-transform duration-300 ${isOpen ? 'rotate-180' : ''}`} />
      </button>

      {isOpen && (
        <div className="absolute z-[1000] mt-2 w-full glass rounded-2xl border border-white/10 shadow-2xl overflow-hidden animate-in fade-in slide-in-from-top-2 duration-200" style={{ background: 'rgba(20, 22, 25, 0.95)', backdropFilter: 'blur(30px)' }}>
          <div className="p-3 border-b border-white/5">
            <div className="relative">
              <Search className="absolute ltr:left-3 rtl:right-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-500" />
              <input
                autoFocus
                type="text"
                placeholder={t.searchLibrary}
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full bg-white/5 border border-white/5 rounded-xl py-2 ltr:pl-9 rtl:pr-9 ltr:pr-3 rtl:pl-3 text-xs focus:border-emerald-500/30 focus:outline-none text-white transition-all"
              />
            </div>
          </div>

          <div className="max-h-60 overflow-y-auto p-2 scrollbar-thin scrollbar-thumb-white/10">
            {filteredOptions.length === 0 ? (
              <div className="p-4 text-center text-xs text-gray-500 italic">{t.noMatches}</div>
            ) : (
              filteredOptions.map((opt) => (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => {
                    onChange(opt.value);
                    setIsOpen(false);
                    setSearchTerm('');
                  }}
                  className={`w-full flex items-center justify-between px-4 py-3 rounded-xl text-sm transition-all mb-1 ${
                    opt.value === value 
                      ? 'bg-emerald-500/10 text-emerald-400 font-bold' 
                      : 'text-gray-400 hover:bg-white/5 hover:text-white'
                  }`}
                >
                  {opt.label}
                  {opt.value === value && <Check className="w-4 h-4" />}
                </button>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}
