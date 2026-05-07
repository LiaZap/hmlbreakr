/**
 * DashboardTabs — sub-navegação dentro da aba Dashboard.
 *
 * Reduz o scroll empilhado dividindo conteúdo em 3 sub-abas focadas:
 *   - Visão Geral: o que admin precisa pra agir HOJE (briefing + alertas + KPIs)
 *   - Análises: exploração de dados (benchmarks, oportunidades, margem)
 *   - Atividade: timeline de eventos
 *
 * Estado da aba ativa persiste em localStorage pra preservar contexto entre
 * sessões. Cmd+K e atalhos numéricos (1/2/3) trocam de aba via teclado.
 */

import { useEffect, useState, useCallback } from 'react';

const TABS = [
  {
    id: 'overview',
    label: 'Visão Geral',
    icon: (
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6"/>
      </svg>
    ),
    hint: 'O que precisa de atenção hoje',
  },
  {
    id: 'analytics',
    label: 'Análises',
    icon: (
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M3 3v18h18M7 12l4-4 4 4 5-5"/>
      </svg>
    ),
    hint: 'Insights detalhados e oportunidades',
  },
  {
    id: 'activity',
    label: 'Atividade',
    icon: (
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M12 8v4l3 2M22 12c0 5.523-4.477 10-10 10S2 17.523 2 12 6.477 2 12 2s10 4.477 10 10z"/>
      </svg>
    ),
    hint: 'Timeline e mapa do portfolio',
  },
];

const STORAGE_KEY = 'breakr.admin.dashboard.subtab';

const DashboardTabs = ({ children }) => {
  const [activeTab, setActiveTab] = useState(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      return saved && TABS.find(t => t.id === saved) ? saved : 'overview';
    } catch { return 'overview'; }
  });

  useEffect(() => {
    try { localStorage.setItem(STORAGE_KEY, activeTab); } catch { /* */ }
  }, [activeTab]);

  // Atalho de teclado: Alt+1/2/3 troca de sub-tab (não conflita com Cmd+K)
  const handleKeyDown = useCallback((e) => {
    if (!e.altKey || e.metaKey || e.ctrlKey) return;
    if (e.key === '1') { e.preventDefault(); setActiveTab('overview'); }
    else if (e.key === '2') { e.preventDefault(); setActiveTab('analytics'); }
    else if (e.key === '3') { e.preventDefault(); setActiveTab('activity'); }
  }, []);

  useEffect(() => {
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleKeyDown]);

  // children deve ser uma função (render prop) que recebe activeTab
  const content = typeof children === 'function' ? children(activeTab) : children;

  return (
    <div className="flex flex-col gap-4">
      {/* Tab strip */}
      <div className="flex items-center gap-1 bg-[#0F0F11] border border-white/[0.06] rounded-[12px] p-1 self-start">
        {TABS.map((tab, idx) => {
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex items-center gap-2 px-3 py-2 rounded-[10px] text-[12px] font-semibold transition-all ${
                isActive
                  ? 'bg-[#F5A623] text-black'
                  : 'text-[#868686] hover:text-white hover:bg-white/[0.04]'
              }`}
              aria-current={isActive ? 'page' : undefined}
              title={`${tab.hint} (Alt+${idx + 1})`}
            >
              {tab.icon}
              <span>{tab.label}</span>
              <span className={`text-[9px] font-bold opacity-60 ${isActive ? 'text-black' : 'text-[#666]'}`}>
                {idx + 1}
              </span>
            </button>
          );
        })}
      </div>

      {/* Hint da sub-tab ativa */}
      <div className="text-[11px] text-[#666] -mt-2">
        {TABS.find(t => t.id === activeTab)?.hint}
      </div>

      {/* Conteúdo da sub-tab */}
      <div>{content}</div>
    </div>
  );
};

export default DashboardTabs;
export { TABS };
