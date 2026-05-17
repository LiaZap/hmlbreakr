/* eslint-disable no-unused-vars */
import React, { useState, useMemo, useCallback } from 'react';
import { motion } from 'framer-motion';

/**
 * CommercialFunnel — BAH-091
 * Funil de jornada de TESTE (trial) de 7 dias para o time comercial.
 *
 * Jornada (7 dias desde o cadastro / createdAt):
 *  - D0: cliente se cadastra -> entra como LEAD
 *  - D1: abordagem do comercial (acompanhar e ajudar a preencher)
 *  - D3: follow-up de cadastro de fichas técnicas
 *  - D5: reunião de leitura/preenchimento dos dados
 *  - D7: follow-up para manter a assinatura
 *  Dias-chave de AÇÃO: 0, 1, 3, 5, 7. Os demais (2, 4, 6) são de espera.
 *
 * Regras de negócio:
 *  - Clientes que JÁ PAGARAM não entram no funil.
 *    Critério "pago": `stripeSubscriptionId` OU `stripeCustomerId` preenchido.
 *    O endpoint GET /admin/clients EXPÕE esses campos no `select`
 *    (server/src/routes.js) — o filtro de pago funciona automaticamente.
 *  - Clientes cadastrados MANUALMENTE: não há flag explícita no model Client
 *    nem `clerkUserId` exposto no select. Enquanto isso, a exclusão de
 *    cadastros manuais recai sobre a marcação manual via localStorage (abaixo).
 *  - Clientes com mais de 7 dias e não convertidos saem do funil ativo e vão
 *    para um bloco separado "Expirados (fora do funil)".
 *  - Marcação manual de "cliente/pago": persistida em localStorage (V1
 *    client-side). V2 = endpoint backend (ex: POST /admin/clients/:id/convert).
 */

const STORAGE_KEY = 'breakr.admin.commercial.converted';

// Dias-chave com a ação esperada do comercial.
const KEY_DAYS = {
  0: { label: 'Cadastro', action: 'Cliente se cadastrou — entra como lead.' },
  1: { label: 'Abordagem', action: 'Abordar o cliente e ajudar a preencher o sistema.' },
  3: { label: 'Follow-up Fichas', action: 'Follow-up do cadastro de fichas técnicas.' },
  5: { label: 'Reunião', action: 'Reunião de leitura/preenchimento dos dados.' },
  7: { label: 'Retenção', action: 'Follow-up para manter a assinatura.' },
};

// ---- localStorage helpers (tolerantes a falha / SSR / modo privado) ----
function loadConverted() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return new Set();
    const arr = JSON.parse(raw);
    return new Set(Array.isArray(arr) ? arr : []);
  } catch {
    return new Set();
  }
}

function saveConverted(set) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify([...set]));
  } catch {
    /* localStorage indisponível (modo privado / quota) — ignora silenciosamente */
  }
}

// ---- Classificação ----
// "Pago": assinatura/cliente Stripe ativo. Defensivo: campos podem não vir.
function hasPaid(client) {
  return Boolean(client?.stripeSubscriptionId || client?.stripeCustomerId);
}

// Dias desde o cadastro. null quando createdAt ausente/ inválido.
function daysSinceSignup(client) {
  if (!client?.createdAt) return null;
  const t = new Date(client.createdAt).getTime();
  if (Number.isNaN(t)) return null;
  const diff = Math.floor((Date.now() - t) / 86400000);
  return diff < 0 ? 0 : diff;
}

const COL_KEY = '#F5A623';   // dias de ação
const COL_WAIT = '#3A3A3C';  // dias de espera

export default function CommercialFunnel({
  clients = [],
  getOnboardingProgress,
  getFinancial,
  getClientDisplay,
  getInitials,
  getColor,
  openClientAsAdmin,
}) {
  const [converted, setConverted] = useState(loadConverted);

  const toggleConverted = useCallback((id) => {
    setConverted((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      saveConverted(next);
      return next;
    });
  }, []);

  // Particiona os clientes em: dentro do funil (D0..D7), expirados (>7d) e
  // excluídos (pagos / convertidos manualmente / sem data de cadastro).
  const { byDay, expired, excludedCount, noDateCount } = useMemo(() => {
    const byDay = {};
    for (let d = 0; d <= 7; d++) byDay[d] = [];
    const expired = [];
    let excludedCount = 0;
    let noDateCount = 0;

    for (const c of clients) {
      if (!c) continue;
      // Fora do funil: já pagou ou marcado manualmente como cliente.
      if (hasPaid(c) || converted.has(c.id)) {
        excludedCount++;
        continue;
      }
      const days = daysSinceSignup(c);
      if (days == null) {
        // Sem createdAt válido — não dá pra posicionar no funil. Tratado como
        // expirado/indeterminado para não sumir da visão do comercial.
        noDateCount++;
        expired.push({ client: c, days: null });
        continue;
      }
      if (days > 7) {
        expired.push({ client: c, days });
      } else {
        byDay[days].push(c);
      }
    }
    return { byDay, expired, excludedCount, noDateCount };
  }, [clients, converted]);

  const activeLeads = useMemo(
    () => Object.values(byDay).reduce((s, arr) => s + arr.length, 0),
    [byDay],
  );

  // Conversão = pagos / (pagos + leads ativos + expirados). Aproximação:
  // pagos inclui convertidos manualmente.
  const paidTotal = useMemo(
    () => clients.filter((c) => c && (hasPaid(c) || converted.has(c.id))).length,
    [clients, converted],
  );
  const denom = paidTotal + activeLeads + expired.length;
  const conversionRate = denom > 0 ? Math.round((paidTotal / denom) * 100) : 0;

  const todayActionDays = [0, 1, 3, 5, 7].filter((d) => byDay[d]?.length > 0);

  return (
    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4 }}>
      {/* Header */}
      <div className="mb-6">
        <div className="flex items-center gap-2 mb-2">
          <span className="text-[11px] font-semibold text-[#A78BFA] uppercase tracking-widest bg-[#A78BFA]/10 px-2.5 py-1 rounded-full border border-[#A78BFA]/20">
            Funil de Teste
          </span>
        </div>
        <h2 className="text-[28px] font-bold text-white tracking-tight">Comercial</h2>
        <p className="text-[13px] text-[#868686] mt-1">
          Jornada de 7 dias do trial — saiba quais clientes abordar em cada dia.
        </p>
      </div>

      {/* Métricas */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-5">
        <MetricCard label="Leads ativos" value={activeLeads} color="#F5A623" />
        <MetricCard label="Ação hoje" value={(byDay[0]?.length || 0) + (byDay[1]?.length || 0) + (byDay[3]?.length || 0) + (byDay[5]?.length || 0) + (byDay[7]?.length || 0)} color="#A78BFA" />
        <MetricCard label="Convertidos" value={paidTotal} color="#00B37E" />
        <MetricCard label="Expirados" value={expired.length} color="#FF4560" />
      </div>

      {/* Barra de conversão */}
      <div className="bg-[#1B1B1D] border border-[#2A2A2C] rounded-[14px] p-4 mb-5">
        <div className="flex items-center justify-between mb-2">
          <span className="text-[12px] text-[#868686] font-medium">Taxa de conversão do trial</span>
          <span
            className="text-[12px] font-bold"
            style={{ color: conversionRate >= 50 ? '#00B37E' : conversionRate >= 25 ? '#F5A623' : '#FF4560' }}
          >
            {conversionRate}%
          </span>
        </div>
        <div className="flex h-[8px] rounded-full overflow-hidden bg-[#252527]">
          {denom > 0 && (
            <>
              <div style={{ width: `${(paidTotal / denom) * 100}%`, backgroundColor: '#00B37E' }} className="transition-all duration-500" title={`Convertidos: ${paidTotal}`} />
              <div style={{ width: `${(activeLeads / denom) * 100}%`, backgroundColor: '#F5A623' }} className="transition-all duration-500" title={`Em trial: ${activeLeads}`} />
              <div style={{ width: `${(expired.length / denom) * 100}%`, backgroundColor: '#FF4560' }} className="transition-all duration-500" title={`Expirados: ${expired.length}`} />
            </>
          )}
        </div>
        <div className="flex items-center gap-4 mt-2 flex-wrap">
          <Legend color="#00B37E" label={`Convertidos (${paidTotal})`} />
          <Legend color="#F5A623" label={`Em trial (${activeLeads})`} />
          <Legend color="#FF4560" label={`Expirados (${expired.length})`} />
        </div>
      </div>

      {/* Lista vazia geral */}
      {clients.length === 0 ? (
        <EmptyState text="Nenhum cliente cadastrado ainda." />
      ) : activeLeads === 0 && expired.length === 0 ? (
        <EmptyState text="Nenhum lead em trial — todos já converteram ou foram cadastrados manualmente." />
      ) : (
        <>
          {/* Funil de 7 dias */}
          <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-3 mb-6">
            {Array.from({ length: 8 }, (_, d) => {
              const isKey = d in KEY_DAYS;
              const list = byDay[d] || [];
              const accent = isKey ? COL_KEY : COL_WAIT;
              return (
                <div
                  key={d}
                  className="bg-[#1B1B1D] border rounded-[14px] p-3 flex flex-col min-h-[140px]"
                  style={{ borderColor: isKey ? `${COL_KEY}40` : '#2A2A2C' }}
                >
                  <div className="flex items-center justify-between mb-1">
                    <span
                      className="text-[11px] font-bold px-1.5 py-0.5 rounded"
                      style={{ color: accent, backgroundColor: `${accent}20` }}
                    >
                      D{d}
                    </span>
                    <span className="text-[11px] text-[#555] font-medium">{list.length}</span>
                  </div>
                  <div
                    className="text-[10px] font-semibold mb-1 leading-tight"
                    style={{ color: isKey ? '#fff' : '#666' }}
                  >
                    {isKey ? KEY_DAYS[d].label : 'Aguardando'}
                  </div>
                  {isKey && (
                    <div className="text-[9px] text-[#666] leading-snug mb-2">{KEY_DAYS[d].action}</div>
                  )}
                  <div className="space-y-2 mt-auto">
                    {list.length === 0 ? (
                      <div className="text-center py-3 text-[10px] text-[#444] border border-dashed border-[#2A2A2C] rounded-[10px]">
                        Vazio
                      </div>
                    ) : (
                      list.map((client) => (
                        <LeadCard
                          key={client.id}
                          client={client}
                          accent={accent}
                          getOnboardingProgress={getOnboardingProgress}
                          getFinancial={getFinancial}
                          getClientDisplay={getClientDisplay}
                          getInitials={getInitials}
                          getColor={getColor}
                          openClientAsAdmin={openClientAsAdmin}
                          onConvert={toggleConverted}
                        />
                      ))
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          {/* Expirados (fora do funil ativo) */}
          {expired.length > 0 && (
            <div className="bg-[#1B1B1D] border border-[#FF4560]/20 rounded-[14px] p-4">
              <div className="flex items-center gap-2 mb-1">
                <div className="w-2 h-2 rounded-full bg-[#FF4560]" />
                <span className="text-[13px] font-semibold text-white">Expirados — fora do funil ativo</span>
                <span className="text-[11px] text-[#555] ml-auto">{expired.length}</span>
              </div>
              <p className="text-[10px] text-[#666] mb-3 leading-snug">
                Mais de 7 dias sem conversão{noDateCount > 0 ? ' (ou sem data de cadastro)' : ''}.
                Avaliar reabordagem ou descarte.
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
                {expired.map(({ client, days }) => (
                  <LeadCard
                    key={client.id}
                    client={client}
                    accent="#FF4560"
                    overrideDays={days}
                    getOnboardingProgress={getOnboardingProgress}
                    getFinancial={getFinancial}
                    getClientDisplay={getClientDisplay}
                    getInitials={getInitials}
                    getColor={getColor}
                    openClientAsAdmin={openClientAsAdmin}
                    onConvert={toggleConverted}
                  />
                ))}
              </div>
            </div>
          )}

          {/* Rodapé informativo */}
          <p className="text-[10px] text-[#555] mt-4 leading-snug">
            {excludedCount} cliente(s) fora do funil (pagos ou marcados como cliente).
            Marcação manual salva neste navegador (localStorage) — V1 client-side.
          </p>
        </>
      )}
    </motion.div>
  );
}

// ---------- Subcomponentes ----------

function MetricCard({ label, value, color }) {
  return (
    <div className="bg-[#1B1B1D] border border-[#2A2A2C] rounded-[14px] p-4">
      <div className="flex items-center gap-2 mb-2">
        <div className="w-2 h-2 rounded-full" style={{ backgroundColor: color }} />
        <span className="text-[10px] text-[#868686] uppercase tracking-wider font-medium">{label}</span>
      </div>
      <span className="text-[24px] font-bold text-white">{value}</span>
    </div>
  );
}

function Legend({ color, label }) {
  return (
    <div className="flex items-center gap-1.5">
      <div className="w-2 h-2 rounded-full" style={{ backgroundColor: color }} />
      <span className="text-[10px] text-[#666]">{label}</span>
    </div>
  );
}

function EmptyState({ text }) {
  return (
    <div className="text-center py-12 text-[12px] text-[#555] bg-[#1B1B1D] rounded-[14px] border border-dashed border-[#2A2A2C]">
      {text}
    </div>
  );
}

function LeadCard({
  client,
  accent,
  overrideDays,
  getOnboardingProgress,
  getFinancial,
  getClientDisplay,
  getInitials,
  getColor,
  openClientAsAdmin,
  onConvert,
}) {
  const { displayName } = getClientDisplay
    ? getClientDisplay(client)
    : { displayName: client.name };
  const progress = getOnboardingProgress ? getOnboardingProgress(client) : 0;
  const fin = getFinancial ? getFinancial(client) : null;
  const color = getColor ? getColor(client.name || '') : '#F5A623';
  const days = overrideDays !== undefined ? overrideDays : daysSinceSignup(client);

  const handleConvert = (e) => {
    e.stopPropagation();
    onConvert(client.id);
  };

  const open = () => {
    if (client.hash && openClientAsAdmin) openClientAsAdmin(client.hash);
  };

  return (
    <div className="bg-[#141416] border border-[#2A2A2C] rounded-[12px] p-2.5 hover:border-[#3A3A3C] transition-all">
      <div className="flex items-center gap-2 mb-2 cursor-pointer" onClick={open}>
        <div
          className="w-7 h-7 rounded-[8px] flex items-center justify-center text-[10px] font-bold shrink-0"
          style={{ backgroundColor: `${color}20`, color }}
        >
          {getInitials ? getInitials(displayName) : '?'}
        </div>
        <div className="min-w-0">
          <div className="text-[12px] font-semibold text-white truncate">{displayName}</div>
          <div className="text-[9px] text-[#666]">{days == null ? 'sem data' : `${days}d desde o cadastro`}</div>
        </div>
      </div>
      <div className="flex items-center gap-1.5 flex-wrap mb-2">
        {progress > 0 && progress < 100 && (
          <span className="px-1.5 py-0.5 rounded bg-[#F5A623]/15 text-[#F5A623] text-[9px] font-medium">
            {progress}% preenchido
          </span>
        )}
        {progress === 0 && (
          <span className="px-1.5 py-0.5 rounded bg-[#252527] text-[#868686] text-[9px]">não iniciou</span>
        )}
        {fin && fin.revenue > 0 && (
          <span className="px-1.5 py-0.5 rounded bg-[#252527] text-[#868686] text-[9px]">
            R$ {(fin.revenue / 1000).toFixed(0)}k
          </span>
        )}
        {client.email && (
          <span className="px-1.5 py-0.5 rounded bg-[#252527] text-[#555] text-[9px] truncate max-w-[120px]">
            {client.email}
          </span>
        )}
      </div>
      <button
        onClick={handleConvert}
        className="w-full text-[10px] font-semibold py-1.5 rounded-[8px] bg-[#00B37E]/15 text-[#00B37E] hover:bg-[#00B37E]/25 border border-[#00B37E]/20 transition-colors"
      >
        Marcar como cliente
      </button>
    </div>
  );
}
