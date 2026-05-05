/**
 * BAH-031 — Empréstimos e Financiamentos
 *
 * Lista contratos com bancos, calcula parcela via Tabela Price,
 * mostra saldo devedor, juros pagos vs projetados, e progress de
 * parcelas pagas. Marca parcela paga incrementalmente.
 */

import { useState, useEffect, useCallback, useMemo } from 'react';
import { useBpo } from '../../../context/BpoContext';
import { Button, Card, Input, Badge, EmptyState, Modal, Table, Th, Td, Tr, ErrorBanner, useToast, useConfirm } from '../../ui/primitives';

const fmtBRL = (n) => Number(n || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const fmtPct = (n, digits = 2) => `${Number(n || 0).toFixed(digits)}%`;

// Tabela Price: P × i × (1+i)^n / ((1+i)^n − 1)
const calcInstallment = (P, ratePct, n) => {
  const i = parseFloat(ratePct) / 100;
  if (P <= 0 || n <= 0) return 0;
  if (i === 0) return P / n;
  const f = Math.pow(1 + i, n);
  return (P * i * f) / (f - 1);
};

const calcBalance = (installmentValue, ratePct, n, paid) => {
  const i = parseFloat(ratePct) / 100;
  const k = Math.max(0, parseInt(paid, 10) || 0);
  const remaining = n - k;
  if (remaining <= 0) return 0;
  if (i === 0) return installmentValue * remaining;
  const f = Math.pow(1 + i, remaining);
  return (installmentValue * (f - 1)) / (i * f);
};

const STATUS_LABELS = {
  active: { label: 'Ativo', color: 'warning' },
  paid: { label: 'Quitado', color: 'success' },
  cancelled: { label: 'Cancelado', color: 'default' },
};

const LoansList = () => {
  const { bpoUrl, selectedClient } = useBpo();
  const toast = useToast();
  const confirm = useConfirm();
  const [items, setItems] = useState([]);
  const [totals, setTotals] = useState({ outstanding: 0, monthly: 0 });
  const [error, setError] = useState(null);
  const [editing, setEditing] = useState(null);

  const fetchItems = useCallback(async () => {
    if (!selectedClient) return;
    setError(null);
    try {
      const url = bpoUrl('/loans');
      if (!url) return;
      const res = await fetch(url);
      if (!res.ok) throw new Error((await res.json()).error || `Erro ${res.status}`);
      const data = await res.json();
      setItems(data.items || []);
      setTotals({
        outstanding: data.totalOutstandingBalance || 0,
        monthly: data.totalMonthlyInstallments || 0,
      });
    } catch (err) { setError(err.message); }
  }, [bpoUrl, selectedClient]);

  useEffect(() => { fetchItems(); }, [fetchItems]);

  const handlePayInstallment = async (loan) => {
    const ok = await confirm({
      title: 'Registrar parcela paga?',
      message: `Vai marcar 1 parcela paga (${loan.paidInstallments + 1}/${loan.totalInstallments}) e atualizar saldo devedor.`,
      confirmLabel: 'Confirmar',
      variant: 'primary',
    });
    if (!ok) return;
    try {
      const res = await fetch(bpoUrl(`/loans/${loan.id}/pay`), { method: 'POST' });
      if (!res.ok) throw new Error((await res.json()).error || 'Falha');
      toast.success('Parcela registrada');
      fetchItems();
    } catch (err) { toast.error(err.message); }
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-text-strong">Empréstimos e Financiamentos</h1>
          <p className="text-xs text-text-muted mt-0.5">
            Contratos com bancos. Parcela calculada via Tabela Price (juros sobre saldo).
          </p>
        </div>
        <Button variant="primary" onClick={() => setEditing('new')}
          icon={<svg width="14" height="14" viewBox="0 0 24 24" fill="none"><path d="M12 5v14M5 12h14" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/></svg>}>
          Novo contrato
        </Button>
      </div>

      <ErrorBanner message={error} onRetry={fetchItems} />

      {/* Resumo: total devedor + parcela mensal somada */}
      {items.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <Card className="bg-warning/5 border-warning/30">
            <div className="p-4">
              <div className="text-xs text-text-muted uppercase tracking-wider">Saldo devedor total</div>
              <div className="text-2xl font-bold text-warning">{fmtBRL(totals.outstanding)}</div>
              <div className="text-xs text-text-muted mt-1">Soma do saldo de todos os contratos ativos.</div>
            </div>
          </Card>
          <Card className="bg-bg-input border-border">
            <div className="p-4">
              <div className="text-xs text-text-muted uppercase tracking-wider">Parcela mensal somada</div>
              <div className="text-2xl font-bold text-text-strong">{fmtBRL(totals.monthly)}/mês</div>
              <div className="text-xs text-text-muted mt-1">Comprometimento mensal com financiamentos.</div>
            </div>
          </Card>
        </div>
      )}

      {items.length === 0 ? (
        <Card><EmptyState
          icon={<svg width="24" height="24" viewBox="0 0 24 24" fill="none"><path d="M3 21h18M3 10h18M5 6l7-3 7 3M4 10v11M20 10v11M8 14v3M12 14v3M16 14v3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg>}
          title="Nenhum empréstimo cadastrado"
          description="Cadastre contratos de financiamento ou capital de giro pra acompanhar saldo devedor e parcelas."
        /></Card>
      ) : (
        <Table>
          <thead><tr>
            <Th>Banco / Descrição</Th>
            <Th align="right">Principal</Th>
            <Th align="right">Taxa a.m.</Th>
            <Th align="right">Parcelas</Th>
            <Th align="right">Parcela R$</Th>
            <Th align="right">Saldo devedor</Th>
            <Th>Status</Th>
            <Th align="right">Ações</Th>
          </tr></thead>
          <tbody>
            {items.map((loan) => {
              const progress = loan.totalInstallments > 0
                ? Math.round((loan.paidInstallments / loan.totalInstallments) * 100)
                : 0;
              const stt = STATUS_LABELS[loan.status] || STATUS_LABELS.active;
              return (
                <Tr key={loan.id} onClick={() => setEditing(loan)}>
                  <Td>
                    <div className="font-medium text-text-strong">{loan.bankName}</div>
                    {loan.description && <div className="text-[11px] text-text-muted">{loan.description}</div>}
                    {loan.contractNumber && <div className="text-[10px] text-text-subtle">Contrato {loan.contractNumber}</div>}
                  </Td>
                  <Td align="right" className="tabular-nums">{fmtBRL(loan.principal)}</Td>
                  <Td align="right" className="tabular-nums text-xs">{fmtPct(loan.interestRateMonthly)}</Td>
                  <Td align="right" className="tabular-nums text-xs">
                    <div>{loan.paidInstallments}/{loan.totalInstallments}</div>
                    <div className="w-full h-1 bg-border rounded mt-1 overflow-hidden">
                      <div className="h-full bg-success" style={{ width: `${progress}%` }} />
                    </div>
                  </Td>
                  <Td align="right" className="tabular-nums">{fmtBRL(loan.installmentValue)}</Td>
                  <Td align="right" className="tabular-nums font-semibold text-warning">{fmtBRL(loan.currentBalance)}</Td>
                  <Td><Badge variant={stt.color}>{stt.label}</Badge></Td>
                  <Td align="right">
                    <div className="flex justify-end gap-2">
                      {loan.status === 'active' && (
                        <button
                          onClick={(e) => { e.stopPropagation(); handlePayInstallment(loan); }}
                          className="text-xs text-success hover:underline"
                          title="Registrar uma parcela paga"
                        >
                          + Parcela paga
                        </button>
                      )}
                      <button
                        onClick={async (e) => {
                          e.stopPropagation();
                          const ok = await confirm({ title: 'Excluir contrato?', message: `"${loan.bankName}" será cancelado.`, confirmLabel: 'Excluir', variant: 'danger' });
                          if (!ok) return;
                          try {
                            const res = await fetch(bpoUrl(`/loans/${loan.id}`), { method: 'DELETE' });
                            if (!res.ok) throw new Error((await res.json()).error || 'Falha');
                            toast.success('Contrato cancelado');
                            fetchItems();
                          } catch (err) { toast.error(err.message); }
                        }} className="text-xs text-text-muted hover:text-danger">Excluir</button>
                    </div>
                  </Td>
                </Tr>
              );
            })}
          </tbody>
        </Table>
      )}

      {editing && (
        <LoanModal
          item={editing === 'new' ? null : editing}
          onClose={() => setEditing(null)}
          onSaved={() => { setEditing(null); fetchItems(); }}
        />
      )}
    </div>
  );
};

const LoanModal = ({ item, onClose, onSaved }) => {
  const { bpoUrl } = useBpo();
  const isEdit = !!item;
  const [form, setForm] = useState({
    bankName: item?.bankName || '',
    contractNumber: item?.contractNumber || '',
    description: item?.description || '',
    principal: item?.principal?.toString() || '',
    interestRateMonthly: item?.interestRateMonthly?.toString() || '1.99',
    totalInstallments: item?.totalInstallments?.toString() || '24',
    paidInstallments: item?.paidInstallments?.toString() || '0',
    startDate: item?.startDate ? String(item.startDate).slice(0, 10) : new Date().toISOString().slice(0, 10),
    notes: item?.notes || '',
  });
  const [error, setError] = useState(null);
  const [saving, setSaving] = useState(false);

  // Preview dos cálculos em tempo real
  const preview = useMemo(() => {
    const P = parseFloat(form.principal) || 0;
    const i = parseFloat(form.interestRateMonthly) || 0;
    const n = parseInt(form.totalInstallments, 10) || 0;
    const paid = parseInt(form.paidInstallments, 10) || 0;
    const installmentValue = +calcInstallment(P, i, n).toFixed(2);
    const totalToPay = +(installmentValue * n).toFixed(2);
    const totalInterest = +(totalToPay - P).toFixed(2);
    const currentBalance = +calcBalance(installmentValue, i, n, paid).toFixed(2);
    return {
      installmentValue, totalToPay, totalInterest, currentBalance,
      valid: P > 0 && n > 0 && i >= 0 && paid >= 0 && paid <= n,
    };
  }, [form]);

  const handleSave = async () => {
    setError(null);
    if (!form.bankName.trim()) { setError('Banco obrigatório'); return; }
    if (!preview.valid) { setError('Verifique os campos: principal > 0, parcelas > 0, pagas ≤ total'); return; }
    setSaving(true);
    try {
      const url = isEdit ? bpoUrl(`/loans/${item.id}`) : bpoUrl('/loans');
      const res = await fetch(url, {
        method: isEdit ? 'PUT' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          bankName: form.bankName.trim(),
          contractNumber: form.contractNumber.trim() || null,
          description: form.description.trim() || null,
          principal: parseFloat(form.principal),
          interestRateMonthly: parseFloat(form.interestRateMonthly),
          totalInstallments: parseInt(form.totalInstallments, 10),
          paidInstallments: parseInt(form.paidInstallments, 10),
          startDate: form.startDate,
          notes: form.notes.trim() || null,
        }),
      });
      if (!res.ok) throw new Error((await res.json()).error || 'Erro');
      onSaved();
    } catch (err) { setError(err.message); }
    finally { setSaving(false); }
  };

  return (
    <Modal onClose={onClose} title={isEdit ? 'Editar contrato' : 'Novo contrato de financiamento'}>
      <div className="flex flex-col gap-3 p-4">
        <ErrorBanner message={error} />

        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <div>
            <label className="text-xs text-text-muted block mb-1">Banco</label>
            <Input value={form.bankName} onChange={(e) => setForm({ ...form, bankName: e.target.value })} placeholder="Ex: Banco do Brasil" />
          </div>
          <div>
            <label className="text-xs text-text-muted block mb-1">Nº Contrato (opcional)</label>
            <Input value={form.contractNumber} onChange={(e) => setForm({ ...form, contractNumber: e.target.value })} placeholder="Ex: 0123456789" />
          </div>
        </div>

        <div>
          <label className="text-xs text-text-muted block mb-1">Descrição (opcional)</label>
          <Input value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} placeholder="Ex: Capital de giro - reforma cozinha" />
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
          <div>
            <label className="text-xs text-text-muted block mb-1">Principal (R$)</label>
            <Input type="text" inputMode="decimal" value={form.principal}
              onChange={(e) => setForm({ ...form, principal: e.target.value.replace(',', '.') })} placeholder="50000" />
          </div>
          <div>
            <label className="text-xs text-text-muted block mb-1">Taxa a.m. (%)</label>
            <Input type="text" inputMode="decimal" value={form.interestRateMonthly}
              onChange={(e) => setForm({ ...form, interestRateMonthly: e.target.value.replace(',', '.') })} placeholder="1.99" />
          </div>
          <div>
            <label className="text-xs text-text-muted block mb-1">Total parcelas</label>
            <Input type="number" value={form.totalInstallments}
              onChange={(e) => setForm({ ...form, totalInstallments: e.target.value })} placeholder="24" />
          </div>
          <div>
            <label className="text-xs text-text-muted block mb-1">Já pagas</label>
            <Input type="number" value={form.paidInstallments}
              onChange={(e) => setForm({ ...form, paidInstallments: e.target.value })} placeholder="0" />
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <div>
            <label className="text-xs text-text-muted block mb-1">Data início</label>
            <Input type="date" value={form.startDate} onChange={(e) => setForm({ ...form, startDate: e.target.value })} />
          </div>
        </div>

        <div>
          <label className="text-xs text-text-muted block mb-1">Notas (opcional)</label>
          <Input value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} placeholder="Garantia, observações..." />
        </div>

        {/* Preview Tabela Price */}
        <div className="bg-bg-input border border-border rounded-lg p-3 mt-2">
          <div className="text-[10px] text-text-muted uppercase tracking-wider font-semibold mb-2">
            Cálculos automáticos (Tabela Price)
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
            <div>
              <div className="text-[10px] text-text-subtle">Parcela mensal</div>
              <div className="font-bold text-text-strong tabular-nums">{preview.valid ? fmtBRL(preview.installmentValue) : '—'}</div>
            </div>
            <div>
              <div className="text-[10px] text-text-subtle">Total a pagar</div>
              <div className="font-bold text-text-strong tabular-nums">{preview.valid ? fmtBRL(preview.totalToPay) : '—'}</div>
            </div>
            <div>
              <div className="text-[10px] text-text-subtle">Total de juros</div>
              <div className="font-bold text-warning tabular-nums">{preview.valid ? fmtBRL(preview.totalInterest) : '—'}</div>
            </div>
            <div>
              <div className="text-[10px] text-text-subtle">Saldo devedor agora</div>
              <div className="font-bold text-warning tabular-nums">{preview.valid ? fmtBRL(preview.currentBalance) : '—'}</div>
            </div>
          </div>
        </div>

        <div className="flex justify-end gap-2 mt-3">
          <Button variant="secondary" onClick={onClose}>Cancelar</Button>
          <Button variant="primary" onClick={handleSave} disabled={saving}>
            {saving ? 'Salvando...' : (isEdit ? 'Salvar alterações' : 'Criar contrato')}
          </Button>
        </div>
      </div>
    </Modal>
  );
};

export default LoansList;
