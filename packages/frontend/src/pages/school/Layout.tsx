import { useState, useEffect } from 'react';
import { Outlet, useNavigate, useLocation, Link } from 'react-router-dom';
import { useAuthStore } from '../../store/authStore';
import { useQuery } from '@tanstack/react-query';
import apiClient from '../../api/client';
import BubblesBackground from '../../components/BubblesBackground';
import { LayoutDashboard, FileText, Users, LogOut, Menu, X, Key, Settings, BarChart3 } from 'lucide-react';
import { useLanguageStore } from '../../store/languageStore';
import { translations } from '../../i18n/translations';
import ThemeToggle from '../../components/ThemeToggle';
import { useImpersonationStore } from '../../store/impersonationStore';
import { TrialExpiredScreen, TrialBanner, useTrialLock } from '../../components/TrialState';

interface TenantInfo {
  id: string;
  name: string;
  logoUrl: string | null;
  plan?: string | null;
  trialEndsAt?: string | null;
}

export default function SchoolLayout() {
  const { user, isAuthenticated, logout } = useAuthStore();
  // A super admin using "view as" has no tenant of their own; the institution they are
  // viewing is the one this panel should show and guard against.
  const impersonatedTenantId = useImpersonationStore((s) => s.tenantId);
  const activeTenantId = impersonatedTenantId ?? user?.tenantId ?? null;
  const { lang } = useLanguageStore();
  const t = translations[lang];
  const navigate = useNavigate();
  const location = useLocation();
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);

  const { data: tenant } = useQuery<TenantInfo>({
    queryKey: ['school-tenant', activeTenantId],
    queryFn: async () => (await apiClient.get(`/tenants/${activeTenantId}`)).data.data,
    enabled: !!activeTenantId,
  });

  // `tenant` is the institution this panel is showing — the impersonated one under
  // "view as", the admin's own otherwise.
  const locked = useTrialLock(tenant ? { plan: tenant.plan, trialEndsAt: tenant.trialEndsAt } : undefined);


  useEffect(() => {
    document.documentElement.dir = lang === 'ar' ? 'rtl' : 'ltr';
  }, [lang]);

  useEffect(() => {
    if (!isAuthenticated || user?.role !== 'ADMIN' || !activeTenantId) {
      navigate('/login');
    }
  }, [isAuthenticated, user, activeTenantId, navigate]);

  useEffect(() => {
    setIsSidebarOpen(false);
  }, [location.pathname]);

  if (!isAuthenticated || user?.role !== 'ADMIN' || !activeTenantId) return null;

  // The backend already refuses the work; this is the same decision made visible, so the
  // panel explains itself instead of failing request by request.
  if (locked) return <TrialExpiredScreen />;

  const navigation = [
    { name: t.dashboard, href: '/school', icon: LayoutDashboard },
    { name: t.documentManagement, href: '/school/documents', icon: FileText },
    { name: t.userManagement, href: '/school/users', icon: Users },
    { name: 'Analytics', href: '/school/analytics', icon: BarChart3 },
    { name: 'API Keys', href: '/school/api-keys', icon: Key },
    { name: 'Profile & Settings', href: '/school/profile', icon: Settings },
  ];

  return (
    <div className="flex h-screen bg-transparent text-ink relative overflow-hidden font-body">
      <BubblesBackground />

      {/* Mobile Top Bar */}
      <div className="lg:hidden fixed top-0 left-0 right-0 h-16 bg-raised/80 backdrop-blur-3xl border-b border-line px-6 flex items-center justify-between z-40">
        <div className="flex items-center gap-3">
          {tenant?.logoUrl ? (
            <img src={tenant.logoUrl} alt={tenant.name} className="w-8 h-8 rounded-lg object-cover" />
          ) : (
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-blue-500 to-blue-700 flex items-center justify-center">
              <span className="text-white font-black text-sm">{tenant?.name?.charAt(0).toUpperCase() ?? 'S'}</span>
            </div>
          )}
          <span className="font-black text-sm uppercase tracking-widest text-ink leading-none truncate max-w-[180px]">{tenant?.name ?? 'School Portal'}</span>
        </div>
        <button
          onClick={() => setIsSidebarOpen(true)}
          className="p-2 rounded-xl bg-raised border border-line text-blue-700 dark:text-blue-400 cursor-pointer active:scale-95 transition-transform"
        >
          <Menu className="w-6 h-6" />
        </button>
      </div>

      {/* Sidebar Overlay */}
      {isSidebarOpen && (
        <div
          className="lg:hidden fixed inset-0 bg-scrim backdrop-blur-md z-[45] cursor-pointer animate-fade-in"
          onClick={() => setIsSidebarOpen(false)}
        />
      )}

      {/* Sidebar Drawer */}
      <aside className={`
        fixed inset-y-0 ltr:left-0 rtl:right-0 w-72 bg-raised/80 backdrop-blur-3xl border-line flex flex-col z-[50]
        transition-all duration-500 ease-in-out lg:relative lg:translate-x-0
        ${lang === 'ar' ? 'border-l' : 'border-r'}
        ${isSidebarOpen ? 'translate-x-0' : (lang === 'ar' ? 'translate-x-full' : '-translate-x-full')}
      `}>
        <div className="h-24 flex items-center justify-between px-8">
          <div className="flex items-center gap-4">
            <div className="relative group">
              {tenant?.logoUrl ? (
                <img src={tenant.logoUrl} alt={tenant.name}
                  className="w-12 h-12 rounded-2xl object-cover shadow-2xl group-hover:scale-105 transition-transform border border-line" />
              ) : (
                <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-blue-400 to-blue-800 flex items-center justify-center shadow-2xl group-hover:scale-105 transition-transform">
                  <span className="text-white font-black text-xl">{tenant?.name?.charAt(0).toUpperCase() ?? 'S'}</span>
                </div>
              )}
              <div className="absolute -inset-1 bg-blue-500/20 blur-xl opacity-0 group-hover:opacity-100 transition-opacity" />
            </div>
            <div className="flex flex-col min-w-0">
              <span className="font-black text-sm uppercase tracking-widest text-ink leading-none truncate max-w-[140px]">{tenant?.name ?? 'School'}</span>
              <span className="text-[10px] font-black text-blue-700 dark:text-blue-400 uppercase tracking-widest mt-1">Portal</span>
            </div>
          </div>
          <button
            onClick={() => setIsSidebarOpen(false)}
            className="lg:hidden p-2 text-ink-mute hover:text-ink cursor-pointer active:scale-90 transition-transform"
          >
            <X className="w-6 h-6" />
          </button>
        </div>

        <nav className="flex-1 px-4 py-8 space-y-2 overflow-y-auto min-h-0 custom-scrollbar">
          {navigation.map((item) => {
            const isActive = location.pathname === item.href;
            const Icon = item.icon;
            return (
              <Link
                key={item.name}
                to={item.href}
                className={`group flex items-center px-4 py-3.5 text-sm font-bold rounded-2xl transition-all cursor-pointer ${
                  isActive
                    // Blue rather than the brand-green bg-select: this panel is blue
                    // throughout (icons, avatar, role label), and a green selection behind
                    // a blue icon reads as a mistake rather than as a choice.
                    ? 'bg-blue-500/10 text-ink border border-blue-500/25'
                    : 'text-ink-mute hover:bg-overlay hover:text-ink'
                }`}
              >
                <Icon className={`w-5 h-5 ltr:mr-3 rtl:ml-3 transition-transform ${isActive ? 'scale-110 text-blue-700 dark:text-blue-400' : 'group-hover:scale-110'}`} />
                {item.name}
              </Link>
            );
          })}
        </nav>

        <div className="p-6 border-t border-line-soft bg-raised/80 space-y-4">
          <TrialBanner subject={tenant ? { plan: tenant.plan, trialEndsAt: tenant.trialEndsAt } : undefined} />
          <div className="flex items-center gap-3 px-3 py-3 bg-raised rounded-[1.5rem] border border-line-soft">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-blue-500 to-blue-700 flex items-center justify-center flex-shrink-0 text-white font-black shadow-lg overflow-hidden border border-line">
              {user?.avatarUrl ? (
                <img src={user.avatarUrl} alt={user.fullName} className="w-full h-full object-cover" />
              ) : (
                user?.fullName.charAt(0).toUpperCase()
              )}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-bold text-ink truncate leading-none mb-1">{user?.fullName}</p>
              <p className="text-[9px] text-blue-700 dark:text-blue-400/70 font-black uppercase tracking-widest truncate">Institution Admin</p>
            </div>
          </div>

          <div className="flex items-center justify-center">
            <ThemeToggle />
          </div>

          <button
            onClick={() => { logout(); navigate('/login'); }}
            className="w-full flex items-center justify-center gap-2 py-2 text-[10px] font-black uppercase tracking-widest text-ink-mute hover:text-red-600 transition-all group cursor-pointer"
          >
            <LogOut className="w-3.5 h-3.5 ltr:group-hover:translate-x-1 rtl:group-hover:-translate-x-1 transition-transform" />
            {t.signOut}
          </button>
        </div>
      </aside>

      {/* Main Content Area */}
      <main className="flex-1 flex flex-col min-w-0 overflow-hidden relative pt-16 lg:pt-0 z-10">
        <div className="flex-1 overflow-y-auto p-6 md:p-10 lg:p-16 relative z-10 custom-scrollbar animate-fade-in">
          <Outlet />
        </div>
      </main>
    </div>
  );
}
