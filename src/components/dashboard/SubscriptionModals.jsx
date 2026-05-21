/**
 * SubscriptionModals — banner + 3 modais + tela de bloqueio.
 * Stripe F3.
 *
 * Componentes:
 *  - PaymentFailedBanner       — sticky topo (past_due, NÃO dispensável)
 *  - TrialEndingModal          — flutuante bottom-right (trial < 3 dias, dispensável)
 *  - CanceledWarningModal      — flutuante bottom-right (canceled c/ período ativo, dispensável)
 *  - SubscriptionBlockedScreen — full-screen takeover (unpaid / expirado / admin_blocked)
 *
 * Todos com botão pro Stripe Customer Portal (atualizar pagamento). O
 * bloqueio por admin não dá esse caminho — instrui contatar o suporte.
 */
import { useEffect, useState } from 'react';
import { openBillingPortal } from '../../hooks/useSubscriptionGuard';

// ────────────────────────────────────────────────────────────────────
//  Helper: lembra que o usuário dispensou um aviso nessa sessão.
// ────────────────────────────────────────────────────────────────────
function useDismissed(key) {
  const [dismissed, setDismissed] = useState(() => {
    try { return sessionStorage.getItem(key) === '1'; } catch { return false; }
  });
  const dismiss = () => {
    try { sessionStorage.setItem(key, '1'); } catch { /* */ }
    setDismissed(true);
  };
  return [dismissed, dismiss];
}

// ────────────────────────────────────────────────────────────────────
//  PaymentFailedBanner — past_due (não dispensável)
// ────────────────────────────────────────────────────────────────────
export function PaymentFailedBanner() {
  return (
    <div className="sticky top-0 z-[70] bg-gradient-to-r from-[#E5484D] to-[#C73B40] text-white shadow-lg">
      <div className="px-3 md:px-6 py-2.5 flex items-center gap-3 flex-wrap">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" className="shrink-0">
          <path d="M12 9v4M12 17h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
        </svg>
        <span className="text-[13px] font-semibold">
          Pagamento falhou. Atualize seu método de pagamento para continuar sem interrupção.
        </span>
        <button
          onClick={openBillingPortal}
          className="ml-auto bg-white text-[#C73B40] text-[12px] font-bold px-4 py-1.5 rounded-[8px] hover:bg-white/90 transition-colors shrink-0"
        >
          Atualizar pagamento
        </button>
      </div>
    </div>
  );
}

// ────────────────────────────────────────────────────────────────────
//  TrialEndingModal — trial < 3 dias (dispensável)
// ────────────────────────────────────────────────────────────────────
export function TrialEndingModal({ daysLeft }) {
  const [dismissed, dismiss] = useDismissed(`breakr.trial-modal.${daysLeft}d`);
  if (dismissed) return null;
  return (
    <FloatingCard
      icon="⏰"
      iconBg="bg-[#F5A623]/20"
      title={`Seu teste grátis acaba em ${daysLeft} ${daysLeft === 1 ? 'dia' : 'dias'}`}
      subtitle="Adicione seu método de pagamento para continuar usando o Breakr sem interrupção."
      primary={{ label: 'Adicionar pagamento', onClick: openBillingPortal }}
      onDismiss={dismiss}
    />
  );
}

// ────────────────────────────────────────────────────────────────────
//  CanceledWarningModal — canceled mas dentro do período (dispensável)
// ────────────────────────────────────────────────────────────────────
export function CanceledWarningModal({ daysLeft }) {
  const [dismissed, dismiss] = useDismissed(`breakr.canceled-modal.${daysLeft}d`);
  if (dismissed) return null;
  return (
    <FloatingCard
      icon="ℹ️"
      iconBg="bg-[#5B8DEF]/20"
      title={`Assinatura cancelada — acesso até ${daysLeft} ${daysLeft === 1 ? 'dia' : 'dias'}`}
      subtitle="Você ainda pode usar tudo até lá. Quer reativar?"
      primary={{ label: 'Reativar assinatura', onClick: openBillingPortal }}
      onDismiss={dismiss}
    />
  );
}

// ────────────────────────────────────────────────────────────────────
//  SubscriptionBlockedScreen — full-screen takeover
// ────────────────────────────────────────────────────────────────────
export function SubscriptionBlockedScreen({ subscription }) {
  const reason = subscription?.blockReason;
  const isAdminBlock = reason === 'admin_blocked';
  return (
    <div className="fixed inset-0 z-[100] bg-[#0A0A0B] flex items-center justify-center px-4">
      <div className="absolute top-[-15%] left-[-10%] w-[55%] h-[55%] bg-[#FFC100] blur-[200px] opacity-[0.06] rounded-full pointer-events-none" />
      <div className="absolute bottom-[-20%] right-[-10%] w-[55%] h-[55%] bg-[#E5484D] blur-[200px] opacity-[0.05] rounded-full pointer-events-none" />

      <div className="relative w-full max-w-[480px] bg-gradient-to-br from-[#141416] via-[#101013] to-[#0F0F11] border border-white/[0.08] rounded-[20px] p-8 text-center">
        <div className={`w-16 h-16 rounded-full ${isAdminBlock ? 'bg-[#F5A623]/15' : 'bg-[#E5484D]/15'} mx-auto mb-5 flex items-center justify-center`}>
          <svg width="28" height="28" viewBox="0 0 24 24" fill="none">
            {isAdminBlock ? (
              <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" stroke="#F5A623" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
            ) : (
              <>
                <rect x="3" y="11" width="18" height="11" rx="2" stroke="#E5484D" strokeWidth="1.8"/>
                <path d="M7 11V7a5 5 0 0110 0v4" stroke="#E5484D" strokeWidth="1.8"/>
              </>
            )}
          </svg>
        </div>

        <h1 className="text-[22px] font-bold text-white mb-2 tracking-tight">
          {isAdminBlock ? 'Conta pausada' : 'Acesso pausado'}
        </h1>

        <p className="text-[13px] text-[#A0A0A0] leading-relaxed mb-6 max-w-[360px] mx-auto">
          {subscription?.blockMessage || 'Seu acesso ao sistema está pausado no momento.'}
        </p>

        {isAdminBlock ? (
          <a
            href="mailto:contato@breakr.com.br?subject=Conta%20pausada"
            className="inline-flex items-center justify-center bg-[#F5A623] hover:bg-[#E5961E] text-black font-bold text-[13px] px-6 py-3 rounded-[10px] transition-colors w-full sm:w-auto"
          >
            Falar com o suporte
          </a>
        ) : (
          <button
            onClick={openBillingPortal}
            className="inline-flex items-center justify-center bg-[#F5A623] hover:bg-[#E5961E] text-black font-bold text-[13px] px-6 py-3 rounded-[10px] transition-colors w-full sm:w-auto"
          >
            Atualizar pagamento
          </button>
        )}

        <p className="text-[11px] text-[#555] mt-6">
          Após confirmar o pagamento, seu acesso é liberado em segundos.
        </p>
      </div>
    </div>
  );
}

// ────────────────────────────────────────────────────────────────────
//  FloatingCard — base reutilizável pros modais dispensáveis
// ────────────────────────────────────────────────────────────────────
function FloatingCard({ icon, iconBg, title, subtitle, primary, onDismiss }) {
  // Pequena animação de entrada
  const [enter, setEnter] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => setEnter(true), 30);
    return () => clearTimeout(t);
  }, []);
  return (
    <div
      className={`fixed bottom-4 right-4 left-4 sm:left-auto z-[80] max-w-[380px] transition-all duration-200 ${
        enter ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4'
      }`}
    >
      <div className="bg-gradient-to-br from-[#1A1A1D] via-[#141416] to-[#0F0F11] border border-white/[0.08] rounded-[14px] shadow-2xl p-4">
        <div className="flex items-start gap-3">
          <div className={`w-9 h-9 rounded-full ${iconBg} flex items-center justify-center shrink-0 text-[16px]`}>
            {icon}
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-[13px] font-bold text-white leading-tight mb-1">{title}</div>
            <div className="text-[11px] text-[#A0A0A0] leading-snug">{subtitle}</div>
          </div>
          <button
            onClick={onDismiss}
            className="text-[#555] hover:text-white shrink-0"
            aria-label="Fechar"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none"><path d="M18 6L6 18M6 6l12 12" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/></svg>
          </button>
        </div>
        <button
          onClick={primary.onClick}
          className="mt-3 w-full bg-[#F5A623] hover:bg-[#E5961E] text-black font-bold text-[12px] px-4 py-2 rounded-[8px] transition-colors"
        >
          {primary.label}
        </button>
      </div>
    </div>
  );
}
