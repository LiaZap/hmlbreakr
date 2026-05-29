import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useSignIn } from '@clerk/clerk-react';
import ForgotPasswordModal from './ForgotPasswordModal';
import boltIcon from '../assets/bolt.svg';
import { setAdminSession } from '../utils/adminAuth';

const API_URL = import.meta.env.VITE_API_URL || '';

const inputClass = (hasError) =>
  `w-full bg-[#161616] border ${hasError ? 'border-red-500/50' : 'border-[#2A2A2C]'} rounded-[16px] px-5 py-4 text-[15px] text-white outline-none focus:border-[#F5A623] focus:bg-[#1A1A1A] transition-all placeholder-[#444]`;

const ErrorMsg = ({ msg }) => (
  <AnimatePresence>
    {msg && (
      <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="overflow-hidden">
        <div className="flex items-center gap-2 pl-1 pt-1">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="10" stroke="#EF4444" strokeWidth="2"/><path d="M12 8V12" stroke="#EF4444" strokeWidth="2" strokeLinecap="round"/><circle cx="12" cy="16" r="1" fill="#EF4444"/></svg>
          <span className="text-red-500 text-[12px] font-medium">{msg}</span>
        </div>
      </motion.div>
    )}
  </AnimatePresence>
);

// No local appearance — all styling handled by ClerkProvider in main.jsx

// ── Tab: Login Agência ────────────────────────────────────────────
const AgencyLoginTab = ({ onAgencyLogin }) => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!email || !password) { setError('Preencha todos os campos.'); return; }
    setLoading(true); setError('');
    try {
      const res = await fetch(`${API_URL}/api/agency/login`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password })
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error || 'Email ou senha incorretos'); return; }
      onAgencyLogin(data.hash);
    } catch { setError('Erro de conexão. Tente novamente.'); }
    finally { setLoading(false); }
  };

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-5">
      <div>
        <label className="block text-[12px] font-semibold text-[#666] mb-2 uppercase tracking-wider pl-1">Email da Agência</label>
        <input type="email" value={email} onChange={e => { setEmail(e.target.value); setError(''); }}
          className={inputClass(!!error)} placeholder="agencia@email.com" autoFocus />
      </div>
      <div>
        <label className="block text-[12px] font-semibold text-[#666] mb-2 uppercase tracking-wider pl-1">Senha</label>
        <div className="relative">
          <input type={showPassword ? 'text' : 'password'} value={password}
            onChange={e => { setPassword(e.target.value); setError(''); }}
            className={`${inputClass(!!error)} pr-12`} placeholder="Digite sua senha..." />
          <button type="button" onClick={() => setShowPassword(!showPassword)}
            className="absolute right-5 top-1/2 -translate-y-1/2" tabIndex={-1}>
            {showPassword
              ? <svg width="18" height="18" viewBox="0 0 24 24" fill="none" className="text-[#A78BFA]"><path d="M1 12C1 12 5 4 12 4C19 4 23 12 23 12C23 12 19 20 12 20C5 20 1 12 1 12Z" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/><circle cx="12" cy="12" r="3" stroke="currentColor" strokeWidth="1.5"/></svg>
              : <svg width="18" height="18" viewBox="0 0 24 24" fill="none" className="text-[#444]"><path d="M17.94 17.94A10.07 10.07 0 0112 20C5 20 1 12 1 12A18.45 18.45 0 015.06 5.06M9.9 4.24A9.12 9.12 0 0112 4C19 4 23 12 23 12A18.5 18.5 0 0119.18 16.58" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/><path d="M1 1L23 23" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/><path d="M14.12 14.12A3 3 0 019.88 9.88" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/></svg>
            }
          </button>
        </div>
      </div>
      <ErrorMsg msg={error} />
      <button type="submit" disabled={loading}
        className="w-full bg-[#A78BFA] hover:bg-[#9370F0] disabled:opacity-50 text-black font-bold rounded-[16px] py-4 mt-1 transition-all active:scale-[0.98] shadow-[0_10px_30px_-10px_rgba(167,139,250,0.3)]">
        {loading ? <div className="flex items-center justify-center gap-2"><div className="w-5 h-5 border-2 border-black/30 border-t-black rounded-full animate-spin" /><span>Entrando...</span></div> : 'Entrar como Agência'}
      </button>
      <div className="text-center">
        <p className="text-[12px] text-[#555]">Não tem conta de agência?{' '}
          <a href="mailto:contato@breakr.com.br" className="text-[#A78BFA] hover:underline">Fale conosco</a>
        </p>
      </div>
    </form>
  );
};

// ── Tab: Login Cliente UNIFICADO ──────────────────────────────────
// Substitui o widget <SignIn> do Clerk por um form custom que tenta
// autenticar via Clerk primeiro e, se o usuario NAO existir la (caso
// dos clientes pre-migracao), cai automaticamente pro endpoint legado
// bcrypt /api/client/login. Cliente nao percebe qual caminho foi usado.
//
// Botao Google preservado via signIn.authenticateWithRedirect (mesmo
// fluxo OAuth do widget Clerk original).
//
// Quando todos os clientes legacy forem migrados pro Clerk via
// scripts/migrate-users-to-clerk.js, o fallback bcrypt fica inoperante
// (nenhum cliente cai mais nele) mas o codigo nao precisa ser removido
// — apenas vira dead code seguro.
const UnifiedLoginTab = ({ onLogin }) => {
  const { signIn, setActive, isLoaded } = useSignIn();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  // Google OAuth — redirect via Clerk (mesmo fluxo do widget)
  const handleGoogleLogin = async () => {
    if (!isLoaded || !signIn) return;
    setError('');
    try {
      await signIn.authenticateWithRedirect({
        strategy: 'oauth_google',
        redirectUrl: '/sso-callback',
        redirectUrlComplete: '/',
      });
    } catch (err) {
      console.error('[google oauth] erro', err);
      setError('Não foi possível iniciar login com Google. Tente novamente.');
    }
  };

  // Email + senha — Clerk primeiro, bcrypt como fallback automatico
  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    if (!email || !email.includes('@')) { setError('Digite um email válido.'); return; }
    if (!password) { setError('Digite sua senha.'); return; }
    setLoading(true);

    // 1) Tenta autenticar via Clerk
    let tryLegacy = false;
    let clerkError = null;
    if (isLoaded && signIn) {
      try {
        const result = await signIn.create({ identifier: email.trim().toLowerCase(), password });
        if (result.status === 'complete') {
          await setActive({ session: result.createdSessionId });
          // ClerkProvider vai detectar a sessao e App.jsx redireciona
          return;
        }
        // Status diferente de 'complete' (raro — MFA por ex) — deixa Clerk lidar
        setError('Verificação adicional necessária. Tente novamente em alguns instantes.');
        setLoading(false);
        return;
      } catch (err) {
        clerkError = err;
        // Se o erro for "user nao existe" OU "senha incorreta" no Clerk,
        // pode ser que o cliente seja legacy (existe so no banco com bcrypt).
        // Codes do Clerk:
        //   form_identifier_not_found → email nao existe no Clerk
        //   form_password_incorrect   → senha errada (podemos tentar bcrypt)
        const codes = (err?.errors || []).map(e => e.code);
        if (codes.includes('form_identifier_not_found') || codes.includes('form_password_incorrect')) {
          tryLegacy = true;
        }
      }
    } else {
      // Clerk nao carregou ainda — tenta direto no bcrypt
      tryLegacy = true;
    }

    // 2) Fallback: tenta endpoint legacy bcrypt
    if (tryLegacy) {
      try {
        const res = await fetch(`${API_URL}/api/client/login`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email: email.trim().toLowerCase(), password }),
        });
        const data = await res.json();
        if (res.ok && data.hash && data.role !== 'admin') {
          onLogin(data.hash);
          return;
        }
        // Se chegou aqui sem hash, credenciais sao invalidas em ambos
        // (Clerk e bcrypt). Mostra mensagem generica pra nao revelar
        // existencia de conta.
        setError('Email ou senha incorretos.');
      } catch {
        setError('Erro de conexão. Tente novamente.');
      } finally {
        setLoading(false);
      }
      return;
    }

    // Erro Clerk que nao foi "user not found" — mostra mensagem do proprio Clerk
    const clerkMsg = clerkError?.errors?.[0]?.longMessage || clerkError?.errors?.[0]?.message || 'Não foi possível fazer login.';
    setError(clerkMsg);
    setLoading(false);
  };

  return (
    <div className="flex flex-col gap-4">
      {/* Google OAuth */}
      <button
        type="button"
        onClick={handleGoogleLogin}
        disabled={!isLoaded}
        className="flex items-center justify-center gap-3 w-full bg-[#161616] hover:bg-[#1A1A1A] border border-[#2A2A2C] rounded-[16px] py-3.5 text-[14px] font-medium text-white transition-colors disabled:opacity-60"
      >
        <svg width="18" height="18" viewBox="0 0 24 24">
          <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
          <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
          <path fill="#FBBC04" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
          <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84C6.71 7.31 9.14 5.38 12 5.38z"/>
        </svg>
        <span>Continuar com Google</span>
      </button>

      {/* Divider */}
      <div className="flex items-center gap-3 py-1">
        <div className="flex-1 h-px bg-[#2A2A2C]" />
        <span className="text-[11px] text-[#5C5C5E] uppercase tracking-wider">ou</span>
        <div className="flex-1 h-px bg-[#2A2A2C]" />
      </div>

      {/* Email + Senha */}
      <form onSubmit={handleSubmit} className="flex flex-col gap-3">
        <div>
          <label className="block text-[12px] font-semibold text-[#666] mb-2 uppercase tracking-wider pl-1">Seu e-mail</label>
          <input
            type="email"
            value={email}
            onChange={(e) => { setEmail(e.target.value); setError(''); }}
            className={inputClass(!!error)}
            placeholder="email@exemplo.com"
            autoComplete="email"
            autoFocus
          />
        </div>
        <div>
          <label className="block text-[12px] font-semibold text-[#666] mb-2 uppercase tracking-wider pl-1">Senha</label>
          <div className="relative">
            <input
              type={showPassword ? 'text' : 'password'}
              value={password}
              onChange={(e) => { setPassword(e.target.value); setError(''); }}
              className={`${inputClass(!!error)} pr-14`}
              placeholder="Digite sua senha"
              autoComplete="current-password"
            />
            <button
              type="button"
              tabIndex={-1}
              onClick={() => setShowPassword(s => !s)}
              className="absolute right-4 top-1/2 -translate-y-1/2 text-[#666] hover:text-white"
              aria-label={showPassword ? 'Ocultar senha' : 'Mostrar senha'}
            >
              {showPassword ? (
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6"><path d="M1 12C1 12 5 4 12 4C19 4 23 12 23 12C23 12 19 20 12 20C5 20 1 12 1 12Z"/><circle cx="12" cy="12" r="3"/></svg>
              ) : (
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6"><path d="M17.94 17.94A10.07 10.07 0 0112 20C5 20 1 12 1 12A18.45 18.45 0 015.06 5.06M9.9 4.24A9.12 9.12 0 0112 4C19 4 23 12 23 12A18.5 18.5 0 0119.18 16.58"/><path d="M1 1L23 23"/></svg>
              )}
            </button>
          </div>
        </div>
        <ErrorMsg msg={error} />
        <button
          type="submit"
          disabled={loading || !isLoaded}
          className="w-full bg-[#F5A623] hover:bg-[#E5961E] disabled:opacity-50 text-black font-bold rounded-[16px] py-4 mt-1 transition-all active:scale-[0.98] shadow-[0_10px_30px_-10px_rgba(245,166,35,0.4)]"
        >
          {loading
            ? <div className="flex items-center justify-center gap-2"><div className="w-5 h-5 border-2 border-black/30 border-t-black rounded-full animate-spin" /><span>Entrando...</span></div>
            : 'Continuar'}
        </button>
      </form>
    </div>
  );
};

// ── Tab: Admin Login (hidden) ─────────────────────────────────────
const AdminLoginTab = ({ onLogin, onAdminLogin }) => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!email || !password) { setError('Preencha todos os campos.'); return; }
    setLoading(true); setError('');
    try {
      const res = await fetch(`${API_URL}/api/client/login`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password })
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error || 'Credenciais incorretas'); return; }
      if (data.role === 'admin' && onAdminLogin) {
        // Persiste auth context: token, adminUserId, role, name
        setAdminSession({
          token: data.token,
          adminUserId: data.adminUserId,
          role: data.adminRole || 'admin',
          name: data.name,
        });
        onAdminLogin(data.adminRole || 'admin');
      } else {
        onLogin(data.hash);
      }
    } catch { setError('Erro de conexão.'); }
    finally { setLoading(false); }
  };

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-5">
      <div>
        <label className="block text-[12px] font-semibold text-[#666] mb-2 uppercase tracking-wider pl-1">Email</label>
        <input type="email" value={email} onChange={e => { setEmail(e.target.value); setError(''); }}
          className={inputClass(!!error)} placeholder="admin@breakr.com.br" autoFocus />
      </div>
      <div>
        <label className="block text-[12px] font-semibold text-[#666] mb-2 uppercase tracking-wider pl-1">Senha</label>
        <input type="password" value={password} onChange={e => { setPassword(e.target.value); setError(''); }}
          className={inputClass(!!error)} placeholder="Senha admin" />
      </div>
      <ErrorMsg msg={error} />
      <button type="submit" disabled={loading}
        className="w-full bg-[#EF4444] hover:bg-[#DC2626] disabled:opacity-50 text-white font-bold rounded-[16px] py-4 mt-1 transition-all active:scale-[0.98]">
        {loading ? <div className="flex items-center justify-center gap-2"><div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" /></div> : 'Entrar como Admin'}
      </button>
    </form>
  );
};

// ── Main Component ────────────────────────────────────────────────
const ClientLogin = ({ onLogin, onAdminLogin, onAgencyLogin }) => {
  const [tab, setTab] = useState('login');
  const [logoClicks, setLogoClicks] = useState(0);
  const [showForgotPwd, setShowForgotPwd] = useState(false);
  const showAdmin = logoClicks >= 5;

  const mainTabs = [
    { id: 'login', label: 'Entrar' },
    { id: 'signup', label: 'Criar Conta' },
    { id: 'agency', label: 'Agência' },
    ...(showAdmin ? [{ id: 'admin', label: 'Admin' }] : []),
  ];

  const titles = {
    login: { heading: 'Acesse seu Painel', sub: 'Entre com seu email e senha para acessar o dashboard.' },
    signup: { heading: 'Crie sua conta', sub: 'Cadastre seu restaurante e comece a ver seus números de verdade.' },
    agency: { heading: 'Painel da Agência', sub: 'Acesse o painel para gerenciar seus clientes.' },
    admin: { heading: 'Painel Admin', sub: 'Acesso restrito à equipe Breakr.' },
  };

  const { heading, sub } = titles[tab] || titles.login;
  const accentColor = tab === 'agency' ? '#A78BFA' : tab === 'admin' ? '#EF4444' : '#F5A623';

  return (
    <div className="relative min-h-screen bg-black flex items-center justify-center font-jakarta text-white overflow-y-auto">
      <video autoPlay muted loop playsInline className="absolute inset-0 w-full h-full object-cover" src="/login-bg.mp4" />
      <div className="absolute inset-0 bg-black/60" />

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6, ease: 'easeOut' }}
        className="relative z-10 w-full max-w-[460px] mx-4 my-8 bg-[#141416]/90 backdrop-blur-xl border border-[#2A2A2C]/50 rounded-[24px] px-5 pt-8 pb-6 sm:px-8 sm:pt-10 sm:pb-8 flex flex-col items-center overflow-hidden"
      >
        {/* Logo — tap 5x to reveal Admin tab */}
        <div className="relative mb-6 cursor-pointer select-none" onClick={() => setLogoClicks(c => c + 1)}>
          <div className="absolute inset-0 blur-[20px] opacity-10 rounded-full" style={{ background: accentColor }} />
          <div className="relative w-[64px] h-[64px] bg-[#1E1E1E] border border-[#2A2A2C] rounded-[20px] flex items-center justify-center shadow-xl">
            <div className="w-[42px] h-[42px] bg-black rounded-[12px] flex items-center justify-center">
              <img src={boltIcon} alt="Breakr" className="w-[22px]" />
            </div>
          </div>
        </div>

        {/* Title */}
        <AnimatePresence mode="wait">
          <motion.div key={tab + '-title'} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }} transition={{ duration: 0.2 }} className="text-center mb-5">
            <h1 className="text-[24px] font-bold mb-1.5 tracking-tight">{heading}</h1>
            <p className="text-[#868686] text-[13px] leading-relaxed max-w-[280px] mx-auto">{sub}</p>
          </motion.div>
        </AnimatePresence>

        {/* Tabs */}
        <div className="flex w-full bg-[#161616] border border-[#2A2A2C] rounded-[14px] p-1 mb-6">
          {mainTabs.map(t => (
            <button key={t.id} onClick={() => setTab(t.id)}
              className={`flex-1 py-2.5 rounded-[10px] text-[12px] font-semibold transition-all ${
                tab === t.id
                  ? t.id === 'agency' ? 'bg-[#A78BFA] text-black' : t.id === 'admin' ? 'bg-[#EF4444] text-white' : 'bg-[#F5A623] text-black'
                  : 'text-[#666] hover:text-white'
              }`}>
              {t.label}
            </button>
          ))}
        </div>

        {/* Tab Content */}
        <div className="w-full">
          <AnimatePresence mode="wait">
            <motion.div key={tab} initial={{ opacity: 0, x: tab === 'signup' ? 20 : tab === 'agency' ? 20 : -20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0 }} transition={{ duration: 0.2 }}>

              {tab === 'login' && (
                <>
                  <UnifiedLoginTab onLogin={onLogin} />
                  {/* Esqueci minha senha — funciona tanto pra contas Clerk
                      (envia via Clerk SDK) quanto pra contas legacy bcrypt
                      (POST /api/auth/forgot-password). */}
                  <div className="mt-4 text-center">
                    <button
                      type="button"
                      onClick={() => setShowForgotPwd(true)}
                      className="text-[12px] text-[#868686] hover:text-[#F5A623] transition-colors font-medium"
                    >
                      Esqueci minha senha
                    </button>
                  </div>
                </>
              )}

              {tab === 'signup' && (
                <SignupRedirect />
              )}

              {tab === 'agency' && (
                <AgencyLoginTab onAgencyLogin={onAgencyLogin} />
              )}

              {tab === 'admin' && (
                <AdminLoginTab onLogin={onLogin} onAdminLogin={onAdminLogin} />
              )}

            </motion.div>
          </AnimatePresence>
        </div>
      </motion.div>

      {/* Modal de Esqueci minha senha (funciona pra Clerk e legacy bcrypt) */}
      {showForgotPwd && <ForgotPasswordModal onClose={() => setShowForgotPwd(false)} />}
    </div>
  );
};

// ─── SignupRedirect ──────────────────────────────────────────────────────────
// TEMPORARIO (FISPAL 2026): a aba "Criar conta" redireciona pro Hub onde
// estao os 3 planos com Payment Link Stripe (FISPAL/Mensal/Anual). Cliente
// paga la → webhook /api/stripe/webhook auto-cria a conta no Breakr →
// welcome email com link magico pra entrar no app.
//
// Quando o Clerk Production estiver 100% estavel + verificacao Google
// aprovada, voltar o <SignUp routing="virtual" /> aqui pra cadastro
// direto pelo widget Clerk.
const SignupRedirect = () => {
  const HUB_URL = 'https://hub.breakr.com.br/';
  return (
    <div className="flex flex-col items-center text-center gap-5 py-4">
      <div className="w-14 h-14 rounded-full bg-[#F5A623]/15 flex items-center justify-center">
        <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="#F5A623" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
          <path d="M3 21h18M3 10h18M5 6l7-3 7 3M4 10v11M20 10v11M8 14v3M12 14v3M16 14v3"/>
        </svg>
      </div>
      <div>
        <h2 className="text-[16px] font-bold text-white mb-1.5">Comece sua jornada no Breakr</h2>
        <p className="text-[12px] text-[#A0A0A0] leading-relaxed max-w-[300px] mx-auto">
          Escolha o plano ideal pro seu restaurante no nosso hub.
          Depois do pagamento sua conta é criada automaticamente.
        </p>
      </div>
      <a
        href={HUB_URL}
        target="_self"
        rel="noopener"
        className="w-full bg-[#F5A623] hover:bg-[#E5961E] text-black font-bold text-[14px] rounded-[12px] py-3.5 transition-colors flex items-center justify-center gap-2"
      >
        Ver planos e criar conta
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M7 17L17 7M17 7H8M17 7V16"/>
        </svg>
      </a>
      <p className="text-[10px] text-[#5C5C5E]">
        Já tem conta? Use a aba <span className="text-[#F5A623] font-semibold">Entrar</span> ao lado.
      </p>
    </div>
  );
};

export default ClientLogin;
