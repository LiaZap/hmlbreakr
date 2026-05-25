/**
 * PlanSelector — componente de selecao de plano (3 cards lado a lado).
 *
 * Usado em:
 *   - MinhaAssinatura (empty state quando cliente nao tem subscription)
 *   - ConfigPlano (mesmo cenario)
 *   - Futuramente: tela publica /planos
 *
 * Comportamento:
 *   1. Fetch /api/plans no mount
 *   2. Renderiza 3 cards (FISPAL/Mensal/Anual) com label, preco, tag, descricao
 *   3. Click em 'Assinar' → POST /api/client/:hash/checkout com planSlug
 *   4. Recebe URL da Checkout Session e redireciona o browser
 *
 * Usa o priceLabel formatado do backend (sem hardcode no frontend).
 */
import { useState, useEffect } from 'react';

const PlanSelector = ({ hash, className = '' }) => {
  const [plans, setPlans] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [creating, setCreating] = useState(null); // slug que esta sendo processado

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch('/api/plans');
        if (!res.ok) throw new Error('Erro ao carregar planos');
        const data = await res.json();
        if (!cancelled) setPlans(data.plans || []);
      } catch (err) {
        if (!cancelled) setError(err.message || 'Erro ao carregar planos.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const handleSubscribe = async (slug) => {
    if (!hash) { setError('Sessão de cliente não encontrada.'); return; }
    setCreating(slug); setError('');
    try {
      const res = await fetch(`/api/client/${hash}/checkout`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ planSlug: slug }),
      });
      const data = await res.json();
      if (!res.ok || !data.url) {
        setError(data.error || 'Erro ao criar checkout.');
        setCreating(null);
        return;
      }
      // Redireciona pro Stripe Checkout
      window.location.href = data.url;
    } catch (err) {
      console.error(err);
      setError('Erro de conexão. Tente novamente.');
      setCreating(null);
    }
  };

  if (loading) {
    return (
      <div className={`flex items-center justify-center py-8 ${className}`}>
        <div className="w-6 h-6 border-2 border-[#F5A623]/30 border-t-[#F5A623] rounded-full animate-spin" />
      </div>
    );
  }

  if (error && plans.length === 0) {
    return (
      <div className={`p-5 bg-[#E5484D]/[0.06] border border-[#E5484D]/30 rounded-[14px] ${className}`}>
        <p className="text-[13px] text-[#E5484D] font-semibold mb-1">Não foi possível carregar os planos</p>
        <p className="text-[11px] text-[#868686]">{error}</p>
      </div>
    );
  }

  return (
    <div className={className}>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-5 md:gap-4">
        {plans.map(plan => (
          <PlanCard
            key={plan.slug}
            plan={plan}
            isCreating={creating === plan.slug}
            disabled={!!creating}
            onSubscribe={() => handleSubscribe(plan.slug)}
          />
        ))}
      </div>

      {error && (
        <div className="mt-3 text-[12px] text-[#E5484D]">{error}</div>
      )}

      <p className="text-[10px] text-[#5C5C5E] text-center mt-4 leading-relaxed">
        Pagamento processado pelo Stripe. Aceita cartão e boleto.
        Cancele a qualquer momento.
      </p>
    </div>
  );
};

// ─── Card individual de plano ────────────────────────────────────────────────
const PlanCard = ({ plan, isCreating, disabled, onSubscribe }) => {
  const isHighlighted = plan.tag === 'Melhor custo';
  return (
    <div
      className={`relative rounded-[14px] p-5 transition-all flex flex-col ${
        isHighlighted
          ? 'bg-gradient-to-br from-[#F5A623]/[0.08] via-[#F5A623]/[0.04] to-transparent border-2 border-[#F5A623]/40'
          : 'bg-[#141416] border border-white/[0.08]'
      }`}
    >
      {/* Tag (Promocional / Melhor custo) */}
      {plan.tag && (
        <div className={`absolute -top-2.5 left-5 px-2.5 py-0.5 rounded-full text-[9px] font-bold uppercase tracking-wider ${
          plan.tag === 'Promocional'
            ? 'bg-[#5B8DEF] text-white'
            : 'bg-[#F5A623] text-black'
        }`}>
          {plan.tag}
        </div>
      )}

      {/* Header */}
      <div className="mb-3">
        <p className="text-[10px] text-[#868686] uppercase tracking-wider font-semibold mb-1">
          {plan.cycle === 'yearly' ? 'Anual' : 'Mensal'}
        </p>
        <h3 className="text-[14px] font-bold text-white leading-tight">{plan.label.replace('Breakr [Hub] | ', '')}</h3>
      </div>

      {/* Preço */}
      <div className="mb-4">
        <p className={`text-[22px] font-extrabold leading-none ${isHighlighted ? 'text-[#F5A623]' : 'text-white'}`}>
          {plan.priceLabel.split('/')[0]}
        </p>
        <p className="text-[10px] text-[#868686] mt-1">
          /{plan.priceLabel.split('/')[1]}
          {plan.priceLabelExtra && <span className="ml-1 text-[#5C5C5E]">· {plan.priceLabelExtra}</span>}
        </p>
      </div>

      {/* Descrição */}
      <p className="text-[11px] text-[#A0A0A0] leading-relaxed flex-1 mb-4">
        {plan.description}
      </p>

      {/* CTA */}
      <button
        type="button"
        onClick={onSubscribe}
        disabled={disabled}
        className={`w-full py-2.5 rounded-[10px] font-bold text-[12px] transition-colors ${
          isHighlighted
            ? 'bg-[#F5A623] hover:bg-[#E5961E] text-black disabled:opacity-50'
            : 'bg-white/[0.06] hover:bg-white/[0.10] text-white border border-white/[0.10] disabled:opacity-50'
        } disabled:cursor-not-allowed`}
      >
        {isCreating ? 'Abrindo Stripe…' : 'Assinar este plano'}
      </button>
    </div>
  );
};

export default PlanSelector;
