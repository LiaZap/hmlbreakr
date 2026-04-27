/**
 * BankManagement — Gestão Bancária do cliente atual
 * Tabs: Saldo das Contas, Transferências, Conciliação
 */

import { useState, useEffect, useCallback } from 'react';
import { useBpo } from '../../../context/BpoContext';
import { Card, Button, Input, Badge, EmptyState, Modal, Table, Th, Td, Tr } from '../../ui/primitives';

const fmtBRL = (n) => Number(n || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const fmtDate = (d) => d ? new Date(d).toLocaleDateString('pt-BR') : '—';

const TABS = [
  { id: 'balances', label: 'Saldos' },
  { id: 'reconciliation', label: 'Conciliação' },
  { id: 'transfers', label: 'Transferências' },
];

const BankManagement = () => {
  const [tab, setTab] = useState('balances');

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="text-xl font-bold text-text-strong">Gestão Bancária</h1>
        <p className="text-xs text-text-muted mt-0.5">Saldos, conciliação manual e transferências entre contas.</p>
      </div>

      <Card padded={false} className="p-2 flex gap-1">
        {TABS.map((t) => (
          <button key={t.id} onClick={() => setTab(t.id)}
            className={`text-xs font-medium px-3 py-1.5 rounded-md transition-colors ${
              tab === t.id ? 'bg-brand text-black' : 'text-text-muted hover:text-text-strong hover:bg-bg-input'
            }`}>
            {t.label}
          </button>
        ))}
      </Card>

      {tab === 'balances' && <BalancesTab />}
      {tab === 'reconciliation' && <ReconciliationTab />}
      {tab === 'transfers' && <TransfersTab />}
    </div>
  );
};

// ============ BALANCES ============
const BalancesTab = () => {
  const { bpoUrl, selectedClient } = useBpo();
  const [accounts, setAccounts] = useState([]);

  useEffect(() => {
    if (!selectedClient) return;
    fetch(bpoUrl('/bank-accounts')).then((r) => r.json()).then((d) => setAccounts(d.items || []));
  }, [bpoUrl, selectedClient]);

  const total = accounts.reduce((s, a) => s + Number(a.currentBalance), 0);

  return (
    <>
      <Card>
        <div className="flex items-center justify-between mb-4">
          <span className="text-xs text-text-muted">Saldo total disponível</span>
          <span className="text-2xl font-bold text-brand tabular-nums">{fmtBRL(total)}</span>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {accounts.map((a) => (
            <Card key={a.id} className="bg-bg-elevated">
              <div className="flex items-center gap-2 mb-2">
                <div className="w-8 h-8 rounded bg-bg-input flex items-center justify-center text-[10px] font-bold text-text-strong">{a.bankCode}</div>
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-semibold text-text-strong truncate">{a.bankName}</div>
                  <div className="text-[10px] text-text-subtle font-mono">Ag {a.agency} · Conta {a.account}</div>
                </div>
                {a.openFinanceConnected && <Badge variant="success" size="xs">Open Finance</Badge>}
              </div>
              <div className="text-xl font-bold tabular-nums">{fmtBRL(a.currentBalance)}</div>
            </Card>
          ))}
        </div>
      </Card>
    </>
  );
};

// ============ RECONCILIATION ============
const ReconciliationTab = () => {
  const { bpoUrl, selectedClient } = useBpo();
  const [transactions, setTransactions] = useState([]);
  const [loading, setLoading] = useState(false);
  const [showUpload, setShowUpload] = useState(false);
  const [reconciling, setReconciling] = useState(null); // transaction sendo conciliada

  const fetchPending = useCallback(async () => {
    if (!selectedClient) return;
    setLoading(true);
    try {
      const res = await fetch(bpoUrl('/reconciliation/pending'));
      const d = await res.json();
      setTransactions(d.items || []);
    } finally { setLoading(false); }
  }, [bpoUrl, selectedClient]);

  useEffect(() => { fetchPending(); }, [fetchPending]);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <span className="text-sm text-text-muted">{transactions.length} transação(ões) pendente(s) de conciliação</span>
        <Button variant="primary" onClick={() => setShowUpload(true)}
          icon={<svg width="14" height="14" viewBox="0 0 24 24" fill="none"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4M17 8l-5-5-5 5M12 3v12" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/></svg>}>
          Upload extrato (OFX/CSV)
        </Button>
      </div>

      {loading ? (
        <Card><div className="text-center py-8 text-xs text-text-muted">Carregando...</div></Card>
      ) : transactions.length === 0 ? (
        <Card><EmptyState
          icon={<svg width="24" height="24" viewBox="0 0 24 24" fill="none"><path d="M5 13l4 4L19 7" stroke="currentColor" strokeWidth="2"/></svg>}
          title="Tudo conciliado!"
          description="Faça upload de um novo extrato pra começar."
        /></Card>
      ) : (
        <Table>
          <thead><tr>
            <Th>Data</Th><Th>Descrição</Th><Th>Conta</Th>
            <Th>Tipo</Th><Th align="right">Valor</Th><Th align="right">Ação</Th>
          </tr></thead>
          <tbody>
            {transactions.map((t) => (
              <Tr key={t.id}>
                <Td>{fmtDate(t.date)}</Td>
                <Td className="text-xs">{t.description}</Td>
                <Td className="text-xs text-text-muted">{t.bankAccount?.bankName} {t.bankAccount?.account}</Td>
                <Td><Badge variant={t.type === 'credit' ? 'success' : 'danger'}>{t.type === 'credit' ? 'Entrada' : 'Saída'}</Badge></Td>
                <Td align="right" className={`tabular-nums font-semibold ${t.type === 'credit' ? 'text-success' : 'text-danger'}`}>{fmtBRL(t.amount)}</Td>
                <Td align="right">
                  <Button variant="link" size="sm" onClick={() => setReconciling(t)}>Conciliar</Button>
                </Td>
              </Tr>
            ))}
          </tbody>
        </Table>
      )}

      {showUpload && <UploadStatementModal onClose={() => setShowUpload(false)} onSaved={() => { setShowUpload(false); fetchPending(); }} />}
      {reconciling && <ReconcileModal tx={reconciling} onClose={() => setReconciling(null)} onSaved={() => { setReconciling(null); fetchPending(); }} />}
    </div>
  );
};

const UploadStatementModal = ({ onClose, onSaved }) => {
  const { bpoUrl } = useBpo();
  const [bankId, setBankId] = useState('');
  const [accounts, setAccounts] = useState([]);
  const [file, setFile] = useState(null);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);

  useEffect(() => {
    fetch(bpoUrl('/bank-accounts')).then((r) => r.json()).then((d) => setAccounts(d.items || []));
  }, [bpoUrl]);

  const handleUpload = async () => {
    setError(null);
    if (!bankId) { setError('Escolha a conta bancária'); return; }
    if (!file) { setError('Selecione um arquivo'); return; }
    setLoading(true);
    try {
      const fd = new FormData();
      fd.append('file', file);
      const res = await fetch(bpoUrl(`/reconciliation/upload/${bankId}`), { method: 'POST', body: fd });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Erro');
      setResult(data);
    } catch (err) { setError(err.message); }
    finally { setLoading(false); }
  };

  return (
    <Modal open onClose={onClose} title="Upload de extrato bancário" size="md"
      footer={result ? <Button variant="primary" onClick={onSaved}>Concluir</Button> : (
        <>
          <Button variant="secondary" onClick={onClose}>Cancelar</Button>
          <Button variant="primary" onClick={handleUpload} loading={loading}>Importar</Button>
        </>
      )}>
      <div className="flex flex-col gap-4">
        {error && <div className="bg-danger-soft border border-danger/30 rounded-md px-3 py-2 text-xs text-danger">{error}</div>}

        {result ? (
          <div className="text-center py-4">
            <div className="w-14 h-14 rounded-full bg-success-soft flex items-center justify-center mx-auto mb-3 text-success">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none"><path d="M5 13l4 4L19 7" stroke="currentColor" strokeWidth="2"/></svg>
            </div>
            <h3 className="text-base font-semibold text-text-strong mb-1">{result.created} transações importadas</h3>
            {result.duplicates > 0 && <p className="text-xs text-text-muted">({result.duplicates} duplicadas ignoradas)</p>}
            <p className="text-xs text-text-muted mt-2">Formato: <strong>{result.source.toUpperCase()}</strong></p>
          </div>
        ) : (
          <>
            <div>
              <label className="text-xs text-text-muted font-medium mb-1.5 block">Conta bancária *</label>
              <select value={bankId} onChange={(e) => setBankId(e.target.value)}
                className="w-full bg-bg-input border border-border rounded-md px-3 py-2 text-sm text-text-strong outline-none">
                <option value="">Selecione...</option>
                {accounts.map((a) => <option key={a.id} value={a.id}>{a.bankName} — {a.account}</option>)}
              </select>
            </div>
            <div>
              <label className="text-xs text-text-muted font-medium mb-1.5 block">Arquivo (OFX ou CSV)</label>
              <input type="file" accept=".ofx,.csv,.txt" onChange={(e) => setFile(e.target.files[0])}
                className="block w-full text-xs text-text-muted file:mr-3 file:py-2 file:px-4 file:rounded-md file:border-0 file:bg-brand file:text-black file:font-bold file:cursor-pointer" />
            </div>
            <p className="text-xs text-text-subtle">
              <strong>OFX:</strong> exporte do internet banking (padrão).<br />
              <strong>CSV:</strong> colunas <code>data, descricao, valor</code> (separador , ou ;).
            </p>
          </>
        )}
      </div>
    </Modal>
  );
};

const ReconcileModal = ({ tx, onClose, onSaved }) => {
  const { bpoUrl } = useBpo();
  const [suggestions, setSuggestions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [confirming, setConfirming] = useState(false);

  useEffect(() => {
    fetch(bpoUrl(`/reconciliation/suggest/${tx.id}`)).then((r) => r.json()).then((d) => {
      setSuggestions(d.suggestions || []);
      setLoading(false);
    });
  }, [bpoUrl, tx.id]);

  const handleReconcile = async (suggestion) => {
    setConfirming(true);
    try {
      const res = await fetch(bpoUrl(`/reconciliation/${tx.id}/reconcile`), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: suggestion.type, id: suggestion.id, createPayment: true }),
      });
      if (!res.ok) throw new Error('Erro');
      onSaved();
    } catch (err) { alert(err.message); }
    finally { setConfirming(false); }
  };

  const handleIgnore = async () => {
    setConfirming(true);
    await fetch(bpoUrl(`/reconciliation/${tx.id}/reconcile`), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type: 'manual_ignored', id: 'ignored' }),
    });
    onSaved();
  };

  return (
    <Modal open onClose={onClose} title="Conciliar transação" subtitle={tx.description} size="md"
      footer={<>
        <Button variant="ghost" onClick={handleIgnore}>Ignorar</Button>
        <Button variant="secondary" onClick={onClose}>Cancelar</Button>
      </>}>
      <div className="flex flex-col gap-4">
        <div className="bg-bg-elevated border border-border rounded-md p-3 text-xs">
          <div className="flex justify-between mb-1"><span className="text-text-muted">Data</span><span className="text-text-strong">{fmtDate(tx.date)}</span></div>
          <div className="flex justify-between mb-1"><span className="text-text-muted">Tipo</span><Badge variant={tx.type === 'credit' ? 'success' : 'danger'}>{tx.type === 'credit' ? 'Entrada' : 'Saída'}</Badge></div>
          <div className="flex justify-between"><span className="text-text-muted">Valor</span><span className={`text-base font-bold tabular-nums ${tx.type === 'credit' ? 'text-success' : 'text-danger'}`}>{fmtBRL(tx.amount)}</span></div>
        </div>

        <div className="text-[10px] uppercase tracking-wider text-text-subtle font-semibold">Sugestões</div>
        {loading ? (
          <div className="text-center py-4 text-xs text-text-muted">Buscando matches...</div>
        ) : suggestions.length === 0 ? (
          <div className="text-center py-6">
            <p className="text-xs text-text-muted">Nenhuma sugestão automática encontrada.</p>
            <p className="text-[10px] text-text-subtle mt-1">Você pode "Ignorar" pra marcar como conciliado manualmente.</p>
          </div>
        ) : (
          <div className="flex flex-col gap-2">
            {suggestions.map((s, i) => (
              <button key={i} onClick={() => handleReconcile(s)} disabled={confirming}
                className="text-left bg-bg-elevated hover:border-brand border border-border rounded-md p-3 transition-colors disabled:opacity-50">
                <div className="flex items-center justify-between mb-1">
                  <Badge variant={s.type === 'payable' ? 'danger' : 'success'}>{s.type === 'payable' ? 'A Pagar' : 'A Receber'}</Badge>
                  <Badge variant={s.confidence > 80 ? 'success' : s.confidence > 60 ? 'warning' : 'default'} size="xs">
                    {s.confidence}% match
                  </Badge>
                </div>
                <div className="text-sm font-medium text-text-strong">{s.label}</div>
              </button>
            ))}
          </div>
        )}
      </div>
    </Modal>
  );
};

// ============ TRANSFERS ============
const TransfersTab = () => {
  const { bpoUrl, selectedClient } = useBpo();
  const [items, setItems] = useState([]);
  const [showModal, setShowModal] = useState(false);

  const fetchItems = useCallback(async () => {
    if (!selectedClient) return;
    const res = await fetch(bpoUrl('/transfers'));
    const d = await res.json();
    setItems(d.items || []);
  }, [bpoUrl, selectedClient]);

  useEffect(() => { fetchItems(); }, [fetchItems]);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <span className="text-sm text-text-muted">{items.length} transferência(s) registrada(s)</span>
        <Button variant="primary" onClick={() => setShowModal(true)}
          icon={<svg width="14" height="14" viewBox="0 0 24 24" fill="none"><path d="M17 1l4 4-4 4M3 11V9a4 4 0 014-4h14M7 23l-4-4 4-4M21 13v2a4 4 0 01-4 4H3" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/></svg>}>
          Nova Transferência
        </Button>
      </div>

      {items.length === 0 ? (
        <Card><EmptyState title="Nenhuma transferência" description="Use pra mover dinheiro entre contas bancárias do mesmo cliente." /></Card>
      ) : (
        <Table>
          <thead><tr>
            <Th>Data</Th><Th>De</Th><Th>Para</Th><Th>Descrição</Th>
            <Th align="right">Taxa</Th><Th align="right">Valor</Th>
          </tr></thead>
          <tbody>
            {items.map((t) => (
              <Tr key={t.id}>
                <Td>{fmtDate(t.date)}</Td>
                <Td className="text-xs">{t.fromAccount?.bankName}</Td>
                <Td className="text-xs">{t.toAccount?.bankName}</Td>
                <Td className="text-xs text-text-muted">{t.description}</Td>
                <Td align="right" className="tabular-nums text-xs">{fmtBRL(t.fee)}</Td>
                <Td align="right" className="tabular-nums font-semibold">{fmtBRL(t.amount)}</Td>
              </Tr>
            ))}
          </tbody>
        </Table>
      )}

      {showModal && <TransferModal onClose={() => setShowModal(false)} onSaved={() => { setShowModal(false); fetchItems(); }} />}
    </div>
  );
};

const TransferModal = ({ onClose, onSaved }) => {
  const { bpoUrl } = useBpo();
  const [accounts, setAccounts] = useState([]);
  const [form, setForm] = useState({
    fromAccountId: '', toAccountId: '', amount: '', date: new Date().toISOString().slice(0, 10), fee: 0, description: '',
  });
  const [error, setError] = useState(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetch(bpoUrl('/bank-accounts')).then((r) => r.json()).then((d) => setAccounts(d.items || []));
  }, [bpoUrl]);

  const handleSave = async () => {
    setError(null);
    if (!form.fromAccountId || !form.toAccountId || !form.amount) { setError('Conta origem, destino e valor obrigatórios'); return; }
    if (form.fromAccountId === form.toAccountId) { setError('Origem e destino devem ser diferentes'); return; }
    setSaving(true);
    try {
      const res = await fetch(bpoUrl('/transfers'), {
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
    <Modal open onClose={onClose} title="Nova Transferência" size="md"
      footer={<>
        <Button variant="secondary" onClick={onClose}>Cancelar</Button>
        <Button variant="primary" onClick={handleSave} loading={saving}>Transferir</Button>
      </>}>
      <div className="flex flex-col gap-4">
        {error && <div className="bg-danger-soft border border-danger/30 rounded-md px-3 py-2 text-xs text-danger">{error}</div>}

        <div>
          <label className="text-xs text-text-muted font-medium mb-1.5 block">De</label>
          <select value={form.fromAccountId} onChange={(e) => setForm({ ...form, fromAccountId: e.target.value })}
            className="w-full bg-bg-input border border-border rounded-md px-3 py-2 text-sm text-text-strong outline-none">
            <option value="">Selecione conta de origem...</option>
            {accounts.map((a) => <option key={a.id} value={a.id}>{a.bankName} — {a.account} ({fmtBRL(a.currentBalance)})</option>)}
          </select>
        </div>

        <div>
          <label className="text-xs text-text-muted font-medium mb-1.5 block">Para</label>
          <select value={form.toAccountId} onChange={(e) => setForm({ ...form, toAccountId: e.target.value })}
            className="w-full bg-bg-input border border-border rounded-md px-3 py-2 text-sm text-text-strong outline-none">
            <option value="">Selecione conta de destino...</option>
            {accounts.filter((a) => a.id !== form.fromAccountId).map((a) => <option key={a.id} value={a.id}>{a.bankName} — {a.account}</option>)}
          </select>
        </div>

        <div className="grid grid-cols-3 gap-3">
          <Input label="Valor" type="number" value={form.amount} onChange={(v) => setForm({ ...form, amount: v })} placeholder="0,00" required />
          <Input label="Taxa (TED/DOC)" type="number" value={form.fee} onChange={(v) => setForm({ ...form, fee: v })} placeholder="0,00" />
          <Input label="Data" type="date" value={form.date} onChange={(v) => setForm({ ...form, date: v })} />
        </div>

        <Input label="Descrição (opcional)" value={form.description} onChange={(v) => setForm({ ...form, description: v })} placeholder="Ex: Transferência operacional" />
      </div>
    </Modal>
  );
};

export default BankManagement;
