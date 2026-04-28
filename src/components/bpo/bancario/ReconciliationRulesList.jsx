/**
 * ReconciliationRulesList — CRUD de regras de conciliação automática
 * Quando uma transação bancária bate uma regra, sistema sugere o vínculo automaticamente.
 */

import { useState, useEffect, useCallback } from 'react';
import { useBpo } from '../../../context/BpoContext';
import { Card, Button, Input, Badge, EmptyState, Modal, Table, Th, Td, Tr, useToast, useConfirm } from '../../ui/primitives';

const MATCH_TYPE_LABEL = {
  contains: 'Contém',
  starts: 'Começa com',
  exact: 'Igual',
  regex: 'Regex',
};

const ReconciliationRulesList = () => {
  const { bpoUrl, selectedClient } = useBpo();
  const toast = useToast();
  const confirm = useConfirm();
  const [items, setItems] = useState([]);
  const [editing, setEditing] = useState(null);

  const fetchItems = useCallback(async () => {
    if (!selectedClient) return;
    const res = await fetch(bpoUrl('/reconciliation/rules'));
    const d = await res.json();
    setItems(d.items || []);
  }, [bpoUrl, selectedClient]);

  useEffect(() => { fetchItems(); }, [fetchItems]);

  const handleDelete = async (id) => {
    const ok = await confirm({ title: 'Excluir regra?', message: 'A regra de conciliação será removida.', confirmLabel: 'Excluir', variant: 'danger' });
    if (!ok) return;
    try {
      const res = await fetch(bpoUrl(`/reconciliation/rules/${id}`), { method: 'DELETE' });
      if (!res.ok) throw new Error('Falha ao excluir');
      toast.success('Regra excluída');
      fetchItems();
    } catch (err) { toast.error(err.message); }
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-text-strong">Regras de Conciliação</h1>
          <p className="text-xs text-text-muted mt-0.5">Quando uma transação bate a palavra-chave, sistema sugere o match automaticamente.</p>
        </div>
        <Button variant="primary" onClick={() => setEditing('new')}
          icon={<svg width="14" height="14" viewBox="0 0 24 24" fill="none"><path d="M12 5v14M5 12h14" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/></svg>}>
          Nova Regra
        </Button>
      </div>

      <Card className="bg-info-soft border-info/30">
        <div className="text-xs text-info">
          💡 <strong>Como funciona:</strong> Defina palavras-chave que aparecem na descrição do extrato bancário (ex: "DISTRIBUIDORA ABC", "TARIFA DE CONTA").
          Quando uma transação bate, o sistema marca em verde como match automático na tela de conciliação.
        </div>
      </Card>

      {items.length === 0 ? (
        <Card><EmptyState
          icon={<svg width="24" height="24" viewBox="0 0 24 24" fill="none"><path d="M3 6h18M6 12h12M9 18h6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/></svg>}
          title="Nenhuma regra cadastrada"
          description='Crie regras pra automatizar conciliação.'
        /></Card>
      ) : (
        <Table>
          <thead><tr>
            <Th>Palavra-chave</Th><Th>Tipo</Th><Th>Vincular a</Th>
            <Th>Status</Th><Th align="right">Ações</Th>
          </tr></thead>
          <tbody>
            {items.map((r) => (
              <Tr key={r.id}>
                <Td className="font-mono text-xs">{r.keyword}</Td>
                <Td><Badge variant="default">{MATCH_TYPE_LABEL[r.matchType] || r.matchType}</Badge></Td>
                <Td className="text-xs text-text-muted">
                  {r.supplierId && '→ Fornecedor'}
                  {r.payerName && `→ ${r.payerName}`}
                  {r.categoryId && ' + Categoria'}
                  {r.bankAccountId && ' + Conta'}
                  {!r.supplierId && !r.payerName && !r.categoryId && !r.bankAccountId && '—'}
                </Td>
                <Td><Badge variant={r.active ? 'success' : 'default'}>{r.active ? 'Ativa' : 'Inativa'}</Badge></Td>
                <Td align="right">
                  <button onClick={() => handleDelete(r.id)} className="text-xs text-text-muted hover:text-danger">Excluir</button>
                </Td>
              </Tr>
            ))}
          </tbody>
        </Table>
      )}

      {editing && <RuleModal onClose={() => setEditing(null)} onSaved={() => { setEditing(null); fetchItems(); }} />}
    </div>
  );
};

const RuleModal = ({ onClose, onSaved }) => {
  const { bpoUrl } = useBpo();
  const [suppliers, setSuppliers] = useState([]);
  const [categories, setCategories] = useState([]);
  const [accounts, setAccounts] = useState([]);
  const [form, setForm] = useState({
    keyword: '', matchType: 'contains',
    supplierId: '', payerName: '', categoryId: '', bankAccountId: '',
  });
  const [error, setError] = useState(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    Promise.all([
      fetch(bpoUrl('/suppliers')).then((r) => r.json()),
      fetch(bpoUrl('/categories')).then((r) => r.json()),
      fetch(bpoUrl('/bank-accounts')).then((r) => r.json()),
    ]).then(([s, c, b]) => {
      setSuppliers(s.items || []);
      setCategories(c.items || []);
      setAccounts(b.items || []);
    });
  }, [bpoUrl]);

  const handleSave = async () => {
    setError(null);
    if (!form.keyword.trim()) { setError('Palavra-chave obrigatória'); return; }
    setSaving(true);
    try {
      const res = await fetch(bpoUrl('/reconciliation/rules'), {
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
    <Modal open onClose={onClose} title="Nova Regra de Conciliação" size="md"
      footer={<>
        <Button variant="secondary" onClick={onClose}>Cancelar</Button>
        <Button variant="primary" onClick={handleSave} loading={saving}>Criar</Button>
      </>}>
      <div className="flex flex-col gap-4">
        {error && <div className="bg-danger-soft border border-danger/30 rounded-md px-3 py-2 text-xs text-danger">{error}</div>}

        <div className="grid grid-cols-[1fr_140px] gap-3">
          <Input label="Palavra-chave" value={form.keyword} onChange={(v) => setForm({ ...form, keyword: v })} placeholder='Ex: "DIST ABC"' required />
          <div>
            <label className="text-xs text-text-muted font-medium mb-1.5 block">Tipo de match</label>
            <select value={form.matchType} onChange={(e) => setForm({ ...form, matchType: e.target.value })}
              className="w-full bg-bg-input border border-border rounded-md px-3 py-2 text-sm text-text-strong outline-none">
              {Object.entries(MATCH_TYPE_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
          </div>
        </div>

        <div className="text-[10px] uppercase tracking-wider text-text-subtle font-semibold">Vincular a (opcional — pelo menos um)</div>

        <div>
          <label className="text-xs text-text-muted font-medium mb-1.5 block">Fornecedor</label>
          <select value={form.supplierId} onChange={(e) => setForm({ ...form, supplierId: e.target.value })}
            className="w-full bg-bg-input border border-border rounded-md px-3 py-2 text-sm text-text-strong outline-none">
            <option value="">— sem —</option>
            {suppliers.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
        </div>

        <div>
          <label className="text-xs text-text-muted font-medium mb-1.5 block">Categoria</label>
          <select value={form.categoryId} onChange={(e) => setForm({ ...form, categoryId: e.target.value })}
            className="w-full bg-bg-input border border-border rounded-md px-3 py-2 text-sm text-text-strong outline-none">
            <option value="">— sem —</option>
            {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </div>

        <div>
          <label className="text-xs text-text-muted font-medium mb-1.5 block">Conta bancária</label>
          <select value={form.bankAccountId} onChange={(e) => setForm({ ...form, bankAccountId: e.target.value })}
            className="w-full bg-bg-input border border-border rounded-md px-3 py-2 text-sm text-text-strong outline-none">
            <option value="">— sem —</option>
            {accounts.map((a) => <option key={a.id} value={a.id}>{a.bankName} {a.account}</option>)}
          </select>
        </div>

        <Input label="Pagador (texto livre)" value={form.payerName} onChange={(v) => setForm({ ...form, payerName: v })} placeholder='Ex: "iFood Pagamentos"' helper="Pra contas a receber sem cadastro de fornecedor" />
      </div>
    </Modal>
  );
};

export default ReconciliationRulesList;
