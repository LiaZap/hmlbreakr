import { useState, useEffect, useCallback } from 'react';
import { useBpo } from '../../../context/BpoContext';
import { Button, Card, Input, Badge, EmptyState, Modal, Table, Th, Td, Tr } from '../../ui/primitives';
import { BRAZILIAN_BANKS, findBank } from '../shared/brazilianBanks';

const fmtBRL = (n) => Number(n || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

const BankAccountsList = () => {
  const { bpoUrl, selectedClient } = useBpo();
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(false);
  const [editing, setEditing] = useState(null);

  const fetchItems = useCallback(async () => {
    if (!selectedClient) return;
    setLoading(true);
    try {
      const res = await fetch(bpoUrl('/bank-accounts'));
      const data = await res.json();
      setItems(data.items || []);
    } catch (err) { console.error(err); }
    finally { setLoading(false); }
  }, [bpoUrl, selectedClient]);

  useEffect(() => { fetchItems(); }, [fetchItems]);

  const handleDelete = async (item) => {
    if (!confirm(`Excluir conta "${item.bankName}"?`)) return;
    await fetch(bpoUrl(`/bank-accounts/${item.id}`), { method: 'DELETE' });
    fetchItems();
  };

  const totalBalance = items.reduce((s, i) => s + Number(i.currentBalance || 0), 0);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-text-strong">Contas Bancárias</h1>
          <p className="text-xs text-text-muted mt-0.5">Saldo total disponível: <span className="text-brand font-semibold">{fmtBRL(totalBalance)}</span></p>
        </div>
        <Button variant="primary" onClick={() => setEditing('new')}
          icon={<svg width="14" height="14" viewBox="0 0 24 24" fill="none"><path d="M12 5v14M5 12h14" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/></svg>}>
          Nova Conta
        </Button>
      </div>

      {loading ? (
        <Card><div className="text-center py-8 text-xs text-text-muted">Carregando...</div></Card>
      ) : items.length === 0 ? (
        <Card>
          <EmptyState
            icon={<svg width="24" height="24" viewBox="0 0 24 24" fill="none"><path d="M3 21h18M3 10h18M5 6l7-3 7 3M4 10v11M20 10v11" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/></svg>}
            title="Nenhuma conta cadastrada"
            description="Adicione contas bancárias pra registrar pagamentos e recebimentos."
          />
        </Card>
      ) : (
        <Table>
          <thead><tr>
            <Th>Banco</Th><Th>Agência / Conta</Th><Th>Tipo</Th>
            <Th align="right">Saldo</Th><Th align="right">Movimentos</Th><Th align="right">Ações</Th>
          </tr></thead>
          <tbody>
            {items.map((b) => (
              <Tr key={b.id} onClick={() => setEditing(b)}>
                <Td>
                  <div className="flex items-center gap-2">
                    <div className="w-8 h-8 rounded-md bg-bg-input flex items-center justify-center text-xs font-bold text-text-strong">
                      {b.bankCode}
                    </div>
                    <div>
                      <div className="font-medium text-text-strong">{b.bankName}</div>
                      {b.openFinanceConnected && <Badge variant="success" size="xs">Open Finance</Badge>}
                    </div>
                  </div>
                </Td>
                <Td className="font-mono text-xs">{b.agency} / {b.account}</Td>
                <Td><Badge variant="default">{b.type}</Badge></Td>
                <Td align="right" className="font-semibold tabular-nums">{fmtBRL(b.currentBalance)}</Td>
                <Td align="right" className="text-xs text-text-muted">{b._count?.payments || 0}</Td>
                <Td align="right">
                  <button onClick={(e) => { e.stopPropagation(); handleDelete(b); }} className="text-xs text-text-muted hover:text-danger">Excluir</button>
                </Td>
              </Tr>
            ))}
          </tbody>
        </Table>
      )}

      {editing && (
        <BankAccountModal
          item={editing === 'new' ? null : editing}
          onClose={() => setEditing(null)}
          onSaved={() => { setEditing(null); fetchItems(); }}
        />
      )}
    </div>
  );
};

const BankAccountModal = ({ item, onClose, onSaved }) => {
  const { bpoUrl } = useBpo();
  const isEdit = !!item;
  const [form, setForm] = useState({
    bankCode: item?.bankCode || '',
    bankName: item?.bankName || '',
    agency: item?.agency || '',
    account: item?.account || '',
    type: item?.type || 'corrente',
    currentBalance: item?.currentBalance || 0,
  });
  const [error, setError] = useState(null);
  const [saving, setSaving] = useState(false);

  const handleBankChange = (code) => {
    const bank = findBank(code);
    setForm((f) => ({ ...f, bankCode: code, bankName: bank?.name || f.bankName }));
  };

  const handleSave = async () => {
    setError(null);
    if (!form.bankCode || !form.agency || !form.account) {
      setError('Banco, agência e conta são obrigatórios');
      return;
    }
    setSaving(true);
    try {
      const url = isEdit ? bpoUrl(`/bank-accounts/${item.id}`) : bpoUrl('/bank-accounts');
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
    <Modal open onClose={onClose} title={isEdit ? 'Editar conta' : 'Nova conta bancária'} size="md"
      footer={<>
        <Button variant="secondary" onClick={onClose}>Cancelar</Button>
        <Button variant="primary" onClick={handleSave} loading={saving}>{isEdit ? 'Salvar' : 'Criar'}</Button>
      </>}>
      <div className="flex flex-col gap-4">
        {error && <div className="bg-danger-soft border border-danger/30 rounded-md px-3 py-2 text-xs text-danger">{error}</div>}

        <div>
          <label className="text-xs text-text-muted font-medium mb-1.5 block">Banco *</label>
          <select value={form.bankCode} onChange={(e) => handleBankChange(e.target.value)}
            className="w-full bg-bg-input border border-border rounded-md px-3 py-2 text-sm text-text-strong outline-none focus:border-border-focus">
            <option value="">Selecione...</option>
            {BRAZILIAN_BANKS.map((b) => <option key={b.code} value={b.code}>{b.code} — {b.name}</option>)}
          </select>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <Input label="Agência" value={form.agency} onChange={(v) => setForm({ ...form, agency: v })} placeholder="0001" required />
          <Input label="Conta" value={form.account} onChange={(v) => setForm({ ...form, account: v })} placeholder="12345-6" required />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-xs text-text-muted font-medium mb-1.5 block">Tipo</label>
            <select value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })}
              className="w-full bg-bg-input border border-border rounded-md px-3 py-2 text-sm text-text-strong outline-none">
              <option value="corrente">Conta Corrente</option>
              <option value="poupanca">Poupança</option>
              <option value="pagamento">Conta de Pagamento</option>
            </select>
          </div>
          <Input label="Saldo atual" type="number" value={form.currentBalance} onChange={(v) => setForm({ ...form, currentBalance: v })} placeholder="0,00" />
        </div>
      </div>
    </Modal>
  );
};

export default BankAccountsList;
