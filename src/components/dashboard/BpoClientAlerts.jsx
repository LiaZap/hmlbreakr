/**
 * BpoClientAlerts — bloco de alertas BPO mostrado no Dashboard home
 * Aparece SÓ se o cliente tem BPO ativado (dashboardData._bpo.enabled).
 * Mostra contadores das pendências mais urgentes + atalhos.
 */

import { useState, useEffect } from 'react';

const fmtBRL = (n) => Number(n || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

const API_URL = import.meta.env.VITE_API_URL || '';

const BpoClientAlerts = ({ bpoInfo, onNavigateToFinance }) => {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!bpoInfo?.enabled || !bpoInfo?.hash) {
      setLoading(false);
      return;
    }
    fetch(`${API_URL}/api/bpo/${bpoInfo.hash}/alerts`)
      .then((r) => {
        if (!r.ok) throw new Error('Falha ao carregar alertas');
        return r.json();
      })
      .then(setData)
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [bpoInfo?.enabled, bpoInfo?.hash]);

  // Não mostra nada se BPO não está ativo
  if (!bpoInfo?.enabled) return null;
  if (loading) return null; // silenciosamente não mostra durante carregamento
  if (error || !data) return null;
  if (!data.hasAlerts && data.counters.tasksOpen === 0) return null;

  const c = data.counters;
  const severityBg = {
    critical: 'border-l-[#FF4560] bg-[#FF4560]/5',
    high: 'border-l-[#F5A623] bg-[#F5A623]/5',
    normal: 'border-l-[#00C8F4] bg-[#00C8F4]/5',
    low: 'border-l-[#00B37E] bg-[#00B37E]/5',
  }[data.severity];

  return (
    <div className={`border-l-4 ${severityBg} bg-[#1B1B1D] border border-[#2A2A2C] rounded-[12px] p-4 mb-4`}>
      <div className="flex items-start justify-between mb-3 gap-4">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg bg-[#F5A623]/15 text-[#F5A623] flex items-center justify-center">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
              <path d="M3 21h18M3 10h18M5 6l7-3 7 3M4 10v11M20 10v11" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </div>
          <div>
            <h3 className="text-[13px] font-semibold text-white">Pendências Financeiras</h3>
            <p className="text-[10px] text-[#868686]">Saldo total: <strong className="text-[#F5A623]">{fmtBRL(c.bankBalance)}</strong></p>
          </div>
        </div>
        <button onClick={onNavigateToFinance}
          className="text-[11px] font-semibold text-[#F5A623] hover:text-[#E5961E] transition-colors flex items-center gap-1">
          Abrir Financeiro
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none"><path d="M5 12h14M12 5l7 7-7 7" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/></svg>
        </button>
      </div>

      {/* Aprovação pendente — destaque maior */}
      {c.pendingApproval > 0 && (
        <div className="bg-[#F5A623]/10 border border-[#F5A623]/40 rounded-[10px] p-3 mb-3 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-full bg-[#F5A623]/20 text-[#F5A623] flex items-center justify-center text-base font-bold">
              {c.pendingApproval}
            </div>
            <div>
              <div className="text-[12px] font-semibold text-white">{c.pendingApproval === 1 ? 'Pagamento aguardando' : 'Pagamentos aguardando'} aprovação</div>
              <div className="text-[10px] text-[#F5A623]">BPO programou no banco — confirme pra liberar</div>
            </div>
          </div>
          <button onClick={onNavigateToFinance}
            className="text-[11px] font-bold text-black bg-[#F5A623] hover:bg-[#E5961E] px-3 py-2 rounded-lg transition-colors">
            Aprovar agora →
          </button>
        </div>
      )}

      {/* Contadores */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-3">
        <Counter label="Vencidas" count={c.overduePay} color={c.overduePay > 0 ? 'text-[#FF4560]' : 'text-[#666]'} />
        <Counter label="Vencendo 7d" count={c.dueSoonPay} color={c.dueSoonPay > 0 ? 'text-[#F5A623]' : 'text-[#666]'} />
        <Counter label="Pra conciliar" count={c.unconciliatedTx} color={c.unconciliatedTx > 0 ? 'text-[#00C8F4]' : 'text-[#666]'} />
        <Counter label="A receber" count={c.pendingRec} color={c.pendingRec > 0 ? 'text-[#00B37E]' : 'text-[#666]'} />
      </div>

      {/* Top vencidas (compacto) */}
      {data.topOverdue.length > 0 && (
        <div className="border-t border-[#2A2A2C] pt-3 mt-3">
          <div className="text-[10px] uppercase tracking-wider text-[#FF4560] font-bold mb-2">⚠️ Vencidas (top 3)</div>
          <div className="flex flex-col gap-1.5">
            {data.topOverdue.slice(0, 3).map((p) => (
              <div key={p.id} className="flex items-center justify-between text-[11px]">
                <div className="flex items-center gap-2 min-w-0">
                  <span className="text-[#FF4560] font-semibold shrink-0">{p.daysOverdue}d</span>
                  <span className="text-white truncate">{p.supplier || p.description || 'Sem descrição'}</span>
                </div>
                <span className="text-[#FF8A9C] font-semibold tabular-nums shrink-0">{fmtBRL(p.remainingAmount)}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {data.topOverdue.length === 0 && data.topDueSoon.length > 0 && (
        <div className="border-t border-[#2A2A2C] pt-3 mt-3">
          <div className="text-[10px] uppercase tracking-wider text-[#F5A623] font-bold mb-2">Vencendo nos próximos 7 dias</div>
          <div className="flex flex-col gap-1.5">
            {data.topDueSoon.slice(0, 3).map((p) => (
              <div key={p.id} className="flex items-center justify-between text-[11px]">
                <div className="flex items-center gap-2 min-w-0">
                  <span className="text-[#F5A623] font-semibold shrink-0">{p.daysUntilDue}d</span>
                  <span className="text-white truncate">{p.supplier || p.description || 'Sem descrição'}</span>
                </div>
                <span className="text-[#E5961E] font-semibold tabular-nums shrink-0">{fmtBRL(p.remainingAmount)}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

const Counter = ({ label, count, color }) => (
  <div className="bg-[#151515] border border-[#2A2A2C] rounded-[8px] px-3 py-2 flex flex-col items-start">
    <span className={`text-[20px] font-bold tabular-nums ${color}`}>{count}</span>
    <span className="text-[9px] uppercase tracking-wider text-[#868686]">{label}</span>
  </div>
);

export default BpoClientAlerts;
