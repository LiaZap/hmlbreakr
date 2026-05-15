/**
 * ActivityFeed — Painel de atividade recente do portfólio (Item 1.3)
 *
 * Timeline vertical mostrando o que cada restaurante andou fazendo:
 *  - Cadastrou pratos novos
 *  - Atualizou fichas técnicas
 *  - Lançou faturamento
 *  - Concluiu onboarding
 *  - Ativou BPO Financeira
 *  - Cadastrou insumos
 *
 * Foco: visibilidade operacional REAL (não login/logout genérico).
 *
 * V1: derivamos eventos dos dados existentes (sem tabela de event log).
 * Limitações: alguns eventos só aparecem quando dados detalhados estão
 * presentes (ver comentários "TODO" para cada um).
 */

import { useMemo, useState, useEffect, useCallback } from 'react';
import { motion } from 'framer-motion'; // eslint-disable-line no-unused-vars

// ─── Persistência do filtro de tipos de evento (BAH-093 #3) ─────
// O admin escolhe quais TIPOS de evento quer monitorar; a escolha
// é persistida em localStorage para sobreviver a reloads.
const FILTERS_STORAGE_KEY = 'breakr.admin.activity.filters';

// ─── Tempo relativo ─────────────────────────────────────────────
const formatRelativeTime = (ts) => {
  if (!ts || typeof ts !== 'number') return '';
  const now = Date.now();
  const diffMs = now - ts;
  if (diffMs < 0) return 'agora'; // futuro -> tratamos como agora
  const sec = Math.floor(diffMs / 1000);
  if (sec < 60) return 'agora';
  const min = Math.floor(sec / 60);
  if (min < 60) return `há ${min} min`;
  const h = Math.floor(min / 60);
  if (h < 24) return `há ${h} h`;
  const d = Math.floor(h / 24);
  if (d < 30) return `há ${d} dia${d !== 1 ? 's' : ''}`;
  // Mais antigo: data formatada
  try {
    return new Date(ts).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' });
  } catch {
    return '';
  }
};

// ─── Helpers ────────────────────────────────────────────────────
const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;

const parseDailyDateKey = (key) => {
  if (!key) return null;
  // Formatos típicos: "2026-05-01", "01/05/2026"
  if (/^\d{4}-\d{2}-\d{2}$/.test(key)) {
    const t = new Date(key + 'T12:00:00').getTime();
    return isNaN(t) ? null : t;
  }
  const m = key.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (m) {
    const t = new Date(`${m[3]}-${m[2]}-${m[1]}T12:00:00`).getTime();
    return isNaN(t) ? null : t;
  }
  const t = Date.parse(key);
  return isNaN(t) ? null : t;
};

const parseValue = (val) => {
  if (val == null) return 0;
  if (typeof val === 'number') return val;
  let s = String(val).replace(/R\$/g, '').trim();
  if (s.includes(',') && s.includes('.')) s = s.replace(/\./g, '').replace(',', '.');
  else if (s.includes(',')) s = s.replace(',', '.');
  return parseFloat(s) || 0;
};

const formatBRL = (v) => {
  try {
    return v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', minimumFractionDigits: 2 });
  } catch {
    return `R$ ${v.toFixed(2)}`;
  }
};

// ─── Estilos por tipo de evento ─────────────────────────────────
const EVENT_STYLES = {
  ficha_update: { icon: '📊', color: '#F5A623', bg: 'bg-[#F5A623]/10', border: 'border-[#F5A623]/30' },
  new_fichas: { icon: '🍕', color: '#00B37E', bg: 'bg-[#00B37E]/10', border: 'border-[#00B37E]/30' },
  revenue: { icon: '💰', color: '#FFB800', bg: 'bg-[#FFB800]/10', border: 'border-[#FFB800]/30' },
  onboarding_complete: { icon: '✓', color: '#00B37E', bg: 'bg-[#00B37E]/10', border: 'border-[#00B37E]/30' },
  bpo_activated: { icon: '🏦', color: '#7C5CFF', bg: 'bg-[#7C5CFF]/10', border: 'border-[#7C5CFF]/30' },
  insumos_added: { icon: '📦', color: '#06B6D4', bg: 'bg-[#06B6D4]/10', border: 'border-[#06B6D4]/30' },
  client_created: { icon: '✨', color: '#EC4899', bg: 'bg-[#EC4899]/10', border: 'border-[#EC4899]/30' },
};

// ─── Tipos de evento monitoráveis (BAH-093 #3) ──────────────────
// Lista canônica dos tipos que o ActivityFeed sabe derivar — usada
// para montar o seletor de filtros. A ordem aqui é a ordem dos chips.
const EVENT_TYPES = [
  { type: 'client_created',      label: 'Novo cadastro' },
  { type: 'onboarding_complete', label: 'Onboarding concluído' },
  { type: 'new_fichas',          label: 'Pratos novos' },
  { type: 'ficha_update',        label: 'Fichas atualizadas' },
  { type: 'insumos_added',       label: 'Insumos cadastrados' },
  { type: 'revenue',             label: 'Faturamento lançado' },
  { type: 'bpo_activated',       label: 'BPO ativada' },
];

const ALL_EVENT_TYPES = EVENT_TYPES.map((e) => e.type);

// Lê os tipos selecionados do localStorage. Default: todos ativos.
// Robusto a JSON inválido, chave ausente e tipos obsoletos.
const loadSelectedTypes = () => {
  try {
    const raw = localStorage.getItem(FILTERS_STORAGE_KEY);
    if (!raw) return [...ALL_EVENT_TYPES];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [...ALL_EVENT_TYPES];
    // Mantém só tipos ainda válidos (defesa contra versões antigas).
    const valid = parsed.filter((t) => ALL_EVENT_TYPES.includes(t));
    return valid.length > 0 ? valid : [...ALL_EVENT_TYPES];
  } catch {
    return [...ALL_EVENT_TYPES];
  }
};

// ─── Derivação de eventos por cliente ───────────────────────────
const deriveClientEvents = (client) => {
  const events = [];
  if (!client) return events;

  let data = {};
  try {
    data = typeof client.data === 'string' ? JSON.parse(client.data || '{}') : (client.data || {});
  } catch {
    return events;
  }

  const fd = data?.formData || {};
  const op = data?.operational || {};
  const fichas = Array.isArray(op.fichas) ? op.fichas : [];
  const insumos = Array.isArray(op.insumos) ? op.insumos : [];
  // Fix: tenta múltiplos campos de logo pra cobrir todas situações
  const clientLogo = data?.restaurant?.logo
    || data?.user?.photo
    || data?.profile?.photo
    || data?.formData?.identity?.business_logo
    || null;
  const clientName = client.name || data?.restaurant?.name || 'Restaurante';
  const now = Date.now();
  const cutoff = now - SEVEN_DAYS_MS;

  const baseEvent = (extra) => ({
    clientId: client.id,
    clientHash: client.hash,
    clientName,
    clientLogo,
    ...extra,
  });

  // 1. Fichas atualizadas (lastUpdated nos últimos 7 dias)
  const recentFichaUpdates = fichas
    .filter((f) => f && typeof f.lastUpdated === 'number' && f.lastUpdated > cutoff && f.lastUpdated <= now)
    .sort((a, b) => b.lastUpdated - a.lastUpdated);

  if (recentFichaUpdates.length > 0) {
    const latest = recentFichaUpdates[0].lastUpdated;
    const names = recentFichaUpdates
      .slice(0, 3)
      .map((f) => f.nome || f.name)
      .filter(Boolean)
      .join(', ');
    events.push(
      baseEvent({
        id: `${client.id}-ficha_update-${latest}`,
        type: 'ficha_update',
        timestamp: latest,
        text: `Atualizou ${recentFichaUpdates.length} ficha${recentFichaUpdates.length !== 1 ? 's' : ''} técnica${recentFichaUpdates.length !== 1 ? 's' : ''}`,
        detail: names || null,
      }),
    );
  }

  // 2. Fichas novas (createdAt nos últimos 7 dias)
  const recentFichaCreates = fichas
    .filter((f) => f && typeof f.createdAt === 'number' && f.createdAt > cutoff && f.createdAt <= now)
    .sort((a, b) => b.createdAt - a.createdAt);

  if (recentFichaCreates.length > 0) {
    const latest = recentFichaCreates[0].createdAt;
    const names = recentFichaCreates
      .slice(0, 3)
      .map((f) => f.nome || f.name)
      .filter(Boolean)
      .join(', ');
    events.push(
      baseEvent({
        id: `${client.id}-new_fichas-${latest}`,
        type: 'new_fichas',
        timestamp: latest,
        text: `Cadastrou ${recentFichaCreates.length} novo${recentFichaCreates.length !== 1 ? 's' : ''} prato${recentFichaCreates.length !== 1 ? 's' : ''}`,
        detail: names || null,
      }),
    );
  }

  // 3. Faturamento diário (chave = data; valor = número)
  const daily = fd.daily_revenue && typeof fd.daily_revenue === 'object' ? fd.daily_revenue : {};
  const dailyEntries = Object.entries(daily)
    .map(([k, v]) => ({ key: k, ts: parseDailyDateKey(k), value: parseValue(v) }))
    .filter((e) => e.ts !== null && e.ts > cutoff && e.ts <= now && e.value > 0)
    .sort((a, b) => b.ts - a.ts);

  if (dailyEntries.length > 0) {
    const total = dailyEntries.reduce((acc, e) => acc + e.value, 0);
    const latest = dailyEntries[0];
    let dateLabel;
    try {
      dateLabel = new Date(latest.ts).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' });
    } catch {
      dateLabel = latest.key;
    }
    if (dailyEntries.length === 1) {
      events.push(
        baseEvent({
          id: `${client.id}-revenue-${latest.ts}`,
          type: 'revenue',
          timestamp: latest.ts,
          text: `Lançou faturamento de ${formatBRL(latest.value)}`,
          detail: dateLabel,
        }),
      );
    } else {
      events.push(
        baseEvent({
          id: `${client.id}-revenue-${latest.ts}`,
          type: 'revenue',
          timestamp: latest.ts,
          text: `Lançou ${dailyEntries.length} dia${dailyEntries.length !== 1 ? 's' : ''} de faturamento`,
          detail: `Total: ${formatBRL(total)} (último: ${dateLabel})`,
        }),
      );
    }
  }

  // 4. Onboarding concluído (BAH-093 #2)
  //
  // BUG anterior: o evento só era emitido se houvesse atividade recente
  // (ficha/insumo/faturamento) nos últimos 7 dias para servir de "proxy"
  // de timestamp. Mas a listagem /admin/clients é LEVE — ela remove
  // `operational` (fichas/insumos) e `daily_revenue`, então o proxy era
  // SEMPRE null no painel admin e o evento NUNCA aparecia.
  //
  // FIX: não existe timestamp dedicado de conclusão de onboarding. Usamos,
  // em ordem de preferência: (a) qualquer proxy de atividade detalhada
  // disponível (quando o objeto cliente vem completo, ex.: dashboard),
  // (b) `client.updatedAt` (última escrita — o onboarding marca a flag
  // numa escrita), (c) `client.createdAt`. Assim a conclusão SEMPRE gera
  // um evento visível na timeline.
  if (fd.onboarding_completed) {
    let onboardingTs = null;
    if (recentFichaCreates.length > 0) onboardingTs = recentFichaCreates[0].createdAt;
    else if (recentFichaUpdates.length > 0) onboardingTs = recentFichaUpdates[0].lastUpdated;
    else if (dailyEntries.length > 0) onboardingTs = dailyEntries[0].ts;

    if (!onboardingTs) {
      const updatedRaw = client.updatedAt || client.createdAt || null;
      if (updatedRaw) {
        const parsed = typeof updatedRaw === 'number' ? updatedRaw : Date.parse(updatedRaw);
        if (!isNaN(parsed) && parsed <= now) onboardingTs = parsed;
      }
    }

    if (onboardingTs) {
      const detail = (fichas.length > 0 || insumos.length > 0)
        ? `${fichas.length} ficha${fichas.length !== 1 ? 's' : ''} · ${insumos.length} insumo${insumos.length !== 1 ? 's' : ''}`
        : 'Cadastro de custos e estrutura finalizado';
      events.push(
        baseEvent({
          id: `${client.id}-onboarding_complete-${onboardingTs}`,
          type: 'onboarding_complete',
          timestamp: onboardingTs,
          text: 'Concluiu o onboarding',
          detail,
        }),
      );
    }
  }

  // 5. BPO ativado — usa coluna bpoActivatedAt (vem direto do client) ou data._bpo.activatedAt
  const bpoEnabled = client.bpoEnabled === true || (data._bpo && data._bpo.enabled === true);
  const bpoActivatedAtRaw = client.bpoActivatedAt || data?._bpo?.activatedAt || null;
  let bpoTs = null;
  if (bpoActivatedAtRaw) {
    const parsed = typeof bpoActivatedAtRaw === 'number'
      ? bpoActivatedAtRaw
      : Date.parse(bpoActivatedAtRaw);
    if (!isNaN(parsed) && parsed <= now) bpoTs = parsed;
  }
  if (bpoEnabled && bpoTs && bpoTs > cutoff) {
    events.push(
      baseEvent({
        id: `${client.id}-bpo_activated-${bpoTs}`,
        type: 'bpo_activated',
        timestamp: bpoTs,
        text: 'BPO Financeira ativada',
        detail: 'Cliente migrou pro plano com gestão financeira',
      }),
    );
  }

  // 6. Insumos cadastrados (timestamps quando disponíveis)
  const recentInsumos = insumos
    .filter((i) => i && typeof i.createdAt === 'number' && i.createdAt > cutoff && i.createdAt <= now)
    .sort((a, b) => b.createdAt - a.createdAt);

  if (recentInsumos.length > 0) {
    const latest = recentInsumos[0].createdAt;
    const names = recentInsumos
      .slice(0, 3)
      .map((i) => i.nome || i.name)
      .filter(Boolean)
      .join(', ');
    events.push(
      baseEvent({
        id: `${client.id}-insumos_added-${latest}`,
        type: 'insumos_added',
        timestamp: latest,
        text: `Cadastrou ${recentInsumos.length} insumo${recentInsumos.length !== 1 ? 's' : ''}`,
        detail: names || null,
      }),
    );
  }

  // 7. Cliente criado recentemente (createdAt da Client row)
  if (client.createdAt) {
    const createdTs = typeof client.createdAt === 'number'
      ? client.createdAt
      : Date.parse(client.createdAt);
    if (!isNaN(createdTs) && createdTs > cutoff && createdTs <= now) {
      events.push(
        baseEvent({
          id: `${client.id}-client_created-${createdTs}`,
          type: 'client_created',
          timestamp: createdTs,
          text: 'Novo restaurante cadastrado',
          detail: client.email || null,
        }),
      );
    }
  }

  // TODO (v2 — requer event log no backend):
  //  - "CMV mudou de X% pra Y%" (precisamos de histórico, não só snapshot atual)
  //  - "Login do cliente" (precisa rastrear sessions)
  //  - "Preço do prato X foi reajustado de R$Y pra R$Z" (precisa diff)
  //  - "Insumo subiu Y% no custo" (precisa histórico de preço)

  return events;
};

// ─── Filtros de período ─────────────────────────────────────────
const TIME_FILTERS = {
  all: { label: 'Todos', cutoff: () => 0 },
  today: { label: 'Hoje', cutoff: () => Date.now() - 24 * 60 * 60 * 1000 },
  week: { label: 'Esta semana', cutoff: () => Date.now() - SEVEN_DAYS_MS },
};

// ─── Card de evento ─────────────────────────────────────────────
const EventCard = ({ event, onClick }) => {
  const style = EVENT_STYLES[event.type] || EVENT_STYLES.ficha_update;
  const [imgFailed, setImgFailed] = useState(false);

  return (
    <motion.button
      type="button"
      initial={{ opacity: 0, x: -8 }}
      animate={{ opacity: 1, x: 0 }}
      onClick={onClick}
      className={`group flex items-start gap-3 p-3 rounded-[12px] border ${style.border} ${style.bg} hover:bg-white/[0.04] transition-colors cursor-pointer text-left w-full`}
      aria-label={`Abrir ${event.clientName}: ${event.text}`}
    >
      {/* Avatar do cliente */}
      <div className="shrink-0 relative">
        {event.clientLogo && !imgFailed ? (
          <img
            src={event.clientLogo}
            alt={event.clientName}
            className="w-9 h-9 rounded-full object-cover bg-white/[0.04]"
            onError={() => setImgFailed(true)}
          />
        ) : (
          <div className="w-9 h-9 rounded-full bg-white/[0.06] text-[#CCC] flex items-center justify-center text-[12px] font-bold">
            {(event.clientName || '?').charAt(0).toUpperCase()}
          </div>
        )}
        {/* Ícone do evento sobreposto no canto inferior direito */}
        <div
          className="absolute -bottom-1 -right-1 w-5 h-5 rounded-full flex items-center justify-center text-[10px] border-2 border-[#141416]"
          style={{ backgroundColor: style.color }}
          aria-hidden="true"
        >
          {style.icon}
        </div>
      </div>

      {/* Conteúdo do evento */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between gap-2 mb-0.5">
          <span className="text-[12px] font-bold text-white truncate">
            {event.clientName}
          </span>
          <span className="text-[10px] text-[#666] shrink-0">
            {formatRelativeTime(event.timestamp)}
          </span>
        </div>
        <div className="text-[12px] font-semibold text-white/90 mb-0.5 leading-snug">
          {event.text}
        </div>
        {event.detail && (
          <div className="text-[11px] text-[#999] truncate leading-snug">
            {event.detail}
          </div>
        )}
      </div>
    </motion.button>
  );
};

// ─── Componente principal ───────────────────────────────────────
const ActivityFeed = ({ clients, maxItems = 30, onClientClick }) => {
  const [filter, setFilter] = useState('week');

  // BAH-093 #3 — tipos de evento que o admin escolheu monitorar.
  // Inicializa do localStorage (lazy) e persiste a cada mudança.
  const [selectedTypes, setSelectedTypes] = useState(loadSelectedTypes);

  useEffect(() => {
    try {
      localStorage.setItem(FILTERS_STORAGE_KEY, JSON.stringify(selectedTypes));
    } catch {
      // localStorage indisponível (modo privado/quota) — ignora silenciosamente.
    }
  }, [selectedTypes]);

  const toggleType = useCallback((type) => {
    setSelectedTypes((prev) =>
      prev.includes(type) ? prev.filter((t) => t !== type) : [...prev, type],
    );
  }, []);

  const setAllTypes = useCallback((on) => {
    setSelectedTypes(on ? [...ALL_EVENT_TYPES] : []);
  }, []);

  const allEvents = useMemo(() => {
    const items = [];
    (clients || []).forEach((client) => {
      try {
        const evs = deriveClientEvents(client);
        items.push(...evs);
      } catch (e) {
        console.warn('ActivityFeed: erro ao derivar eventos do cliente', client?.name, e);
      }
    });
    items.sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));
    return items;
  }, [clients]);

  // Eventos após o filtro de TIPO (independente do filtro de período).
  const typeFilteredEvents = useMemo(
    () => allEvents.filter((e) => selectedTypes.includes(e.type)),
    [allEvents, selectedTypes],
  );

  const filtered = useMemo(() => {
    const cutoff = (TIME_FILTERS[filter] || TIME_FILTERS.all).cutoff();
    return typeFilteredEvents.filter((e) => (e.timestamp || 0) >= cutoff).slice(0, maxItems);
  }, [typeFilteredEvents, filter, maxItems]);

  const counts = useMemo(() => {
    return {
      all: typeFilteredEvents.length,
      today: typeFilteredEvents.filter((e) => (e.timestamp || 0) >= TIME_FILTERS.today.cutoff()).length,
      week: typeFilteredEvents.filter((e) => (e.timestamp || 0) >= TIME_FILTERS.week.cutoff()).length,
    };
  }, [typeFilteredEvents]);

  // Contagem por tipo (sobre todos os eventos) — exibida em cada chip.
  const typeCounts = useMemo(() => {
    const acc = {};
    allEvents.forEach((e) => { acc[e.type] = (acc[e.type] || 0) + 1; });
    return acc;
  }, [allEvents]);

  const allTypesOn = selectedTypes.length === ALL_EVENT_TYPES.length;

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className="bg-gradient-to-br from-[#141416] via-[#101013] to-[#0F0F11] border border-white/[0.06] rounded-[18px] overflow-hidden"
    >
      {/* Header */}
      <div className="p-5 pb-3 border-b border-white/[0.04]">
        <div className="flex items-center gap-3 mb-3">
          <div className="w-10 h-10 rounded-full bg-gradient-to-br from-[#7C5CFF]/20 to-[#06B6D4]/20 flex items-center justify-center">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <path d="M12 2v6M12 16v6M4.93 4.93l4.24 4.24M14.83 14.83l4.24 4.24M2 12h6M16 12h6M4.93 19.07l4.24-4.24M14.83 9.17l4.24-4.24" stroke="#7C5CFF" strokeWidth="2" strokeLinecap="round" />
            </svg>
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-[15px] font-bold text-white">Atividade recente</div>
            <div className="text-[11px] text-[#868686] mt-0.5">
              {counts.all === 0
                ? 'Sem atividade detectada'
                : `${counts.week} evento${counts.week !== 1 ? 's' : ''} essa semana`}
            </div>
          </div>
        </div>

        {/* Filtros de período */}
        <div className="flex gap-2 flex-wrap">
          {Object.entries(TIME_FILTERS).map(([key, cfg]) => (
            <button
              key={key}
              onClick={() => setFilter(key)}
              className={`text-[11px] font-semibold px-3 py-1.5 rounded-full transition-colors ${
                filter === key
                  ? 'bg-white/10 text-white'
                  : 'bg-white/[0.04] text-[#868686] hover:bg-white/[0.08]'
              }`}
            >
              {cfg.label} ({counts[key]})
            </button>
          ))}
        </div>

        {/* Filtro de tipos de evento (BAH-093 #3) — escolha persistida em localStorage */}
        <div className="mt-3 pt-3 border-t border-white/[0.04]">
          <div className="flex items-center justify-between gap-2 mb-2">
            <span className="text-[10px] font-bold uppercase tracking-wide text-[#666]">
              Monitorar
            </span>
            <button
              onClick={() => setAllTypes(!allTypesOn)}
              className="text-[10px] font-semibold text-[#F5A623] hover:text-[#FFC100] transition-colors"
            >
              {allTypesOn ? 'Limpar tudo' : 'Marcar tudo'}
            </button>
          </div>
          <div className="flex gap-1.5 flex-wrap">
            {EVENT_TYPES.map(({ type, label }) => {
              const active = selectedTypes.includes(type);
              const style = EVENT_STYLES[type] || EVENT_STYLES.ficha_update;
              const n = typeCounts[type] || 0;
              return (
                <button
                  key={type}
                  type="button"
                  onClick={() => toggleType(type)}
                  aria-pressed={active}
                  title={active ? `Ocultar: ${label}` : `Mostrar: ${label}`}
                  className={`flex items-center gap-1.5 text-[11px] font-semibold px-2.5 py-1 rounded-full border transition-colors ${
                    active
                      ? 'text-white'
                      : 'border-white/[0.06] bg-white/[0.02] text-[#666] hover:bg-white/[0.05]'
                  }`}
                  style={active ? {
                    borderColor: `${style.color}55`,
                    backgroundColor: `${style.color}1F`,
                  } : undefined}
                >
                  <span aria-hidden="true" className="text-[10px] leading-none">
                    {style.icon}
                  </span>
                  {label}
                  <span className={active ? 'text-white/55' : 'text-[#555]'}>
                    {n}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* Lista de eventos */}
      <div className="p-3 max-h-[560px] overflow-y-auto">
        {filtered.length === 0 ? (
          <EmptyState
            filter={filter}
            hasAny={allEvents.length > 0}
            noTypesSelected={selectedTypes.length === 0}
          />
        ) : (
          <div className="space-y-2">
            {filtered.map((event) => (
              <EventCard
                key={event.id}
                event={event}
                onClick={() => onClientClick?.(event.clientHash)}
              />
            ))}
            {allEvents.length > maxItems && filter === 'all' && (
              <div className="text-[10px] text-[#666] text-center pt-2">
                Mostrando {maxItems} de {allEvents.length} eventos.
              </div>
            )}
          </div>
        )}
      </div>
    </motion.div>
  );
};

const EmptyState = ({ filter, hasAny, noTypesSelected }) => {
  const messages = {
    all: hasAny
      ? 'Nenhum evento ainda.'
      : 'Quando os restaurantes começarem a usar o sistema, a atividade vai aparecer aqui.',
    today: 'Nenhuma atividade hoje.',
    week: 'Nenhuma atividade essa semana.',
  };
  // Caso o admin tenha desmarcado todos os tipos no filtro "Monitorar".
  const text = noTypesSelected
    ? 'Nenhum tipo de evento selecionado. Marque ao menos um tipo em "Monitorar" acima.'
    : (messages[filter] || messages.all);
  return (
    <div className="flex flex-col items-center justify-center py-10 px-4 text-center">
      <div className="w-12 h-12 rounded-full bg-white/[0.04] flex items-center justify-center mb-3">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <circle cx="12" cy="12" r="10" stroke="#444" strokeWidth="2" />
          <path d="M12 6v6l4 2" stroke="#444" strokeWidth="2" strokeLinecap="round" />
        </svg>
      </div>
      <div className="text-[12px] text-[#868686] max-w-[260px] leading-snug">
        {text}
      </div>
    </div>
  );
};

export default ActivityFeed;
