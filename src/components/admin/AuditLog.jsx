/**
 * AuditLog — tela de Auditoria do painel admin.
 *
 * Timeline vertical dos eventos de auditoria registrados pelo backend:
 * ações administrativas, sync de Client.data, restores de snapshot, etc.
 *
 * Foco em visibilidade e DETECÇÃO DE INCIDENTES — eventos críticos como
 * `client.data_sync` com `shrink: true` (possível perda de dados, cf.
 * incidente Garapas 2026-05-11) recebem destaque vermelho de ALERTA.
 *
 * Dados: GET /api/admin/audit (auditService.listAudit). Cada item:
 *   id, action, entityType, entityId, actorType, actorId, actorLabel,
 *   summary, metadata (JSON string), createdAt.
 *
 * Filtros: tipo de ação (chips), período (presets) e busca textual.
 * Filtro de período/ação reaplica o fetch; busca textual é client-side.
 */

import { useState, useEffect, useCallback, useMemo } from 'react';
import { motion } from 'framer-motion'; // eslint-disable-line no-unused-vars
import { adminFetch } from '../../utils/adminAuth';

const PAGE_SIZE = 30;

// ─── Estilos por tipo de ação ───────────────────────────────────
// Fallback genérico cobre ações ainda não catalogadas.
const ACTION_STYLES = {
  'client.data_sync':       { icon: '🔄', color: '#06B6D4', label: 'Sync de dados' },
  'client.created':         { icon: '✨', color: '#EC4899', label: 'Cliente criado' },
  'client.updated':         { icon: '✏️', color: '#F5A623', label: 'Cliente atualizado' },
  'snapshot.restore':       { icon: '⏮️', color: '#7C5CFF', label: 'Restore de snapshot' },
  'snapshot.created':       { icon: '📸', color: '#7C5CFF', label: 'Snapshot criado' },
  'admin.login':            { icon: '🔑', color: '#00B37E', label: 'Login admin' },
  'admin.user_created':     { icon: '👤', color: '#00B37E', label: 'Funcionário criado' },
  'admin.user_updated':     { icon: '👤', color: '#F5A623', label: 'Funcionário atualizado' },
  'broadcast.created':      { icon: '📢', color: '#FFB800', label: 'Comunicado criado' },
  'bpo.payable':            { icon: '💸', color: '#F5A623', label: 'Conta a pagar' },
  'bpo.receivable':         { icon: '💰', color: '#00B37E', label: 'Conta a receber' },
};
const FALLBACK_STYLE = { icon: '📋', color: '#868686', label: 'Evento' };

const styleFor = (action) => ACTION_STYLES[action] || FALLBACK_STYLE;

// ─── Filtros de período (presets) ───────────────────────────────
const DAY_MS = 24 * 60 * 60 * 1000;
const PERIOD_FILTERS = {
  all:   { label: 'Tudo',     days: null },
  today: { label: 'Hoje',     days: 1 },
  week:  { label: '7 dias',   days: 7 },
  month: { label: '30 dias',  days: 30 },
};

// fromDate ISO pro preset selecionado (null = sem corte)
const periodFromDate = (key) => {
  const cfg = PERIOD_FILTERS[key];
  if (!cfg || !cfg.days) return null;
  return new Date(Date.now() - cfg.days * DAY_MS).toISOString();
};

// ─── Formatação de data/hora (pt-BR, America/Sao_Paulo) ─────────
const formatDateTime = (iso) => {
  if (!iso) return '';
  try {
    return new Date(iso).toLocaleString('pt-BR', {
      timeZone: 'America/Sao_Paulo',
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return String(iso);
  }
};

const formatRelative = (iso) => {
  if (!iso) return '';
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return '';
  const diff = Date.now() - t;
  if (diff < 0) return 'agora';
  const min = Math.floor(diff / 60000);
  if (min < 1) return 'agora';
  if (min < 60) return `há ${min} min`;
  const h = Math.floor(min / 60);
  if (h < 24) return `há ${h} h`;
  const d = Math.floor(h / 24);
  return `há ${d} dia${d !== 1 ? 's' : ''}`;
};

// ─── Parsing de metadata ────────────────────────────────────────
// metadata vem como string JSON; parse defensivo (string inválida ou
// objeto já desserializado são tratados).
const parseMetadata = (raw) => {
  if (!raw) return null;
  if (typeof raw === 'object') return raw;
  try {
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? parsed : null;
  } catch {
    return null;
  }
};

const formatBytes = (n) => {
  const v = Number(n);
  if (!Number.isFinite(v) || v <= 0) return null;
  if (v < 1024) return `${v} B`;
  if (v < 1024 * 1024) return `${(v / 1024).toFixed(0)} KB`;
  return `${(v / (1024 * 1024)).toFixed(1)} MB`;
};

/**
 * Extrai detalhe legível da metadata e sinaliza se o evento é crítico.
 * Caso especial `client.data_sync`: mostra "91 KB → 93 KB" e marca
 * `shrink` quando metadata.shrink === true (possível perda de dados).
 */
const describeMetadata = (action, metadata) => {
  if (!metadata) return { detail: null, shrink: false };

  if (action === 'client.data_sync') {
    const before = formatBytes(metadata.sizeBefore ?? metadata.beforeSize ?? metadata.previousSize);
    const after = formatBytes(metadata.sizeAfter ?? metadata.afterSize ?? metadata.newSize ?? metadata.size);
    let detail = null;
    if (before && after) detail = `${before} → ${after}`;
    else if (after) detail = after;
    return { detail, shrink: metadata.shrink === true };
  }

  // Genérico: mostra um par chave/valor curto e relevante, se houver.
  const entries = Object.entries(metadata).filter(
    ([, v]) => v != null && typeof v !== 'object',
  );
  if (entries.length === 0) return { detail: null, shrink: false };
  const detail = entries
    .slice(0, 3)
    .map(([k, v]) => `${k}: ${v}`)
    .join(' · ');
  return { detail, shrink: false };
};

// ─── Card de evento ─────────────────────────────────────────────
const AuditCard = ({ event }) => {
  const style = styleFor(event.action);
  const metadata = useMemo(() => parseMetadata(event.metadata), [event.metadata]);
  const { detail, shrink } = useMemo(
    () => describeMetadata(event.action, metadata),
    [event.action, metadata],
  );

  return (
    <motion.div
      initial={{ opacity: 0, x: -8 }}
      animate={{ opacity: 1, x: 0 }}
      className={`flex items-start gap-3 p-3 sm:p-4 rounded-[12px] border transition-colors ${
        shrink
          ? 'border-[#E5484D]/45 bg-[#E5484D]/[0.08]'
          : 'border-white/[0.06] bg-white/[0.02] hover:bg-white/[0.04]'
      }`}
    >
      {/* Ícone da ação */}
      <div
        className="shrink-0 w-9 h-9 rounded-full flex items-center justify-center text-[14px]"
        style={{ backgroundColor: `${style.color}1F`, border: `1px solid ${style.color}44` }}
        aria-hidden="true"
      >
        {style.icon}
      </div>

      {/* Conteúdo */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between gap-2 flex-wrap mb-0.5">
          <div className="flex items-center gap-2 flex-wrap">
            <span
              className="text-[10px] font-bold uppercase tracking-wide px-2 py-0.5 rounded-full"
              style={{ backgroundColor: `${style.color}1F`, color: style.color }}
            >
              {style.label}
            </span>
            {shrink && (
              <span className="text-[10px] font-bold uppercase tracking-wide px-2 py-0.5 rounded-full bg-[#E5484D]/20 text-[#FF6B6B] border border-[#E5484D]/40">
                ⚠ Possível perda de dados
              </span>
            )}
          </div>
          <span
            className="text-[10px] text-[#666] shrink-0"
            title={formatDateTime(event.createdAt)}
          >
            {formatRelative(event.createdAt)}
          </span>
        </div>

        <div className="text-[13px] font-semibold text-white/90 leading-snug">
          {event.summary || event.action}
        </div>

        {detail && (
          <div
            className={`text-[11px] mt-0.5 leading-snug ${
              shrink ? 'text-[#FF8A8A] font-semibold' : 'text-[#999]'
            }`}
          >
            {detail}
          </div>
        )}

        <div className="flex items-center gap-2 flex-wrap mt-1.5 text-[10px] text-[#666]">
          {event.actorLabel && (
            <span className="text-[#9A9A9A]">
              <span className="text-[#666]">por</span>{' '}
              <span className="text-white/70 font-semibold">{event.actorLabel}</span>
              {event.actorType && (
                <span className="text-[#555]"> ({event.actorType})</span>
              )}
            </span>
          )}
          {event.entityType && (
            <span className="px-1.5 py-0.5 rounded bg-white/[0.04]">
              {event.entityType}
              {event.entityId ? `:${String(event.entityId).slice(0, 8)}` : ''}
            </span>
          )}
          <span>{formatDateTime(event.createdAt)}</span>
        </div>
      </div>
    </motion.div>
  );
};

// ─── Componente principal ───────────────────────────────────────
const AuditLog = () => {
  const [events, setEvents] = useState([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState(null);

  const [period, setPeriod] = useState('week');
  const [actionFilter, setActionFilter] = useState('');
  const [search, setSearch] = useState('');
  const [offset, setOffset] = useState(0);

  // Busca uma página. `append` controla "carregar mais" vs. reset.
  const fetchPage = useCallback(
    async (pageOffset, append) => {
      append ? setLoadingMore(true) : setLoading(true);
      setError(null);
      try {
        const params = new URLSearchParams();
        params.set('limit', String(PAGE_SIZE));
        params.set('offset', String(pageOffset));
        if (actionFilter) params.set('action', actionFilter);
        const from = periodFromDate(period);
        if (from) params.set('fromDate', from);

        const res = await adminFetch(`/api/admin/audit?${params.toString()}`);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const json = await res.json();
        const items = Array.isArray(json.items) ? json.items : [];

        setEvents((prev) => (append ? [...prev, ...items] : items));
        setTotal(typeof json.total === 'number' ? json.total : items.length);
        setOffset(pageOffset);
      } catch (err) {
        console.error('AuditLog: erro ao buscar auditoria', err);
        if (!append) setEvents([]);
        setError('Não foi possível carregar a auditoria. Tente novamente.');
      } finally {
        append ? setLoadingMore(false) : setLoading(false);
      }
    },
    [actionFilter, period],
  );

  // Refaz a busca quando período/ação mudam (reset da paginação).
  useEffect(() => {
    fetchPage(0, false);
  }, [fetchPage]);

  // Busca textual é client-side (sobre summary / ator / entidade).
  const filteredEvents = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return events;
    return events.filter((e) => {
      const hay = `${e.summary || ''} ${e.actorLabel || ''} ${e.action || ''} ${e.entityType || ''} ${e.entityId || ''}`.toLowerCase();
      return hay.includes(q);
    });
  }, [events, search]);

  // Tipos de ação presentes nos dados carregados — alimenta os chips.
  const actionTypes = useMemo(() => {
    const seen = new Set(events.map((e) => e.action).filter(Boolean));
    return Array.from(seen).sort();
  }, [events]);

  // Conta alertas de shrink visíveis (banner de topo).
  const shrinkCount = useMemo(
    () =>
      filteredEvents.filter((e) => {
        if (e.action !== 'client.data_sync') return false;
        const md = parseMetadata(e.metadata);
        return md && md.shrink === true;
      }).length,
    [filteredEvents],
  );

  const hasMore = events.length < total;

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4 }}
    >
      {/* Cabeçalho */}
      <div className="mb-6">
        <div className="flex items-center gap-2 mb-2">
          <span className="text-[11px] font-semibold text-[#F5A623] uppercase tracking-widest bg-[#F5A623]/10 px-2.5 py-1 rounded-full border border-[#F5A623]/20">
            Trilha de Auditoria
          </span>
          <span className="text-[11px] text-[#555]">
            {total} evento{total !== 1 ? 's' : ''} registrado{total !== 1 ? 's' : ''}
          </span>
        </div>
        <h2 className="text-[22px] sm:text-[28px] font-bold text-white tracking-tight">
          Auditoria
        </h2>
        <p className="text-[12px] sm:text-[13px] text-[#868686] mt-1">
          Quem fez o quê e quando — rastreabilidade de ações administrativas e sync de dados.
        </p>
      </div>

      {/* Alerta de eventos críticos (shrink) */}
      {shrinkCount > 0 && (
        <div className="mb-4 flex items-start gap-2.5 p-3 rounded-[12px] border border-[#E5484D]/45 bg-[#E5484D]/[0.08]">
          <span className="text-[16px] leading-none" aria-hidden="true">⚠️</span>
          <div className="text-[12px] text-[#FF8A8A] leading-snug">
            <span className="font-bold">{shrinkCount} evento{shrinkCount !== 1 ? 's' : ''} de redução de dados</span>{' '}
            detectado{shrinkCount !== 1 ? 's' : ''} no período — verifique se houve perda de dados de cliente.
          </div>
        </div>
      )}

      {/* Filtros */}
      <div className="bg-gradient-to-br from-[#141416] via-[#101013] to-[#0F0F11] border border-white/[0.06] rounded-[18px] overflow-hidden mb-4">
        <div className="p-4 space-y-3">
          {/* Busca textual */}
          <div className="relative">
            <svg
              className="absolute left-3 top-1/2 -translate-y-1/2"
              width="15" height="15" viewBox="0 0 24 24" fill="none" aria-hidden="true"
            >
              <circle cx="11" cy="11" r="7" stroke="#666" strokeWidth="2" />
              <path d="M21 21l-4.35-4.35" stroke="#666" strokeWidth="2" strokeLinecap="round" />
            </svg>
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Buscar por cliente, ator ou ação..."
              className="w-full bg-white/[0.04] border border-white/[0.06] rounded-[10px] pl-9 pr-3 py-2 text-[13px] text-white placeholder:text-[#555] focus:outline-none focus:border-[#F5A623]/40 transition-colors"
            />
          </div>

          {/* Filtro de período */}
          <div className="flex gap-2 flex-wrap">
            {Object.entries(PERIOD_FILTERS).map(([key, cfg]) => (
              <button
                key={key}
                type="button"
                onClick={() => setPeriod(key)}
                className={`text-[11px] font-semibold px-3 py-1.5 rounded-full transition-colors ${
                  period === key
                    ? 'bg-white/10 text-white'
                    : 'bg-white/[0.04] text-[#868686] hover:bg-white/[0.08]'
                }`}
              >
                {cfg.label}
              </button>
            ))}
          </div>

          {/* Filtro por tipo de ação */}
          {actionTypes.length > 0 && (
            <div className="pt-2 border-t border-white/[0.04]">
              <div className="text-[10px] font-bold uppercase tracking-wide text-[#666] mb-2">
                Tipo de ação
              </div>
              <div className="flex gap-1.5 flex-wrap">
                <button
                  type="button"
                  onClick={() => setActionFilter('')}
                  className={`text-[11px] font-semibold px-2.5 py-1 rounded-full border transition-colors ${
                    actionFilter === ''
                      ? 'border-[#F5A623]/55 bg-[#F5A623]/20 text-white'
                      : 'border-white/[0.06] bg-white/[0.02] text-[#666] hover:bg-white/[0.05]'
                  }`}
                >
                  Todas
                </button>
                {actionTypes.map((action) => {
                  const style = styleFor(action);
                  const active = actionFilter === action;
                  return (
                    <button
                      key={action}
                      type="button"
                      onClick={() => setActionFilter(active ? '' : action)}
                      className={`flex items-center gap-1.5 text-[11px] font-semibold px-2.5 py-1 rounded-full border transition-colors ${
                        active ? 'text-white' : 'border-white/[0.06] bg-white/[0.02] text-[#666] hover:bg-white/[0.05]'
                      }`}
                      style={active ? {
                        borderColor: `${style.color}55`,
                        backgroundColor: `${style.color}1F`,
                      } : undefined}
                    >
                      <span aria-hidden="true" className="text-[10px] leading-none">{style.icon}</span>
                      {style.label}
                    </button>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Timeline */}
      <div className="bg-gradient-to-br from-[#141416] via-[#101013] to-[#0F0F11] border border-white/[0.06] rounded-[18px] overflow-hidden">
        <div className="p-3 sm:p-4">
          {loading ? (
            <LoadingState />
          ) : error ? (
            <ErrorState message={error} onRetry={() => fetchPage(0, false)} />
          ) : filteredEvents.length === 0 ? (
            <EmptyState hasFilters={!!search || !!actionFilter || period !== 'all'} />
          ) : (
            <>
              <div className="space-y-2">
                {filteredEvents.map((event) => (
                  <AuditCard key={event.id} event={event} />
                ))}
              </div>

              {/* Carregar mais (paginação por offset) */}
              {hasMore && !search && (
                <div className="pt-4 flex justify-center">
                  <button
                    type="button"
                    disabled={loadingMore}
                    onClick={() => fetchPage(offset + PAGE_SIZE, true)}
                    className="text-[12px] font-semibold px-5 py-2 rounded-[10px] bg-white/[0.05] text-white hover:bg-white/[0.1] transition-colors disabled:opacity-50"
                  >
                    {loadingMore ? 'Carregando...' : `Carregar mais (${total - events.length} restantes)`}
                  </button>
                </div>
              )}
              {search && (
                <div className="text-[10px] text-[#666] text-center pt-3">
                  Mostrando {filteredEvents.length} de {events.length} eventos carregados.
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </motion.div>
  );
};

// ─── Estados auxiliares ─────────────────────────────────────────
const LoadingState = () => (
  <div className="space-y-2">
    {[0, 1, 2, 3, 4].map((i) => (
      <div
        key={i}
        className="flex items-start gap-3 p-3 sm:p-4 rounded-[12px] border border-white/[0.06] bg-white/[0.02] animate-pulse"
      >
        <div className="w-9 h-9 rounded-full bg-white/[0.06] shrink-0" />
        <div className="flex-1 space-y-2">
          <div className="h-3 w-24 bg-white/[0.06] rounded" />
          <div className="h-3 w-2/3 bg-white/[0.06] rounded" />
          <div className="h-2.5 w-1/3 bg-white/[0.04] rounded" />
        </div>
      </div>
    ))}
  </div>
);

const ErrorState = ({ message, onRetry }) => (
  <div className="flex flex-col items-center justify-center py-12 px-4 text-center">
    <div className="w-12 h-12 rounded-full bg-[#E5484D]/10 flex items-center justify-center mb-3">
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <path d="M12 9v4M12 17h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"
          stroke="#E5484D" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </div>
    <div className="text-[12px] text-[#FF8A8A] max-w-[280px] leading-snug mb-3">{message}</div>
    <button
      type="button"
      onClick={onRetry}
      className="text-[12px] font-semibold px-4 py-2 rounded-[10px] bg-white/[0.05] text-white hover:bg-white/[0.1] transition-colors"
    >
      Tentar novamente
    </button>
  </div>
);

const EmptyState = ({ hasFilters }) => (
  <div className="flex flex-col items-center justify-center py-12 px-4 text-center">
    <div className="w-12 h-12 rounded-full bg-white/[0.04] flex items-center justify-center mb-3">
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <path d="M9 11l3 3L22 4M21 12v7a2 2 0 01-2 2H5a2 2 0 01-2-2V5a2 2 0 012-2h11"
          stroke="#444" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </div>
    <div className="text-[12px] text-[#868686] max-w-[280px] leading-snug">
      {hasFilters
        ? 'Nenhum evento de auditoria com os filtros selecionados. Tente ampliar o período ou limpar a busca.'
        : 'Nenhum evento de auditoria registrado ainda. As ações administrativas vão aparecer aqui conforme acontecem.'}
    </div>
  </div>
);

export default AuditLog;
