/**
 * CuisineBenchmarks — Benchmarks por Tipo de Cozinha (item 2.3 do plano).
 *
 * Agrupa os restaurantes do portfólio por tipo de cozinha (Hamburgueria,
 * Pizzaria, Japonesa, etc.) e mostra estatísticas agregadas pra cada grupo:
 *  - CMV médio
 *  - BASE médio
 *  - Lucro líquido médio
 *  - Ticket médio (com fallback heurístico — ver computeTicketMedio)
 *  - % de vendas via marketplace
 *  - Score médio (heurística simples baseada em saúde)
 *  - Top 3 lucrativos + top 3 em risco do grupo
 *
 * Visual:
 *  - Cada cozinha = card colapsável (accordion). Click no header expande
 *    detalhes (top lucrativos + em risco).
 *  - Botão "Comparar tipos" no topo abre tabela comparativa (modal embed).
 *  - Click num restaurante chama onCuisineClick(cuisineType, [restaurantes]).
 *
 * Útil pra admin responder: "qual cozinha é mais lucrativa em média?"
 * "essa hamburgueria com CMV 38% é normal pro segmento ou está acima?"
 *
 * Fallback de ticket médio:
 *  Não temos campo direto "ticket médio" no client.data. Calculamos via:
 *   1) Se há fichas com vendas mensais > 0: faturamento / total de vendas mensais
 *   2) Caso contrário: currentRevenue / 30 dias / 50 clientes/dia (heurística
 *      pra restaurante pequeno-médio brasileiro). É claramente uma estimativa
 *      grosseira, mas dá ordem de grandeza.
 *   3) Sem faturamento: '—'
 */

import { useMemo, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion'; // eslint-disable-line no-unused-vars
import { computeClientHealth } from '../../utils/clientHealth';

// Mapeamento emoji por cozinha (case-insensitive na resolução)
const CUISINE_EMOJI = {
  hamburgueria: '🍔',
  pizzaria: '🍕',
  japonesa: '🍱',
  italiana: '🍝',
  brasileira: '🇧🇷',
  pastelaria: '🥟',
  cafeteria: '☕',
  doceria: '🧁',
  padaria: '🥖',
  bar: '🍺',
  pub: '🍺',
  'bar/pub': '🍺',
  steakhouse: '🥩',
  'frutos do mar': '🦐',
  asiatica: '🥢',
  'asiática': '🥢',
  arabe: '🥙',
  'árabe': '🥙',
  mexicana: '🌮',
  vegetariana: '🥗',
  vegana: '🥗',
  'vegetariana/vegana': '🥗',
  bistro: '🍷',
  bistrô: '🍷',
  buffet: '🍽️',
  outros: '🍴',
  'não informado': '🍴',
  'nao informado': '🍴',
};

const emojiFor = (cuisine) => {
  if (!cuisine) return '🍴';
  const key = String(cuisine).trim().toLowerCase();
  if (CUISINE_EMOJI[key]) return CUISINE_EMOJI[key];
  // tenta match parcial (ex: "Hamburgueria Artesanal" -> "hamburgueria")
  for (const k of Object.keys(CUISINE_EMOJI)) {
    if (key.includes(k)) return CUISINE_EMOJI[k];
  }
  return '🍴';
};

const parseClientData = (c) => {
  try {
    return typeof c.data === 'string' ? JSON.parse(c.data || '{}') : (c.data || {});
  } catch {
    return {};
  }
};

const parseValue = (val) => {
  if (val == null) return 0;
  if (typeof val === 'number') return val;
  let s = String(val).replace(/R\$/g, '').trim();
  if (s.includes(',') && s.includes('.')) s = s.replace(/\./g, '').replace(',', '.');
  else if (s.includes(',')) s = s.replace(',', '.');
  return parseFloat(s) || 0;
};

const fmtBRL = (n) => {
  const v = Number(n) || 0;
  if (v >= 1000000) return `R$ ${(v / 1000000).toFixed(1)}M`;
  if (v >= 1000) return `R$ ${(v / 1000).toFixed(1)}k`;
  return `R$ ${v.toFixed(0)}`;
};

const fmtTicket = (n) => {
  if (n == null || n <= 0) return '—';
  return `R$ ${n.toFixed(0)}`;
};

/**
 * Score heurístico (0-100) por cliente — combina saúde financeira + maturidade.
 * Baseado em sinais já presentes em computeClientHealth.
 */
const scoreFor = (h) => {
  if (!h) return 0;
  let score = 50;
  // Saúde financeira
  if (h.health === 'healthy') score += 25;
  else if (h.health === 'tight') score += 10;
  else if (h.health === 'risk') score -= 10;
  else if (h.health === 'critical') score -= 25;
  // Lucro líquido
  if (h.hasFinancialData && h.lucroLiqPct != null) {
    if (h.lucroLiqPct >= 8) score += 10;
    else if (h.lucroLiqPct < 0) score -= 15;
  }
  // Maturidade
  if (h.cardapioMaturidadePct >= 80) score += 10;
  else if (h.cardapioMaturidadePct < 30) score -= 5;
  // Engajamento
  if (h.daysSinceActivity > 30) score -= 5;
  // Tendência receita
  if (h.revenueChange > 5) score += 5;
  else if (h.revenueChange < -15) score -= 10;
  return Math.max(0, Math.min(100, Math.round(score)));
};

/**
 * Calcula ticket médio individual.
 * 1) Se há fichas com vendas mensais e preço de venda: ticket = receita ponderada / vendas total.
 *    Mais preciso porque usa o cardápio real.
 * 2) Senão, fallback grosseiro: currentRevenue / 30 dias / 50 clientes-dia.
 * 3) Sem faturamento: null.
 */
const computeTicketMedio = (data, health) => {
  const fichas = data?.operational?.fichas || [];
  let totalSales = 0, totalRevenue = 0;
  fichas.forEach(f => {
    const vendas = parseInt(f.vendasMes, 10) || 0;
    const preco = parseValue(f.precoVenda);
    if (vendas > 0 && preco > 0) {
      totalSales += vendas;
      totalRevenue += vendas * preco;
    }
  });
  if (totalSales > 0) return totalRevenue / totalSales;
  // Fallback heurístico
  const rev = health?.currentRevenue || 0;
  if (rev > 0) {
    const ASSUMED_CUSTOMERS_PER_DAY = 50;
    return rev / 30 / ASSUMED_CUSTOMERS_PER_DAY;
  }
  return null;
};

/**
 * Normaliza nome de cozinha (capitaliza, agrupa "Outros" / "Não informado")
 */
const normalizeCuisine = (raw) => {
  if (!raw || !String(raw).trim()) return 'Não informado';
  const trimmed = String(raw).trim();
  // Lowercase comum -> Capitalizado
  return trimmed.charAt(0).toUpperCase() + trimmed.slice(1);
};

const colorForCmv = (v) => (v <= 32 ? '#00B37E' : v <= 38 ? '#F5A623' : '#FF4560');
const colorForBase = (v) => (v <= 55 ? '#00B37E' : v <= 65 ? '#F5A623' : '#FF4560');
const colorForLucro = (v) => {
  if (v == null) return '#666';
  if (v >= 8) return '#00B37E';
  if (v >= 3) return '#F5A623';
  return '#FF4560';
};
const colorForMkt = (v) => (v <= 20 ? '#00B37E' : v <= 30 ? '#F5A623' : '#FF4560');
const colorForScore = (v) => (v >= 70 ? '#00B37E' : v >= 50 ? '#F5A623' : '#FF4560');

const labelCmv = (v) => (v <= 32 ? 'saudável' : v <= 38 ? 'apertado' : 'risco');
const labelBase = (v) => (v <= 55 ? 'saudável' : v <= 65 ? 'apertado' : 'crítico');
const labelLucro = (v) => {
  if (v == null) return '—';
  if (v >= 8) return 'bom';
  if (v >= 3) return 'apertado';
  if (v >= 0) return 'risco';
  return 'prejuízo';
};
const labelMkt = (v) => (v <= 20 ? 'saudável' : v <= 30 ? 'atenção' : 'dependência');

const CuisineBenchmarks = ({ clients = [], onCuisineClick }) => {
  const [expanded, setExpanded] = useState(null); // cuisine name expandido
  const [showCompare, setShowCompare] = useState(false);

  const groups = useMemo(() => {
    const list = Array.isArray(clients) ? clients : [];
    const buckets = new Map(); // cuisine -> [{ client, data, health, ticket, score }]

    list.forEach(c => {
      const data = parseClientData(c);
      const health = computeClientHealth(data);
      if (!health) return; // sem dados parseáveis, pula
      const fd = data?.formData || {};
      const rawCuisine = fd.identity?.cuisine_type || fd.cuisine_type || '';
      const cuisine = normalizeCuisine(rawCuisine);
      const ticket = computeTicketMedio(data, health);
      const score = scoreFor(health);
      const entry = { client: c, data, health, ticket, score };
      if (!buckets.has(cuisine)) buckets.set(cuisine, []);
      buckets.get(cuisine).push(entry);
    });

    // Para cada bucket, calcula agregados
    const result = [];
    buckets.forEach((entries, cuisine) => {
      if (entries.length === 0) return;
      const n = entries.length;

      // Médias usando apenas restaurantes com dados financeiros pra CMV/lucro
      const withFin = entries.filter(e => e.health.hasFinancialData);
      const cmvAvg = withFin.length > 0
        ? withFin.reduce((a, e) => a + e.health.cmvPct, 0) / withFin.length
        : null;
      const lucroAvg = withFin.length > 0
        ? withFin.reduce((a, e) => a + (e.health.lucroLiqPct || 0), 0) / withFin.length
        : null;
      // BASE existe pra todos com onboarding
      const baseAvg = entries.reduce((a, e) => a + e.health.basePct, 0) / n;
      const mktAvg = entries.reduce((a, e) => a + e.health.marketplaceSalesPct, 0) / n;
      const scoreAvg = entries.reduce((a, e) => a + e.score, 0) / n;
      // Ticket médio: média dos que têm valor definido
      const withTicket = entries.filter(e => e.ticket != null && e.ticket > 0);
      const ticketAvg = withTicket.length > 0
        ? withTicket.reduce((a, e) => a + e.ticket, 0) / withTicket.length
        : null;

      // Top 3 lucrativos (por score) + Top 3 em risco (menor score)
      const sorted = [...entries].sort((a, b) => b.score - a.score);
      const topLucrativos = sorted.slice(0, 3);
      const emRisco = [...entries]
        .filter(e => e.health.health === 'risk' || e.health.health === 'critical' || e.score < 50)
        .sort((a, b) => a.score - b.score)
        .slice(0, 3);

      result.push({
        cuisine,
        emoji: emojiFor(cuisine),
        count: n,
        cmvAvg: cmvAvg != null ? +cmvAvg.toFixed(1) : null,
        baseAvg: +baseAvg.toFixed(1),
        lucroAvg: lucroAvg != null ? +lucroAvg.toFixed(1) : null,
        mktAvg: +mktAvg.toFixed(1),
        scoreAvg: Math.round(scoreAvg),
        ticketAvg,
        entries,
        topLucrativos,
        emRisco,
      });
    });

    // Ordena por count desc, depois por score desc
    result.sort((a, b) => b.count - a.count || b.scoreAvg - a.scoreAvg);
    return result;
  }, [clients]);

  const total = groups.reduce((a, g) => a + g.count, 0);

  const handleHeaderClick = (cuisine) => {
    setExpanded(prev => (prev === cuisine ? null : cuisine));
  };

  const handleClientClick = (e, cuisine, entries) => {
    e.stopPropagation();
    if (typeof onCuisineClick === 'function') {
      onCuisineClick(cuisine, entries.map(en => en.client));
    }
  };

  // Helper de label de cliente
  const clientLabel = (entry, idx) => {
    const fd = entry.data?.formData || {};
    return (
      entry.client.name ||
      fd.identity?.business_name ||
      fd.business_name ||
      entry.client.email ||
      `Cliente #${entry.client.id || idx + 1}`
    );
  };

  return (
    <div className="mb-6">
      {/* Header */}
      <div className="flex items-end justify-between mb-3 flex-wrap gap-2">
        <div>
          <h2 className="text-[16px] font-bold text-white">Benchmarks por Tipo de Cozinha</h2>
          <p className="text-[11px] text-[#868686]">
            Médias agregadas por segmento — CMV, BASE, ticket, lucro
          </p>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-[11px] text-[#666]">
            {total} {total === 1 ? 'restaurante' : 'restaurantes'} · {groups.length}{' '}
            {groups.length === 1 ? 'cozinha' : 'cozinhas'}
          </span>
          {groups.length > 1 && (
            <button
              type="button"
              onClick={() => setShowCompare(s => !s)}
              className="text-[11px] font-semibold text-white bg-white/[0.06] hover:bg-white/[0.10] border border-white/[0.10] px-3 py-1.5 rounded-[10px] transition-colors"
            >
              {showCompare ? 'Fechar comparação' : 'Comparar tipos'}
            </button>
          )}
        </div>
      </div>

      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        className="bg-gradient-to-br from-[#141416] to-[#0F0F11] border border-white/[0.06] rounded-[18px] p-5"
      >
        {groups.length === 0 ? (
          <div className="text-[12px] text-[#666] py-8 text-center">
            Sem clientes no portfólio para gerar benchmarks.
          </div>
        ) : (
          <>
            {/* Tabela comparativa */}
            <AnimatePresence>
              {showCompare && (
                <motion.div
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: 'auto' }}
                  exit={{ opacity: 0, height: 0 }}
                  className="mb-4 overflow-hidden"
                >
                  <div className="rounded-[12px] border border-white/[0.06] overflow-x-auto">
                    <table className="w-full text-[11px] text-left">
                      <thead className="bg-white/[0.03] text-[#868686] font-semibold">
                        <tr>
                          <th className="px-3 py-2.5">Cozinha</th>
                          <th className="px-3 py-2.5 text-center">N</th>
                          <th className="px-3 py-2.5 text-right">CMV</th>
                          <th className="px-3 py-2.5 text-right">BASE</th>
                          <th className="px-3 py-2.5 text-right">Ticket</th>
                          <th className="px-3 py-2.5 text-right">Lucro</th>
                          <th className="px-3 py-2.5 text-right">Score</th>
                          <th className="px-3 py-2.5 text-right">Mkt %</th>
                        </tr>
                      </thead>
                      <tbody className="text-white tabular-nums">
                        {groups.map((g) => (
                          <tr key={g.cuisine} className="border-t border-white/[0.04]">
                            <td className="px-3 py-2 font-semibold">
                              <span className="mr-1.5">{g.emoji}</span>
                              {g.cuisine}
                            </td>
                            <td className="px-3 py-2 text-center text-[#868686]">{g.count}</td>
                            <td className="px-3 py-2 text-right" style={{ color: g.cmvAvg != null ? colorForCmv(g.cmvAvg) : '#666' }}>
                              {g.cmvAvg != null ? `${g.cmvAvg}%` : '—'}
                            </td>
                            <td className="px-3 py-2 text-right" style={{ color: colorForBase(g.baseAvg) }}>
                              {g.baseAvg}%
                            </td>
                            <td className="px-3 py-2 text-right">{fmtTicket(g.ticketAvg)}</td>
                            <td className="px-3 py-2 text-right" style={{ color: colorForLucro(g.lucroAvg) }}>
                              {g.lucroAvg != null ? `${g.lucroAvg}%` : '—'}
                            </td>
                            <td className="px-3 py-2 text-right" style={{ color: colorForScore(g.scoreAvg) }}>
                              {g.scoreAvg}
                            </td>
                            <td className="px-3 py-2 text-right" style={{ color: colorForMkt(g.mktAvg) }}>
                              {g.mktAvg}%
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>

            {/* Accordion */}
            <div className="space-y-2.5">
              {groups.map((g) => {
                const isOpen = expanded === g.cuisine;
                return (
                  <div
                    key={g.cuisine}
                    className={`rounded-[12px] border transition-all ${
                      isOpen
                        ? 'border-white/[0.20] bg-white/[0.04]'
                        : 'border-white/[0.04] hover:border-white/[0.10] hover:bg-white/[0.02]'
                    }`}
                  >
                    {/* Header */}
                    <button
                      type="button"
                      onClick={() => handleHeaderClick(g.cuisine)}
                      className="w-full text-left p-3"
                    >
                      <div className="flex items-center gap-3 mb-2 flex-wrap">
                        <span className="text-[20px]" aria-hidden>{g.emoji}</span>
                        <span className="text-[13px] font-bold text-white">{g.cuisine}</span>
                        <span className="text-[11px] text-[#868686]">
                          — {g.count} {g.count === 1 ? 'restaurante' : 'restaurantes'}
                        </span>
                        <span className="ml-auto text-[#868686] text-[14px]">
                          {isOpen ? '▲' : '▼'}
                        </span>
                      </div>

                      {/* Mini-KPIs */}
                      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2 text-[11px]">
                        <Metric
                          label="CMV"
                          value={g.cmvAvg != null ? `${g.cmvAvg}%` : '—'}
                          tag={g.cmvAvg != null ? labelCmv(g.cmvAvg) : null}
                          color={g.cmvAvg != null ? colorForCmv(g.cmvAvg) : '#666'}
                        />
                        <Metric
                          label="BASE"
                          value={`${g.baseAvg}%`}
                          tag={labelBase(g.baseAvg)}
                          color={colorForBase(g.baseAvg)}
                        />
                        <Metric
                          label="Ticket"
                          value={fmtTicket(g.ticketAvg)}
                          color="#F5A623"
                        />
                        <Metric
                          label="Lucro líq"
                          value={g.lucroAvg != null ? `${g.lucroAvg}%` : '—'}
                          tag={g.lucroAvg != null ? labelLucro(g.lucroAvg) : null}
                          color={colorForLucro(g.lucroAvg)}
                        />
                        <Metric
                          label="iFood %"
                          value={`${g.mktAvg}%`}
                          tag={labelMkt(g.mktAvg)}
                          color={colorForMkt(g.mktAvg)}
                        />
                        <Metric
                          label="Score médio"
                          value={`${g.scoreAvg}`}
                          color={colorForScore(g.scoreAvg)}
                        />
                      </div>
                    </button>

                    {/* Expanded body */}
                    <AnimatePresence>
                      {isOpen && (
                        <motion.div
                          initial={{ opacity: 0, height: 0 }}
                          animate={{ opacity: 1, height: 'auto' }}
                          exit={{ opacity: 0, height: 0 }}
                          className="overflow-hidden"
                        >
                          <div className="px-3 pb-3 pt-1 grid grid-cols-1 md:grid-cols-2 gap-4 border-t border-white/[0.04]">
                            <div>
                              <h4 className="text-[10px] font-bold uppercase tracking-wider text-[#00B37E] mb-1.5 mt-2">
                                Top 3 lucrativos
                              </h4>
                              {g.topLucrativos.length === 0 ? (
                                <p className="text-[11px] text-[#666]">—</p>
                              ) : (
                                <ul className="space-y-1">
                                  {g.topLucrativos.map((entry, i) => (
                                    <ClientRow
                                      key={entry.client.id || entry.client.email || i}
                                      entry={entry}
                                      idx={i}
                                      label={clientLabel(entry, i)}
                                      onClick={(e) => handleClientClick(e, g.cuisine, [entry])}
                                    />
                                  ))}
                                </ul>
                              )}
                            </div>
                            <div>
                              <h4 className="text-[10px] font-bold uppercase tracking-wider text-[#FF4560] mb-1.5 mt-2">
                                Em risco
                              </h4>
                              {g.emRisco.length === 0 ? (
                                <p className="text-[11px] text-[#666]">Nenhum em risco</p>
                              ) : (
                                <ul className="space-y-1">
                                  {g.emRisco.map((entry, i) => (
                                    <ClientRow
                                      key={entry.client.id || entry.client.email || i}
                                      entry={entry}
                                      idx={i}
                                      label={clientLabel(entry, i)}
                                      onClick={(e) => handleClientClick(e, g.cuisine, [entry])}
                                    />
                                  ))}
                                </ul>
                              )}
                            </div>

                            {/* Footer extra: faturamento agregado e ver todos */}
                            <div className="md:col-span-2 flex items-center justify-between flex-wrap gap-2 pt-2 border-t border-white/[0.04]">
                              <div className="text-[10px] text-[#666]">
                                Faturamento agregado:{' '}
                                <span className="text-white font-semibold">
                                  {fmtBRL(
                                    g.entries.reduce(
                                      (a, e) => a + (e.health.currentRevenue || 0),
                                      0
                                    )
                                  )}
                                </span>
                              </div>
                              <button
                                type="button"
                                onClick={(e) => handleClientClick(e, g.cuisine, g.entries)}
                                className="text-[10px] font-semibold text-[#F5A623] hover:text-[#FF9406] px-2 py-1 rounded transition-colors"
                              >
                                Ver todos os {g.count} →
                              </button>
                            </div>
                          </div>
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>
                );
              })}
            </div>
          </>
        )}
      </motion.div>
    </div>
  );
};

/**
 * Mini KPI inline (label / valor / tag colorida opcional)
 */
const Metric = ({ label, value, tag, color }) => (
  <div className="flex flex-col gap-0.5">
    <span className="text-[9px] uppercase tracking-wider text-[#666]">{label}</span>
    <div className="flex items-baseline gap-1.5 flex-wrap">
      <span className="text-[12px] font-bold tabular-nums" style={{ color }}>
        {value}
      </span>
      {tag && (
        <span
          className="text-[8px] font-semibold px-1 py-0.5 rounded"
          style={{ color, backgroundColor: `${color}1A` }}
        >
          {tag}
        </span>
      )}
    </div>
  </div>
);

const ClientRow = ({ entry, label, onClick }) => {
  const score = entry.score;
  return (
    <li>
      <button
        type="button"
        onClick={onClick}
        className="w-full flex items-center gap-2 p-1.5 rounded-[8px] bg-white/[0.02] hover:bg-white/[0.06] border border-white/[0.04] transition-colors text-left"
      >
        <div className="w-6 h-6 rounded-full bg-gradient-to-br from-[#F5A623]/30 to-[#FF9406]/30 ring-1 ring-white/[0.08] flex items-center justify-center text-[9px] font-bold text-white flex-shrink-0">
          {String(label).charAt(0).toUpperCase()}
        </div>
        <span className="text-[11px] font-medium text-white truncate flex-1">{label}</span>
        <span
          className="text-[10px] font-bold tabular-nums px-1.5 py-0.5 rounded"
          style={{ color: colorForScore(score), backgroundColor: `${colorForScore(score)}1A` }}
        >
          {score}
        </span>
      </button>
    </li>
  );
};

export default CuisineBenchmarks;
