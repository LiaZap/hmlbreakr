/**
 * JourneyMap (BAH-023) — Sumário visual do progresso do cliente no sistema
 *
 * Mostra na tela inicial as etapas do "caminho" e o status de cada uma:
 * onboarding -> insumos -> fichas -> engenharia de menu -> equipe -> BPO.
 *
 * Cada etapa lê dados do dashboardData pra determinar status:
 *  done    — concluida (check verde)
 *  partial — em progresso (laranja com progress %)
 *  pending — nao iniciada (cinza)
 *
 * Click em qualquer etapa navega pra pagina correspondente via onNavigate.
 */

import { useMemo, useState, useEffect } from 'react';
import InfoTooltip from './InfoTooltip';

const JourneyMap = ({ dashboardData, onNavigate }) => {
  const steps = useMemo(() => {
    const formData = dashboardData?.formData || {};
    const operational = dashboardData?.operational || {};
    const insumos = operational.insumos || [];
    const fichas = operational.fichas || [];
    const menuEngineering = dashboardData?.menuEngineering || [];

    // 1) Onboarding
    const onboardingDone = !!formData.onboarding_completed;
    const onboardingPartial = !onboardingDone && Object.keys(formData).length > 5;

    // 2) Insumos cadastrados (com custo > 0 ideal)
    const insumosTotal = insumos.length;
    const insumosComCusto = insumos.filter(i => {
      const v = parseFloat(String(i.price || i.custo || '0').replace(/R\$\s?/g, '').replace(/\./g, '').replace(',', '.'));
      return v > 0;
    }).length;

    // 3) Fichas técnicas cadastradas (com custo > 0)
    const fichasTotal = fichas.length;
    const fichasComCusto = fichas.filter(f => {
      const v = parseFloat(String(f.custoTotal || '0').replace(/R\$\s?/g, '').replace(/\./g, '').replace(',', '.'));
      return v > 0;
    }).length;

    // 4) Engenharia de Menu — fichas com precoVenda > 0 OU itens em menuEngineering
    const fichasComPreco = fichas.filter(f => {
      const v = parseFloat(String(f.precoVenda || '0').replace(/R\$\s?/g, '').replace(/\./g, '').replace(',', '.'));
      return v > 0;
    }).length;
    const matrizSize = menuEngineering.length;

    // 5) Equipe (sócios + funcionários do onboarding)
    const partners = (formData.partners || []).filter(p => p?.name);
    const employees = (formData.employees || []).filter(e => e?.name);
    const equipeTotal = partners.length + employees.length;

    // 6) BPO ativada (lê _bpo injetado pelo backend)
    const bpoActive = !!(dashboardData?._bpo && dashboardData._bpo.enabled);

    return [
      {
        id: 'onboarding',
        label: 'Onboarding',
        description: 'Cadastro inicial completo',
        status: onboardingDone ? 'done' : (onboardingPartial ? 'partial' : 'pending'),
        progress: onboardingDone ? 100 : (onboardingPartial ? 50 : 0),
        page: null, // só admin pode acessar onboarding direto
        icon: (
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></svg>
        ),
      },
      {
        id: 'insumos',
        label: 'Insumos',
        description: insumosTotal === 0 ? 'Cadastre seus insumos' : `${insumosComCusto}/${insumosTotal} com custo`,
        status: insumosTotal === 0 ? 'pending' : (insumosComCusto < insumosTotal ? 'partial' : 'done'),
        progress: insumosTotal === 0 ? 0 : Math.round((insumosComCusto / insumosTotal) * 100),
        page: 'fichaTecnica',
        icon: (
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 7l9 4 9-4M3 7v10l9 4 9-4V7M3 7l9-4 9 4"/></svg>
        ),
      },
      {
        id: 'fichas',
        label: 'Fichas Técnicas',
        description: fichasTotal === 0 ? 'Crie fichas dos pratos' : `${fichasComCusto}/${fichasTotal} com custo`,
        status: fichasTotal === 0 ? 'pending' : (fichasComCusto < fichasTotal ? 'partial' : 'done'),
        progress: fichasTotal === 0 ? 0 : Math.round((fichasComCusto / fichasTotal) * 100),
        page: 'fichaTecnica',
        icon: (
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="18" height="18" rx="2"/><line x1="9" y1="3" x2="9" y2="21"/><line x1="3" y1="9" x2="21" y2="9"/></svg>
        ),
      },
      {
        id: 'engenharia',
        label: 'Engenharia de Menu',
        description: matrizSize > 0
          ? `Matriz com ${matrizSize} produtos`
          : (fichasComPreco > 0 ? `${fichasComPreco} fichas com preço` : 'Importe sua matriz de preço'),
        status: matrizSize > 0 || fichasComPreco >= 5 ? 'done' : (fichasComPreco > 0 ? 'partial' : 'pending'),
        progress: matrizSize > 0 ? 100 : Math.min(100, Math.round((fichasComPreco / Math.max(fichasTotal, 1)) * 100)),
        page: 'engenhariaMenu',
        icon: (
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 3v18h18"/><path d="M7 12l4-4 4 4 5-5"/></svg>
        ),
      },
      {
        id: 'equipe',
        label: 'Equipe',
        description: equipeTotal === 0 ? 'Cadastre sócios e funcionários' : `${partners.length} sócios + ${employees.length} funcionários`,
        status: equipeTotal === 0 ? 'pending' : 'done',
        progress: equipeTotal === 0 ? 0 : 100,
        page: 'equipe',
        icon: (
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>
        ),
      },
      {
        id: 'bpo',
        label: 'BPO Financeira',
        description: bpoActive ? 'Conta a Pagar/Receber ativa' : 'Ative a gestão financeira',
        status: bpoActive ? 'done' : 'pending',
        progress: bpoActive ? 100 : 0,
        page: 'financeiro',
        icon: (
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/></svg>
        ),
      },
    ];
  }, [dashboardData]);

  const overallPct = useMemo(() => {
    const total = steps.reduce((acc, s) => acc + s.progress, 0);
    return Math.round(total / steps.length);
  }, [steps]);

  const completedCount = steps.filter(s => s.status === 'done').length;

  const colorByStatus = (status) => {
    if (status === 'done') return { bg: 'bg-[#00B37E]/15', border: 'border-[#00B37E]/40', text: 'text-[#00B37E]', dot: '#00B37E' };
    if (status === 'partial') return { bg: 'bg-[#F5A623]/15', border: 'border-[#F5A623]/40', text: 'text-[#F5A623]', dot: '#F5A623' };
    return { bg: 'bg-[#252527]', border: 'border-[#2A2A2C]', text: 'text-[#868686]', dot: '#444' };
  };

  // Estado expandido/colapsado (BAH-023 v2: compact por padrão pra não empurrar dashboard)
  const [expanded, setExpanded] = useState(() => {
    try { return localStorage.getItem('breakr.journeyMap.expanded') === '1'; } catch { return false; }
  });
  useEffect(() => {
    try { localStorage.setItem('breakr.journeyMap.expanded', expanded ? '1' : '0'); } catch { /* */ }
  }, [expanded]);

  const overallColor = overallPct >= 80 ? '#00B37E' : overallPct >= 40 ? '#F5A623' : '#FF8A9C';

  return (
    <div className="bg-[#141414] border border-[#1E1E1E] rounded-xl mb-3 md:mb-4 overflow-hidden">
      {/* COMPACT BAR — sempre visível, click pra toggle */}
      <button
        onClick={() => setExpanded(v => !v)}
        className="w-full flex items-center gap-3 px-3 md:px-4 py-2.5 hover:bg-white/[0.02] transition-colors"
        title={expanded ? 'Recolher mapa do caminho' : 'Expandir mapa do caminho'}
      >
        {/* Ícone */}
        <div className="w-7 h-7 rounded-lg flex items-center justify-center shrink-0" style={{ backgroundColor: `${overallColor}20`, color: overallColor }}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M3 6l9-4 9 4v12l-9 4-9-4V6zM3 6l9 4M21 6l-9 4M12 22V10"/>
          </svg>
        </div>

        {/* Label + dots de progresso */}
        <div className="flex-1 flex items-center gap-3 min-w-0">
          <span className="text-[12px] font-semibold text-white shrink-0">Mapa do Caminho</span>
          <span className="text-[10px] text-[#868686] shrink-0 hidden sm:inline">
            {completedCount}/{steps.length} etapas
          </span>

          {/* Dots inline pra cada etapa */}
          <div className="flex items-center gap-1 ml-auto mr-2 shrink-0">
            {steps.map(s => (
              <span
                key={s.id}
                className="w-2 h-2 rounded-full transition-colors"
                style={{
                  backgroundColor: s.status === 'done' ? '#00B37E' : s.status === 'partial' ? '#F5A623' : '#333',
                }}
                title={`${s.label}: ${s.status === 'done' ? 'Concluído' : s.status === 'partial' ? `${s.progress}%` : 'Pendente'}`}
              />
            ))}
          </div>
        </div>

        {/* Pct + chevron */}
        <div className="flex items-center gap-2 shrink-0">
          <div className="text-[14px] font-bold tabular-nums" style={{ color: overallColor }}>
            {overallPct}%
          </div>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" className="text-[#666]"
            style={{ transform: expanded ? 'rotate(180deg)' : 'rotate(0deg)', transition: 'transform 0.2s' }}>
            <path d="M6 9l6 6 6-6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        </div>
      </button>

      {/* Mini progress bar — sempre visível embaixo da barra compacta */}
      <div className="w-full h-[2px] bg-[#1E1E1E]">
        <div
          className="h-full transition-all duration-500"
          style={{
            width: `${overallPct}%`,
            background: overallPct >= 80 ? '#00B37E' : overallPct >= 40 ? '#F5A623' : 'linear-gradient(90deg, #F5A623, #FF8A9C)',
          }}
        />
      </div>

      {/* EXPANDED — detalhes completos das etapas */}
      {expanded && (
        <div className="px-3 md:px-4 pb-3 md:pb-4 pt-3 border-t border-[#1E1E1E]">
          <div className="flex items-center justify-between mb-3">
            <span className="text-[10px] text-[#868686] uppercase tracking-wider font-semibold">Etapas detalhadas</span>
            <InfoTooltip
              position="bottom-right"
              content="Clique em qualquer etapa pra ir direto pra ela."
            />
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2">
            {steps.map((step, idx) => {
              const c = colorByStatus(step.status);
              const clickable = !!step.page && onNavigate;
              return (
                <button
                  key={step.id}
                  onClick={() => clickable && onNavigate(step.page)}
                  disabled={!clickable}
                  className={`relative flex flex-col items-start gap-1 p-2.5 rounded-lg border ${c.border} ${c.bg} text-left transition-all ${clickable ? 'hover:scale-[1.02] hover:border-opacity-80 cursor-pointer' : 'cursor-default opacity-90'}`}
                  title={clickable ? `Ir pra ${step.label}` : step.description}
                >
                  {/* Top: icon + status */}
                  <div className="flex items-center justify-between w-full">
                    <div className={`w-6 h-6 rounded flex items-center justify-center ${c.text} bg-black/30`}>
                      {step.icon}
                    </div>
                    {step.status === 'done' && (
                      <div className="w-3.5 h-3.5 rounded-full bg-[#00B37E] flex items-center justify-center">
                        <svg width="8" height="8" viewBox="0 0 24 24" fill="none"><path d="M20 6L9 17L4 12" stroke="white" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round"/></svg>
                      </div>
                    )}
                    {step.status === 'partial' && (
                      <span className="text-[9px] font-bold text-[#F5A623] tabular-nums">{step.progress}%</span>
                    )}
                    {step.status === 'pending' && (
                      <div className="w-3.5 h-3.5 rounded-full border-2 border-[#444]" />
                    )}
                  </div>

                  {/* Label + descrição */}
                  <div className="w-full mt-0.5">
                    <div className={`text-[11px] font-semibold leading-tight ${step.status === 'pending' ? 'text-[#CCC]' : 'text-white'} truncate`}>
                      {idx + 1}. {step.label}
                    </div>
                    <div className="text-[9px] text-[#868686] mt-0.5 line-clamp-1 leading-snug">
                      {step.description}
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
};

export default JourneyMap;
