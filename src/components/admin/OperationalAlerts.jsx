/**
 * OperationalAlerts — Painel de alertas operacionais HOJE
 *
 * Item 1.1 do plano: mostra restaurantes do portfólio que precisam de
 * atenção urgente, com diagnóstico ESPECÍFICO de restaurante (CMV, BASE,
 * faturamento, fichas) e ação sugerida.
 *
 * Foco: ajudar admin/CSM a saber EXATAMENTE quem precisa de atenção
 * e o QUE sugerir, sem depender de leitura mental dos dados.
 */

import { useMemo, useState } from 'react';
import { motion } from 'framer-motion'; // eslint-disable-line no-unused-vars
import { computeClientHealth, generateClientAlerts, SEVERITY_ORDER } from '../../utils/clientHealth';

const SEVERITY_STYLES = {
  critical: {
    bg: 'bg-[#FF4560]/10',
    border: 'border-[#FF4560]/40',
    text: 'text-[#FF4560]',
    dot: '#FF4560',
    label: '🔴 CRÍTICO',
  },
  high: {
    bg: 'bg-[#FF9406]/10',
    border: 'border-[#FF9406]/40',
    text: 'text-[#FF9406]',
    dot: '#FF9406',
    label: '🟠 ALTO',
  },
  medium: {
    bg: 'bg-[#F5A623]/10',
    border: 'border-[#F5A623]/40',
    text: 'text-[#F5A623]',
    dot: '#F5A623',
    label: '🟡 MÉDIO',
  },
};

const OperationalAlerts = ({ clients, onOpenClient }) => {
  const [filterSeverity, setFilterSeverity] = useState('all'); // all | critical | high | medium
  const [expanded, setExpanded] = useState(true);

  // Computa todos os alertas de todos os clientes
  // Fix: parsing UMA VEZ por cliente, extraindo logo aqui pra não re-parsear no AlertCard
  const allAlerts = useMemo(() => {
    const items = [];
    (clients || []).forEach(client => {
      try {
        const data = typeof client.data === 'string' ? JSON.parse(client.data || '{}') : (client.data || {});
        const health = computeClientHealth(data);
        if (!health) return;
        const clientLogo = data?.restaurant?.logo || null;
        const alerts = generateClientAlerts(health);
        alerts.forEach(alert => {
          items.push({
            ...alert,
            client,
            clientLogo,
            health,
          });
        });
      } catch (e) {
        console.warn('Erro ao processar cliente:', client.name, e);
      }
    });
    // Ordena por severity, depois por nome do cliente (estável entre re-renders)
    items.sort((a, b) => {
      const sevDiff = SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity];
      if (sevDiff !== 0) return sevDiff;
      return (a.client.name || '').localeCompare(b.client.name || '');
    });
    return items;
  }, [clients]);

  const filtered = filterSeverity === 'all'
    ? allAlerts
    : allAlerts.filter(a => a.severity === filterSeverity);

  const counts = {
    critical: allAlerts.filter(a => a.severity === 'critical').length,
    high: allAlerts.filter(a => a.severity === 'high').length,
    medium: allAlerts.filter(a => a.severity === 'medium').length,
  };

  const total = allAlerts.length;

  if (total === 0) {
    return (
      <div className="bg-gradient-to-br from-[#00B37E]/10 to-[#141416] border border-[#00B37E]/30 rounded-[18px] p-5 mb-6">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-full bg-[#00B37E]/20 flex items-center justify-center">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
              <path d="M22 11.08V12a10 10 0 11-5.93-9.14" stroke="#00B37E" strokeWidth="2" strokeLinecap="round"/>
              <path d="M22 4L12 14.01l-3-3" stroke="#00B37E" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </div>
          <div>
            <div className="text-[15px] font-bold text-white">Tudo certo no portfólio! 🎉</div>
            <div className="text-[11px] text-[#868686] mt-0.5">Nenhum cliente com alerta operacional crítico no momento.</div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
      className="bg-gradient-to-br from-[#1a1410] via-[#141416] to-[#0F0F11] border border-[#FF4560]/20 rounded-[18px] mb-6 overflow-hidden">
      {/* Header */}
      <button
        onClick={() => setExpanded(v => !v)}
        aria-label={expanded ? 'Recolher lista de alertas' : 'Expandir lista de alertas'}
        aria-expanded={expanded}
        className="w-full flex items-center justify-between p-5 pb-3 hover:bg-white/[0.02] transition-colors"
      >
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-full bg-[#FF4560]/15 flex items-center justify-center relative">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
              <path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" stroke="#FF4560" strokeWidth="2" strokeLinecap="round"/>
              <path d="M12 9v4M12 17h.01" stroke="#FF4560" strokeWidth="2" strokeLinecap="round"/>
            </svg>
            {counts.critical > 0 && (
              <span className="absolute -top-1 -right-1 w-5 h-5 bg-[#FF4560] rounded-full flex items-center justify-center text-[10px] font-bold text-white">
                {counts.critical}
              </span>
            )}
          </div>
          <div className="text-left">
            <div className="text-[15px] font-bold text-white">
              {total} restaurante{total !== 1 ? 's' : ''} precisa{total === 1 ? '' : 'm'} de atenção
            </div>
            <div className="text-[11px] text-[#868686] mt-0.5 flex items-center gap-2 flex-wrap">
              {counts.critical > 0 && <span className="text-[#FF4560] font-semibold">{counts.critical} crítico{counts.critical !== 1 ? 's' : ''}</span>}
              {counts.critical > 0 && counts.high > 0 && <span className="text-[#444]">·</span>}
              {counts.high > 0 && <span className="text-[#FF9406] font-semibold">{counts.high} alto{counts.high !== 1 ? 's' : ''}</span>}
              {counts.high > 0 && counts.medium > 0 && <span className="text-[#444]">·</span>}
              {counts.medium > 0 && <span className="text-[#F5A623] font-semibold">{counts.medium} médio{counts.medium !== 1 ? 's' : ''}</span>}
            </div>
          </div>
        </div>
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" className="text-[#666]"
          style={{ transform: expanded ? 'rotate(180deg)' : 'rotate(0deg)', transition: 'transform 0.2s' }}>
          <path d="M6 9l6 6 6-6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
        </svg>
      </button>

      {expanded && (
        <>
          {/* Filtros de severidade */}
          <div className="flex gap-2 px-5 pb-3 flex-wrap">
            <button
              onClick={() => setFilterSeverity('all')}
              className={`text-[11px] font-semibold px-3 py-1.5 rounded-full transition-colors ${
                filterSeverity === 'all'
                  ? 'bg-white/10 text-white'
                  : 'bg-white/[0.04] text-[#868686] hover:bg-white/[0.08]'
              }`}
            >
              Todos ({total})
            </button>
            {counts.critical > 0 && (
              <button onClick={() => setFilterSeverity('critical')}
                className={`text-[11px] font-semibold px-3 py-1.5 rounded-full transition-colors ${
                  filterSeverity === 'critical'
                    ? 'bg-[#FF4560]/20 text-[#FF4560] border border-[#FF4560]/40'
                    : 'bg-white/[0.04] text-[#868686] hover:bg-white/[0.08]'
                }`}>
                🔴 Crítico ({counts.critical})
              </button>
            )}
            {counts.high > 0 && (
              <button onClick={() => setFilterSeverity('high')}
                className={`text-[11px] font-semibold px-3 py-1.5 rounded-full transition-colors ${
                  filterSeverity === 'high'
                    ? 'bg-[#FF9406]/20 text-[#FF9406] border border-[#FF9406]/40'
                    : 'bg-white/[0.04] text-[#868686] hover:bg-white/[0.08]'
                }`}>
                🟠 Alto ({counts.high})
              </button>
            )}
            {counts.medium > 0 && (
              <button onClick={() => setFilterSeverity('medium')}
                className={`text-[11px] font-semibold px-3 py-1.5 rounded-full transition-colors ${
                  filterSeverity === 'medium'
                    ? 'bg-[#F5A623]/20 text-[#F5A623] border border-[#F5A623]/40'
                    : 'bg-white/[0.04] text-[#868686] hover:bg-white/[0.08]'
                }`}>
                🟡 Médio ({counts.medium})
              </button>
            )}
          </div>

          {/* Lista de alertas */}
          <div className="px-5 pb-5 max-h-[480px] overflow-y-auto space-y-2">
            {filtered.length === 0 ? (
              <div className="text-[12px] text-[#666] text-center py-6">
                Nenhum alerta nessa severidade.
              </div>
            ) : filtered.slice(0, 20).map((alert, idx) => (
              <AlertCard
                key={`${alert.client.id}-${alert.type}-${idx}`}
                alert={alert}
                onOpen={() => onOpenClient?.(alert.client.hash, alert.page)}
              />
            ))}
            {filtered.length > 20 && (
              <div className="text-[10px] text-[#666] text-center pt-2">
                Mostrando 20 de {filtered.length}. Filtre por severidade pra refinar.
              </div>
            )}
          </div>
        </>
      )}
    </motion.div>
  );
};

const AlertCard = ({ alert, onOpen }) => {
  const style = SEVERITY_STYLES[alert.severity] || SEVERITY_STYLES.medium;
  // Fix: clientLogo agora vem pré-extraído do alert (sem re-parsear cliente.data)
  const { clientLogo } = alert;
  const [imgFailed, setImgFailed] = useState(false);

  return (
    <motion.button
      type="button"
      initial={{ opacity: 0, x: -10 }}
      animate={{ opacity: 1, x: 0 }}
      className={`group flex items-start gap-3 p-3 rounded-[12px] border ${style.border} ${style.bg} hover:bg-white/[0.04] transition-colors cursor-pointer text-left w-full`}
      onClick={onOpen}
      aria-label={`Abrir cliente ${alert.client.name}: ${alert.title}`}
    >
      {/* Avatar do cliente — fix: usa state pra fallback ao invés de DOM manipulation */}
      <div className="shrink-0">
        {clientLogo && !imgFailed ? (
          <img src={clientLogo} alt={alert.client.name}
            className="w-9 h-9 rounded-full object-cover bg-white/[0.04]"
            onError={() => setImgFailed(true)}
          />
        ) : (
          <div className={`w-9 h-9 rounded-full ${style.bg} ${style.text} flex items-center justify-center text-[12px] font-bold`}>
            {(alert.client.name || '?').charAt(0).toUpperCase()}
          </div>
        )}
      </div>

      {/* Conteúdo do alerta */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-1 flex-wrap">
          <span className="text-[12px] font-bold text-white truncate">{alert.client.name}</span>
          <span className={`text-[9px] font-bold uppercase tracking-wider ${style.text}`}>
            {style.label}
          </span>
        </div>
        <div className={`text-[12px] font-semibold ${style.text} mb-0.5`}>
          {alert.title}
        </div>
        <div className="text-[11px] text-[#999] mb-1.5 leading-snug">
          {alert.description}
        </div>
        <div className="flex items-center gap-1.5 text-[11px] text-[#868686]">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none">
            <path d="M9 18l6-6-6-6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
          <span className="italic">Sugestão: <span className="text-[#CCC]">{alert.action}</span></span>
        </div>
      </div>

      {/* Botão de ação */}
      <div className="shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
        <div className="text-[10px] font-bold text-[#F5A623] bg-[#F5A623]/10 px-2.5 py-1.5 rounded-md whitespace-nowrap">
          Abrir →
        </div>
      </div>
    </motion.button>
  );
};

export default OperationalAlerts;
