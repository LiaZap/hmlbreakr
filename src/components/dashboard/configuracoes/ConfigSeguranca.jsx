/**
 * ConfigSeguranca — secao Seguranca da pagina /configuracoes.
 *
 * Toda a gestao de credenciais (senha, email, 2FA, sessoes ativas,
 * devices conectados, OAuth social) e delegada ao COMPONENTE NATIVO
 * <UserProfile /> do Clerk — Clerk e a unica fonte de verdade de auth
 * neste app. Reimplementar localmente criaria dessincronizacao entre
 * o hash bcrypt do Client.password (legacy) e o Clerk.
 *
 * Vantagens de delegar pro Clerk:
 *   - 2FA (TOTP, SMS) prontos
 *   - Sessoes ativas listadas e revogaveis
 *   - Senha forte enforced pelo Clerk (zxcvbn)
 *   - Email verification integrado
 *   - OAuth social (Google, etc.) quando ativado
 *   - Recovery codes
 */
import { UserProfile, useUser } from '@clerk/clerk-react';
import { dark } from '@clerk/themes';
import SectionHeader from './_SectionHeader';

const ConfigSeguranca = () => {
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

  if (!isSignedIn || !user) {
    return (
      <div>
        <SectionHeader title="Segurança" description="Senha, autenticação em dois fatores e sessões ativas." />
        <div className="bg-[#F5A623]/[0.06] border border-[#F5A623]/30 rounded-[14px] p-5">
          <div className="flex items-start gap-3">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#F5A623" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="shrink-0 mt-0.5">
              <circle cx="12" cy="12" r="10"/>
              <line x1="12" y1="8" x2="12" y2="12"/>
              <line x1="12" y1="16" x2="12.01" y2="16"/>
            </svg>
            <div className="min-w-0">
              <p className="text-[13px] font-semibold text-white mb-1">Sessão Clerk não encontrada</p>
              <p className="text-[11px] text-[#CFCFCF] leading-relaxed mb-3">
                Para gerenciar sua senha e segurança, você precisa estar logado via
                {' '}<strong>Clerk</strong> (nossa plataforma de autenticação). Faça logout e entre
                novamente pela tela de login para vincular sua conta.
              </p>
              <p className="text-[11px] text-[#868686]">
                Se o problema persistir, contate{' '}
                <a href="mailto:contato@breakr.com.br" className="text-[#F5A623] hover:underline">
                  contato@breakr.com.br
                </a>.
              </p>
            </div>
          </div>
        </div>
      </div>
    );
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

export default ConfigSeguranca;
