import { useState, useEffect, useCallback } from 'react';
import { useBpo } from '../../../context/BpoContext';
import { Button, Card, Input, Badge, EmptyState, Modal, Table, Th, Td, Tr, ErrorBanner, useToast, useConfirm } from '../../ui/primitives';

const DRE_GROUPS = [
  { id: 'cmv', label: 'CMV' },
  { id: 'despesa_op', label: 'Despesa Operacional' },
  { id: 'taxa_venda', label: 'Taxa de Venda' },
  { id: 'imposto', label: 'Imposto' },
  { id: 'pro_labore', label: 'Pró-Labore' },
  { id: 'receita', label: 'Receita' },
  { id: 'outros', label: 'Outros' },
];

const CategoriesList = () => {
  const { bpoUrl, selectedClient } = useBpo();
  const toast = useToast();
  const confirm = useConfirm();
  const [items, setItems] = useState([]);
  const [error, setError] = useState(null);
  const [filterType, setFilterType] = useState('all');
  const [editing, setEditing] = useState(null);

  const fetchItems = useCallback(async () => {
    if (!selectedClient) return;
    setError(null);
    try {
      const url = bpoUrl(`/categories${filterType !== 'all' ? `?type=${filterType}` : ''}`);
      if (!url) return;
      const res = await fetch(url);
      if (!res.ok) throw new Error((await res.json()).error || `Erro ${res.status}`);
      const data = await res.json();
      setItems(data.items || []);
    } catch (err) { setError(err.message); }
  }, [bpoUrl, selectedClient, filterType]);

  useEffect(() => { fetchItems(); }, [fetchItems]);

  const handleDelete = async (item) => {
    const ok = await confirm({ title: 'Excluir categoria?', message: `A categoria "${item.name}" será removida.`, confirmLabel: 'Excluir', variant: 'danger' });
    if (!ok) return;
    try {
      const res = await fetch(bpoUrl(`/categories/${item.id}`), { method: 'DELETE' });
      if (!res.ok) throw new Error((await res.json()).error || 'Falha');
      toast.success(`Categoria "${item.name}" excluída`);
      fetchItems();
    } catch (err) { toast.error(err.message); }
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-text-strong">Categorias Financeiras</h1>
          <p className="text-xs text-text-muted mt-0.5">Organize receitas e despesas pra gerar DRE preciso.</p>
        </div>
        <Button variant="primary" onClick={() => setEditing('new')}
          icon={<svg width="14" height="14" viewBox="0 0 24 24" fill="none"><path d="M12 5v14M5 12h14" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/></svg>}>
          Nova Categoria
        </Button>
      </div>

      {/* Filtro tipo */}
      <Card padded={false} className="p-3 flex gap-2">
        {[{ id: 'all', label: 'Todas' }, { id: 'receita', label: 'Receitas' }, { id: 'despesa', label: 'Despesas' }].map((t) => (
          <button key={t.id} onClick={() => setFilterType(t.id)}
            className={`text-xs font-medium px-3 py-1.5 rounded-md transition-colors ${filterType === t.id ? 'bg-brand text-black' : 'bg-bg-input text-text-muted hover:text-text-strong'}`}>
            {t.label}
          </button>
        ))}
      </Card>

      <ErrorBanner message={error} onRetry={fetchItems} />

      {items.length === 0 ? (
        <Card>
          <EmptyState
            icon={<svg width="24" height="24" viewBox="0 0 24 24" fill="none"><path d="M3 9h18M3 15h18M9 3v18M15 3v18" stroke="currentColor" strokeWidth="1.5"/></svg>}
            title="Nenhuma categoria"
            description="Crie categorias pra classificar lançamentos."
          />
        </Card>
      ) : (
        <>
          {/* DESKTOP — tabela */}
          <div className="hidden md:block">
            <Table>
              <thead><tr>
                <Th>Nome</Th><Th>Tipo</Th><Th>Grupo DRE</Th><Th align="right">Lançamentos</Th><Th align="right">Ações</Th>
              </tr></thead>
              <tbody>
                {items.map((c) => (
                  <Tr key={c.id} onClick={() => setEditing(c)}>
                    <Td>
                      <div className="flex items-center gap-2">
                        {c.color && <div className="w-3 h-3 rounded-full" style={{ background: c.color }} />}
                        <span className="font-medium text-text-strong">{c.name}</span>
                      </div>
                    </Td>
                    <Td><Badge variant={c.type === 'receita' ? 'success' : 'warning'}>{c.type}</Badge></Td>
                    <Td className="text-xs text-text-muted">{DRE_GROUPS.find((g) => g.id === c.dreGroup)?.label || '—'}</Td>
                    <Td align="right" className="text-xs">{(c._count?.payables || 0) + (c._count?.receivables || 0)}</Td>
                    <Td align="right">
                      <button onClick={(e) => { e.stopPropagation(); handleDelete(c); }} className="text-xs text-text-muted hover:text-danger">Excluir</button>
                    </Td>
                  </Tr>
                ))}
              </tbody>
            </Table>
          </div>

          {/* MOBILE — cards */}
          <div className="md:hidden flex flex-col gap-2">
            {items.map((c) => (
              <Card key={c.id} padded={false} hoverable className="p-3 flex flex-col gap-2.5" onClick={() => setEditing(c)}>
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-2 min-w-0">
                    {c.color && <div className="w-3 h-3 rounded-full shrink-0" style={{ background: c.color }} />}
                    <span className="font-medium text-sm text-text-strong truncate">{c.name}</span>
                  </div>
                  <Badge variant={c.type === 'receita' ? 'success' : 'warning'}>{c.type}</Badge>
                </div>
                <div className="flex items-center justify-between gap-2 text-xs text-text-muted">
                  <span className="truncate">DRE: {DRE_GROUPS.find((g) => g.id === c.dreGroup)?.label || '—'}</span>
                  <span className="shrink-0">{(c._count?.payables || 0) + (c._count?.receivables || 0)} lanç.</span>
                </div>
                <div className="flex justify-end pt-1 border-t border-border-subtle">
                  <Button variant="secondary" size="sm" onClick={(e) => { e.stopPropagation(); handleDelete(c); }}>Excluir</Button>
                </div>
              </Card>
            ))}
          </div>
        </>
      )}

      {editing && (
        <CategoryModal item={editing === 'new' ? null : editing} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); fetchItems(); }} />
      )}
    </div>
  );
};

const CategoryModal = ({ item, onClose, onSaved }) => {
  const { bpoUrl } = useBpo();
  const isEdit = !!item;
  const [form, setForm] = useState({
    name: item?.name || '',
    type: item?.type || 'despesa',
    dreGroup: item?.dreGroup || '',
    color: item?.color || '#F5A623',
  });
  const [error, setError] = useState(null);
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    setError(null);
    if (!form.name.trim()) { setError('Nome obrigatório'); return; }
    setSaving(true);
    try {
      const url = isEdit ? bpoUrl(`/categories/${item.id}`) : bpoUrl('/categories');
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
    <Modal open onClose={onClose} title={isEdit ? 'Editar categoria' : 'Nova categoria'} size="sm"
      footer={<>
        <Button variant="secondary" onClick={onClose}>Cancelar</Button>
        <Button variant="primary" onClick={handleSave} loading={saving}>{isEdit ? 'Salvar' : 'Criar'}</Button>
      </>}>
      <div className="flex flex-col gap-4">
        {error && <div className="bg-danger-soft border border-danger/30 rounded-md px-3 py-2 text-xs text-danger">{error}</div>}

        <Input label="Nome da categoria" value={form.name} onChange={(v) => setForm({ ...form, name: v })} placeholder="Ex: Aluguel, Vendas Cartão..." required />

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className="text-xs text-text-muted font-medium mb-1.5 block">Tipo *</label>
            <select value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })}
              className="w-full bg-bg-input border border-border rounded-md px-3 py-2 text-sm text-text-strong outline-none">
              <option value="despesa">Despesa</option>
              <option value="receita">Receita</option>
            </select>
          </div>
          <div>
            <label className="text-xs text-text-muted font-medium mb-1.5 block">Cor</label>
            <input type="color" value={form.color} onChange={(e) => setForm({ ...form, color: e.target.value })}
              className="w-full h-10 bg-bg-input border border-border rounded-md cursor-pointer" />
          </div>
        </div>

        <div>
          <label className="text-xs text-text-muted font-medium mb-1.5 block">Grupo no DRE (opcional)</label>
          <select value={form.dreGroup} onChange={(e) => setForm({ ...form, dreGroup: e.target.value })}
            className="w-full bg-bg-input border border-border rounded-md px-3 py-2 text-sm text-text-strong outline-none">
            <option value="">— sem grupo —</option>
            {DRE_GROUPS.map((g) => <option key={g.id} value={g.id}>{g.label}</option>)}
          </select>
          <span className="text-xs text-text-subtle mt-1">Define onde a categoria aparece no DRE.</span>
        </div>
      </div>
    </Modal>
  );
};

export default CategoriesList;
