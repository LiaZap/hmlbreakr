/**
 * ConfigPlano — secao Plano e cobranca da pagina /configuracoes.
 *
 * Mostra status detalhado da assinatura + acoes:
 *   - Abrir Stripe Customer Portal (atualizar pagamento, faturas, cancelar)
 *   - Ir para tela completa Minha Assinatura
 *
 * Sem emoji — tudo SVG profissional. Status via cor + icone + label.
 */
import { useState } from 'react';
import SectionHeader from './_SectionHeader';
import { openBillingPortal } from '../../../hooks/useSubscriptionGuard';

// Metadados de cada status — icone SVG inline + cor + label
const STATUS_META = {
  trial: {
    label: 'Período de teste',
    color: '#5B8DEF',
    icon: (c) => (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>
      </svg>
    ),
  },
  active: {
    label: 'Ativa',
    color: '#00B37E',
    icon: (c) => (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/>
      </svg>
    ),
  },
  past_due: {
    label: 'Pagamento pendente',
    color: '#F5A623',
    icon: (c) => (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/>
        <line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/>
      </svg>
    ),
  },
  unpaid: {
    label: 'Inadimplente',
    color: '#E5484D',
    icon: (c) => (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/>
      </svg>
    ),
  },
  canceled: {
    label: 'Cancelada',
    color: '#868686',
    icon: (c) => (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="12" cy="12" r="10"/><line x1="8" y1="12" x2="16" y2="12"/>
      </svg>
    ),
  },
};

const fmtDate = (iso) => {
  if (!iso) return null;
  try { return new Date(iso).toLocaleDateString('pt-BR', { day: '2-digit', month: 'long', year: 'numeric' }); }
  catch { return null; }
};

const ConfigPlano = ({ dashboardData, onNavigate }) => {
  const subscription = dashboardData?.subscription || null;
  const [opening, setOpening] = useState(false);

  const handlePortal = async () => {
    setOpening(true);
    try { await openBillingPortal(); }
    finally { setOpening(false); }
  };

  const handleGoFull = () => {
    if (onNavigate) onNavigate('assinatura');
  };

  // Empty state: cliente legacy sem assinatura
  if (!subscription || !subscription.status) {
    return (
      <div>
        <SectionHeader title="Plano e cobrança" description="Gerencie sua assinatura, métodos de pagamento e histórico de faturas." />
        <div className="bg-[#141416] border border-white/[0.06] rounded-[14px] p-8 text-center">
          <div className="w-12 h-12 rounded-full bg-white/[0.04] mx-auto mb-3 flex items-center justify-center">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#5C5C5E" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
              <rect x="2" y="5" width="20" height="14" rx="2"/><line x1="2" y1="10" x2="22" y2="10"/>
            </svg>
          </div>
          <p className="text-[14px] font-semibold text-white mb-1">Sem assinatura ativa</p>
          <p className="text-[12px] text-[#868686] mb-4">Você ainda não tem um plano vinculado à sua conta.</p>
          <p className="text-[11px] text-[#5C5C5E]">Se acredita que isso é um erro, fale com o suporte.</p>
        </div>
      </div>
    );
  }

  const meta = STATUS_META[subscription.status] || STATUS_META.active;
  const nextChargeDate = fmtDate(subscription.currentPeriodEnd);
  const trialEndDate = fmtDate(subscription.trialEndsAt);

  return (
    <div>
      <SectionHeader
        title="Plano e cobrança"
        description="Gerencie sua assinatura, métodos de pagamento e histórico de faturas."
        action={
          <button type="button" onClick={handleGoFull}
            className="text-[12px] text-[#F5A623] hover:underline font-semibold whitespace-nowrap">
            Ver detalhes →
          </button>
        }
      />

      {/* Status card */}
      <div className="bg-gradient-to-br from-[#141416] via-[#101013] to-[#0F0F11] border border-white/[0.08] rounded-[14px] overflow-hidden mb-4">
        <div className="p-5">
          <div className="flex items-center gap-4 mb-4">
            <div className="w-12 h-12 rounded-full flex items-center justify-center shrink-0" style={{ backgroundColor: `${meta.color}15` }}>
              {meta.icon(meta.color)}
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-[11px] text-[#5C5C5E] uppercase tracking-wider font-semibold mb-0.5">Status atual</div>
              <div className="text-[16px] font-bold" style={{ color: meta.color }}>{meta.label}</div>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4 pt-4 border-t border-white/[0.04]">
            <div>
              <div className="text-[10px] text-[#5C5C5E] uppercase tracking-wider font-semibold mb-1">Plano</div>
              <div className="text-[13px] font-semibold text-white">Mensal</div>
            </div>
            {subscription.status === 'trial' && trialEndDate && (
              <div>
                <div className="text-[10px] text-[#5C5C5E] uppercase tracking-wider font-semibold mb-1">Teste termina em</div>
                <div className="text-[13px] font-semibold text-[#5B8DEF]">{trialEndDate}</div>
              </div>
            )}
            {subscription.status !== 'canceled' && subscription.status !== 'trial' && nextChargeDate && (
              <div>
                <div className="text-[10px] text-[#5C5C5E] uppercase tracking-wider font-semibold mb-1">Próxima cobrança</div>
                <div className="text-[13px] font-semibold text-white">{nextChargeDate}</div>
              </div>
            )}
            {subscription.status === 'canceled' && nextChargeDate && (
              <div>
                <div className="text-[10px] text-[#5C5C5E] uppercase tracking-wider font-semibold mb-1">Acesso até</div>
                <div className="text-[13px] font-semibold text-[#868686]">{nextChargeDate}</div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Acoes */}
      <div className="bg-[#141416] border border-white/[0.06] rounded-[14px] p-5">
        <h3 className="text-[13px] font-semibold text-white mb-1">Gerenciar pagamento</h3>
        <p className="text-[11px] text-[#868686] mb-4">
          Atualize o cartão, baixe faturas em PDF ou cancele a assinatura no ambiente seguro do Stripe.
        </p>
        <button type="button" onClick={handlePortal} disabled={opening}
          className="bg-[#F5A623] hover:bg-[#E5961E] disabled:opacity-50 text-black font-bold text-[13px] px-5 py-2.5 rounded-[10px] transition-colors inline-flex items-center gap-2">
          {opening ? 'Abrindo portal…' : (
            <>
              Abrir portal de pagamento
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M7 17L17 7M17 7H8M17 7V16"/>
              </svg>
            </>
          )}
        </button>
        <p className="text-[10px] text-[#5C5C5E] mt-3">
          Você será redirecionado para o Stripe. Tudo é processado lá.
        </p>
      </div>
    </div>
  );
};

export default ConfigPlano;
