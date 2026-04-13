import { useQuery } from '@tanstack/react-query';
import apiClient from '../../api/client';
import { FileText, Database, HelpCircle, Users, Activity, CheckCircle2, AlertCircle } from 'lucide-react';
import { useLanguageStore } from '../../store/languageStore';
import { translations } from '../../i18n/translations';
import ApiStatus from './ApiStatus';
import QuestionSummaryCards from './QuestionSummaryCards';

interface DashboardStats {
  totalDocuments: number;
  totalChunks: number;
  totalQuestions: number;
  activeUsers: number;
  recentActivity: Array<{
    id: string;
    title: string;
    status: string;
    createdAt: string;
  }>;
  systemStatus: {
    database: string;
    pinecone: string;
    openai: string;
  };
}

export default function Dashboard() {
  const { lang } = useLanguageStore();
  const t = translations[lang];

  const { data: stats, isLoading, error } = useQuery<DashboardStats>({
    queryKey: ['admin-stats'],
    queryFn: async () => {
      const { data } = await apiClient.get('/admin/stats');
      return data.data;
    },
    refetchInterval: 10000,
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="w-8 h-8 border-4 border-emerald-500 border-t-transparent rounded-full animate-spin"></div>
      </div>
    );
  }

  if (error || !stats) {
    return (
      <div className="p-6 bg-red-500/10 border border-red-500/50 rounded-xl text-red-200 flex items-center gap-3">
        <AlertCircle className="w-5 h-5" />
        <p>Failed to load dashboard statistics.</p>
      </div>
    );
  }

  const statCards = [
    { name: t.totalDocuments, value: stats.totalDocuments, icon: FileText, trend: 'up' },
    { name: t.knowledgeChunks, value: stats.totalChunks.toLocaleString(), icon: Database, trend: 'up' },
    { name: t.questionsAnswered, value: stats.totalQuestions.toLocaleString(), icon: HelpCircle, trend: 'up' },
    { name: t.activeUsers, value: stats.activeUsers, icon: Users, trend: 'up' },
  ];

  return (
    <div className="animate-fade-in max-w-7xl mx-auto space-y-8">
      <div>
        <h1 className="text-4xl font-black text-white tracking-tight uppercase" style={{ fontFamily: 'var(--font-heading)' }}>{t.overview}</h1>
        <p className="text-[var(--color-secondary)] mt-2 font-medium">{t.dashboardDescription}</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        {statCards.map((stat) => (
          <div key={stat.name} className="glass rounded-[1.5rem] p-8 relative overflow-hidden group hover:border-emerald-500/30 transition-all duration-300">
            {/* LTR: Right, RTL: Left */}
            <div className="absolute top-0 ltr:right-0 rtl:left-0 p-6 opacity-10 group-hover:opacity-20 transition-opacity">
              <stat.icon className="w-14 h-14 text-emerald-400" />
            </div>
            <p className="text-[10px] font-black uppercase tracking-widest text-[var(--color-secondary)] mb-2">{stat.name}</p>
            <p className="text-4xl font-black text-white tracking-tighter" style={{ fontFamily: 'var(--font-heading)' }}>{stat.value}</p>
            <div className="flex items-center gap-1.5 mt-6 text-[10px] font-bold text-emerald-400/60 uppercase tracking-widest">
              <Activity className="w-3.5 h-3.5" />
              <span>{t.liveTracking}</span>
            </div>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Recent Activity Table */}
        <div className="lg:col-span-2 glass rounded-[2rem] p-8 border border-white/5">
          <h2 className="text-xl font-black text-white mb-8 flex items-center gap-3 uppercase tracking-tight">
            <div className="w-10 h-10 rounded-xl bg-emerald-500/20 flex items-center justify-center border border-emerald-500/20 shadow-lg shadow-emerald-500/10">
              <Activity className="w-5 h-5 text-emerald-400" />
            </div>
            {t.recentActivity}
          </h2>
          <div className="overflow-x-auto">
            <table className="w-full text-left rtl:text-right">
              <thead>
                <tr className="text-[10px] uppercase font-black tracking-widest text-[var(--color-secondary)] border-b border-white/5">
                  <th className="pb-4 px-2">{t.document}</th>
                  <th className="pb-4 px-2">{t.status}</th>
                  <th className="pb-4 px-2 text-right rtl:text-left">{t.createdAt}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {stats.recentActivity.map((activity) => (
                  <tr key={activity.id} className="group">
                    <td className="py-6 px-2 text-sm text-white font-bold truncate max-w-[200px]">
                      {activity.title}
                    </td>
                    <td className="py-6 px-2">
                       <span className={`px-2.5 py-1 rounded-lg text-[10px] font-black tracking-widest uppercase border ${
                        activity.status === 'COMPLETED' ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' :
                        activity.status === 'FAILED' ? 'bg-red-500/10 text-red-400 border-red-500/20' :
                        'bg-amber-500/10 text-amber-400 border-amber-500/20'
                      }`}>
                        {t[activity.status.toLowerCase() as keyof typeof t] || activity.status}
                      </span>
                    </td>
                    <td className="py-6 px-2 text-[10px] font-bold text-[var(--color-secondary)] text-right rtl:text-left">
                      {new Date(activity.createdAt).toLocaleDateString(lang === 'ar' ? 'ar-EG' : 'en-US')}
                    </td>
                  </tr>
                ))}
                {stats.recentActivity.length === 0 && (
                  <tr>
                    <td colSpan={3} className="py-12 text-center text-[var(--color-secondary)] italic font-medium">
                      {t.noActivity}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* System Health */}
        <div className="glass rounded-[2rem] p-8 border border-white/5 bg-black/20">
          <h2 className="text-xl font-black text-white mb-8 flex items-center gap-3 uppercase tracking-tight">
            <div className="w-10 h-10 rounded-xl bg-emerald-500/20 flex items-center justify-center border border-emerald-500/20 shadow-lg shadow-emerald-500/10">
              <CheckCircle2 className="w-5 h-5 text-emerald-400" />
            </div>
            {t.systemHealth}
          </h2>
          <div className="space-y-6 mt-4">
            <div className="flex justify-between items-center bg-white/[0.03] p-4 rounded-2xl border border-white/5 hover:bg-white/[0.05] transition-colors">
              <div>
                <p className="text-sm font-bold text-white">{t.dbTitle}</p>
                <p className="text-[10px] font-bold text-[var(--color-secondary)] uppercase tracking-tight">{t.mainRecordsHub}</p>
              </div>
              <span className="flex items-center gap-2 text-[10px] font-black text-emerald-400 uppercase tracking-widest">
                <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse-glow" /> 
                {t[stats.systemStatus.database.toLowerCase() as keyof typeof t] || stats.systemStatus.database}
              </span>
            </div>
            <div className="flex justify-between items-center bg-white/[0.03] p-4 rounded-2xl border border-white/5 hover:bg-white/[0.05] transition-colors">
              <div>
                <p className="text-sm font-bold text-white">{t.vectorDbTitle}</p>
                <p className="text-[10px] font-bold text-[var(--color-secondary)] uppercase tracking-tight">{t.vectorIndex}</p>
              </div>
              <span className="flex items-center gap-2 text-[10px] font-black text-emerald-400 uppercase tracking-widest">
                <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse-glow" /> 
                {t[stats.systemStatus.pinecone.toLowerCase() as keyof typeof t] || stats.systemStatus.pinecone}
              </span>
            </div>
            <div className="flex justify-between items-center bg-white/[0.03] p-4 rounded-2xl border border-white/5 hover:bg-white/[0.05] transition-colors">
              <div>
                <p className="text-sm font-bold text-white">{t.aiEngineTitle}</p>
                <p className="text-[10px] font-bold text-[var(--color-secondary)] uppercase tracking-tight">{t.llmSystems}</p>
              </div>
              <span className="flex items-center gap-2 text-[10px] font-black text-emerald-400 uppercase tracking-widest">
                <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse-glow" /> 
                {t[stats.systemStatus.openai.toLowerCase() as keyof typeof t] || stats.systemStatus.openai}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Question Analytics summary (click to go full page) */}
      <QuestionSummaryCards />
      <ApiStatus />
    </div>
  );
}
