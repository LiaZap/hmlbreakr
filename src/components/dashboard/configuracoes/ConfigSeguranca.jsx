/**
 * ConfigSeguranca — secao Seguranca da pagina /configuracoes.
 *
 * Por enquanto: trocar senha (com oldPassword obrigatorio — sec F5).
 * Futuro: sessoes ativas, 2FA, recovery email.
 */
import { useState } from 'react';
import SectionHeader from './_SectionHeader';

const ConfigSeguranca = ({ hash }) => {
  const [oldPwd, setOldPwd] = useState('');
  const [newPwd, setNewPwd] = useState('');
  const [confirmPwd, setConfirmPwd] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const handleSave = async () => {
    setError(''); setSuccess('');
    if (!oldPwd) { setError('Digite sua senha atual.'); return; }
    if (!newPwd || newPwd.length < 6) { setError('A nova senha precisa ter no mínimo 6 caracteres.'); return; }
    if (newPwd !== confirmPwd) { setError('As senhas não coincidem.'); return; }
    setLoading(true);
    try {
      const res = await fetch(`/api/client/${hash}/profile`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password: newPwd, oldPassword: oldPwd }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || 'Erro ao trocar senha.');
        setLoading(false);
        return;
      }
      setSuccess('Senha alterada com sucesso.');
      setOldPwd(''); setNewPwd(''); setConfirmPwd('');
    } catch (err) {
      console.error(err);
      setError('Erro de conexão. Tente novamente.');
    } finally {
      setLoading(false);
    }
  };

  // Validacao visual de forca
  const strength = (() => {
    if (!newPwd) return null;
    let score = 0;
    if (newPwd.length >= 8)  score++;
    if (newPwd.length >= 12) score++;
    if (/[A-Z]/.test(newPwd)) score++;
    if (/[0-9]/.test(newPwd)) score++;
    if (/[^A-Za-z0-9]/.test(newPwd)) score++;
    return ['Muito fraca', 'Fraca', 'Razoável', 'Boa', 'Forte', 'Excelente'][score];
  })();
  const strengthColor = (() => {
    if (!strength) return '#5C5C5E';
    if (['Muito fraca', 'Fraca'].includes(strength)) return '#E5484D';
    if (['Razoável'].includes(strength)) return '#F5A623';
    return '#00B37E';
  })();

  return (
    <div>
      <SectionHeader title="Segurança" description="Mantenha sua conta protegida. Use uma senha única e forte." />

      <div className="bg-[#141416] border border-white/[0.06] rounded-[14px] p-5">
        <h3 className="text-[13px] font-semibold text-white mb-3">Alterar senha</h3>

        <div className="space-y-3">
          <Field label="Senha atual" value={oldPwd} onChange={setOldPwd} type="password" autoComplete="current-password" />
          <Field label="Nova senha" value={newPwd} onChange={setNewPwd} type="password" autoComplete="new-password" />
          {strength && (
            <div className="flex items-center gap-2 -mt-1">
              <div className="flex-1 h-1 bg-[#252527] rounded-full overflow-hidden">
                <div className="h-full transition-all" style={{
                  width: `${(['Muito fraca','Fraca','Razoável','Boa','Forte','Excelente'].indexOf(strength) + 1) * 16.66}%`,
                  backgroundColor: strengthColor,
                }} />
              </div>
              <span className="text-[10px] font-semibold shrink-0" style={{ color: strengthColor }}>{strength}</span>
            </div>
          )}
          <Field label="Confirmar nova senha" value={confirmPwd} onChange={setConfirmPwd} type="password" autoComplete="new-password" />
        </div>

        {error && <p className="text-[12px] text-[#E5484D] mt-3">{error}</p>}
        {success && <p className="text-[12px] text-[#00B37E] mt-3">{success}</p>}

        <div className="flex justify-end mt-5">
          <button type="button" onClick={handleSave} disabled={loading}
            className="bg-[#F5A623] hover:bg-[#E5961E] disabled:opacity-50 text-black font-bold text-[13px] px-5 py-2.5 rounded-[10px] transition-colors">
            {loading ? 'Salvando…' : 'Alterar senha'}
          </button>
        </div>
      </div>

      {/* Placeholder pra features futuras */}
      <div className="mt-4 bg-[#141416]/50 border border-white/[0.04] border-dashed rounded-[14px] p-5">
        <h3 className="text-[13px] font-semibold text-[#5C5C5E] mb-1">Em breve</h3>
        <p className="text-[11px] text-[#5C5C5E] leading-relaxed">
          Autenticação em dois fatores (2FA), histórico de sessões ativas e email de recuperação.
        </p>
      </div>
    </div>
  );
};

const Field = ({ label, value, onChange, type = 'text', autoComplete }) => (
  <div>
    <label className="block text-[11px] font-semibold text-[#868686] mb-1.5">{label}</label>
    <input
      type={type}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      autoComplete={autoComplete}
      className="w-full bg-[#1A1A1A] border border-white/[0.08] rounded-[10px] px-3.5 py-2.5 text-[13px] text-white outline-none focus:border-[#F5A623]/60 transition-colors"
      placeholder="••••••••"
    />
  </div>
);

export default ConfigSeguranca;
