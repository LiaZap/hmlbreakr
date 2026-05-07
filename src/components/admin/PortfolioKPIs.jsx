/**
 * PortfolioKPIs — métricas operacionais agregadas do PORTFÓLIO de restaurantes.
 *
 * Item 1.2 do plano: ao invés de KPIs genéricos de SaaS (MRR, churn),
 * mostra a saúde OPERACIONAL agregada dos restaurantes:
 *  - CMV médio do portfólio
 *  - BASE médio
 *  - Lucro líquido médio
 *  - Receita total agregada
 *  - Distribuição: saudáveis / apertados / em risco / críticos
 *  - Maturidade do cardápio
 *  - Adoção de BPO Financeira
 */

import { useMemo } from 'react';
import { motion } from 'framer-motion'; // eslint-disable-line no-unused-vars
import { computeClientHealth, aggregatePortfolio } from '../../utils/clientHealth';

const fmtBRL = (n) => {
  const v = Number(n) || 0;
  if (v >= 1000000) return `R$ ${(v / 1000000).toFixed(1)}M`;
  if (v >= 1000) return `R$ ${(v / 1000).toFixed(1)}k`;
  return `R$ ${v.toFixed(0)}`;
};

// Sparkline minimalista
const Sparkline = ({ data = [], color = '#F5A623', width = 60, height = 24 }) => {
  if (!data.length || data.every(v => v === 0)) return null;
  const max = Math.max(...data, 1);
  const min = Math.min(...data, 0);
  const range = max - min || 1;
  const points = data.map((v, i) => {
    const x = (i / (data.length - 1 || 1)) * width;
    const y = height - ((v - min) / range) * height;
    return `${x},${y}`;
  }).join(' ');
  return (
    <svg width={width} height={height} className="overflow-visible">
      <defs>
        <linearGradient id={`spark-${color.slice(1)}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.3"/>
          <stop offset="100%" stopColor={color} stopOpacity="0"/>
        </linearGradient>
      </defs>
      <polygon points={`0,${height} ${points} ${width},${height}`} fill={`url(#spark-${color.slice(1)})`} />
      <polyline points={points} fill="none" stroke={color} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  );
};

const KPICard = ({ label, value, subtitle, trend, color = '#F5A623', sparkData, icon, status }) => {
  // Status: 'good' | 'warning' | 'critical'
  const statusColors = {
    good: '#00B37E',
    warning: '#F5A623',
    critical: '#FF4560',
  };
  const accentColor = status ? statusColors[status] : color;

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className="relative bg-gradient-to-br from-[#141416] to-[#0F0F11] border border-white/[0.06] rounded-[18px] p-5 overflow-hidden group hover:border-white/[0.12] transition-all"
    >
      {/* Glow */}
      <div className="absolute -top-8 -right-8 w-32 h-32 rounded-full blur-3xl opacity-[0.08] group-hover:opacity-[0.15] transition-opacity"
        style={{ backgroundColor: accentColor }} />

      <div className="relative">
        <div className="flex items-start justify-between mb-3">
          <div className="w-10 h-10 rounded-[10px] flex items-center justify-center ring-1 ring-white/[0.05]"
            style={{ backgroundColor: accentColor + '15' }}>
            {icon || (
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
                <path d="M3 3v18h18" stroke={accentColor} strokeWidth="1.5" strokeLinecap="round"/>
              </svg>
            )}
          </div>
          {sparkData && <Sparkline data={sparkData} color={accentColor} />}
        </div>
        <p className="text-[10px] text-[#666] uppercase tracking-widest font-bold mb-1.5">{label}</p>
        <div className="flex items-baseline gap-2 flex-wrap">
          <p className="text-[24px] font-bold text-white leading-none tracking-tight">{value}</p>
          {trend && (
            <span className="text-[11px] font-semibold" style={{ color: accentColor }}>{trend}</span>
          )}
        </div>
        {subtitle && (
          <p className="text-[10px] text-[#666] mt-2">{subtitle}</p>
        )}
      </div>
    </motion.div>
  );
};

const PortfolioKPIs = ({ clients }) => {
  const portfolio = useMemo(() => {
    const healthList = (clients || []).map(c => {
      try {
        const data = typeof c.data === 'string' ? JSON.parse(c.data || '{}') : (c.data || {});
        return computeClientHealth(data);
      } catch { return null; }
    });
    return aggregatePortfolio(healthList);
  }, [clients]);

  const cmvStatus = portfolio.cmvAvg <= 32 ? 'good' : portfolio.cmvAvg <= 35 ? 'warning' : 'critical';
  const baseStatus = portfolio.baseAvg <= 55 ? 'good' : portfolio.baseAvg <= 65 ? 'warning' : 'critical';
  // Fix: profitAvg pode ser null quando ninguém tem dados financeiros
  const profitStatus = portfolio.profitAvg == null
    ? 'good'
    : portfolio.profitAvg >= 8 ? 'good' : portfolio.profitAvg >= 3 ? 'warning' : 'critical';

  // Distribuição de saúde
  const totalScored = portfolio.healthy + portfolio.tight + portfolio.risk + portfolio.critical;
  const pctHealthy = totalScored > 0 ? Math.round((portfolio.healthy / totalScored) * 100) : 0;
  const pctTight = totalScored > 0 ? Math.round((portfolio.tight / totalScored) * 100) : 0;
  const pctRisk = totalScored > 0 ? Math.round((portfolio.risk / totalScored) * 100) : 0;
  const pctCritical = totalScored > 0 ? Math.round((portfolio.critical / totalScored) * 100) : 0;

  return (
    <div className="mb-6">
      {/* Header */}
      <div className="flex items-end justify-between mb-3 flex-wrap gap-2">
        <div>
          <h2 className="text-[16px] font-bold text-white">Saúde do Portfólio</h2>
          <p className="text-[11px] text-[#868686]">
            Métricas operacionais agregadas dos {portfolio.total} restaurantes ativos
          </p>
        </div>
      </div>

      {/* 4 KPIs operacionais principais */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 mb-4">
        <KPICard
          label="CMV Médio"
          value={portfolio.cmvAvg === 0 ? '—' : `${portfolio.cmvAvg}%`}
          subtitle={portfolio.cmvAvg === 0 ? 'Sem dados de fichas+vendas' : `Saudável: 28-32% (${portfolio.cmvClientCount || 0} clientes)`}
          status={cmvStatus}
          icon={<svg width="18" height="18" viewBox="0 0 24 24" fill="none"><path d="M3 7l9 4 9-4M3 7v10l9 4 9-4V7M3 7l9-4 9 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className={cmvStatus === 'good' ? 'text-[#00B37E]' : cmvStatus === 'warning' ? 'text-[#F5A623]' : 'text-[#FF4560]'}/></svg>}
        />
        <KPICard
          label="BASE Médio"
          value={`${portfolio.baseAvg}%`}
          subtitle="Saudável: <55%"
          status={baseStatus}
          icon={<svg width="18" height="18" viewBox="0 0 24 24" fill="none"><path d="M3 21h18M5 21V7l7-4 7 4v14M9 9h1M14 9h1M9 13h1M14 13h1M9 17h1M14 17h1" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className={baseStatus === 'good' ? 'text-[#00B37E]' : baseStatus === 'warning' ? 'text-[#F5A623]' : 'text-[#FF4560]'}/></svg>}
        />
        <KPICard
          label="Lucro Líquido"
          value={portfolio.profitAvg == null ? '—' : `${portfolio.profitAvg}%`}
          subtitle={portfolio.profitAvg == null ? 'Sem dados de fichas+vendas' : `Saudável: >8% (${portfolio.profitClientCount || 0} clientes)`}
          status={profitStatus}
          icon={<svg width="18" height="18" viewBox="0 0 24 24" fill="none"><path d="M12 2v20M17 5H9.5a3.5 3.5 0 100 7h5a3.5 3.5 0 110 7H6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" className={profitStatus === 'good' ? 'text-[#00B37E]' : profitStatus === 'warning' ? 'text-[#F5A623]' : 'text-[#FF4560]'}/></svg>}
        />
        <KPICard
          label="Receita Agregada"
          value={fmtBRL(portfolio.revenueTotal)}
          subtitle={`${portfolio.withRevenue} clientes com faturamento`}
          color="#5B8DEF"
          trend={portfolio.revenueChangeAvg !== 0 ? `${portfolio.revenueChangeAvg > 0 ? '+' : ''}${portfolio.revenueChangeAvg}%` : null}
          icon={<svg width="18" height="18" viewBox="0 0 24 24" fill="none"><path d="M3 3v18h18M9 12l3-3 3 3 4-4" stroke="#5B8DEF" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg>}
        />
      </div>

      {/* Distribuição de saúde + Adoção */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
        {/* Distribuição */}
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
          className="bg-gradient-to-br from-[#141416] to-[#0F0F11] border border-white/[0.06] rounded-[18px] p-5">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="text-[14px] font-bold text-white">Distribuição de Saúde</h3>
              <p className="text-[10px] text-[#666] mt-0.5">{totalScored} restaurantes classificados</p>
            </div>
          </div>

          {totalScored === 0 ? (
            <div className="text-[11px] text-[#666] py-4 text-center">Sem dados suficientes pra classificar</div>
          ) : (
            <>
              {/* Barra única horizontal com proporções */}
              <div className="flex h-3 rounded-full overflow-hidden bg-white/[0.04] mb-4">
                {portfolio.healthy > 0 && (
                  <div className="bg-[#00B37E] transition-all" style={{ width: `${pctHealthy}%` }} title={`${portfolio.healthy} saudáveis`} />
                )}
                {portfolio.tight > 0 && (
                  <div className="bg-[#F5A623] transition-all" style={{ width: `${pctTight}%` }} title={`${portfolio.tight} apertados`} />
                )}
                {portfolio.risk > 0 && (
                  <div className="bg-[#FF9406] transition-all" style={{ width: `${pctRisk}%` }} title={`${portfolio.risk} em risco`} />
                )}
                {portfolio.critical > 0 && (
                  <div className="bg-[#FF4560] transition-all" style={{ width: `${pctCritical}%` }} title={`${portfolio.critical} críticos`} />
                )}
              </div>

              {/* Legenda */}
              <div className="grid grid-cols-2 gap-2 text-[11px]">
                <div className="flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-[#00B37E]" />
                  <span className="text-[#CCC]">Saudáveis</span>
                  <span className="text-[#666] ml-auto">{portfolio.healthy} ({pctHealthy}%)</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-[#F5A623]" />
                  <span className="text-[#CCC]">Apertados</span>
                  <span className="text-[#666] ml-auto">{portfolio.tight} ({pctTight}%)</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-[#FF9406]" />
                  <span className="text-[#CCC]">Em risco</span>
                  <span className="text-[#666] ml-auto">{portfolio.risk} ({pctRisk}%)</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-[#FF4560]" />
                  <span className="text-[#CCC]">Críticos</span>
                  <span className="text-[#666] ml-auto">{portfolio.critical} ({pctCritical}%)</span>
                </div>
              </div>
            </>
          )}
        </motion.div>

        {/* Adoção */}
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}
          className="bg-gradient-to-br from-[#141416] to-[#0F0F11] border border-white/[0.06] rounded-[18px] p-5">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="text-[14px] font-bold text-white">Maturidade & Adoção</h3>
              <p className="text-[10px] text-[#666] mt-0.5">Engajamento das features-chave</p>
            </div>
          </div>

          <div className="space-y-3">
            <AdoptionRow
              label="Cardápio maduro"
              hint=">80% pratos com custo"
              count={portfolio.withMature}
              total={portfolio.total}
              color="#00B37E"
            />
            <AdoptionRow
              label="BPO Financeira ativa"
              hint="Conta a Pagar/Receber + bancos"
              count={portfolio.withBpo}
              total={portfolio.total}
              color="#5B8DEF"
            />
            <AdoptionRow
              label="Faturamento lançado"
              hint="Pelo menos 1 mês de receita"
              count={portfolio.withRevenue}
              total={portfolio.total}
              color="#F5A623"
            />
          </div>
        </motion.div>
      </div>
    </div>
  );
};

const AdoptionRow = ({ label, hint, count, total, color }) => {
  const pct = total > 0 ? Math.round((count / total) * 100) : 0;
  return (
    <div>
      <div className="flex items-center justify-between mb-1.5">
        <div>
          <span className="text-[12px] font-semibold text-white">{label}</span>
          <span className="text-[10px] text-[#666] ml-2">{hint}</span>
        </div>
        <div className="flex items-baseline gap-1">
          <span className="text-[14px] font-bold text-white tabular-nums">{count}</span>
          <span className="text-[11px] text-[#868686]">/{total}</span>
          <span className="text-[10px] font-semibold ml-2" style={{ color }}>{pct}%</span>
        </div>
      </div>
      <div className="w-full h-1.5 bg-white/[0.04] rounded-full overflow-hidden">
        <motion.div
          initial={{ width: 0 }}
          animate={{ width: `${pct}%` }}
          transition={{ duration: 0.6, ease: 'easeOut' }}
          className="h-full rounded-full"
          style={{ background: `linear-gradient(90deg, ${color}80, ${color})` }}
        />
      </div>
    </div>
  );
};

export default PortfolioKPIs;
