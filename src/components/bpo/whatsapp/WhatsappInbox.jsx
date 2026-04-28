/**
 * WhatsappInbox — Caixa de entrada de mensagens recebidas via WhatsApp bot
 * Aguarda Z-API. Hoje funciona como stub (testar inserindo via webhook manualmente).
 *
 * Operador BPO vê mensagens não validadas, associa cliente (se necessário) e
 * cria Payable/Receivable a partir do conteúdo.
 */

import { useState, useEffect, useCallback } from 'react';
import { useBpo } from '../../../context/BpoContext';
import { Card, Button, Input, Badge, EmptyState, Modal, useToast, useConfirm } from '../../ui/primitives';

const fmtDateTime = (d) => d ? new Date(d).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : '—';

const WhatsappInbox = () => {
  const toast = useToast();
  const confirm = useConfirm();
  const [items, setItems] = useState([]);
  const [bpoClients, setBpoClients] = useState([]);
  const [loading, setLoading] = useState(false);
  const [validating, setValidating] = useState(null);

  const fetchItems = useCallback(async () => {
    setLoading(true);
    try {
      const [inbox, clients] = await Promise.all([
        fetch('/api/bpo/whatsapp/inbox').then((r) => r.json()),
        fetch('/api/bpo/admin/bpo-clients').then((r) => r.json()),
      ]);
      setItems(inbox.items || []);
      setBpoClients(clients);
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { fetchItems(); }, [fetchItems]);

  const assignClient = async (msgId, clientId) => {
    await fetch(`/api/bpo/whatsapp/messages/${msgId}/assign-client`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ clientId }),
    });
    fetchItems();
  };

  const discard = async (msg) => {
    if (!msg.client?.hash) {
      toast.warning('Associe a um cliente antes de descartar');
      return;
    }
    const ok = await confirm({ title: 'Descartar mensagem?', message: 'A mensagem sai da inbox e não pode ser recuperada.', confirmLabel: 'Descartar', variant: 'danger' });
    if (!ok) return;
    try {
      const res = await fetch(`/api/bpo/${msg.client.hash}/whatsapp/messages/${msg.id}/discard`, { method: 'POST' });
      if (!res.ok) throw new Error('Falha ao descartar');
      toast.success('Mensagem descartada');
      fetchItems();
    } catch (err) { toast.error(err.message); }
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-text-strong">📱 WhatsApp Inbox</h1>
          <p className="text-xs text-text-muted mt-0.5">{items.length} mensagem(ns) pendente(s) de validação.</p>
        </div>
        <Button variant="secondary" onClick={fetchItems}
          icon={<svg width="14" height="14" viewBox="0 0 24 24" fill="none"><path d="M23 4v6h-6M1 20v-6h6" stroke="currentColor" strokeWidth="2"/></svg>}>
          Atualizar
        </Button>
      </div>

      <Card className="bg-info-soft border-info/30">
        <div className="text-xs text-info">
          🔌 <strong>Status:</strong> Endpoint de webhook ativo em <code className="bg-bg-input px-1.5 py-0.5 rounded">POST /api/bpo/webhook/whatsapp</code>.
          Configure o Z-API/Evolution pra apontar pra essa URL. Hoje aceita formato Z-API e Evolution automaticamente.
        </div>
      </Card>

      {loading ? (
        <Card><div className="text-center py-8 text-xs text-text-muted">Carregando...</div></Card>
      ) : items.length === 0 ? (
        <Card><EmptyState
          icon={<svg width="24" height="24" viewBox="0 0 24 24" fill="none"><path d="M21 11.5a8.38 8.38 0 01-.9 3.8 8.5 8.5 0 01-7.6 4.7 8.38 8.38 0 01-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 01-.9-3.8 8.5 8.5 0 014.7-7.6 8.38 8.38 0 013.8-.9h.5a8.48 8.48 0 018 8v.5z" stroke="currentColor" strokeWidth="1.5"/></svg>}
          title="Inbox vazia"
          description="Mensagens recebidas via Z-API aparecem aqui pra validação."
        /></Card>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
          {items.map((msg) => (
            <Card key={msg.id} className="flex flex-col gap-3">
              <div className="flex items-start justify-between gap-2">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-xs font-mono text-text-strong">{msg.fromNumber}</span>
                    {msg.senderName && <Badge variant="default" size="xs">{msg.senderName}</Badge>}
                    <Badge variant={msg.messageType === 'image' ? 'info' : msg.messageType === 'document' ? 'warning' : 'default'} size="xs">
                      {msg.messageType}
                    </Badge>
                  </div>
                  <div className="text-[10px] text-text-subtle">{fmtDateTime(msg.createdAt)}</div>
                </div>
              </div>

              {/* Conteúdo */}
              {msg.textContent && (
                <div className="bg-bg-elevated border border-border rounded-md p-3 text-xs text-text">{msg.textContent}</div>
              )}
              {msg.mediaUrl && (
                <div className="bg-bg-elevated border border-border rounded-md p-3">
                  {msg.messageType === 'image' ? (
                    <img src={msg.mediaUrl} alt="WhatsApp media" className="max-h-40 rounded-md" />
                  ) : (
                    <a href={msg.mediaUrl} target="_blank" rel="noopener noreferrer" className="text-xs text-brand hover:underline">
                      📎 Abrir documento
                    </a>
                  )}
                  {msg.mediaCaption && <div className="text-[10px] text-text-muted mt-2">{msg.mediaCaption}</div>}
                </div>
              )}

              {/* Cliente associado */}
              <div className="flex items-center gap-2">
                <span className="text-xs text-text-muted">Cliente:</span>
                {msg.client ? (
                  <Badge variant="success">{msg.client.name}</Badge>
                ) : (
                  <select value="" onChange={(e) => e.target.value && assignClient(msg.id, e.target.value)}
                    className="text-xs bg-bg-input border border-border rounded px-2 py-1 text-text-strong outline-none flex-1">
                    <option value="">⚠️ Selecione cliente...</option>
                    {bpoClients.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                  </select>
                )}
              </div>

              {/* Ações */}
              <div className="flex gap-2 pt-2 border-t border-border-subtle">
                <Button variant="primary" size="sm" disabled={!msg.client} onClick={() => setValidating(msg)} className="flex-1">
                  ✓ Validar e Criar Lançamento
                </Button>
                <Button variant="ghost" size="sm" disabled={!msg.client} onClick={() => discard(msg)}>Descartar</Button>
              </div>
            </Card>
          ))}
        </div>
      )}

      {validating && <ValidateModal msg={validating} onClose={() => setValidating(null)} onSaved={() => { setValidating(null); fetchItems(); }} />}
    </div>
  );
};

const ValidateModal = ({ msg, onClose, onSaved }) => {
  const [type, setType] = useState('payable');
  const [suppliers, setSuppliers] = useState([]);
  const [categories, setCategories] = useState([]);
  const [paymentMethods, setPaymentMethods] = useState([]);
  const [form, setForm] = useState({
    amount: '', dueDate: new Date().toISOString().slice(0, 10),
    supplierId: '', payerName: msg.senderName || '', categoryId: '', paymentMethodId: '',
    description: msg.textContent || msg.mediaCaption || '',
  });
  const [error, setError] = useState(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const hash = msg.client?.hash;
    if (!hash) return;
    Promise.all([
      fetch(`/api/bpo/${hash}/suppliers`).then((r) => r.json()),
      fetch(`/api/bpo/${hash}/categories?type=${type === 'payable' ? 'despesa' : 'receita'}`).then((r) => r.json()),
      fetch(`/api/bpo/${hash}/payment-methods`).then((r) => r.json()),
    ]).then(([s, c, p]) => {
      setSuppliers(s.items || []);
      setCategories(c.items || []);
      setPaymentMethods(p.items || []);
    });
  }, [msg.client?.hash, type]);

  const handleValidate = async () => {
    setError(null);
    if (!form.amount || !form.dueDate) { setError('Valor e vencimento obrigatórios'); return; }
    setSaving(true);
    try {
      const res = await fetch(`/api/bpo/${msg.client.hash}/whatsapp/messages/${msg.id}/validate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type, ...form }),
      });
      if (!res.ok) throw new Error((await res.json()).error || 'Erro');
      onSaved();
    } catch (err) { setError(err.message); }
    finally { setSaving(false); }
  };

  return (
    <Modal open onClose={onClose} title="Validar Mensagem" subtitle={`De: ${msg.fromNumber} (${msg.client?.name})`} size="lg"
      footer={<>
        <Button variant="secondary" onClick={onClose}>Cancelar</Button>
        <Button variant="primary" onClick={handleValidate} loading={saving}>Validar e Criar</Button>
      </>}>
      <div className="flex flex-col gap-4">
        {error && <div className="bg-danger-soft border border-danger/30 rounded-md px-3 py-2 text-xs text-danger">{error}</div>}

        {/* Preview da mensagem */}
        <div className="bg-bg-elevated border border-border rounded-md p-3">
          <div className="text-[10px] text-text-subtle uppercase tracking-wider mb-2">Mensagem original</div>
          {msg.textContent && <div className="text-xs text-text mb-2">{msg.textContent}</div>}
          {msg.mediaUrl && msg.messageType === 'image' && <img src={msg.mediaUrl} alt="" className="max-h-32 rounded" />}
          {msg.mediaCaption && <div className="text-[10px] text-text-muted mt-2">{msg.mediaCaption}</div>}
        </div>

        {/* Tipo */}
        <div className="flex gap-2">
          <button onClick={() => setType('payable')} className={`flex-1 py-2 rounded-md text-sm font-medium ${type === 'payable' ? 'bg-danger-soft text-danger border border-danger/30' : 'bg-bg-input text-text-muted'}`}>
            🔴 A Pagar
          </button>
          <button onClick={() => setType('receivable')} className={`flex-1 py-2 rounded-md text-sm font-medium ${type === 'receivable' ? 'bg-success-soft text-success border border-success/30' : 'bg-bg-input text-text-muted'}`}>
            🟢 A Receber
          </button>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <Input label="Valor (R$)" type="number" value={form.amount} onChange={(v) => setForm({ ...form, amount: v })} placeholder="0,00" required />
          <Input label="Vencimento" type="date" value={form.dueDate} onChange={(v) => setForm({ ...form, dueDate: v })} required />
        </div>

        {type === 'payable' ? (
          <div>
            <label className="text-xs text-text-muted font-medium mb-1.5 block">Fornecedor</label>
            <select value={form.supplierId} onChange={(e) => setForm({ ...form, supplierId: e.target.value })}
              className="w-full bg-bg-input border border-border rounded-md px-3 py-2 text-sm text-text-strong outline-none">
              <option value="">— sem fornecedor —</option>
              {suppliers.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </div>
        ) : (
          <Input label="Pagador" value={form.payerName} onChange={(v) => setForm({ ...form, payerName: v })} placeholder="Nome do pagador" />
        )}

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-xs text-text-muted font-medium mb-1.5 block">Categoria</label>
            <select value={form.categoryId} onChange={(e) => setForm({ ...form, categoryId: e.target.value })}
              className="w-full bg-bg-input border border-border rounded-md px-3 py-2 text-sm text-text-strong outline-none">
              <option value="">— sem categoria —</option>
              {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>
          {type === 'receivable' && (
            <div>
              <label className="text-xs text-text-muted font-medium mb-1.5 block">Forma pagto</label>
              <select value={form.paymentMethodId} onChange={(e) => setForm({ ...form, paymentMethodId: e.target.value })}
                className="w-full bg-bg-input border border-border rounded-md px-3 py-2 text-sm text-text-strong outline-none">
                <option value="">— sem definir —</option>
                {paymentMethods.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
            </div>
          )}
        </div>

        <Input label="Descrição" value={form.description} onChange={(v) => setForm({ ...form, description: v })} />
      </div>
    </Modal>
  );
};

export default WhatsappInbox;
