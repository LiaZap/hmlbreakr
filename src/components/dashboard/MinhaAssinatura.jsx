/**
 * MinhaAssinatura — tela do cliente "Conta → Assinatura" (Stripe F5).
 *
 * Mostra status atual, plano, próxima cobrança, e dá acesso ao Stripe
 * Customer Portal (atualizar pagamento, baixar faturas, cancelar).
 *
 * Lê de dashboardData.subscription (preparado em F3 pelo backend).
 */
import { useState } from 'react';
import { motion } from 'framer-motion'; // eslint-disable-line no-unused-vars
import { useDashboard } from '../../context/DashboardContext';
import { openBillingPortal } from '../../hooks/useSubscriptionGuard';

const STATUS_META = {
  trial:    { label: 'Período de Teste', color: '#5B8DEF', dot: 'bg-[#5B8DEF]' },
  active:   { label: 'Ativa',             color: '#00B37E', dot: 'bg-[#00B37E]' },
  past_due: { label: 'Pagamento Pendente',color: '#F5A623', dot: 'bg-[#F5A623]' },
  unpaid:   { label: 'Inadimplente',      color: '#E5484D', dot: 'bg-[#E5484D]' },
  canceled: { label: 'Cancelada',         color: '#868686', dot: 'bg-[#868686]' },
};
const LEGACY_META = { label: 'Sem assinatura', color: '#555', dot: 'bg-[#555]' };

const formatDate = (iso) => {
  if (!iso) return '—';
  try {
    return new Date(iso).toLocaleDateString('pt-BR', {
      day: '2-digit', month: 'long', year: 'numeric',
    });
  } catch { return '—'; }
};

const MinhaAssinatura = () => {
  const { dashboardData } = useDashboard();
  const sub = dashboardData?.subscription;
  const [opening, setOpening] = useState(false);

  const handleOpenPortal = async () => {
    setOpening(true);
    try { await openBillingPortal(); }
    finally { setOpening(false); }
  };

  const meta = sub?.status ? STATUS_META[sub.status] : LEGACY_META;

  // ─── Estado: sem assinatura (cliente legacy / nunca contratou) ─────
  if (!sub || !sub.status) {
    return (
      <div className="flex flex-col w-full min-h-screen bg-[#101010] font-jakarta text-white p-4 md:p-8">
        <Header />
        <div className="max-w-[640px] mx-auto w-full mt-6">
          <div className="bg-[#1B1B1D] border border-[#2A2A2C] rounded-[16px] p-8 text-center">
            <div className="w-16 h-16 rounded-full bg-[#F5A623]/15 mx-auto mb-4 flex items-center justify-center text-[28px]">💳</div>
            <h2 className="text-[18px] font-bold mb-2">Sem assinatura ativa</h2>
            <p className="text-[13px] text-[#868686] mb-4">
              Você ainda não tem uma assinatura paga vinculada à sua conta.
            </p>
            <p className="text-[11px] text-[#666]">
              Se você acredita que isso é um erro, entre em contato com o suporte.
            </p>
          </div>
        </div>
      </div>
    );
  }

  // ─── Estado: assinatura existente ──────────────────────────────────
  return (
    <div className="flex flex-col w-full min-h-screen bg-[#101010] font-jakarta text-white p-4 md:p-8">
      <Header />

      <div className="max-w-[720px] mx-auto w-full mt-4 md:mt-6 space-y-4">
        {/* Card principal — status + plano + próxima cobrança */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-gradient-to-br from-[#1B1B1D] via-[#16161A] to-[#101013] border border-[#2A2A2C] rounded-[18px] p-5 md:p-6"
        >
          <div className="flex items-start justify-between flex-wrap gap-3 mb-5">
            <div>
              <div className="text-[11px] text-[#666] uppercase tracking-wider font-semibold mb-1">Status</div>
              <div className="flex items-center gap-2">
                <span className={`w-2 h-2 rounded-full ${meta.dot}`} />
                <span className="text-[16px] font-bold" style={{ color: meta.color }}>{meta.label}</span>
              </div>
            </div>
            <div className="text-right">
              <div className="text-[11px] text-[#666] uppercase tracking-wider font-semibold mb-1">Plano</div>
              <div className="text-[14px] font-semibold text-white">
                {sub.plan ? 'Plano Mensal' : '—'}
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-4 border-t border-white/[0.04]">
            {sub.status === 'trial' && sub.trialEndsAt && (
              <InfoRow label="Teste grátis termina em" value={formatDate(sub.trialEndsAt)} accent="#5B8DEF" />
            )}
            {sub.status !== 'canceled' && sub.currentPeriodEnd && (
              <InfoRow label="Próxima cobrança" value={formatDate(sub.currentPeriodEnd)} />
            )}
            {sub.status === 'canceled' && sub.currentPeriodEnd && (
              <InfoRow label="Acesso até" value={formatDate(sub.currentPeriodEnd)} accent="#868686" />
            )}
            {sub.pastDueSince && (
              <InfoRow label="Pendente desde" value={formatDate(sub.pastDueSince)} accent="#F5A623" />
            )}
          </div>
        </motion.div>

        {/* Alerta contextual conforme o status */}
        {sub.status === 'past_due' && (
          <Alert
            color="#E5484D"
            icon="⚠️"
            title="Pagamento falhou"
            text="Sua última cobrança não foi processada. Atualize seu método de pagamento para evitar interrupção."
          />
        )}
        {sub.status === 'canceled' && sub.daysToCharge != null && sub.daysToCharge > 0 && (
          <Alert
            color="#5B8DEF"
            icon="ℹ️"
            title="Assinatura cancelada"
            text={`Você ainda tem acesso por ${sub.daysToCharge} ${sub.daysToCharge === 1 ? 'dia' : 'dias'}. Quer reativar?`}
          />
        )}
        {sub.status === 'trial' && sub.daysToTrialEnd != null && sub.daysToTrialEnd <= 3 && (
          <Alert
            color="#F5A623"
            icon="⏰"
            title={`Seu teste grátis acaba em ${sub.daysToTrialEnd} ${sub.daysToTrialEnd === 1 ? 'dia' : 'dias'}`}
            text="Adicione seu método de pagamento agora para continuar sem interrupção."
          />
        )}

        {/* Ações */}
        <div className="bg-[#1B1B1D] border border-[#2A2A2C] rounded-[16px] p-5">
          <h3 className="text-[14px] font-bold text-white mb-1">Gerenciar assinatura</h3>
          <p className="text-[12px] text-[#868686] mb-4">
            Atualize seu método de pagamento, veja o histórico de faturas ou cancele a assinatura.
          </p>

          <button
            onClick={handleOpenPortal}
            disabled={opening}
            className="w-full sm:w-auto bg-[#F5A623] hover:bg-[#E5961E] disabled:opacity-50 disabled:cursor-not-allowed text-black font-bold text-[13px] px-5 py-2.5 rounded-[10px] transition-colors flex items-center justify-center gap-2"
          >
            {opening ? (
              <>Abrindo portal…</>
            ) : (
              <>
                Gerenciar Pagamento
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
                  <path d="M7 17L17 7M17 7H8M17 7V16" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
              </>
            )}
          </button>

          <p className="text-[10px] text-[#555] mt-3">
            Você será redirecionado para o ambiente seguro do Stripe — todas as alterações são processadas lá.
          </p>
        </div>

        {/* Info rodapé */}
        <p className="text-[10px] text-[#444] text-center pt-2">
          Pagamentos processados via Stripe. Em caso de dúvidas, entre em contato com o suporte.
        </p>
      </div>
    </div>
  );
};

const Header = () => (
  <div>
    <div className="flex items-baseline gap-2 flex-wrap">
      <span className="text-[10px] md:text-[11px] text-[#5C5C5E] font-medium uppercase tracking-wider shrink-0">
        Breakr <span className="opacity-50 mx-0.5">›</span> Conta <span className="opacity-50 mx-1">·</span>
      </span>
      <h1 className="text-[24px] md:text-[28px] font-bold text-white leading-none">Minha Assinatura</h1>
    </div>
    <p className="text-[12px] md:text-[13px] text-[#868686] mt-1.5">
      Status do plano, próxima cobrança e gestão de pagamento.
    </p>
  </div>
);

const InfoRow = ({ label, value, accent }) => (
  <div>
    <div className="text-[11px] text-[#666] uppercase tracking-wider font-semibold mb-1">{label}</div>
    <div className="text-[14px] font-semibold" style={{ color: accent || '#FFFFFF' }}>{value}</div>
  </div>
);

const Alert = ({ color, icon, title, text }) => (
  <motion.div
    initial={{ opacity: 0, y: 6 }}
    animate={{ opacity: 1, y: 0 }}
    className="flex items-start gap-3 rounded-[14px] border p-4"
    style={{ borderColor: `${color}44`, backgroundColor: `${color}10` }}
  >
    <span className="text-[18px] leading-none shrink-0 mt-0.5" aria-hidden="true">{icon}</span>
    <div className="flex-1 min-w-0">
      <div className="text-[13px] font-bold mb-0.5" style={{ color }}>{title}</div>
      <div className="text-[12px] text-[#CFCFCF] leading-snug">{text}</div>
    </div>
  </motion.div>
);

export default MinhaAssinatura;
