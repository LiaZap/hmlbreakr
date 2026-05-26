/**
 * LegacyLoginModal — login alternativo via bcrypt pra clientes que ainda
 * NAO foram migrados pro Clerk. Solucao temporaria pro evento FISPAL
 * 2026 onde queremos que toda a base atual consiga entrar mesmo sem ter
 * passado pela migracao automatica (migrate-users-to-clerk.js).
 *
 * Fluxo:
 *   1. User clica em "Cliente antigo? Entre aqui" abaixo do widget Clerk
 *   2. Digita email + senha
 *   3. POST /api/client/login (endpoint bcrypt existente)
 *   4. Em sucesso → onLogin(hash) — mesma callback do AdminLoginTab
 *
 * Quando a migracao Clerk concluir 100%, esse modal pode ser removido
 * e o link no ClientLogin.jsx apagado (ou substituido por uma orientacao
 * "use Esqueci minha senha pra ativar a conta").
 */
import { useState } from 'react';

const API_URL = import.meta.env.VITE_API_URL || '';

const LegacyLoginModal = ({ onClose, onLogin }) => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    if (!email || !email.includes('@')) {
      setError('Digite um email válido.');
      return;
    }
    if (!password || password.length < 4) {
      setError('Digite sua senha.');
      return;
    }
    setLoading(true);
    try {
      const res = await fetch(`${API_URL}/api/client/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email.trim().toLowerCase(), password }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || 'Email ou senha incorretos.');
        return;
      }
      // /api/client/login retorna { hash, ... } pra clientes normais.
      // Mesma navegacao do AdminLoginTab.
      if (data.hash && onLogin) {
        onLogin(data.hash);
        onClose();
      } else {
        setError('Resposta inesperada do servidor.');
      }
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
                <path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4"/>
                <polyline points="10 17 15 12 10 7"/>
                <line x1="15" y1="12" x2="3" y2="12"/>
              </svg>
            </div>
            <div>
              <h2 className="text-[14px] font-bold text-white leading-tight">Login Cliente Existente</h2>
              <p className="text-[11px] text-[#868686] mt-0.5">Conta criada antes da migração Clerk</p>
            </div>
          </div>
          <button onClick={onClose} className="text-[#666] hover:text-white" aria-label="Fechar">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none"><path d="M18 6L6 18M6 6l12 12" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/></svg>
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-5">
          <div className="bg-[#5B8DEF]/[0.08] border border-[#5B8DEF]/30 rounded-[10px] p-3 mb-4">
            <p className="text-[11px] text-[#CFCFCF] leading-relaxed">
              Se você tem uma conta criada antes da nossa atualização de autenticação, use seus dados antigos aqui.
              Em breve sua conta será migrada automaticamente.
            </p>
          </div>

          <label className="block text-[11px] font-semibold text-[#868686] mb-1.5">Email</label>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="seu@email.com"
            autoComplete="email"
            autoFocus
            className="w-full bg-[#1A1A1A] border border-white/[0.08] rounded-[10px] px-3.5 py-3 text-base text-white outline-none focus:border-[#F5A623]/60 transition-colors mb-3"
          />

          <label className="block text-[11px] font-semibold text-[#868686] mb-1.5">Senha</label>
          <div className="relative mb-3">
            <input
              type={showPassword ? 'text' : 'password'}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Sua senha"
              autoComplete="current-password"
              className="w-full bg-[#1A1A1A] border border-white/[0.08] rounded-[10px] px-3.5 py-3 pr-11 text-base text-white outline-none focus:border-[#F5A623]/60 transition-colors"
            />
            <button
              type="button"
              tabIndex={-1}
              onClick={() => setShowPassword(s => !s)}
              className="absolute right-3.5 top-1/2 -translate-y-1/2 text-[#666] hover:text-white"
              aria-label={showPassword ? 'Ocultar senha' : 'Mostrar senha'}
            >
              {showPassword ? (
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M1 12C1 12 5 4 12 4C19 4 23 12 23 12C23 12 19 20 12 20C5 20 1 12 1 12Z"/><circle cx="12" cy="12" r="3"/></svg>
              ) : (
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M17.94 17.94A10.07 10.07 0 0112 20C5 20 1 12 1 12A18.45 18.45 0 015.06 5.06M9.9 4.24A9.12 9.12 0 0112 4C19 4 23 12 23 12A18.5 18.5 0 0119.18 16.58"/><path d="M1 1L23 23"/></svg>
              )}
            </button>
          </div>

          {error && <p className="text-[12px] text-[#E5484D] mb-3">{error}</p>}

          <div className="flex flex-col-reverse sm:flex-row sm:justify-end gap-3 mt-4">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2.5 bg-[#1A1A1A] hover:bg-[#252527] border border-white/[0.08] text-white text-[13px] font-semibold rounded-[10px] transition-colors"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={loading || !email || !password}
              className="w-full sm:w-auto px-5 py-2.5 bg-[#F5A623] hover:bg-[#E5961E] disabled:opacity-50 text-black font-bold text-[13px] rounded-[10px] transition-colors"
            >
              {loading ? 'Entrando…' : 'Entrar'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default LegacyLoginModal;
