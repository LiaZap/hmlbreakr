import { useState, useEffect, useCallback } from 'react';
import { useBpo } from '../../../context/BpoContext';
import { Button, Card, Input, Badge, EmptyState, Modal, Table, Th, Td, Tr, ErrorBanner, useToast } from '../../ui/primitives';

const fmtCpf = (cpf) => String(cpf || '').replace(/\D/g, '').replace(/^(\d{3})(\d{3})(\d{3})(\d{2})$/, '$1.$2.$3-$4');
const fmtBRL = (n) => Number(n || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

const PartnersList = () => {
  const { bpoUrl, selectedClient } = useBpo();
  const toast = useToast();
  const [items, setItems] = useState([]);
  const [error, setError] = useState(null);
  const [totalProlabore, setTotalProlabore] = useState(0);
  const [editing, setEditing] = useState(null);

  const fetchItems = useCallback(async () => {
    if (!selectedClient) return;
    setError(null);
    try {
      const url = bpoUrl('/partners');
      if (!url) return;
      const res = await fetch(url);
      if (!res.ok) throw new Error((await res.json()).error || `Erro ${res.status}`);
      const data = await res.json();
      setItems(data.items || []);
      setTotalProlabore(data.totalProlabore || 0);
    } catch (err) { setError(err.message); }
  }, [bpoUrl, selectedClient]);

  useEffect(() => { fetchItems(); }, [fetchItems]);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-text-strong">Sócios</h1>
          <p className="text-xs text-text-muted mt-0.5">
            Total pró-labore mensal: <span className="text-brand font-semibold">{fmtBRL(totalProlabore)}</span>
          </p>
        </div>
        <Button variant="primary" onClick={() => setEditing('new')}
          icon={<svg width="14" height="14" viewBox="0 0 24 24" fill="none"><path d="M12 5v14M5 12h14" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/></svg>}>
          Novo Sócio
        </Button>
      </div>

      <div className="bg-warning-soft border border-warning/30 rounded-md px-3 py-2 text-xs text-warning">
        ⚠️ <strong>Regra Retirada de Capital:</strong> após atingir o pró-labore mensal informado, pagamentos extras pro CPF do sócio serão lançados como "Retirada de Capital" automaticamente.
      </div>

      <ErrorBanner message={error} onRetry={fetchItems} />

      {items.length === 0 ? (
        <Card><EmptyState
          icon={<svg width="24" height="24" viewBox="0 0 24 24" fill="none"><path d="M16 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2M9 11a4 4 0 100-8 4 4 0 000 8z" stroke="currentColor" strokeWidth="1.5"/></svg>}
          title="Nenhum sócio cadastrado"
          description="Cadastre os sócios pra registrar pró-labore e retiradas."
        /></Card>
      ) : (
        <Table>
          <thead><tr>
            <Th>Nome</Th><Th>CPF</Th><Th>Contato</Th>
            <Th align="right">Pró-Labore</Th><Th align="right">Ações</Th>
          </tr></thead>
          <tbody>
            {items.map((p) => (
              <Tr key={p.id} onClick={() => setEditing(p)}>
                <Td className="font-medium text-text-strong">{p.name}</Td>
                <Td className="font-mono text-xs">{fmtCpf(p.cpf)}</Td>
                <Td className="text-xs text-text-muted">{p.email || p.phone || '—'}</Td>
                <Td align="right" className="font-semibold tabular-nums">{fmtBRL(p.prolaboreAmount)}</Td>
                <Td align="right">
                  <button onClick={async (e) => {
                    e.stopPropagation();
                    if (confirm(`Excluir sócio "${p.name}"?`)) { await fetch(bpoUrl(`/partners/${p.id}`), { method: 'DELETE' }); fetchItems(); }
                  }} className="text-xs text-text-muted hover:text-danger">Excluir</button>
                </Td>
              </Tr>
            ))}
          </tbody>
        </Table>
      )}

      {editing && <PartnerModal item={editing === 'new' ? null : editing} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); fetchItems(); }} />}
    </div>
  );
};

const PartnerModal = ({ item, onClose, onSaved }) => {
  const { bpoUrl } = useBpo();
  const isEdit = !!item;
  const [form, setForm] = useState({
    name: item?.name || '', cpf: item?.cpf || '', email: item?.email || '', phone: item?.phone || '',
    prolaboreAmount: item?.prolaboreAmount || '',
    personalAccountBank: item?.personalAccountBank || '',
    personalAccountAgency: item?.personalAccountAgency || '',
    personalAccountNumber: item?.personalAccountNumber || '',
  });
  const [error, setError] = useState(null);
  const [saving, setSaving] = useState(false);

  const update = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  const handleSave = async () => {
    setError(null);
    if (!form.name.trim() || !form.cpf.trim()) { setError('Nome e CPF obrigatórios'); return; }
    setSaving(true);
    try {
      const url = isEdit ? bpoUrl(`/partners/${item.id}`) : bpoUrl('/partners');
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
    <Modal open onClose={onClose} title={isEdit ? 'Editar sócio' : 'Novo sócio'} size="md"
      footer={<>
        <Button variant="secondary" onClick={onClose}>Cancelar</Button>
        <Button variant="primary" onClick={handleSave} loading={saving}>{isEdit ? 'Salvar' : 'Criar'}</Button>
      </>}>
      <div className="flex flex-col gap-4">
        {error && <div className="bg-danger-soft border border-danger/30 rounded-md px-3 py-2 text-xs text-danger">{error}</div>}

        <div className="grid grid-cols-2 gap-3">
          <Input label="Nome" value={form.name} onChange={(v) => update('name', v)} required />
          <Input label="CPF" value={form.cpf} onChange={(v) => update('cpf', v)} placeholder="000.000.000-00" required />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <Input label="Email" value={form.email} onChange={(v) => update('email', v)} type="email" />
          <Input label="Telefone" value={form.phone} onChange={(v) => update('phone', v)} />
        </div>

        <Input label="Pró-Labore Mensal (R$)" type="number" value={form.prolaboreAmount} onChange={(v) => update('prolaboreAmount', v)} placeholder="0,00" required helper="Valor fixo recebido todo mês como pró-labore" />

        <div className="text-[10px] uppercase tracking-wider font-semibold text-text-subtle">Conta corrente pessoal (pra controle de retiradas)</div>
        <div className="grid grid-cols-3 gap-3">
          <Input label="Banco" value={form.personalAccountBank} onChange={(v) => update('personalAccountBank', v)} />
          <Input label="Agência" value={form.personalAccountAgency} onChange={(v) => update('personalAccountAgency', v)} />
          <Input label="Conta" value={form.personalAccountNumber} onChange={(v) => update('personalAccountNumber', v)} />
        </div>
      </div>
    </Modal>
  );
};

export default PartnersList;
