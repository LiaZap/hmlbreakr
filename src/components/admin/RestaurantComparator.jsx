/**
 * RestaurantComparator — Comparador lado-a-lado de 2 restaurantes (item 4.2).
 *
 * Admin escolhe 2 clientes do portfolio e ve uma tabela comparativa de
 * metricas operacionais. Util pra:
 *  1) Identificar pares de mentoria (quem pode ensinar quem)
 *  2) Entender por que um esta performando melhor
 *  3) Encontrar padroes pra replicar
 *
 * Visual:
 *  - 2 selectors no topo (search + dropdown com avatar/logo)
 *  - Tabela com sections: OPERACAO, CARDAPIO, CANAIS, MATURIDADE
 *  - Tag "<-melhor" verde marcando vencedor por linha
 *  - Insight automatico no rodape baseado em quem ganha mais metricas
 *
 * Uso: <RestaurantComparator clients={[...]} />
 */

import { useMemo, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion'; // eslint-disable-line no-unused-vars
import { computeClientHealth } from '../../utils/clientHealth';
import { computeHealthScore } from './HealthScoreBadge';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const parseClientData = (c) => {
  if (!c) return {};
  try {
    return typeof c.data === 'string' ? JSON.parse(c.data || '{}') : (c.data || {});
  } catch {
    return {};
  }
};

const getClientLogo = (client) => {
  const raw = parseClientData(client);
  return raw?.restaurant?.logo || raw?.user?.photo || raw?.formData?.user_info?.photo || null;
};

const getDisplayName = (client) => {
  const raw = parseClientData(client);
  return (
    raw?.restaurant?.name ||
    raw?.formData?.identity?.restaurant_name ||
    client?.name ||
    'Sem nome'
  );
};

const getCuisineType = (client) => {
  const raw = parseClientData(client);
  return (
    raw?.formData?.identity?.cuisine_type ||
    raw?.formData?.cuisine_type ||
    'Nao informado'
  );
};

const getMonthsOnBreakr = (client) => {
  if (!client?.createdAt) return null;
  const ts = new Date(client.createdAt).getTime();
  if (isNaN(ts)) return null;
  return Math.floor((Date.now() - ts) / (1000 * 60 * 60 * 24 * 30));
};

const formatRevenue = (val) => {
  if (!val || val <= 0) return '—';
  if (val >= 1000) return `R$ ${(val / 1000).toFixed(val >= 10000 ? 0 : 1)}k`;
  return `R$ ${val.toFixed(0)}`;
};

const formatMonths = (m) => {
  if (m == null) return '—';
  if (m === 0) return 'menos de 1 mes';
  if (m === 1) return '1 mes';
  return `${m} meses`;
};

const formatDays = (d) => {
  if (d == null || d === Infinity) return 'sem registro';
  if (d === 0) return 'agora';
  if (d === 1) return 'ha 1 dia';
  return `ha ${d} dias`;
};

const colorByName = (name) => {
  if (!name) return '#5B8DEF';
  const colors = ['#F5A623', '#00B37E', '#5B8DEF', '#FF6B6B', '#A78BFA', '#F472B6', '#34D399', '#FBBF24'];
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash);
  return colors[Math.abs(hash) % colors.length];
};

/**
 * Le percentuais de canais (iFood, App Proprio) do client.data.
 * Soma sales_percentage por provider.
 */
const computeChannelMix = (data) => {
  const list = Array.isArray(data?.formData?.fees_marketplaces)
    ? data.formData.fees_marketplaces
    : [];
  let ifood = 0;
  let appProprio = 0;
  list.forEach((m) => {
    const provider = String(m?.provider || '').toLowerCase().trim();
    const pctRaw = m?.sales_percentage;
    const pct = pctRaw == null
      ? 0
      : (typeof pctRaw === 'number'
        ? pctRaw
        : parseFloat(String(pctRaw).replace(',', '.').replace('%', '').trim()) || 0);
    if (provider.includes('ifood')) ifood += pct;
    if (provider.includes('app') && (provider.includes('prop') || provider.includes('próprio'))) {
      appProprio += pct;
    }
  });
  return {
    ifood: Math.min(100, ifood),
    appProprio: Math.min(100, appProprio),
  };
};

const hasBpoActive = (data) => !!(data?._bpo && data._bpo.enabled);

const hasTeamRegistered = (data) => {
  const partners = Array.isArray(data?.formData?.partners) ? data.formData.partners : [];
  const employees = Array.isArray(data?.formData?.employees) ? data.formData.employees : [];
  return (partners.length + employees.length) > 0;
};

// ---------------------------------------------------------------------------
// ClientSelector — search + dropdown
// ---------------------------------------------------------------------------

const ClientSelector = ({ clients, value, onChange, placeholder, otherValue }) => {
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);

  const selected = clients.find((c) => c.id === value);
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return clients;
    return clients.filter((c) => {
      const name = getDisplayName(c).toLowerCase();
      return name.includes(q);
    });
  }, [clients, query]);

  return (
    <div className="relative">
      <input
        type="text"
        value={query}
        onChange={(e) => { setQuery(e.target.value); setOpen(true); }}
        onFocus={() => setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        placeholder={placeholder || 'Buscar restaurante...'}
        className="w-full px-3 py-2 bg-white/[0.03] border border-white/[0.08] rounded-lg text-sm text-white placeholder:text-white/40 focus:outline-none focus:border-white/[0.18] transition-colors"
      />

      {selected && !open && (
        <div className="mt-2 flex items-center gap-2 px-2 py-1.5 bg-white/[0.04] border border-white/[0.06] rounded-lg">
          <ClientAvatar client={selected} size={28} />
          <span className="text-sm text-white truncate flex-1">{getDisplayName(selected)}</span>
          <button
            type="button"
            onClick={() => { onChange(null); setQuery(''); }}
            className="text-white/40 hover:text-white/80 text-xs px-1"
            aria-label="Remover selecao"
          >
            x
          </button>
        </div>
      )}

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            transition={{ duration: 0.15 }}
            className="absolute top-full left-0 right-0 mt-1 z-30 bg-[#1B1B1F] border border-white/[0.08] rounded-lg shadow-2xl max-h-64 overflow-y-auto"
          >
            {filtered.length === 0 ? (
              <div className="px-3 py-3 text-xs text-white/40 text-center">
                Nenhum cliente encontrado
              </div>
            ) : (
              filtered.map((c) => {
                const isSelected = c.id === value;
                const isOther = c.id === otherValue;
                return (
                  <button
                    key={c.id}
                    type="button"
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => {
                      onChange(c.id);
                      setOpen(false);
                      setQuery('');
                    }}
                    disabled={isOther}
                    className={`w-full flex items-center gap-2 px-3 py-2 text-left transition-colors ${
                      isSelected ? 'bg-white/[0.06]' : 'hover:bg-white/[0.04]'
                    } ${isOther ? 'opacity-40 cursor-not-allowed' : ''}`}
                  >
                    <ClientAvatar client={c} size={26} />
                    <div className="flex-1 min-w-0">
                      <div className="text-sm text-white truncate">{getDisplayName(c)}</div>
                      <div className="text-[10px] text-white/40 truncate">{getCuisineType(c)}</div>
                    </div>
                    {isOther && (
                      <span className="text-[10px] text-white/30">ja selecionado</span>
                    )}
                  </button>
                );
              })
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

const ClientAvatar = ({ client, size = 32 }) => {
  const logo = getClientLogo(client);
  const name = getDisplayName(client);
  const initial = (name || '?').charAt(0).toUpperCase();
  if (logo) {
    return (
      <img
        src={logo}
        alt={name}
        className="rounded-full object-cover ring-1 ring-white/[0.08] shrink-0"
        style={{ width: size, height: size }}
      />
    );
  }
  return (
    <div
      className="rounded-full flex items-center justify-center text-white font-bold shrink-0"
      style={{
        width: size,
        height: size,
        backgroundColor: colorByName(name),
        fontSize: Math.round(size * 0.42),
      }}
    >
      {initial}
    </div>
  );
};

// ---------------------------------------------------------------------------
// Comparison metric definitions
// ---------------------------------------------------------------------------

/**
 * Cada metrica tem:
 *  - section: agrupamento visual
 *  - label: texto da linha
 *  - get(snapshot): valor numerico (pra comparacao)
 *  - format(val): texto pra UI
 *  - betterIs: 'lower' | 'higher' | 'none'  (none = nao compara)
 *  - available(snapshot): boolean — se false, mostra "—" + tooltip
 *  - tooltip?: tooltip quando available=false
 *  - weighInsight?: boolean — entra na contagem do insight automatico
 */
const buildMetricSpecs = () => [
  // --- Identificacao (sem section header — vai antes de OPERACAO) ---
  {
    section: '__intro',
    key: 'cuisine',
    label: 'Tipo',
    get: (s) => s.cuisineType,
    format: (v) => v || '—',
    betterIs: 'none',
    available: () => true,
  },
  {
    section: '__intro',
    key: 'months',
    label: 'Tempo no Breakr',
    get: (s) => s.monthsOnBreakr,
    format: (v) => formatMonths(v),
    betterIs: 'none',
    available: (s) => s.monthsOnBreakr != null,
  },
  {
    section: '__intro',
    key: 'revenue',
    label: 'Faturamento mensal',
    get: (s) => s.health?.currentRevenue || 0,
    format: (v) => formatRevenue(v),
    betterIs: 'none',
    available: (s) => (s.health?.currentRevenue || 0) > 0,
    tooltip: 'Cliente nao tem dados de fichas+vendas suficientes',
  },

  // --- OPERACAO ---
  {
    section: 'OPERACAO',
    key: 'cmv',
    label: 'CMV',
    get: (s) => s.health?.cmvPct,
    format: (v) => (v == null || v === 0 ? '—' : `${v}%`),
    betterIs: 'lower',
    available: (s) => s.health?.hasFinancialData && (s.health?.cmvPct || 0) > 0,
    tooltip: 'Cliente nao tem dados de fichas+vendas suficientes',
    weighInsight: true,
    insightSubject: 'CMV',
  },
  {
    section: 'OPERACAO',
    key: 'base',
    label: 'BASE',
    get: (s) => s.health?.basePct,
    format: (v) => (v == null || v === 0 ? '—' : `${v}%`),
    betterIs: 'lower',
    available: (s) => (s.health?.basePct || 0) > 0,
    tooltip: 'Cliente sem custos fixos lancados',
    weighInsight: true,
    insightSubject: 'BASE (custos fixos)',
  },
  {
    section: 'OPERACAO',
    key: 'lucro',
    label: 'Lucro Liquido',
    get: (s) => s.health?.lucroLiqPct,
    format: (v) => (v == null ? '—' : `${v}%`),
    betterIs: 'higher',
    available: (s) => s.health?.hasFinancialData && s.health?.lucroLiqPct != null,
    tooltip: 'Cliente nao tem dados de fichas+vendas suficientes',
    weighInsight: true,
    insightSubject: 'lucro liquido',
  },
  {
    section: 'OPERACAO',
    key: 'score',
    label: 'Health Score',
    get: (s) => s.scoreObj?.score,
    format: (v) => (v == null ? '—' : `${v}/100`),
    betterIs: 'higher',
    available: (s) => s.scoreObj && s.scoreObj.score != null,
    weighInsight: true,
    insightSubject: 'health score',
  },

  // --- CARDAPIO ---
  {
    section: 'CARDAPIO',
    key: 'pratos',
    label: 'Total de pratos',
    get: (s) => s.health?.fichasTotal || 0,
    format: (v) => (v == null ? '—' : String(v)),
    betterIs: 'none',
    available: (s) => (s.health?.fichasTotal || 0) > 0,
    tooltip: 'Sem fichas tecnicas cadastradas',
  },
  {
    section: 'CARDAPIO',
    key: 'fichasComCusto',
    label: 'Fichas com custo',
    get: (s) => s.health?.cardapioMaturidadePct || 0,
    format: (v) => (v == null ? '—' : `${v}%`),
    betterIs: 'higher',
    available: (s) => (s.health?.fichasTotal || 0) > 0,
    tooltip: 'Sem fichas cadastradas',
    weighInsight: true,
    insightSubject: 'fichas com custo',
  },
  {
    section: 'CARDAPIO',
    key: 'lastUpdate',
    label: 'Ultima atualizacao',
    get: (s) => s.health?.daysSinceActivity,
    format: (v) => formatDays(v),
    // Quem atualizou mais recentemente = melhor
    betterIs: 'lower',
    available: (s) => s.health?.daysSinceActivity != null && s.health?.daysSinceActivity !== Infinity,
    tooltip: 'Sem registro de atividade',
  },

  // --- CANAIS ---
  {
    section: 'CANAIS',
    key: 'ifood',
    label: '% iFood',
    get: (s) => s.channels?.ifood || 0,
    format: (v) => (v == null ? '—' : `${v.toFixed(0)}%`),
    betterIs: 'lower',
    available: (s) => s.channels && (s.channels.ifood > 0 || s.channels.appProprio > 0),
    tooltip: 'Sem dados de canais cadastrados',
    weighInsight: true,
    insightSubject: 'dependencia iFood',
  },
  {
    section: 'CANAIS',
    key: 'appProprio',
    label: '% App Proprio',
    get: (s) => s.channels?.appProprio || 0,
    format: (v) => (v == null ? '—' : `${v.toFixed(0)}%`),
    betterIs: 'higher',
    available: (s) => s.channels && (s.channels.ifood > 0 || s.channels.appProprio > 0),
    tooltip: 'Sem dados de canais cadastrados',
    weighInsight: true,
    insightSubject: 'venda direta (app proprio)',
  },

  // --- MATURIDADE ---
  {
    section: 'MATURIDADE',
    key: 'bpo',
    label: 'BPO Financeira',
    get: (s) => s.bpoActive ? 1 : 0,
    format: (v) => v ? 'Sim' : 'Nao',
    betterIs: 'higher',
    available: () => true,
    weighInsight: true,
    insightSubject: 'BPO ativa',
  },
  {
    section: 'MATURIDADE',
    key: 'team',
    label: 'Equipe cadastrada',
    get: (s) => s.teamRegistered ? 1 : 0,
    format: (v) => v ? 'Sim' : 'Nao',
    betterIs: 'higher',
    available: () => true,
    weighInsight: true,
    insightSubject: 'equipe cadastrada',
  },
];

// ---------------------------------------------------------------------------
// Snapshot — calcula dados de um cliente uma vez
// ---------------------------------------------------------------------------

const buildSnapshot = (client) => {
  if (!client) return null;
  const data = parseClientData(client);
  const health = computeClientHealth(data);
  const scoreObj = health ? computeHealthScore(health) : null;
  const channels = computeChannelMix(data);
  return {
    id: client.id,
    name: getDisplayName(client),
    logo: getClientLogo(client),
    cuisineType: getCuisineType(client),
    monthsOnBreakr: getMonthsOnBreakr(client),
    health,
    scoreObj,
    channels,
    bpoActive: hasBpoActive(data),
    teamRegistered: hasTeamRegistered(data),
  };
};

// ---------------------------------------------------------------------------
// Comparator — decide quem ganha em cada linha
// ---------------------------------------------------------------------------

const compareValues = (a, b, betterIs) => {
  if (betterIs === 'none') return null;
  if (a == null || b == null) return null;
  if (typeof a !== 'number' || typeof b !== 'number') return null;
  if (a === b) return null;
  if (betterIs === 'lower') return a < b ? 'a' : 'b';
  if (betterIs === 'higher') return a > b ? 'a' : 'b';
  return null;
};

// ---------------------------------------------------------------------------
// Insight automatico
// ---------------------------------------------------------------------------

const buildInsight = (snapA, snapB, metricSpecs) => {
  if (!snapA || !snapB) return null;

  let aWins = 0;
  let bWins = 0;
  const aWinsList = []; // metricas que A ganhou
  const bWinsList = [];

  metricSpecs.forEach((spec) => {
    if (!spec.weighInsight) return;
    const aAvail = spec.available(snapA);
    const bAvail = spec.available(snapB);
    if (!aAvail || !bAvail) return;
    const aVal = spec.get(snapA);
    const bVal = spec.get(snapB);
    const winner = compareValues(aVal, bVal, spec.betterIs);
    if (winner === 'a') {
      aWins++;
      aWinsList.push({ subject: spec.insightSubject, aVal, bVal, betterIs: spec.betterIs });
    } else if (winner === 'b') {
      bWins++;
      bWinsList.push({ subject: spec.insightSubject, aVal, bVal, betterIs: spec.betterIs });
    }
  });

  const total = aWins + bWins;
  if (total === 0) {
    return {
      kind: 'no_data',
      text: 'Dados insuficientes pra comparar — ambos os clientes precisam ter fichas, custos e canais cadastrados.',
    };
  }

  const aPct = aWins / total;
  const bPct = bWins / total;
  const dominant = aPct >= 0.6 ? 'a' : (bPct >= 0.6 ? 'b' : null);

  if (dominant === 'a' || dominant === 'b') {
    const winnerSnap = dominant === 'a' ? snapA : snapB;
    const loserSnap = dominant === 'a' ? snapB : snapA;
    const winnerWins = dominant === 'a' ? aWins : bWins;
    const loserWinsList = dominant === 'a' ? bWinsList : aWinsList;
    const winnerWinsList = dominant === 'a' ? aWinsList : bWinsList;
    // Pior gap pro perdedor: maior diferenca relativa
    let worstSubject = null;
    let worstGap = -Infinity;
    winnerWinsList.forEach((w) => {
      if (typeof w.aVal !== 'number' || typeof w.bVal !== 'number') return;
      const gap = Math.abs(w.aVal - w.bVal);
      if (gap > worstGap) {
        worstGap = gap;
        worstSubject = w.subject;
      }
    });
    return {
      kind: 'mentorship',
      text: `${winnerSnap.name} esta superando ${loserSnap.name} em ${winnerWins} de ${total} metricas. Possivel share de melhores praticas: pedir ${winnerSnap.name} p/ mentorar ${loserSnap.name}${worstSubject ? ` em ${worstSubject}` : ''}.`,
      loserHasStrengths: loserWinsList.length > 0,
      loserStrengths: loserWinsList.slice(0, 2).map((w) => w.subject),
      loserName: loserSnap.name,
    };
  }

  // Balanced — ambos tem forcas
  const aTopStrengths = aWinsList.slice(0, 2).map((w) => w.subject);
  const bTopStrengths = bWinsList.slice(0, 2).map((w) => w.subject);
  return {
    kind: 'balanced',
    text: `Comparacao equilibrada (${aWins}x${bWins} em ${total} metricas). ${snapA.name} se destaca em ${aTopStrengths.join(', ') || '—'}. ${snapB.name} se destaca em ${bTopStrengths.join(', ') || '—'}.`,
  };
};

// ---------------------------------------------------------------------------
// Componente principal
// ---------------------------------------------------------------------------

const RestaurantComparator = ({ clients = [] }) => {
  const [idA, setIdA] = useState(null);
  const [idB, setIdB] = useState(null);

  const snapA = useMemo(
    () => buildSnapshot(clients.find((c) => c.id === idA)),
    [clients, idA]
  );
  const snapB = useMemo(
    () => buildSnapshot(clients.find((c) => c.id === idB)),
    [clients, idB]
  );

  const sameClient = idA && idB && idA === idB;
  const bothSelected = !!snapA && !!snapB && !sameClient;

  const metricSpecs = useMemo(() => buildMetricSpecs(), []);
  const sections = useMemo(() => {
    const map = new Map();
    metricSpecs.forEach((m) => {
      if (!map.has(m.section)) map.set(m.section, []);
      map.get(m.section).push(m);
    });
    return Array.from(map.entries()); // [[section, [metrics]]]
  }, [metricSpecs]);

  const insight = useMemo(() => {
    if (!bothSelected) return null;
    return buildInsight(snapA, snapB, metricSpecs);
  }, [snapA, snapB, bothSelected, metricSpecs]);

  return (
    <div className="bg-gradient-to-br from-[#141416] to-[#0F0F11] border border-white/[0.06] rounded-[18px] p-5 sm:p-6">
      {/* Header */}
      <div className="mb-5">
        <h3 className="text-base sm:text-lg font-semibold text-white">
          Comparador de Restaurantes
        </h3>
        <p className="text-xs text-white/50 mt-0.5">
          Selecione 2 clientes para comparar metricas operacionais lado a lado
        </p>
      </div>

      {/* Seletores */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4 mb-5">
        <ClientSelector
          clients={clients}
          value={idA}
          onChange={setIdA}
          placeholder="Buscar primeiro restaurante..."
          otherValue={idB}
        />
        <ClientSelector
          clients={clients}
          value={idB}
          onChange={setIdB}
          placeholder="Buscar segundo restaurante..."
          otherValue={idA}
        />
      </div>

      {/* Aviso: mesmo cliente */}
      {sameClient && (
        <div className="mb-4 px-3 py-2 bg-[#F5A623]/[0.08] border border-[#F5A623]/[0.20] rounded-lg text-xs text-[#F5A623]">
          Voce selecionou o mesmo cliente nos dois lados. Escolha clientes diferentes pra comparar.
        </div>
      )}

      {/* Estado vazio */}
      {!bothSelected && !sameClient && (
        <div className="py-12 text-center">
          <div className="text-4xl mb-2 opacity-40">⚖️</div>
          <p className="text-sm text-white/50">
            {(!snapA && !snapB)
              ? 'Selecione 2 clientes acima pra comecar a comparacao'
              : 'Falta selecionar o segundo cliente'}
          </p>
        </div>
      )}

      {/* Tabela comparativa */}
      {bothSelected && (
        <div className="border border-white/[0.06] rounded-xl overflow-hidden">
          {/* Header da tabela com nomes — mobile: empilha os 2 nomes; desktop: 3 colunas */}
          <div className="md:grid md:grid-cols-[1.4fr_1fr_1fr] bg-white/[0.03] border-b border-white/[0.06]">
            <div className="hidden md:block px-4 py-3 text-[11px] uppercase tracking-wider text-white/40 font-medium">
              Metrica
            </div>
            <div className="grid grid-cols-2 md:contents">
              <div className="px-4 py-3 flex items-center gap-2 min-w-0 md:border-l md:border-white/[0.06]">
                <ClientAvatar client={clients.find((c) => c.id === idA)} size={26} />
                <span className="text-sm font-medium text-white truncate">{snapA.name}</span>
              </div>
              <div className="px-4 py-3 flex items-center gap-2 min-w-0 border-l border-white/[0.06]">
                <ClientAvatar client={clients.find((c) => c.id === idB)} size={26} />
                <span className="text-sm font-medium text-white truncate">{snapB.name}</span>
              </div>
            </div>
          </div>

          {/* Sections */}
          {sections.map(([sectionKey, specs]) => (
            <div key={sectionKey}>
              {sectionKey !== '__intro' && (
                <div className="px-4 py-2 bg-white/[0.02] border-b border-white/[0.04] text-[10px] uppercase tracking-wider text-white/40 font-semibold">
                  {sectionKey}
                </div>
              )}
              {specs.map((spec) => {
                const aAvail = spec.available(snapA);
                const bAvail = spec.available(snapB);
                const aVal = aAvail ? spec.get(snapA) : null;
                const bVal = bAvail ? spec.get(snapB) : null;
                const winner = (aAvail && bAvail) ? compareValues(aVal, bVal, spec.betterIs) : null;

                const aText = aAvail ? spec.format(aVal) : '—';
                const bText = bAvail ? spec.format(bVal) : '—';

                return (
                  <div
                    key={spec.key}
                    className="md:grid md:grid-cols-[1.4fr_1fr_1fr] border-b border-white/[0.04] last:border-b-0 hover:bg-white/[0.015] transition-colors"
                  >
                    <div className="px-4 pt-2.5 pb-1 md:py-2.5 text-[11px] uppercase tracking-wider text-white/40 font-medium md:text-sm md:normal-case md:tracking-normal md:font-normal md:text-white/70">
                      {spec.label}
                    </div>
                    {/* Mobile: 2 colunas de valores; desktop: vira parte do grid pai */}
                    <div className="grid grid-cols-2 md:contents">
                      <div className="px-4 pb-2.5 pt-0.5 md:py-2.5 md:border-l md:border-white/[0.04] flex items-center gap-1.5 min-w-0">
                        <span
                          className={`text-sm tabular-nums ${aText === '—' ? 'text-white/30' : 'text-white'}`}
                          title={aText === '—' ? (spec.tooltip || '') : ''}
                        >
                          {aText}
                        </span>
                        {winner === 'a' && (
                          <span className="text-[10px] font-medium text-[#00B37E] bg-[#00B37E]/[0.10] border border-[#00B37E]/[0.25] rounded px-1.5 py-0.5 shrink-0">
                            ←melhor
                          </span>
                        )}
                      </div>
                      <div className="px-4 pb-2.5 pt-0.5 md:py-2.5 border-l border-white/[0.04] flex items-center gap-1.5 min-w-0">
                        <span
                          className={`text-sm tabular-nums ${bText === '—' ? 'text-white/30' : 'text-white'}`}
                          title={bText === '—' ? (spec.tooltip || '') : ''}
                        >
                          {bText}
                        </span>
                        {winner === 'b' && (
                          <span className="text-[10px] font-medium text-[#00B37E] bg-[#00B37E]/[0.10] border border-[#00B37E]/[0.25] rounded px-1.5 py-0.5 shrink-0">
                            ←melhor
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          ))}
        </div>
      )}

      {/* Insight automatico */}
      {bothSelected && insight && (
        <motion.div
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.2, delay: 0.1 }}
          className="mt-4 p-4 bg-gradient-to-br from-[#5B8DEF]/[0.06] to-[#A78BFA]/[0.04] border border-[#5B8DEF]/[0.18] rounded-xl"
        >
          <div className="flex items-start gap-3">
            <div className="text-xl shrink-0">💡</div>
            <div className="flex-1">
              <div className="text-[10px] uppercase tracking-wider text-[#A78BFA] font-semibold mb-1">
                Insight
              </div>
              <p className="text-sm text-white/85 leading-relaxed">
                {insight.text}
              </p>
              {insight.kind === 'mentorship' && insight.loserHasStrengths && (
                <p className="text-xs text-white/55 mt-1.5">
                  Mas {insight.loserName} ainda tem forcas em: {insight.loserStrengths.join(', ')}.
                </p>
              )}
            </div>
          </div>
        </motion.div>
      )}
    </div>
  );
};

export default RestaurantComparator;
export { RestaurantComparator };
