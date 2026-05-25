/**
 * ConfigSeguranca — secao Seguranca da pagina /configuracoes.
 *
 * 2 modos de renderizacao:
 *
 *   MODO CLERK (default): usuario tem sessao ativa do Clerk
 *     → renderiza <UserProfile /> nativo com 2FA, sessoes, recovery
 *
 *   MODO LEGACY (fallback): usuario bcrypt antigo sem clerkUserId
 *     → renderiza form local de trocar senha (PUT /client/:hash/profile
 *       com oldPassword) + CTA pra migrar pra Clerk
 *
 * Sem o fallback legacy os usuarios cadastrados antes da integracao
 * Clerk ficavam TRAVADOS na tela 'Sessao Clerk nao encontrada' sem
 * conseguir trocar a propria senha.
 */
import { useState } from 'react';
import { UserProfile, useUser } from '@clerk/clerk-react';
import { dark } from '@clerk/themes';
import SectionHeader from './_SectionHeader';

const ConfigSeguranca = ({ hash }) => {
  const { isLoaded, isSignedIn, user } = useUser();

  // Se o usuario nao esta logado via Clerk (cliente legacy que so logou
  // pelo fluxo bcrypt antigo), mostramos um aviso com instrucao.
  if (!isLoaded) {
    return (
      <div>
        <SectionHeader title="Segurança" description="Senha, autenticação em dois fatores e sessões ativas." />
        <div className="bg-[#141416] border border-white/[0.06] rounded-[14px] p-8 text-center">
          <div className="inline-block w-6 h-6 border-2 border-[#F5A623]/30 border-t-[#F5A623] rounded-full animate-spin" />
          <p className="text-[12px] text-[#868686] mt-3">Carregando…</p>
        </div>
      </div>
    );
  }

  // Sem sessao Clerk → modo LEGACY (form local de trocar senha bcrypt)
  if (!isSignedIn || !user) {
    return <LegacyPasswordForm hash={hash} />;
  }

  return (
    <div>
      <SectionHeader
        title="Segurança"
        description="Senha, autenticação em dois fatores, sessões ativas e dispositivos conectados — tudo gerenciado pelo Clerk."
      />

      {/* Card explicativo */}
      <div className="bg-[#5B8DEF]/[0.05] border border-[#5B8DEF]/20 rounded-[12px] p-4 mb-5">
        <div className="flex items-start gap-3">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#5B8DEF" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="shrink-0 mt-0.5">
            <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
          </svg>
          <div className="min-w-0">
            <p className="text-[12px] font-semibold text-white mb-1">Sua autenticação é protegida pelo Clerk</p>
            <p className="text-[11px] text-[#A0A0A0] leading-relaxed">
              Usamos o Clerk (SOC 2 Type II) como provedor de identidade. Sua senha
              nunca passa pelos nossos servidores — é armazenada e validada exclusivamente
              pelo Clerk.
            </p>
          </div>
        </div>
      </div>

      {/* UserProfile nativo do Clerk com tema dark + accent laranja Breakr */}
      <div className="rounded-[14px] overflow-hidden border border-white/[0.06]">
        <UserProfile
          appearance={{
            baseTheme: dark,
            variables: {
              colorPrimary: '#F5A623',
              colorBackground: '#141416',
              colorInputBackground: '#1A1A1A',
              colorInputText: '#FFFFFF',
              colorText: '#FFFFFF',
              colorTextSecondary: '#868686',
              colorDanger: '#E5484D',
              colorSuccess: '#00B37E',
              colorWarning: '#F5A623',
              borderRadius: '10px',
              fontFamily: 'Plus Jakarta Sans, sans-serif',
              fontSize: '13px',
            },
            elements: {
              // Esconde header e footer duplicados (ja temos no nosso layout)
              rootBox: { width: '100%' },
              card: {
                backgroundColor: '#141416',
                boxShadow: 'none',
                border: 'none',
              },
              navbar: { display: 'none' }, // nav lateral do Clerk fica fora (temos nosso sidebar)
              pageScrollBox: { padding: '20px' },
              headerTitle: { fontSize: '15px', fontWeight: '700' },
              profileSectionTitle__profile: { display: 'none' }, // ja tem 'Conta' no nosso menu
              profileSection__profile: { display: 'none' }, // perfil tratamos na aba Conta
            },
          }}
        />
      </div>

      <p className="text-[10px] text-[#5C5C5E] mt-3 text-center">
        Clerk · SOC 2 Type II · GDPR Compliant · Senhas validadas com zxcvbn
      </p>
    </div>
  );
};

// ─── LegacyPasswordForm ──────────────────────────────────────────────────────
// Fallback pra usuarios cadastrados antes da integracao Clerk (bcrypt no
// banco do Breakr). Permite trocar senha via PUT /client/:hash/profile
// (endpoint deprecated mas funcional — ver routes.js comentario).
//
// Quando migrarmos 100% pro Clerk, esse componente pode ser removido + o
// endpoint backend.
const LegacyPasswordForm = ({ hash }) => {
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

  // Indicador visual de força da senha
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

      {/* Aviso amigavel — conta legacy */}
      <div className="bg-[#5B8DEF]/[0.06] border border-[#5B8DEF]/20 rounded-[12px] p-4 mb-5">
        <div className="flex items-start gap-3">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#5B8DEF" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="shrink-0 mt-0.5">
            <circle cx="12" cy="12" r="10"/>
            <line x1="12" y1="16" x2="12" y2="12"/>
            <line x1="12" y1="8" x2="12.01" y2="8"/>
          </svg>
          <div className="min-w-0">
            <p className="text-[12px] font-semibold text-white mb-1">Conta clássica</p>
            <p className="text-[11px] text-[#A0A0A0] leading-relaxed">
              Sua conta foi criada antes da nossa atualização de autenticação.
              Você pode trocar sua senha normalmente aqui. Em breve vamos migrar
              automaticamente sua conta pra ter acesso a 2FA, sessões ativas e
              login com Google.
            </p>
          </div>
        </div>
      </div>

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
            className="w-full sm:w-auto bg-[#F5A623] hover:bg-[#E5961E] disabled:opacity-50 text-black font-bold text-[13px] px-5 py-3 sm:py-2.5 rounded-[10px] transition-colors">
            {loading ? 'Salvando…' : 'Alterar senha'}
          </button>
        </div>
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
      className="w-full bg-[#1A1A1A] border border-white/[0.08] rounded-[10px] px-3.5 py-2.5 text-base md:text-[13px] text-white outline-none focus:border-[#F5A623]/60 transition-colors"
      placeholder="••••••••"
    />
  </div>
);

export default ConfigSeguranca;
