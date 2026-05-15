/**
 * OpportunityDetector — Item 2.2 do plano admin
 *
 * Detecta automaticamente 4 tipos de OPORTUNIDADE de ação por cliente:
 *  1. 💰 Upsell           — engajado e maduro, pronto pra plano premium
 *  2. ⭐ Case Study       — bons resultados, vale promover como caso de sucesso
 *  3. 🚨 Churn Risk       — métricas caindo, precisa intervenção HOJE
 *  4. 🛠 Consultoria      — problema operacional fixível (CMV alto, fichas)
 *
 * Não é só alerta passivo: é AÇÃO COMERCIAL que admin/CSM pode fazer.
 *
 * Thresholds tunados pra mercado de gastronomia brasileira (mesmos benchmarks
 * já usados em clientHealth.js — CMV saudável <32%, lucro saudável >8% etc.).
 */
import { useMemo, useState } from 'react';
import { motion } from 'framer-motion'; // eslint-disable-line no-unused-vars
import { computeClientHealth, getClientLogo, getClientCuisine } from '../../utils/clientHealth';

const TYPE_STYLES = {
  upsell: {
    icon: '💰',
    label: 'Upsell',
    color: '#A78BFA',                    // violet
    bg: 'bg-[#A78BFA]/10',
    border: 'border-[#A78BFA]/30',
    text: 'text-[#A78BFA]',
    badge: 'bg-[#A78BFA]/20 text-[#A78BFA]',
  },
  case_study: {
    icon: '⭐',
    label: 'Cases',
    color: '#F5A623',                    // amber
    bg: 'bg-[#F5A623]/10',
    border: 'border-[#F5A623]/30',
    text: 'text-[#F5A623]',
    badge: 'bg-[#F5A623]/20 text-[#F5A623]',
  },
  churn_risk: {
    icon: '🚨',
    label: 'Risco',
    color: '#FF4560',                    // red
    bg: 'bg-[#FF4560]/10',
    border: 'border-[#FF4560]/30',
    text: 'text-[#FF4560]',
    badge: 'bg-[#FF4560]/20 text-[#FF4560]',
  },
  consultoria: {
    icon: '🛠',
    label: 'Consultoria',
    color: '#34D399',                    // emerald
    bg: 'bg-[#34D399]/10',
    border: 'border-[#34D399]/30',
    text: 'text-[#34D399]',
    badge: 'bg-[#34D399]/20 text-[#34D399]',
  },
};

// Score acima do qual exibimos badge "🔥 alto" (prioridade)
// Tunado por tipo: lucro alto pra upsell/case, CMV crítico pra consultoria,
// prejuízo grande pra churn.
const HIGH_PRIORITY_THRESHOLDS = {
  upsell: 12,        // lucro >12% = ROI bem alto pra plano premium
  case_study: 15,    // lucro >15% = case forte, ótimo pra divulgação
  churn_risk: 0,     // score = -lucroLiqPct, qualquer prejuízo já é alto
  consultoria: 8,    // score = cmvPct - 30, >8 significa CMV >38% (crítico)
};

const parseValue = (val) => {
  if (val == null) return 0;
  if (typeof val === 'number') return val;
  let s = String(val).replace(/R\$/g, '').trim();
  if (s.includes(',') && s.includes('.')) s = s.replace(/\./g, '').replace(',', '.');
  else if (s.includes(',')) s = s.replace(',', '.');
  return parseFloat(s) || 0;
};

/**
 * Meses desde criação do cliente. Encapsulado em helper top-level pra
 * que o useMemo lá embaixo não chame Date.now() direto (regra de pureza
 * do React não permite chamadas impuras em render).
 */
function monthsSince(createdAt) {
  if (!createdAt) return 0;
  const t = new Date(createdAt).getTime();
  if (isNaN(t)) return 0;
  return (Date.now() - t) / (30 * 86400000);
}

/**
 * Conta fichas com margem apertada (custo > 40% do preço de venda).
 * Usado como sinal extra na oportunidade de consultoria — quantos pratos
 * concretamente estão queimando dinheiro.
 */
function countFichasCriticas(parsedData) {
  try {
    const fichas = parsedData?.operational?.fichas || [];
    return fichas.filter(f => {
      const custo = parseValue(f?.custoTotal);
      const preco = parseValue(f?.precoVenda);
      return custo > 0 && preco > 0 && (custo / preco) > 0.4;
    }).length;
  } catch {
    return 0;
  }
}

/**
 * Rotulo de prioridade pro card. Score absoluto + threshold por tipo.
 */
function priorityBadge(type, score) {
  const threshold = HIGH_PRIORITY_THRESHOLDS[type] ?? Infinity;
  if (score >= threshold) {
    return { label: '🔥 alto', tone: 'text-[#FF9406]' };
  }
  if (score >= threshold / 2) {
    return { label: 'médio', tone: 'text-[#F5A623]' };
  }
  return { label: 'normal', tone: 'text-[#868686]' };
}

const OpportunityDetector = ({ clients, onClientClick }) => {
  const [activeTab, setActiveTab] = useState('upsell');

  const opportunities = useMemo(() => {
    const items = [];
    (clients || []).forEach(client => {
      try {
        const data = typeof client.data === 'string'
          ? JSON.parse(client.data || '{}')
          : (client.data || {});
        const health = computeClientHealth(data);
        if (!health) return;

        const monthsOnBreakr = monthsSince(client.createdAt);

        const logo = getClientLogo(client);
        const cuisine = getClientCuisine(client);
        const lucro = health.lucroLiqPct ?? 0;

        // 1. UPSELL CANDIDATE
        // BPO ativa + 6+ meses + saudável + cardápio robusto + ativo recentemente
        if (
          health.bpoActive &&
          monthsOnBreakr >= 6 &&
          health.health === 'healthy' &&
          health.fichasTotal >= 15 &&
          health.daysSinceActivity <= 7
        ) {
          items.push({
            type: 'upsell',
            client, logo, cuisine,
            score: lucro,
            title: 'Pronto pra plano premium',
            reason: `${monthsOnBreakr.toFixed(0)} meses de uso, BPO ativa, ${health.fichasTotal} pratos cadastrados, lucro ${lucro}%`,
            action: 'Oferecer plano com features avançadas (AI insights, branded reports, etc.)',
          });
        }

        // 2. CASE STUDY CANDIDATE
        // Saudável + lucro acima da média do mercado (8%) com folga + 3+ meses
        if (
          health.health === 'healthy' &&
          health.hasFinancialData &&
          lucro >= 12 &&
          monthsOnBreakr >= 3
        ) {
          items.push({
            type: 'case_study',
            client, logo, cuisine,
            score: lucro,
            title: 'Possível case de sucesso',
            reason: `Lucro líquido ${lucro}% (acima da média do mercado de 8%), há ${monthsOnBreakr.toFixed(0)} meses no Breakr`,
            action: 'Pedir testemunho + permissão pra divulgar (com print das métricas)',
          });
        }

        // 3. CHURN RISK
        // Critical OU (risk + inativo >14 dias)
        if (
          health.health === 'critical' ||
          (health.health === 'risk' && health.daysSinceActivity > 14 && isFinite(health.daysSinceActivity))
        ) {
          let urgency = 'situação crítica';
          if (health.revenueChange < -25 && health.prevRevenue > 0) {
            urgency = `faturamento despencando (${health.revenueChange}%)`;
          } else if (health.daysSinceActivity > 30 && isFinite(health.daysSinceActivity)) {
            urgency = `inativo há ${health.daysSinceActivity} dias`;
          } else if (health.hasFinancialData && lucro < 0) {
            urgency = `em prejuízo (${lucro}%)`;
          } else if (health.cmvPct > 40) {
            urgency = `CMV crítico ${health.cmvPct}%`;
          }

          // Score = -lucro (mais negativo = pior = maior prioridade)
          // Sem lucro disponível, usa CMV-30 como proxy de gravidade
          const churnScore = health.hasFinancialData
            ? -lucro
            : Math.max(0, health.cmvPct - 30);

          items.push({
            type: 'churn_risk',
            client, logo, cuisine,
            score: churnScore,
            title: 'Risco de cancelamento',
            reason: urgency,
            action: 'Ligar HOJE — entender bloqueador + oferecer suporte hands-on',
          });
        }

        // 4. CONSULTORIA OPPORTUNITY
        // CMV >35 + cardápio razoável + ainda ativo (cliente vai engajar)
        if (
          health.cmvPct > 35 &&
          health.fichasTotal >= 10 &&
          health.daysSinceActivity <= 14 &&
          isFinite(health.daysSinceActivity)
        ) {
          const fichasCriticas = countFichasCriticas(data);
          items.push({
            type: 'consultoria',
            client, logo, cuisine,
            score: health.cmvPct - 30,                    // mais alto CMV = mais $ em jogo
            title: 'Oportunidade de consultoria',
            reason: `CMV ${health.cmvPct}% (saudável <32%)${fichasCriticas > 0 ? `, ${fichasCriticas} prato${fichasCriticas !== 1 ? 's' : ''} com margem apertada` : ''}`,
            action: 'Oferecer consultoria de revisão de cardápio (ajuste de preços e custos)',
          });
        }
      } catch (e) {
        // Cliente com dados malformados — ignora silenciosamente
        if (typeof console !== 'undefined' && console.warn) {
          console.warn('OpportunityDetector: cliente ignorado por dados inválidos:', client?.name, e);
        }
      }
    });

    // Ordena: por tipo, depois score desc, depois nome (estável)
    items.sort((a, b) => {
      if (a.type !== b.type) return a.type.localeCompare(b.type);
      if (b.score !== a.score) return b.score - a.score;
      return (a.client.name || '').localeCompare(b.client.name || '');
    });
    return items;
  }, [clients]);

  const counts = useMemo(() => ({
    upsell: opportunities.filter(o => o.type === 'upsell').length,
    case_study: opportunities.filter(o => o.type === 'case_study').length,
    churn_risk: opportunities.filter(o => o.type === 'churn_risk').length,
    consultoria: opportunities.filter(o => o.type === 'consultoria').length,
  }), [opportunities]);

  const total = opportunities.length;

  const filtered = useMemo(
    () => opportunities.filter(o => o.type === activeTab),
    [opportunities, activeTab]
  );

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className="bg-gradient-to-br from-[#1a1325] via-[#141416] to-[#0F0F11] border border-white/[0.06] rounded-[18px] mb-6 overflow-hidden"
    >
      {/* Header */}
      <div className="flex items-center justify-between p-5 pb-3">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-full bg-[#A78BFA]/15 flex items-center justify-center text-[18px]">
            💎
          </div>
          <div>
            <div className="text-[15px] font-bold text-white">
              Oportunidades Detectadas
            </div>
            <div className="text-[11px] text-[#868686] mt-0.5">
              {total === 0
                ? 'Nenhuma oportunidade detectada no portfólio agora.'
                : `${total} ação${total !== 1 ? 'ões' : ''} comercial${total !== 1 ? 'is' : ''} possível${total !== 1 ? 'is' : ''} no portfólio`}
            </div>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-2 px-5 pb-3 flex-wrap">
        {Object.keys(TYPE_STYLES).map(type => {
          const style = TYPE_STYLES[type];
          const count = counts[type];
          const isActive = activeTab === type;
          return (
            <button
              key={type}
              type="button"
              onClick={() => setActiveTab(type)}
              aria-pressed={isActive}
              className={`text-[11px] font-semibold px-3 py-1.5 rounded-full transition-colors flex items-center gap-1.5 ${
                isActive
                  ? `${style.bg} ${style.text} border ${style.border}`
                  : 'bg-white/[0.04] text-[#868686] hover:bg-white/[0.08] border border-transparent'
              }`}
            >
              <span>{style.icon}</span>
              <span>{style.label}</span>
              <span className={isActive ? '' : 'text-[#666]'}>({count})</span>
            </button>
          );
        })}
      </div>

      {/* List */}
      <div className="px-5 pb-5 max-h-[480px] overflow-y-auto space-y-2">
        {filtered.length === 0 ? (
          /* Estado vazio honesto (BAH-096 #2): ausência de oportunidades é um
             resultado válido, não erro. O bot escaneou o portfólio e não
             encontrou nada que se qualifique pra esta categoria agora. */
          <div className="flex flex-col items-center text-center py-10 gap-2">
            <div className="w-9 h-9 rounded-full bg-[#00B37E]/10 flex items-center justify-center text-[15px]">✓</div>
            <p className="text-[12px] text-[#999] font-medium">
              Nenhuma oportunidade de {TYPE_STYLES[activeTab].label.toLowerCase()} no momento
            </p>
            <p className="text-[11px] text-[#5A5A5A] max-w-[340px] leading-snug">
              O portfólio foi escaneado e nada se qualificou pra esta categoria —
              isso é normal. Volte conforme os clientes evoluírem.
            </p>
          </div>
        ) : (
          filtered.slice(0, 25).map((opp, idx) => (
            <OpportunityCard
              key={`${opp.client.id}-${opp.type}-${idx}`}
              opportunity={opp}
              onOpen={() => onClientClick?.(opp.client, opp.type)}
            />
          ))
        )}
        {filtered.length > 25 && (
          <div className="text-[10px] text-[#666] text-center pt-2">
            Mostrando 25 de {filtered.length}.
          </div>
        )}
      </div>
    </motion.div>
  );
};

const OpportunityCard = ({ opportunity, onOpen }) => {
  const style = TYPE_STYLES[opportunity.type] || TYPE_STYLES.upsell;
  const [imgFailed, setImgFailed] = useState(false);
  const priority = priorityBadge(opportunity.type, opportunity.score);

  return (
    <motion.button
      type="button"
      initial={{ opacity: 0, x: -10 }}
      animate={{ opacity: 1, x: 0 }}
      onClick={onOpen}
      aria-label={`Abrir cliente ${opportunity.client.name}: ${opportunity.title}`}
      className={`group flex items-start gap-3 p-3 rounded-[12px] border ${style.border} ${style.bg} hover:bg-white/[0.04] transition-colors cursor-pointer text-left w-full`}
    >
      {/* Avatar */}
      <div className="shrink-0">
        {opportunity.logo && !imgFailed ? (
          <img
            src={opportunity.logo}
            alt={opportunity.client.name}
            className="w-10 h-10 rounded-full object-cover bg-white/[0.04]"
            onError={() => setImgFailed(true)}
          />
        ) : (
          <div className={`w-10 h-10 rounded-full ${style.bg} ${style.text} flex items-center justify-center text-[13px] font-bold`}>
            {(opportunity.client.name || '?').charAt(0).toUpperCase()}
          </div>
        )}
      </div>

      {/* Content */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-1 flex-wrap">
          <span className="text-[12px] font-bold text-white truncate">
            {opportunity.client.name || 'Cliente sem nome'}
          </span>
          <span className={`text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded ${style.badge}`}>
            {style.icon} {style.label}
          </span>
          <span className={`text-[10px] font-semibold ${priority.tone}`}>
            {priority.label}
          </span>
        </div>
        <div className={`text-[12px] font-semibold ${style.text} mb-1`}>
          {opportunity.title}
        </div>
        <div className="text-[11px] text-[#999] mb-1 leading-snug flex items-start gap-1.5">
          <span className="shrink-0">💡</span>
          <span className="italic">{opportunity.reason}</span>
        </div>
        <div className="text-[11px] text-[#868686] leading-snug flex items-start gap-1.5">
          <span className="shrink-0">🎯</span>
          <span>
            <span className="text-[#666]">Sugestão: </span>
            <span className="text-[#CCC]">{opportunity.action}</span>
          </span>
        </div>
      </div>

      {/* Open button */}
      <div className="shrink-0 opacity-0 group-hover:opacity-100 transition-opacity self-center">
        <div className={`text-[10px] font-bold ${style.text} ${style.bg} px-2.5 py-1.5 rounded-md whitespace-nowrap border ${style.border}`}>
          Abrir →
        </div>
      </div>
    </motion.button>
  );
};

export default OpportunityDetector;
