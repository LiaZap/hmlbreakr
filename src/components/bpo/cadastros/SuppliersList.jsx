/**
 * SuppliersList — Cadastro de Fornecedores (BPO V2.0)
 * Template ponta-a-ponta. Replicar pra BankAccounts, Categories, Employees, Partners, PaymentMethods.
 */

import { useState, useEffect, useCallback } from 'react';
import { useBpo } from '../../../context/BpoContext';
import { Button, Card, Input, Badge, EmptyState, Modal, Table, Th, Td, Tr, useToast, useConfirm } from '../../ui/primitives';

const fmtCnpj = (cnpj) => {
  const c = String(cnpj || '').replace(/\D/g, '');
  if (c.length !== 14) return cnpj;
  return c.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, '$1.$2.$3/$4-$5');
};

const SuppliersList = () => {
  const { bpoUrl, selectedClient } = useBpo();
  const toast = useToast();
  const confirm = useConfirm();
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState('');
  const [editing, setEditing] = useState(null); // null | 'new' | supplier object
  const [error, setError] = useState(null);

  const fetchSuppliers = useCallback(async () => {
    if (!selectedClient) return;
    setLoading(true);
    setError(null);
    try {
      const url = bpoUrl(`/suppliers${search ? `?search=${encodeURIComponent(search)}` : ''}`);
      if (!url) throw new Error('Cliente não selecionado');
      const res = await fetch(url);
      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error || `Erro ${res.status}`);
      }
      const data = await res.json();
      setItems(data.items || []);
    } catch (err) {
      console.error('[SuppliersList]', err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [bpoUrl, search, selectedClient]);

  useEffect(() => {
    fetchSuppliers();
  }, [fetchSuppliers]);

  const handleDelete = async (supplier) => {
    const ok = await confirm({ title: 'Excluir fornecedor?', message: `"${supplier.name}" será removido. Lançamentos vinculados ficam preservados.`, confirmLabel: 'Excluir', variant: 'danger' });
    if (!ok) return;
    try {
      const res = await fetch(bpoUrl(`/suppliers/${supplier.id}`), { method: 'DELETE' });
      if (!res.ok) {
        const err = await res.json();
        toast.error(err.error || 'Erro ao excluir');
        return;
      }
      toast.success(`Fornecedor "${supplier.name}" excluído`);
      fetchSuppliers();
    } catch (err) {
      toast.error('Erro ao excluir: ' + err.message);
    }
  };

  return (
    <div className="flex flex-col gap-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-text-strong">Fornecedores</h1>
          <p className="text-xs text-text-muted mt-0.5">Cadastro de fornecedores do cliente — vincula contas a pagar e dados bancários.</p>
        </div>
        <Button
          variant="primary"
          onClick={() => setEditing('new')}
          icon={<svg width="14" height="14" viewBox="0 0 24 24" fill="none"><path d="M12 5v14M5 12h14" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/></svg>}
        >
          Novo Fornecedor
        </Button>
      </div>

      {/* Search bar */}
      <Card padded={false} className="p-3">
        <Input
          value={search}
          onChange={setSearch}
          placeholder="Buscar por nome ou CNPJ..."
          icon={<svg width="14" height="14" viewBox="0 0 24 24" fill="none"><circle cx="11" cy="11" r="8" stroke="currentColor" strokeWidth="2"/><path d="M21 21l-4.35-4.35" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/></svg>}
        />
      </Card>

      {error && (
        <div className="bg-danger-soft border border-danger/30 rounded-md px-3 py-2 text-xs text-danger flex items-center gap-2">
          <span>⚠️</span>
          <span className="flex-1">{error}</span>
          <button onClick={fetchSuppliers} className="text-xs font-semibold text-danger hover:underline">Tentar de novo</button>
        </div>
      )}

      {/* Lista */}
      {loading ? (
        <Card>
          <div className="text-center py-8 text-xs text-text-muted">Carregando...</div>
        </Card>
      ) : items.length === 0 ? (
        <Card>
          <EmptyState
            icon={<svg width="24" height="24" viewBox="0 0 24 24" fill="none"><path d="M16 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2M9 11a4 4 0 100-8 4 4 0 000 8z" stroke="currentColor" strokeWidth="1.5"/></svg>}
            title={search ? 'Nenhum fornecedor encontrado' : 'Nenhum fornecedor cadastrado'}
            description={search ? 'Tente outro termo de busca.' : 'Clique em "Novo Fornecedor" pra começar.'}
          />
        </Card>
      ) : (
        <>
          {/* DESKTOP — tabela */}
          <div className="hidden md:block">
            <Table>
              <thead>
                <tr>
                  <Th>Nome</Th>
                  <Th>CNPJ</Th>
                  <Th>Contato</Th>
                  <Th>Categoria padrão</Th>
                  <Th align="right">Contas a pagar</Th>
                  <Th align="right">Ações</Th>
                </tr>
              </thead>
              <tbody>
                {items.map((s) => (
                  <Tr key={s.id} onClick={() => setEditing(s)}>
                    <Td className="font-medium text-text-strong">{s.name}</Td>
                    <Td className="font-mono text-xs">{fmtCnpj(s.cnpj)}</Td>
                    <Td className="text-xs text-text-muted">{s.email || s.phone || '—'}</Td>
                    <Td>
                      {s.defaultCategory ? (
                        <Badge variant="default">{s.defaultCategory.name}</Badge>
                      ) : <span className="text-xs text-text-subtle">—</span>}
                    </Td>
                    <Td align="right" className="text-xs">
                      {s._count?.payables > 0 ? (
                        <Badge variant="brand">{s._count.payables}</Badge>
                      ) : '—'}
                    </Td>
                    <Td align="right">
                      <button
                        onClick={(e) => { e.stopPropagation(); handleDelete(s); }}
                        className="text-xs text-text-muted hover:text-danger transition-colors"
                      >
                        Excluir
                      </button>
                    </Td>
                  </Tr>
                ))}
              </tbody>
            </Table>
          </div>

          {/* MOBILE — cards */}
          <div className="md:hidden flex flex-col gap-2">
            {items.map((s) => (
              <Card key={s.id} padded={false} hoverable className="p-3 flex flex-col gap-2.5" onClick={() => setEditing(s)}>
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="font-medium text-sm text-text-strong truncate">{s.name}</div>
                    <div className="text-xs font-mono text-text-muted truncate">{fmtCnpj(s.cnpj)}</div>
                  </div>
                  {s._count?.payables > 0 && <Badge variant="brand">{s._count.payables} contas</Badge>}
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-xs text-text-muted truncate">{s.email || s.phone || 'Sem contato'}</span>
                  {s.defaultCategory && <Badge variant="default">{s.defaultCategory.name}</Badge>}
                </div>
                <div className="flex justify-end pt-1 border-t border-border-subtle">
                  <Button variant="secondary" size="sm" onClick={(e) => { e.stopPropagation(); handleDelete(s); }}>Excluir</Button>
                </div>
              </Card>
            ))}
          </div>
        </>
      )}

      {/* Modal CRUD */}
      {editing && (
        <SupplierModal
          supplier={editing === 'new' ? null : editing}
          onClose={() => setEditing(null)}
          onSaved={() => { setEditing(null); fetchSuppliers(); }}
        />
      )}
    </div>
  );
};

// ============================================================================
// SupplierModal — formulário de criar/editar
// ============================================================================

const SupplierModal = ({ supplier, onClose, onSaved }) => {
  const { bpoUrl } = useBpo();
  const isEdit = !!supplier;

  const [form, setForm] = useState({
    cnpj: supplier?.cnpj || '',
    name: supplier?.name || '',
    email: supplier?.email || '',
    phone: supplier?.phone || '',
    pixKey: supplier?.pixKey || '',
    bankCode: supplier?.bankCode || '',
    agency: supplier?.agency || '',
    account: supplier?.account || '',
    notes: supplier?.notes || '',
  });
  const [error, setError] = useState(null);
  const [saving, setSaving] = useState(false);

  const update = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  const handleSave = async () => {
    setError(null);
    if (!form.name.trim() || !form.cnpj.trim()) {
      setError('Nome e CNPJ são obrigatórios');
      return;
    }
    setSaving(true);
    try {
      const url = isEdit ? bpoUrl(`/suppliers/${supplier.id}`) : bpoUrl('/suppliers');
      const method = isEdit ? 'PUT' : 'POST';
      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || 'Erro ao salvar');
      }
      onSaved();
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      open
      onClose={onClose}
      title={isEdit ? `Editar fornecedor` : 'Novo fornecedor'}
      subtitle={isEdit ? supplier?.name : 'Preencha os dados abaixo'}
      size="lg"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>Cancelar</Button>
          <Button variant="primary" onClick={handleSave} loading={saving}>
            {isEdit ? 'Salvar alterações' : 'Criar fornecedor'}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        {error && (
          <div className="bg-danger-soft border border-danger/30 rounded-md px-3 py-2 text-xs text-danger">
            {error}
          </div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <Input
            label="Nome / Razão social"
            value={form.name}
            onChange={(v) => update('name', v)}
            placeholder="Ex: Distribuidora ABC LTDA"
            required
          />
          <Input
            label="CNPJ"
            value={form.cnpj}
            onChange={(v) => update('cnpj', v)}
            placeholder="00.000.000/0000-00"
            required
            helper="Apenas números ou formatado"
          />
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <Input
            label="Email"
            value={form.email}
            onChange={(v) => update('email', v)}
            placeholder="contato@fornecedor.com"
            type="email"
          />
          <Input
            label="Telefone"
            value={form.phone}
            onChange={(v) => update('phone', v)}
            placeholder="(00) 00000-0000"
          />
        </div>

        <div className="text-[10px] uppercase tracking-wider font-semibold text-text-subtle mt-2">Dados bancários</div>

        <Input
          label="Chave PIX"
          value={form.pixKey}
          onChange={(v) => update('pixKey', v)}
          placeholder="CNPJ, email, telefone ou aleatória"
          helper="Pra pagamentos via PIX automático"
        />

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <Input label="Banco" value={form.bankCode} onChange={(v) => update('bankCode', v)} placeholder="237" />
          <Input label="Agência" value={form.agency} onChange={(v) => update('agency', v)} placeholder="0001" />
          <Input label="Conta" value={form.account} onChange={(v) => update('account', v)} placeholder="12345-6" />
        </div>

        <Input
          label="Observações"
          value={form.notes}
          onChange={(v) => update('notes', v)}
          placeholder="Notas internas, condições especiais..."
        />
      </div>
    </Modal>
  );
};

export default SuppliersList;
