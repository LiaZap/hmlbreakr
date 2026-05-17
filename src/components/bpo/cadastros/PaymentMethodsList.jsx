import { useState, useEffect, useCallback } from 'react';
import { useBpo } from '../../../context/BpoContext';
import { Button, Card, Input, Badge, EmptyState, Modal, Table, Th, Td, Tr, ErrorBanner, useToast, useConfirm } from '../../ui/primitives';

const TYPES = [
  { id: 'marketplace', label: 'Marketplace (iFood, Aiqfome)' },
  { id: 'card_credit', label: 'Cartão de Crédito' },
  { id: 'card_debit', label: 'Cartão de Débito' },
  { id: 'pix', label: 'PIX' },
  { id: 'cash', label: 'Dinheiro' },
  { id: 'transfer', label: 'Transferência' },
];

const TEMPLATES = [
  { name: 'iFood', type: 'marketplace', feePercent: 27, settlementDays: 30 },
  { name: 'Aiqfome', type: 'marketplace', feePercent: 22, settlementDays: 14 },
  { name: 'Crédito (média)', type: 'card_credit', feePercent: 3.5, settlementDays: 30 },
  { name: 'Débito', type: 'card_debit', feePercent: 1.5, settlementDays: 1 },
  { name: 'PIX', type: 'pix', feePercent: 0, settlementDays: 0 },
  { name: 'Dinheiro', type: 'cash', feePercent: 0, settlementDays: 0 },
];

const PaymentMethodsList = () => {
  const { bpoUrl, selectedClient } = useBpo();
  const toast = useToast();
  const confirm = useConfirm();
  const [items, setItems] = useState([]);
  const [error, setError] = useState(null);
  const [editing, setEditing] = useState(null);

  const fetchItems = useCallback(async () => {
    if (!selectedClient) return;
    setError(null);
    try {
      const url = bpoUrl('/payment-methods');
      if (!url) return;
      const res = await fetch(url);
      if (!res.ok) throw new Error((await res.json()).error || `Erro ${res.status}`);
      const data = await res.json();
      setItems(data.items || []);
    } catch (err) { setError(err.message); }
  }, [bpoUrl, selectedClient]);

  useEffect(() => { fetchItems(); }, [fetchItems]);

  const seedDefaults = async () => {
    const ok = await confirm({ title: 'Criar meios padrão?', message: 'Vai cadastrar 6 meios: iFood, Aiqfome, Crédito, Débito, PIX, Dinheiro.', confirmLabel: 'Criar 6 meios', variant: 'primary' });
    if (!ok) return;
    try {
      for (const t of TEMPLATES) {
        await fetch(bpoUrl('/payment-methods'), {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(t),
        });
      }
      toast.success('6 meios padrão criados');
      fetchItems();
    } catch (err) { toast.error(err.message); }
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-text-strong">Meios de Pagamento</h1>
          <p className="text-xs text-text-muted mt-0.5">Define taxa % e dias de repasse pra cálculo de receita líquida.</p>
        </div>
        <div className="flex gap-2">
          {items.length === 0 && (
            <Button variant="secondary" onClick={seedDefaults}>Criar padrão</Button>
          )}
          <Button variant="primary" onClick={() => setEditing('new')}
            icon={<svg width="14" height="14" viewBox="0 0 24 24" fill="none"><path d="M12 5v14M5 12h14" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/></svg>}>
            Novo
          </Button>
        </div>
      </div>

      <ErrorBanner message={error} onRetry={fetchItems} />

      {items.length === 0 ? (
        <Card><EmptyState
          icon={<svg width="24" height="24" viewBox="0 0 24 24" fill="none"><rect x="2" y="6" width="20" height="14" rx="2" stroke="currentColor" strokeWidth="1.5"/><path d="M2 11h20M6 16h2" stroke="currentColor" strokeWidth="1.5"/></svg>}
          title="Nenhum meio de pagamento"
          description='Use "Criar padrão" pra adicionar os 6 mais comuns ou crie manualmente.'
        /></Card>
      ) : (
        <>
          {/* DESKTOP — tabela */}
          <div className="hidden md:block">
            <Table>
              <thead><tr>
                <Th>Nome</Th><Th>Tipo</Th>
                <Th align="right">Taxa</Th><Th align="right">Repasse</Th><Th align="right">Recebimentos</Th><Th align="right">Ações</Th>
              </tr></thead>
              <tbody>
                {items.map((p) => (
                  <Tr key={p.id} onClick={() => setEditing(p)}>
                    <Td className="font-medium text-text-strong">{p.name}</Td>
                    <Td><Badge variant="default">{TYPES.find((t) => t.id === p.type)?.label || p.type}</Badge></Td>
                    <Td align="right" className="font-semibold tabular-nums">{Number(p.feePercent).toFixed(2)}%</Td>
                    <Td align="right" className="text-xs">{p.settlementDays} dia{p.settlementDays !== 1 ? 's' : ''}</Td>
                    <Td align="right" className="text-xs text-text-muted">{p._count?.receivables || 0}</Td>
                    <Td align="right">
                      <button onClick={async (e) => {
                        e.stopPropagation();
                        const ok = await confirm({ title: 'Excluir meio de pagamento?', message: `"${p.name}" será removido.`, confirmLabel: 'Excluir', variant: 'danger' });
                        if (!ok) return;
                        try {
                          const res = await fetch(bpoUrl(`/payment-methods/${p.id}`), { method: 'DELETE' });
                          if (!res.ok) throw new Error((await res.json()).error || 'Falha');
                          toast.success(`"${p.name}" excluído`);
                          fetchItems();
                        } catch (err) { toast.error(err.message); }
                      }} className="text-xs text-text-muted hover:text-danger">Excluir</button>
                    </Td>
                  </Tr>
                ))}
              </tbody>
            </Table>
          </div>

          {/* MOBILE — cards */}
          <div className="md:hidden flex flex-col gap-2">
            {items.map((p) => (
              <Card key={p.id} padded={false} hoverable className="p-3 flex flex-col gap-2.5" onClick={() => setEditing(p)}>
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="font-medium text-sm text-text-strong truncate">{p.name}</div>
                    <div className="text-xs text-text-muted truncate">{TYPES.find((t) => t.id === p.type)?.label || p.type}</div>
                  </div>
                  <div className="text-right shrink-0">
                    <div className="font-semibold text-sm tabular-nums text-text-strong">{Number(p.feePercent).toFixed(2)}%</div>
                    <div className="text-[11px] text-text-muted">{p.settlementDays} dia{p.settlementDays !== 1 ? 's' : ''} repasse</div>
                  </div>
                </div>
                <div className="flex items-center justify-between gap-2 pt-1 border-t border-border-subtle">
                  <span className="text-xs text-text-muted">{p._count?.receivables || 0} recebimentos</span>
                  <Button variant="secondary" size="sm" onClick={async (e) => {
                    e.stopPropagation();
                    const ok = await confirm({ title: 'Excluir meio de pagamento?', message: `"${p.name}" será removido.`, confirmLabel: 'Excluir', variant: 'danger' });
                    if (!ok) return;
                    try {
                      const res = await fetch(bpoUrl(`/payment-methods/${p.id}`), { method: 'DELETE' });
                      if (!res.ok) throw new Error((await res.json()).error || 'Falha');
                      toast.success(`"${p.name}" excluído`);
                      fetchItems();
                    } catch (err) { toast.error(err.message); }
                  }}>Excluir</Button>
                </div>
              </Card>
            ))}
          </div>
        </>
      )}

      {editing && <PaymentMethodModal item={editing === 'new' ? null : editing} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); fetchItems(); }} />}
    </div>
  );
};

const PaymentMethodModal = ({ item, onClose, onSaved }) => {
  const { bpoUrl } = useBpo();
  const isEdit = !!item;
  const [form, setForm] = useState({
    name: item?.name || '', type: item?.type || 'marketplace',
    feePercent: item?.feePercent || 0, settlementDays: item?.settlementDays || 0,
  });
  const [error, setError] = useState(null);
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    setError(null);
    if (!form.name.trim()) { setError('Nome obrigatório'); return; }
    setSaving(true);
    try {
      const url = isEdit ? bpoUrl(`/payment-methods/${item.id}`) : bpoUrl('/payment-methods');
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
    <Modal open onClose={onClose} title={isEdit ? 'Editar meio' : 'Novo meio de pagamento'} size="sm"
      footer={<>
        <Button variant="secondary" onClick={onClose}>Cancelar</Button>
        <Button variant="primary" onClick={handleSave} loading={saving}>{isEdit ? 'Salvar' : 'Criar'}</Button>
      </>}>
      <div className="flex flex-col gap-4">
        {error && <div className="bg-danger-soft border border-danger/30 rounded-md px-3 py-2 text-xs text-danger">{error}</div>}

        <Input label="Nome" value={form.name} onChange={(v) => setForm({ ...form, name: v })} placeholder="Ex: iFood, Stone Crédito..." required />

        <div>
          <label className="text-xs text-text-muted font-medium mb-1.5 block">Tipo *</label>
          <select value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })}
            className="w-full bg-bg-input border border-border rounded-md px-3 py-2 text-sm text-text-strong outline-none">
            {TYPES.map((t) => <option key={t.id} value={t.id}>{t.label}</option>)}
          </select>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Input label="Taxa (%)" type="number" value={form.feePercent} onChange={(v) => setForm({ ...form, feePercent: v })} placeholder="0" helper="% sobre o valor da venda" />
          <Input label="Dias de repasse" type="number" value={form.settlementDays} onChange={(v) => setForm({ ...form, settlementDays: v })} placeholder="0" helper="Quantos dias até receber" />
        </div>
      </div>
    </Modal>
  );
};

export default PaymentMethodsList;
