import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { SignIn, SignUp } from '@clerk/clerk-react';
import boltIcon from '../assets/bolt.svg';

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

// Clerk appearance overrides for login page (globals set in ClerkProvider)
const clerkAppearance = {
  elements: {
    card: { background: 'transparent', boxShadow: 'none', border: 'none', padding: 0 },
    headerTitle: { display: 'none' },
    headerSubtitle: { display: 'none' },
    header: { display: 'none' },
    socialButtonsBlockButton: { border: '1px solid #2A2A2C', background: '#1E1E1E', color: '#ffffff' },
    formButtonPrimary: {
      background: '#F5A623', color: '#000000', fontWeight: '700',
      borderRadius: '14px', height: '52px', fontSize: '15px',
    },
    footerActionLink: { color: '#F5A623' },
    formFieldInput: { background: '#1E1E1E', border: '1px solid #2A2A2C', color: '#ffffff', borderRadius: '14px', height: '48px' },
    formFieldLabel: { color: '#868686', fontSize: '12px', fontWeight: '600', textTransform: 'uppercase', letterSpacing: '0.05em' },
    dividerLine: { background: '#2A2A2C' },
    dividerText: { color: '#555' },
    identityPreviewText: { color: '#ffffff' },
    identityPreviewEditButton: { color: '#F5A623' },
    otpCodeFieldInput: { background: '#1E1E1E', border: '1px solid #2A2A2C', color: '#ffffff' },
    footer: { display: 'none' },
    formFieldInputShowPasswordButton: { color: '#868686' },
    alertText: { color: '#EF4444' },
  }
};

// ── Tab: Login Agência ────────────────────────────────────────────
const AgencyLoginTab = ({ onAgencyLogin, onForgot }) => {
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
        <div className="flex items-center justify-between mb-2">
          <label className="block text-[12px] font-semibold text-[#666] uppercase tracking-wider pl-1">Senha</label>
          <button type="button" onClick={onForgot} className="text-[11px] text-[#A78BFA]/80 hover:text-[#A78BFA] transition-colors">
            Esqueci minha senha
          </button>
        </div>
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

// ── Main Component ────────────────────────────────────────────────
const ClientLogin = ({ onLogin, onAdminLogin, onAgencyLogin }) => {
  const [tab, setTab] = useState('login'); // 'login' | 'signup' | 'agency'

  const mainTabs = [
    { id: 'login', label: 'Entrar' },
    { id: 'signup', label: 'Criar Conta' },
    { id: 'agency', label: 'Agência' },
  ];

  const titles = {
    login: { heading: 'Acesse seu Painel', sub: 'Entre com seu email e senha para acessar o dashboard.' },
    signup: { heading: 'Crie sua conta', sub: 'Cadastre seu restaurante e comece a ver seus números de verdade.' },
    agency: { heading: 'Painel da Agência', sub: 'Acesse o painel para gerenciar seus clientes.' },
  };

  const { heading, sub } = titles[tab];
  const accentColor = tab === 'agency' ? '#A78BFA' : '#F5A623';

  return (
    <div className="relative min-h-screen bg-black flex items-center justify-center font-jakarta text-white overflow-hidden">
      <video autoPlay muted loop playsInline className="absolute inset-0 w-full h-full object-cover" src="/login-bg.mp4" />
      <div className="absolute inset-0 bg-black/60" />

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6, ease: 'easeOut' }}
        className="relative z-10 w-full max-w-[420px] px-6 py-8 sm:p-10 flex flex-col items-center"
      >
        {/* Logo */}
        <div className="relative mb-8">
          <div className="absolute inset-0 blur-[20px] opacity-10 rounded-full" style={{ background: accentColor }} />
          <div className="relative w-[72px] h-[72px] bg-[#1E1E1E] border border-[#2A2A2C] rounded-[24px] flex items-center justify-center shadow-xl">
            <div className="w-[48px] h-[48px] bg-black rounded-[14px] flex items-center justify-center">
              <img src={boltIcon} alt="Breakr" className="w-[24px]" />
            </div>
          </div>
        </div>

        {/* Title */}
        <AnimatePresence mode="wait">
          <motion.div key={tab + '-title'} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }} transition={{ duration: 0.2 }} className="text-center mb-6">
            <h1 className="text-[26px] font-bold mb-2 tracking-tight">{heading}</h1>
            <p className="text-[#868686] text-[13px] leading-relaxed max-w-[280px] mx-auto">{sub}</p>
          </motion.div>
        </AnimatePresence>

        {/* Tabs */}
        <div className="flex w-full bg-[#161616] border border-[#2A2A2C] rounded-[14px] p-1 mb-6">
          {mainTabs.map(t => (
            <button key={t.id} onClick={() => setTab(t.id)}
              className={`flex-1 py-2.5 rounded-[10px] text-[12px] font-semibold transition-all ${
                tab === t.id
                  ? t.id === 'agency' ? 'bg-[#A78BFA] text-black' : 'bg-[#F5A623] text-black'
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
                <SignIn
                  routing="virtual"
                  appearance={clerkAppearance}
                  signUpUrl={undefined}
                />
              )}

              {tab === 'signup' && (
                <SignUp
                  routing="virtual"
                  appearance={clerkAppearance}
                  signInUrl={undefined}
                />
              )}

              {tab === 'agency' && (
                <AgencyLoginTab onAgencyLogin={onAgencyLogin} onForgot={() => {}} />
              )}

            </motion.div>
          </AnimatePresence>
        </div>
      </motion.div>
    </div>
  );
};

export default ClientLogin;
