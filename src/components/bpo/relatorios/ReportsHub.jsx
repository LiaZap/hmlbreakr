/**
 * ReportsHub — central de relatórios financeiros do BPO
 * Tabs: Pagar, Receber, Movimentações, DRE, Fluxo de Caixa
 */

import { useState, useEffect, useCallback } from 'react';
import { useBpo } from '../../../context/BpoContext';
import { Card, Button, Input, Badge, Table, Th, Td, Tr, EmptyState } from '../../ui/primitives';
import { ComposedChart, Bar, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';

const fmtBRL = (n) => Number(n || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const fmtDate = (d) => d ? new Date(d).toLocaleDateString('pt-BR') : '—';

const TABS = [
  { id: 'payables', label: 'Contas a Pagar' },
  { id: 'receivables', label: 'Contas a Receber' },
  { id: 'transactions', label: 'Movimentações' },
  { id: 'dre', label: 'DRE' },
  { id: 'cashflow', label: 'Fluxo de Caixa' },
];

const todayISO = () => new Date().toISOString().slice(0, 10);
const dateMinusDays = (days) => new Date(Date.now() - days * 86400000).toISOString().slice(0, 10);

const ReportsHub = () => {
  const [activeTab, setActiveTab] = useState('payables');
  const [from, setFrom] = useState(dateMinusDays(30));
  const [to, setTo] = useState(todayISO());

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="text-xl font-bold text-text-strong">Relatórios</h1>
        <p className="text-xs text-text-muted mt-0.5">Filtros por período. Exporte qualquer relatório em Excel.</p>
      </div>

      {/* Tabs */}
      <Card padded={false} className="p-2 flex flex-wrap gap-1">
        {TABS.map((t) => (
          <button key={t.id} onClick={() => setActiveTab(t.id)}
            className={`text-xs font-medium px-3 py-1.5 rounded-md transition-colors ${
              activeTab === t.id ? 'bg-brand text-black' : 'text-text-muted hover:text-text-strong hover:bg-bg-input'
            }`}>
            {t.label}
          </button>
        ))}
      </Card>

      {/* Date range */}
      <Card padded={false} className="p-3 flex items-center gap-3 flex-wrap">
        <div className="text-xs text-text-muted">Período:</div>
        <Input type="date" value={from} onChange={setFrom} className="w-auto" />
        <span className="text-text-muted text-xs">até</span>
        <Input type="date" value={to} onChange={setTo} className="w-auto" />
        <div className="flex gap-1 ml-2">
          {[
            { label: '7d', days: 7 },
            { label: '30d', days: 30 },
            { label: '90d', days: 90 },
            { label: '1a', days: 365 },
          ].map((p) => (
            <button key={p.days} onClick={() => { setFrom(dateMinusDays(p.days)); setTo(todayISO()); }}
              className="text-xs px-2.5 py-1.5 rounded-md bg-bg-input text-text-muted hover:text-text-strong">
              {p.label}
            </button>
          ))}
        </div>
      </Card>

      {/* Content */}
      {activeTab === 'payables' && <PayablesReport from={from} to={to} />}
      {activeTab === 'receivables' && <ReceivablesReport from={from} to={to} />}
      {activeTab === 'transactions' && <TransactionsReport from={from} to={to} />}
      {activeTab === 'dre' && <DREReport from={from} to={to} />}
      {activeTab === 'cashflow' && <CashFlowReport from={from} to={to} />}
    </div>
  );
};

// ============ Sub-reports ============

const PayablesReport = ({ from, to }) => {
  const { bpoUrl } = useBpo();
  const [data, setData] = useState(null);

  const fetch_ = useCallback(async () => {
    const res = await fetch(bpoUrl(`/reports/payables?from=${from}&to=${to}`));
    setData(await res.json());
  }, [bpoUrl, from, to]);

  useEffect(() => { fetch_(); }, [fetch_]);

  if (!data) return <Card><div className="text-center py-8 text-xs text-text-muted">Carregando...</div></Card>;
  if (data.count === 0) return <Card><EmptyState title="Sem contas no período" description="Tente ampliar o filtro de datas." /></Card>;

  return (
    <>
      <SummaryCards items={[
        { label: 'Total no período', value: fmtBRL(data.summary.total), color: 'text-text-strong' },
        { label: 'Pago', value: fmtBRL(data.summary.paid), color: 'text-success' },
        { label: 'Pendente', value: fmtBRL(data.summary.remaining), color: 'text-danger' },
      ]} exportUrl={bpoUrl(`/reports/payables/export?from=${from}&to=${to}`)} />

      <Table>
        <thead><tr>
          <Th>Vencimento</Th><Th>Fornecedor</Th><Th>Descrição</Th><Th>Categoria</Th>
          <Th align="right">Valor</Th><Th align="right">Saldo</Th><Th>Status</Th>
        </tr></thead>
        <tbody>
          {data.items.map((p) => (
            <Tr key={p.id}>
              <Td>{fmtDate(p.dueDate)}</Td>
              <Td className="font-medium">{p.supplier?.name || '—'}</Td>
              <Td className="text-xs text-text-muted">{p.description || '—'}</Td>
              <Td>{p.category ? <Badge variant="default">{p.category.name}</Badge> : '—'}</Td>
              <Td align="right" className="tabular-nums">{fmtBRL(p.amount)}</Td>
              <Td align="right" className={`tabular-nums ${Number(p.remainingAmount) > 0 ? 'text-danger font-semibold' : 'text-text-subtle'}`}>{fmtBRL(p.remainingAmount)}</Td>
              <Td><Badge variant={p.status === 'paid' ? 'success' : 'default'}>{p.status}</Badge></Td>
            </Tr>
          ))}
        </tbody>
      </Table>
    </>
  );
};

const ReceivablesReport = ({ from, to }) => {
  const { bpoUrl } = useBpo();
  const [data, setData] = useState(null);

  const fetch_ = useCallback(async () => {
    const res = await fetch(bpoUrl(`/reports/receivables?from=${from}&to=${to}`));
    setData(await res.json());
  }, [bpoUrl, from, to]);

  useEffect(() => { fetch_(); }, [fetch_]);

  if (!data) return <Card><div className="text-center py-8 text-xs text-text-muted">Carregando...</div></Card>;
  if (data.count === 0) return <Card><EmptyState title="Sem contas no período" /></Card>;

  return (
    <>
      <SummaryCards items={[
        { label: 'Total no período', value: fmtBRL(data.summary.total), color: 'text-text-strong' },
        { label: 'Recebido', value: fmtBRL(data.summary.received), color: 'text-success' },
        { label: 'A receber', value: fmtBRL(data.summary.remaining), color: 'text-warning' },
      ]} exportUrl={bpoUrl(`/reports/receivables/export?from=${from}&to=${to}`)} />

      <Table>
        <thead><tr>
          <Th>Vencimento</Th><Th>Pagador</Th><Th>Forma Pagto</Th><Th>Categoria</Th>
          <Th align="right">Valor</Th><Th align="right">Saldo</Th><Th>Status</Th>
        </tr></thead>
        <tbody>
          {data.items.map((r) => (
            <Tr key={r.id}>
              <Td>{fmtDate(r.dueDate)}</Td>
              <Td className="font-medium">{r.payerName}</Td>
              <Td>{r.paymentMethod ? <Badge variant="info">{r.paymentMethod.name}</Badge> : '—'}</Td>
              <Td>{r.category ? <Badge variant="default">{r.category.name}</Badge> : '—'}</Td>
              <Td align="right" className="tabular-nums">{fmtBRL(r.amount)}</Td>
              <Td align="right" className={`tabular-nums ${Number(r.remainingAmount) > 0 ? 'text-success font-semibold' : 'text-text-subtle'}`}>{fmtBRL(r.remainingAmount)}</Td>
              <Td><Badge variant={r.status === 'received' ? 'success' : 'default'}>{r.status}</Badge></Td>
            </Tr>
          ))}
        </tbody>
      </Table>
    </>
  );
};

const TransactionsReport = ({ from, to }) => {
  const { bpoUrl } = useBpo();
  const [data, setData] = useState(null);

  const fetch_ = useCallback(async () => {
    const res = await fetch(bpoUrl(`/reports/transactions?from=${from}&to=${to}`));
    setData(await res.json());
  }, [bpoUrl, from, to]);

  useEffect(() => { fetch_(); }, [fetch_]);

  if (!data) return <Card><div className="text-center py-8 text-xs text-text-muted">Carregando...</div></Card>;
  if (data.count === 0) return <Card><EmptyState title="Sem movimentações no período" /></Card>;

  return (
    <>
      <SummaryCards items={[
        { label: 'Entradas', value: fmtBRL(data.summary.inflow), color: 'text-success' },
        { label: 'Saídas', value: fmtBRL(data.summary.outflow), color: 'text-danger' },
        { label: 'Saldo', value: fmtBRL(data.summary.net), color: data.summary.net >= 0 ? 'text-success' : 'text-danger' },
      ]} exportUrl={bpoUrl(`/reports/transactions/export?from=${from}&to=${to}`)} />

      <Table>
        <thead><tr>
          <Th>Data</Th><Th>Tipo</Th><Th>Origem</Th><Th>Banco</Th>
          <Th align="right">Valor</Th>
        </tr></thead>
        <tbody>
          {data.items.map((t) => (
            <Tr key={t.id}>
              <Td>{fmtDate(t.paidAt)}</Td>
              <Td><Badge variant={t.payableId ? 'danger' : 'success'}>{t.payableId ? 'Saída' : 'Entrada'}</Badge></Td>
              <Td className="font-medium">{t.payable ? t.payable.supplier?.name : t.receivable?.payerName}</Td>
              <Td className="text-xs text-text-muted">{t.bankAccount?.bankName} / {t.bankAccount?.account}</Td>
              <Td align="right" className={`tabular-nums font-semibold ${t.payableId ? 'text-danger' : 'text-success'}`}>
                {t.payableId ? '-' : '+'}{fmtBRL(t.amount)}
              </Td>
            </Tr>
          ))}
        </tbody>
      </Table>
    </>
  );
};

const DREReport = ({ from, to }) => {
  const { bpoUrl } = useBpo();
  const [data, setData] = useState(null);

  const fetch_ = useCallback(async () => {
    const res = await fetch(bpoUrl(`/reports/dre?from=${from}&to=${to}`));
    setData(await res.json());
  }, [bpoUrl, from, to]);

  useEffect(() => { fetch_(); }, [fetch_]);

  if (!data) return <Card><div className="text-center py-8 text-xs text-text-muted">Carregando...</div></Card>;

  return (
    <Card>
      <div className="flex items-center justify-between mb-3">
        <div className="text-[10px] uppercase text-text-subtle font-semibold">DRE — {fmtDate(data.from)} a {fmtDate(data.to)}</div>
        <a href={bpoUrl(`/reports/dre/export?from=${from}&to=${to}`)} download
          className="inline-flex items-center gap-1.5 text-xs text-brand hover:text-brand-hover font-medium">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none"><path d="M12 5v14m0 0l-5-5m5 5l5-5M5 19h14" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/></svg>
          Exportar Excel
        </a>
      </div>
      <div className="flex flex-col">
        {data.lines.map((l, i) => {
          const isResult = l.type === 'result';
          const isSubtotal = l.type === 'subtotal';
          const isHeader = l.type === 'header';
          const needsDivider = isSubtotal || isResult || isHeader;
          return (
            <div key={i}>
              {needsDivider && i > 0 && <div className="w-full h-px bg-border my-2" />}
              <div className={`flex items-center gap-2 py-1.5 px-2 rounded-md ${isResult ? 'bg-bg-elevated' : ''}`}>
                <div className={`w-5 h-5 rounded text-[10px] font-bold flex items-center justify-center ${
                  isResult ? (l.value >= 0 ? 'bg-success-soft text-success' : 'bg-danger-soft text-danger') :
                  isSubtotal ? 'bg-warning-soft text-warning' :
                  isHeader ? 'bg-success-soft text-success' :
                  'bg-bg-input text-text-muted'
                }`}>{l.sign}</div>
                <div className={`flex-1 text-sm ${l.bold || isSubtotal || isResult ? 'font-bold' : ''} ${isResult ? (l.value >= 0 ? 'text-success' : 'text-danger') : 'text-text'}`}>{l.label}</div>
                <div className={`text-sm tabular-nums ${l.bold || isSubtotal || isResult ? 'font-bold' : ''} ${isResult ? (l.value >= 0 ? 'text-success' : 'text-danger') : 'text-text'}`}>
                  {fmtBRL(Math.abs(l.value))}
                </div>
              </div>
            </div>
          );
        })}
      </div>
      <div className="mt-4 pt-3 border-t border-border text-xs text-text-subtle">
        Baseado em {data.counts.received} recebimento(s) e {data.counts.paid} pagamento(s) registrados no período.
      </div>
    </Card>
  );
};

const CashFlowReport = ({ from, to }) => {
  const { bpoUrl } = useBpo();
  const [data, setData] = useState(null);
  const [groupBy, setGroupBy] = useState('day');

  const fetch_ = useCallback(async () => {
    const res = await fetch(bpoUrl(`/reports/cashflow?from=${from}&to=${to}&groupBy=${groupBy}`));
    setData(await res.json());
  }, [bpoUrl, from, to, groupBy]);

  useEffect(() => { fetch_(); }, [fetch_]);

  if (!data) return <Card><div className="text-center py-8 text-xs text-text-muted">Carregando...</div></Card>;

  const maxValue = Math.max(...data.series.map((s) => Math.max(s.realInflow + s.projInflow, s.realOutflow + s.projOutflow)), 1);

  return (
    <>
      <SummaryCards items={[
        { label: 'Saldo inicial', value: fmtBRL(data.startingBalance), color: 'text-text-strong' },
        { label: 'Entradas (real + projetado)', value: fmtBRL(data.summary.totalInflow), color: 'text-success' },
        { label: 'Saídas (real + projetado)', value: fmtBRL(data.summary.totalOutflow), color: 'text-danger' },
        { label: 'Saldo final projetado', value: fmtBRL(data.summary.finalBalance), color: data.summary.finalBalance >= 0 ? 'text-success' : 'text-danger' },
      ]} exportUrl={bpoUrl(`/reports/cashflow/export?from=${from}&to=${to}&groupBy=${groupBy}`)} />

      <Card padded={false} className="p-3 flex justify-end">
        <div className="flex gap-1">
          {['day', 'week', 'month'].map((g) => (
            <button key={g} onClick={() => setGroupBy(g)}
              className={`text-xs px-2.5 py-1 rounded-md ${groupBy === g ? 'bg-brand text-black' : 'bg-bg-input text-text-muted'}`}>
              {g === 'day' ? 'Dia' : g === 'week' ? 'Semana' : 'Mês'}
            </button>
          ))}
        </div>
      </Card>

      <Card>
        <div className="text-[10px] uppercase text-text-subtle font-semibold mb-3">Fluxo por período</div>
        <CashflowChart series={data.series} />
        <div className="mt-3 pt-3 border-t border-border flex gap-4 flex-wrap text-[10px] text-text-muted">
          <div className="flex items-center gap-1"><div className="w-3 h-3 rounded-sm bg-success/30 border border-success/50" /> Entrada (real + projetado)</div>
          <div className="flex items-center gap-1"><div className="w-3 h-3 rounded-sm bg-danger/30 border border-danger/50" /> Saída (real + projetado)</div>
          <div className="flex items-center gap-1"><div className="w-4 h-0.5 bg-brand" /> Saldo acumulado</div>
        </div>
      </Card>

      <Card>
        <div className="text-[10px] uppercase text-text-subtle font-semibold mb-3">Detalhamento por período</div>
        <div className="overflow-x-auto">
          <Table>
            <thead><tr>
              <Th>Período</Th>
              <Th align="right">Entrada real</Th>
              <Th align="right">Entrada projetada</Th>
              <Th align="right">Saída real</Th>
              <Th align="right">Saída projetada</Th>
              <Th align="right">Saldo acumulado</Th>
            </tr></thead>
            <tbody>
              {data.series.map((s) => (
                <Tr key={s.period}>
                  <Td className="text-xs text-text-muted">{s.period}</Td>
                  <Td align="right" className="text-success tabular-nums">{s.realInflow > 0 ? fmtBRL(s.realInflow) : '—'}</Td>
                  <Td align="right" className="text-success/60 tabular-nums">{s.projInflow > 0 ? fmtBRL(s.projInflow) : '—'}</Td>
                  <Td align="right" className="text-danger tabular-nums">{s.realOutflow > 0 ? fmtBRL(s.realOutflow) : '—'}</Td>
                  <Td align="right" className="text-danger/60 tabular-nums">{s.projOutflow > 0 ? fmtBRL(s.projOutflow) : '—'}</Td>
                  <Td align="right" className="font-semibold tabular-nums text-text-strong">{fmtBRL(s.balance)}</Td>
                </Tr>
              ))}
            </tbody>
          </Table>
        </div>
      </Card>
    </>
  );
};

// Gráfico de fluxo de caixa: ComposedChart (Recharts) — entradas/saídas em barras + saldo em linha
const CashflowChart = ({ series }) => {
  const data = series.map((s) => ({
    period: s.period,
    entrada: s.realInflow + s.projInflow,
    saida: -(s.realOutflow + s.projOutflow), // negativo pra ficar abaixo do zero
    saldo: s.balance,
  }));

  const tooltipFormatter = (value, name) => {
    const fmt = Number(Math.abs(value)).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
    return [fmt, name];
  };

  return (
    <div style={{ width: '100%', height: 320 }}>
      <ResponsiveContainer>
        <ComposedChart data={data} margin={{ top: 10, right: 10, left: 0, bottom: 5 }}>
          <CartesianGrid stroke="#2A2A2C" strokeDasharray="3 3" vertical={false} />
          <XAxis dataKey="period" stroke="#868686" fontSize={10} tickLine={false} axisLine={{ stroke: '#2A2A2C' }} />
          <YAxis yAxisId="left" stroke="#868686" fontSize={10} tickLine={false} axisLine={{ stroke: '#2A2A2C' }}
            tickFormatter={(v) => v >= 1000 || v <= -1000 ? `${(v / 1000).toFixed(0)}k` : v} />
          <YAxis yAxisId="right" orientation="right" stroke="#F5A623" fontSize={10} tickLine={false} axisLine={{ stroke: '#2A2A2C' }}
            tickFormatter={(v) => v >= 1000 || v <= -1000 ? `${(v / 1000).toFixed(0)}k` : v} />
          <Tooltip
            contentStyle={{ background: '#1B1B1D', border: '1px solid #2A2A2C', borderRadius: 8, fontSize: 11 }}
            labelStyle={{ color: '#fff', fontWeight: 600 }}
            formatter={tooltipFormatter}
          />
          <Bar yAxisId="left" dataKey="entrada" fill="#4ADE80" fillOpacity={0.5} stroke="#4ADE80" strokeOpacity={0.8} name="Entrada" radius={[2, 2, 0, 0]} />
          <Bar yAxisId="left" dataKey="saida" fill="#EF4444" fillOpacity={0.5} stroke="#EF4444" strokeOpacity={0.8} name="Saída" radius={[0, 0, 2, 2]} />
          <Line yAxisId="right" type="monotone" dataKey="saldo" stroke="#F5A623" strokeWidth={2} dot={{ fill: '#F5A623', r: 3 }} name="Saldo" />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
};

const SummaryCards = ({ items, exportUrl }) => (
  <div className="flex justify-between gap-3 flex-wrap">
    <div className="flex gap-3 flex-wrap flex-1">
      {items.map((it, i) => (
        <Card key={i} className="flex-1 min-w-[160px]">
          <div className="text-[10px] text-text-muted uppercase tracking-wider mb-1">{it.label}</div>
          <div className={`text-xl font-bold tabular-nums ${it.color || 'text-text-strong'}`}>{it.value}</div>
        </Card>
      ))}
    </div>
    {exportUrl && (
      <Button variant="secondary" onClick={() => window.location.href = exportUrl}
        icon={<svg width="14" height="14" viewBox="0 0 24 24" fill="none"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4M7 10l5 5 5-5M12 15V3" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>}>
        Exportar Excel
      </Button>
    )}
  </div>
);

export default ReportsHub;
