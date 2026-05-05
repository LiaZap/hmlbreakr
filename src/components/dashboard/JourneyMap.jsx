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

import { useMemo } from 'react';
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

  return (
    <div className="bg-[#141414] border border-[#1E1E1E] rounded-2xl p-4 md:p-5 mb-3 md:mb-4">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div>
          <div className="flex items-center gap-2">
            <span className="font-semibold text-[13px] text-white">Mapa do Caminho</span>
            <InfoTooltip
              position="bottom-right"
              content="Acompanhe o progresso de configuração do seu sistema. Clique em qualquer etapa pra ir direto pra ela."
            />
          </div>
          <span className="text-[11px] text-[#868686]">
            {completedCount} de {steps.length} etapas concluídas
          </span>
        </div>
        <div className="flex items-center gap-2">
          <div className="text-right">
            <div className="text-[18px] font-bold leading-none" style={{ color: overallPct >= 80 ? '#00B37E' : overallPct >= 40 ? '#F5A623' : '#FF8A9C' }}>
              {overallPct}%
            </div>
            <div className="text-[9px] text-[#868686] uppercase tracking-wider">Concluído</div>
          </div>
        </div>
      </div>

      {/* Progress bar geral */}
      <div className="w-full h-1.5 bg-[#1E1E1E] rounded-full overflow-hidden mb-4">
        <div
          className="h-full rounded-full transition-all duration-500"
          style={{
            width: `${overallPct}%`,
            background: overallPct >= 80 ? '#00B37E' : overallPct >= 40 ? '#F5A623' : 'linear-gradient(90deg, #F5A623, #FF8A9C)',
          }}
        />
      </div>

      {/* Steps grid — responsivo: 2 cols mobile, 3 tablet, 6 desktop */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2 md:gap-3">
        {steps.map((step, idx) => {
          const c = colorByStatus(step.status);
          const clickable = !!step.page && onNavigate;
          return (
            <button
              key={step.id}
              onClick={() => clickable && onNavigate(step.page)}
              disabled={!clickable}
              className={`relative flex flex-col items-start gap-1.5 p-3 rounded-xl border ${c.border} ${c.bg} text-left transition-all ${clickable ? 'hover:scale-[1.02] hover:border-opacity-80 cursor-pointer' : 'cursor-default opacity-90'}`}
              title={clickable ? `Ir pra ${step.label}` : step.description}
            >
              {/* Top: icon + status */}
              <div className="flex items-center justify-between w-full">
                <div className={`w-7 h-7 rounded-lg flex items-center justify-center ${c.text} bg-black/30`}>
                  {step.icon}
                </div>
                {step.status === 'done' && (
                  <div className="w-4 h-4 rounded-full bg-[#00B37E] flex items-center justify-center">
                    <svg width="10" height="10" viewBox="0 0 24 24" fill="none"><path d="M20 6L9 17L4 12" stroke="white" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"/></svg>
                  </div>
                )}
                {step.status === 'partial' && (
                  <span className="text-[9px] font-bold text-[#F5A623] tabular-nums">{step.progress}%</span>
                )}
                {step.status === 'pending' && (
                  <div className="w-4 h-4 rounded-full border-2 border-[#444]" />
                )}
              </div>

              {/* Label + descrição */}
              <div className="w-full mt-1">
                <div className={`text-[12px] font-semibold leading-tight ${step.status === 'pending' ? 'text-[#CCC]' : 'text-white'} truncate`}>
                  {idx + 1}. {step.label}
                </div>
                <div className="text-[10px] text-[#868686] mt-0.5 line-clamp-2 leading-snug">
                  {step.description}
                </div>
              </div>

              {/* Mini progress bar pra partial */}
              {step.status === 'partial' && (
                <div className="w-full h-1 bg-black/30 rounded-full overflow-hidden mt-1">
                  <div className="h-full bg-[#F5A623] rounded-full" style={{ width: `${step.progress}%` }} />
                </div>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
};

export default JourneyMap;
