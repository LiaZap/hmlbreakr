/* eslint-disable react-refresh/only-export-components */
import React, { useState } from 'react';

/**
 * HealthScoreBadge — pill 0-100 com tooltip de breakdown
 *
 * Calcula um score 0-100 a partir do output de computeClientHealth(data),
 * pondera 4 dimensões (operacional 35%, cardápio 25%, engagement 25%,
 * crescimento 15%) e mostra um badge colorido com tooltip detalhado on hover.
 *
 * Uso:
 *   <HealthScoreBadge health={computeClientHealth(client.data)} size="md" />
 */

// --------------------------------------------------------------------------
// Pesos das dimensões (devem somar 100)
// --------------------------------------------------------------------------
const WEIGHTS = {
  operacional: 35,
  cardapio: 25,
  engagement: 25,
  crescimento: 15,
};

// --------------------------------------------------------------------------
// Helpers de scoring por dimensão (retornam fração 0..1)
// --------------------------------------------------------------------------
function scoreCmv(cmvPct) {
  if (cmvPct == null || isNaN(cmvPct) || cmvPct === 0) return 0.5; // neutro se sem dados
  if (cmvPct < 32) return 1;
  if (cmvPct < 35) return 0.7;
  if (cmvPct < 40) return 0.4;
  return 0;
}

function scoreBase(basePct) {
  if (basePct == null || isNaN(basePct) || basePct === 0) return 0.5;
  if (basePct < 55) return 1;
  if (basePct < 65) return 0.6;
  return 0;
}

function scoreLucro(lucroLiqPct) {
  if (lucroLiqPct == null || isNaN(lucroLiqPct)) return 0.5;
  if (lucroLiqPct > 8) return 1;
  if (lucroLiqPct > 3) return 0.6;
  if (lucroLiqPct >= 0) return 0.3;
  return 0;
}

function scoreEngagement(daysSinceActivity) {
  if (daysSinceActivity == null) return 0;
  if (daysSinceActivity === Infinity) return 0;
  if (daysSinceActivity <= 7) return 1;
  if (daysSinceActivity <= 14) return 0.75;
  if (daysSinceActivity <= 30) return 0.4;
  return 0;
}

function scoreCrescimento(revenueChange, prevRevenue) {
  // Sem histórico anterior = neutro (50%)
  if (!prevRevenue || prevRevenue <= 0) return 0.5;
  if (revenueChange == null || isNaN(revenueChange)) return 0.5;
  if (revenueChange > 5) return 1;
  if (revenueChange >= 0) return 0.7;
  if (revenueChange >= -5) return 0.4;
  return 0;
}

// --------------------------------------------------------------------------
// computeHealthScore — função pura
// --------------------------------------------------------------------------
export function computeHealthScore(health) {
  if (!health || typeof health !== 'object') {
    return { score: 0, breakdown: { operacional: 0, cardapio: 0, engagement: 0, crescimento: 0 }, factors: [] };
  }

  const {
    cmvPct = 0,
    basePct = 0,
    lucroLiqPct = 0,
    cardapioMaturidadePct = 0,
    daysSinceActivity = Infinity,
    revenueChange = 0,
    prevRevenue = 0,
    fichasTotal = 0,
    fichasComCustoCount = 0,
  } = health;

  // 1) Saúde Operacional (35%) — média das 3 sub-métricas
  const cmvFrac = scoreCmv(cmvPct);
  const baseFrac = scoreBase(basePct);
  const lucroFrac = scoreLucro(lucroLiqPct);
  const operacionalFrac = (cmvFrac + baseFrac + lucroFrac) / 3;
  const operacional = +(operacionalFrac * WEIGHTS.operacional).toFixed(1);

  // 2) Maturidade do cardápio (25%) — direto de 0..100
  const cardapioFrac = Math.max(0, Math.min(1, (cardapioMaturidadePct || 0) / 100));
  const cardapio = +(cardapioFrac * WEIGHTS.cardapio).toFixed(1);

  // 3) Engagement (25%)
  const engagementFrac = scoreEngagement(daysSinceActivity);
  const engagement = +(engagementFrac * WEIGHTS.engagement).toFixed(1);

  // 4) Crescimento (15%)
  const crescimentoFrac = scoreCrescimento(revenueChange, prevRevenue);
  const crescimento = +(crescimentoFrac * WEIGHTS.crescimento).toFixed(1);

  const score = Math.round(operacional + cardapio + engagement + crescimento);

  // ----- Factors: top 3 positivos / negativos relevantes -----
  const allFactors = [];

  // CMV
  if (cmvPct > 40) allFactors.push({ label: `CMV em ${cmvPct}% (crítico)`, impact: -3, type: 'negative' });
  else if (cmvPct > 35) allFactors.push({ label: `CMV em ${cmvPct}% (alto)`, impact: -2, type: 'negative' });
  else if (cmvPct > 32) allFactors.push({ label: `CMV em ${cmvPct}% (atenção)`, impact: -1, type: 'negative' });
  else if (cmvPct > 0) allFactors.push({ label: `CMV em ${cmvPct}% (saudável)`, impact: 3, type: 'positive' });

  // Lucro líquido
  if (lucroLiqPct < 0) allFactors.push({ label: `Operando em prejuízo (${lucroLiqPct}%)`, impact: -3, type: 'negative' });
  else if (lucroLiqPct < 3) allFactors.push({ label: `Lucro líquido apertado (${lucroLiqPct}%)`, impact: -2, type: 'negative' });
  else if (lucroLiqPct > 8) allFactors.push({ label: `Lucro líquido saudável (${lucroLiqPct}%)`, impact: 3, type: 'positive' });

  // BASE
  if (basePct > 65) allFactors.push({ label: `BASE em ${basePct}% (custos fixos altos)`, impact: -2, type: 'negative' });
  else if (basePct > 0 && basePct < 55) allFactors.push({ label: `BASE em ${basePct}% (sob controle)`, impact: 2, type: 'positive' });

  // Cardápio
  const fichasSemCusto = Math.max(0, (fichasTotal || 0) - (fichasComCustoCount || 0));
  if (fichasTotal > 0 && cardapioMaturidadePct < 50) {
    allFactors.push({ label: `${fichasSemCusto} fichas sem custo`, impact: -2, type: 'negative' });
  } else if (fichasTotal > 0 && cardapioMaturidadePct >= 80) {
    allFactors.push({ label: `Cardápio ${cardapioMaturidadePct}% completo`, impact: 2, type: 'positive' });
  }

  // Engagement
  if (daysSinceActivity === Infinity) {
    allFactors.push({ label: 'Sem atividade registrada', impact: -3, type: 'negative' });
  } else if (daysSinceActivity > 30) {
    allFactors.push({ label: `Inativo há ${daysSinceActivity} dias`, impact: -3, type: 'negative' });
  } else if (daysSinceActivity > 14) {
    allFactors.push({ label: `Sem atividade há ${daysSinceActivity} dias`, impact: -1, type: 'negative' });
  } else if (daysSinceActivity <= 7) {
    allFactors.push({ label: 'Atividade recente (últimos 7 dias)', impact: 2, type: 'positive' });
  }

  // Crescimento
  if (prevRevenue > 0) {
    if (revenueChange < -5) allFactors.push({ label: `Faturamento ${revenueChange}% vs mês anterior`, impact: -2, type: 'negative' });
    else if (revenueChange > 5) allFactors.push({ label: `Faturamento +${revenueChange}% vs mês anterior`, impact: 2, type: 'positive' });
  }

  // Top 3 por |impact|
  const factors = allFactors
    .sort((a, b) => Math.abs(b.impact) - Math.abs(a.impact))
    .slice(0, 3);

  return {
    score: Math.max(0, Math.min(100, score)),
    breakdown: { operacional, cardapio, engagement, crescimento },
    factors,
  };
}

// --------------------------------------------------------------------------
// Visual helpers
// --------------------------------------------------------------------------
function colorFor(score) {
  if (score < 40) return '#FF4560';
  if (score < 70) return '#F5A623';
  return '#00B37E';
}

const SIZE_MAP = {
  sm: { box: 28, font: 11 },
  md: { box: 36, font: 13 },
  lg: { box: 48, font: 16 },
};

// --------------------------------------------------------------------------
// HealthScoreBadge — componente visual
// --------------------------------------------------------------------------
const HealthScoreBadge = ({ health = null, size = 'md', showTooltip = true }) => {
  const [hovered, setHovered] = useState(false);

  const dims = SIZE_MAP[size] || SIZE_MAP.md;

  // Health ausente -> badge neutro com "—"
  if (!health) {
    return (
      <div
        className="inline-flex items-center justify-center rounded-full font-bold text-white/60 bg-white/10"
        style={{ width: dims.box, height: dims.box, fontSize: dims.font }}
        title="Sem dados"
      >
        —
      </div>
    );
  }

  const { score, breakdown, factors } = computeHealthScore(health);
  const color = colorFor(score);

  return (
    <div
      className="relative inline-flex"
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      <div
        className="inline-flex items-center justify-center rounded-full font-bold text-white shadow-sm cursor-default"
        style={{
          width: dims.box,
          height: dims.box,
          fontSize: dims.font,
          backgroundColor: color,
        }}
        aria-label={`Health score ${score} de 100`}
      >
        {score}
      </div>

      {showTooltip && hovered && (
        <div
          className="absolute z-50 left-1/2 -translate-x-1/2 mt-2 top-full pointer-events-none"
          style={{ minWidth: 240 }}
        >
          <div className="bg-[#1B1B1F] border border-white/10 rounded-xl shadow-2xl p-3 text-white text-xs">
            {/* Header */}
            <div className="flex items-baseline justify-between mb-2">
              <span className="text-white/70 uppercase tracking-wide text-[10px]">Health Score</span>
              <span className="font-bold text-base" style={{ color }}>
                {score} <span className="text-white/40 text-xs font-normal">/ 100</span>
              </span>
            </div>

            <div className="h-px bg-white/10 my-2" />

            {/* Breakdown */}
            <div className="space-y-1.5">
              <BreakdownRow label="Saúde Operacional" got={breakdown.operacional} max={WEIGHTS.operacional} />
              <BreakdownRow label="Maturidade Cardápio" got={breakdown.cardapio} max={WEIGHTS.cardapio} />
              <BreakdownRow label="Engagement" got={breakdown.engagement} max={WEIGHTS.engagement} />
              <BreakdownRow label="Crescimento" got={breakdown.crescimento} max={WEIGHTS.crescimento} />
            </div>

            {/* Factors */}
            {factors.length > 0 && (
              <>
                <div className="h-px bg-white/10 my-2" />
                <div className="space-y-1">
                  {factors.map((f, i) => (
                    <div key={i} className="flex items-start gap-1.5">
                      <span className="leading-tight">
                        {f.type === 'positive' ? (
                          <span className="text-[#00B37E]">✓</span>
                        ) : (
                          <span className="text-[#FF4560]">!</span>
                        )}
                      </span>
                      <span className="text-white/80 leading-tight">{f.label}</span>
                    </div>
                  ))}
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

const BreakdownRow = ({ label, got, max }) => {
  const pct = max > 0 ? Math.max(0, Math.min(1, got / max)) : 0;
  const barColor = pct >= 0.7 ? '#00B37E' : pct >= 0.4 ? '#F5A623' : '#FF4560';
  return (
    <div className="flex items-center gap-2">
      <span className="text-white/70 flex-1 truncate">{label}</span>
      <div className="w-12 h-1 bg-white/10 rounded-full overflow-hidden">
        <div
          className="h-full rounded-full"
          style={{ width: `${pct * 100}%`, backgroundColor: barColor }}
        />
      </div>
      <span className="text-white/90 tabular-nums w-12 text-right">
        {got}/{max}
      </span>
    </div>
  );
};

export { HealthScoreBadge };
export default HealthScoreBadge;
