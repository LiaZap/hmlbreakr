/**
 * PendingApprovalsList — Pagamentos aguardando aprovação do dono do restaurante
 * Aparece SÓ pro cliente (não pro operador BPO).
 */

import { useState, useEffect, useCallback } from 'react';
import { useBpo } from '../../../context/BpoContext';
import { Card, Button, Badge, EmptyState, Modal, Input, Table, Th, Td, Tr } from '../../ui/primitives';

const fmtBRL = (n) => Number(n || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const fmtDate = (d) => d ? new Date(d).toLocaleDateString('pt-BR') : '—';

const PendingApprovalsList = () => {
  const { bpoUrl, selectedClient } = useBpo();
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(false);
  const [rejecting, setRejecting] = useState(null);

  const fetchItems = useCallback(async () => {
    if (!selectedClient) return;
    const url = bpoUrl('/payables/pending-approval');
    if (!url) return;
    setLoading(true);
    try {
      const res = await fetch(url);
      const data = await res.json();
      setItems(data.items || []);
    } catch (err) {
      console.error('[PendingApprovals]', err);
    } finally { setLoading(false); }
  }, [bpoUrl, selectedClient]);

  useEffect(() => { fetchItems(); }, [fetchItems]);

  const handleApprove = async (id) => {
    if (!confirm('Aprovar esse pagamento? O banco vai processar conforme agendado.')) return;
    try {
      const res = await fetch(bpoUrl(`/payables/${id}/approve`), { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' });
      if (!res.ok) throw new Error('Falha ao aprovar');
      fetchItems();
    } catch (err) { alert(err.message); }
  };

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="text-xl font-bold text-text-strong">Pagamentos Aguardando Aprovação</h1>
        <p className="text-xs text-text-muted mt-0.5">
          Pagamentos que o BPO programou no banco e precisam da sua confirmação antes de serem executados.
        </p>
      </div>

      {loading ? (
        <Card><div className="text-center py-8 text-xs text-text-muted">Carregando...</div></Card>
      ) : items.length === 0 ? (
        <Card><EmptyState
          icon={<svg width="24" height="24" viewBox="0 0 24 24" fill="none"><path d="M5 13l4 4L19 7" stroke="currentColor" strokeWidth="2"/></svg>}
          title="Nada pra aprovar"
          description="Quando o BPO programar pagamentos novos, eles aparecem aqui pra você confirmar."
        /></Card>
      ) : (
        <Table>
          <thead><tr>
            <Th>Vencimento</Th><Th>Fornecedor</Th><Th>Descrição</Th><Th>Categoria</Th>
            <Th align="right">Valor</Th><Th align="right">Ações</Th>
          </tr></thead>
          <tbody>
            {items.map((p) => (
              <Tr key={p.id}>
                <Td>{fmtDate(p.scheduledAt || p.dueDate)}</Td>
                <Td className="font-medium">{p.supplier?.name || '—'}</Td>
                <Td className="text-xs text-text-muted">{p.description || p.invoiceNumber || '—'}</Td>
                <Td>{p.category ? <Badge variant="default">{p.category.name}</Badge> : '—'}</Td>
                <Td align="right" className="font-semibold tabular-nums">{fmtBRL(p.amount)}</Td>
                <Td align="right">
                  <div className="flex gap-2 justify-end">
                    <Button variant="primary" size="sm" onClick={() => handleApprove(p.id)}>✓ Aprovar</Button>
                    <Button variant="ghost" size="sm" onClick={() => setRejecting(p)}>Rejeitar</Button>
                  </div>
                </Td>
              </Tr>
            ))}
          </tbody>
        </Table>
      )}

      {rejecting && <RejectModal item={rejecting} onClose={() => setRejecting(null)} onSaved={() => { setRejecting(null); fetchItems(); }} />}
    </div>
  );
};

const RejectModal = ({ item, onClose, onSaved }) => {
  const { bpoUrl } = useBpo();
  const [reason, setReason] = useState('');
  const [saving, setSaving] = useState(false);

  const handleReject = async () => {
    setSaving(true);
    try {
      await fetch(bpoUrl(`/payables/${item.id}/reject`), {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reason }),
      });
      onSaved();
    } catch (err) { alert(err.message); }
    finally { setSaving(false); }
  };

  return (
    <Modal open onClose={onClose} title="Rejeitar pagamento" subtitle={item.supplier?.name || item.description} size="sm"
      footer={<>
        <Button variant="secondary" onClick={onClose}>Cancelar</Button>
        <Button variant="danger" onClick={handleReject} loading={saving}>Confirmar rejeição</Button>
      </>}>
      <div className="flex flex-col gap-3">
        <p className="text-xs text-text-muted">
          Conta volta pro status pendente. O BPO vai precisar agendar de novo.
        </p>
        <Input label="Motivo (visível pro BPO)" value={reason} onChange={setReason} placeholder="Ex: Valor divergente, fornecedor errado, ..." />
      </div>
    </Modal>
  );
};

export default PendingApprovalsList;
