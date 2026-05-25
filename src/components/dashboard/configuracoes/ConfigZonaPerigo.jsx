/**
 * ConfigZonaPerigo — secao "Zona de perigo" da pagina /configuracoes.
 *
 * Acoes IRREVERSIVEIS. UX deliberadamente friccionada — multi-step com
 * varias barreiras, sem ser modal:
 *
 *   Step 0: Card de aviso (default — usuario precisa clicar "Iniciar")
 *   Step 1: Avisos detalhados + recomendacao de exportar dados primeiro
 *           + acknowledgment (3 checkboxes)
 *   Step 2: Confirmacao final — digitar email + nome do restaurante +
 *           "EXCLUIR PERMANENTEMENTE" + senha atual + block de 5s
 *
 * Padroes seguidos:
 *   - "Type-to-confirm" (GitHub, Stripe, Vercel) — usuario digita texto
 *     literal para confirmar
 *   - "Cooldown" no botao final (5s) — evita disparo acidental
 *   - Multiplos acknowledgments — usuario reconhece consequencias
 *   - Sem auto-fechar nem timeout — usuario controla o ritmo
 *
 * Base legal: LGPD Art. 18 VI — Direito de eliminacao dos dados.
 */
import { useState, useEffect } from 'react';
import SectionHeader from './_SectionHeader';

const ConfigZonaPerigo = ({ dashboardData, hash }) => {
  const [step, setStep] = useState(0);

  const restaurantName = dashboardData?.restaurant?.name || 'sua conta';
  const userEmail = dashboardData?._clientEmail || '';

  // Resetar steps se sair e voltar
  useEffect(() => () => setStep(0), []);

  return (
    <div>
      <SectionHeader
        title="Zona de perigo"
        description="Ações destrutivas e irreversíveis. Leia com atenção antes de prosseguir."
      />

      {step === 0 && <Step0Intro onStart={() => setStep(1)} />}
      {step === 1 && <Step1Warnings hash={hash} onBack={() => setStep(0)} onContinue={() => setStep(2)} />}
      {step === 2 && (
        <Step2Confirm
          hash={hash}
          restaurantName={restaurantName}
          userEmail={userEmail}
          onBack={() => setStep(1)}
        />
      )}
    </div>
  );
};

// ─── STEP 0 — Card de intro ──────────────────────────────────────────────────
const Step0Intro = ({ onStart }) => (
  <div className="border border-[#E5484D]/30 bg-[#E5484D]/[0.04] rounded-[14px] overflow-hidden">
    <div className="px-5 py-4 border-b border-[#E5484D]/15">
      <h3 className="text-[14px] font-bold text-white">Excluir minha conta</h3>
      <p className="text-[11px] text-[#868686] mt-0.5">
        Ação permanente. Sua conta será encerrada e os dados anonimizados.
      </p>
    </div>
    <div className="px-5 py-4 bg-[#0F0F11]">
      <p className="text-[12px] text-[#CFCFCF] leading-relaxed mb-4">
        Ao excluir sua conta você perde acesso ao Breakr, suas fichas técnicas, dados
        operacionais e configurações. Esta ação cancela sua assinatura no Stripe e
        encerra a relação contratual conosco.
      </p>
      <p className="text-[11px] text-[#868686] leading-relaxed mb-5">
        Antes de prosseguir, recomendamos baixar uma cópia dos seus dados na aba
        <strong className="text-white"> Privacidade → Baixar meus dados</strong>.
      </p>
      <button type="button" onClick={onStart}
        className="bg-transparent border border-[#E5484D]/40 hover:bg-[#E5484D]/10 text-[#E5484D] font-semibold text-[13px] px-5 py-2.5 rounded-[10px] transition-colors">
        Iniciar processo de exclusão
      </button>
    </div>
  </div>
);

// ─── STEP 1 — Warnings + acknowledgments ────────────────────────────────────
const Step1Warnings = ({ hash, onBack, onContinue }) => {
  const [ack1, setAck1] = useState(false);
  const [ack2, setAck2] = useState(false);
  const [ack3, setAck3] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [exportMsg, setExportMsg] = useState('');

  const allAck = ack1 && ack2 && ack3;

  const handleExport = async () => {
    setExporting(true); setExportMsg('');
    try {
      const res = await fetch(`/api/client/${hash}/export-my-data`);
      if (!res.ok) { setExportMsg('Erro ao exportar.'); return; }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      const cd = res.headers.get('Content-Disposition') || '';
      const match = cd.match(/filename="([^"]+)"/);
      a.download = match ? match[1] : 'breakr-meus-dados.json';
      document.body.appendChild(a); a.click(); document.body.removeChild(a);
      URL.revokeObjectURL(url);
      setExportMsg('Dados baixados.');
    } catch { setExportMsg('Erro de conexão.'); }
    finally { setExporting(false); }
  };

  return (
    <div className="border border-[#E5484D]/30 rounded-[14px] overflow-hidden">
      {/* Stepper */}
      <StepHeader current={1} />

      <div className="px-5 py-5 bg-[#0F0F11] space-y-5">
        <div>
          <h3 className="text-[14px] font-bold text-white mb-2">O que vai acontecer</h3>
          <ul className="space-y-2 text-[12px] text-[#CFCFCF]">
            <Consequence text="Sua conta será desativada imediatamente — você não conseguirá mais fazer login." />
            <Consequence text="Sua assinatura Stripe será cancelada no fim do período pago atual." />
            <Consequence text="Em até 30 dias seus dados pessoais (nome, email, telefone, CPF) serão anonimizados." />
            <Consequence text="Fichas técnicas, insumos e configurações operacionais serão permanentemente apagados." />
            <Consequence text="Registros contábeis e financeiros podem ser preservados por obrigação legal (até 5 anos)." />
            <Consequence text="Esta ação é IRREVERSÍVEL — não há como restaurar." critical />
          </ul>
        </div>

        {/* Sugestao de export */}
        <div className="bg-[#5B8DEF]/[0.08] border border-[#5B8DEF]/20 rounded-[10px] p-4 flex items-start gap-3">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#5B8DEF" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="shrink-0 mt-0.5">
            <circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/>
          </svg>
          <div className="flex-1 min-w-0">
            <p className="text-[12px] text-white font-semibold mb-1">Antes de continuar, baixe seus dados</p>
            <p className="text-[11px] text-[#A0A0A0] mb-2.5 leading-relaxed">
              Você pode exportar uma cópia em JSON com tudo da sua conta. Recomendado pra ter histórico.
            </p>
            <button type="button" onClick={handleExport} disabled={exporting}
              className="bg-[#1A1A1A] hover:bg-[#252527] disabled:opacity-50 text-white font-semibold text-[11px] px-3 py-1.5 rounded-[6px] border border-white/[0.08] transition-colors">
              {exporting ? 'Gerando…' : 'Baixar agora (recomendado)'}
            </button>
            {exportMsg && <p className="text-[10px] text-[#00B37E] mt-1.5">{exportMsg}</p>}
          </div>
        </div>

        {/* Acknowledgments */}
        <div>
          <p className="text-[11px] text-[#868686] mb-2.5 font-semibold uppercase tracking-wider">Você confirma que:</p>
          <div className="space-y-2.5">
            <AckCheckbox checked={ack1} onChange={setAck1}>
              É o titular desta conta e tem autoridade para excluí-la.
            </AckCheckbox>
            <AckCheckbox checked={ack2} onChange={setAck2}>
              Entendi que perderei acesso permanente aos dados operacionais (fichas, insumos, etc.).
            </AckCheckbox>
            <AckCheckbox checked={ack3} onChange={setAck3}>
              Estou ciente de que esta ação é <strong className="text-[#E5484D]">irreversível</strong>.
            </AckCheckbox>
          </div>
        </div>

        {/* Acoes — em mobile empilha (Continuar em cima, Voltar embaixo) */}
        <div className="flex flex-col-reverse sm:flex-row sm:justify-between gap-3 pt-3 border-t border-white/[0.04]">
          <button type="button" onClick={onBack}
            className="text-[12px] text-[#868686] hover:text-white font-semibold transition-colors px-3 py-2.5 sm:py-2">
            ← Voltar
          </button>
          <button type="button" onClick={onContinue} disabled={!allAck}
            className="bg-[#E5484D] hover:bg-[#C73B40] disabled:bg-[#2A2A2C] disabled:text-[#5C5C5E] disabled:cursor-not-allowed text-white font-bold text-[12px] px-5 py-2.5 rounded-[10px] transition-colors w-full sm:w-auto">
            Continuar para confirmação
          </button>
        </div>
      </div>
    </div>
  );
};

// ─── STEP 2 — Confirmacao final com type-to-confirm ────────────────────────
const Step2Confirm = ({ hash, restaurantName, userEmail, onBack }) => {
  const [pwd, setPwd] = useState('');
  const [typedEmail, setTypedEmail] = useState('');
  const [typedConfirm, setTypedConfirm] = useState('');
  const [unlocked, setUnlocked] = useState(false);
  const [countdown, setCountdown] = useState(5);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const CONFIRM_PHRASE = 'EXCLUIR PERMANENTEMENTE';

  // Block de 5s com countdown visivel
  useEffect(() => {
    if (countdown <= 0) { setUnlocked(true); return; }
    const t = setTimeout(() => setCountdown(c => c - 1), 1000);
    return () => clearTimeout(t);
  }, [countdown]);

  const emailMatches = typedEmail.trim().toLowerCase() === (userEmail || '').toLowerCase();
  const phraseMatches = typedConfirm === CONFIRM_PHRASE;
  const canSubmit = unlocked && pwd && emailMatches && phraseMatches && !loading;

  const handleSubmit = async () => {
    setError(''); setLoading(true);
    try {
      const res = await fetch(`/api/client/${hash}/request-delete-account`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ oldPassword: pwd, confirmText: 'EXCLUIR' }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || 'Erro ao processar a exclusão.');
        setLoading(false);
        return;
      }
      setSuccess(data.message || 'Conta encerrada.');
      setTimeout(() => {
        try { sessionStorage.clear(); localStorage.removeItem('breakr-token'); }
        catch { /* ignore */ }
        window.location.href = '/';
      }, 2200);
    } catch (err) {
      console.error(err);
      setError('Erro de conexão. Tente novamente.');
      setLoading(false);
    }
  };

  return (
    <div className="border-2 border-[#E5484D]/50 rounded-[14px] overflow-hidden">
      <StepHeader current={2} />

      <div className="px-5 py-5 bg-[#0F0F11]">
        <div className="bg-[#E5484D]/[0.08] border border-[#E5484D]/30 rounded-[10px] p-4 mb-5">
          <div className="flex items-start gap-2 mb-1">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#E5484D" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="shrink-0 mt-0.5">
              <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/>
              <line x1="12" y1="9" x2="12" y2="13"/>
              <line x1="12" y1="17" x2="12.01" y2="17"/>
            </svg>
            <p className="text-[12px] text-white font-semibold">Última oportunidade para voltar atrás</p>
          </div>
          <p className="text-[11px] text-[#CFCFCF] leading-relaxed pl-6">
            Você está prestes a excluir <strong className="text-[#E5484D]">{restaurantName}</strong> permanentemente.
            Não há como desfazer.
          </p>
        </div>

        <div className="space-y-4">
          <div>
            <label className="block text-[11px] font-semibold text-[#868686] mb-1.5">
              1. Digite seu email para confirmar
            </label>
            <input
              type="email" value={typedEmail} onChange={e => setTypedEmail(e.target.value)} autoComplete="off"
              placeholder={userEmail || 'seu@email.com'}
              className={`w-full bg-[#1A1A1A] border rounded-[10px] px-3.5 py-2.5 text-[13px] text-white outline-none transition-colors ${
                emailMatches ? 'border-[#00B37E]/60' : 'border-white/[0.08] focus:border-[#E5484D]/60'
              }`}
            />
            {typedEmail && !emailMatches && (
              <p className="text-[10px] text-[#E5484D] mt-1">Email não confere com sua conta.</p>
            )}
          </div>

          <div>
            <label className="block text-[11px] font-semibold text-[#868686] mb-1.5">
              2. Digite <code className="text-[#E5484D] font-bold">{CONFIRM_PHRASE}</code> para confirmar
            </label>
            <input
              type="text" value={typedConfirm} onChange={e => setTypedConfirm(e.target.value)} autoComplete="off"
              placeholder={CONFIRM_PHRASE}
              className={`w-full bg-[#1A1A1A] border rounded-[10px] px-3.5 py-2.5 text-[13px] text-white outline-none transition-colors font-mono ${
                phraseMatches ? 'border-[#00B37E]/60' : 'border-white/[0.08] focus:border-[#E5484D]/60'
              }`}
            />
          </div>

          <div>
            <label className="block text-[11px] font-semibold text-[#868686] mb-1.5">
              3. Sua senha atual
            </label>
            <input
              type="password" value={pwd} onChange={e => setPwd(e.target.value)} autoComplete="current-password"
              placeholder="••••••••"
              className="w-full bg-[#1A1A1A] border border-white/[0.08] rounded-[10px] px-3.5 py-2.5 text-[13px] text-white outline-none focus:border-[#E5484D]/60 transition-colors"
            />
          </div>
        </div>

        {error && <p className="text-[12px] text-[#E5484D] mt-4">{error}</p>}
        {success && (
          <div className="mt-4 p-3 bg-[#00B37E]/10 border border-[#00B37E]/30 rounded-[10px]">
            <p className="text-[12px] text-[#00B37E] font-semibold">{success}</p>
            <p className="text-[11px] text-[#868686] mt-1">Redirecionando…</p>
          </div>
        )}

        <div className="flex flex-col-reverse sm:flex-row sm:justify-between gap-3 mt-6 pt-5 border-t border-white/[0.04]">
          <button type="button" onClick={onBack} disabled={loading}
            className="text-[12px] text-[#868686] hover:text-white font-semibold transition-colors px-3 py-2.5 sm:py-2 disabled:opacity-50">
            ← Voltar
          </button>
          <button type="button" onClick={handleSubmit} disabled={!canSubmit}
            className="bg-[#E5484D] hover:bg-[#C73B40] disabled:bg-[#2A2A2C] disabled:text-[#5C5C5E] disabled:cursor-not-allowed text-white font-bold text-[12px] px-5 py-2.5 rounded-[10px] transition-colors w-full sm:w-auto">
            {loading ? 'Excluindo…' : unlocked ? 'Excluir permanentemente' : `Aguarde ${countdown}s…`}
          </button>
        </div>
      </div>
    </div>
  );
};

// ─── Subcomponentes ──────────────────────────────────────────────────────────

const StepHeader = ({ current }) => (
  <div className="px-4 sm:px-5 py-3 bg-[#E5484D]/10 border-b border-[#E5484D]/20 flex items-center gap-2 sm:gap-3 flex-wrap">
    {[1, 2].map(n => (
      <div key={n} className="flex items-center gap-2">
        <div className={`w-6 h-6 rounded-full flex items-center justify-center text-[11px] font-bold ${
          n === current ? 'bg-[#E5484D] text-white' :
          n < current ? 'bg-[#E5484D]/30 text-white' : 'bg-[#252527] text-[#5C5C5E]'
        }`}>
          {n}
        </div>
        {n < 2 && <div className={`w-8 h-px ${n < current ? 'bg-[#E5484D]/40' : 'bg-[#252527]'}`} />}
      </div>
    ))}
    <span className="text-[11px] text-[#CFCFCF] font-semibold ml-2 hidden sm:inline">
      {current === 1 ? 'Avisos e consentimento' : 'Confirmação final'}
    </span>
  </div>
);

const Consequence = ({ text, critical }) => (
  <li className="flex items-start gap-2.5">
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={critical ? '#E5484D' : '#868686'} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="mt-0.5 shrink-0">
      <line x1="5" y1="12" x2="19" y2="12"/>
    </svg>
    <span className={critical ? 'text-[#E5484D] font-semibold' : ''}>{text}</span>
  </li>
);

const AckCheckbox = ({ checked, onChange, children }) => (
  <label className={`flex items-start gap-3 p-3 rounded-[10px] cursor-pointer transition-colors ${
    checked ? 'bg-[#00B37E]/5 border border-[#00B37E]/20' : 'bg-[#1A1A1A] border border-white/[0.06] hover:border-white/[0.12]'
  }`}>
    <div className={`w-4 h-4 rounded-[4px] border-2 flex items-center justify-center shrink-0 mt-0.5 transition-colors ${
      checked ? 'bg-[#00B37E] border-[#00B37E]' : 'border-[#3A3A3C]'
    }`}>
      {checked && (
        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="#0F0F11" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round">
          <polyline points="20 6 9 17 4 12"/>
        </svg>
      )}
    </div>
    <input type="checkbox" checked={checked} onChange={e => onChange(e.target.checked)} className="sr-only" />
    <span className="text-[12px] text-white leading-relaxed flex-1">{children}</span>
  </label>
);

export default ConfigZonaPerigo;
