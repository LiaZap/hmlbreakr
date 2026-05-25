/**
 * Configuracoes — pagina principal de configuracoes do cliente.
 *
 * Substitui o ProfileModal antigo para clientes nao-admin. Layout
 * enterprise-style com sidebar interna a esquerda (sections) e content
 * scrollavel a direita. Inspirado em Notion / Linear / Vercel settings.
 *
 * Secoes:
 *   - Conta (perfil, dados pessoais)
 *   - Seguranca (senha, sessoes)
 *   - Plano e cobranca (subscription, faturas)
 *   - Privacidade (LGPD — exportar dados)
 *   - Zona de perigo (excluir conta) — vermelho, isolado
 */
import { useState, useEffect } from 'react';
import { useDashboard } from '../../../context/DashboardContext';
import ConfigConta from './ConfigConta';
import ConfigSeguranca from './ConfigSeguranca';
import ConfigPlano from './ConfigPlano';
import ConfigPrivacidade from './ConfigPrivacidade';
import ConfigZonaPerigo from './ConfigZonaPerigo';

const SECTIONS = [
  {
    id: 'conta',
    label: 'Conta',
    description: 'Suas informações pessoais',
    icon: (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/>
        <circle cx="12" cy="7" r="4"/>
      </svg>
    ),
  },
  {
    id: 'seguranca',
    label: 'Segurança',
    description: 'Senha e autenticação',
    icon: (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <rect x="3" y="11" width="18" height="11" rx="2"/>
        <path d="M7 11V7a5 5 0 0 1 10 0v4"/>
      </svg>
    ),
  },
  {
    id: 'plano',
    label: 'Plano e cobrança',
    description: 'Assinatura, faturas, métodos de pagamento',
    icon: (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <rect x="2" y="5" width="20" height="14" rx="2"/>
        <line x1="2" y1="10" x2="22" y2="10"/>
      </svg>
    ),
  },
  {
    id: 'privacidade',
    label: 'Privacidade',
    description: 'Seus dados e direitos LGPD',
    icon: (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
      </svg>
    ),
  },
  {
    id: 'perigo',
    label: 'Zona de perigo',
    description: 'Ações irreversíveis',
    danger: true,
    icon: (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/>
        <line x1="12" y1="9" x2="12" y2="13"/>
        <line x1="12" y1="17" x2="12.01" y2="17"/>
      </svg>
    ),
  },
];

const Configuracoes = ({ onNavigate }) => {
  const { dashboardData } = useDashboard();
  const hash = new URLSearchParams(window.location.search).get('hash');

  // Permite deep-link via ?config=seguranca por exemplo (futuro)
  const [active, setActive] = useState(() => {
    try {
      const param = new URLSearchParams(window.location.search).get('config');
      const valid = SECTIONS.map(s => s.id);
      return param && valid.includes(param) ? param : 'conta';
    } catch { return 'conta'; }
  });

  // Persiste a sessao em sessionStorage (entre navegacoes)
  useEffect(() => {
    try { sessionStorage.setItem('breakr.config.active', active); } catch { /* ignore */ }
  }, [active]);

  const renderContent = () => {
    const props = { dashboardData, hash, onNavigate };
    switch (active) {
      case 'conta':       return <ConfigConta {...props} />;
      case 'seguranca':   return <ConfigSeguranca {...props} />;
      case 'plano':       return <ConfigPlano {...props} />;
      case 'privacidade': return <ConfigPrivacidade {...props} />;
      case 'perigo':      return <ConfigZonaPerigo {...props} />;
      default:            return <ConfigConta {...props} />;
    }
  };

  return (
    <div className="w-full h-full flex flex-col bg-[#0F0F11] font-jakarta text-white">
      {/* Header da pagina */}
      <div className="px-4 md:px-8 py-5 md:py-6 border-b border-white/[0.06]">
        <div className="flex items-baseline gap-2 flex-wrap mb-1">
          <span className="text-[10px] md:text-[11px] text-[#5C5C5E] font-medium uppercase tracking-wider shrink-0">
            Breakr <span className="opacity-50 mx-0.5">›</span> Conta <span className="opacity-50 mx-1">·</span>
          </span>
          <h1 className="text-[20px] md:text-[24px] font-bold text-white leading-none">Configurações</h1>
        </div>
        <p className="text-[12px] text-[#868686]">
          Gerencie sua conta, plano e preferências de privacidade.
        </p>
      </div>

      {/* Layout: sidebar interna + content */}
      <div className="flex-1 min-h-0 flex flex-col md:flex-row">
        {/* MOBILE: dropdown nativo no topo (em vez de scroll horizontal que
            escondia a Zona de perigo fora do viewport).
            md+: sidebar interna lateral. */}
        <div className="md:hidden border-b border-white/[0.06] px-4 py-3">
          <label className="block text-[10px] font-semibold text-[#5C5C5E] uppercase tracking-wider mb-1.5">Seção</label>
          <div className="relative">
            <select
              value={active}
              onChange={(e) => setActive(e.target.value)}
              className="w-full appearance-none bg-[#1A1A1A] border border-white/[0.08] rounded-[10px] px-3.5 py-3 pr-10 text-base text-white outline-none focus:border-[#F5A623]/60 transition-colors"
            >
              {SECTIONS.map(s => (
                <option key={s.id} value={s.id} className={s.danger ? 'text-[#E5484D]' : ''}>
                  {s.label} — {s.description}
                </option>
              ))}
            </select>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" className="absolute right-3.5 top-1/2 -translate-y-1/2 pointer-events-none">
              <path d="M6 9l6 6 6-6" stroke="#666" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </div>
        </div>

        {/* DESKTOP: sidebar interna vertical */}
        <aside className="hidden md:flex md:w-[240px] lg:w-[260px] shrink-0 border-r border-white/[0.06] py-5 overflow-y-auto">
          <nav className="flex flex-col gap-1 px-3 w-full">
            {SECTIONS.map(s => {
              const isActive = active === s.id;
              const isDanger = s.danger;
              return (
                <button
                  key={s.id}
                  type="button"
                  onClick={() => setActive(s.id)}
                  className={`flex items-center gap-3 px-3 py-2.5 rounded-[10px] text-left transition-colors ${
                    isActive
                      ? (isDanger ? 'bg-[#E5484D]/10 text-[#E5484D]' : 'bg-white/[0.06] text-white')
                      : (isDanger ? 'text-[#868686] hover:text-[#E5484D] hover:bg-[#E5484D]/5' : 'text-[#868686] hover:text-white hover:bg-white/[0.03]')
                  }`}
                >
                  <span className="shrink-0">{s.icon}</span>
                  <div className="min-w-0 flex-1">
                    <div className="text-[13px] font-semibold leading-tight">{s.label}</div>
                    <div className="text-[10px] text-[#5C5C5E] leading-tight mt-0.5">{s.description}</div>
                  </div>
                </button>
              );
            })}
          </nav>
        </aside>

        {/* Content principal */}
        <main className="flex-1 min-h-0 overflow-y-auto px-3 md:px-8 lg:px-12 py-5 md:py-8">
          <div className="max-w-[680px] mx-auto">
            {renderContent()}
          </div>
        </main>
      </div>
    </div>
  );
};

export default Configuracoes;
