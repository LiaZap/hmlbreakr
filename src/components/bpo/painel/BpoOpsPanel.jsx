/**
 * BpoOpsPanel — visão do OPERADOR BPO (Gustavo).
 * Vê TODOS os clientes BPO ao mesmo tempo, com pendências agregadas.
 * Estilo Nibo: Caixa de Entrada / Programar Banco / Para Conciliar com contadores.
 */

import { useState, useEffect, useCallback } from 'react';
import { useBpo } from '../../../context/BpoContext';
import { Card, Button, Badge, EmptyState } from '../../ui/primitives';

const fmtBRL = (n) => Number(n || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

const BpoOpsPanel = () => {
  const { setSelectedClient } = useBpo();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [scanning, setScanning] = useState(false);

  const fetchOverview = useCallback(async () => {
    setLoading(true);
    try {
      // Endpoint multi-cliente — ignora hash, usa só pra auth
      const res = await fetch('/api/bpo/_/ops-panel/overview');
      const d = await res.json();
      setData(d);
    } catch (err) { console.error(err); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { fetchOverview(); }, [fetchOverview]);

  const handleScan = async () => {
    setScanning(true);
    try {
      await fetch('/api/bpo/_/ops-panel/scan', { method: 'POST' });
      await fetchOverview();
    } catch (err) { alert('Erro no scan: ' + err.message); }
    finally { setScanning(false); }
  };

  const handleOpenClient = (client) => {
    setSelectedClient(client);
    // Idealmente: navegar pra dashboard interno daquele cliente
    // Por agora: atualiza o contexto e o usuário troca de seção manual
  };

  if (loading) return <div className="text-center py-12 text-xs text-text-muted">Carregando painel BPO...</div>;
  if (!data || !data.clients) return <Card><EmptyState title="Nenhum cliente BPO" description="Ative BPO em algum cliente no Painel Admin." /></Card>;
  if (data.clients.length === 0) return <Card><EmptyState title="Nenhum cliente BPO ativo" description="Ative BPO em algum cliente no Painel Admin." /></Card>;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-text-strong">Painel BPO</h1>
          <p className="text-xs text-text-muted mt-0.5">Visão consolidada dos {data.totals.clients} clientes BPO ativos.</p>
        </div>
        <Button variant="secondary" onClick={handleScan} loading={scanning}
          icon={<svg width="14" height="14" viewBox="0 0 24 24" fill="none"><path d="M23 4v6h-6M1 20v-6h6" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/><path d="M3.51 9a9 9 0 0114.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0020.49 15" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/></svg>}>
          Re-escanear pendências
        </Button>
      </div>

      {/* KPIs agregados */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        <Kpi label="Clientes BPO" value={data.totals.clients} subtitle="ativos" color="text-text-strong" />
        <Kpi label="Vencidas" value={data.totals.overduePay} subtitle="contas a pagar" color={data.totals.overduePay > 0 ? 'text-danger' : 'text-success'} />
        <Kpi label="Vencendo 7d" value={data.totals.dueSoonPay} subtitle="precisa atenção" color={data.totals.dueSoonPay > 0 ? 'text-warning' : 'text-text-strong'} />
        <Kpi label="Pra conciliar" value={data.totals.unconciliatedTx} subtitle="extratos" color={data.totals.unconciliatedTx > 0 ? 'text-info' : 'text-text-strong'} />
        <Kpi label="Saldo total" value={fmtBRL(data.totals.balance)} subtitle="todos os bancos" color="text-text-strong" />
      </div>

      {/* Lista de clientes */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {data.clients.map((c) => <ClientCard key={c.id} client={c} onOpen={handleOpenClient} />)}
      </div>
    </div>
  );
};

const ClientCard = ({ client, onOpen }) => {
  const severityBorder = {
    critical: 'border-l-danger',
    high: 'border-l-warning',
    normal: 'border-l-info',
    low: 'border-l-success',
  }[client.severity] || 'border-l-border';

  return (
    <Card className={`border-l-4 ${severityBorder}`}>
      <div className="flex items-start justify-between mb-3">
        <div className="flex-1 min-w-0">
          <h3 className="text-sm font-semibold text-text-strong truncate">{client.name}</h3>
          <div className="text-[10px] text-text-subtle mt-0.5">Saldo: {fmtBRL(client.balance)}</div>
        </div>
        <Button variant="link" size="sm" onClick={() => onOpen(client)}>Abrir →</Button>
      </div>

      {/* Cards estilo Nibo: 3 colunas com contadores */}
      <div className="grid grid-cols-3 gap-2">
        <PendingCard label="Caixa de entrada" count={client.cards.unconciliatedTx} hint="pra conciliar" colorClass="bg-info-soft text-info border-info/30" />
        <PendingCard label="Programar banco" count={client.cards.scheduled} hint="agendados" colorClass="bg-warning-soft text-warning border-warning/30" />
        <PendingCard label="Vencidas" count={client.cards.overduePay} hint="atenção" colorClass="bg-danger-soft text-danger border-danger/30" />
      </div>

      {/* Resumo extra */}
      <div className="mt-3 pt-3 border-t border-border-subtle flex justify-between text-[10px] text-text-muted">
        <span>{client.cards.dueSoonPay} venc. em 7d</span>
        <span>{client.cards.pendingRec} a receber</span>
      </div>
    </Card>
  );
};

const PendingCard = ({ label, count, hint, colorClass }) => (
  <div className={`rounded-lg border ${colorClass} p-2.5 text-center`}>
    <div className="text-2xl font-bold">{count}</div>
    <div className="text-[9px] uppercase tracking-wider mt-0.5 opacity-80">{label}</div>
    {count > 0 && <div className="text-[9px] mt-0.5 opacity-60">{hint}</div>}
  </div>
);

const Kpi = ({ label, value, subtitle, color }) => (
  <Card className="flex flex-col gap-1">
    <div className="text-[10px] uppercase tracking-wider text-text-muted">{label}</div>
    <div className={`text-xl font-bold tabular-nums ${color}`}>{value}</div>
    <div className="text-[10px] text-text-subtle">{subtitle}</div>
  </Card>
);

export default BpoOpsPanel;
