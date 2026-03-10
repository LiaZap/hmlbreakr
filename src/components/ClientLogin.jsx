/* eslint-disable no-unused-vars */
import React, { useState } from 'react';
import { motion } from 'framer-motion';
import boltIcon from '../assets/bolt.svg';

const API_URL = import.meta.env.VITE_API_URL || '';

const ClientLogin = ({ onLogin }) => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleLogin = async (e) => {
    e.preventDefault();
    if (!email || !password) {
      setError('Preencha todos os campos.');
      return;
    }
    setLoading(true);
    setError('');

    try {
      const res = await fetch(`${API_URL}/api/client/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password })
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.error || 'Erro ao fazer login');
        setLoading(false);
        return;
      }

      onLogin(data.hash);
    } catch {
      setError('Erro de conexão. Tente novamente.');
      setLoading(false);
    }
  };

  return (
    <div className="relative min-h-screen bg-black flex items-center justify-center font-jakarta text-white overflow-hidden">

      {/* Video Background */}
      <video
        autoPlay
        muted
        loop
        playsInline
        className="absolute inset-0 w-full h-full object-cover"
        src="/login-bg.mp4"
      />

      {/* Dark Overlay */}
      <div className="absolute inset-0 bg-black/60" />

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6, ease: "easeOut" }}
        className="relative z-10 w-full max-w-[420px] p-10 flex flex-col items-center"
      >
        
        {/* Logo */}
        <div className="relative mb-10">
          <div className="absolute inset-0 bg-[#F5A623] blur-[20px] opacity-10 rounded-full" />
          <div className="relative w-[72px] h-[72px] bg-[#1E1E1E] border border-[#2A2A2C] rounded-[24px] flex items-center justify-center shadow-xl">
            <div className="w-[48px] h-[48px] bg-black rounded-[14px] flex items-center justify-center">
              <img src={boltIcon} alt="Breakr" className="w-[24px]" />
            </div>
          </div>
        </div>

        <div className="text-center mb-10">
          <h1 className="text-[28px] font-bold mb-2 tracking-tight">Acesse seu Painel</h1>
          <p className="text-[#868686] text-[14px] leading-relaxed max-w-[280px] mx-auto">
            Entre com seu email e senha para acessar o dashboard.
          </p>
        </div>

        <form onSubmit={handleLogin} className="w-full flex flex-col gap-5">
          {/* Email */}
          <div>
            <label className="block text-[12px] font-semibold text-[#666] mb-2 uppercase tracking-wider pl-1">Email</label>
            <div className="relative">
              <input 
                type="email" 
                value={email}
                onChange={(e) => { setEmail(e.target.value); setError(''); }}
                className={`w-full bg-[#161616] border ${error ? 'border-red-500/50' : 'border-[#2A2A2C]'} rounded-[16px] px-5 py-4 text-[15px] text-white outline-none focus:border-[#F5A623] focus:bg-[#1A1A1A] transition-all placeholder-[#444]`}
                placeholder="seu@email.com"
                autoFocus
              />
              <div className="absolute right-5 top-1/2 -translate-y-1/2 pointer-events-none">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" className={error ? "text-red-500" : "text-[#444]"}>
                  <rect x="3" y="5" width="18" height="14" rx="2" stroke="currentColor" strokeWidth="1.5"/>
                  <path d="M3 7L12 13L21 7" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
                </svg>
              </div>
            </div>
          </div>

          {/* Password */}
          <div>
            <label className="block text-[12px] font-semibold text-[#666] mb-2 uppercase tracking-wider pl-1">Senha</label>
            <div className="relative">
              <input 
                type="password" 
                value={password}
                onChange={(e) => { setPassword(e.target.value); setError(''); }}
                className={`w-full bg-[#161616] border ${error ? 'border-red-500/50' : 'border-[#2A2A2C]'} rounded-[16px] px-5 py-4 text-[15px] text-white outline-none focus:border-[#F5A623] focus:bg-[#1A1A1A] transition-all placeholder-[#444]`}
                placeholder="Digite sua senha..."
              />
              <div className="absolute right-5 top-1/2 -translate-y-1/2 pointer-events-none">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" className={error ? "text-red-500" : "text-[#444]"}>
                  <rect x="5" y="10" width="14" height="11" rx="2" stroke="currentColor" strokeWidth="1.5"/>
                  <path d="M12 15V16" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
                  <path d="M8 10V7C8 4.79086 9.79086 3 12 3C14.2091 3 16 4.79086 16 7V10" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
                </svg>
              </div>
            </div>
          </div>

          {/* Error */}
          <motion.div 
            initial={false}
            animate={{ height: error ? 'auto' : 0, opacity: error ? 1 : 0 }}
            className="overflow-hidden"
          >
            <div className="flex items-center gap-2 pl-1">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none">
                <circle cx="12" cy="12" r="10" stroke="#EF4444" strokeWidth="2"/>
                <path d="M12 8V12" stroke="#EF4444" strokeWidth="2" strokeLinecap="round"/>
                <circle cx="12" cy="16" r="1" fill="#EF4444"/>
              </svg>
              <span className="text-red-500 text-[12px] font-medium">{error}</span>
            </div>
          </motion.div>

          {/* Submit */}
          <button 
            type="submit"
            disabled={loading}
            className="relative w-full bg-[#F5A623] hover:bg-[#E5961E] disabled:bg-[#F5A623]/50 disabled:cursor-not-allowed text-black font-bold rounded-[16px] py-4 mt-2 transition-all active:scale-[0.98] shadow-[0_10px_30px_-10px_rgba(245,166,35,0.3)] hover:shadow-[0_15px_35px_-12px_rgba(245,166,35,0.4)]"
          >
            {loading ? (
              <div className="flex items-center justify-center gap-2">
                <div className="w-5 h-5 border-2 border-black/30 border-t-black rounded-full animate-spin" />
                <span>Entrando...</span>
              </div>
            ) : (
              "Entrar no Painel"
            )}
          </button>
        </form>


      </motion.div>
    </div>
  );
};

export default ClientLogin;
