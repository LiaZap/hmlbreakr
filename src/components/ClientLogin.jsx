import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { SignIn } from '@clerk/clerk-react';
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
                  <SignIn
                    routing="virtual"
                    appearance={undefined}
                  />
                  {/* Link 'Esqueci minha senha' — fallback pra clientes legacy
                      bcrypt que nao tem sessao Clerk (Clerk widget tem proprio,
                      mas nao funciona pra usuarios fora do Clerk). */}
                  <div className="mt-3 text-center">
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

      {/* Modal de Esqueci minha senha (legacy bcrypt) */}
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
