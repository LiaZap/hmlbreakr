/**
 * ImportsHub — central de importações do BPO
 * 3 cards: NF-e XML, Código de Barras, Excel em Massa
 */

import { useState } from 'react';
import { useBpo } from '../../../context/BpoContext';
import { Card, Button, Modal, Input, Badge, EmptyState } from '../../ui/primitives';

const fmtBRL = (n) => Number(n || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const fmtDate = (d) => d ? new Date(d).toLocaleDateString('pt-BR') : '—';

const ImportsHub = () => {
  const [modal, setModal] = useState(null); // 'nfe' | 'boleto' | 'excel'

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="text-xl font-bold text-text-strong">Importações</h1>
        <p className="text-xs text-text-muted mt-0.5">Importe lançamentos a partir de NF-e, boletos ou planilhas Excel.</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <ImportCard
          title="Nota Fiscal Eletrônica"
          description="Upload de XML de NF-e (modelo 55). Cria fornecedor automaticamente e gera contas a pagar (incluindo parcelas se houver duplicatas)."
          color="success"
          icon={<svg width="24" height="24" viewBox="0 0 24 24" fill="none"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8l-6-6z" stroke="currentColor" strokeWidth="1.5"/><path d="M14 2v6h6M16 13H8M16 17H8" stroke="currentColor" strokeWidth="1.5"/></svg>}
          buttonLabel="Importar XML"
          onClick={() => setModal('nfe')}
        />
        <ImportCard
          title="Código de Barras"
          description="Cole a linha digitável (47 dígitos) ou código de barras (44 dígitos) de boletos. Detecta vencimento e valor automaticamente."
          color="brand"
          icon={<svg width="24" height="24" viewBox="0 0 24 24" fill="none"><path d="M3 5v14M7 5v14M11 5v14M15 5v14M19 5v14" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/></svg>}
          buttonLabel="Inserir Boleto"
          onClick={() => setModal('boleto')}
        />
        <ImportCard
          title="Planilha Excel"
          description="Upload em massa de fornecedores, categorias, contas a pagar ou receber. Baixe template pra ver o formato."
          color="info"
          icon={<svg width="24" height="24" viewBox="0 0 24 24" fill="none"><rect x="3" y="3" width="18" height="18" rx="2" stroke="currentColor" strokeWidth="1.5"/><path d="M9 3v18M15 3v18M3 9h18M3 15h18" stroke="currentColor" strokeWidth="1.5"/></svg>}
          buttonLabel="Importar Excel"
          onClick={() => setModal('excel')}
        />
      </div>

      {modal === 'nfe' && <NfeImportModal onClose={() => setModal(null)} />}
      {modal === 'boleto' && <BoletoImportModal onClose={() => setModal(null)} />}
      {modal === 'excel' && <ExcelImportModal onClose={() => setModal(null)} />}
    </div>
  );
};

const ImportCard = ({ title, description, icon, color, buttonLabel, onClick }) => {
  const colorClass = {
    brand: 'text-brand bg-brand-soft border-brand/30',
    success: 'text-success bg-success-soft border-success/30',
    info: 'text-info bg-info-soft border-info/30',
  }[color];

  return (
    <Card className="flex flex-col gap-3 hover:border-brand/40 transition-colors">
      <div className={`w-12 h-12 rounded-xl flex items-center justify-center ${colorClass}`}>{icon}</div>
      <h3 className="text-sm font-semibold text-text-strong">{title}</h3>
      <p className="text-xs text-text-muted leading-relaxed flex-1">{description}</p>
      <Button variant="primary" onClick={onClick}>{buttonLabel}</Button>
    </Card>
  );
};

// =================================================================
// 1. NF-e XML import modal
// =================================================================
const NfeImportModal = ({ onClose }) => {
  const { bpoUrl } = useBpo();
  const [file, setFile] = useState(null);
  const [preview, setPreview] = useState(null);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);

  const handlePreview = async () => {
    if (!file) { setError('Selecione um arquivo XML'); return; }
    setLoading(true); setError(null);
    try {
      const fd = new FormData();
      fd.append('xml', file);
      const res = await fetch(bpoUrl('/imports/nfe?preview=1'), { method: 'POST', body: fd });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Erro ao parsear');
      setPreview(data.preview);
    } catch (err) { setError(err.message); }
    finally { setLoading(false); }
  };

  const handleConfirm = async () => {
    setLoading(true); setError(null);
    try {
      const fd = new FormData();
      fd.append('xml', file);
      const res = await fetch(bpoUrl('/imports/nfe'), { method: 'POST', body: fd });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Erro ao importar');
      setResult(data);
    } catch (err) { setError(err.message); }
    finally { setLoading(false); }
  };

  return (
    <Modal open onClose={onClose} title="Importar NF-e (XML)" size="lg"
      footer={result ? (
        <Button variant="primary" onClick={onClose}>Fechar</Button>
      ) : preview ? (
        <>
          <Button variant="secondary" onClick={() => setPreview(null)}>Voltar</Button>
          <Button variant="primary" onClick={handleConfirm} loading={loading}>Confirmar e criar</Button>
        </>
      ) : (
        <>
          <Button variant="secondary" onClick={onClose}>Cancelar</Button>
          <Button variant="primary" onClick={handlePreview} loading={loading}>Visualizar</Button>
        </>
      )}>
      <div className="flex flex-col gap-4">
        {error && <div className="bg-danger-soft border border-danger/30 rounded-md px-3 py-2 text-xs text-danger">{error}</div>}

        {result ? (
          <div className="text-center py-6">
            <div className="w-14 h-14 rounded-full bg-success-soft flex items-center justify-center mx-auto mb-3">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none"><path d="M5 13l4 4L19 7" stroke="currentColor" strokeWidth="2" className="text-success"/></svg>
            </div>
            <h3 className="text-base font-semibold text-text-strong mb-2">Importado com sucesso!</h3>
            <p className="text-sm text-text-muted">
              Fornecedor: <strong className="text-text-strong">{result.supplier.name}</strong><br />
              {result.payable.type === 'installments'
                ? `${result.payable.count} parcelas criadas`
                : `Conta a pagar de ${fmtBRL(result.parsed.amount)} criada`}
            </p>
          </div>
        ) : preview ? (
          <div className="flex flex-col gap-3">
            <div className="text-[10px] uppercase tracking-wider text-text-subtle font-semibold">Pré-visualização</div>
            <div className="bg-bg-elevated border border-border rounded-md p-4 grid grid-cols-2 gap-3 text-xs">
              <Field label="Emitente" value={preview.supplierName} />
              <Field label="CNPJ" value={preview.supplierCnpj} mono />
              <Field label="Nº Nota" value={preview.invoiceNumber} mono />
              <Field label="Emissão" value={fmtDate(preview.emissionDate)} />
              <Field label="Valor total" value={fmtBRL(preview.amount)} bold />
              <Field label="Natureza" value={preview.description} />
            </div>
            {preview.installments.length > 0 && (
              <>
                <div className="text-[10px] uppercase tracking-wider text-text-subtle font-semibold mt-2">
                  {preview.installments.length} duplicatas detectadas
                </div>
                <div className="bg-bg-elevated border border-border rounded-md max-h-40 overflow-y-auto">
                  {preview.installments.map((d, i) => (
                    <div key={i} className="flex justify-between px-3 py-1.5 border-b border-border-subtle last:border-0 text-xs">
                      <span className="text-text-muted">Parcela {i + 1}</span>
                      <span className="text-text-strong">{fmtDate(d.dueDate)}</span>
                      <span className="font-semibold tabular-nums">{fmtBRL(d.amount)}</span>
                    </div>
                  ))}
                </div>
              </>
            )}
          </div>
        ) : (
          <>
            <input
              type="file" accept=".xml"
              onChange={(e) => setFile(e.target.files[0])}
              className="block w-full text-xs text-text-muted file:mr-3 file:py-2 file:px-4 file:rounded-md file:border-0 file:bg-brand file:text-black file:font-bold file:cursor-pointer file:hover:bg-brand-hover"
            />
            <p className="text-xs text-text-subtle">XML deve ser de NF-e modelo 55. Tamanho máximo 10MB.</p>
          </>
        )}
      </div>
    </Modal>
  );
};

// =================================================================
// 2. Boleto import modal
// =================================================================
const BoletoImportModal = ({ onClose }) => {
  const { bpoUrl } = useBpo();
  const [code, setCode] = useState('');
  const [preview, setPreview] = useState(null);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);

  const handlePreview = async () => {
    if (!code.trim()) { setError('Cole o código do boleto'); return; }
    setLoading(true); setError(null);
    try {
      const res = await fetch(bpoUrl('/imports/boleto?preview=1'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Erro');
      setPreview(data.preview);
    } catch (err) { setError(err.message); }
    finally { setLoading(false); }
  };

  const handleConfirm = async () => {
    setLoading(true); setError(null);
    try {
      const res = await fetch(bpoUrl('/imports/boleto'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Erro');
      setResult(data);
    } catch (err) { setError(err.message); }
    finally { setLoading(false); }
  };

  return (
    <Modal open onClose={onClose} title="Importar Boleto" size="md"
      footer={result ? <Button variant="primary" onClick={onClose}>Fechar</Button> : preview ? (
        <>
          <Button variant="secondary" onClick={() => setPreview(null)}>Voltar</Button>
          <Button variant="primary" onClick={handleConfirm} loading={loading}>Criar conta a pagar</Button>
        </>
      ) : (
        <>
          <Button variant="secondary" onClick={onClose}>Cancelar</Button>
          <Button variant="primary" onClick={handlePreview} loading={loading}>Analisar</Button>
        </>
      )}>
      <div className="flex flex-col gap-4">
        {error && <div className="bg-danger-soft border border-danger/30 rounded-md px-3 py-2 text-xs text-danger">{error}</div>}

        {result ? (
          <div className="text-center py-6">
            <div className="w-14 h-14 rounded-full bg-success-soft flex items-center justify-center mx-auto mb-3">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none"><path d="M5 13l4 4L19 7" stroke="currentColor" strokeWidth="2" className="text-success"/></svg>
            </div>
            <h3 className="text-base font-semibold text-text-strong mb-1">Boleto importado!</h3>
            <p className="text-sm text-text-muted">Conta a pagar criada com vencimento em {fmtDate(result.parsed.dueDate)}.</p>
          </div>
        ) : preview ? (
          <div className="bg-bg-elevated border border-border rounded-md p-4 grid grid-cols-2 gap-3 text-xs">
            <Field label="Banco emissor" value={preview.bankCode} mono />
            <Field label="Vencimento" value={fmtDate(preview.dueDate)} />
            <Field label="Valor" value={fmtBRL(preview.amount)} bold />
            <Field label="Tipo" value={preview.isConcessionaire ? 'Concessionária' : 'Boleto bancário'} />
          </div>
        ) : (
          <>
            <Input
              label="Linha digitável ou código de barras"
              value={code} onChange={setCode}
              placeholder="00190.00009 02817.622008 86680.026046 8 91070000010000"
              helper="Aceita 47 dígitos (linha digitável) ou 44 (código de barras)"
            />
          </>
        )}
      </div>
    </Modal>
  );
};

// =================================================================
// 3. Excel import modal
// =================================================================
const ExcelImportModal = ({ onClose }) => {
  const { bpoUrl } = useBpo();
  const [type, setType] = useState('payables');
  const [file, setFile] = useState(null);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);

  const handleDownloadTemplate = () => {
    window.location.href = bpoUrl(`/imports/excel/template/${type}`);
  };

  const handleImport = async () => {
    if (!file) { setError('Selecione um arquivo'); return; }
    setLoading(true); setError(null);
    try {
      const fd = new FormData();
      fd.append('file', file);
      const res = await fetch(bpoUrl(`/imports/excel/${type}`), { method: 'POST', body: fd });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Erro');
      setResult(data);
    } catch (err) { setError(err.message); }
    finally { setLoading(false); }
  };

  return (
    <Modal open onClose={onClose} title="Importar Planilha Excel" size="md"
      footer={result ? <Button variant="primary" onClick={onClose}>Fechar</Button> : (
        <>
          <Button variant="secondary" onClick={onClose}>Cancelar</Button>
          <Button variant="primary" onClick={handleImport} loading={loading}>Importar</Button>
        </>
      )}>
      <div className="flex flex-col gap-4">
        {error && <div className="bg-danger-soft border border-danger/30 rounded-md px-3 py-2 text-xs text-danger">{error}</div>}

        {result ? (
          <div className="text-center py-6">
            <div className={`w-14 h-14 rounded-full flex items-center justify-center mx-auto mb-3 ${result.errors > 0 ? 'bg-warning-soft' : 'bg-success-soft'}`}>
              {result.errors > 0 ? '⚠️' : '✅'}
            </div>
            <h3 className="text-base font-semibold text-text-strong mb-2">
              {result.created} de {result.total} importados
            </h3>
            {result.errors > 0 && (
              <>
                <p className="text-xs text-danger mb-3">{result.errors} erro(s)</p>
                <div className="bg-bg-elevated border border-border rounded-md max-h-40 overflow-y-auto text-left">
                  {result.errorDetails.map((e, i) => (
                    <div key={i} className="px-3 py-1.5 border-b border-border-subtle last:border-0 text-xs">
                      <span className="text-danger font-mono">Linha {e.row}:</span> <span className="text-text-muted">{e.error}</span>
                    </div>
                  ))}
                </div>
              </>
            )}
          </div>
        ) : (
          <>
            <div>
              <label className="text-xs text-text-muted font-medium mb-1.5 block">Tipo de importação</label>
              <select value={type} onChange={(e) => setType(e.target.value)}
                className="w-full bg-bg-input border border-border rounded-md px-3 py-2 text-sm text-text-strong outline-none">
                <option value="payables">Contas a Pagar</option>
                <option value="receivables">Contas a Receber</option>
                <option value="suppliers">Fornecedores</option>
                <option value="categories">Categorias Financeiras</option>
              </select>
            </div>

            <Button variant="link" onClick={handleDownloadTemplate}>📥 Baixar template Excel</Button>

            <div>
              <label className="text-xs text-text-muted font-medium mb-1.5 block">Arquivo</label>
              <input
                type="file" accept=".xlsx,.xls,.csv"
                onChange={(e) => setFile(e.target.files[0])}
                className="block w-full text-xs text-text-muted file:mr-3 file:py-2 file:px-4 file:rounded-md file:border-0 file:bg-brand file:text-black file:font-bold file:cursor-pointer"
              />
            </div>

            <p className="text-xs text-text-subtle">Use o template como base. Primeira linha = cabeçalho. Tamanho máximo 10MB.</p>
          </>
        )}
      </div>
    </Modal>
  );
};

const Field = ({ label, value, mono, bold }) => (
  <div>
    <div className="text-[10px] text-text-muted mb-0.5 uppercase tracking-wider">{label}</div>
    <div className={`text-text-strong ${mono ? 'font-mono' : ''} ${bold ? 'font-bold' : 'font-medium'}`}>{value || '—'}</div>
  </div>
);

export default ImportsHub;
