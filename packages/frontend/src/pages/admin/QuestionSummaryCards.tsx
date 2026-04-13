import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { MessageSquare, AlertTriangle, TrendingUp, Users, ArrowRight } from 'lucide-react';
import apiClient from '../../api/client';

interface Summary {
  totalQuestions: number;
  totalAnswered: number;
  knowledgeGaps: number;
  gapPercent: number;
}

export default function QuestionSummaryCards() {
  const { data, isLoading } = useQuery<Summary>({
    queryKey: ['admin-question-analytics-summary'],
    queryFn: async () => {
      const { data } = await apiClient.get('/admin/question-analytics');
      return (data.data as { summary: Summary }).summary;
    },
    refetchInterval: 60_000,
    staleTime: 30_000,
  });

  const cards = [
    {
      icon: MessageSquare, color: 'bg-purple-500/20 border-purple-500/20', iconColor: 'text-purple-400',
      label: 'Total Questions', value: data?.totalQuestions.toLocaleString() ?? '—',
    },
    {
      icon: TrendingUp, color: 'bg-emerald-500/20 border-emerald-500/20', iconColor: 'text-emerald-400',
      label: 'Answered by AI', value: data?.totalAnswered.toLocaleString() ?? '—',
    },
    {
      icon: AlertTriangle, color: 'bg-amber-500/20 border-amber-500/20', iconColor: 'text-amber-400',
      label: 'Knowledge Gaps', value: data?.knowledgeGaps.toLocaleString() ?? '—',
    },
    {
      icon: Users, color: 'bg-sky-500/20 border-sky-500/20', iconColor: 'text-sky-400',
      label: 'Gap Rate',
      value: data ? `${data.gapPercent}%` : '—',
      sub: data ? (data.gapPercent >= 20 ? 'High — review KB' : 'Healthy') : undefined,
      subColor: data ? (data.gapPercent >= 20 ? 'text-amber-400' : 'text-emerald-400') : undefined,
    },
  ];

  return (
    <div>
      {/* Section header with link */}
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-[10px] font-black uppercase tracking-widest text-[var(--color-secondary)] flex items-center gap-2">
          <MessageSquare className="w-3.5 h-3.5" />
          Question Analytics
        </h2>
        <Link
          to="/admin/questions"
          className="flex items-center gap-1.5 text-[10px] font-bold text-purple-400 hover:text-purple-300 transition-colors"
        >
          View full analytics <ArrowRight className="w-3 h-3" />
        </Link>
      </div>

      {isLoading ? (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="glass rounded-[1.5rem] p-6 border border-white/5 animate-pulse h-28" />
          ))}
        </div>
      ) : (
        <Link to="/admin/questions" className="block group">
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            {cards.map((card) => {
              const Icon = card.icon;
              return (
                <div
                  key={card.label}
                  className="glass rounded-[1.5rem] p-6 relative overflow-hidden border border-white/5 group-hover:border-white/10 transition-all duration-300"
                >
                  <div className="absolute top-0 ltr:right-0 rtl:left-0 p-5 opacity-10 group-hover:opacity-20 transition-opacity">
                    <Icon className={`w-12 h-12 ${card.iconColor}`} />
                  </div>
                  <div className={`w-8 h-8 rounded-lg ${card.color} flex items-center justify-center border mb-3`}>
                    <Icon className={`w-4 h-4 ${card.iconColor}`} />
                  </div>
                  <p className="text-[9px] font-black uppercase tracking-widest text-[var(--color-secondary)] mb-1">{card.label}</p>
                  <p className="text-3xl font-black text-white tracking-tighter" style={{ fontFamily: 'var(--font-heading)' }}>{card.value}</p>
                  {card.sub && (
                    <p className={`text-[10px] font-bold mt-1 ${card.subColor ?? 'text-[var(--color-secondary)]'}`}>{card.sub}</p>
                  )}
                </div>
              );
            })}
          </div>
        </Link>
      )}
    </div>
  );
}
