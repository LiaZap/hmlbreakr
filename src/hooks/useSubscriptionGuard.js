/**
 * useSubscriptionGuard — lê dashboardData.subscription (vinda do backend)
 * e decide o que mostrar (banner, modais, tela de bloqueio).
 *
 * Stripe F3. Quando admin está visualizando-como-cliente, NUNCA bloqueia
 * a UI (admin pode ver/operar dados mesmo de cliente inadimplente).
 */
import { useMemo } from 'react';
import { useDashboard } from '../context/DashboardContext';

export function useSubscriptionGuard({ isAdminViewing = false } = {}) {
  const { dashboardData } = useDashboard();
  const sub = dashboardData?.subscription || null;

  return useMemo(() => {
    if (!sub) return { ready: false };
    return {
      ready: true,
      raw: sub,
      status: sub.status,
      daysToTrialEnd: sub.daysToTrialEnd,
      daysToCharge: sub.daysToCharge,
      // decisões de UI
      shouldBlock: !!sub.blocked && !isAdminViewing,
      blockReason: sub.blockReason,
      blockMessage: sub.blockMessage,
      showTrialEndingModal:
        sub.status === 'trial' &&
        sub.daysToTrialEnd != null &&
        sub.daysToTrialEnd > 0 &&
        sub.daysToTrialEnd <= 3,
      showPaymentFailedBanner: sub.status === 'past_due',
      showCanceledWarningModal:
        sub.status === 'canceled' &&
        sub.daysToCharge != null &&
        sub.daysToCharge > 0,
    };
  }, [sub, isAdminViewing]);
}

/**
 * Abre o Stripe Customer Portal pra o cliente atualizar pagamento / ver
 * faturas / cancelar. Retorna a URL no callback — redireciona pela window.
 */
export async function openBillingPortal() {
  try {
    const hash = new URLSearchParams(window.location.search).get('hash');
    if (!hash) {
      alert('Hash do cliente não encontrado na URL.');
      return;
    }
    const res = await fetch(`/api/client/${hash}/billing-portal`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ returnUrl: window.location.href }),
    });
    const json = await res.json();
    if (json && json.url) {
      window.location.href = json.url;
    } else {
      alert(json?.error || 'Não foi possível abrir o portal de pagamento.');
    }
  } catch (err) {
    alert('Erro ao abrir portal: ' + (err.message || err));
  }
}
