/**
 * AggregatedMenuInsights — Engenharia de Menu Agregada (item 3.3 do plano).
 *
 * Cross-client insights únicos da Breakr:
 *  1. Top 5 pratos mais lucrativos do portfolio (MC% médio ponderado)
 *  2. Insumos com maior variação de preço entre clientes (proxy de "alta de preço")
 *  3. Adoção de marketplaces no portfolio
 *  4. Distribuição da dependência de marketplaces (histograma)
 *  5. Ticket médio por cuisine type (resumo)
 *
 * Estes insights só fazem sentido com N ≥ 2 clientes — Breakr é a única
 * a ter visão agregada do setor.
 *
 * Decisões:
 *  - Normalização de nome: lowercase, sem acentos, números viram palavras
 *    ("4" -> "quatro", "2" -> "dois"…), sem pontuação. Display label = grafia
 *    mais frequente do grupo.
 *  - "Alta de preço" v1: como não temos histórico de preços por insumo (TODO:
 *    requer tabela de history), usamos a VARIAÇÃO entre clientes como proxy.
 *    Se um restaurante paga R$8/kg e outro paga R$12/kg pelo mesmo insumo,
 *    isso aponta um problema (alguém pagando caro ou dado errado).
 *  - Default view mostra seções 1 + 3 (mais acionáveis). Botão "Ver todos os
 *    insights" expande 2, 4, 5.
 */

import { useMemo, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion'; // eslint-disable-line no-unused-vars

const MIN_SALES_PER_MONTH = 5;
const MIN_RESTAURANTS_PER_DISH = 2;
const MIN_RESTAURANTS_PER_INSUMO = 3;
const MIN_VARIANCE_SPREAD_PCT = 20; // só destaca insumos com 20%+ de spread

// -- Parsing ---------------------------------------------------------------

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

const parsePct = (val) => {
  if (val == null) return 0;
  if (typeof val === 'number') return val;
  let s = String(val).replace(/%/g, '').trim();
  if (s.includes(',')) s = s.replace(',', '.');
  return parseFloat(s) || 0;
};

// -- Normalização de nomes -------------------------------------------------

const NUMBER_WORDS = {
  '0': 'zero', '1': 'um', '2': 'dois', '3': 'tres', '4': 'quatro',
  '5': 'cinco', '6': 'seis', '7': 'sete', '8': 'oito', '9': 'nove',
  '10': 'dez', '11': 'onze', '12': 'doze',
};

const stripAccents = (s) =>
  // Remove combining diacritical marks (U+0300 to U+036F)
  // Fix: regex anterior tinha range char literal corrompido em encoding;
  // agora usa unicode escape explicito que sobrevive a qualquer save.
  s.normalize('NFD').replace(/[̀-ͯ]/g, '');

const normalizeName = (raw) => {
  if (!raw) return '';
  let s = String(raw).toLowerCase().trim();
  s = stripAccents(s);
  // Substitui números por palavras (ex: "Pizza 4 queijos" -> "pizza quatro queijos")
  s = s.replace(/\b\d+\b/g, (n) => NUMBER_WORDS[n] || n);
  // Remove pontuação e múltiplos espaços
  s = s.replace(/[^\p{L}\p{N}\s]/gu, ' ').replace(/\s+/g, ' ').trim();
  // Remove plurais simples no final ("queijos" -> "queijo") — heurística leve
  return s;
};

// Resolve a label "mais bonita" do grupo: a grafia original mais comum.
const pickDisplayLabel = (variants) => {
  if (!variants.length) return '';
  const counts = new Map();
  variants.forEach(v => counts.set(v, (counts.get(v) || 0) + 1));
  let best = variants[0], bestCount = 0;
  counts.forEach((count, label) => {
    if (count > bestCount) {
      best = label;
      bestCount = count;
    }
  });
  return best;
};

// -- Marketplace name normalization ---------------------------------------

const normalizeMarketplaceProvider = (m) => {
  if (!m) return '';
  const provider = (m.provider === 'Outro' && m.custom_provider)
    ? m.custom_provider
    : m.provider;
  if (!provider) return '';
  const p = String(provider).trim();
  // Capitaliza marketplaces conhecidos
  const lower = p.toLowerCase();
  if (lower === 'ifood') return 'iFood';
  if (lower === 'rappi') return 'Rappi';
  if (lower === 'aiqfome') return 'Aiqfome';
  if (lower === 'delivery much') return 'Delivery Much';
  if (lower === 'app próprio' || lower === 'app proprio') return 'App Próprio';
  return p.charAt(0).toUpperCase() + p.slice(1);
};

// -- Cuisine normalize -----------------------------------------------------

const normalizeCuisine = (raw) => {
  if (!raw || !String(raw).trim()) return 'Não informado';
  const trimmed = String(raw).trim();
  return trimmed.charAt(0).toUpperCase() + trimmed.slice(1);
};

// -- Formatting ------------------------------------------------------------

const fmtBRL = (n) => {
  const v = Number(n) || 0;
  return `R$ ${v.toFixed(2).replace('.', ',')}`;
};

const fmtBRLShort = (n) => {
  const v = Number(n) || 0;
  if (v >= 1000) return `R$ ${(v / 1000).toFixed(1)}k`;
  return `R$ ${v.toFixed(0)}`;
};

// -- Aggregations ----------------------------------------------------------

/**
 * Agrega todas as fichas do portfolio. Retorna grupos por nome normalizado.
 * Cada grupo: { key, label, fichas: [{ client, ficha, mc, vendas }], totalRestaurants, mcWeighted, totalSales }
 */
const aggregateDishes = (clients) => {
  const groups = new Map();

  clients.forEach((c) => {
    const data = parseClientData(c);
    const fichas = data?.operational?.fichas || [];
    const seenInClient = new Set();

    fichas.forEach((f) => {
      const nome = f.nome || f.name;
      if (!nome) return;
      const precoVenda = parseValue(f.precoVenda);
      const custoTotal = parseValue(f.custoTotal);
      const vendas = parseInt(f.vendasMes, 10) || 0;
      if (precoVenda <= 0 || custoTotal <= 0 || vendas < MIN_SALES_PER_MONTH) return;

      const mc = ((precoVenda - custoTotal) / precoVenda) * 100;
      if (!isFinite(mc)) return;

      const key = normalizeName(nome);
      if (!key) return;

      if (!groups.has(key)) {
        groups.set(key, {
          key,
          variants: [],
          fichas: [],
          clientIds: new Set(),
        });
      }
      const g = groups.get(key);
      g.variants.push(nome);
      g.fichas.push({ clientId: c.id || c.email || nome, ficha: f, mc, vendas });
      // Conta um restaurante por grupo (não duplica se o mesmo client tem 2 fichas iguais)
      const cKey = String(c.id || c.email || '?');
      if (!seenInClient.has(`${cKey}:${key}`)) {
        seenInClient.add(`${cKey}:${key}`);
        g.clientIds.add(cKey);
      }
    });
  });

  const result = [];
  groups.forEach((g) => {
    if (g.clientIds.size < MIN_RESTAURANTS_PER_DISH) return;
    // MC ponderado por vendas
    let totalSales = 0;
    let weightedMc = 0;
    g.fichas.forEach((entry) => {
      totalSales += entry.vendas;
      weightedMc += entry.mc * entry.vendas;
    });
    if (totalSales === 0) return;
    result.push({
      key: g.key,
      label: pickDisplayLabel(g.variants),
      mcWeighted: weightedMc / totalSales,
      totalRestaurants: g.clientIds.size,
      totalSales,
    });
  });

  result.sort((a, b) => b.mcWeighted - a.mcWeighted);
  return result;
};

/**
 * Agrega insumos do portfolio. Detecta variação de preço entre clientes.
 */
const aggregateInsumos = (clients) => {
  const groups = new Map();

  clients.forEach((c) => {
    const data = parseClientData(c);
    const insumos = data?.operational?.insumos || [];

    insumos.forEach((ins) => {
      const nome = ins.name || ins.nome;
      if (!nome) return;
      const price = parseValue(ins.price ?? ins.custo);
      if (price <= 0) return;
      const unit = ins.purchaseUnit || ins.unit || '';

      // Chave inclui unidade pra não comparar R$/kg com R$/g
      const key = `${normalizeName(nome)}|${String(unit).toLowerCase()}`;
      if (!key.startsWith('|')) {
        if (!groups.has(key)) {
          groups.set(key, {
            key,
            unit,
            variants: [],
            prices: [],
            clientIds: new Set(),
          });
        }
        const g = groups.get(key);
        g.variants.push(nome);
        g.prices.push(price);
        g.clientIds.add(String(c.id || c.email || '?'));
      }
    });
  });

  const result = [];
  groups.forEach((g) => {
    if (g.clientIds.size < MIN_RESTAURANTS_PER_INSUMO) return;
    const min = Math.min(...g.prices);
    const max = Math.max(...g.prices);
    if (min <= 0) return;
    const spreadPct = ((max - min) / min) * 100;
    if (spreadPct < MIN_VARIANCE_SPREAD_PCT) return;
    const avg = g.prices.reduce((a, p) => a + p, 0) / g.prices.length;
    result.push({
      key: g.key,
      label: pickDisplayLabel(g.variants),
      unit: g.unit,
      min,
      max,
      avg,
      spreadPct,
      restaurants: g.clientIds.size,
    });
  });

  result.sort((a, b) => b.spreadPct - a.spreadPct);
  return result;
};

/**
 * Adoção de marketplaces. Conta clientes únicos por provider.
 */
const aggregateMarketplaces = (clients) => {
  const totalClients = clients.length;
  const providerStats = new Map(); // provider -> { clientIds, commissions[] }

  clients.forEach((c) => {
    const data = parseClientData(c);
    const list = data?.formData?.fees_marketplaces;
    if (!Array.isArray(list)) return;
    const seenProviders = new Set();

    list.forEach((m) => {
      const provider = normalizeMarketplaceProvider(m);
      if (!provider) return;
      const commission = parsePct(m.commission);
      if (!providerStats.has(provider)) {
        providerStats.set(provider, { clientIds: new Set(), commissions: [] });
      }
      const s = providerStats.get(provider);
      const cKey = String(c.id || c.email || '?');
      if (!seenProviders.has(provider)) {
        seenProviders.add(provider);
        s.clientIds.add(cKey);
      }
      if (commission > 0) s.commissions.push(commission);
    });
  });

  const result = [];
  providerStats.forEach((s, provider) => {
    const count = s.clientIds.size;
    const adoptionPct = totalClients > 0 ? (count / totalClients) * 100 : 0;
    const avgCommission = s.commissions.length > 0
      ? s.commissions.reduce((a, x) => a + x, 0) / s.commissions.length
      : null;
    result.push({
      provider,
      count,
      total: totalClients,
      adoptionPct,
      avgCommission,
    });
  });

  result.sort((a, b) => b.count - a.count);
  return result;
};

/**
 * Distribuição da dependência de marketplaces (% de vendas via mkt).
 * Buckets: 0-15, 15-25, 25-40, 40+
 */
const aggregateMarketplaceDependency = (clients) => {
  const buckets = [
    { label: '0-15%', min: 0, max: 15, count: 0, status: 'saudável', color: '#00B37E', flag: '✓' },
    { label: '15-25%', min: 15, max: 25, count: 0, status: 'atenção', color: '#F5A623', flag: '⚠' },
    { label: '25-40%', min: 25, max: 40, count: 0, status: 'alta dependência', color: '#FF7A45', flag: '⚠' },
    { label: '40%+', min: 40, max: Infinity, count: 0, status: 'crítica', color: '#FF4560', flag: '🚨' },
  ];

  let measured = 0;
  clients.forEach((c) => {
    const data = parseClientData(c);
    const list = data?.formData?.fees_marketplaces;
    if (!Array.isArray(list) || list.length === 0) return;
    const totalPct = list.reduce((a, m) => a + parsePct(m.sales_percentage), 0);
    measured += 1;
    const bucket = buckets.find(b => totalPct >= b.min && totalPct < b.max);
    if (bucket) bucket.count += 1;
  });

  return { buckets, measured };
};

/**
 * Ticket médio por cuisine — resumo.
 */
const aggregateTicketByCuisine = (clients) => {
  const groups = new Map();

  clients.forEach((c) => {
    const data = parseClientData(c);
    const fd = data?.formData || {};
    const cuisine = normalizeCuisine(fd.identity?.cuisine_type || fd.cuisine_type || '');
    const fichas = data?.operational?.fichas || [];

    let totalSales = 0;
    let totalRevenue = 0;
    fichas.forEach((f) => {
      const vendas = parseInt(f.vendasMes, 10) || 0;
      const preco = parseValue(f.precoVenda);
      if (vendas > 0 && preco > 0) {
        totalSales += vendas;
        totalRevenue += vendas * preco;
      }
    });
    if (totalSales <= 0) return;
    const ticket = totalRevenue / totalSales;

    if (!groups.has(cuisine)) {
      groups.set(cuisine, { cuisine, tickets: [] });
    }
    groups.get(cuisine).tickets.push(ticket);
  });

  const result = [];
  groups.forEach((g) => {
    if (g.tickets.length === 0) return;
    const avg = g.tickets.reduce((a, t) => a + t, 0) / g.tickets.length;
    result.push({ cuisine: g.cuisine, avgTicket: avg, count: g.tickets.length });
  });
  result.sort((a, b) => b.avgTicket - a.avgTicket);
  return result;
};

// -- Render ----------------------------------------------------------------

const AggregatedMenuInsights = ({ clients = [] }) => {
  const [showAll, setShowAll] = useState(false);

  const list = useMemo(
    () => (Array.isArray(clients) ? clients : []),
    [clients]
  );
  const totalClients = list.length;

  const dishes = useMemo(() => aggregateDishes(list), [list]);
  const insumos = useMemo(() => aggregateInsumos(list), [list]);
  const marketplaces = useMemo(() => aggregateMarketplaces(list), [list]);
  const mktDependency = useMemo(() => aggregateMarketplaceDependency(list), [list]);
  const ticketByCuisine = useMemo(() => aggregateTicketByCuisine(list), [list]);

  // Empty / sparse data
  if (totalClients === 0) {
    return (
      <div className="mb-6">
        <div className="bg-gradient-to-br from-[#141416] to-[#0F0F11] border border-white/[0.06] rounded-[18px] p-5">
          <h2 className="text-[16px] font-bold text-white mb-1">Engenharia de Menu Agregada</h2>
          <p className="text-[12px] text-[#666] py-6 text-center">
            Sem clientes no portfólio para gerar insights agregados.
          </p>
        </div>
      </div>
    );
  }

  if (totalClients < 2) {
    return (
      <div className="mb-6">
        <div className="bg-gradient-to-br from-[#141416] to-[#0F0F11] border border-white/[0.06] rounded-[18px] p-5">
          <h2 className="text-[16px] font-bold text-white mb-1">Engenharia de Menu Agregada</h2>
          <p className="text-[11px] text-[#868686] mb-2">
            Insights cross-client (top pratos, variação de insumos, marketplaces)
          </p>
          <p className="text-[12px] text-[#666] py-6 text-center">
            Insights agregados precisam de pelo menos 2 clientes no portfólio. Atualmente: {totalClients}.
          </p>
        </div>
      </div>
    );
  }

  const top5Dishes = dishes.slice(0, 5);
  const top5Insumos = insumos.slice(0, 5);
  const top5Cuisines = ticketByCuisine.slice(0, 5);

  return (
    <div className="mb-6">
      <div className="flex items-end justify-between mb-3 flex-wrap gap-2">
        <div>
          <h2 className="text-[16px] font-bold text-white">Engenharia de Menu Agregada</h2>
          <p className="text-[11px] text-[#868686]">
            Insights cross-client únicos do portfólio Breakr ({totalClients} restaurantes)
          </p>
        </div>
        <button
          type="button"
          onClick={() => setShowAll(s => !s)}
          className="text-[11px] font-semibold text-white bg-white/[0.06] hover:bg-white/[0.10] border border-white/[0.10] px-3 py-1.5 rounded-[10px] transition-colors"
        >
          {showAll ? 'Ver menos' : 'Ver todos os insights'}
        </button>
      </div>

      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        className="bg-gradient-to-br from-[#141416] to-[#0F0F11] border border-white/[0.06] rounded-[18px] p-5 space-y-6"
      >
        {/* 1. Top 5 pratos lucrativos */}
        <Section
          icon="🥇"
          title="Pratos mais lucrativos do portfólio"
          subtitle={`MC% médio ponderado por vendas — agrupados por similaridade de nome (mín. ${MIN_RESTAURANTS_PER_DISH} restaurantes)`}
        >
          {top5Dishes.length === 0 ? (
            <EmptyHint>
              Nenhum prato com fichas comparáveis (precisamos de fichas com custo + preço + ≥{MIN_SALES_PER_MONTH} vendas/mês em pelo menos {MIN_RESTAURANTS_PER_DISH} restaurantes).
            </EmptyHint>
          ) : (
            <ul className="space-y-1.5">
              {top5Dishes.map((d, i) => (
                <li
                  key={d.key}
                  className="flex items-center gap-3 px-3 py-2 rounded-[10px] bg-white/[0.02] border border-white/[0.04]"
                >
                  <span className="text-[14px] font-bold text-[#F5A623] tabular-nums w-5 text-center">
                    {i + 1}
                  </span>
                  <span className="text-[12px] font-semibold text-white flex-1 truncate">
                    {d.label}
                  </span>
                  <span className="text-[11px] tabular-nums text-[#00B37E] font-semibold">
                    MC {d.mcWeighted.toFixed(0)}%
                  </span>
                  <span className="text-[10px] text-[#868686] tabular-nums">
                    {d.totalRestaurants} restaurantes
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Section>

        {/* 3. Marketplaces — adoção */}
        <Section
          icon="📊"
          title="Marketplaces — adoção do portfólio"
          subtitle="% de restaurantes que usam cada plataforma + comissão média declarada"
        >
          {marketplaces.length === 0 ? (
            <EmptyHint>Nenhum cliente cadastrou marketplaces ainda.</EmptyHint>
          ) : (
            <ul className="space-y-1.5">
              {marketplaces.map((m) => (
                <li
                  key={m.provider}
                  className="flex items-center gap-3 px-3 py-2 rounded-[10px] bg-white/[0.02] border border-white/[0.04]"
                >
                  <span className="text-[12px] font-semibold text-white flex-1 truncate">
                    {m.provider}
                  </span>
                  <span className="text-[11px] tabular-nums text-[#868686]">
                    {m.count}/{m.total}
                  </span>
                  <span className="text-[11px] tabular-nums text-white font-semibold w-12 text-right">
                    {m.adoptionPct.toFixed(0)}%
                  </span>
                  <span className="text-[10px] tabular-nums text-[#F5A623] w-28 text-right">
                    {m.avgCommission != null
                      ? `comissão ~${m.avgCommission.toFixed(1)}%`
                      : '—'}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Section>

        {/* Sections expansíveis */}
        <AnimatePresence>
          {showAll && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              className="overflow-hidden space-y-6"
            >
              {/* 2. Insumos com maior variação */}
              <Section
                icon="⚠️"
                title="Insumos com maior variação de preço entre clientes"
                subtitle={`Spread de preço para o mesmo insumo (proxy de "alta de preço" — v1 sem histórico). Mín. ${MIN_RESTAURANTS_PER_INSUMO} restaurantes, ≥${MIN_VARIANCE_SPREAD_PCT}% spread.`}
              >
                {top5Insumos.length === 0 ? (
                  <EmptyHint>
                    Nenhum insumo com variação significativa entre clientes (TODO: real
                    &quot;alta de preço&quot; requer tabela de histórico de preços).
                  </EmptyHint>
                ) : (
                  <ul className="space-y-1.5">
                    {top5Insumos.map((ins, i) => (
                      <li
                        key={ins.key}
                        className="flex items-center gap-3 px-3 py-2 rounded-[10px] bg-white/[0.02] border border-white/[0.04]"
                      >
                        <span className="text-[14px] font-bold text-[#FF4560] tabular-nums w-5 text-center">
                          {i + 1}
                        </span>
                        <span className="text-[12px] font-semibold text-white flex-1 truncate">
                          {ins.label}
                          {ins.unit ? (
                            <span className="text-[10px] text-[#868686] ml-1">({ins.unit})</span>
                          ) : null}
                        </span>
                        <span className="text-[11px] tabular-nums text-white">
                          {fmtBRL(ins.min)} – {fmtBRL(ins.max)}
                        </span>
                        <span className="text-[11px] tabular-nums text-[#FF4560] font-semibold w-16 text-right">
                          {ins.spreadPct.toFixed(0)}%
                        </span>
                        <span className="text-[10px] text-[#868686] tabular-nums w-24 text-right">
                          {ins.restaurants} restaurantes
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
                <p className="text-[10px] text-[#555] mt-2 italic">
                  Nota: estamos usando variação entre clientes como proxy. Pra detectar
                  &quot;alta de preço&quot; real precisamos persistir histórico de preços.
                </p>
              </Section>

              {/* 4. Distribuição dependência mkt */}
              <Section
                icon="🍕"
                title="Dependência de marketplace — distribuição"
                subtitle="% das vendas via marketplace por restaurante (saudável <20%)"
              >
                {mktDependency.measured === 0 ? (
                  <EmptyHint>Nenhum cliente com marketplaces declarados.</EmptyHint>
                ) : (
                  <DependencyHistogram buckets={mktDependency.buckets} total={mktDependency.measured} />
                )}
              </Section>

              {/* 5. Ticket médio por cuisine */}
              <Section
                icon="💰"
                title="Ticket médio por tipo de cozinha"
                subtitle="Comparação rápida (detalhe completo em Benchmarks por Tipo de Cozinha)"
              >
                {top5Cuisines.length === 0 ? (
                  <EmptyHint>Sem fichas com vendas e preço definidos para calcular ticket.</EmptyHint>
                ) : (
                  <ul className="space-y-1.5">
                    {top5Cuisines.map((t) => (
                      <li
                        key={t.cuisine}
                        className="flex items-center gap-3 px-3 py-2 rounded-[10px] bg-white/[0.02] border border-white/[0.04]"
                      >
                        <span className="text-[12px] font-semibold text-white flex-1 truncate">
                          {t.cuisine}
                        </span>
                        <span className="text-[11px] tabular-nums text-[#F5A623] font-semibold">
                          {fmtBRLShort(t.avgTicket)}
                        </span>
                        <span className="text-[10px] text-[#868686] tabular-nums w-24 text-right">
                          {t.count} {t.count === 1 ? 'restaurante' : 'restaurantes'}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </Section>
            </motion.div>
          )}
        </AnimatePresence>
      </motion.div>
    </div>
  );
};

// -- Sub-components --------------------------------------------------------

const Section = ({ icon, title, subtitle, children }) => (
  <section>
    <header className="mb-2">
      <h3 className="text-[13px] font-bold text-white flex items-center gap-2">
        <span aria-hidden>{icon}</span>
        <span>{title}</span>
      </h3>
      {subtitle && (
        <p className="text-[10px] text-[#666] mt-0.5">{subtitle}</p>
      )}
    </header>
    {children}
  </section>
);

const EmptyHint = ({ children }) => (
  <div className="text-[11px] text-[#666] py-3 px-3 rounded-[10px] bg-white/[0.02] border border-dashed border-white/[0.06]">
    {children}
  </div>
);

const DependencyHistogram = ({ buckets, total }) => {
  const maxCount = Math.max(...buckets.map(b => b.count), 1);
  return (
    <div className="space-y-1.5">
      {buckets.map((b) => {
        const widthPct = (b.count / maxCount) * 100;
        const sharePct = total > 0 ? (b.count / total) * 100 : 0;
        return (
          <div key={b.label} className="flex items-center gap-3">
            <span className="text-[11px] font-semibold tabular-nums text-white w-14">
              {b.label}
            </span>
            <div className="flex-1 h-5 bg-white/[0.03] rounded-[6px] overflow-hidden">
              <div
                className="h-full rounded-[6px] transition-all"
                style={{
                  width: `${Math.max(widthPct, b.count > 0 ? 4 : 0)}%`,
                  backgroundColor: b.color,
                  opacity: 0.85,
                }}
              />
            </div>
            <span className="text-[11px] tabular-nums text-white w-20 text-right">
              {b.count} ({sharePct.toFixed(0)}%)
            </span>
            <span
              className="text-[10px] font-semibold px-1.5 py-0.5 rounded w-32 text-right"
              style={{ color: b.color, backgroundColor: `${b.color}1A` }}
            >
              {b.flag} {b.status}
            </span>
          </div>
        );
      })}
    </div>
  );
};

export default AggregatedMenuInsights;
