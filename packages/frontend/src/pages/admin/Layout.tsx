import { useState, useEffect } from 'react';
import { Outlet, useNavigate, useLocation, Link } from 'react-router-dom';
import { useAuthStore } from '../../store/authStore';
import BubblesBackground from '../../components/BubblesBackground';
import { LayoutDashboard, FileText, Users, Settings as SettingsIcon, LogOut, Menu, X, BarChart2, BookOpen } from 'lucide-react';
import { useLanguageStore } from '../../store/languageStore';
import { translations } from '../../i18n/translations';

export default function AdminLayout() {
  const { user, isAuthenticated, logout } = useAuthStore();
  const { lang, setLanguage } = useLanguageStore();
  const t = translations[lang];
  const navigate = useNavigate();
  const location = useLocation();
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);

  // Apply language directionality
  useEffect(() => {
    document.documentElement.dir = lang === 'ar' ? 'rtl' : 'ltr';
  }, [lang]);

  useEffect(() => {
    if (!isAuthenticated || user?.role !== 'ADMIN') {
      navigate('/login');
    }
  }, [isAuthenticated, user, navigate]);

  // Close sidebar on mobile navigation
  useEffect(() => {
    setIsSidebarOpen(false);
  }, [location.pathname]);

  if (!isAuthenticated || user?.role !== 'ADMIN') return null;

  const navigation = [
    { name: t.dashboard, href: '/admin', icon: LayoutDashboard },
    { name: t.documentManagement, href: '/admin/documents', icon: FileText },
    { name: t.userManagement, href: '/admin/users', icon: Users },
    { name: t.questionAnalytics, href: '/admin/questions', icon: BarChart2 },
    { name: t.insertKnowledge, href: '/admin/insert-knowledge', icon: BookOpen },
    { name: t.settings, href: '/admin/settings', icon: SettingsIcon },
  ];

  return (
    <div className="flex h-screen bg-transparent text-white relative overflow-hidden font-body">
      <BubblesBackground />

      {/* Mobile Top Bar */}
      <div className="lg:hidden fixed top-0 left-0 right-0 h-16 bg-black/40 backdrop-blur-3xl border-b border-white/5 px-6 flex items-center justify-between z-40">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-emerald-500 to-emerald-700 flex items-center justify-center">
            <span className="text-white font-black text-sm">K</span>
          </div>
          <span className="font-black text-sm uppercase tracking-widest text-white leading-none">{t.adminPanel}</span>
        </div>
        <button 
          onClick={() => setIsSidebarOpen(true)}
          className="p-2 rounded-xl bg-white/5 border border-white/10 text-emerald-400 cursor-pointer active:scale-95 transition-transform"
        >
          <Menu className="w-6 h-6" />
        </button>
      </div>

      {/* Sidebar Overlay */}
      {isSidebarOpen && (
        <div 
          className="lg:hidden fixed inset-0 bg-black/60 backdrop-blur-md z-[45] cursor-pointer animate-fade-in"
          onClick={() => setIsSidebarOpen(false)}
        />
      )}

      {/* Sidebar Drawer */}
      <aside className={`
        fixed inset-y-0 ltr:left-0 rtl:right-0 w-72 bg-black/40 backdrop-blur-3xl border-white/5 flex flex-col z-[50]
        transition-all duration-500 ease-in-out lg:relative lg:translate-x-0
        ${lang === 'ar' ? 'border-l' : 'border-r'}
        ${isSidebarOpen ? 'translate-x-0' : (lang === 'ar' ? 'translate-x-full' : '-translate-x-full')}
      `}>
        <div className="h-24 flex items-center justify-between px-8">
          <div className="flex items-center gap-4">
            <div className="relative group">
              <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-emerald-400 to-emerald-800 flex items-center justify-center shadow-2xl group-hover:scale-105 transition-transform">
                <span className="text-white font-black text-xl">K</span>
              </div>
              <div className="absolute -inset-1 bg-emerald-500/20 blur-xl opacity-0 group-hover:opacity-100 transition-opacity" />
            </div>
            <div className="flex flex-col">
              <span className="tracking-tight uppercase leading-none whitespace-nowrap app-logo">
                <span className="kiadp-text">KIADP</span> <span className="ai-highlight">AI</span>
              </span>
              <span className="text-[10px] font-black text-emerald-400 uppercase tracking-widest mt-1">{t.adminPanel}</span>
            </div>
          </div>
          <button 
            onClick={() => setIsSidebarOpen(false)}
            className="lg:hidden p-2 text-gray-500 hover:text-white cursor-pointer active:scale-90 transition-transform"
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
                    ? 'bg-white/10 text-white shadow-lg shadow-white/5 border border-white/10'
                    : 'text-gray-400 hover:bg-white/5 hover:text-white'
                }`}
              >
                <Icon className={`w-5 h-5 ltr:mr-3 rtl:ml-3 transition-transform ${isActive ? 'scale-110 text-emerald-400' : 'group-hover:scale-110'}`} />
                {item.name}
              </Link>
            );
          })}
        </nav>

        <div className="p-6 border-t border-white/5 bg-black/20 space-y-6">
          <div className="flex items-center gap-3 px-3 py-3 bg-white/[0.03] rounded-[1.5rem] border border-white/5">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-emerald-500 to-emerald-700 flex items-center justify-center flex-shrink-0 text-white font-black shadow-lg overflow-hidden border border-white/10">
              {user?.avatarUrl ? (
                <img 
                  src={user.avatarUrl.startsWith('http') ? user.avatarUrl : `${user.avatarUrl}`} 
                  alt={user.fullName} 
                  className="w-full h-full object-cover"
                />
              ) : (
                user?.fullName.charAt(0).toUpperCase()
              )}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-bold text-white truncate leading-none mb-1">{user?.fullName}</p>
              <p className="text-[9px] text-emerald-500/60 font-black uppercase tracking-widest truncate">{t.systemRoot}</p>
            </div>
          </div>

          {/* Language Selector */}
          <div className="flex items-center justify-between px-2 bg-white/5 py-2 rounded-2xl border border-white/5">
            <button 
              onClick={() => setLanguage('en')}
              className={`flex-1 py-1.5 text-[10px] font-black uppercase tracking-widest transition-all rounded-xl ${lang === 'en' ? 'text-emerald-400 bg-white/10' : 'text-gray-500 hover:text-white'}`}
            >
              English
            </button>
            <button 
              onClick={() => setLanguage('ar')}
              className={`flex-1 py-1.5 text-[10px] font-black uppercase tracking-widest transition-all rounded-xl ${lang === 'ar' ? 'text-emerald-400 bg-white/10' : 'text-gray-500 hover:text-white'}`}
            >
              العربية
            </button>
          </div>

          <button
            onClick={() => {
              logout();
              navigate('/login');
            }}
            className="w-full flex items-center justify-center gap-2 py-2 text-[10px] font-black uppercase tracking-widest text-gray-500 hover:text-red-400 transition-all group cursor-pointer"
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
