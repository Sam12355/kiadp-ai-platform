import { useNavigate } from 'react-router-dom';
import { useImpersonationStore } from '../store/impersonationStore';

/**
 * Fixed bar shown whenever the platform owner is viewing one institution's data.
 *
 * Loud on purpose. The failure this prevents is forgetting: an admin who does not realise
 * they are inside a customer's account will read the numbers as platform-wide, and worse,
 * may create or delete records believing they are acting somewhere else. The exit is in
 * the banner itself so leaving never requires finding the page you came from.
 */
export default function ImpersonationBanner() {
  const { tenantId, tenantName, stop } = useImpersonationStore();
  const navigate = useNavigate();

  if (!tenantId) return null;

  return (
    <div className="fixed top-0 inset-x-0 z-[100] flex items-center justify-center gap-3 px-4 py-2 bg-amber-500 text-amber-950 text-[12px] font-semibold shadow-md">
      <svg className="w-4 h-4 flex-shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
        <circle cx="12" cy="12" r="3" />
      </svg>
      <span className="truncate">
        Viewing as <strong>{tenantName}</strong> — you are seeing this institution's data, not the platform's.
      </span>
      <button
        onClick={() => { stop(); navigate('/admin/institutions'); }}
        className="flex-shrink-0 px-3 py-1 rounded-lg bg-amber-950 text-amber-50 hover:bg-amber-900 transition-colors"
      >
        Exit
      </button>
    </div>
  );
}
