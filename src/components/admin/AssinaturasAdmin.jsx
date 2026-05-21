/**
 * AssinaturasAdmin — tela de gestão de assinaturas (Stripe F4).
 *
 * Lista todos os clientes ativos com status da assinatura, próxima
 * cobrança, e ações de operação: bloquear/desbloquear manualmente,
 * abrir Stripe Portal pra atualizar pagamento, cancelar assinatura.
 *
 * Acesso: super_admin (ver AdminPanel.jsx — sidebar grupo 'system').
 */
import { useEffect, useState, useCallback } from 'react';
import { motion } from 'framer-motion'; // eslint-disable-line no-unused-vars
import { adminFetch } from '../../utils/adminAuth';

// ─── Configuração visual por status ─────────────────────────────────
const STATUS_META = {
  trial:    { label: 'Trial',         color: '#5B8DEF', dot: 'bg-[#5B8DEF]' },
  active:   { label: 'Ativo',         color: '#00B37E', dot: 'bg-[#00B37E]' },
  past_due: { label: 'Past due',      color: '#F5A623', dot: 'bg-[#F5A623]' },
  unpaid:   { label: 'Inadimplente',  color: '#E5484D', dot: 'bg-[#E5484D]' },
  canceled: { label: 'Cancelado',     color: '#868686', dot: 'bg-[#868686]' },
};
const LEGACY_META = { label: 'Sem assinatura', color: '#555', dot: 'bg-[#555]' };

const KPI_CARDS = [
  { key: 'total',    label: 'Total',         color: '#FFFFFF' },
  { key: 'active',   label: 'Ativos',        color: '#00B37E' },
  { key: 'trial',    label: 'Trial',         color: '#5B8DEF' },
  { key: 'past_due', label: 'Past due',      color: '#F5A623' },
  { key: 'unpaid',   label: 'Inadimplentes', color: '#E5484D' },
  { key: 'canceled', label: 'Cancelados',    color: '#868686' },
  { key: 'blocked',  label: 'Bloqueados',    color: '#FF8A00' },
];

const formatDate = (iso) => {
  if (!iso) return '—';
  try {
    return new Date(iso).toLocaleDateString('pt-BR', {
      day: '2-digit', month: '2-digit', year: 'numeric',
    });
  } catch { return '—'; }
};

// ─── Componente principal ───────────────────────────────────────────
const AssinaturasAdmin = () => {
  const [data, setData] = useState({ kpis: {}, items: [] });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [statusFilter, setStatusFilter] = useState('');
  const [search, setSearch] = useState('');
  const [blockTarget, setBlockTarget] = useState(null); // {id, name}
  const [blockReason, setBlockReason] = useState('');
  const [busyId, setBusyId] = useState(null);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    const params = new URLSearchParams();
    if (statusFilter) params.set('status', statusFilter);
    if (search.trim()) params.set('q', search.trim());
    try {
      const res = await adminFetch(`/api/admin/subscriptions?${params.toString()}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const j = await res.json();
      setData(j);
    } catch (err) {
      console.error('AssinaturasAdmin fetch', err);
      setError('Não foi possível carregar a lista. Tente de novo.');
    } finally {
      setLoading(false);
    }
  }, [statusFilter, search]);

  useEffect(() => { fetchData(); }, [fetchData]);

  // ─── Handlers de ações ───────────────────────────────────────────
  const callAction = async (path, method, body, successMsg) => {
    try {
      const res = await adminFetch(path, {
        method,
        ...(body ? { body: JSON.stringify(body) } : {}),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        alert(json.error || 'Erro ao executar ação.');
        return null;
      }
      if (successMsg) console.log(successMsg);
      return json;
    } catch (err) {
      alert('Erro de conexão: ' + (err.message || err));
      return null;
    }
  };

  const confirmBlock = async () => {
    if (!blockReason.trim()) {
      alert('Informe o motivo do bloqueio.');
      return;
    }
    setBusyId(blockTarget.id);
    const r = await callAction(
      `/api/admin/subscriptions/${blockTarget.id}/block`,
      'POST',
      { reason: blockReason.trim() },
    );
    setBusyId(null);
    if (r) {
      setBlockTarget(null);
      setBlockReason('');
      fetchData();
    }
  };

  const handleUnblock = async (item) => {
    if (!window.confirm(`Desbloquear "${item.name}"?\n\nO cliente recupera o acesso imediatamente.`)) return;
    setBusyId(item.id);
    const r = await callAction(`/api/admin/subscriptions/${item.id}/unblock`, 'POST');
    setBusyId(null);
    if (r) fetchData();
  };

  const handlePortal = async (item) => {
    setBusyId(item.id);
    const r = await callAction(
      `/api/admin/subscriptions/${item.id}/billing-portal`,
      'POST',
      { returnUrl: window.location.href },
    );
    setBusyId(null);
    if (r && r.url) window.open(r.url, '_blank', 'noopener');
  };

  const handleCancel = async (item) => {
    if (!window.confirm(
      `Cancelar assinatura de "${item.name}"?\n\n` +
      'O cliente mantém acesso até o fim do período já pago. ' +
      'Depois disso, será bloqueado automaticamente.'
    )) return;
    setBusyId(item.id);
    const r = await callAction(`/api/admin/subscriptions/${item.id}/cancel`, 'POST');
    setBusyId(null);
    if (r) fetchData();
  };

  // ─── Render ───────────────────────────────────────────────────────
  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
    >
      {/* Header */}
      <div className="mb-6">
        <div className="flex items-center gap-2 mb-2">
          <span className="text-[11px] font-semibold text-[#F5A623] uppercase tracking-widest bg-[#F5A623]/10 px-2.5 py-1 rounded-full border border-[#F5A623]/20">
            Assinaturas
          </span>
          <span className="text-[11px] text-[#555]">{data.kpis?.total || 0} clientes</span>
        </div>
        <h2 className="text-[22px] sm:text-[28px] font-bold text-white tracking-tight">Assinaturas</h2>
        <p className="text-[12px] sm:text-[13px] text-[#868686] mt-1">
          Status de pagamento, bloqueio manual e acesso ao Stripe Portal de cada cliente.
        </p>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-2 sm:gap-3 mb-5">
        {KPI_CARDS.map((kpi) => (
          <div
            key={kpi.key}
            className="bg-gradient-to-br from-[#141416] via-[#101013] to-[#0F0F11] border border-white/[0.06] rounded-[12px] p-3"
          >
            <div className="text-[10px] uppercase tracking-wider text-[#666] font-semibold">{kpi.label}</div>
            <div className="text-[22px] font-bold mt-1" style={{ color: kpi.color }}>
              {data.kpis?.[kpi.key] ?? 0}
            </div>
          </div>
        ))}
      </div>

      {/* Filtros */}
      <div className="bg-gradient-to-br from-[#141416] via-[#101013] to-[#0F0F11] border border-white/[0.06] rounded-[14px] p-3 mb-4">
        <div className="flex flex-wrap gap-2 items-center">
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar por nome ou email..."
            className="flex-1 min-w-[180px] bg-white/[0.04] border border-white/[0.06] rounded-[10px] px-3 py-2 text-[13px] text-white placeholder:text-[#555] outline-none focus:border-[#F5A623]/40 transition-colors"
          />
          <button
            type="button"
            onClick={() => setStatusFilter('')}
            className={`text-[11px] font-semibold px-2.5 py-1.5 rounded-full border transition-colors ${
              statusFilter === ''
                ? 'border-[#F5A623]/55 bg-[#F5A623]/20 text-white'
                : 'border-white/[0.06] bg-white/[0.02] text-[#666] hover:bg-white/[0.05]'
            }`}
          >
            Todos
          </button>
          {Object.entries(STATUS_META).map(([key, meta]) => {
            const active = statusFilter === key;
            return (
              <button
                key={key}
                type="button"
                onClick={() => setStatusFilter(active ? '' : key)}
                className={`flex items-center gap-1.5 text-[11px] font-semibold px-2.5 py-1.5 rounded-full border transition-colors ${
                  active ? 'text-white' : 'border-white/[0.06] bg-white/[0.02] text-[#666] hover:bg-white/[0.05]'
                }`}
                style={active ? { borderColor: `${meta.color}55`, backgroundColor: `${meta.color}22` } : undefined}
              >
                <span className={`w-1.5 h-1.5 rounded-full ${meta.dot}`} />
                {meta.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* Tabela / cards */}
      <div className="bg-gradient-to-br from-[#141416] via-[#101013] to-[#0F0F11] border border-white/[0.06] rounded-[14px] overflow-hidden">
        {loading ? (
          <div className="p-10 text-center text-[12px] text-[#666]">Carregando...</div>
        ) : error ? (
          <div className="p-10 text-center text-[12px] text-[#FF8A8A]">
            {error}
            <button onClick={fetchData} className="ml-3 text-[#F5A623] hover:underline">Tentar de novo</button>
          </div>
        ) : data.items.length === 0 ? (
          <div className="p-10 text-center text-[12px] text-[#666]">Nenhum cliente com esse filtro.</div>
        ) : (
          <div className="divide-y divide-white/[0.04]">
            {data.items.map((item) => (
              <ClientRow
                key={item.id}
                item={item}
                busy={busyId === item.id}
                onBlock={() => { setBlockTarget({ id: item.id, name: item.name }); setBlockReason(''); }}
                onUnblock={() => handleUnblock(item)}
                onPortal={() => handlePortal(item)}
                onCancel={() => handleCancel(item)}
              />
            ))}
          </div>
        )}
      </div>

      {/* Modal de bloqueio */}
      {blockTarget && (
        <BlockModal
          target={blockTarget}
          reason={blockReason}
          setReason={setBlockReason}
          busy={busyId === blockTarget.id}
          onConfirm={confirmBlock}
          onCancel={() => { setBlockTarget(null); setBlockReason(''); }}
        />
      )}
    </motion.div>
  );
};

// ─── Linha de cliente ───────────────────────────────────────────────
const ClientRow = ({ item, busy, onBlock, onUnblock, onPortal, onCancel }) => {
  const meta = item.subscriptionStatus ? STATUS_META[item.subscriptionStatus] : LEGACY_META;
  const isBlocked = item.blockedByAdmin;
  const [menuOpen, setMenuOpen] = useState(false);
  return (
    <div className="p-3 sm:p-4 hover:bg-white/[0.02] transition-colors relative">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-3 min-w-0 flex-1">
          {/* Status dot + label */}
          <span className={`w-2 h-2 rounded-full shrink-0 ${meta.dot}`} />
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-[13px] font-bold text-white truncate">{item.name}</span>
              <span
                className="text-[9px] font-bold uppercase tracking-wide px-1.5 py-0.5 rounded"
                style={{ backgroundColor: `${meta.color}1F`, color: meta.color }}
              >
                {meta.label}
              </span>
              {isBlocked && (
                <span className="text-[9px] font-bold uppercase tracking-wide px-1.5 py-0.5 rounded bg-[#FF8A00]/20 text-[#FF8A00] border border-[#FF8A00]/40">
                  🛑 Bloqueado
                </span>
              )}
            </div>
            <div className="text-[10px] text-[#868686] truncate mt-0.5">{item.email || '—'}</div>
            {isBlocked && item.blockedReason && (
              <div className="text-[10px] text-[#FF8A8A] mt-0.5">Motivo: {item.blockedReason}</div>
            )}
          </div>
        </div>

        <div className="flex items-center gap-4 text-[11px] shrink-0">
          <div className="text-right">
            <div className="text-[#666]">Próxima cobrança</div>
            <div className="text-white font-medium">{formatDate(item.currentPeriodEnd)}</div>
          </div>

          <div className="relative">
            <button
              onClick={() => setMenuOpen((o) => !o)}
              disabled={busy}
              className="w-8 h-8 rounded-md hover:bg-white/[0.05] flex items-center justify-center text-[#999] hover:text-white disabled:opacity-50"
              aria-label="Ações"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
                <circle cx="12" cy="6" r="1.5" fill="currentColor"/>
                <circle cx="12" cy="12" r="1.5" fill="currentColor"/>
                <circle cx="12" cy="18" r="1.5" fill="currentColor"/>
              </svg>
            </button>
            {menuOpen && (
              <>
                <div className="fixed inset-0 z-30" onClick={() => setMenuOpen(false)} />
                <div className="absolute right-0 top-9 z-40 bg-[#1B1B1D] border border-white/[0.08] rounded-[10px] shadow-2xl py-1 min-w-[200px]">
                  {!isBlocked ? (
                    <button
                      onClick={() => { setMenuOpen(false); onBlock(); }}
                      className="w-full text-left px-3 py-2 text-[12px] text-[#FF8A00] hover:bg-white/[0.05]"
                    >
                      🛑 Bloquear manualmente
                    </button>
                  ) : (
                    <button
                      onClick={() => { setMenuOpen(false); onUnblock(); }}
                      className="w-full text-left px-3 py-2 text-[12px] text-[#00B37E] hover:bg-white/[0.05]"
                    >
                      ✓ Desbloquear
                    </button>
                  )}
                  {item.stripeCustomerId && (
                    <button
                      onClick={() => { setMenuOpen(false); onPortal(); }}
                      className="w-full text-left px-3 py-2 text-[12px] text-white hover:bg-white/[0.05]"
                    >
                      🔗 Abrir Portal Stripe
                    </button>
                  )}
                  {item.stripeSubscriptionId && item.subscriptionStatus !== 'canceled' && (
                    <button
                      onClick={() => { setMenuOpen(false); onCancel(); }}
                      className="w-full text-left px-3 py-2 text-[12px] text-red-400 hover:bg-red-500/10"
                    >
                      ❌ Cancelar assinatura
                    </button>
                  )}
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

// ─── Modal de bloqueio ──────────────────────────────────────────────
const BlockModal = ({ target, reason, setReason, busy, onConfirm, onCancel }) => (
  <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/70 backdrop-blur-sm p-4" onClick={onCancel}>
    <div
      className="bg-[#1B1B1D] border border-white/[0.08] rounded-[14px] p-5 w-full max-w-md"
      onClick={(e) => e.stopPropagation()}
    >
      <h3 className="text-[15px] font-bold text-white mb-1">Bloquear cliente</h3>
      <p className="text-[12px] text-[#868686] mb-3">
        <span className="font-semibold text-white">{target.name}</span> — o acesso será negado imediatamente.
      </p>
      <label className="text-[11px] text-[#868686] block mb-1">Motivo (obrigatório)</label>
      <textarea
        value={reason}
        onChange={(e) => setReason(e.target.value)}
        rows={3}
        placeholder="Ex: Fraude, inadimplência, problema legal..."
        className="w-full bg-[#0F0F11] border border-white/[0.06] rounded-[8px] px-3 py-2 text-[13px] text-white outline-none focus:border-[#FF8A00]/50 resize-none"
      />
      <p className="text-[10px] text-[#555] mt-2">
        Fica registrado na Auditoria (categoria segurança) com quem bloqueou e quando.
      </p>
      <div className="flex justify-end gap-2 mt-4">
        <button
          onClick={onCancel}
          disabled={busy}
          className="px-4 py-2 text-[12px] text-[#868686] hover:text-white disabled:opacity-50"
        >
          Cancelar
        </button>
        <button
          onClick={onConfirm}
          disabled={busy || !reason.trim()}
          className="bg-[#FF8A00] hover:bg-[#E07A00] text-black font-bold text-[12px] px-4 py-2 rounded-[8px] disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {busy ? 'Bloqueando...' : 'Bloquear'}
        </button>
      </div>
    </div>
  </div>
);

export default AssinaturasAdmin;
