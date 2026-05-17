import { useState, useEffect, useCallback } from 'react';
import { useBpo } from '../../../context/BpoContext';
import { Button, Card, Input, Badge, EmptyState, Modal, Table, Th, Td, Tr, ErrorBanner, useToast, useConfirm } from '../../ui/primitives';
import { BRAZILIAN_BANKS } from '../shared/brazilianBanks';

const ROLES = ['Cozinha', 'Salão', 'Administrativo', 'Entrega', 'Outro'];
const fmtCpf = (cpf) => String(cpf || '').replace(/\D/g, '').replace(/^(\d{3})(\d{3})(\d{3})(\d{2})$/, '$1.$2.$3-$4');
const fmtBRL = (n) => Number(n || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

const EmployeesList = () => {
  const { bpoUrl, selectedClient } = useBpo();
  const toast = useToast();
  const confirm = useConfirm();
  const [items, setItems] = useState([]);
  const [error, setError] = useState(null);
  const [search, setSearch] = useState('');
  const [editing, setEditing] = useState(null);

  const fetchItems = useCallback(async () => {
    if (!selectedClient) return;
    setError(null);
    try {
      const url = bpoUrl(`/employees${search ? `?search=${encodeURIComponent(search)}` : ''}`);
      if (!url) return;
      const res = await fetch(url);
      if (!res.ok) throw new Error((await res.json()).error || `Erro ${res.status}`);
      const data = await res.json();
      setItems(data.items || []);
    } catch (err) { setError(err.message); }
  }, [bpoUrl, selectedClient, search]);

  useEffect(() => { fetchItems(); }, [fetchItems]);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-text-strong">Funcionários</h1>
          <p className="text-xs text-text-muted mt-0.5">{items.length} cadastrado{items.length !== 1 ? 's' : ''}</p>
        </div>
        <Button variant="primary" onClick={() => setEditing('new')}
          icon={<svg width="14" height="14" viewBox="0 0 24 24" fill="none"><path d="M12 5v14M5 12h14" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/></svg>}>
          Novo Funcionário
        </Button>
      </div>

      <Card padded={false} className="p-3">
        <Input value={search} onChange={setSearch} placeholder="Buscar por nome ou CPF..."
          icon={<svg width="14" height="14" viewBox="0 0 24 24" fill="none"><circle cx="11" cy="11" r="8" stroke="currentColor" strokeWidth="2"/><path d="M21 21l-4.35-4.35" stroke="currentColor" strokeWidth="2"/></svg>} />
      </Card>

      <ErrorBanner message={error} onRetry={fetchItems} />

      {items.length === 0 ? (
        <Card><EmptyState
          icon={<svg width="24" height="24" viewBox="0 0 24 24" fill="none"><circle cx="12" cy="7" r="4" stroke="currentColor" strokeWidth="1.5"/><path d="M5 21v-2a4 4 0 014-4h6a4 4 0 014 4v2" stroke="currentColor" strokeWidth="1.5"/></svg>}
          title="Nenhum funcionário"
          description="Cadastre funcionários pra registrar pagamentos de salários."
        /></Card>
      ) : (
        <>
          {/* DESKTOP — tabela */}
          <div className="hidden md:block">
            <Table>
              <thead><tr>
                <Th>Nome</Th><Th>CPF</Th><Th>Cargo</Th><Th>Tipo</Th>
                <Th align="right">Salário</Th><Th align="right">Ações</Th>
              </tr></thead>
              <tbody>
                {items.map((e) => (
                  <Tr key={e.id} onClick={() => setEditing(e)}>
                    <Td className="font-medium text-text-strong">{e.name}</Td>
                    <Td className="font-mono text-xs">{fmtCpf(e.cpf)}</Td>
                    <Td>{e.role}</Td>
                    <Td>
                      {e.isMotoboy && <Badge variant="info" size="xs">Motoboy</Badge>}
                      {e.isFreelancer && <Badge variant="warning" size="xs">Freela</Badge>}
                      {!e.isMotoboy && !e.isFreelancer && <Badge variant="default" size="xs">CLT</Badge>}
                    </Td>
                    <Td align="right" className="font-semibold tabular-nums">{e.baseSalary ? fmtBRL(e.baseSalary) : '—'}</Td>
                    <Td align="right">
                      <button onClick={async (ev) => {
                        ev.stopPropagation();
                        const ok = await confirm({ title: 'Excluir funcionário?', message: `${e.name} será removido do cadastro.`, confirmLabel: 'Excluir', variant: 'danger' });
                        if (!ok) return;
                        try {
                          const res = await fetch(bpoUrl(`/employees/${e.id}`), { method: 'DELETE' });
                          if (!res.ok) throw new Error((await res.json()).error || 'Falha');
                          toast.success(`${e.name} excluído`);
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
            {items.map((e) => (
              <Card key={e.id} padded={false} hoverable className="p-3 flex flex-col gap-2.5" onClick={() => setEditing(e)}>
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="font-medium text-sm text-text-strong truncate">{e.name}</div>
                    <div className="text-xs font-mono text-text-muted truncate">{fmtCpf(e.cpf)}</div>
                  </div>
                  {e.isMotoboy
                    ? <Badge variant="info" size="xs">Motoboy</Badge>
                    : e.isFreelancer
                      ? <Badge variant="warning" size="xs">Freela</Badge>
                      : <Badge variant="default" size="xs">CLT</Badge>}
                </div>
                <div className="flex items-end justify-between gap-2">
                  <span className="text-xs text-text-muted truncate">{e.role}</span>
                  <span className="font-semibold text-sm tabular-nums text-text-strong shrink-0">{e.baseSalary ? fmtBRL(e.baseSalary) : '—'}</span>
                </div>
                <div className="flex justify-end pt-1 border-t border-border-subtle">
                  <Button variant="secondary" size="sm" onClick={async (ev) => {
                    ev.stopPropagation();
                    const ok = await confirm({ title: 'Excluir funcionário?', message: `${e.name} será removido do cadastro.`, confirmLabel: 'Excluir', variant: 'danger' });
                    if (!ok) return;
                    try {
                      const res = await fetch(bpoUrl(`/employees/${e.id}`), { method: 'DELETE' });
                      if (!res.ok) throw new Error((await res.json()).error || 'Falha');
                      toast.success(`${e.name} excluído`);
                      fetchItems();
                    } catch (err) { toast.error(err.message); }
                  }}>Excluir</Button>
                </div>
              </Card>
            ))}
          </div>
        </>
      )}

      {editing && <EmployeeModal item={editing === 'new' ? null : editing} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); fetchItems(); }} />}
    </div>
  );
};

const EmployeeModal = ({ item, onClose, onSaved }) => {
  const { bpoUrl } = useBpo();
  const isEdit = !!item;
  const [form, setForm] = useState({
    name: item?.name || '', cpf: item?.cpf || '', email: item?.email || '', phone: item?.phone || '',
    role: item?.role || 'Cozinha', isFreelancer: item?.isFreelancer || false, isMotoboy: item?.isMotoboy || false,
    baseSalary: item?.baseSalary || '', commissionPct: item?.commissionPct || '',
    tipsAmount: item?.tipsAmount || '', overtimeAmount: item?.overtimeAmount || '',
    bankCode: item?.bankCode || '', agency: item?.agency || '', account: item?.account || '', pixKey: item?.pixKey || '',
    hiredAt: item?.hiredAt ? new Date(item.hiredAt).toISOString().slice(0, 10) : '',
  });
  const [error, setError] = useState(null);
  const [saving, setSaving] = useState(false);

  const update = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  const handleSave = async () => {
    setError(null);
    if (!form.name.trim() || !form.cpf.trim()) { setError('Nome e CPF obrigatórios'); return; }
    setSaving(true);
    try {
      const url = isEdit ? bpoUrl(`/employees/${item.id}`) : bpoUrl('/employees');
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
    <Modal open onClose={onClose} title={isEdit ? 'Editar funcionário' : 'Novo funcionário'} size="lg"
      footer={<>
        <Button variant="secondary" onClick={onClose}>Cancelar</Button>
        <Button variant="primary" onClick={handleSave} loading={saving}>{isEdit ? 'Salvar' : 'Criar'}</Button>
      </>}>
      <div className="flex flex-col gap-4">
        {error && <div className="bg-danger-soft border border-danger/30 rounded-md px-3 py-2 text-xs text-danger">{error}</div>}

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Input label="Nome" value={form.name} onChange={(v) => update('name', v)} required />
          <Input label="CPF" value={form.cpf} onChange={(v) => update('cpf', v)} placeholder="000.000.000-00" required />
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Input label="Email" value={form.email} onChange={(v) => update('email', v)} type="email" />
          <Input label="Telefone" value={form.phone} onChange={(v) => update('phone', v)} />
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className="text-xs text-text-muted font-medium mb-1.5 block">Cargo *</label>
            <select value={form.role} onChange={(e) => update('role', e.target.value)}
              className="w-full bg-bg-input border border-border rounded-md px-3 py-2 text-sm text-text-strong outline-none">
              {ROLES.map((r) => <option key={r} value={r}>{r}</option>)}
            </select>
          </div>
          <Input label="Data admissão" type="date" value={form.hiredAt} onChange={(v) => update('hiredAt', v)} />
        </div>

        <div className="flex gap-4">
          <label className="flex items-center gap-2 text-xs text-text-muted cursor-pointer">
            <input type="checkbox" checked={form.isFreelancer} onChange={(e) => update('isFreelancer', e.target.checked)} className="accent-brand" />
            Freelancer
          </label>
          <label className="flex items-center gap-2 text-xs text-text-muted cursor-pointer">
            <input type="checkbox" checked={form.isMotoboy} onChange={(e) => update('isMotoboy', e.target.checked)} className="accent-brand" />
            Motoboy
          </label>
        </div>

        <div className="text-[10px] uppercase tracking-wider font-semibold text-text-subtle">Remuneração</div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <Input label="Salário base" type="number" value={form.baseSalary} onChange={(v) => update('baseSalary', v)} placeholder="0,00" />
          <Input label="Comissão %" type="number" value={form.commissionPct} onChange={(v) => update('commissionPct', v)} placeholder="0" />
          <Input label="Gorjetas" type="number" value={form.tipsAmount} onChange={(v) => update('tipsAmount', v)} placeholder="0,00" />
          <Input label="Hora extra" type="number" value={form.overtimeAmount} onChange={(v) => update('overtimeAmount', v)} placeholder="0,00" />
        </div>

        <div className="text-[10px] uppercase tracking-wider font-semibold text-text-subtle">Dados bancários (pra pagamento)</div>
        <Input label="Chave PIX" value={form.pixKey} onChange={(v) => update('pixKey', v)} placeholder="CPF, email, telefone ou aleatória" />
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div>
            <label className="text-xs text-text-muted font-medium mb-1.5 block">Banco</label>
            <select value={form.bankCode} onChange={(e) => update('bankCode', e.target.value)}
              className="w-full bg-bg-input border border-border rounded-md px-3 py-2 text-sm text-text-strong outline-none">
              <option value="">—</option>
              {BRAZILIAN_BANKS.map((b) => <option key={b.code} value={b.code}>{b.code} {b.name}</option>)}
            </select>
          </div>
          <Input label="Agência" value={form.agency} onChange={(v) => update('agency', v)} />
          <Input label="Conta" value={form.account} onChange={(v) => update('account', v)} />
        </div>
      </div>
    </Modal>
  );
};

export default EmployeesList;
