import { useState, useEffect, useCallback } from 'react';
import { useBpo } from '../../../context/BpoContext';
import { Button, Card, Input, Badge, EmptyState, Modal, Table, Th, Td, Tr, useToast, useConfirm } from '../../ui/primitives';

const fmtBRL = (n) => Number(n || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const fmtDate = (d) => d ? new Date(d).toLocaleDateString('pt-BR') : '—';

const STATUS_BADGES = {
  pending: { label: 'Pendente', variant: 'default' },
  scheduled: { label: 'Agendado', variant: 'info' },
  paid_partial: { label: 'Parcial', variant: 'warning' },
  paid: { label: 'Pago', variant: 'success' },
  cancelled: { label: 'Cancelado', variant: 'danger' },
};

const PayablesList = () => {
  const { bpoUrl, selectedClient } = useBpo();
  const [items, setItems] = useState([]);
  const [pendingTotal, setPendingTotal] = useState(0);
  const [filterStatus, setFilterStatus] = useState('');
  const [search, setSearch] = useState('');
  const [editing, setEditing] = useState(null);
  const [paying, setPaying] = useState(null);
  const [scheduling, setScheduling] = useState(null);

  const fetchItems = useCallback(async () => {
    if (!selectedClient) return;
    const params = new URLSearchParams();
    if (filterStatus) params.append('status', filterStatus);
    if (search) params.append('search', search);
    const res = await fetch(bpoUrl(`/payables?${params}`));
    const data = await res.json();
    setItems(data.items || []);
    setPendingTotal(data.pendingTotal || 0);
  }, [bpoUrl, selectedClient, filterStatus, search]);

  useEffect(() => { fetchItems(); }, [fetchItems]);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-text-strong">Contas a Pagar</h1>
          <p className="text-xs text-text-muted mt-0.5">
            Total pendente: <span className="text-danger font-semibold">{fmtBRL(pendingTotal)}</span>
          </p>
        </div>
        <Button variant="primary" onClick={() => setEditing('new')}
          icon={<svg width="14" height="14" viewBox="0 0 24 24" fill="none"><path d="M12 5v14M5 12h14" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/></svg>}>
          Nova Conta a Pagar
        </Button>
      </div>

      <Card padded={false} className="p-3 flex flex-wrap gap-3">
        <Input className="flex-1 min-w-[200px]" value={search} onChange={setSearch} placeholder="Buscar por descrição, NF, fornecedor..."
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
          title="Nenhuma conta a pagar"
          description="Crie uma conta a pagar pra começar a controlar fluxo de caixa."
        /></Card>
      ) : (
        <Table>
          <thead><tr>
            <Th>Vencimento</Th><Th>Fornecedor</Th><Th>Descrição</Th><Th>Categoria</Th>
            <Th align="right">Valor</Th><Th align="right">Saldo</Th><Th>Status</Th><Th align="right">Ações</Th>
          </tr></thead>
          <tbody>
            {items.map((p) => {
              const overdue = new Date(p.dueDate) < new Date() && p.status !== 'paid';
              return (
                <Tr key={p.id} onClick={() => setEditing(p)}>
                  <Td className={overdue ? 'text-danger font-semibold' : ''}>
                    <div className="flex items-center gap-1.5">
                      <span>{fmtDate(p.dueDate)}</span>
                      {p.installmentNumber && p.recurrence && (
                        <span className="text-[10px] text-text-subtle bg-bg-input px-1.5 py-0.5 rounded" title={`Recorrência ${p.recurrence.frequency}`}>
                          ↻ {p.installmentNumber}/{p.recurrence.occurrencesCount || '∞'}
                        </span>
                      )}
                      {p.installmentNumber && !p.recurrence && (
                        <span className="text-xs text-text-subtle">({p.installmentNumber})</span>
                      )}
                    </div>
                  </Td>
                  <Td className="font-medium">{p.supplier?.name || '—'}</Td>
                  <Td className="text-xs text-text-muted">{p.description || p.invoiceNumber || '—'}</Td>
                  <Td>
                    {p.category ? (
                      <Badge variant="default">
                        {p.category.color && <span className="w-2 h-2 rounded-full mr-1" style={{ background: p.category.color }} />}
                        {p.category.name}
                      </Badge>
                    ) : '—'}
                  </Td>
                  <Td align="right" className="font-semibold tabular-nums">{fmtBRL(p.amount)}</Td>
                  <Td align="right" className={`tabular-nums ${Number(p.remainingAmount) > 0 ? 'text-danger font-semibold' : 'text-text-subtle'}`}>
                    {fmtBRL(p.remainingAmount)}
                  </Td>
                  <Td><Badge variant={STATUS_BADGES[p.status]?.variant || 'default'}>{STATUS_BADGES[p.status]?.label || p.status}</Badge></Td>
                  <Td align="right">
                    {p.status !== 'paid' && p.status !== 'cancelled' && (
                      <div className="flex gap-2 justify-end">
                        {p.status !== 'scheduled' && (
                          <Button variant="link" size="sm" onClick={(e) => { e.stopPropagation(); setScheduling(p); }}>Agendar</Button>
                        )}
                        <Button variant="link" size="sm" onClick={(e) => { e.stopPropagation(); setPaying(p); }}>Baixar</Button>
                      </div>
                    )}
                  </Td>
                </Tr>
              );
            })}
          </tbody>
        </Table>
      )}

      {editing && <PayableModal item={editing === 'new' ? null : editing} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); fetchItems(); }} />}
      {paying && <PayModal item={paying} onClose={() => setPaying(null)} onSaved={() => { setPaying(null); fetchItems(); }} />}
      {scheduling && <ScheduleModal item={scheduling} onClose={() => setScheduling(null)} onSaved={() => { setScheduling(null); fetchItems(); }} />}
    </div>
  );
};

// ============ Modal Agendar Pagamento ============
const ScheduleModal = ({ item, onClose, onSaved }) => {
  const { bpoUrl } = useBpo();
  const [bankAccounts, setBankAccounts] = useState([]);
  const [form, setForm] = useState({
    scheduledAt: item.dueDate ? new Date(item.dueDate).toISOString().slice(0, 10) : new Date().toISOString().slice(0, 10),
    bankAccountId: '',
    requiresApproval: true,  // default: requer aprovação do dono
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
      const res = await fetch(bpoUrl(`/payables/${item.id}/schedule`), {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      });
      if (!res.ok) throw new Error((await res.json()).error || 'Erro');
      onSaved();
    } catch (err) { setError(err.message); }
    finally { setSaving(false); }
  };

  return (
    <Modal open onClose={onClose} title="Agendar pagamento no banco" subtitle={item.description || item.supplier?.name} size="md"
      footer={<>
        <Button variant="secondary" onClick={onClose}>Cancelar</Button>
        <Button variant="primary" onClick={handleSave} loading={saving}>Agendar</Button>
      </>}>
      <div className="flex flex-col gap-4">
        {error && <div className="bg-danger-soft border border-danger/30 rounded-md px-3 py-2 text-xs text-danger">{error}</div>}

        <div className="bg-bg-elevated border border-border rounded-md p-3 flex justify-between items-center">
          <span className="text-xs text-text-muted">Valor a pagar</span>
          <span className="text-base font-bold text-danger tabular-nums">{fmtBRL(item.remainingAmount)}</span>
        </div>

        <Input label="Data agendada" type="date" value={form.scheduledAt} onChange={(v) => setForm({ ...form, scheduledAt: v })} />

        <div>
          <label className="text-xs text-text-muted font-medium mb-1.5 block">Conta de débito *</label>
          <select value={form.bankAccountId} onChange={(e) => setForm({ ...form, bankAccountId: e.target.value })}
            className="w-full bg-bg-input border border-border rounded-md px-3 py-2 text-sm text-text-strong outline-none">
            <option value="">Selecione...</option>
            {bankAccounts.map((b) => <option key={b.id} value={b.id}>{b.bankName} — {b.account} ({fmtBRL(b.currentBalance)})</option>)}
          </select>
        </div>

        <label className="flex items-start gap-2 bg-warning-soft border border-warning/30 rounded-md p-3 cursor-pointer">
          <input type="checkbox" checked={form.requiresApproval} onChange={(e) => setForm({ ...form, requiresApproval: e.target.checked })} className="mt-0.5 accent-brand" />
          <div className="flex-1">
            <div className="text-xs font-semibold text-text-strong">Requer aprovação antes de executar</div>
            <div className="text-[10px] text-text-muted mt-0.5">
              {form.requiresApproval
                ? 'Pagamento fica pendente até o dono aprovar via dashboard.'
                : '⚠️ Pagamento será enviado direto pro banco sem confirmação.'}
            </div>
          </div>
        </label>

        <p className="text-[10px] text-text-subtle">
          Por enquanto, o agendamento só marca o status. Quando integrar com APIs de banco (Inter/BTG/Sicoob), enviará pagamento automático.
        </p>
      </div>
    </Modal>
  );
};

// ============ Modal CRUD ============
const PayableModal = ({ item, onClose, onSaved }) => {
  const { bpoUrl } = useBpo();
  const toast = useToast();
  const confirm = useConfirm();
  const isEdit = !!item;
  const [suppliers, setSuppliers] = useState([]);
  const [categories, setCategories] = useState([]);
  const [fullItem, setFullItem] = useState(item); // recarregado do servidor com recurrence

  const [form, setForm] = useState({
    supplierId: item?.supplierId || '',
    amount: item?.amount || '', dueDate: item?.dueDate ? new Date(item.dueDate).toISOString().slice(0, 10) : '',
    paymentForecast: item?.paymentForecast ? new Date(item.paymentForecast).toISOString().slice(0, 10) : '',
    emissionDate: item?.emissionDate ? new Date(item.emissionDate).toISOString().slice(0, 10) : '',
    invoiceNumber: item?.invoiceNumber || '', description: item?.description || '',
    categoryId: item?.categoryId || '', department: item?.department || '',
    // Recorrência (só new)
    useRecurrence: false, recurrenceFrequency: 'monthly', recurrenceCount: 12,
    // Parcelamento (só new)
    useInstallments: false, installmentCount: 2,
  });
  const [error, setError] = useState(null);
  const [saving, setSaving] = useState(false);
  const [cancelingRecurrence, setCancelingRecurrence] = useState(false);

  useEffect(() => {
    fetch(bpoUrl('/suppliers')).then((r) => r.json()).then((d) => setSuppliers(d.items || []));
    fetch(bpoUrl('/categories?type=despesa')).then((r) => r.json()).then((d) => setCategories(d.items || []));
    // Refetch payable completo (com recurrence) se for edição
    if (isEdit && item?.id) {
      fetch(bpoUrl(`/payables/${item.id}`)).then((r) => r.json()).then((d) => setFullItem(d)).catch(() => {});
    }
  }, [bpoUrl, isEdit, item?.id]);

  const FREQ_LABEL = { weekly: 'semanal', monthly: 'mensal', quarterly: 'trimestral', semiannual: 'semestral', yearly: 'anual' };

  const handleCancelRecurrence = async () => {
    if (!fullItem?.recurrenceId) return;
    const ok = await confirm({
      title: 'Cancelar parcelas futuras?',
      message: 'Todas as parcelas pendentes desta recorrência (a partir de hoje) serão canceladas. Parcelas já pagas continuam intactas.',
      confirmLabel: 'Cancelar parcelas futuras',
      variant: 'danger',
    });
    if (!ok) return;
    setCancelingRecurrence(true);
    try {
      const res = await fetch(bpoUrl(`/payables/recurrence/${fullItem.recurrenceId}/cancel-future`), { method: 'POST' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Falha ao cancelar');
      toast.success(`${data.canceledCount} parcela(s) futura(s) cancelada(s)`);
      onSaved();
    } catch (err) { toast.error(err.message); }
    finally { setCancelingRecurrence(false); }
  };

  const update = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  const handleSave = async () => {
    setError(null);
    if (!form.amount || !form.dueDate) { setError('Valor e vencimento obrigatórios'); return; }
    setSaving(true);
    try {
      const payload = { ...form };
      if (form.useRecurrence) {
        payload.recurrence = { frequency: form.recurrenceFrequency, occurrencesCount: parseInt(form.recurrenceCount, 10) };
      }
      if (form.useInstallments) {
        payload.installments = { count: parseInt(form.installmentCount, 10), intervalCount: 1 };
      }
      const url = isEdit ? bpoUrl(`/payables/${item.id}`) : bpoUrl('/payables');
      const res = await fetch(url, {
        method: isEdit ? 'PUT' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (!res.ok) throw new Error((await res.json()).error || 'Erro');
      onSaved();
    } catch (err) { setError(err.message); }
    finally { setSaving(false); }
  };

  return (
    <Modal open onClose={onClose} title={isEdit ? 'Editar conta a pagar' : 'Nova conta a pagar'} size="lg"
      footer={<>
        <Button variant="secondary" onClick={onClose}>Cancelar</Button>
        <Button variant="primary" onClick={handleSave} loading={saving}>{isEdit ? 'Salvar' : 'Criar'}</Button>
      </>}>
      <div className="flex flex-col gap-4">
        {error && <div className="bg-danger-soft border border-danger/30 rounded-md px-3 py-2 text-xs text-danger">{error}</div>}

        {/* Banner de recorrência (só em edição, quando o item faz parte de uma recorrência) */}
        {isEdit && fullItem?.recurrenceId && fullItem?.recurrence && (
          <div className="bg-info-soft border border-info/30 rounded-md p-3 flex items-start gap-3">
            <div className="text-info text-lg leading-none">↻</div>
            <div className="flex-1 min-w-0">
              <div className="text-xs font-semibold text-info">
                Parcela {fullItem.installmentNumber || '?'} de {fullItem.recurrence.occurrencesCount || '∞'} · Recorrência {FREQ_LABEL[fullItem.recurrence.frequency] || fullItem.recurrence.frequency}
              </div>
              <p className="text-[11px] text-text-muted mt-0.5">
                Editar essa parcela afeta só ela. Pra parar todas as próximas (mantendo as já pagas), use "Cancelar parcelas futuras".
              </p>
            </div>
            <Button variant="danger" size="sm" onClick={handleCancelRecurrence} loading={cancelingRecurrence}>
              Cancelar parcelas futuras
            </Button>
          </div>
        )}

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-xs text-text-muted font-medium mb-1.5 block">Fornecedor</label>
            <select value={form.supplierId} onChange={(e) => update('supplierId', e.target.value)}
              className="w-full bg-bg-input border border-border rounded-md px-3 py-2 text-sm text-text-strong outline-none">
              <option value="">— sem fornecedor —</option>
              {suppliers.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </div>
          <Input label="Valor (R$)" type="number" value={form.amount} onChange={(v) => update('amount', v)} placeholder="0,00" required />
        </div>

        <div className="grid grid-cols-3 gap-3">
          <Input label="Vencimento" type="date" value={form.dueDate} onChange={(v) => update('dueDate', v)} required />
          <Input label="Previsão pagto" type="date" value={form.paymentForecast} onChange={(v) => update('paymentForecast', v)} />
          <Input label="Emissão" type="date" value={form.emissionDate} onChange={(v) => update('emissionDate', v)} />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <Input label="Nº Nota Fiscal" value={form.invoiceNumber} onChange={(v) => update('invoiceNumber', v)} />
          <div>
            <label className="text-xs text-text-muted font-medium mb-1.5 block">Categoria</label>
            <select value={form.categoryId} onChange={(e) => update('categoryId', e.target.value)}
              className="w-full bg-bg-input border border-border rounded-md px-3 py-2 text-sm text-text-strong outline-none">
              <option value="">— sem categoria —</option>
              {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>
        </div>

        <Input label="Descrição" value={form.description} onChange={(v) => update('description', v)} placeholder="Ex: Aluguel mês 04/2026" />

        {!isEdit && (
          <>
            <div className="text-[10px] uppercase tracking-wider font-semibold text-text-subtle">Avançado (só na criação)</div>
            <div className="bg-bg-elevated border border-border rounded-md p-3 flex flex-col gap-3">
              <label className="flex items-center gap-2 text-xs text-text-strong cursor-pointer">
                <input type="checkbox" checked={form.useRecurrence} onChange={(e) => update('useRecurrence', e.target.checked)} className="accent-brand" />
                <strong>Recorrência</strong> — gera várias ocorrências futuras
              </label>
              {form.useRecurrence && (
                <div className="grid grid-cols-2 gap-3 ml-6">
                  <div>
                    <label className="text-xs text-text-muted block mb-1">Frequência</label>
                    <select value={form.recurrenceFrequency} onChange={(e) => update('recurrenceFrequency', e.target.value)}
                      className="w-full bg-bg-input border border-border rounded-md px-3 py-2 text-sm text-text-strong outline-none">
                      <option value="weekly">Semanal</option>
                      <option value="monthly">Mensal</option>
                      <option value="quarterly">Trimestral</option>
                      <option value="semiannual">Semestral</option>
                      <option value="yearly">Anual</option>
                    </select>
                  </div>
                  <Input label="Quantas ocorrências" type="number" value={form.recurrenceCount} onChange={(v) => update('recurrenceCount', Math.max(1, parseInt(v, 10) || 1))} min="1" />
                </div>
              )}

              <label className="flex items-center gap-2 text-xs text-text-strong cursor-pointer">
                <input type="checkbox" checked={form.useInstallments} onChange={(e) => update('useInstallments', e.target.checked)} className="accent-brand" disabled={form.useRecurrence} />
                <strong>Parcelamento</strong> — divide o valor em N parcelas mensais
              </label>
              {form.useInstallments && (
                <Input label="Nº de parcelas" type="number" value={form.installmentCount} onChange={(v) => update('installmentCount', v)} className="ml-6 max-w-[200px]" />
              )}
            </div>
          </>
        )}
      </div>
    </Modal>
  );
};

// ============ Modal Pagamento ============
const PayModal = ({ item, onClose, onSaved }) => {
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
      const res = await fetch(bpoUrl(`/payables/${item.id}/pay`), {
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
    <Modal open onClose={onClose} title="Registrar pagamento" subtitle={item.description || item.supplier?.name || ''} size="sm"
      footer={<>
        <Button variant="secondary" onClick={onClose}>Cancelar</Button>
        <Button variant="primary" onClick={handleSave} loading={saving}>Confirmar pagamento</Button>
      </>}>
      <div className="flex flex-col gap-4">
        {error && <div className="bg-danger-soft border border-danger/30 rounded-md px-3 py-2 text-xs text-danger">{error}</div>}

        <div className="bg-bg-elevated border border-border rounded-md p-3 flex justify-between items-center">
          <span className="text-xs text-text-muted">Saldo a pagar</span>
          <span className="text-base font-bold text-danger tabular-nums">{fmtBRL(item.remainingAmount)}</span>
        </div>

        <Input label="Valor pago" type="number" value={form.amount} onChange={(v) => setForm({ ...form, amount: v })}
          helper={parseFloat(form.amount) < parseFloat(item.remainingAmount) ? '⚠️ Pagamento parcial — saldo permanece' : ''} required />

        <div>
          <label className="text-xs text-text-muted font-medium mb-1.5 block">Conta bancária *</label>
          <select value={form.bankAccountId} onChange={(e) => setForm({ ...form, bankAccountId: e.target.value })}
            className="w-full bg-bg-input border border-border rounded-md px-3 py-2 text-sm text-text-strong outline-none">
            <option value="">Selecione...</option>
            {bankAccounts.map((b) => <option key={b.id} value={b.id}>{b.bankName} — {b.account}</option>)}
          </select>
        </div>

        <Input label="Data do pagamento" type="date" value={form.paidAt} onChange={(v) => setForm({ ...form, paidAt: v })} />
        <Input label="Observações" value={form.notes} onChange={(v) => setForm({ ...form, notes: v })} />
      </div>
    </Modal>
  );
};

export default PayablesList;
