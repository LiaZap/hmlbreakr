import { useState } from 'react';

const API_URL = import.meta.env.VITE_API_URL || '';

const MobileRegistration = ({ hash, onComplete }) => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  const handleSubmit = async () => {
    setError('');
    if (!email || !password) { setError('Preencha todos os campos.'); return; }
    if (password.length < 6) { setError('Senha deve ter no mínimo 6 caracteres.'); return; }
    if (password !== confirmPassword) { setError('As senhas não coincidem.'); return; }

    setIsSubmitting(true);
    try {
      const res = await fetch(`${API_URL}/api/client/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ hash, email, password })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Erro ao registrar');
      onComplete();
    } catch (err) {
      setError(err.message);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="px-1">
      <div className="text-center mb-6">
        <div className="w-14 h-14 bg-[#F5A623]/10 rounded-full flex items-center justify-center mx-auto mb-3">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
            <path d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" stroke="#F5A623" strokeWidth="2" strokeLinecap="round" />
          </svg>
        </div>
        <h2 className="text-[18px] font-bold text-white mb-1">Crie sua conta</h2>
        <p className="text-[13px] text-[#868686]">Defina seu email e senha para acessar o painel.</p>
      </div>

      {error && (
        <div className="mb-4 p-3 bg-red-500/10 rounded-[12px] border border-red-500/20">
          <p className="text-[12px] text-red-400">{error}</p>
        </div>
      )}

      <div className="space-y-4">
        <div>
          <label className="text-[12px] font-medium text-[#A0A0A0] mb-1.5 block">Email</label>
          <input
            className="w-full min-h-[48px] px-4 py-3 bg-[#2A2A2C] rounded-[12px] text-white text-[16px] outline-none border border-transparent focus:border-[#F5A623]"
            type="email"
            inputMode="email"
            enterKeyHint="next"
            placeholder="seu@email.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </div>
        <div>
          <label className="text-[12px] font-medium text-[#A0A0A0] mb-1.5 block">Senha</label>
          <div className="relative">
            <input
              className="w-full min-h-[48px] px-4 py-3 bg-[#2A2A2C] rounded-[12px] text-white text-[16px] outline-none border border-transparent focus:border-[#F5A623] pr-12"
              type={showPassword ? 'text' : 'password'}
              enterKeyHint="next"
              placeholder="Mínimo 6 caracteres"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
            <button
              className="absolute right-3 top-1/2 -translate-y-1/2 p-1"
              onClick={() => setShowPassword(!showPassword)}
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
                <path d={showPassword ? "M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" : "M17.94 17.94A10.07 10.07 0 0112 20c-7 0-11-8-11-8a18.45 18.45 0 015.06-5.94M9.9 4.24A9.12 9.12 0 0112 4c7 0 11 8 11 8a18.5 18.5 0 01-2.16 3.19m-6.72-1.07a3 3 0 11-4.24-4.24"} stroke="#868686" strokeWidth="1.5" strokeLinecap="round" />
                {!showPassword && <path d="M1 1l22 22" stroke="#868686" strokeWidth="1.5" strokeLinecap="round" />}
                {showPassword && <circle cx="12" cy="12" r="3" stroke="#868686" strokeWidth="1.5" />}
              </svg>
            </button>
          </div>
        </div>
        <div>
          <label className="text-[12px] font-medium text-[#A0A0A0] mb-1.5 block">Confirmar Senha</label>
          <input
            className="w-full min-h-[48px] px-4 py-3 bg-[#2A2A2C] rounded-[12px] text-white text-[16px] outline-none border border-transparent focus:border-[#F5A623]"
            type={showPassword ? 'text' : 'password'}
            enterKeyHint="done"
            placeholder="Repita a senha"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
          />
        </div>
      </div>

      <button
        className="w-full min-h-[52px] mt-6 bg-[#F5A623] rounded-full text-black font-bold text-[15px] flex items-center justify-center active:opacity-80 disabled:opacity-50"
        onClick={handleSubmit}
        disabled={isSubmitting}
      >
        {isSubmitting ? (
          <div className="w-5 h-5 border-2 border-black/30 border-t-black rounded-full animate-spin" />
        ) : 'Criar Conta e Finalizar'}
      </button>
    </div>
  );
};

export default MobileRegistration;
