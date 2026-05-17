/**
 * BpoDashboard — visão geral dinâmica do cliente BPO
 * KPIs principais + alertas + gráfico fluxo de caixa resumido
 */

import { useState, useEffect, useCallback } from 'react';
import { useBpo } from '../../../context/BpoContext';
import { Card, Badge, Button, Skeleton, SkeletonCard } from '../../ui/primitives';

const fmtBRL = (n) => Number(n || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const fmtDate = (d) => d ? new Date(d).toLocaleDateString('pt-BR') : '—';
const todayISO = () => new Date().toISOString().slice(0, 10);
const dateMinusDays = (days) => new Date(Date.now() - days * 86400000).toISOString().slice(0, 10);
const datePlusDays = (days) => new Date(Date.now() + days * 86400000).toISOString().slice(0, 10);

const BpoDashboard = () => {
  const { bpoUrl, selectedClient } = useBpo();
  const [data, setData] = useState({});
  const [loading, setLoading] = useState(true);

  const fetchAll = useCallback(async () => {
    if (!selectedClient) return;
    setLoading(true);
    // BUG #10 FIX: Promise.allSettled — se um endpoint falhar, mostra os outros
    const safeFetch = async (path) => {
      try {
        const url = bpoUrl(path);
        if (!url) return null;
        const res = await fetch(url);
        if (!res.ok) return null;
        return await res.json();
      } catch (err) {
        console.warn('[BpoDashboard] fetch falhou:', path, err);
        return null;
      }
    };
    try {
      const [banks, payables, receivables, cashflow, dre, transactions, employees, partners, paymentMethods] = await Promise.all([
        safeFetch('/bank-accounts'),
        safeFetch(`/reports/payables?from=${todayISO()}&to=${datePlusDays(30)}`),
        safeFetch(`/reports/receivables?from=${todayISO()}&to=${datePlusDays(30)}`),
        safeFetch(`/reports/cashflow?from=${todayISO()}&to=${datePlusDays(30)}&groupBy=week`),
        safeFetch(`/reports/dre?from=${dateMinusDays(30)}&to=${todayISO()}`),
        safeFetch(`/reports/transactions?from=${dateMinusDays(7)}&to=${todayISO()}`),
        safeFetch('/employees'),
        safeFetch('/partners'),
        safeFetch('/payment-methods'),
      ]);
      setData({
        banks: banks?.items || [],
        payables: payables || { items: [], summary: {} },
        receivables: receivables || { items: [], summary: {} },
        cashflow: cashflow || { series: [], summary: {} },
        dre: dre || { lines: [], counts: { received: 0, paid: 0 } },
        transactions: transactions || { items: [] },
        employees: employees?.items || [],
        partners: partners?.items || [],
        paymentMethods: paymentMethods?.items || [],
      });
    } finally {
      setLoading(false);
    }
  }, [bpoUrl, selectedClient]);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  if (loading) return (
    <div className="flex flex-col gap-4">
      <div>
        <Skeleton className="h-6 w-40 mb-2" />
        <Skeleton className="h-3 w-64" />
      </div>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <SkeletonCard /><SkeletonCard /><SkeletonCard /><SkeletonCard />
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <SkeletonCard className="lg:col-span-2 h-64" />
        <SkeletonCard className="h-64" />
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <SkeletonCard className="h-72" />
        <SkeletonCard className="h-72" />
      </div>
    </div>
  );

  const totalBanks = data.banks?.reduce((s, b) => s + Number(b.currentBalance), 0) || 0;
  const overduePayables = data.payables?.items?.filter((p) => new Date(p.dueDate) < new Date() && p.status !== 'paid').length || 0;
  const overdueReceivables = data.receivables?.items?.filter((r) => new Date(r.dueDate) < new Date() && r.status !== 'received').length || 0;
  const lucroLiquido = data.dre?.raw?.lucroLiquido || 0;
  const projectedFinal = data.cashflow?.summary?.finalBalance || 0;

  // Estrutura do negócio — indexada do onboarding do cliente
  const employees = data.employees || [];
  const partners = data.partners || [];
  const paymentMethods = data.paymentMethods || [];
  const folhaTotal = employees.reduce((s, e) => s + Number(e.baseSalary || 0), 0);
  const prolaboreTotal = partners.reduce((s, p) => s + Number(p.prolaboreAmount || 0), 0);

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="text-xl font-bold text-text-strong">Visão Geral</h1>
        <p className="text-xs text-text-muted mt-0.5">Indicadores principais do cliente <strong className="text-text-strong">{selectedClient?.name}</strong>.</p>
      </div>

      {/* KPIs principais */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Kpi label="Saldo em conta" value={fmtBRL(totalBanks)} subtitle={`${data.banks?.length || 0} conta(s)`} color="text-text-strong" />
        <Kpi label="A pagar (30d)" value={fmtBRL(data.payables?.summary?.remaining || 0)} subtitle={overduePayables ? `${overduePayables} vencidas` : 'em dia'} color={overduePayables > 0 ? 'text-danger' : 'text-text-strong'} />
        <Kpi label="A receber (30d)" value={fmtBRL(data.receivables?.summary?.remaining || 0)} subtitle={overdueReceivables ? `${overdueReceivables} atrasadas` : 'em dia'} color="text-success" />
        <Kpi label="Saldo projetado (30d)" value={fmtBRL(projectedFinal)} subtitle={projectedFinal >= 0 ? 'positivo' : '⚠️ negativo'} color={projectedFinal >= 0 ? 'text-success' : 'text-danger'} />
      </div>

      {/* Linha 2: DRE resumo + Bancos */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <Card className="lg:col-span-2">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-semibold text-text-strong">Resultado últimos 30 dias</h3>
            <Badge variant={lucroLiquido >= 0 ? 'success' : 'danger'}>{lucroLiquido >= 0 ? 'Lucro' : 'Prejuízo'}</Badge>
          </div>
          {data.dre?.lines?.filter((l) => l.type === 'subtotal' || l.type === 'header' || l.type === 'result').map((l, i) => (
            <div key={i} className="flex justify-between py-1 border-b border-border-subtle last:border-0">
              <span className={`text-xs ${l.type === 'result' ? 'font-bold text-text-strong' : 'text-text-muted'}`}>{l.label}</span>
              <span className={`text-xs tabular-nums ${l.type === 'result' ? 'font-bold ' + (l.value >= 0 ? 'text-success' : 'text-danger') : 'text-text'}`}>
                {fmtBRL(Math.abs(l.value))}
              </span>
            </div>
          ))}
          {(!data.dre?.lines || data.dre.counts.received === 0 && data.dre.counts.paid === 0) && (
            <div className="text-center py-6 text-xs text-text-muted">Sem movimentações nos últimos 30 dias.</div>
          )}
        </Card>

        <Card>
          <h3 className="text-sm font-semibold text-text-strong mb-3">Saldo por banco</h3>
          {data.banks?.length === 0 ? (
            <div className="text-center py-6 text-xs text-text-muted">Nenhuma conta cadastrada.</div>
          ) : (
            <div className="flex flex-col gap-2">
              {data.banks?.map((b) => (
                <div key={b.id} className="flex items-center gap-2 p-2 rounded-md bg-bg-elevated border border-border-subtle">
                  <div className="w-7 h-7 rounded bg-bg-input flex items-center justify-center text-[10px] font-bold text-text-strong">{b.bankCode}</div>
                  <div className="flex-1 min-w-0">
                    <div className="text-xs font-medium text-text-strong truncate">{b.bankName}</div>
                    <div className="text-[10px] text-text-subtle font-mono">{b.account}</div>
                  </div>
                  <div className="text-xs font-semibold tabular-nums">{fmtBRL(b.currentBalance)}</div>
                </div>
              ))}
            </div>
          )}
        </Card>
      </div>

      {/* Estrutura do negócio — indexada do onboarding */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <Card>
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-semibold text-text-strong">Funcionários</h3>
            <Badge variant="default">{employees.length}</Badge>
          </div>
          {employees.length === 0 ? (
            <div className="text-center py-6 text-xs text-text-muted">Nenhum funcionário cadastrado.</div>
          ) : (
            <>
              <div className="flex flex-col gap-1.5 max-h-48 overflow-y-auto">
                {employees.map((e) => (
                  <div key={e.id} className="flex items-center gap-2 p-2 rounded-md bg-bg-elevated">
                    <div className="flex-1 min-w-0">
                      <div className="text-xs font-medium text-text-strong truncate">{e.name}</div>
                      <div className="text-[10px] text-text-muted">{e.role}{e.isFreelancer ? ' · Freelancer' : ''}</div>
                    </div>
                    <div className="text-xs font-semibold tabular-nums text-text">{fmtBRL(e.baseSalary)}</div>
                  </div>
                ))}
              </div>
              <div className="flex justify-between mt-2 pt-2 border-t border-border-subtle">
                <span className="text-[10px] uppercase tracking-wider text-text-muted">Folha base</span>
                <span className="text-xs font-bold tabular-nums text-text-strong">{fmtBRL(folhaTotal)}</span>
              </div>
            </>
          )}
        </Card>

        <Card>
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-semibold text-text-strong">Sócios</h3>
            <Badge variant="default">{partners.length}</Badge>
          </div>
          {partners.length === 0 ? (
            <div className="text-center py-6 text-xs text-text-muted">Nenhum sócio cadastrado.</div>
          ) : (
            <>
              <div className="flex flex-col gap-1.5 max-h-48 overflow-y-auto">
                {partners.map((p) => (
                  <div key={p.id} className="flex items-center gap-2 p-2 rounded-md bg-bg-elevated">
                    <div className="flex-1 min-w-0">
                      <div className="text-xs font-medium text-text-strong truncate">{p.name}</div>
                      <div className="text-[10px] text-text-muted">Pró-labore</div>
                    </div>
                    <div className="text-xs font-semibold tabular-nums text-text">{fmtBRL(p.prolaboreAmount)}</div>
                  </div>
                ))}
              </div>
              <div className="flex justify-between mt-2 pt-2 border-t border-border-subtle">
                <span className="text-[10px] uppercase tracking-wider text-text-muted">Pró-labore total</span>
                <span className="text-xs font-bold tabular-nums text-text-strong">{fmtBRL(prolaboreTotal)}</span>
              </div>
            </>
          )}
        </Card>

        <Card>
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-semibold text-text-strong">Meios de Pagamento</h3>
            <Badge variant="default">{paymentMethods.length}</Badge>
          </div>
          {paymentMethods.length === 0 ? (
            <div className="text-center py-6 text-xs text-text-muted">Nenhum meio de pagamento cadastrado.</div>
          ) : (
            <div className="flex flex-col gap-1.5 max-h-56 overflow-y-auto">
              {paymentMethods.map((m) => (
                <div key={m.id} className="flex items-center gap-2 p-2 rounded-md bg-bg-elevated">
                  <div className="flex-1 min-w-0">
                    <div className="text-xs font-medium text-text-strong truncate">{m.name}</div>
                    <div className="text-[10px] text-text-muted">{m.type}</div>
                  </div>
                  <div className="text-xs font-semibold tabular-nums text-text">{Number(m.feePercent || 0)}%</div>
                </div>
              ))}
            </div>
          )}
        </Card>
      </div>

      {/* Linha 3: Vencimentos próximos + Movimentações recentes */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card>
          <h3 className="text-sm font-semibold text-text-strong mb-3">Próximos vencimentos a pagar</h3>
          {(!data.payables?.items || data.payables.items.length === 0) ? (
            <div className="text-center py-6 text-xs text-text-muted">Sem contas a vencer nos próximos 30 dias.</div>
          ) : (
            <div className="flex flex-col gap-1.5 max-h-64 overflow-y-auto">
              {data.payables.items.slice(0, 10).map((p) => {
                const overdue = new Date(p.dueDate) < new Date() && p.status !== 'paid';
                return (
                  <div key={p.id} className="flex items-center gap-2 p-2 rounded-md bg-bg-elevated">
                    <div className={`w-1 h-8 rounded-full ${overdue ? 'bg-danger' : 'bg-warning'}`} />
                    <div className="flex-1 min-w-0">
                      <div className="text-xs font-medium text-text-strong truncate">{p.supplier?.name || p.description || 'Sem descrição'}</div>
                      <div className={`text-[10px] ${overdue ? 'text-danger font-semibold' : 'text-text-muted'}`}>{fmtDate(p.dueDate)}</div>
                    </div>
                    <div className="text-xs font-semibold tabular-nums text-danger">{fmtBRL(p.remainingAmount)}</div>
                  </div>
                );
              })}
            </div>
          )}
        </Card>

        <Card>
          <h3 className="text-sm font-semibold text-text-strong mb-3">Movimentações da semana</h3>
          {(!data.transactions?.items || data.transactions.items.length === 0) ? (
            <div className="text-center py-6 text-xs text-text-muted">Sem movimentações nos últimos 7 dias.</div>
          ) : (
            <div className="flex flex-col gap-1.5 max-h-64 overflow-y-auto">
              {data.transactions.items.slice(0, 10).map((t) => (
                <div key={t.id} className="flex items-center gap-2 p-2 rounded-md bg-bg-elevated">
                  <div className={`w-1 h-8 rounded-full ${t.payableId ? 'bg-danger' : 'bg-success'}`} />
                  <div className="flex-1 min-w-0">
                    <div className="text-xs font-medium text-text-strong truncate">{t.payable?.supplier?.name || t.receivable?.payerName || 'Sem origem'}</div>
                    <div className="text-[10px] text-text-muted">{fmtDate(t.paidAt)}</div>
                  </div>
                  <div className={`text-xs font-semibold tabular-nums ${t.payableId ? 'text-danger' : 'text-success'}`}>
                    {t.payableId ? '-' : '+'}{fmtBRL(t.amount)}
                  </div>
                </div>
              ))}
            </div>
          )}
        </Card>
      </div>
    </div>
  );
};

const Kpi = ({ label, value, subtitle, color }) => (
  <Card className="flex flex-col gap-1">
    <div className="text-[10px] uppercase tracking-wider text-text-muted">{label}</div>
    <div className={`text-xl font-bold tabular-nums ${color}`}>{value}</div>
    <div className="text-[10px] text-text-subtle">{subtitle}</div>
  </Card>
);

export default BpoDashboard;
