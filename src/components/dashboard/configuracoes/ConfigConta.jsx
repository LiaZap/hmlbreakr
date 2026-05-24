/**
 * ConfigConta — secao Conta da pagina /configuracoes.
 *
 * Edita dados pessoais: foto, nome, email, telefone, CPF, data nascimento.
 * Para alterar email exige senha atual (anti-takeover, sec F5).
 */
import { useState, useEffect, useRef } from 'react';
import SectionHeader from './_SectionHeader';

const toDisplayDate = (val) => {
  if (!val) return '';
  if (/^\d{4}-\d{2}-\d{2}$/.test(val)) {
    const [y, m, d] = val.split('-');
    return `${d}/${m}/${y}`;
  }
  return val;
};

const ConfigConta = ({ dashboardData, hash }) => {
  const initialName     = dashboardData?.user?.name || '';
  const initialEmail    = dashboardData?._clientEmail || '';
  const initialPhone    = dashboardData?._profile?.phone || '';
  const initialCpf      = dashboardData?._profile?.cpf || '';
  const initialBirth    = toDisplayDate(dashboardData?._profile?.birthday || '');
  const initialPhoto    = dashboardData?._profile?.photo || dashboardData?.user?.photo || '';

  const [name, setName]   = useState(initialName);
  const [email, setEmail] = useState(initialEmail);
  const [phone, setPhone] = useState(initialPhone);
  const [cpf, setCpf]     = useState(initialCpf);
  const [birth, setBirth] = useState(initialBirth);
  const [photo, setPhoto] = useState(initialPhoto);
  const [oldPassword, setOldPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const fileInputRef = useRef(null);

  // Reseta state ao trocar de hash (admin viewing diferentes clientes, etc.)
  useEffect(() => {
    setName(initialName); setEmail(initialEmail); setPhone(initialPhone);
    setCpf(initialCpf); setBirth(initialBirth); setPhoto(initialPhoto);
    setError(''); setSuccess('');
  }, [hash, initialName, initialEmail, initialPhone, initialCpf, initialBirth, initialPhoto]);

  const handleFileChange = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => setPhoto(ev.target.result);
    reader.readAsDataURL(file);
    e.target.value = '';
  };

  const handleSave = async () => {
    setError(''); setSuccess(''); setLoading(true);
    try {
      const payload = {};
      if (name !== initialName) payload.name = name;
      if (email !== initialEmail) payload.email = email;
      if (phone !== initialPhone) payload.phone = phone;
      if (cpf !== initialCpf) payload.cpf = cpf;
      if (birth !== initialBirth) payload.birthday = birth;
      if (photo !== initialPhoto) payload.photo = photo;

      if (Object.keys(payload).length === 0) {
        setSuccess('Nada para salvar.');
        setLoading(false);
        return;
      }

      // Backend exige senha atual para alterar email
      if (payload.email) {
        if (!oldPassword) {
          setError('Para alterar o email, informe sua senha atual.');
          setLoading(false);
          return;
        }
        payload.oldPassword = oldPassword;
      }

      const res = await fetch(`/api/client/${hash}/profile`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || 'Erro ao atualizar perfil.');
        setLoading(false);
        return;
      }
      setSuccess('Alterações salvas com sucesso.');
      setOldPassword('');
    } catch (err) {
      console.error(err);
      setError('Erro de conexão. Tente novamente.');
    } finally {
      setLoading(false);
    }
  };

  const initials = (name || 'U').substring(0, 2).toUpperCase();

  return (
    <div>
      <SectionHeader title="Conta" description="Suas informações pessoais — usadas em comunicações e identificação." />

      {/* Bloco da foto */}
      <div className="bg-[#141416] border border-white/[0.06] rounded-[14px] p-5 mb-4">
        <div className="flex items-center gap-5">
          <div className="relative shrink-0">
            <div className="w-[72px] h-[72px] rounded-full bg-[#FDD688] flex items-center justify-center overflow-hidden">
              {photo
                ? <img src={photo} alt="Foto de perfil" className="w-full h-full object-cover" />
                : <span className="text-black font-bold text-[22px]">{initials}</span>}
            </div>
            <button type="button" onClick={() => fileInputRef.current?.click()}
              className="absolute -bottom-1 -right-1 w-7 h-7 rounded-full bg-[#1A1A1A] border border-white/10 hover:bg-[#252527] flex items-center justify-center transition-colors">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#F5A623" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/>
                <circle cx="12" cy="13" r="4"/>
              </svg>
            </button>
            <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={handleFileChange} />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-[14px] font-semibold text-white">Foto de perfil</p>
            <p className="text-[11px] text-[#868686] mt-0.5">JPG, PNG ou WEBP. Recomendado quadrado, 256×256.</p>
            <button type="button" onClick={() => fileInputRef.current?.click()}
              className="mt-2 text-[11px] text-[#F5A623] hover:underline font-semibold">
              {photo ? 'Alterar foto' : 'Adicionar foto'}
            </button>
          </div>
        </div>
      </div>

      {/* Form de dados */}
      <div className="bg-[#141416] border border-white/[0.06] rounded-[14px] p-5 space-y-4">
        <Field label="Nome completo" value={name} onChange={setName} placeholder="Seu nome" />
        <Field label="Email" value={email} onChange={setEmail} placeholder="seu@email.com" type="email" />
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Field label="Telefone" value={phone} onChange={setPhone} placeholder="(11) 99999-9999" type="tel" />
          <Field label="CPF" value={cpf} onChange={setCpf} placeholder="000.000.000-00" />
        </div>
        <Field label="Data de nascimento" value={birth} onChange={setBirth} placeholder="DD/MM/AAAA" maxLength={10} />

        {/* Senha atual — exibida só se mudou o email */}
        {email !== initialEmail && (
          <div className="pt-3 border-t border-white/[0.04]">
            <Field
              label="Senha atual (necessária para alterar email)"
              value={oldPassword}
              onChange={setOldPassword}
              type="password"
              placeholder="••••••••"
              highlight
              autoComplete="current-password"
            />
          </div>
        )}
      </div>

      {/* Feedback + ações */}
      {error && <p className="text-[12px] text-[#E5484D] mt-3">{error}</p>}
      {success && <p className="text-[12px] text-[#00B37E] mt-3">{success}</p>}

      <div className="flex justify-end mt-5">
        <button type="button" onClick={handleSave} disabled={loading}
          className="bg-[#F5A623] hover:bg-[#E5961E] disabled:opacity-50 disabled:cursor-not-allowed text-black font-bold text-[13px] px-5 py-2.5 rounded-[10px] transition-colors">
          {loading ? 'Salvando…' : 'Salvar alterações'}
        </button>
      </div>
    </div>
  );
};

// Subcomponente: campo de form padronizado
const Field = ({ label, value, onChange, placeholder, type = 'text', maxLength, highlight, autoComplete }) => (
  <div>
    <label className="block text-[11px] font-semibold text-[#868686] mb-1.5">{label}</label>
    <input
      type={type}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      maxLength={maxLength}
      autoComplete={autoComplete}
      className={`w-full bg-[#1A1A1A] border rounded-[10px] px-3.5 py-2.5 text-[13px] text-white outline-none transition-colors ${
        highlight
          ? 'border-[#F5A623]/40 focus:border-[#F5A623]'
          : 'border-white/[0.08] focus:border-[#F5A623]/60'
      }`}
    />
  </div>
);

export default ConfigConta;
