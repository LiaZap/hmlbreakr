/* eslint-disable no-unused-vars */
/**
 * ReportsPage — Dashboard Dinâmico de Relatórios (BAH-016)
 *
 * Sidebar do admin pra:
 *  1. Modo Interno: filtrar portfolio por dimensões e explorar agregados.
 *  2. Modo Cliente: selecionar 1 cliente + período e enviar relatório
 *     personalizado (com vista limpa, sem agregados internos).
 *
 * Integra com clientHealth.js pra métricas e com emailService (futuro V2)
 * pra envio real. V1 manda POST /api/admin/reports/send que apenas loga.
 *
 * Estado é pura UI — filtros vivem em state local. Mudança em filtro
 * atualiza o preview na hora, sem botão "Aplicar".
 *
 * Visões salvas (combinações nomeadas de filtros) ficam em localStorage
 * sob a chave `breakr.admin.reports.savedViews`.
 *
 * BAH-094: a lista de clientes recebida via prop vem do endpoint LIGHTWEIGHT
 * (`GET /api/admin/clients`), que faz strip de `operational` (fichas/insumos),
 * de `breakEven` e dos `amount` do `revenue_history`. Com isso
 * `computeClientHealth`/`aggregatePortfolio` calculam tudo zerado.
 * Por isso o ReportsPage busca a sua PRÓPRIA cópia COMPLETA via
 * `GET /api/admin/clients?full=1` — que devolve o campo `data` íntegro
 * (mesmo formato do dashboard do cliente). A prop `clients` segue como
 * fallback caso o fetch full falhe.
 */
import React, { useState, useMemo, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  computeClientHealth,
  aggregatePortfolio,
  getClientCuisine,
  getClientLogo,
} from '../../utils/clientHealth';
import { adminFetch } from '../../utils/adminAuth';

// ===== Constants =====
const HEALTH_LABELS = {
  healthy: 'Saudáveis',
  tight: 'Apertados',
  risk: 'Em risco',
  critical: 'Críticos',
  unknown: 'Sem dados',
};
const HEALTH_COLORS = {
  healthy: '#10B981',
  tight: '#F5A623',
  risk: '#EF4444',
  critical: '#DC2626',
  unknown: '#6B7280',
};
const METRIC_OPTIONS = [
  { id: 'cmv', label: 'CMV', desc: 'Custo de matéria-prima' },
  { id: 'base', label: 'BASE', desc: 'Custos fixos + impostos' },
  { id: 'profit', label: 'Lucro Líq.', desc: 'Margem líquida' },
  { id: 'revenue', label: 'Faturamento', desc: 'Receita do período' },
  { id: 'health', label: 'Health Score', desc: 'Score agregado' },
];
const PERIOD_PRESETS = [
  { id: 'month', label: 'Mês' },
  { id: 'quarter', label: 'Trimestre' },
  { id: 'year', label: 'Ano' },
  { id: '12m', label: '12 meses' },
  { id: 'custom', label: 'Personalizado' },
];
const SAVED_VIEWS_KEY = 'breakr.admin.reports.savedViews';

// ===== Helpers =====
const fmtBRL = (n) => {
  if (!Number.isFinite(n)) return 'R$ 0';
  if (n >= 1_000_000) return `R$ ${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `R$ ${(n / 1_000).toFixed(0)}k`;
  return `R$ ${n.toFixed(0)}`;
};
const fmtPct = (n) => (Number.isFinite(n) ? `${n.toFixed(1)}%` : '—');

const parseClientData = (client) => {
  if (!client) return {};
  try {
    return typeof client.data === 'string' ? JSON.parse(client.data || '{}') : (client.data || {});
  } catch {
    return {};
  }
};

const todayISO = () => new Date().toISOString().slice(0, 10);
const monthAgoISO = () => {
  const d = new Date();
  d.setDate(d.getDate() - 30);
  return d.toISOString().slice(0, 10);
};

const periodLabelFromRange = (from, to, preset) => {
  if (preset === 'month') return 'Mês atual';
  if (preset === 'quarter') return 'Trimestre atual';
  if (preset === 'year') return 'Ano atual';
  if (preset === '12m') return 'Últimos 12 meses';
  if (!from || !to) return 'Período personalizado';
  const fmt = (s) => {
    const [y, m, d] = s.split('-');
    return `${d}/${m}/${y}`;
  };
  return `${fmt(from)} → ${fmt(to)}`;
};

// Converte um ISO 'YYYY-MM-DD' num índice de mês comparável (ano*12 + mês).
const monthIndexFromISO = (iso) => {
  if (!iso || typeof iso !== 'string') return null;
  const [y, m] = iso.split('-').map(Number);
  if (!Number.isFinite(y) || !Number.isFinite(m)) return null;
  return y * 12 + (m - 1);
};

// Converte um 'MM/YYYY' (formato do revenue_history) no mesmo índice.
const monthIndexFromBR = (mmYYYY) => {
  if (!mmYYYY || typeof mmYYYY !== 'string') return null;
  const [m, y] = mmYYYY.split('/').map(Number);
  if (!Number.isFinite(y) || !Number.isFinite(m)) return null;
  return y * 12 + (m - 1);
};

/**
 * BAH-094: aplica o filtro de Período aos dados do cliente ANTES de calcular
 * saúde. computeClientHealth sempre usa o mês mais recente de revenue_history;
 * sem este recorte, o filtro de Período não afetaria nada. Aqui mantemos só os
 * meses dentro do range [from, to]. Se o cliente não tem revenue_history como
 * array (ou está vazio), devolvemos o data original intacto.
 */
const applyPeriodToData = (data, from, to) => {
  if (!data || typeof data !== 'object') return data;
  const fd = data.formData;
  const history = fd && Array.isArray(fd.revenue_history) ? fd.revenue_history : null;
  if (!history || history.length === 0) return data;
  const fromIdx = monthIndexFromISO(from);
  const toIdx = monthIndexFromISO(to);
  if (fromIdx === null || toIdx === null) return data;
  const lo = Math.min(fromIdx, toIdx);
  const hi = Math.max(fromIdx, toIdx);
  const trimmed = history.filter((r) => {
    const idx = monthIndexFromBR(r?.month);
    return idx !== null && idx >= lo && idx <= hi;
  });
  return {
    ...data,
    formData: { ...fd, revenue_history: trimmed },
  };
};

const computeTopDishes = (client, limit = 5) => {
  const data = parseClientData(client);
  const fichas = data?.operational?.fichas || [];
  return fichas
    .map((f) => ({
      name: f.nome || 'Sem nome',
      sales: parseInt(f.vendasMes, 10) || 0,
      price: parseFloat(String(f.precoVenda || 0).replace(',', '.')) || 0,
    }))
    .filter((d) => d.sales > 0)
    .sort((a, b) => b.sales - a.sales)
    .slice(0, limit);
};

const aggregateTopDishes = (clients, limit = 5) => {
  const map = new Map();
  clients.forEach((c) => {
    computeTopDishes(c, 50).forEach((d) => {
      const key = d.name.toLowerCase();
      const cur = map.get(key) || { name: d.name, sales: 0, restaurants: 0 };
      cur.sales += d.sales;
      cur.restaurants += 1;
      map.set(key, cur);
    });
  });
  return [...map.values()].sort((a, b) => b.sales - a.sales).slice(0, limit);
};

const generateInsights = (agg, prevAgg) => {
  const insights = [];
  if (!agg || agg.total === 0) {
    insights.push({ tone: 'neutral', text: 'Nenhum cliente no escopo selecionado.' });
    return insights;
  }
  if (agg.cmvAvg > 0 && agg.cmvAvg < 32) {
    insights.push({ tone: 'good', text: `CMV médio em ${agg.cmvAvg}% — dentro da faixa saudável (<32%).` });
  } else if (agg.cmvAvg >= 32 && agg.cmvAvg <= 35) {
    insights.push({ tone: 'warn', text: `CMV médio ${agg.cmvAvg}% — limite saudável é 32%.` });
  } else if (agg.cmvAvg > 35) {
    insights.push({ tone: 'bad', text: `CMV médio ${agg.cmvAvg}% — acima do recomendado, revisar fichas.` });
  }
  if (agg.profitAvg !== null && agg.profitAvg !== undefined) {
    if (agg.profitAvg >= 8) insights.push({ tone: 'good', text: `Lucro líquido médio ${agg.profitAvg}% — saudável.` });
    else if (agg.profitAvg >= 3) insights.push({ tone: 'warn', text: `Lucro líquido médio ${agg.profitAvg}% — apertado.` });
    else insights.push({ tone: 'bad', text: `Lucro líquido médio ${agg.profitAvg}% — risco financeiro.` });
  }
  if (prevAgg && prevAgg.profitAvg !== null && agg.profitAvg !== null) {
    const delta = +(agg.profitAvg - prevAgg.profitAvg).toFixed(1);
    if (Math.abs(delta) >= 0.5) {
      insights.push({
        tone: delta > 0 ? 'good' : 'bad',
        text: `Lucro líq ${delta > 0 ? '+' : ''}${delta}pp vs período anterior.`,
      });
    }
  }
  if (agg.critical > 0) {
    insights.push({ tone: 'bad', text: `${agg.critical} cliente(s) em estado crítico — atenção imediata.` });
  }
  if (agg.withMature > 0 && agg.total > 0) {
    const pct = Math.round((agg.withMature / agg.total) * 100);
    insights.push({ tone: 'neutral', text: `${pct}% dos clientes com cardápio maduro (>80% fichas com custo).` });
  }
  return insights;
};

// ===== Sub-components =====
const KpiCard = ({ label, value, sub, accent, highlight }) => (
  <div
    className={`rounded-[14px] p-4 border transition-all ${
      highlight
        ? 'bg-gradient-to-br from-[#F5A623]/15 to-[#F5A623]/5 border-[#F5A623]/40 shadow-[inset_0_1px_0_rgba(245,166,35,0.1)]'
        : 'bg-white/[0.02] border-white/[0.06]'
    }`}
  >
    <div className="text-[10px] uppercase tracking-widest font-bold text-[#666] mb-2">{label}</div>
    <div className="text-[22px] font-bold text-white tracking-tight">{value}</div>
    {sub && <div className={`text-[11px] mt-1 ${accent || 'text-[#868686]'}`}>{sub}</div>}
  </div>
);

const FilterSection = ({ title, children }) => (
  <div className="mb-5">
    <h4 className="text-[10px] uppercase tracking-widest font-bold text-[#666] mb-2.5">{title}</h4>
    {children}
  </div>
);

const Chip = ({ active, onClick, children }) => (
  <button
    type="button"
    onClick={onClick}
    className={`text-[11px] px-3 py-1.5 rounded-full border transition-all whitespace-nowrap ${
      active
        ? 'bg-[#F5A623]/15 border-[#F5A623]/40 text-[#F5A623] font-semibold'
        : 'bg-white/[0.02] border-white/[0.08] text-[#868686] hover:text-white hover:border-white/[0.15]'
    }`}
  >
    {children}
  </button>
);

const Checkbox = ({ checked, onChange, label, color }) => (
  <label className="flex items-center gap-2 cursor-pointer text-[12px] text-[#cfcfcf] hover:text-white py-1">
    <input
      type="checkbox"
      checked={checked}
      onChange={onChange}
      className="w-[14px] h-[14px] rounded border-white/20 bg-white/[0.04] accent-[#F5A623] cursor-pointer"
    />
    {color && <span className="w-2 h-2 rounded-full" style={{ background: color }} />}
    <span>{label}</span>
  </label>
);

const Radio = ({ checked, onChange, label, sub }) => (
  <label className="flex items-start gap-2 cursor-pointer text-[12px] text-[#cfcfcf] hover:text-white py-1">
    <input
      type="radio"
      checked={checked}
      onChange={onChange}
      className="mt-0.5 w-[14px] h-[14px] accent-[#F5A623] cursor-pointer"
    />
    <span>
      <div>{label}</div>
      {sub && <div className="text-[10px] text-[#666] mt-0.5">{sub}</div>}
    </span>
  </label>
);

// ===== Main =====
const ReportsPage = ({ clients = [], adminName = 'Admin', adminRole = 'admin' }) => {
  // ----- Full-data fetch (BAH-094) -----
  // A prop `clients` é a versão lightweight (sem operational/fichas/insumos/
  // breakEven/revenue real). Buscamos a versão completa via ?full=1 para que
  // computeClientHealth/aggregatePortfolio tenham dados reais. Enquanto o fetch
  // não resolve, ou se ele falhar, caímos no fallback da prop lightweight.
  const [fullClients, setFullClients] = useState(null);
  const [loadingClients, setLoadingClients] = useState(true);
  const [loadError, setLoadError] = useState(null);

  useEffect(() => {
    let cancelled = false;
    setLoadingClients(true);
    setLoadError(null);
    adminFetch('/api/admin/clients?full=1')
      .then(async (res) => {
        if (!res.ok) {
          const body = await res.json().catch(() => ({}));
          throw new Error(body?.error || `HTTP ${res.status}`);
        }
        return res.json();
      })
      .then((data) => {
        if (cancelled) return;
        if (Array.isArray(data)) {
          setFullClients(data);
        } else {
          throw new Error('Resposta inesperada do servidor.');
        }
      })
      .catch((err) => {
        if (cancelled) return;
        console.warn('BAH-094: falha ao buscar clientes completos:', err?.message);
        setLoadError(err?.message || 'Falha ao carregar dados completos.');
        setFullClients(null);
      })
      .finally(() => {
        if (!cancelled) setLoadingClients(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // Fonte de verdade pros cálculos: dados completos quando disponíveis,
  // senão a prop lightweight (preview ainda renderiza, só sem métricas reais).
  const effectiveClients = fullClients ?? clients;

  // ----- Filter state -----
  const [periodPreset, setPeriodPreset] = useState('month');
  const [dateFrom, setDateFrom] = useState(monthAgoISO());
  const [dateTo, setDateTo] = useState(todayISO());
  const [selectedClientIds, setSelectedClientIds] = useState(() => effectiveClients.map((c) => c.id));
  const [clientSearch, setClientSearch] = useState('');
  const [selectedCuisines, setSelectedCuisines] = useState([]);
  const [primaryMetric, setPrimaryMetric] = useState('cmv');
  const [healthFilter, setHealthFilter] = useState({
    healthy: true,
    tight: true,
    risk: true,
    critical: true,
    unknown: true,
  });
  const [mode, setMode] = useState('internal'); // 'internal' | 'client'
  const [singleClientId, setSingleClientId] = useState(null);

  // ----- Saved views -----
  const [savedViews, setSavedViews] = useState([]);
  const [showSaveModal, setShowSaveModal] = useState(false);
  const [saveViewName, setSaveViewName] = useState('');
  useEffect(() => {
    try {
      const raw = localStorage.getItem(SAVED_VIEWS_KEY);
      setSavedViews(raw ? JSON.parse(raw) : []);
    } catch {
      setSavedViews([]);
    }
  }, []);
  const persistViews = (views) => {
    setSavedViews(views);
    try {
      localStorage.setItem(SAVED_VIEWS_KEY, JSON.stringify(views));
    } catch (e) {
      console.warn('Falha ao salvar visões:', e?.message);
    }
  };

  // ----- Send modal state -----
  const [showSendModal, setShowSendModal] = useState(false);
  const [sendMessage, setSendMessage] = useState('');
  const [sending, setSending] = useState(false);
  const [sendResult, setSendResult] = useState(null);
  const [shareCopied, setShareCopied] = useState(false);

  // Re-sync selection when client list changes (inclui troca lightweight -> full)
  useEffect(() => {
    setSelectedClientIds((prev) => {
      const ids = new Set(effectiveClients.map((c) => c.id));
      const filtered = prev.filter((id) => ids.has(id));
      return filtered.length > 0 || prev.length === 0 ? filtered : effectiveClients.map((c) => c.id);
    });
  }, [effectiveClients]);

  // ----- Derived data -----
  const cuisineList = useMemo(() => {
    const set = new Set();
    effectiveClients.forEach((c) => set.add(getClientCuisine(c)));
    return [...set].filter((c) => c && c !== 'Não informado').sort();
  }, [effectiveClients]);

  // Health computado já com o recorte de Período aplicado ao revenue_history.
  const clientsWithHealth = useMemo(
    () => effectiveClients.map((c) => {
      const data = parseClientData(c);
      const scopedData = applyPeriodToData(data, dateFrom, dateTo);
      return { client: c, data: scopedData, health: computeClientHealth(scopedData) };
    }),
    [effectiveClients, dateFrom, dateTo]
  );

  // Apply filters
  const filteredScope = useMemo(() => {
    return clientsWithHealth.filter(({ client, health }) => {
      if (!selectedClientIds.includes(client.id)) return false;
      if (selectedCuisines.length > 0 && !selectedCuisines.includes(getClientCuisine(client))) return false;
      const status = health?.health || 'unknown';
      if (!healthFilter[status]) return false;
      return true;
    });
  }, [clientsWithHealth, selectedClientIds, selectedCuisines, healthFilter]);

  const aggregated = useMemo(() => aggregatePortfolio(filteredScope.map((x) => x.health)), [filteredScope]);

  // Single client mode resolution
  const activeSingleClient = useMemo(() => {
    if (mode !== 'client') return null;
    const id = singleClientId || filteredScope[0]?.client?.id;
    return filteredScope.find((x) => x.client.id === id) || null;
  }, [mode, singleClientId, filteredScope]);

  const topDishes = useMemo(() => {
    if (mode === 'client' && activeSingleClient) return computeTopDishes(activeSingleClient.client, 5);
    return aggregateTopDishes(filteredScope.map((x) => x.client), 5);
  }, [mode, activeSingleClient, filteredScope]);

  const insights = useMemo(() => generateInsights(aggregated, null), [aggregated]);

  // Filtered clients for the multiselect search
  const visibleClientList = useMemo(() => {
    const q = clientSearch.trim().toLowerCase();
    return effectiveClients.filter((c) => !q || (c.name || '').toLowerCase().includes(q));
  }, [effectiveClients, clientSearch]);

  // ----- Actions -----
  const handlePresetClick = (id) => {
    setPeriodPreset(id);
    if (id === 'month') {
      const d = new Date();
      const start = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`;
      setDateFrom(start);
      setDateTo(todayISO());
    } else if (id === 'quarter') {
      const d = new Date();
      const start = new Date(d.getFullYear(), d.getMonth() - 2, 1).toISOString().slice(0, 10);
      setDateFrom(start);
      setDateTo(todayISO());
    } else if (id === 'year') {
      setDateFrom(`${new Date().getFullYear()}-01-01`);
      setDateTo(todayISO());
    } else if (id === '12m') {
      const d = new Date();
      d.setFullYear(d.getFullYear() - 1);
      setDateFrom(d.toISOString().slice(0, 10));
      setDateTo(todayISO());
    }
  };

  const toggleClient = (id) => {
    setSelectedClientIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  };

  const toggleCuisine = (c) => {
    setSelectedCuisines((prev) => (prev.includes(c) ? prev.filter((x) => x !== c) : [...prev, c]));
  };

  const toggleHealth = (key) => {
    setHealthFilter((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  const clearAll = () => {
    setPeriodPreset('month');
    setDateFrom(monthAgoISO());
    setDateTo(todayISO());
    setSelectedClientIds(effectiveClients.map((c) => c.id));
    setClientSearch('');
    setSelectedCuisines([]);
    setPrimaryMetric('cmv');
    setHealthFilter({ healthy: true, tight: true, risk: true, critical: true, unknown: true });
    setMode('internal');
    setSingleClientId(null);
  };

  const saveCurrentView = () => {
    if (!saveViewName.trim()) return;
    const view = {
      id: `${Date.now()}`,
      name: saveViewName.trim(),
      filters: {
        periodPreset,
        dateFrom,
        dateTo,
        selectedClientIds,
        selectedCuisines,
        primaryMetric,
        healthFilter,
        mode,
        singleClientId,
      },
    };
    persistViews([view, ...savedViews].slice(0, 12));
    setSaveViewName('');
    setShowSaveModal(false);
  };

  const applyView = (view) => {
    const f = view.filters || {};
    if (f.periodPreset) setPeriodPreset(f.periodPreset);
    if (f.dateFrom) setDateFrom(f.dateFrom);
    if (f.dateTo) setDateTo(f.dateTo);
    if (Array.isArray(f.selectedClientIds)) setSelectedClientIds(f.selectedClientIds);
    if (Array.isArray(f.selectedCuisines)) setSelectedCuisines(f.selectedCuisines);
    if (f.primaryMetric) setPrimaryMetric(f.primaryMetric);
    if (f.healthFilter) setHealthFilter(f.healthFilter);
    if (f.mode) setMode(f.mode);
    if (f.singleClientId !== undefined) setSingleClientId(f.singleClientId);
  };

  const removeView = (id) => persistViews(savedViews.filter((v) => v.id !== id));

  const handleSend = async () => {
    if (!activeSingleClient) return;
    setSending(true);
    setSendResult(null);
    try {
      const payload = {
        clientId: activeSingleClient.client.id,
        message: sendMessage,
        period: {
          from: dateFrom,
          to: dateTo,
          label: periodLabelFromRange(dateFrom, dateTo, periodPreset),
        },
        snapshot: {
          metrics: aggregated,
          topDishes,
          insights,
          adminName,
          adminRole,
        },
      };
      const res = await adminFetch('/api/admin/reports/send', {
        method: 'POST',
        body: JSON.stringify(payload),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error || 'Falha ao enviar');
      setSendResult({ success: true, message: 'Relatório enviado com sucesso (V1: stub no servidor).' });
      setTimeout(() => setShowSendModal(false), 1400);
    } catch (err) {
      setSendResult({ success: false, message: err.message || 'Erro ao enviar.' });
    } finally {
      setSending(false);
    }
  };

  const handleExportPdf = () => {
    if (typeof window !== 'undefined' && typeof window.print === 'function') {
      window.print();
    }
  };

  const handleShareLink = async () => {
    try {
      const filterHash = btoa(
        encodeURIComponent(
          JSON.stringify({
            periodPreset,
            dateFrom,
            dateTo,
            selectedClientIds,
            selectedCuisines,
            primaryMetric,
            healthFilter,
            mode,
            singleClientId,
          })
        )
      );
      const url = `${window.location.origin}${window.location.pathname}#reports/${filterHash}`;
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(url);
      }
      setShareCopied(true);
      setTimeout(() => setShareCopied(false), 1800);
    } catch (e) {
      console.warn('Share link falhou:', e?.message);
    }
  };

  // ----- Header values -----
  const primaryMetricValue = useMemo(() => {
    if (mode === 'client' && activeSingleClient?.health) {
      const h = activeSingleClient.health;
      switch (primaryMetric) {
        case 'cmv': return fmtPct(h.cmvPct);
        case 'base': return fmtPct(h.basePct);
        case 'profit': return h.lucroLiqPct === null ? '—' : fmtPct(h.lucroLiqPct);
        case 'revenue': return fmtBRL(h.currentRevenue);
        case 'health': return HEALTH_LABELS[h.health] || '—';
        default: return '—';
      }
    }
    switch (primaryMetric) {
      case 'cmv': return fmtPct(aggregated.cmvAvg);
      case 'base': return fmtPct(aggregated.baseAvg);
      case 'profit': return aggregated.profitAvg === null ? '—' : fmtPct(aggregated.profitAvg);
      case 'revenue': return fmtBRL(aggregated.revenueTotal);
      case 'health': {
        const total = aggregated.total || 1;
        const score = ((aggregated.healthy * 100 + aggregated.tight * 70 + aggregated.risk * 40) / total).toFixed(0);
        return `${score}/100`;
      }
      default: return '—';
    }
  }, [primaryMetric, mode, activeSingleClient, aggregated]);

  const headerLabel = mode === 'client' && activeSingleClient
    ? activeSingleClient.client.name
    : `${filteredScope.length} cliente(s) no escopo`;

  // ===== Render =====
  return (
    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.35 }}>
      <div className="mb-6">
        <div className="flex items-center gap-2 mb-2">
          <span className="text-[11px] font-semibold text-[#F5A623] uppercase tracking-widest bg-[#F5A623]/10 px-2.5 py-1 rounded-full border border-[#F5A623]/20">Relatórios</span>
          <span className="text-[11px] text-[#555]">{effectiveClients.length} clientes na base</span>
          {loadingClients && (
            <span className="text-[11px] text-[#F5A623] flex items-center gap-1">
              <span className="w-2.5 h-2.5 rounded-full border-2 border-[#F5A623]/30 border-t-[#F5A623] animate-spin" />
              Carregando dados completos…
            </span>
          )}
        </div>
        <h2 className="text-[28px] font-bold text-white tracking-tight">Dashboard de Relatórios</h2>
        <p className="text-[13px] text-[#868686] mt-1">Filtre, explore e envie relatórios personalizados.</p>
        {loadError && (
          <div className="mt-3 text-[11px] px-3 py-2 rounded-[8px] bg-amber-500/10 border border-amber-500/20 text-amber-300">
            Não foi possível carregar os dados completos dos clientes ({loadError}). Exibindo dados resumidos —
            métricas operacionais (CMV, lucro, fichas) podem aparecer zeradas.
          </div>
        )}
      </div>

      {/* Saved views chips */}
      {savedViews.length > 0 && (
        <div className="flex items-center gap-2 flex-wrap mb-4">
          <span className="text-[10px] uppercase tracking-widest font-bold text-[#666]">Visões salvas</span>
          {savedViews.map((v) => (
            <div key={v.id} className="group flex items-center gap-1 bg-white/[0.03] border border-white/[0.08] rounded-full pl-3 pr-1 py-1">
              <button
                onClick={() => applyView(v)}
                className="text-[11px] text-[#cfcfcf] hover:text-[#F5A623] font-medium"
              >
                {v.name}
              </button>
              <button
                onClick={() => removeView(v.id)}
                className="ml-1 w-4 h-4 rounded-full text-[#666] hover:text-white hover:bg-white/10 flex items-center justify-center"
                title="Remover visão"
              >
                <svg width="9" height="9" viewBox="0 0 24 24" fill="none"><path d="M18 6L6 18M6 6l12 12" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"/></svg>
              </button>
            </div>
          ))}
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        {/* ===== LEFT: FILTERS ===== */}
        <div className="lg:col-span-1 bg-gradient-to-br from-[#141416] to-[#0F0F11] border border-white/[0.06] rounded-[16px] p-5 self-start">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-[14px] font-bold text-white">Filtros</h3>
            <button onClick={clearAll} className="text-[10px] text-[#666] hover:text-white uppercase tracking-widest font-bold">
              Limpar
            </button>
          </div>

          {/* Período */}
          <FilterSection title="Período">
            <div className="flex flex-wrap gap-1.5 mb-3">
              {PERIOD_PRESETS.map((p) => (
                <Chip key={p.id} active={periodPreset === p.id} onClick={() => handlePresetClick(p.id)}>
                  {p.label}
                </Chip>
              ))}
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="text-[9px] text-[#666] uppercase tracking-widest font-bold">De</label>
                <input
                  type="date"
                  value={dateFrom}
                  onChange={(e) => { setDateFrom(e.target.value); setPeriodPreset('custom'); }}
                  className="w-full mt-1 bg-white/[0.03] border border-white/[0.08] rounded-[8px] px-2 py-1.5 text-[11px] text-white outline-none focus:border-[#F5A623]/50 [color-scheme:dark]"
                />
              </div>
              <div>
                <label className="text-[9px] text-[#666] uppercase tracking-widest font-bold">Até</label>
                <input
                  type="date"
                  value={dateTo}
                  onChange={(e) => { setDateTo(e.target.value); setPeriodPreset('custom'); }}
                  className="w-full mt-1 bg-white/[0.03] border border-white/[0.08] rounded-[8px] px-2 py-1.5 text-[11px] text-white outline-none focus:border-[#F5A623]/50 [color-scheme:dark]"
                />
              </div>
            </div>
          </FilterSection>

          {/* Clientes */}
          <FilterSection title={`Clientes (${selectedClientIds.length}/${effectiveClients.length})`}>
            <input
              type="text"
              placeholder="Buscar cliente..."
              value={clientSearch}
              onChange={(e) => setClientSearch(e.target.value)}
              className="w-full mb-2 bg-white/[0.03] border border-white/[0.08] rounded-[8px] px-3 py-1.5 text-[12px] text-white placeholder-[#555] outline-none focus:border-[#F5A623]/50"
            />
            <div className="flex gap-2 mb-2">
              <button
                onClick={() => setSelectedClientIds(visibleClientList.map((c) => c.id))}
                className="text-[10px] text-[#F5A623] hover:underline font-semibold"
              >
                Selecionar todos
              </button>
              <span className="text-[#333]">·</span>
              <button onClick={() => setSelectedClientIds([])} className="text-[10px] text-[#666] hover:text-white">
                Limpar
              </button>
            </div>
            <div className="max-h-[180px] overflow-y-auto pr-1 space-y-0.5">
              {visibleClientList.length === 0 ? (
                <div className="text-[11px] text-[#555] italic py-2">Nenhum cliente.</div>
              ) : (
                visibleClientList.map((c) => (
                  <Checkbox
                    key={c.id}
                    checked={selectedClientIds.includes(c.id)}
                    onChange={() => toggleClient(c.id)}
                    label={c.name || 'Sem nome'}
                  />
                ))
              )}
            </div>
          </FilterSection>

          {/* Cuisine */}
          {cuisineList.length > 0 && (
            <FilterSection title="Tipo de Cozinha">
              <div className="flex flex-wrap gap-1.5">
                {cuisineList.map((c) => (
                  <Chip key={c} active={selectedCuisines.includes(c)} onClick={() => toggleCuisine(c)}>
                    {c}
                  </Chip>
                ))}
              </div>
            </FilterSection>
          )}

          {/* Métrica */}
          <FilterSection title="Métrica Principal">
            <div className="space-y-1">
              {METRIC_OPTIONS.map((m) => (
                <Radio
                  key={m.id}
                  checked={primaryMetric === m.id}
                  onChange={() => setPrimaryMetric(m.id)}
                  label={m.label}
                  sub={m.desc}
                />
              ))}
            </div>
          </FilterSection>

          {/* Saúde */}
          <FilterSection title="Status de Saúde">
            <div className="space-y-0.5">
              {Object.entries(HEALTH_LABELS).map(([key, label]) => (
                <Checkbox
                  key={key}
                  checked={!!healthFilter[key]}
                  onChange={() => toggleHealth(key)}
                  label={label}
                  color={HEALTH_COLORS[key]}
                />
              ))}
            </div>
          </FilterSection>

          {/* Modo */}
          <FilterSection title="Modo">
            <div className="space-y-1">
              <Radio
                checked={mode === 'internal'}
                onChange={() => setMode('internal')}
                label="Interno (admin)"
                sub="Mostra dados agregados de todos os clientes filtrados."
              />
              <Radio
                checked={mode === 'client'}
                onChange={() => setMode('client')}
                label="Cliente (1 só)"
                sub="View limpa, formato apropriado para envio."
              />
            </div>
            {mode === 'client' && (
              <select
                value={singleClientId || ''}
                onChange={(e) => setSingleClientId(e.target.value || null)}
                className="w-full mt-2 bg-white/[0.03] border border-white/[0.08] rounded-[8px] px-2 py-1.5 text-[12px] text-white outline-none focus:border-[#F5A623]/50 [color-scheme:dark]"
              >
                <option value="">— Selecione cliente —</option>
                {filteredScope.map(({ client }) => (
                  <option key={client.id} value={client.id}>{client.name}</option>
                ))}
              </select>
            )}
          </FilterSection>

          <button
            onClick={() => setShowSaveModal(true)}
            className="w-full mt-2 bg-white/[0.03] border border-white/[0.08] hover:border-[#F5A623]/30 rounded-[10px] px-3 py-2 text-[12px] text-[#cfcfcf] hover:text-white transition-all flex items-center justify-center gap-2"
          >
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none"><path d="M19 21l-7-5-7 5V5a2 2 0 012-2h10a2 2 0 012 2z" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg>
            Salvar Visão
          </button>
        </div>

        {/* ===== RIGHT: PREVIEW ===== */}
        <div className="lg:col-span-2 space-y-4">
          {/* Header */}
          <div className="bg-gradient-to-br from-[#141416] to-[#0F0F11] border border-white/[0.06] rounded-[16px] p-5">
            <div className="flex items-start justify-between flex-wrap gap-3">
              <div className="min-w-0 flex-1">
                <div className="text-[10px] uppercase tracking-widest font-bold text-[#666] mb-1">
                  {periodLabelFromRange(dateFrom, dateTo, periodPreset)}
                </div>
                <h3 className="text-[20px] font-bold text-white truncate">{headerLabel}</h3>
                <div className="text-[11px] text-[#868686] mt-1">
                  {mode === 'client' ? 'Modo Cliente — view limpa para envio' : 'Modo Interno — dados agregados'}
                </div>
              </div>
              {mode === 'client' && activeSingleClient?.client && (
                <div className="flex items-center gap-2 bg-white/[0.03] rounded-[10px] px-3 py-2 border border-white/[0.06]">
                  {getClientLogo(activeSingleClient.client) ? (
                    <img src={getClientLogo(activeSingleClient.client)} alt="" className="w-8 h-8 rounded object-cover" />
                  ) : (
                    <div className="w-8 h-8 rounded bg-[#F5A623]/15 flex items-center justify-center text-[10px] font-bold text-[#F5A623]">
                      {(activeSingleClient.client.name || '??').slice(0, 2).toUpperCase()}
                    </div>
                  )}
                  <div className="text-[11px] text-[#cfcfcf]">{getClientCuisine(activeSingleClient.client)}</div>
                </div>
              )}
            </div>
          </div>

          {/* KPI Cards */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <KpiCard
              label={METRIC_OPTIONS.find((m) => m.id === primaryMetric)?.label || 'Métrica'}
              value={primaryMetricValue}
              sub="Métrica principal"
              accent="text-[#F5A623]"
              highlight
            />
            <KpiCard
              label="Faturamento"
              value={mode === 'client' && activeSingleClient ? fmtBRL(activeSingleClient.health?.currentRevenue || 0) : fmtBRL(aggregated.revenueTotal)}
              sub={mode === 'client' ? 'Cliente' : `Soma de ${aggregated.total} clientes`}
            />
            <KpiCard
              label="CMV"
              value={mode === 'client' && activeSingleClient ? fmtPct(activeSingleClient.health?.cmvPct) : fmtPct(aggregated.cmvAvg)}
              sub={mode === 'client' ? '' : 'Média'}
            />
            <KpiCard
              label="Lucro Líq."
              value={
                mode === 'client' && activeSingleClient
                  ? (activeSingleClient.health?.lucroLiqPct === null ? '—' : fmtPct(activeSingleClient.health?.lucroLiqPct))
                  : (aggregated.profitAvg === null ? '—' : fmtPct(aggregated.profitAvg))
              }
              sub={mode === 'client' ? '' : `${aggregated.profitClientCount} c/ dados`}
            />
          </div>

          {/* Top Pratos */}
          <div className="bg-gradient-to-br from-[#141416] to-[#0F0F11] border border-white/[0.06] rounded-[16px] p-5">
            <h4 className="text-[13px] font-bold text-white mb-3">Top 5 Pratos</h4>
            {topDishes.length === 0 ? (
              <div className="text-[12px] text-[#666] italic">Sem dados de vendas no escopo selecionado.</div>
            ) : (
              <ol className="space-y-2">
                {topDishes.map((d, i) => (
                  <li key={`${d.name}-${i}`} className="flex items-center gap-3">
                    <span className="w-6 h-6 rounded-full bg-[#F5A623]/10 border border-[#F5A623]/30 text-[#F5A623] text-[11px] font-bold flex items-center justify-center shrink-0">
                      {i + 1}
                    </span>
                    <span className="text-[12px] text-white flex-1 truncate">{d.name}</span>
                    <span className="text-[11px] text-[#868686] whitespace-nowrap">
                      {d.sales} venda(s){d.restaurants ? ` · ${d.restaurants} restaurantes` : ''}
                    </span>
                  </li>
                ))}
              </ol>
            )}
          </div>

          {/* Insights */}
          <div className="bg-gradient-to-br from-[#141416] to-[#0F0F11] border border-white/[0.06] rounded-[16px] p-5">
            <h4 className="text-[13px] font-bold text-white mb-3">Insights</h4>
            <div className="space-y-2">
              {insights.map((ins, i) => (
                <div
                  key={i}
                  className={`text-[12px] flex items-start gap-2 px-3 py-2 rounded-[8px] border ${
                    ins.tone === 'good' ? 'bg-emerald-500/5 border-emerald-500/20 text-emerald-300'
                    : ins.tone === 'warn' ? 'bg-amber-500/5 border-amber-500/20 text-amber-300'
                    : ins.tone === 'bad' ? 'bg-red-500/5 border-red-500/20 text-red-300'
                    : 'bg-white/[0.02] border-white/[0.06] text-[#cfcfcf]'
                  }`}
                >
                  <span>{ins.text}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Distribution (Modo Interno) */}
          {mode === 'internal' && aggregated.total > 0 && (
            <div className="bg-gradient-to-br from-[#141416] to-[#0F0F11] border border-white/[0.06] rounded-[16px] p-5">
              <h4 className="text-[13px] font-bold text-white mb-3">Distribuição de Saúde</h4>
              <div className="grid grid-cols-2 md:grid-cols-5 gap-2">
                {Object.entries(HEALTH_LABELS).map(([key, label]) => {
                  const count = aggregated[key] ?? 0;
                  return (
                    <div key={key} className="bg-white/[0.02] border border-white/[0.05] rounded-[10px] p-2.5">
                      <div className="flex items-center gap-1.5 mb-1">
                        <span className="w-2 h-2 rounded-full" style={{ background: HEALTH_COLORS[key] }} />
                        <span className="text-[10px] uppercase tracking-wider text-[#868686] font-semibold">{label}</span>
                      </div>
                      <div className="text-[18px] font-bold text-white">{count}</div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Action Buttons */}
          <div className="bg-gradient-to-br from-[#141416] to-[#0F0F11] border border-white/[0.06] rounded-[16px] p-5">
            <h4 className="text-[13px] font-bold text-white mb-3">Ações</h4>
            <div className="flex flex-wrap gap-2">
              <button
                onClick={() => setShowSendModal(true)}
                disabled={mode !== 'client' || !activeSingleClient}
                className={`flex-1 min-w-[180px] px-4 py-2.5 rounded-[10px] text-[12px] font-semibold flex items-center justify-center gap-2 transition-all ${
                  mode === 'client' && activeSingleClient
                    ? 'bg-gradient-to-b from-[#F5B638] to-[#E5961E] text-black hover:shadow-[0_8px_24px_-6px_rgba(245,166,35,0.4)]'
                    : 'bg-white/[0.03] text-[#555] cursor-not-allowed border border-white/[0.05]'
                }`}
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none"><path d="M22 2L11 13M22 2l-7 20-4-9-9-4 20-7z" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg>
                Enviar pro Cliente
              </button>
              <button
                onClick={handleExportPdf}
                className="flex-1 min-w-[160px] bg-white/[0.03] border border-white/[0.08] hover:border-white/[0.2] hover:text-white text-[#cfcfcf] px-4 py-2.5 rounded-[10px] text-[12px] font-semibold flex items-center justify-center gap-2 transition-all"
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z M14 2v6h6 M16 13H8 M16 17H8 M10 9H8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg>
                Exportar PDF
              </button>
              <button
                onClick={handleShareLink}
                className="flex-1 min-w-[160px] bg-white/[0.03] border border-white/[0.08] hover:border-white/[0.2] hover:text-white text-[#cfcfcf] px-4 py-2.5 rounded-[10px] text-[12px] font-semibold flex items-center justify-center gap-2 transition-all"
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none"><path d="M10 13a5 5 0 007.54.54l3-3a5 5 0 00-7.07-7.07l-1.72 1.71 M14 11a5 5 0 00-7.54-.54l-3 3a5 5 0 007.07 7.07l1.71-1.71" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg>
                {shareCopied ? 'Link copiado!' : 'Compartilhar Link'}
              </button>
            </div>
            {mode !== 'client' && (
              <p className="text-[10px] text-[#666] mt-2">Mude para "Modo Cliente" para enviar relatório personalizado.</p>
            )}
          </div>
        </div>
      </div>

      {/* ===== Save view modal ===== */}
      <AnimatePresence>
        {showSaveModal && (
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4"
            onClick={() => setShowSaveModal(false)}
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.95 }}
              onClick={(e) => e.stopPropagation()}
              className="bg-[#141416] border border-white/[0.08] rounded-[16px] p-6 w-full max-w-md"
            >
              <h3 className="text-[16px] font-bold text-white mb-3">Salvar Visão</h3>
              <p className="text-[12px] text-[#868686] mb-4">Salve a combinação atual de filtros pra reutilizar depois.</p>
              <input
                type="text"
                placeholder="Ex: Hamburguerias em risco"
                value={saveViewName}
                onChange={(e) => setSaveViewName(e.target.value)}
                className="w-full bg-white/[0.03] border border-white/[0.08] rounded-[10px] px-3 py-2 text-[13px] text-white placeholder-[#555] outline-none focus:border-[#F5A623]/50"
                autoFocus
              />
              <div className="flex gap-2 mt-5 justify-end">
                <button onClick={() => setShowSaveModal(false)} className="text-[12px] text-[#868686] hover:text-white px-4 py-2">
                  Cancelar
                </button>
                <button
                  onClick={saveCurrentView}
                  disabled={!saveViewName.trim()}
                  className="bg-gradient-to-b from-[#F5B638] to-[#E5961E] text-black font-semibold text-[12px] px-4 py-2 rounded-[10px] disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Salvar
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ===== Send to client modal ===== */}
      <AnimatePresence>
        {showSendModal && activeSingleClient && (
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4"
            onClick={() => !sending && setShowSendModal(false)}
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.95 }}
              onClick={(e) => e.stopPropagation()}
              className="bg-[#141416] border border-white/[0.08] rounded-[16px] p-6 w-full max-w-lg"
            >
              <h3 className="text-[16px] font-bold text-white mb-1">Enviar Relatório</h3>
              <p className="text-[12px] text-[#868686] mb-4">
                Para: <strong className="text-white">{activeSingleClient.client.name}</strong>
                {activeSingleClient.client.email && (
                  <> · <span className="text-[#cfcfcf]">{activeSingleClient.client.email}</span></>
                )}
              </p>
              <label className="text-[10px] uppercase tracking-widest font-bold text-[#666] mb-2 block">
                Mensagem (opcional)
              </label>
              <textarea
                rows={4}
                value={sendMessage}
                onChange={(e) => setSendMessage(e.target.value)}
                placeholder="Mensagem personalizada que vai junto do relatório..."
                className="w-full bg-white/[0.03] border border-white/[0.08] rounded-[10px] px-3 py-2 text-[12px] text-white placeholder-[#555] outline-none focus:border-[#F5A623]/50 resize-none"
              />
              {sendResult && (
                <div className={`mt-3 text-[11px] px-3 py-2 rounded-[8px] ${
                  sendResult.success
                    ? 'bg-emerald-500/10 border border-emerald-500/20 text-emerald-300'
                    : 'bg-red-500/10 border border-red-500/20 text-red-300'
                }`}>
                  {sendResult.message}
                </div>
              )}
              <div className="flex gap-2 mt-5 justify-end">
                <button
                  onClick={() => setShowSendModal(false)}
                  disabled={sending}
                  className="text-[12px] text-[#868686] hover:text-white px-4 py-2 disabled:opacity-50"
                >
                  Cancelar
                </button>
                <button
                  onClick={handleSend}
                  disabled={sending}
                  className="bg-gradient-to-b from-[#F5B638] to-[#E5961E] text-black font-semibold text-[12px] px-4 py-2 rounded-[10px] disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                >
                  {sending ? 'Enviando...' : 'Confirmar Envio'}
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
};

export default ReportsPage;
