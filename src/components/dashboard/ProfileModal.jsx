import React, { useState, useEffect, useRef } from 'react';

// Converts "YYYY-MM-DD" (legacy type="date" value) → "DD/MM/AAAA"
const toDisplayDate = (val) => {
  if (!val) return '';
  if (/^\d{4}-\d{2}-\d{2}$/.test(val)) {
    const [y, m, d] = val.split('-');
    return `${d}/${m}/${y}`;
  }
  return val;
};

// ─── Crop Modal ───────────────────────────────────────────────────────────────
const CropModal = ({ imageSrc, onConfirm, onCancel }) => {
  const CONTAINER = 280;
  const CROP_R = 110;
  const OUTPUT = 256;

  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [dragging, setDragging] = useState(false);
  const [lastPos, setLastPos] = useState(null);
  const [natSize, setNatSize] = useState({ w: 1, h: 1 });
  const imgRef = useRef(null);

  const minZoom = Math.max((CROP_R * 2) / natSize.w, (CROP_R * 2) / natSize.h) || 0.5;
  const dispW = natSize.w * zoom;
  const dispH = natSize.h * zoom;

  const handleImgLoad = () => {
    const { naturalWidth: w, naturalHeight: h } = imgRef.current;
    setNatSize({ w, h });
    const mz = Math.max((CROP_R * 2) / w, (CROP_R * 2) / h);
    setZoom(mz);
  };

  const onDown = (e) => {
    e.currentTarget.setPointerCapture(e.pointerId);
    setDragging(true);
    setLastPos({ x: e.clientX, y: e.clientY });
  };
  const onMove = (e) => {
    if (!dragging || !lastPos) return;
    setOffset(prev => ({ x: prev.x + e.clientX - lastPos.x, y: prev.y + e.clientY - lastPos.y }));
    setLastPos({ x: e.clientX, y: e.clientY });
  };
  const onUp = () => { setDragging(false); setLastPos(null); };

  const handleConfirm = () => {
    const canvas = document.createElement('canvas');
    canvas.width = OUTPUT; canvas.height = OUTPUT;
    const ctx = canvas.getContext('2d');
    ctx.beginPath();
    ctx.arc(OUTPUT / 2, OUTPUT / 2, OUTPUT / 2, 0, Math.PI * 2);
    ctx.clip();

    const imgX = CONTAINER / 2 - dispW / 2 + offset.x;
    const imgY = CONTAINER / 2 - dispH / 2 + offset.y;
    const cropX = CONTAINER / 2 - CROP_R;
    const cropY = CONTAINER / 2 - CROP_R;
    const ratio = natSize.w / dispW;

    ctx.drawImage(
      imgRef.current,
      (cropX - imgX) * ratio, (cropY - imgY) * ratio,
      CROP_R * 2 * ratio, CROP_R * 2 * ratio,
      0, 0, OUTPUT, OUTPUT
    );
    onConfirm(canvas.toDataURL('image/jpeg', 0.9));
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/90">
      <div className="bg-[#161616] border border-[#2A2A2C] rounded-[20px] p-5 w-[320px] font-jakarta">
        <h3 className="text-[15px] font-bold text-white mb-1">Ajustar Foto</h3>
        <p className="text-[11px] text-[#666] mb-4">Arraste para reposicionar</p>

        {/* Crop container */}
        <div
          className="relative mx-auto mb-4 overflow-hidden rounded-[10px] bg-black select-none"
          style={{ width: CONTAINER, height: CONTAINER, cursor: dragging ? 'grabbing' : 'grab' }}
          onPointerDown={onDown}
          onPointerMove={onMove}
          onPointerUp={onUp}
          onPointerLeave={onUp}
        >
          <img
            ref={imgRef}
            src={imageSrc}
            onLoad={handleImgLoad}
            draggable={false}
            style={{
              position: 'absolute',
              width: dispW,
              height: dispH,
              left: CONTAINER / 2 - dispW / 2 + offset.x,
              top: CONTAINER / 2 - dispH / 2 + offset.y,
              pointerEvents: 'none',
              userSelect: 'none'
            }}
          />
          {/* Circle outline + dark overlay outside */}
          <div style={{
            position: 'absolute',
            top: CONTAINER / 2 - CROP_R,
            left: CONTAINER / 2 - CROP_R,
            width: CROP_R * 2,
            height: CROP_R * 2,
            borderRadius: '50%',
            boxShadow: `0 0 0 ${CONTAINER}px rgba(0,0,0,0.65)`,
            border: '2px solid #F5A623',
            pointerEvents: 'none'
          }} />
        </div>

        {/* Zoom slider */}
        <div className="flex items-center gap-3 mb-5">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#555" strokeWidth="2" strokeLinecap="round">
            <circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35M11 8v6M8 11h6"/>
          </svg>
          <input
            type="range"
            min={minZoom}
            max={minZoom * 4}
            step={0.01}
            value={zoom}
            onChange={e => setZoom(parseFloat(e.target.value))}
            className="flex-1 accent-[#F5A623] cursor-pointer"
          />
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#555" strokeWidth="2" strokeLinecap="round">
            <circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35M11 8v6M8 11h6"/>
          </svg>
        </div>

        <div className="flex gap-3">
          <button onClick={onCancel} className="flex-1 bg-[#252527] text-[#868686] font-medium text-[13px] rounded-[10px] py-2.5 hover:bg-[#333] transition-colors">Cancelar</button>
          <button onClick={handleConfirm} className="flex-1 bg-[#F5A623] text-black font-bold text-[13px] rounded-[10px] py-2.5 hover:bg-[#E5961E] transition-colors">Confirmar</button>
        </div>
      </div>
    </div>
  );
};

// ─── Profile Modal ─────────────────────────────────────────────────────────────
const ProfileModal = ({ isOpen, onClose, currentName, hash, onLogout, onNameUpdated, clientEmail, clientPhone, clientCpf, clientBirthday, clientPhoto, onPhotoUpdated, isAdminViewing, adminName, adminRole }) => {
  const [name, setName] = useState(currentName || '');
  const [email, setEmail] = useState(clientEmail || '');
  const [phone, setPhone] = useState(clientPhone || '');
  const [cpf, setCpf] = useState(clientCpf || '');
  const [birthday, setBirthday] = useState(toDisplayDate(clientBirthday || ''));
  const [photo, setPhoto] = useState(clientPhoto || '');
  const [cropSrc, setCropSrc] = useState(null); // raw image for crop modal
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const fileInputRef = useRef(null);

  useEffect(() => {
    if (isOpen) {
      setName(currentName || '');
      setEmail(clientEmail || '');
      setPhone(clientPhone || '');
      setCpf(clientCpf || '');
      setBirthday(toDisplayDate(clientBirthday || ''));
      setPhoto(clientPhoto || '');
      setCropSrc(null);
      setPassword('');
      setConfirmPassword('');
      setError('');
      setSuccess('');
    }
  }, [isOpen, currentName, clientEmail, clientPhone, clientCpf, clientBirthday, clientPhoto]);

  if (!isOpen) return null;

  // ── Admin view ──
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
              <svg width="14" height="14" viewBox="0 0 14 14" fill="none"><path d="M1 1L13 13M1 13L13 1" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/></svg>
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
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#F5A623" strokeWidth="2" strokeLinecap="round" className="shrink-0 mt-0.5"><circle cx="12" cy="12" r="10"/><path d="M12 16v-4M12 8h.01"/></svg>
            <p className="text-[12px] text-[#868686] leading-relaxed">Você está visualizando o dashboard de um cliente. As credenciais deste cliente não são exibidas por segurança.</p>
          </div>
          <button
            onClick={() => { sessionStorage.removeItem('breaker-admin'); sessionStorage.removeItem('breaker-admin-role'); window.location.href = window.location.pathname; }}
            className="w-full bg-transparent border border-[#333] hover:bg-[#202020] text-[#868686] hover:text-white font-semibold text-[14px] rounded-[14px] py-3 transition-colors flex items-center justify-center gap-2"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none"><path d="M15 3H19C19.5304 3 20.0391 3.21071 20.4142 3.58579C20.7893 3.96086 21 4.46957 21 5V19C21 19.5304 20.7893 20.0391 20.4142 20.4142C20.0391 20.7893 19.5304 21 19 21H15M10 17L15 12M15 12L10 7M15 12H3" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>
            Sair da Conta Admin
          </button>
        </div>
      </div>
    );
  }

  // ── File selected → open crop modal ──
  const handleFileChange = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => setCropSrc(ev.target.result);
    reader.readAsDataURL(file);
    e.target.value = ''; // reset so same file can be re-selected
  };

  const handleCropConfirm = (croppedBase64) => {
    setPhoto(croppedBase64);
    setCropSrc(null);
  };

  // ── Save ──
  const handleUpdate = async () => {
    setError('');
    setSuccess('');
    if (password && password !== confirmPassword) { setError('As senhas não coincidem.'); return; }
    setLoading(true);
    try {
      const payload = {};
      if (name !== currentName) payload.name = name;
      if (email !== (clientEmail || '')) payload.email = email;
      if (phone !== (clientPhone || '')) payload.phone = phone;
      if (cpf !== (clientCpf || '')) payload.cpf = cpf;
      if (birthday !== toDisplayDate(clientBirthday || '')) payload.birthday = birthday;
      if (photo !== (clientPhoto || '')) payload.photo = photo;
      if (password) payload.password = password;

      if (Object.keys(payload).length === 0) { setLoading(false); onClose(); return; }

      const res = await fetch(`/api/client/${hash}/profile`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error || 'Erro ao atualizar perfil.'); setLoading(false); return; }

      setSuccess('Perfil atualizado com sucesso!');
      if (payload.name && onNameUpdated) onNameUpdated(payload.name);
      if (payload.photo && onPhotoUpdated) onPhotoUpdated(payload.photo);
      setTimeout(() => { setLoading(false); onClose(); }, 1500);
    } catch (err) {
      console.error(err);
      setError('Erro de conexão. Tente novamente.');
      setLoading(false);
    }
  };

  const initials = name ? name.substring(0, 2).toUpperCase() : 'U';

  return (
    <>
      {/* Crop Modal (above profile modal) */}
      {cropSrc && (
        <CropModal
          imageSrc={cropSrc}
          onConfirm={handleCropConfirm}
          onCancel={() => setCropSrc(null)}
        />
      )}

      <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
        <div onClick={onClose} className="absolute inset-0 bg-black/80 backdrop-blur-sm" />

        <div className="relative w-full max-w-md bg-[#161616] border border-[#2A2A2C] rounded-[24px] p-4 sm:p-6 shadow-2xl overflow-y-auto max-h-[90vh] font-jakarta">
          {/* Header */}
          <div className="flex justify-between items-center mb-6">
            <h2 className="text-xl font-bold text-white">Seu Perfil</h2>
            <button onClick={onClose} className="w-8 h-8 rounded-full bg-[#252527] flex items-center justify-center text-[#868686] hover:text-white transition-colors">
              <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                <path d="M1 1L13 13M1 13L13 1" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
              </svg>
            </button>
          </div>

          <div className="flex flex-col gap-5">
            {/* Photo */}
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
                >
                  <svg width="11" height="11" viewBox="0 0 24 24" fill="none">
                    <path d="M12 20h9M16.5 3.5a2.121 2.121 0 013 3L7 19l-4 1 1-4L16.5 3.5z" stroke="black" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                  </svg>
                </button>
                <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={handleFileChange} />
              </div>
              <div>
                <p className="text-[13px] font-semibold text-white">{name || 'Seu nome'}</p>
                <button onClick={() => fileInputRef.current?.click()} className="text-[11px] text-[#F5A623] hover:underline mt-0.5">
                  {photo ? 'Alterar foto' : 'Adicionar foto'}
                </button>
              </div>
            </div>

            <div className="h-px w-full bg-[#2A2A2C]/50" />

            {/* Name */}
            <div>
              <label className="block text-[12px] font-semibold text-[#666] mb-2 uppercase tracking-wider pl-1">Nome Completo</label>
              <input type="text" value={name} onChange={e => setName(e.target.value)}
                className="w-full bg-[#1A1A1A] border border-[#2A2A2C] rounded-[16px] px-5 py-3.5 text-[15px] text-white outline-none focus:border-[#F5A623] transition-all"
                placeholder="Seu nome" />
            </div>

            {/* Email */}
            <div>
              <label className="block text-[12px] font-semibold text-[#666] mb-2 uppercase tracking-wider pl-1">E-mail</label>
              <input type="email" value={email} onChange={e => setEmail(e.target.value)}
                className="w-full bg-[#1A1A1A] border border-[#2A2A2C] rounded-[16px] px-5 py-3.5 text-[15px] text-white outline-none focus:border-[#F5A623] transition-all"
                placeholder="seu@email.com" />
            </div>

            {/* Phone & CPF */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-[12px] font-semibold text-[#666] mb-2 uppercase tracking-wider pl-1">Telefone</label>
                <input type="tel" value={phone} onChange={e => setPhone(e.target.value)}
                  className="w-full bg-[#1A1A1A] border border-[#2A2A2C] rounded-[16px] px-5 py-3.5 text-[15px] text-white outline-none focus:border-[#F5A623] transition-all"
                  placeholder="(11) 99999-9999" />
              </div>
              <div>
                <label className="block text-[12px] font-semibold text-[#666] mb-2 uppercase tracking-wider pl-1">CPF</label>
                <input type="text" value={cpf} onChange={e => setCpf(e.target.value)}
                  className="w-full bg-[#1A1A1A] border border-[#2A2A2C] rounded-[16px] px-5 py-3.5 text-[15px] text-white outline-none focus:border-[#F5A623] transition-all"
                  placeholder="000.000.000-00" />
              </div>
            </div>

            {/* Birthday */}
            <div>
              <label className="block text-[12px] font-semibold text-[#666] mb-2 uppercase tracking-wider pl-1">Data de Nascimento</label>
              <input type="text" value={birthday} onChange={e => setBirthday(e.target.value)}
                className="w-full bg-[#1A1A1A] border border-[#2A2A2C] rounded-[16px] px-5 py-3.5 text-[15px] text-white outline-none focus:border-[#F5A623] transition-all"
                placeholder="DD/MM/AAAA" maxLength={10} />
            </div>

            <div className="h-px w-full bg-[#2A2A2C]/50" />

            {/* Password */}
            <div>
              <label className="block text-[12px] font-semibold text-[#666] mb-2 uppercase tracking-wider pl-1">Nova Senha</label>
              <input type="password" value={password} onChange={e => setPassword(e.target.value)}
                className="w-full bg-[#1A1A1A] border border-[#2A2A2C] rounded-[16px] px-5 py-3.5 text-[15px] text-white outline-none focus:border-[#F5A623] transition-all mb-3"
                placeholder="Deixe em branco para manter a atual" />
              <input type="password" value={confirmPassword} onChange={e => setConfirmPassword(e.target.value)}
                className="w-full bg-[#1A1A1A] border border-[#2A2A2C] rounded-[16px] px-5 py-3.5 text-[15px] text-white outline-none focus:border-[#F5A623] transition-all"
                placeholder="Confirme a nova senha" />
            </div>

            {error && <div className="text-red-500 text-[13px] font-medium px-1">{error}</div>}
            {success && <div className="text-[#E2FD89] text-[13px] font-medium px-1">{success}</div>}

            <div className="flex flex-col gap-3 mt-2">
              <button onClick={handleUpdate} disabled={loading}
                className="w-full bg-[#F5A623] hover:bg-[#E5961E] disabled:opacity-50 text-black font-bold text-[15px] rounded-[14px] py-4 transition-colors">
                {loading ? 'Salvando...' : 'Salvar Alterações'}
              </button>
              <button onClick={onLogout}
                className="w-full bg-transparent border border-[#333] hover:bg-[#202020] hover:border-[#444] text-[#868686] hover:text-white font-semibold text-[14px] rounded-[14px] py-3 transition-colors flex items-center justify-center gap-2">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
                  <path d="M15 3H19C19.5304 3 20.0391 3.21071 20.4142 3.58579C20.7893 3.96086 21 4.46957 21 5V19C21 19.5304 20.7893 20.0391 20.4142 20.4142C20.0391 20.7893 19.5304 21 19 21H15M10 17L15 12M15 12L10 7M15 12H3" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
                Sair da Conta
              </button>
            </div>
          </div>
        </div>
      </div>
    </>
  );
};

export default ProfileModal;
