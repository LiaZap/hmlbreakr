/**
 * DailyBriefing — Briefing diário personalizado no topo do painel admin (item 4.1)
 *
 * Mostra:
 *  - Saudação contextual (Bom dia/Boa tarde/Boa noite) + data pt-BR
 *  - Ações urgentes hoje (top 3 alertas críticos do portfólio)
 *  - Insight do dia (gerado por IA, mock por enquanto)
 *  - Resumo de ontem (cadastros, churn, vendas, BPO ativados)
 *
 * Persistência local:
 *  - localStorage["breakr.admin.briefing.{YYYY-MM-DD}.actions"] = [{id, status}]
 *  - localStorage["breakr.admin.briefing.{YYYY-MM-DD}.dismissed"] = "true"
 *
 * Quando dismissed, renderiza versão minimizada com botão Reabrir.
 *
 * Integração com API:
 *  - GET /api/admin/daily-insights (com fallback gracioso pra mock local)
 */

import { useEffect, useMemo, useState, useCallback } from 'react';
import { motion } from 'framer-motion'; // eslint-disable-line no-unused-vars
import { computeClientHealth, generateClientAlerts, SEVERITY_ORDER } from '../../utils/clientHealth';

// ─────────────── localStorage helpers (try/catch silencioso) ───────────────
const lsGet = (key) => {
  try {
    if (typeof window === 'undefined') return null;
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
};

const lsSet = (key, value) => {
  try {
    if (typeof window === 'undefined') return;
    window.localStorage.setItem(key, value);
  } catch {
    /* storage cheio ou modo privado — segue silencioso */
  }
};

const lsRemove = (key) => {
  try {
    if (typeof window === 'undefined') return;
    window.localStorage.removeItem(key);
  } catch {
    /* idem */
  }
};

// ─────────────── data helpers ───────────────
const todayKey = () => {
  const d = new Date();
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
};

const greeting = () => {
  const h = new Date().getHours();
  if (h < 12) return { label: 'Bom dia', icon: '☀️' };
  if (h < 18) return { label: 'Boa tarde', icon: '🌤️' };
  return { label: 'Boa noite', icon: '🌙' };
};

const formatDateBR = (d) =>
  d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' });

const formatBRL = (n) => {
  if (typeof n !== 'number' || isNaN(n)) return 'R$ 0';
  if (n >= 1000) return `R$ ${(n / 1000).toFixed(1).replace('.', ',')}k`;
  return `R$ ${n.toFixed(0)}`;
};

// Mock local — usado se fetch falhar ou estiver offline
const getMockInsight = () => ({
  title: 'Insight do Dia',
  text: 'O preço do queijo subiu 18% nos últimos 30 dias. 14 restaurantes da sua base usam queijo intensamente — estimativa de R$ 18k de margem perdida/mês se não reajustarem cardápio.',
  actions: [
    { label: 'Enviar broadcast', action: 'broadcast' },
    { label: 'Adiar pra amanhã', action: 'snooze' },
  ],
});

// Top 3 alertas mais severos do portfólio → mapeados como ações urgentes
const buildUrgentActions = (clients) => {
  const all = [];
  (clients || []).forEach((c) => {
    try {
      const data = typeof c.data === 'string' ? JSON.parse(c.data || '{}') : c.data || {};
      const health = computeClientHealth(data);
      if (!health) return;
      const alerts = generateClientAlerts(health);
      alerts.forEach((a) => all.push({ ...a, client: c }));
    } catch {
      /* cliente sem JSON parseável */
    }
  });
  all.sort(
    (a, b) =>
      (SEVERITY_ORDER[a.severity] ?? 99) - (SEVERITY_ORDER[b.severity] ?? 99) ||
      (a.client.name || '').localeCompare(b.client.name || ''),
  );
  return all.slice(0, 3).map((alert, idx) => {
    const icon =
      alert.severity === 'critical' ? '🔴' : alert.severity === 'high' ? '🟠' : '🟡';
    return {
      id: `alert_${alert.client.id || idx}_${alert.type}`,
      icon,
      title: `${alert.client.name}: ${alert.title}`,
      detail: alert.action,
    };
  });
};

const computeYesterdaySummary = (clients) => {
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1).getTime();
  const end = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();

  let newClients = 0;
  let totalRevenue = 0;
  let bpoActivations = 0;

  (clients || []).forEach((c) => {
    try {
      const created = c.createdAt ? new Date(c.createdAt).getTime() : null;
      if (created && created >= start && created < end) newClients += 1;

      if (c.bpoActivatedAt) {
        const t = new Date(c.bpoActivatedAt).getTime();
        if (t >= start && t < end) bpoActivations += 1;
      }

      const data = typeof c.data === 'string' ? JSON.parse(c.data || '{}') : c.data || {};
      const daily = data?.formData?.daily_revenue || {};
      Object.entries(daily).forEach(([dateStr, val]) => {
        const d = new Date(dateStr).getTime();
        if (!isNaN(d) && d >= start && d < end) {
          const num =
            typeof val === 'number'
              ? val
              : parseFloat(String(val).replace(/[R$ .]/g, '').replace(',', '.')) || 0;
          totalRevenue += num;
        }
      });
    } catch {
      /* idem */
    }
  });

  return { newClients, churns: 0, totalRevenue, bpoActivations };
};

// ─────────────── componente ───────────────
const DailyBriefing = ({ clients = [], adminName = 'Admin', insightText }) => {
  const dateKey = todayKey();
  const dismissedKey = `breakr.admin.briefing.${dateKey}.dismissed`;
  const actionsKey = `breakr.admin.briefing.${dateKey}.actions`;

  const [dismissed, setDismissed] = useState(() => lsGet(dismissedKey) === 'true');
  const [actionStates, setActionStates] = useState(() => {
    const raw = lsGet(actionsKey);
    if (!raw) return {};
    try {
      const arr = JSON.parse(raw);
      const map = {};
      (Array.isArray(arr) ? arr : []).forEach((a) => {
        if (a && a.id) map[a.id] = a.status;
      });
      return map;
    } catch {
      return {};
    }
  });

  // Dados remotos (com fallback local)
  const localUrgent = useMemo(() => buildUrgentActions(clients), [clients]);
  const localYesterday = useMemo(() => computeYesterdaySummary(clients), [clients]);
  const [remote, setRemote] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const fetchInsights = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/admin/daily-insights');
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = await res.json();
      setRemote(json);
    } catch (err) {
      setError(err?.message || 'fetch failed');
      setRemote(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchInsights();
  }, [fetchInsights]);

  // Resolução de fontes (remote vence quando disponível)
  const insight = useMemo(() => {
    if (insightText) return { title: 'Insight do Dia', text: insightText, actions: [] };
    if (remote?.insight) return remote.insight;
    return getMockInsight();
  }, [insightText, remote]);

  const urgent = useMemo(() => {
    if (Array.isArray(remote?.actions) && remote.actions.length > 0) {
      return remote.actions.map((a) => ({
        id: a.id,
        icon: a.icon || '⚡',
        title: a.title || `${a.type || 'Ação'} — ${a.client || ''}`.trim(),
        detail: a.reason || '',
      }));
    }
    return localUrgent;
  }, [remote, localUrgent]);

  const yesterday = remote?.yesterday || localYesterday;

  const persistActions = useCallback(
    (next) => {
      const arr = Object.entries(next).map(([id, status]) => ({ id, status }));
      lsSet(actionsKey, JSON.stringify(arr));
    },
    [actionsKey],
  );

  const markAction = (id, status) => {
    setActionStates((prev) => {
      const next = { ...prev, [id]: status };
      persistActions(next);
      return next;
    });
  };

  const dismiss = () => {
    setDismissed(true);
    lsSet(dismissedKey, 'true');
  };

  const reopen = () => {
    setDismissed(false);
    lsRemove(dismissedKey);
  };

  const firstName = (adminName || 'Admin').split(' ')[0];
  const greet = greeting();

  // ─────────────── render minimizado ───────────────
  if (dismissed) {
    return (
      <div className="bg-[#141416] border border-[#2A2A2D] rounded-[14px] p-4 mb-6 flex items-center justify-between">
        <div className="flex items-center gap-3 text-[13px] text-[#999]">
          <span className="text-[18px]">{greet.icon}</span>
          <span>
            {greet.label}, <span className="text-white font-semibold">{firstName}</span>{' '}
            <span className="text-[#666]">(briefing dispensado)</span>
          </span>
        </div>
        <button
          type="button"
          onClick={reopen}
          className="text-[12px] font-semibold text-[#F5A623] bg-[#F5A623]/10 hover:bg-[#F5A623]/20 px-3 py-1.5 rounded-md transition-colors"
        >
          Reabrir
        </button>
      </div>
    );
  }

  // ─────────────── render completo ───────────────
  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      className="relative bg-gradient-to-br from-[#1a1612] via-[#141416] to-[#0F0F11] border border-[#F5A623]/30 rounded-[20px] p-6 mb-6 overflow-hidden"
    >
      {/* Glow decorativo */}
      <div
        aria-hidden
        className="absolute -top-24 -right-24 w-64 h-64 rounded-full bg-[#F5A623]/10 blur-3xl pointer-events-none"
      />

      {/* Header */}
      <div className="relative flex items-start justify-between gap-4 mb-5">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="text-[22px]" aria-hidden>
              {greet.icon}
            </span>
            <h2 className="text-[22px] font-bold text-white tracking-tight">
              {greet.label} {firstName}
            </h2>
            <span className="text-[12px] text-[#868686]">— {formatDateBR(new Date())}</span>
          </div>
          <p className="text-[12px] text-[#868686]">
            Briefing diário do seu portfólio • {clients.length} cliente
            {clients.length === 1 ? '' : 's'} ativo{clients.length === 1 ? '' : 's'}
          </p>
        </div>
        <button
          type="button"
          onClick={fetchInsights}
          disabled={loading}
          aria-label="Atualizar briefing"
          className="text-[11px] font-semibold text-[#F5A623] bg-[#F5A623]/10 hover:bg-[#F5A623]/20 disabled:opacity-50 px-3 py-1.5 rounded-md transition-colors flex items-center gap-1.5"
        >
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" aria-hidden>
            <path
              d="M3 12a9 9 0 0115-6.7L21 8M21 3v5h-5M21 12a9 9 0 01-15 6.7L3 16M3 21v-5h5"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
          {loading ? 'Atualizando…' : 'Atualizar'}
        </button>
      </div>

      {/* Erro de fetch (não bloqueia, mostra fallback local) */}
      {error && !remote && (
        <div className="text-[11px] text-[#868686] bg-white/[0.02] border border-white/5 rounded-md px-3 py-2 mb-4">
          Não foi possível carregar o insight do servidor — exibindo dados locais.
        </div>
      )}

      {/* AÇÕES URGENTES */}
      <section className="mb-5">
        <div className="flex items-center gap-2 mb-2.5">
          <span className="text-[11px] font-bold uppercase tracking-widest text-[#F5A623]">
            ⚡ Ações urgentes hoje
          </span>
          <span className="text-[11px] text-[#666]">({urgent.length})</span>
        </div>
        {urgent.length === 0 ? (
          <div className="text-[12px] text-[#868686] italic py-2">
            Nada urgente no momento — portfólio respirando bem 🎉
          </div>
        ) : (
          <ul className="space-y-2">
            {urgent.map((item, idx) => {
              const status = actionStates[item.id];
              const done = status === 'done';
              const snoozed = status === 'snoozed';
              return (
                <li
                  key={item.id || idx}
                  className={`flex items-start gap-3 p-3 rounded-[12px] border transition-colors ${
                    done
                      ? 'border-[#00B37E]/30 bg-[#00B37E]/5 opacity-60'
                      : snoozed
                        ? 'border-[#666]/30 bg-white/[0.02] opacity-60'
                        : 'border-white/5 bg-white/[0.02]'
                  }`}
                >
                  <span className="text-[18px] shrink-0" aria-hidden>
                    {item.icon}
                  </span>
                  <div className="flex-1 min-w-0">
                    <div
                      className={`text-[13px] font-semibold leading-snug ${
                        done ? 'line-through text-[#666]' : 'text-white'
                      }`}
                    >
                      {idx + 1}. {item.title}
                    </div>
                    {item.detail && (
                      <div className="text-[11px] text-[#868686] mt-0.5">{item.detail}</div>
                    )}
                  </div>
                  <div className="flex gap-1.5 shrink-0">
                    <button
                      type="button"
                      onClick={() => markAction(item.id, done ? null : 'done')}
                      className={`text-[10px] font-semibold px-2.5 py-1 rounded-md transition-colors ${
                        done
                          ? 'bg-[#00B37E]/20 text-[#00B37E]'
                          : 'bg-white/[0.05] text-[#999] hover:bg-white/[0.1]'
                      }`}
                    >
                      {done ? '✓ Feito' : 'Marcar feito'}
                    </button>
                    <button
                      type="button"
                      onClick={() => markAction(item.id, snoozed ? null : 'snoozed')}
                      className={`text-[10px] font-semibold px-2.5 py-1 rounded-md transition-colors ${
                        snoozed
                          ? 'bg-[#666]/20 text-[#999]'
                          : 'bg-white/[0.05] text-[#999] hover:bg-white/[0.1]'
                      }`}
                    >
                      {snoozed ? 'Adiado' : 'Adiar'}
                    </button>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      {/* INSIGHT DO DIA */}
      <section className="mb-5">
        <div className="flex items-center gap-2 mb-2.5">
          <span className="text-[11px] font-bold uppercase tracking-widest text-[#F5A623]">
            💡 {insight.title || 'Insight do Dia'}
          </span>
        </div>
        <div className="bg-gradient-to-r from-[#F5A623]/10 to-transparent border-l-2 border-[#F5A623] rounded-r-[12px] p-4">
          <p className="text-[13px] text-white leading-relaxed">{insight.text}</p>
          {Array.isArray(insight.actions) && insight.actions.length > 0 && (
            <div className="flex gap-2 mt-3 flex-wrap">
              {insight.actions.map((a, i) => (
                <button
                  key={i}
                  type="button"
                  onClick={() =>
                    console.log('[DailyBriefing] insight action:', a.action || a.label)
                  }
                  className="text-[11px] font-semibold bg-[#F5A623]/15 hover:bg-[#F5A623]/25 text-[#F5A623] px-3 py-1.5 rounded-md transition-colors"
                >
                  {a.label}
                </button>
              ))}
            </div>
          )}
        </div>
      </section>

      {/* RESUMO DE ONTEM */}
      <section className="mb-5">
        <div className="flex items-center gap-2 mb-2.5">
          <span className="text-[11px] font-bold uppercase tracking-widest text-[#F5A623]">
            📈 Resumo de ontem
          </span>
        </div>
        <ul className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-[12px] text-[#CCC]">
          <li className="flex items-center gap-2 bg-white/[0.02] border border-white/5 rounded-md px-3 py-2">
            <span className="text-[#868686]">•</span>
            <span>
              <strong className="text-white">{yesterday.newClients}</strong> novo
              {yesterday.newClients === 1 ? '' : 's'} cadastro
              {yesterday.newClients === 1 ? '' : 's'}
            </span>
          </li>
          <li className="flex items-center gap-2 bg-white/[0.02] border border-white/5 rounded-md px-3 py-2">
            <span className="text-[#868686]">•</span>
            <span>
              <strong className="text-white">
                {yesterday.churns === 0 ? '0' : yesterday.churns}
              </strong>{' '}
              churn {yesterday.churns === 0 && <span className="text-[#00B37E]">✓</span>}
            </span>
          </li>
          <li className="flex items-center gap-2 bg-white/[0.02] border border-white/5 rounded-md px-3 py-2">
            <span className="text-[#868686]">•</span>
            <span>
              <strong className="text-white">{formatBRL(yesterday.totalRevenue)}</strong> em
              vendas agregadas
            </span>
          </li>
          <li className="flex items-center gap-2 bg-white/[0.02] border border-white/5 rounded-md px-3 py-2">
            <span className="text-[#868686]">•</span>
            <span>
              <strong className="text-white">{yesterday.bpoActivations}</strong> cliente
              {yesterday.bpoActivations === 1 ? '' : 's'} ativ
              {yesterday.bpoActivations === 1 ? 'ou' : 'aram'} BPO Financeira
            </span>
          </li>
        </ul>
      </section>

      {/* CTA fechar */}
      <div className="flex justify-end">
        <button
          type="button"
          onClick={dismiss}
          className="text-[12px] font-semibold text-[#F5A623] hover:text-[#FFC062] flex items-center gap-1.5 transition-colors"
        >
          Começar o dia
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden>
            <path
              d="M5 12h14M12 5l7 7-7 7"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </button>
      </div>
    </motion.div>
  );
};

export default DailyBriefing;
