/**
 * ForgotPasswordModal — fluxo de "Esqueci minha senha" pra clientes legacy
 * (bcrypt no banco do Breakr, sem sessao Clerk).
 *
 * 2 steps:
 *   1. Digite email → POST /api/auth/forgot-password → envia codigo por email
 *   2. Digite codigo + nova senha → POST /api/auth/reset-password → confirma
 *
 * O endpoint backend SEMPRE retorna success (evita email enumeration).
 * Se o email nao existe, o usuario nao recebe nada, mas a UI nao revela.
 */
import { useState } from 'react';

const ForgotPasswordModal = ({ onClose }) => {
  const [step, setStep] = useState(1); // 1 = email, 2 = code+pwd
  const [email, setEmail] = useState('');
  const [token, setToken] = useState('');
  const [newPwd, setNewPwd] = useState('');
  const [confirmPwd, setConfirmPwd] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const requestCode = async () => {
    setError('');
    if (!email || !email.includes('@')) {
      setError('Digite um email válido.');
      return;
    }
    setLoading(true);
    try {
      const res = await fetch('/api/auth/forgot-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email.trim().toLowerCase() }),
      });
      if (!res.ok) {
        setError('Erro ao processar solicitação. Tente novamente.');
        return;
      }
      // Sempre passa pro step 2 — backend retorna success mesmo se email
      // não existe (anti-enumeration). Se não existe, o usuário não vai
      // receber código mas a UI segue funcionando.
      setStep(2);
      setSuccess('Se este email estiver cadastrado, você receberá um código em até 1 minuto.');
    } catch {
      setError('Erro de conexão. Tente novamente.');
    } finally {
      setLoading(false);
    }
  };

  const resetPassword = async () => {
    setError(''); setSuccess('');
    if (!token || token.length < 4) {
      setError('Digite o código que chegou no seu email.');
      return;
    }
    if (!newPwd || newPwd.length < 6) {
      setError('A nova senha precisa ter no mínimo 6 caracteres.');
      return;
    }
    if (newPwd !== confirmPwd) {
      setError('As senhas não coincidem.');
      return;
    }
    setLoading(true);
    try {
      const res = await fetch('/api/auth/reset-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: email.trim().toLowerCase(),
          token: token.trim(),
          newPassword: newPwd,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || 'Código inválido ou expirado.');
        return;
      }
      setSuccess('Senha alterada! Você pode fazer login agora.');
      setTimeout(() => onClose(), 1800);
    } catch {
      setError('Erro de conexão. Tente novamente.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 font-jakarta">
      <div className="absolute inset-0 bg-black/85 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full max-w-md bg-[#161616] border border-[#2A2A2C] rounded-[20px] shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-white/[0.06]">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-full bg-[#F5A623]/15 flex items-center justify-center">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#F5A623" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                <rect x="3" y="11" width="18" height="11" rx="2"/>
                <path d="M7 11V7a5 5 0 0 1 10 0v4"/>
              </svg>
            </div>
            <div>
              <h2 className="text-[14px] font-bold text-white leading-tight">Recuperar senha</h2>
              <p className="text-[11px] text-[#868686] mt-0.5">Passo {step} de 2</p>
            </div>
          </div>
          <button onClick={onClose} className="text-[#666] hover:text-white" aria-label="Fechar">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none"><path d="M18 6L6 18M6 6l12 12" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/></svg>
          </button>
        </div>

        <div className="p-5">
          {step === 1 && (
            <>
              <p className="text-[12px] text-[#A0A0A0] mb-4 leading-relaxed">
                Digite seu email cadastrado. Vamos enviar um código de 6 dígitos pra você
                redefinir sua senha.
              </p>
              <label className="block text-[11px] font-semibold text-[#868686] mb-1.5">Email</label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="seu@email.com"
                autoComplete="email"
                autoFocus
                className="w-full bg-[#1A1A1A] border border-white/[0.08] rounded-[10px] px-3.5 py-3 text-base text-white outline-none focus:border-[#F5A623]/60 transition-colors"
              />
              {error && <p className="text-[12px] text-[#E5484D] mt-3">{error}</p>}

              <div className="flex flex-col-reverse sm:flex-row sm:justify-end gap-3 mt-5">
                <button type="button" onClick={onClose}
                  className="px-4 py-2.5 bg-[#1A1A1A] hover:bg-[#252527] border border-white/[0.08] text-white text-[13px] font-semibold rounded-[10px] transition-colors">
                  Cancelar
                </button>
                <button type="button" onClick={requestCode} disabled={loading || !email}
                  className="w-full sm:w-auto px-5 py-2.5 bg-[#F5A623] hover:bg-[#E5961E] disabled:opacity-50 text-black font-bold text-[13px] rounded-[10px] transition-colors">
                  {loading ? 'Enviando…' : 'Enviar código'}
                </button>
              </div>
            </>
          )}

          {step === 2 && (
            <>
              {success && (
                <div className="bg-[#5B8DEF]/[0.08] border border-[#5B8DEF]/30 rounded-[10px] p-3 mb-4">
                  <p className="text-[11px] text-[#CFCFCF] leading-relaxed">{success}</p>
                </div>
              )}
              <div className="space-y-3 mb-4">
                <div>
                  <label className="block text-[11px] font-semibold text-[#868686] mb-1.5">Código recebido (6 dígitos)</label>
                  <input
                    type="text" inputMode="numeric" value={token}
                    onChange={(e) => setToken(e.target.value.replace(/\D/g, '').slice(0, 6))}
                    placeholder="000000" maxLength={6} autoComplete="one-time-code"
                    autoFocus
                    className="w-full bg-[#1A1A1A] border border-white/[0.08] rounded-[10px] px-3.5 py-3 text-base text-white outline-none focus:border-[#F5A623]/60 transition-colors font-mono tracking-widest text-center"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-semibold text-[#868686] mb-1.5">Nova senha</label>
                  <input
                    type="password" value={newPwd}
                    onChange={(e) => setNewPwd(e.target.value)}
                    placeholder="Mínimo 6 caracteres" autoComplete="new-password"
                    className="w-full bg-[#1A1A1A] border border-white/[0.08] rounded-[10px] px-3.5 py-3 text-base text-white outline-none focus:border-[#F5A623]/60 transition-colors"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-semibold text-[#868686] mb-1.5">Confirmar nova senha</label>
                  <input
                    type="password" value={confirmPwd}
                    onChange={(e) => setConfirmPwd(e.target.value)}
                    placeholder="Repita a senha" autoComplete="new-password"
                    className="w-full bg-[#1A1A1A] border border-white/[0.08] rounded-[10px] px-3.5 py-3 text-base text-white outline-none focus:border-[#F5A623]/60 transition-colors"
                  />
                </div>
              </div>

              {error && <p className="text-[12px] text-[#E5484D] mb-3">{error}</p>}

              <div className="flex flex-col-reverse sm:flex-row sm:justify-between gap-3">
                <button type="button" onClick={() => { setStep(1); setError(''); setSuccess(''); }}
                  className="px-4 py-2.5 bg-transparent text-[#868686] hover:text-white text-[12px] font-semibold transition-colors">
                  ← Voltar
                </button>
                <button type="button" onClick={resetPassword} disabled={loading}
                  className="w-full sm:w-auto px-5 py-2.5 bg-[#F5A623] hover:bg-[#E5961E] disabled:opacity-50 text-black font-bold text-[13px] rounded-[10px] transition-colors">
                  {loading ? 'Salvando…' : 'Redefinir senha'}
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
};

export default ForgotPasswordModal;
