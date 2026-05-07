/**
 * MarginHunter — Caçador de Margem Perdida (item 4.3 do plano admin).
 *
 * Bot que escaneia TODAS as fichas de TODOS os clientes pra detectar
 * oportunidades onde o restaurante está deixando dinheiro na mesa.
 * É um insight ÚNICO da Breakr — só faz sentido com visão cross-client.
 *
 * Regra de ouro da gastronomia: preço de venda ~ 3x custo (CMV ~33%).
 *
 * Detecções (por ficha, agregadas por cliente):
 *  1. CMV crítico (>40%): margem perdida = vendasMes × (custo×2.5 - preco)
 *  2. Preço sub-3x custo: ganho potencial = vendasMes × (custo×3 - preco)
 *  3. Ficha incompleta: custo OU preco zero (não dá pra calcular)
 *  4. Insumo com discrepância: mesmo nome com spread > 30% entre clientes
 *
 * Cada item é clicável e abre o cliente correspondente via onClientClick.
 *
 * Constraints honoradas:
 *  - Pure component, useMemo em todas as agregações
 *  - parseValue local consistente com clientHealth.js
 *  - Tailwind alinhado com AggregatedMenuInsights e demais admin cards
 *  - Empty/sparse data tratado com EmptyHint
 *  - Top 20 / Top 10 com botão "Ver todos" pra expandir
 */

import { useMemo, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion'; // eslint-disable-line no-unused-vars

const CRITICAL_CMV_RATIO = 0.40; // CMV individual > 40% é crítico
const TARGET_PRICE_MULTIPLIER = 3; // preço ideal = 3 × custo
const FAIR_PRICE_MULTIPLIER = 2.5; // ganho recuperável vs preço "decente"
const MIN_INSUMO_SPREAD_PCT = 30; // discrepância de insumos
const MIN_INSUMO_RESTAURANTS = 3; // insumo precisa estar em ≥3 clientes
const TOP_FICHAS_LIMIT = 20;
const TOP_CLIENTS_LIMIT = 10;
const TOP_INSUMOS_LIMIT = 10;

// -- Helpers --------------------------------------------------------------

const parseClientData = (c) => {
  if (!c) return {};
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
  const n = parseFloat(s);
  return isFinite(n) ? n : 0;
};

const parseInteger = (val) => {
  const n = parseInt(val, 10);
  return isFinite(n) ? n : 0;
};

const fmtBRL = (n) => {
  const v = Number(n) || 0;
  return `R$ ${v.toFixed(2).replace('.', ',')}`;
};

const fmtBRLShort = (n) => {
  const v = Number(n) || 0;
  if (v >= 1000) return `R$ ${(v / 1000).toFixed(1)}k`;
  return `R$ ${v.toFixed(0)}`;
};

const getClientLabel = (c) => {
  if (!c) return 'Cliente';
  const data = parseClientData(c);
  return (
    data?.formData?.identity?.business_name ||
    data?.formData?.business_name ||
    data?.restaurant?.name ||
    c.businessName ||
    c.name ||
    c.email ||
    'Cliente'
  );
};

// Normalização leve pra agrupar insumos com nomes parecidos (case/acentos)
const stripAccents = (s) =>
  // U+0300 to U+036F = combining diacritical marks
  s.normalize('NFD').replace(/[̀-ͯ]/g, '');

const normalizeInsumoKey = (raw, unit) => {
  if (!raw) return '';
  let s = String(raw).toLowerCase().trim();
  s = stripAccents(s);
  s = s.replace(/[^\p{L}\p{N}\s]/gu, ' ').replace(/\s+/g, ' ').trim();
  const u = String(unit || '').toLowerCase().trim();
  if (!s) return '';
  return `${s}|${u}`;
};

// -- Aggregations ---------------------------------------------------------

/**
 * Varre fichas dos clientes, devolve:
 *  - critical: fichas com CMV > 40% (com margem perdida calculada)
 *  - subThree: fichas com preço < 3x custo (ganho até 3x calculado)
 *  - incompleteByClient: contagem de fichas sem custo/preço por cliente
 *  - clientPotential: total recuperável agregado por cliente
 */
const aggregateFichas = (clients) => {
  const critical = [];
  const subThree = [];
  const incompleteByClient = new Map(); // clientId -> { client, count }
  const clientPotential = new Map(); // clientId -> { client, recoverable, criticalCount, subThreeCount }

  const bumpClient = (client, key, delta) => {
    const cKey = String(client.id || client.email || getClientLabel(client));
    if (!clientPotential.has(cKey)) {
      clientPotential.set(cKey, {
        client,
        clientKey: cKey,
        recoverable: 0,
        criticalCount: 0,
        subThreeCount: 0,
        incompleteCount: 0,
      });
    }
    const entry = clientPotential.get(cKey);
    entry[key] = (entry[key] || 0) + delta;
    return entry;
  };

  clients.forEach((c) => {
    if (!c) return;
    const data = parseClientData(c);
    const fichas = Array.isArray(data?.operational?.fichas) ? data.operational.fichas : [];

    fichas.forEach((f) => {
      if (!f) return;
      const nome = f.nome || f.name || 'Sem nome';
      const custo = parseValue(f.custoTotal);
      const preco = parseValue(f.precoVenda);
      const vendas = parseInteger(f.vendasMes);

      // Ficha incompleta: custo OU preco zero
      if (custo <= 0 || preco <= 0) {
        const cKey = String(c.id || c.email || getClientLabel(c));
        if (!incompleteByClient.has(cKey)) {
          incompleteByClient.set(cKey, { client: c, clientKey: cKey, count: 0 });
        }
        incompleteByClient.get(cKey).count += 1;
        bumpClient(c, 'incompleteCount', 1);
        return;
      }

      const ratio = custo / preco; // CMV individual
      if (!isFinite(ratio)) return;

      // CMV crítico
      if (ratio > CRITICAL_CMV_RATIO) {
        const fairPrice = custo * FAIR_PRICE_MULTIPLIER;
        const lostPerMonth = vendas * Math.max(0, fairPrice - preco);
        critical.push({
          id: `${c.id || c.email || 'c'}::${nome}`,
          client: c,
          clientLabel: getClientLabel(c),
          ficha: nome,
          custo,
          preco,
          vendas,
          cmvPct: ratio * 100,
          lostPerMonth,
        });
        bumpClient(c, 'recoverable', lostPerMonth);
        bumpClient(c, 'criticalCount', 1);
      }

      // Sub-3x custo (cobre também o crítico, mas com base no 3x ideal)
      if (preco < TARGET_PRICE_MULTIPLIER * custo) {
        const idealPrice = custo * TARGET_PRICE_MULTIPLIER;
        const gainPerMonth = vendas * Math.max(0, idealPrice - preco);
        subThree.push({
          id: `${c.id || c.email || 'c'}::${nome}::3x`,
          client: c,
          clientLabel: getClientLabel(c),
          ficha: nome,
          custo,
          preco,
          vendas,
          cmvPct: ratio * 100,
          gainPerMonth,
        });
        // Não duplica recoverable do bucket crítico — o cliente potential
        // usa o cálculo do crítico (mais conservador). Aqui só conta count.
        bumpClient(c, 'subThreeCount', 1);
      }
    });
  });

  critical.sort((a, b) => b.lostPerMonth - a.lostPerMonth);
  subThree.sort((a, b) => b.gainPerMonth - a.gainPerMonth);

  const incompleteList = Array.from(incompleteByClient.values())
    .filter((e) => e.count > 0)
    .sort((a, b) => b.count - a.count);

  const clientRanking = Array.from(clientPotential.values())
    .filter((e) => e.recoverable > 0 || e.criticalCount > 0)
    .sort((a, b) => b.recoverable - a.recoverable);

  return { critical, subThree, incompleteList, clientRanking };
};

/**
 * Detecta insumos com discrepância de preço entre clientes (>30% spread).
 * Retorna lista ordenada por spread.
 */
const aggregateInsumoSpread = (clients) => {
  const groups = new Map(); // key -> { label, unit, entries: [{client, price}] }

  clients.forEach((c) => {
    if (!c) return;
    const data = parseClientData(c);
    const insumos = Array.isArray(data?.operational?.insumos) ? data.operational.insumos : [];
    const seenInClient = new Set();

    insumos.forEach((ins) => {
      if (!ins) return;
      const nome = ins.name || ins.nome;
      if (!nome) return;
      const price = parseValue(ins.price ?? ins.custo);
      if (price <= 0) return;
      const unit = ins.purchaseUnit || ins.unit || '';

      const key = normalizeInsumoKey(nome, unit);
      if (!key) return;

      if (!groups.has(key)) {
        groups.set(key, {
          key,
          unit,
          variants: [],
          entries: [],
          clientIds: new Set(),
        });
      }
      const g = groups.get(key);
      g.variants.push(nome);
      const cKey = String(c.id || c.email || getClientLabel(c));
      // Um preço por cliente — se duplicar, pega o mais caro (worst-case awareness)
      if (!seenInClient.has(key)) {
        seenInClient.add(key);
        g.entries.push({ client: c, clientKey: cKey, clientLabel: getClientLabel(c), price });
        g.clientIds.add(cKey);
      } else {
        const existing = g.entries.find((e) => e.clientKey === cKey);
        if (existing && price > existing.price) existing.price = price;
      }
    });
  });

  const result = [];
  groups.forEach((g) => {
    if (g.clientIds.size < MIN_INSUMO_RESTAURANTS) return;
    const prices = g.entries.map((e) => e.price);
    const min = Math.min(...prices);
    const max = Math.max(...prices);
    if (min <= 0) return;
    const spreadPct = ((max - min) / min) * 100;
    if (spreadPct < MIN_INSUMO_SPREAD_PCT) return;
    const avg = prices.reduce((a, p) => a + p, 0) / prices.length;
    // Cliente "caro" = quem paga acima de avg + maior gap
    const expensive = [...g.entries].sort((a, b) => b.price - a.price)[0];
    // Label = grafia mais comum
    const counts = new Map();
    g.variants.forEach((v) => counts.set(v, (counts.get(v) || 0) + 1));
    let label = g.variants[0];
    let bestCount = 0;
    counts.forEach((cnt, lab) => {
      if (cnt > bestCount) { label = lab; bestCount = cnt; }
    });
    result.push({
      key: g.key,
      label,
      unit: g.unit,
      min,
      max,
      avg,
      spreadPct,
      restaurants: g.clientIds.size,
      expensive,
    });
  });

  result.sort((a, b) => b.spreadPct - a.spreadPct);
  return result;
};

// -- Component ------------------------------------------------------------

const MarginHunter = ({ clients = [], onClientClick }) => {
  const [showAllCritical, setShowAllCritical] = useState(false);
  const [showAllIncomplete, setShowAllIncomplete] = useState(false);
  const [showAllInsumos, setShowAllInsumos] = useState(false);
  const [showRanking, setShowRanking] = useState(true);
  const [collapsed, setCollapsed] = useState({
    ranking: false,
    critical: false,
    incomplete: false,
    insumos: false,
  });

  const list = useMemo(
    () => (Array.isArray(clients) ? clients.filter(Boolean) : []),
    [clients]
  );

  const { critical, subThree, incompleteList, clientRanking } = useMemo(
    () => aggregateFichas(list),
    [list]
  );

  const insumoSpread = useMemo(() => aggregateInsumoSpread(list), [list]);

  const totalRecoverable = useMemo(
    () => clientRanking.reduce((acc, c) => acc + (c.recoverable || 0), 0),
    [clientRanking]
  );
  const totalCritical = critical.length;

  if (list.length === 0) {
    return (
      <div className="mb-6">
        <div className="bg-gradient-to-br from-[#141416] to-[#0F0F11] border border-white/[0.06] rounded-[18px] p-5">
          <h2 className="text-[16px] font-bold text-white mb-1">Caçador de Margem Perdida</h2>
          <p className="text-[12px] text-[#666] py-6 text-center">
            Sem clientes no portfólio para escanear fichas.
          </p>
        </div>
      </div>
    );
  }

  const noFindings =
    totalCritical === 0 && incompleteList.length === 0 && insumoSpread.length === 0;

  const visibleCritical = showAllCritical ? critical : critical.slice(0, TOP_FICHAS_LIMIT);
  const visibleIncomplete = showAllIncomplete
    ? incompleteList
    : incompleteList.slice(0, TOP_CLIENTS_LIMIT);
  const visibleInsumos = showAllInsumos
    ? insumoSpread
    : insumoSpread.slice(0, TOP_INSUMOS_LIMIT);

  const triggerClient = (client) => {
    if (typeof onClientClick === 'function' && client) onClientClick(client);
  };

  return (
    <div className="mb-6">
      <div className="flex items-end justify-between mb-3 flex-wrap gap-2">
        <div>
          <h2 className="text-[16px] font-bold text-white flex items-center gap-2">
            <span aria-hidden>💰</span>
            <span>Caçador de Margem Perdida</span>
          </h2>
          <p className="text-[11px] text-[#868686]">
            Bot escaneou {list.length} {list.length === 1 ? 'cliente' : 'clientes'} •{' '}
            <span className="text-[#00B37E] font-semibold">
              {fmtBRLShort(totalRecoverable)}/mês recuperável
            </span>{' '}
            • <span className="text-[#FF4560] font-semibold">{totalCritical} fichas críticas</span>
            {subThree.length > 0 && (
              <> • <span className="text-[#F5A623] font-semibold">{subThree.length} sub-3x</span></>
            )}
          </p>
        </div>
      </div>

      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        className="bg-gradient-to-br from-[#141416] to-[#0F0F11] border border-white/[0.06] rounded-[18px] p-5 space-y-6"
      >
        {noFindings ? (
          <EmptyHint>
            Nenhuma oportunidade detectada — fichas dos clientes estão com CMV saudável,
            sem dados faltando e sem grandes discrepâncias entre insumos.
          </EmptyHint>
        ) : null}

        {/* Ranking de clientes com maior potencial */}
        {clientRanking.length > 0 && (
          <Section
            icon="🏆"
            title="Top clientes com maior potencial recuperável"
            subtitle="Soma da margem perdida vs preço justo (custo × 2.5) das fichas críticas"
            collapsed={collapsed.ranking}
            onToggle={() => setCollapsed((s) => ({ ...s, ranking: !s.ranking }))}
          >
            {showRanking && (
              <ul className="space-y-1.5">
                {clientRanking.slice(0, TOP_CLIENTS_LIMIT).map((entry, i) => (
                  <li key={entry.clientKey}>
                    <button
                      type="button"
                      onClick={() => triggerClient(entry.client)}
                      className="w-full flex items-center gap-3 px-3 py-2 rounded-[10px] bg-white/[0.02] border border-white/[0.04] hover:bg-white/[0.05] hover:border-white/[0.10] transition-colors text-left"
                    >
                      <span className="text-[14px] font-bold text-[#F5A623] tabular-nums w-5 text-center">
                        {i + 1}
                      </span>
                      <span className="text-[12px] font-semibold text-white flex-1 truncate">
                        {getClientLabel(entry.client)}
                      </span>
                      <span className="text-[11px] tabular-nums text-[#00B37E] font-semibold w-28 text-right">
                        {fmtBRLShort(entry.recoverable)}/mês
                      </span>
                      <span className="text-[10px] text-[#868686] tabular-nums w-28 text-right">
                        {entry.criticalCount}{' '}
                        {entry.criticalCount === 1 ? 'ficha crítica' : 'fichas críticas'}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
            {clientRanking.length > TOP_CLIENTS_LIMIT && (
              <button
                type="button"
                onClick={() => setShowRanking((s) => !s)}
                className="text-[11px] text-[#868686] hover:text-white mt-2"
              >
                {clientRanking.length - TOP_CLIENTS_LIMIT} clientes adicionais não exibidos
              </button>
            )}
          </Section>
        )}

        {/* Pratos com CMV crítico (>40%) */}
        <Section
          icon="🚨"
          title={`Pratos com CMV crítico (>${(CRITICAL_CMV_RATIO * 100).toFixed(0)}%)`}
          subtitle={`Margem perdida assumindo preço justo = custo × ${FAIR_PRICE_MULTIPLIER}`}
          collapsed={collapsed.critical}
          onToggle={() => setCollapsed((s) => ({ ...s, critical: !s.critical }))}
        >
          {critical.length === 0 ? (
            <EmptyHint>
              Nenhuma ficha com CMV acima de {(CRITICAL_CMV_RATIO * 100).toFixed(0)}% no portfólio.
            </EmptyHint>
          ) : (
            <>
              <ul className="space-y-1.5">
                {visibleCritical.map((row, i) => (
                  <li key={row.id}>
                    <button
                      type="button"
                      onClick={() => triggerClient(row.client)}
                      className="w-full flex items-center gap-3 px-3 py-2 rounded-[10px] bg-white/[0.02] border border-white/[0.04] hover:bg-white/[0.05] hover:border-[#FF4560]/40 transition-colors text-left"
                    >
                      <span className="text-[12px] font-bold text-[#FF4560] tabular-nums w-6 text-center">
                        {i + 1}
                      </span>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-baseline gap-2 flex-wrap">
                          <span className="text-[10px] text-[#868686] truncate">
                            [{row.clientLabel}]
                          </span>
                          <span className="text-[12px] font-semibold text-white truncate">
                            {row.ficha}
                          </span>
                        </div>
                        <div className="text-[10px] text-[#666] tabular-nums">
                          CMV {row.cmvPct.toFixed(0)}% • custo {fmtBRL(row.custo)} • preço{' '}
                          {fmtBRL(row.preco)} • {row.vendas} vendas/mês
                        </div>
                      </div>
                      <div className="text-right">
                        <div className="text-[11px] tabular-nums text-[#00B37E] font-semibold">
                          +{fmtBRLShort(row.lostPerMonth)}/mês
                        </div>
                        <div className="text-[9px] text-[#666]">se reprecificar</div>
                      </div>
                    </button>
                  </li>
                ))}
              </ul>
              {critical.length > TOP_FICHAS_LIMIT && (
                <button
                  type="button"
                  onClick={() => setShowAllCritical((s) => !s)}
                  className="text-[11px] font-semibold text-white bg-white/[0.04] hover:bg-white/[0.08] border border-white/[0.08] px-3 py-1.5 rounded-[10px] mt-3 transition-colors"
                >
                  {showAllCritical
                    ? `Ver menos (top ${TOP_FICHAS_LIMIT})`
                    : `Ver todos (${critical.length})`}
                </button>
              )}
            </>
          )}
        </Section>

        {/* Sub-3x custo (alerta amarelo) */}
        {subThree.length > 0 && (
          <Section
            icon="⚠️"
            title={`Pratos com preço sub-${TARGET_PRICE_MULTIPLIER}x custo`}
            subtitle={`Ganho potencial se reprecificar para custo × ${TARGET_PRICE_MULTIPLIER} (CMV ~${(100 / TARGET_PRICE_MULTIPLIER).toFixed(0)}%)`}
            collapsed={false}
          >
            <ul className="space-y-1.5">
              {subThree.slice(0, 5).map((row, i) => (
                <li key={row.id}>
                  <button
                    type="button"
                    onClick={() => triggerClient(row.client)}
                    className="w-full flex items-center gap-3 px-3 py-2 rounded-[10px] bg-white/[0.02] border border-white/[0.04] hover:bg-white/[0.05] hover:border-[#F5A623]/40 transition-colors text-left"
                  >
                    <span className="text-[12px] font-bold text-[#F5A623] tabular-nums w-6 text-center">
                      {i + 1}
                    </span>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-baseline gap-2 flex-wrap">
                        <span className="text-[10px] text-[#868686] truncate">
                          [{row.clientLabel}]
                        </span>
                        <span className="text-[12px] font-semibold text-white truncate">
                          {row.ficha}
                        </span>
                      </div>
                      <div className="text-[10px] text-[#666] tabular-nums">
                        CMV {row.cmvPct.toFixed(0)}% • custo {fmtBRL(row.custo)} • preço{' '}
                        {fmtBRL(row.preco)} • {row.vendas} vendas/mês
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="text-[11px] tabular-nums text-[#F5A623] font-semibold">
                        +{fmtBRLShort(row.gainPerMonth)}/mês
                      </div>
                      <div className="text-[9px] text-[#666]">a {TARGET_PRICE_MULTIPLIER}x</div>
                    </div>
                  </button>
                </li>
              ))}
            </ul>
            {subThree.length > 5 && (
              <p className="text-[10px] text-[#555] mt-2 italic">
                + {subThree.length - 5} fichas adicionais com preço abaixo de{' '}
                {TARGET_PRICE_MULTIPLIER}x custo.
              </p>
            )}
          </Section>
        )}

        {/* Clientes com fichas incompletas */}
        <Section
          icon="📋"
          title="Clientes com fichas incompletas"
          subtitle="Sem custo ou sem preço — não dá pra calcular margem"
          collapsed={collapsed.incomplete}
          onToggle={() => setCollapsed((s) => ({ ...s, incomplete: !s.incomplete }))}
        >
          {incompleteList.length === 0 ? (
            <EmptyHint>Todas as fichas têm custo + preço cadastrados. ✓</EmptyHint>
          ) : (
            <>
              <ul className="space-y-1.5">
                {visibleIncomplete.map((entry, i) => (
                  <li key={entry.clientKey}>
                    <button
                      type="button"
                      onClick={() => triggerClient(entry.client)}
                      className="w-full flex items-center gap-3 px-3 py-2 rounded-[10px] bg-white/[0.02] border border-white/[0.04] hover:bg-white/[0.05] hover:border-white/[0.10] transition-colors text-left"
                    >
                      <span className="text-[12px] font-bold text-[#868686] tabular-nums w-5 text-center">
                        {i + 1}
                      </span>
                      <span className="text-[12px] font-semibold text-white flex-1 truncate">
                        {getClientLabel(entry.client)}
                      </span>
                      <span className="text-[11px] tabular-nums text-[#FF7A45] font-semibold">
                        {entry.count}{' '}
                        {entry.count === 1 ? 'ficha sem custo/preço' : 'fichas sem custo/preço'}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
              {incompleteList.length > TOP_CLIENTS_LIMIT && (
                <button
                  type="button"
                  onClick={() => setShowAllIncomplete((s) => !s)}
                  className="text-[11px] font-semibold text-white bg-white/[0.04] hover:bg-white/[0.08] border border-white/[0.08] px-3 py-1.5 rounded-[10px] mt-3 transition-colors"
                >
                  {showAllIncomplete
                    ? `Ver menos (top ${TOP_CLIENTS_LIMIT})`
                    : `Ver todos (${incompleteList.length})`}
                </button>
              )}
            </>
          )}
        </Section>

        {/* Insumos com discrepância de preço */}
        <Section
          icon="📈"
          title="Insumos com preço anormal entre clientes"
          subtitle={`Mesmo insumo em ≥${MIN_INSUMO_RESTAURANTS} clientes, spread ≥${MIN_INSUMO_SPREAD_PCT}%`}
          collapsed={collapsed.insumos}
          onToggle={() => setCollapsed((s) => ({ ...s, insumos: !s.insumos }))}
        >
          {insumoSpread.length === 0 ? (
            <EmptyHint>
              Nenhum insumo com discrepância significativa entre clientes — preços alinhados.
            </EmptyHint>
          ) : (
            <>
              <ul className="space-y-1.5">
                {visibleInsumos.map((row, i) => {
                  const expensiveDeltaPct =
                    row.avg > 0 ? ((row.expensive.price - row.avg) / row.avg) * 100 : 0;
                  return (
                    <li key={row.key}>
                      <button
                        type="button"
                        onClick={() => triggerClient(row.expensive?.client)}
                        className="w-full flex flex-col gap-1 px-3 py-2 rounded-[10px] bg-white/[0.02] border border-white/[0.04] hover:bg-white/[0.05] hover:border-white/[0.10] transition-colors text-left"
                      >
                        <div className="flex items-center gap-3">
                          <span className="text-[12px] font-bold text-[#FF4560] tabular-nums w-5 text-center">
                            {i + 1}
                          </span>
                          <span className="text-[12px] font-semibold text-white flex-1 truncate">
                            {row.label}
                            {row.unit ? (
                              <span className="text-[10px] text-[#868686] ml-1">
                                ({row.unit})
                              </span>
                            ) : null}
                          </span>
                          <span className="text-[11px] tabular-nums text-white">
                            {fmtBRL(row.min)} – {fmtBRL(row.max)}
                          </span>
                          <span className="text-[11px] tabular-nums text-[#FF4560] font-semibold w-14 text-right">
                            {row.spreadPct.toFixed(0)}%
                          </span>
                          <span className="text-[10px] text-[#868686] tabular-nums w-24 text-right">
                            {row.restaurants} clientes
                          </span>
                        </div>
                        {row.expensive && (
                          <div className="text-[10px] text-[#666] pl-8">
                            Cliente caro:{' '}
                            <span className="text-white font-semibold">
                              {row.expensive.clientLabel}
                            </span>{' '}
                            paga {fmtBRL(row.expensive.price)} (versus média{' '}
                            {fmtBRL(row.avg)},{' '}
                            <span className="text-[#FF4560]">
                              +{expensiveDeltaPct.toFixed(0)}%
                            </span>
                            )
                          </div>
                        )}
                      </button>
                    </li>
                  );
                })}
              </ul>
              {insumoSpread.length > TOP_INSUMOS_LIMIT && (
                <button
                  type="button"
                  onClick={() => setShowAllInsumos((s) => !s)}
                  className="text-[11px] font-semibold text-white bg-white/[0.04] hover:bg-white/[0.08] border border-white/[0.08] px-3 py-1.5 rounded-[10px] mt-3 transition-colors"
                >
                  {showAllInsumos
                    ? `Ver menos (top ${TOP_INSUMOS_LIMIT})`
                    : `Ver todos (${insumoSpread.length})`}
                </button>
              )}
            </>
          )}
        </Section>
      </motion.div>
    </div>
  );
};

// -- Sub-components --------------------------------------------------------

const Section = ({ icon, title, subtitle, children, collapsed, onToggle }) => (
  <section>
    <header className="mb-2">
      <div className="flex items-center gap-2">
        <h3 className="text-[13px] font-bold text-white flex items-center gap-2 flex-1">
          <span aria-hidden>{icon}</span>
          <span>{title}</span>
        </h3>
        {typeof onToggle === 'function' && (
          <button
            type="button"
            onClick={onToggle}
            className="text-[10px] text-[#868686] hover:text-white px-2 py-0.5 rounded border border-white/[0.06] hover:border-white/[0.12] transition-colors"
            aria-label={collapsed ? 'Expandir' : 'Recolher'}
          >
            {collapsed ? 'expandir' : 'recolher'}
          </button>
        )}
      </div>
      {subtitle && <p className="text-[10px] text-[#666] mt-0.5">{subtitle}</p>}
    </header>
    <AnimatePresence initial={false}>
      {!collapsed && (
        <motion.div
          initial={{ opacity: 0, height: 0 }}
          animate={{ opacity: 1, height: 'auto' }}
          exit={{ opacity: 0, height: 0 }}
          className="overflow-hidden"
        >
          {children}
        </motion.div>
      )}
    </AnimatePresence>
  </section>
);

const EmptyHint = ({ children }) => (
  <div className="text-[11px] text-[#666] py-3 px-3 rounded-[10px] bg-white/[0.02] border border-dashed border-white/[0.06]">
    {children}
  </div>
);

export default MarginHunter;
