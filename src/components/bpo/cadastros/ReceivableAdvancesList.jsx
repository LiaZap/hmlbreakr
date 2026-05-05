/**
 * BAH-030 — Antecipação de Recebíveis
 *
 * Lista, cria e edita antecipações em operadoras (cartão/marketplace).
 * Pra cada antecipação calcula: taxa diária, desconto total, valor final.
 * O total perdido em antecipações vira item no "Dinheiro na Mesa" do dashboard.
 */

import { useState, useEffect, useCallback, useMemo } from 'react';
import { useBpo } from '../../../context/BpoContext';
import { Button, Card, Input, Badge, EmptyState, Modal, Table, Th, Td, Tr, ErrorBanner, useToast, useConfirm } from '../../ui/primitives';

const fmtBRL = (n) => Number(n || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const fmtPct = (n, digits = 2) => `${Number(n || 0).toFixed(digits)}%`;

// Calcula taxa diária equivalente: ((1 + i)^(1/30)) - 1
const monthlyToDaily = (monthlyPct) => {
  const m = parseFloat(monthlyPct);
  if (!isFinite(m) || m <= 0) return 0;
  return Math.pow(1 + m / 100, 1 / 30) - 1;
};

const ReceivableAdvancesList = () => {
  const { bpoUrl, selectedClient } = useBpo();
  const toast = useToast();
  const confirm = useConfirm();
  const [items, setItems] = useState([]);
  const [paymentMethods, setPaymentMethods] = useState([]);
  const [totalLost, setTotalLost] = useState(0);
  const [error, setError] = useState(null);
  const [editing, setEditing] = useState(null);

  const fetchItems = useCallback(async () => {
    if (!selectedClient) return;
    setError(null);
    try {
      const url = bpoUrl('/advances');
      if (!url) return;
      const res = await fetch(url);
      if (!res.ok) throw new Error((await res.json()).error || `Erro ${res.status}`);
      const data = await res.json();
      setItems(data.items || []);
      setTotalLost(data.totalLostMonthly || 0);
    } catch (err) { setError(err.message); }
  }, [bpoUrl, selectedClient]);

  const fetchPaymentMethods = useCallback(async () => {
    if (!selectedClient) return;
    try {
      const url = bpoUrl('/payment-methods');
      if (!url) return;
      const res = await fetch(url);
      if (!res.ok) return;
      const data = await res.json();
      setPaymentMethods(data.items || []);
    } catch { /* opcional, ignora */ }
  }, [bpoUrl, selectedClient]);

  useEffect(() => { fetchItems(); fetchPaymentMethods(); }, [fetchItems, fetchPaymentMethods]);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-text-strong">Antecipação de Recebíveis</h1>
          <p className="text-xs text-text-muted mt-0.5">
            Calcule quanto perde antecipando recebíveis em operadoras de cartão e marketplaces.
          </p>
        </div>
        <Button variant="primary" onClick={() => setEditing('new')}
          icon={<svg width="14" height="14" viewBox="0 0 24 24" fill="none"><path d="M12 5v14M5 12h14" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/></svg>}>
          Nova antecipação
        </Button>
      </div>

      <ErrorBanner message={error} onRetry={fetchItems} />

      {/* Resumo: total perdido */}
      {items.length > 0 && (
        <Card className="bg-warning/5 border-warning/30">
          <div className="flex items-center justify-between p-4">
            <div>
              <div className="text-xs text-text-muted uppercase tracking-wider">Total perdido em antecipações</div>
              <div className="text-2xl font-bold text-warning">{fmtBRL(totalLost)}/mês</div>
              <div className="text-xs text-text-muted mt-1">
                Esse valor aparece como "Dinheiro na Mesa" no dashboard do dono.
              </div>
            </div>
            <svg width="32" height="32" viewBox="0 0 24 24" fill="none">
              <path d="M12 2v20M17 5H9.5a3.5 3.5 0 000 7h5a3.5 3.5 0 010 7H6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="text-warning"/>
            </svg>
          </div>
        </Card>
      )}

      {items.length === 0 ? (
        <Card><EmptyState
          icon={<svg width="24" height="24" viewBox="0 0 24 24" fill="none"><path d="M12 1v22M17 5H9.5a3.5 3.5 0 000 7h5a3.5 3.5 0 010 7H6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg>}
          title="Nenhuma antecipação cadastrada"
          description="Cadastre as antecipações que você faz nas operadoras pra ver o impacto real no seu caixa."
        /></Card>
      ) : (
        <Table>
          <thead><tr>
            <Th>Descrição</Th>
            <Th>Operadora</Th>
            <Th align="right">Valor médio/mês</Th>
            <Th align="right">Taxa a.m.</Th>
            <Th align="right">Dias antec.</Th>
            <Th align="right">Desconto/mês</Th>
            <Th align="right">Líquido/mês</Th>
            <Th align="right">Ações</Th>
          </tr></thead>
          <tbody>
            {items.map((a) => (
              <Tr key={a.id} onClick={() => setEditing(a)}>
                <Td className="font-medium text-text-strong">{a.description}</Td>
                <Td>{a.paymentMethod ? <Badge variant="default">{a.paymentMethod.name}</Badge> : <span className="text-xs text-text-subtle">—</span>}</Td>
                <Td align="right" className="tabular-nums">{fmtBRL(a.averageValue)}</Td>
                <Td align="right" className="tabular-nums">{fmtPct(a.monthlyRate)}</Td>
                <Td align="right" className="tabular-nums text-xs">{a.daysAdvanced} dias</Td>
                <Td align="right" className="tabular-nums text-warning font-semibold">-{fmtBRL(a.totalDiscount)}</Td>
                <Td align="right" className="tabular-nums">{fmtBRL(a.finalValue)}</Td>
                <Td align="right">
                  <button onClick={async (e) => {
                    e.stopPropagation();
                    const ok = await confirm({ title: 'Excluir antecipação?', message: `"${a.description}" será removida.`, confirmLabel: 'Excluir', variant: 'danger' });
                    if (!ok) return;
                    try {
                      const res = await fetch(bpoUrl(`/advances/${a.id}`), { method: 'DELETE' });
                      if (!res.ok) throw new Error((await res.json()).error || 'Falha');
                      toast.success(`"${a.description}" excluída`);
                      fetchItems();
                    } catch (err) { toast.error(err.message); }
                  }} className="text-xs text-text-muted hover:text-danger">Excluir</button>
                </Td>
              </Tr>
            ))}
          </tbody>
        </Table>
      )}

      {editing && (
        <ReceivableAdvanceModal
          item={editing === 'new' ? null : editing}
          paymentMethods={paymentMethods}
          onClose={() => setEditing(null)}
          onSaved={() => { setEditing(null); fetchItems(); }}
        />
      )}
    </div>
  );
};

const ReceivableAdvanceModal = ({ item, paymentMethods, onClose, onSaved }) => {
  const { bpoUrl } = useBpo();
  const isEdit = !!item;
  const [form, setForm] = useState({
    description: item?.description || '',
    paymentMethodId: item?.paymentMethodId || '',
    monthlyRate: item?.monthlyRate?.toString() || '2.99',
    averageValue: item?.averageValue?.toString() || '',
    daysAdvanced: item?.daysAdvanced?.toString() || '15',
  });
  const [error, setError] = useState(null);
  const [saving, setSaving] = useState(false);

  // Preview dos cálculos em tempo real
  const preview = useMemo(() => {
    const m = parseFloat(form.monthlyRate) || 0;
    const v = parseFloat(form.averageValue) || 0;
    const d = parseInt(form.daysAdvanced, 10) || 0;
    const dailyRate = monthlyToDaily(m);
    const totalDiscount = v * dailyRate * d;
    const finalValue = v - totalDiscount;
    return { dailyRate: dailyRate * 100, totalDiscount, finalValue, valid: m > 0 && v > 0 && d > 0 };
  }, [form]);

  const handleSave = async () => {
    setError(null);
    if (!form.description.trim()) { setError('Descrição obrigatória'); return; }
    if (!preview.valid) { setError('Preencha taxa, valor e dias com valores positivos'); return; }
    setSaving(true);
    try {
      const url = isEdit ? bpoUrl(`/advances/${item.id}`) : bpoUrl('/advances');
      const res = await fetch(url, {
        method: isEdit ? 'PUT' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          description: form.description.trim(),
          paymentMethodId: form.paymentMethodId || null,
          monthlyRate: parseFloat(form.monthlyRate),
          averageValue: parseFloat(form.averageValue),
          daysAdvanced: parseInt(form.daysAdvanced, 10),
        }),
      });
      if (!res.ok) throw new Error((await res.json()).error || 'Erro');
      onSaved();
    } catch (err) { setError(err.message); }
    finally { setSaving(false); }
  };

  return (
    <Modal onClose={onClose} title={isEdit ? 'Editar antecipação' : 'Nova antecipação'}>
      <div className="flex flex-col gap-3 p-4">
        <ErrorBanner message={error} />

        <div>
          <label className="text-xs text-text-muted block mb-1">Descrição</label>
          <Input
            value={form.description}
            onChange={(e) => setForm({ ...form, description: e.target.value })}
            placeholder="Ex: iFood antecipação semanal"
          />
        </div>

        <div>
          <label className="text-xs text-text-muted block mb-1">Operadora (opcional)</label>
          <select
            value={form.paymentMethodId}
            onChange={(e) => setForm({ ...form, paymentMethodId: e.target.value })}
            className="w-full bg-bg-input border border-border rounded-md px-3 py-2 text-sm text-text-strong outline-none focus:border-brand"
          >
            <option value="">— Sem vínculo —</option>
            {paymentMethods.map((p) => (
              <option key={p.id} value={p.id}>{p.name} ({p.feePercent}% taxa, {p.settlementDays}d repasse)</option>
            ))}
          </select>
          <div className="text-[11px] text-text-subtle mt-1">
            Vincule à operadora pra rastrear de qual canal vem a antecipação.
          </div>
        </div>

        <div className="grid grid-cols-3 gap-2">
          <div>
            <label className="text-xs text-text-muted block mb-1">Taxa a.m. (%)</label>
            <Input
              type="text"
              inputMode="decimal"
              value={form.monthlyRate}
              onChange={(e) => setForm({ ...form, monthlyRate: e.target.value.replace(',', '.') })}
              placeholder="2.99"
            />
          </div>
          <div>
            <label className="text-xs text-text-muted block mb-1">Valor médio/mês (R$)</label>
            <Input
              type="text"
              inputMode="decimal"
              value={form.averageValue}
              onChange={(e) => setForm({ ...form, averageValue: e.target.value.replace(',', '.') })}
              placeholder="50000"
            />
          </div>
          <div>
            <label className="text-xs text-text-muted block mb-1">Dias antecipados</label>
            <Input
              type="number"
              value={form.daysAdvanced}
              onChange={(e) => setForm({ ...form, daysAdvanced: e.target.value })}
              placeholder="15"
            />
          </div>
        </div>

        {/* Preview dos cálculos em tempo real */}
        <div className="bg-bg-input border border-border rounded-lg p-3 mt-2">
          <div className="text-[10px] text-text-muted uppercase tracking-wider font-semibold mb-2">Cálculos automáticos</div>
          <div className="grid grid-cols-3 gap-3 text-sm">
            <div>
              <div className="text-[10px] text-text-subtle">Taxa diária</div>
              <div className="font-bold text-text-strong tabular-nums">{preview.valid ? fmtPct(preview.dailyRate, 4) : '—'}</div>
            </div>
            <div>
              <div className="text-[10px] text-text-subtle">Desconto total/mês</div>
              <div className="font-bold text-warning tabular-nums">{preview.valid ? `-${fmtBRL(preview.totalDiscount)}` : '—'}</div>
            </div>
            <div>
              <div className="text-[10px] text-text-subtle">Valor líquido/mês</div>
              <div className="font-bold text-success tabular-nums">{preview.valid ? fmtBRL(preview.finalValue) : '—'}</div>
            </div>
          </div>
        </div>

        <div className="flex justify-end gap-2 mt-3">
          <Button variant="secondary" onClick={onClose}>Cancelar</Button>
          <Button variant="primary" onClick={handleSave} disabled={saving}>
            {saving ? 'Salvando...' : (isEdit ? 'Salvar alterações' : 'Criar antecipação')}
          </Button>
        </div>
      </div>
    </Modal>
  );
};

export default ReceivableAdvancesList;
