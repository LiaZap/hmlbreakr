import React, { useState, useEffect, useRef } from 'react';

const ProfileModal = ({ isOpen, onClose, currentName, hash, onLogout, onNameUpdated, clientEmail, clientPhone, clientCpf, clientBirthday, clientPhoto, onPhotoUpdated, isAdminViewing, adminName, adminRole }) => {
  const [name, setName] = useState(currentName || '');
  const [email, setEmail] = useState(clientEmail || '');
  const [phone, setPhone] = useState(clientPhone || '');
  const [cpf, setCpf] = useState(clientCpf || '');
  const [birthday, setBirthday] = useState(clientBirthday || '');
  const [photo, setPhoto] = useState(clientPhoto || '');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const fileInputRef = useRef(null);

  // Sync state when modal opens or props change
  useEffect(() => {
    if (isOpen) {
      setName(currentName || '');
      setEmail(clientEmail || '');
      setPhone(clientPhone || '');
      setCpf(clientCpf || '');
      setBirthday(clientBirthday || '');
      setPhoto(clientPhoto || '');
      setPassword('');
      setConfirmPassword('');
      setError('');
      setSuccess('');
    }
  }, [isOpen, currentName, clientEmail, clientPhone, clientCpf, clientBirthday, clientPhoto]);

  if (!isOpen) return null;

  const handlePhotoChange = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const canvas = document.createElement('canvas');
    const img = new Image();
    const reader = new FileReader();

    reader.onload = (ev) => {
      img.onload = () => {
        const MAX = 256;
        let w = img.width, h = img.height;
        if (w > h) { h = Math.round(h * MAX / w); w = MAX; }
        else { w = Math.round(w * MAX / h); h = MAX; }
        canvas.width = w; canvas.height = h;
        canvas.getContext('2d').drawImage(img, 0, 0, w, h);
        setPhoto(canvas.toDataURL('image/jpeg', 0.85));
      };
      img.src = ev.target.result;
    };
    reader.readAsDataURL(file);
  };

  const handleUpdate = async () => {
    setError('');
    setSuccess('');

    if (password && password !== confirmPassword) {
      setError('As senhas não coincidem.');
      return;
    }

    setLoading(true);

    try {
      const payload = {};
      if (name !== currentName) payload.name = name;
      if (email !== (clientEmail || '')) payload.email = email;
      if (phone !== (clientPhone || '')) payload.phone = phone;
      if (cpf !== (clientCpf || '')) payload.cpf = cpf;
      if (birthday !== (clientBirthday || '')) payload.birthday = birthday;
      if (photo !== (clientPhoto || '')) payload.photo = photo;
      if (password) payload.password = password;

      if (Object.keys(payload).length === 0) {
        setLoading(false);
        onClose();
        return;
      }

      const res = await fetch(`/api/client/${hash}/profile`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.error || 'Erro ao atualizar perfil.');
        setLoading(false);
        return;
      }

      setSuccess('Perfil atualizado com sucesso!');
      if (payload.name && onNameUpdated) onNameUpdated(payload.name);
      if (payload.photo && onPhotoUpdated) onPhotoUpdated(payload.photo);

      setTimeout(() => {
        setLoading(false);
        onClose();
      }, 1500);

    } catch (err) {
      console.error(err);
      setError('Erro de conexão. Tente novamente.');
      setLoading(false);
    }
  };

  const initials = name ? name.substring(0, 2).toUpperCase() : 'U';

  // Admin viewing a client dashboard — show admin identity only, no client credentials
  if (isAdminViewing) {
    const adminInitials = adminName ? adminName.substring(0, 2).toUpperCase() : 'AD';
    const roleLabel = adminRole === 'super_admin' ? 'Super Admin' : 'Admin';
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
        <div onClick={onClose} className="absolute inset-0 bg-black/80 backdrop-blur-sm" />
        <div className="relative w-full max-w-sm bg-[#161616] border border-[#2A2A2C] rounded-[24px] p-6 shadow-2xl font-jakarta">
          <div className="flex justify-between items-center mb-6">
            <h2 className="text-xl font-bold text-white">Perfil Admin</h2>
            <button onClick={onClose} className="w-8 h-8 rounded-full bg-[#252527] flex items-center justify-center text-[#868686] hover:text-white transition-colors">
              <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                <path d="M1 1L13 13M1 13L13 1" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
              </svg>
            </button>
          </div>

          <div className="flex items-center gap-4 mb-6">
            <div className="w-[56px] h-[56px] rounded-full bg-[#FF9406]/20 border border-[#FF9406]/40 flex items-center justify-center shrink-0">
              <span className="text-[#FF9406] font-bold text-[18px]">{adminInitials}</span>
            </div>
            <div>
              <p className="text-[15px] font-bold text-white">{adminName}</p>
              <span className="inline-block mt-1 px-2.5 py-0.5 rounded-full bg-[#FF9406]/15 text-[#FF9406] text-[11px] font-semibold">{roleLabel}</span>
            </div>
          </div>

          <div className="p-3 bg-[#1A1A1A] border border-[#2A2A2C] rounded-[12px] mb-6 flex items-start gap-2">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#F5A623" strokeWidth="2" strokeLinecap="round" className="shrink-0 mt-0.5">
              <circle cx="12" cy="12" r="10"/><path d="M12 16v-4M12 8h.01"/>
            </svg>
            <p className="text-[12px] text-[#868686] leading-relaxed">
              Você está visualizando o dashboard de um cliente. As credenciais deste cliente não são exibidas por segurança.
            </p>
          </div>

          <button
            onClick={() => { sessionStorage.removeItem('breaker-admin'); sessionStorage.removeItem('breaker-admin-role'); window.location.href = window.location.pathname; }}
            className="w-full bg-transparent border border-[#333] hover:bg-[#202020] text-[#868686] hover:text-white font-semibold text-[14px] rounded-[14px] py-3 transition-colors flex items-center justify-center gap-2"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
              <path d="M15 3H19C19.5304 3 20.0391 3.21071 20.4142 3.58579C20.7893 3.96086 21 4.46957 21 5V19C21 19.5304 20.7893 20.0391 20.4142 20.4142C20.0391 20.7893 19.5304 21 19 21H15M10 17L15 12M15 12L10 7M15 12H3" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
            Sair da Conta Admin
          </button>
        </div>
      </div>
    );
  }

  return (
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
        {/* Backdrop */}
        <div
          onClick={onClose}
          className="absolute inset-0 bg-black/80 backdrop-blur-sm"
        />

        {/* Modal */}
        <div
          className="relative w-full max-w-md bg-[#161616] border border-[#2A2A2C] rounded-[24px] p-4 sm:p-6 lg:p-8 shadow-2xl overflow-hidden font-jakarta"
        >
          {/* Top Header */}
          <div className="flex justify-between items-center mb-6">
            <h2 className="text-xl font-bold text-white">Seu Perfil</h2>
            <button
              onClick={onClose}
              className="w-8 h-8 rounded-full bg-[#252527] flex items-center justify-center text-[#868686] hover:text-white transition-colors"
            >
              <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                <path d="M1 1L13 13M1 13L13 1" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
              </svg>
            </button>
          </div>

          <div className="flex flex-col gap-5">

            {/* Photo Upload */}
            <div className="flex items-center gap-4">
              <div className="relative shrink-0">
                <div className="w-[64px] h-[64px] rounded-full bg-[#FDD688] flex items-center justify-center overflow-hidden">
                  {photo ? (
                    <img src={photo} alt="Foto" className="w-full h-full object-cover" />
                  ) : (
                    <span className="text-black font-bold text-[20px]">{initials}</span>
                  )}
                </div>
                <button
                  onClick={() => fileInputRef.current?.click()}
                  className="absolute -bottom-1 -right-1 w-6 h-6 rounded-full bg-[#F5A623] flex items-center justify-center hover:bg-[#E5961E] transition-colors"
                  title="Alterar foto"
                >
                  <svg width="11" height="11" viewBox="0 0 24 24" fill="none">
                    <path d="M12 20h9M16.5 3.5a2.121 2.121 0 013 3L7 19l-4 1 1-4L16.5 3.5z" stroke="black" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                  </svg>
                </button>
                <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={handlePhotoChange} />
              </div>
              <div>
                <p className="text-[13px] font-semibold text-white">{name || 'Seu nome'}</p>
                <button
                  onClick={() => fileInputRef.current?.click()}
                  className="text-[11px] text-[#F5A623] hover:underline mt-0.5"
                >
                  {photo ? 'Alterar foto' : 'Adicionar foto'}
                </button>
              </div>
            </div>

            <div className="h-px w-full bg-[#2A2A2C]/50" />

            {/* Name Field */}
            <div>
              <label className="block text-[12px] font-semibold text-[#666] mb-2 uppercase tracking-wider pl-1">Nome Completo</label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="w-full bg-[#1A1A1A] border border-[#2A2A2C] rounded-[16px] px-5 py-3.5 text-[15px] text-white outline-none focus:border-[#F5A623] transition-all"
                placeholder="Seu nome"
              />
            </div>

            {/* Email Field */}
            <div>
              <label className="block text-[12px] font-semibold text-[#666] mb-2 uppercase tracking-wider pl-1">E-mail</label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full bg-[#1A1A1A] border border-[#2A2A2C] rounded-[16px] px-5 py-3.5 text-[15px] text-white outline-none focus:border-[#F5A623] transition-all"
                placeholder="seu@email.com"
              />
            </div>

            {/* Phone & CPF */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-[12px] font-semibold text-[#666] mb-2 uppercase tracking-wider pl-1">Telefone</label>
                <input
                  type="tel"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  className="w-full bg-[#1A1A1A] border border-[#2A2A2C] rounded-[16px] px-5 py-3.5 text-[15px] text-white outline-none focus:border-[#F5A623] transition-all"
                  placeholder="(11) 99999-9999"
                />
              </div>
              <div>
                <label className="block text-[12px] font-semibold text-[#666] mb-2 uppercase tracking-wider pl-1">CPF</label>
                <input
                  type="text"
                  value={cpf}
                  onChange={(e) => setCpf(e.target.value)}
                  className="w-full bg-[#1A1A1A] border border-[#2A2A2C] rounded-[16px] px-5 py-3.5 text-[15px] text-white outline-none focus:border-[#F5A623] transition-all"
                  placeholder="000.000.000-00"
                />
              </div>
            </div>

            {/* Birthday - text input DD/MM/AAAA */}
            <div>
              <label className="block text-[12px] font-semibold text-[#666] mb-2 uppercase tracking-wider pl-1">Data de Nascimento</label>
              <input
                type="text"
                value={birthday}
                onChange={(e) => setBirthday(e.target.value)}
                className="w-full bg-[#1A1A1A] border border-[#2A2A2C] rounded-[16px] px-5 py-3.5 text-[15px] text-white outline-none focus:border-[#F5A623] transition-all"
                placeholder="DD/MM/AAAA"
                maxLength={10}
              />
            </div>

            <div className="h-px w-full bg-[#2A2A2C]/50 my-1" />

            {/* Password section */}
            <div>
              <label className="block text-[12px] font-semibold text-[#666] mb-2 uppercase tracking-wider pl-1">Nova Senha</label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full bg-[#1A1A1A] border border-[#2A2A2C] rounded-[16px] px-5 py-3.5 text-[15px] text-white outline-none focus:border-[#F5A623] transition-all mb-3"
                placeholder="Deixe em branco para manter a atual"
              />
              <input
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                className="w-full bg-[#1A1A1A] border border-[#2A2A2C] rounded-[16px] px-5 py-3.5 text-[15px] text-white outline-none focus:border-[#F5A623] transition-all"
                placeholder="Confirme a nova senha"
              />
            </div>

            {/* Messages */}
            {error && <div className="text-red-500 text-[13px] font-medium px-1">{error}</div>}
            {success && <div className="text-[#E2FD89] text-[13px] font-medium px-1">{success}</div>}

            <div className="mt-4 flex flex-col gap-3">
              <button
                onClick={handleUpdate}
                disabled={loading}
                className="w-full bg-[#F5A623] hover:bg-[#E5961E] disabled:opacity-50 text-black font-bold text-[15px] rounded-[14px] py-4 transition-colors"
              >
                {loading ? 'Salvando...' : 'Salvar Alterações'}
              </button>

              <button
                onClick={onLogout}
                className="w-full bg-transparent border border-[#333] hover:bg-[#202020] hover:border-[#444] text-[#868686] hover:text-white font-semibold text-[14px] rounded-[14px] py-3 transition-colors flex items-center justify-center gap-2"
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
                  <path d="M15 3H19C19.5304 3 20.0391 3.21071 20.4142 3.58579C20.7893 3.96086 21 4.46957 21 5V19C21 19.5304 20.7893 20.0391 20.4142 20.4142C20.0391 20.7893 19.5304 21 19 21H15M10 17L15 12M15 12L10 7M15 12H3" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
                Sair da Conta
              </button>
            </div>

          </div>
        </div>
      </div>
  );
};

export default ProfileModal;
