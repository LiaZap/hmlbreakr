import { useState, useEffect, useCallback } from 'react';
import { useBpo } from '../../../context/BpoContext';
import { Button, Card, Input, Badge, EmptyState, Modal, Table, Th, Td, Tr } from '../../ui/primitives';

const fmtBRL = (n) => Number(n || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const fmtDate = (d) => d ? new Date(d).toLocaleDateString('pt-BR') : '—';

const STATUS_BADGES = {
  pending: { label: 'Pendente', variant: 'default' },
  received_partial: { label: 'Parcial', variant: 'warning' },
  received: { label: 'Recebido', variant: 'success' },
  cancelled: { label: 'Cancelado', variant: 'danger' },
};

const ReceivablesList = () => {
  const { bpoUrl, selectedClient } = useBpo();
  const [items, setItems] = useState([]);
  const [pendingTotal, setPendingTotal] = useState(0);
  const [filterStatus, setFilterStatus] = useState('');
  const [search, setSearch] = useState('');
  const [editing, setEditing] = useState(null);
  const [receiving, setReceiving] = useState(null);

  const fetchItems = useCallback(async () => {
    if (!selectedClient) return;
    const params = new URLSearchParams();
    if (filterStatus) params.append('status', filterStatus);
    if (search) params.append('search', search);
    const res = await fetch(bpoUrl(`/receivables?${params}`));
    const data = await res.json();
    setItems(data.items || []);
    setPendingTotal(data.pendingTotal || 0);
  }, [bpoUrl, selectedClient, filterStatus, search]);

  useEffect(() => { fetchItems(); }, [fetchItems]);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-xl font-bold text-text-strong">Contas a Receber</h1>
          <p className="text-xs text-text-muted mt-0.5">
            Total pendente: <span className="text-success font-semibold">{fmtBRL(pendingTotal)}</span>
          </p>
        </div>
        <Button variant="primary" onClick={() => setEditing('new')} className="w-full sm:w-auto"
          icon={<svg width="14" height="14" viewBox="0 0 24 24" fill="none"><path d="M12 5v14M5 12h14" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/></svg>}>
          <span className="sm:hidden">Nova</span><span className="hidden sm:inline">Nova Conta a Receber</span>
        </Button>
      </div>

      <Card padded={false} className="p-3 flex flex-wrap gap-3">
        <Input className="flex-1 min-w-[200px]" value={search} onChange={setSearch} placeholder="Buscar por descrição, NF, pagador..."
          icon={<svg width="14" height="14" viewBox="0 0 24 24" fill="none"><circle cx="11" cy="11" r="8" stroke="currentColor" strokeWidth="2"/><path d="M21 21l-4.35-4.35" stroke="currentColor" strokeWidth="2"/></svg>} />
        <select value={filterStatus} onChange={(e) => setFilterStatus(e.target.value)}
          className="bg-bg-input border border-border rounded-md px-3 py-2 text-sm text-text-strong outline-none">
          <option value="">Todos status</option>
          {Object.entries(STATUS_BADGES).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
        </select>
      </Card>

      {items.length === 0 ? (
        <Card><EmptyState
          icon={<svg width="24" height="24" viewBox="0 0 24 24" fill="none"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8l-6-6z" stroke="currentColor" strokeWidth="1.5"/><path d="M14 2v6h6" stroke="currentColor" strokeWidth="1.5"/></svg>}
          title="Nenhuma conta a receber"
          description="Crie uma conta a receber pra controlar o que entra."
        /></Card>
      ) : (
        <>
          {/* DESKTOP — tabela */}
          <div className="hidden md:block">
            <Table>
              <thead><tr>
                <Th>Vencimento</Th><Th>Pagador</Th><Th>Descrição</Th><Th>Forma Pagto</Th>
                <Th align="right">Valor</Th><Th align="right">Saldo</Th><Th>Status</Th><Th align="right">Ações</Th>
              </tr></thead>
              <tbody>
                {items.map((p) => {
                  const overdue = new Date(p.dueDate) < new Date() && p.status !== 'received';
                  return (
                    <Tr key={p.id} onClick={() => setEditing(p)}>
                      <Td className={overdue ? 'text-warning font-semibold' : ''}>{fmtDate(p.dueDate)}</Td>
                      <Td className="font-medium">{p.payerName}</Td>
                      <Td className="text-xs text-text-muted">{p.description || p.invoiceNumber || '—'}</Td>
                      <Td>{p.paymentMethod ? <Badge variant="info">{p.paymentMethod.name}</Badge> : '—'}</Td>
                      <Td align="right" className="font-semibold tabular-nums">{fmtBRL(p.amount)}</Td>
                      <Td align="right" className={`tabular-nums ${Number(p.remainingAmount) > 0 ? 'text-success font-semibold' : 'text-text-subtle'}`}>
                        {fmtBRL(p.remainingAmount)}
                      </Td>
                      <Td><Badge variant={STATUS_BADGES[p.status]?.variant || 'default'}>{STATUS_BADGES[p.status]?.label}</Badge></Td>
                      <Td align="right">
                        {p.status !== 'received' && p.status !== 'cancelled' && (
                          <Button variant="link" size="sm" onClick={(e) => { e.stopPropagation(); setReceiving(p); }}>Receber</Button>
                        )}
                      </Td>
                    </Tr>
                  );
                })}
              </tbody>
            </Table>
          </div>

          {/* MOBILE — cards */}
          <div className="md:hidden flex flex-col gap-2">
            {items.map((p) => {
              const overdue = new Date(p.dueDate) < new Date() && p.status !== 'received';
              const showActions = p.status !== 'received' && p.status !== 'cancelled';
              return (
                <Card key={p.id} padded={false} hoverable className="p-3 flex flex-col gap-2.5" onClick={() => setEditing(p)}>
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="font-medium text-sm text-text-strong truncate">{p.payerName}</div>
                      <div className="text-xs text-text-muted truncate">{p.description || p.invoiceNumber || '—'}</div>
                    </div>
                    <Badge variant={STATUS_BADGES[p.status]?.variant || 'default'}>{STATUS_BADGES[p.status]?.label}</Badge>
                  </div>

                  <div className="flex items-end justify-between gap-2">
                    <div className="flex flex-col gap-0.5 min-w-0">
                      <span className={`text-xs ${overdue ? 'text-warning font-semibold' : 'text-text-muted'}`}>
                        Vence {fmtDate(p.dueDate)}
                      </span>
                      {p.paymentMethod && <Badge variant="info">{p.paymentMethod.name}</Badge>}
                    </div>
                    <div className="text-right shrink-0">
                      <div className="font-bold text-base tabular-nums text-text-strong">{fmtBRL(p.amount)}</div>
                      {Number(p.remainingAmount) > 0 && (
                        <div className="text-[11px] tabular-nums text-success font-semibold">Saldo {fmtBRL(p.remainingAmount)}</div>
                      )}
                    </div>
                  </div>

                  {showActions && (
                    <div className="flex pt-1 border-t border-border-subtle">
                      <Button variant="primary" size="sm" className="flex-1" onClick={(e) => { e.stopPropagation(); setReceiving(p); }}>Receber</Button>
                    </div>
                  )}
                </Card>
              );
            })}
          </div>
        </>
      )}

      {editing && <ReceivableModal item={editing === 'new' ? null : editing} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); fetchItems(); }} />}
      {receiving && <ReceiveModal item={receiving} onClose={() => setReceiving(null)} onSaved={() => { setReceiving(null); fetchItems(); }} />}
    </div>
  );
};

const ReceivableModal = ({ item, onClose, onSaved }) => {
  const { bpoUrl } = useBpo();
  const isEdit = !!item;
  const [paymentMethods, setPaymentMethods] = useState([]);
  const [categories, setCategories] = useState([]);

  const [form, setForm] = useState({
    payerName: item?.payerName || '', payerDocument: item?.payerDocument || '',
    amount: item?.amount || '', dueDate: item?.dueDate ? new Date(item.dueDate).toISOString().slice(0, 10) : '',
    receiptForecast: item?.receiptForecast ? new Date(item.receiptForecast).toISOString().slice(0, 10) : '',
    emissionDate: item?.emissionDate ? new Date(item.emissionDate).toISOString().slice(0, 10) : '',
    invoiceNumber: item?.invoiceNumber || '', description: item?.description || '',
    categoryId: item?.categoryId || '', paymentMethodId: item?.paymentMethodId || '',
  });
  const [error, setError] = useState(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetch(bpoUrl('/payment-methods')).then((r) => r.json()).then((d) => setPaymentMethods(d.items || []));
    fetch(bpoUrl('/categories?type=receita')).then((r) => r.json()).then((d) => setCategories(d.items || []));
  }, [bpoUrl]);

  const update = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  const handleSave = async () => {
    setError(null);
    if (!form.payerName.trim() || !form.amount || !form.dueDate) {
      setError('Pagador, valor e vencimento obrigatórios');
      return;
    }
    setSaving(true);
    try {
      const url = isEdit ? bpoUrl(`/receivables/${item.id}`) : bpoUrl('/receivables');
      const res = await fetch(url, {
        method: isEdit ? 'PUT' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      });
      if (!res.ok) throw new Error((await res.json()).error || 'Erro');
      onSaved();
    } catch (err) { setError(err.message); }
    finally { setSaving(false); }
  };

  return (
    <Modal open onClose={onClose} title={isEdit ? 'Editar conta a receber' : 'Nova conta a receber'} size="lg"
      footer={<>
        <Button variant="secondary" onClick={onClose}>Cancelar</Button>
        <Button variant="primary" onClick={handleSave} loading={saving}>{isEdit ? 'Salvar' : 'Criar'}</Button>
      </>}>
      <div className="flex flex-col gap-4">
        {error && <div className="bg-danger-soft border border-danger/30 rounded-md px-3 py-2 text-xs text-danger">{error}</div>}

        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <Input label="Pagador" value={form.payerName} onChange={(v) => update('payerName', v)} placeholder="Cliente, iFood, Cliente avulso..." required />
          <Input label="CPF/CNPJ (opcional)" value={form.payerDocument} onChange={(v) => update('payerDocument', v)} />
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <Input label="Valor (R$)" type="number" value={form.amount} onChange={(v) => update('amount', v)} placeholder="0,00" required />
          <Input label="Vencimento" type="date" value={form.dueDate} onChange={(v) => update('dueDate', v)} required />
          <Input label="Previsão recebimento" type="date" value={form.receiptForecast} onChange={(v) => update('receiptForecast', v)} />
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <div>
            <label className="text-xs text-text-muted font-medium mb-1.5 block">Forma de pagamento</label>
            <select value={form.paymentMethodId} onChange={(e) => update('paymentMethodId', e.target.value)}
              className="w-full bg-bg-input border border-border rounded-md px-3 py-2 text-sm text-text-strong outline-none">
              <option value="">— sem definir —</option>
              {paymentMethods.map((p) => <option key={p.id} value={p.id}>{p.name} ({p.feePercent}%)</option>)}
            </select>
          </div>
          <div>
            <label className="text-xs text-text-muted font-medium mb-1.5 block">Categoria</label>
            <select value={form.categoryId} onChange={(e) => update('categoryId', e.target.value)}
              className="w-full bg-bg-input border border-border rounded-md px-3 py-2 text-sm text-text-strong outline-none">
              <option value="">— sem categoria —</option>
              {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <Input label="Nº Nota Fiscal" value={form.invoiceNumber} onChange={(v) => update('invoiceNumber', v)} />
          <Input label="Data emissão" type="date" value={form.emissionDate} onChange={(v) => update('emissionDate', v)} />
        </div>

        <Input label="Descrição" value={form.description} onChange={(v) => update('description', v)} placeholder="Ex: Vendas iFood Mar/2026" />
      </div>
    </Modal>
  );
};

const ReceiveModal = ({ item, onClose, onSaved }) => {
  const { bpoUrl } = useBpo();
  const [bankAccounts, setBankAccounts] = useState([]);
  const [form, setForm] = useState({
    amount: item.remainingAmount,
    bankAccountId: '',
    paidAt: new Date().toISOString().slice(0, 10),
    notes: '',
  });
  const [error, setError] = useState(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetch(bpoUrl('/bank-accounts')).then((r) => r.json()).then((d) => setBankAccounts(d.items || []));
  }, [bpoUrl]);

  const handleSave = async () => {
    setError(null);
    if (!form.bankAccountId) { setError('Selecione a conta bancária'); return; }
    setSaving(true);
    try {
      const res = await fetch(bpoUrl(`/receivables/${item.id}/receive`), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      });
      if (!res.ok) throw new Error((await res.json()).error || 'Erro');
      onSaved();
    } catch (err) { setError(err.message); }
    finally { setSaving(false); }
  };

  return (
    <Modal open onClose={onClose} title="Registrar recebimento" subtitle={item.payerName} size="sm"
      footer={<>
        <Button variant="secondary" onClick={onClose}>Cancelar</Button>
        <Button variant="primary" onClick={handleSave} loading={saving}>Confirmar recebimento</Button>
      </>}>
      <div className="flex flex-col gap-4">
        {error && <div className="bg-danger-soft border border-danger/30 rounded-md px-3 py-2 text-xs text-danger">{error}</div>}

        <div className="bg-bg-elevated border border-border rounded-md p-3 flex justify-between items-center">
          <span className="text-xs text-text-muted">Saldo a receber</span>
          <span className="text-base font-bold text-success tabular-nums">{fmtBRL(item.remainingAmount)}</span>
        </div>

        <Input label="Valor recebido" type="number" value={form.amount} onChange={(v) => setForm({ ...form, amount: v })}
          helper={parseFloat(form.amount) < parseFloat(item.remainingAmount) ? '⚠️ Recebimento parcial — saldo permanece' : ''} required />

        <div>
          <label className="text-xs text-text-muted font-medium mb-1.5 block">Conta bancária *</label>
          <select value={form.bankAccountId} onChange={(e) => setForm({ ...form, bankAccountId: e.target.value })}
            className="w-full bg-bg-input border border-border rounded-md px-3 py-2 text-sm text-text-strong outline-none">
            <option value="">Selecione...</option>
            {bankAccounts.map((b) => <option key={b.id} value={b.id}>{b.bankName} — {b.account}</option>)}
          </select>
        </div>

        <Input label="Data do recebimento" type="date" value={form.paidAt} onChange={(v) => setForm({ ...form, paidAt: v })} />
        <Input label="Observações" value={form.notes} onChange={(v) => setForm({ ...form, notes: v })} />
      </div>
    </Modal>
  );
};

export default ReceivablesList;
