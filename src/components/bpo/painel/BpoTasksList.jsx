/**
 * BpoTasksList — Lista de tarefas pendentes do operador BPO (multi-cliente)
 * Filtros por status/severity/cliente + ações (resolver/dispensar/iniciar).
 */

import { useState, useEffect, useCallback } from 'react';
import { Card, Button, Badge, EmptyState, Table, Th, Td, Tr, Modal, Input } from '../../ui/primitives';

const fmtDate = (d) => d ? new Date(d).toLocaleDateString('pt-BR') : '—';
const fmtDateTime = (d) => d ? new Date(d).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : '—';

const SEVERITY_LABEL = {
  critical: { label: 'Crítica', variant: 'danger' },
  high: { label: 'Alta', variant: 'warning' },
  normal: { label: 'Normal', variant: 'info' },
  low: { label: 'Baixa', variant: 'default' },
};

const TYPE_LABEL = {
  overdue_payable: 'Conta vencida',
  overdue_receivable: 'A receber atrasado',
  unconciliated_tx: 'Pra conciliar',
  whatsapp_pending: 'WhatsApp pendente',
  manual: 'Manual',
};

const STATUS_LABEL = {
  open: { label: 'Aberta', variant: 'default' },
  in_progress: { label: 'Em andamento', variant: 'info' },
  resolved: { label: 'Resolvida', variant: 'success' },
  dismissed: { label: 'Dispensada', variant: 'default' },
};

const BpoTasksList = () => {
  const [items, setItems] = useState([]);
  const [summary, setSummary] = useState({});
  const [filterStatus, setFilterStatus] = useState('open');
  const [filterSeverity, setFilterSeverity] = useState('');
  const [filterType, setFilterType] = useState('');
  const [loading, setLoading] = useState(false);
  const [creating, setCreating] = useState(false);

  const fetchItems = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (filterStatus) params.append('status', filterStatus);
      if (filterSeverity) params.append('severity', filterSeverity);
      if (filterType) params.append('type', filterType);
      const res = await fetch(`/api/bpo/tasks?${params}`);
      const data = await res.json();
      setItems(data.items || []);
      setSummary(data.summary || {});
    } finally { setLoading(false); }
  }, [filterStatus, filterSeverity, filterType]);

  useEffect(() => { fetchItems(); }, [fetchItems]);

  // Backend exige clientId no body pra validar o tenant da task (anti-IDOR).
  const action = async (task, what) => {
    await fetch(`/api/bpo/tasks/${task.id}/${what}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ clientId: task.clientId }),
    });
    fetchItems();
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-text-strong">Tarefas BPO</h1>
          <p className="text-xs text-text-muted mt-0.5">Pendências do operador BPO em todos os clientes.</p>
        </div>
        <Button variant="primary" onClick={() => setCreating(true)}
          icon={<svg width="14" height="14" viewBox="0 0 24 24" fill="none"><path d="M12 5v14M5 12h14" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/></svg>}>
          Nova Tarefa Manual
        </Button>
      </div>

      {/* Summary cards por status */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {['open', 'in_progress', 'resolved', 'dismissed'].map((s) => (
          <Card key={s} className={`cursor-pointer ${filterStatus === s ? 'border-brand' : ''}`}>
            <div onClick={() => setFilterStatus(s)}>
              <div className="text-[10px] uppercase tracking-wider text-text-muted">{STATUS_LABEL[s]?.label || s}</div>
              <div className="text-2xl font-bold text-text-strong tabular-nums">{summary[s] || 0}</div>
            </div>
          </Card>
        ))}
      </div>

      {/* Filtros adicionais */}
      <Card padded={false} className="p-3 flex gap-3 flex-wrap">
        <select value={filterSeverity} onChange={(e) => setFilterSeverity(e.target.value)}
          className="bg-bg-input border border-border rounded-md px-3 py-1.5 text-sm text-text-strong outline-none">
          <option value="">Todas severidades</option>
          {Object.entries(SEVERITY_LABEL).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
        </select>
        <select value={filterType} onChange={(e) => setFilterType(e.target.value)}
          className="bg-bg-input border border-border rounded-md px-3 py-1.5 text-sm text-text-strong outline-none">
          <option value="">Todos tipos</option>
          {Object.entries(TYPE_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
        <button onClick={() => { setFilterStatus('open'); setFilterSeverity(''); setFilterType(''); }}
          className="text-xs text-text-muted hover:text-brand px-2">Limpar filtros</button>
      </Card>

      {loading ? (
        <Card><div className="text-center py-8 text-xs text-text-muted">Carregando...</div></Card>
      ) : items.length === 0 ? (
        <Card><EmptyState
          icon={<svg width="24" height="24" viewBox="0 0 24 24" fill="none"><path d="M9 11l3 3L22 4M21 12v7a2 2 0 01-2 2H5a2 2 0 01-2-2V5a2 2 0 012-2h11" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/></svg>}
          title="Nenhuma tarefa neste filtro"
          description="Tarefas são criadas automaticamente pelo scan ou manualmente."
        /></Card>
      ) : (
        <Table>
          <thead><tr>
            <Th>Severidade</Th><Th>Cliente</Th><Th>Tipo</Th><Th>Título</Th>
            <Th>Vencimento</Th><Th>Status</Th><Th align="right">Ações</Th>
          </tr></thead>
          <tbody>
            {items.map((t) => (
              <Tr key={t.id}>
                <Td><Badge variant={SEVERITY_LABEL[t.severity]?.variant || 'default'}>{SEVERITY_LABEL[t.severity]?.label || t.severity}</Badge></Td>
                <Td className="text-xs font-medium">{t.client?.name || '—'}</Td>
                <Td className="text-xs text-text-muted">{TYPE_LABEL[t.type] || t.type}</Td>
                <Td>
                  <div className="font-medium text-text-strong">{t.title}</div>
                  {t.description && <div className="text-[10px] text-text-subtle mt-0.5">{t.description}</div>}
                </Td>
                <Td className="text-xs">{fmtDate(t.dueAt)}</Td>
                <Td><Badge variant={STATUS_LABEL[t.status]?.variant || 'default'}>{STATUS_LABEL[t.status]?.label}</Badge></Td>
                <Td align="right">
                  {t.status === 'open' && (
                    <div className="flex gap-1 justify-end">
                      <Button variant="link" size="sm" onClick={() => action(t, 'start')}>Iniciar</Button>
                      <Button variant="link" size="sm" onClick={() => action(t, 'resolve')}>Resolver</Button>
                      <button onClick={() => action(t, 'dismiss')} className="text-xs text-text-muted hover:text-danger">Dispensar</button>
                    </div>
                  )}
                  {t.status === 'in_progress' && (
                    <Button variant="link" size="sm" onClick={() => action(t, 'resolve')}>Resolver</Button>
                  )}
                </Td>
              </Tr>
            ))}
          </tbody>
        </Table>
      )}

      {creating && <CreateTaskModal onClose={() => setCreating(false)} onSaved={() => { setCreating(false); fetchItems(); }} />}
    </div>
  );
};

const CreateTaskModal = ({ onClose, onSaved }) => {
  const [bpoClients, setBpoClients] = useState([]);
  const [form, setForm] = useState({
    clientId: '', title: '', description: '', severity: 'normal', dueAt: '', assignedTo: '',
  });
  const [error, setError] = useState(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetch('/api/bpo/admin/bpo-clients').then((r) => r.json()).then(setBpoClients);
  }, []);

  const handleSave = async () => {
    setError(null);
    if (!form.clientId || !form.title) { setError('Cliente e título obrigatórios'); return; }
    setSaving(true);
    try {
      const res = await fetch('/api/bpo/tasks', {
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
    <Modal open onClose={onClose} title="Nova Tarefa Manual" size="md"
      footer={<>
        <Button variant="secondary" onClick={onClose}>Cancelar</Button>
        <Button variant="primary" onClick={handleSave} loading={saving}>Criar</Button>
      </>}>
      <div className="flex flex-col gap-4">
        {error && <div className="bg-danger-soft border border-danger/30 rounded-md px-3 py-2 text-xs text-danger">{error}</div>}

        <div>
          <label className="text-xs text-text-muted font-medium mb-1.5 block">Cliente *</label>
          <select value={form.clientId} onChange={(e) => setForm({ ...form, clientId: e.target.value })}
            className="w-full bg-bg-input border border-border rounded-md px-3 py-2 text-sm text-text-strong outline-none">
            <option value="">Selecione...</option>
            {bpoClients.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </div>

        <Input label="Título *" value={form.title} onChange={(v) => setForm({ ...form, title: v })} placeholder="Ex: Confirmar pagamento de aluguel" required />

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-xs text-text-muted font-medium mb-1.5 block">Severidade</label>
            <select value={form.severity} onChange={(e) => setForm({ ...form, severity: e.target.value })}
              className="w-full bg-bg-input border border-border rounded-md px-3 py-2 text-sm text-text-strong outline-none">
              {Object.entries(SEVERITY_LABEL).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
            </select>
          </div>
          <Input label="Vencimento" type="date" value={form.dueAt} onChange={(v) => setForm({ ...form, dueAt: v })} />
        </div>

        <Input label="Descrição" value={form.description} onChange={(v) => setForm({ ...form, description: v })} />
        <Input label="Atribuir a (email)" value={form.assignedTo} onChange={(v) => setForm({ ...form, assignedTo: v })} placeholder="opcional" />
      </div>
    </Modal>
  );
};

export default BpoTasksList;
