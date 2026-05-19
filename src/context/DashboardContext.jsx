/* eslint-disable react-refresh/only-export-components */
import React, { createContext, useState, useContext, useRef, useEffect } from 'react';

const API_URL = import.meta.env.VITE_API_URL || '';

export const DashboardContext = createContext();

export const useDashboard = () => useContext(DashboardContext);

/**
 * scheduleSync — debounce + AbortController pra evitar:
 *  - N POSTs sequenciais quando usuário edita rápido
 *  - race conditions onde sync antigo chega depois do novo
 *    (causa de perda de dados, ex: Garapas 2026-05-11)
 *
 * O debounce mantém o último payload válido. Cada chamada substitui o anterior.
 * Sync anterior em flight é abortado quando novo dispara.
 */
const SYNC_DEBOUNCE_MS = 600;
const createSyncScheduler = () => {
  let timer = null;
  let abortCtl = null;
  let pendingPayload = null;
  let pendingHash = null;

  const flush = async () => {
    if (!pendingPayload || !pendingHash) return;
    if (abortCtl) abortCtl.abort();
    abortCtl = new AbortController();
    const payload = pendingPayload;
    const hash = pendingHash;
    pendingPayload = null;
    try {
      await fetch(`${API_URL}/api/client/${hash}/sync`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
        signal: abortCtl.signal,
      });
    } catch (e) {
      if (e.name !== 'AbortError') console.error('Sync failed', e);
    }
  };

  return {
    schedule(hash, payload) {
      pendingHash = hash;
      pendingPayload = payload;
      if (timer) clearTimeout(timer);
      timer = setTimeout(flush, SYNC_DEBOUNCE_MS);
    },
    flushNow() {
      if (timer) { clearTimeout(timer); timer = null; }
      return flush();
    },
  };
};

/**
 * getSaoPauloNow — retorna { year, month (1-12), day } para o "agora" no fuso
 * America/Sao_Paulo, independente do fuso do navegador do usuário.
 *
 * BAH-090: o registro de faturamento diário grava datas como "YYYY-MM-DD"
 * (date string sem fuso). Para decidir qual é o "mês corrente" e "hoje" de
 * forma consistente com o resto do sistema (DailyBriefing já usa Sao_Paulo),
 * resolvemos o calendário sempre no fuso do Brasil. Assim um usuário acessando
 * de outro fuso (ou perto da virada de dia) não vê o mês corrente errado.
 */
const getSaoPauloNow = () => {
  try {
    const fmt = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'America/Sao_Paulo',
      year: 'numeric', month: '2-digit', day: '2-digit',
    });
    const parts = fmt.formatToParts(new Date());
    const get = (t) => parseInt(parts.find(p => p.type === t)?.value, 10);
    const year = get('year');
    const month = get('month');
    const day = get('day');
    if (!isNaN(year) && !isNaN(month) && !isNaN(day)) {
      return { year, month, day };
    }
  } catch {
    // Intl com timeZone pode falhar em runtimes muito antigos — cai no fallback.
  }
  const d = new Date();
  return { year: d.getFullYear(), month: d.getMonth() + 1, day: d.getDate() };
};

export const DashboardProvider = ({ children }) => {
  // Initial Mock Data (Fallback)
  const initialData = {
    restaurant: { name: "Seu Restaurante", category: "Gastronomia" },
    user: { name: "Usuário", role: "Proprietário da Conta", initials: "U" },
    period: { date: new Date().toLocaleDateString('pt-BR', { day: 'numeric', month: 'short', year: 'numeric' }), status: "Simulação", statusColor: "#FDD789" },
    overview: { subtitle: "Complete o onboarding para ver seus dados reais.", tags: [] },
    revenue: { total: "0,00", month: "-", status: "Neutral", change: "0%", risk: { label: "-", count: "-" }, cards: [] },
    breakEven: { percentage: 0, current: "0", min: "0", max: "0", base: { value: "0", status: "-", range: "-" } },
    marketComparison: [],
    // FIXED: Moved static data from FichaTecnica to here for global state management
    operational: {
      fichas: [],
      insumos: [],
      categories: {
          insumos: ['Proteínas', 'Grãos', 'Vinhos', 'Molhos', 'Legumes', 'Temperos', 'Óleos', 'Laticínios', 'Insumo Pronto Preparado', 'Outros'],
          fichas: ['Prato Principal', 'Entrada', 'Sobremesa', 'Drinks, Coquetéis e Sucos', 'Acompanhamento']
      }
    },
    menuEngineering: [],
    cards: {
        moneyOnTable: { total: "0,00", items: [], hasData: false },
        technicalSheets: [
            { label: 'CMV Teórico', value: '0%' },
            { label: 'Fichas Desatualizadas', value: '0' },
            { label: 'Produtos Sem Ficha', value: '0' }
        ],
        costStructure: { total: "0", percentage: "0%", breakdown: [] }
    },
    tips: []
  };

  const [dashboardData, setDashboardData] = useState(initialData);
  const [clientDataLoaded, setClientDataLoaded] = useState(false);
  const [clientDataError, setClientDataError] = useState(false);
  const [selectedMonthIndex, setSelectedMonthIndex] = useState(null);
  const recalcPendingRef = useRef(false);
  // Scheduler singleton — debounce + abort de sync evita race condition
  // que causou perda de dados (Garapas, 2026-05-11)
  const syncSchedulerRef = useRef(createSyncScheduler());

  // Flush pendente antes do unmount/refresh pra não perder último save
  useEffect(() => {
    const scheduler = syncSchedulerRef.current;
    const handler = () => { scheduler.flushNow(); };
    window.addEventListener('beforeunload', handler);
    return () => {
      window.removeEventListener('beforeunload', handler);
      scheduler.flushNow();
    };
  }, []);

  // Load Client Data if Hash exists
  React.useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const hash = params.get('hash');

    if (hash) {
      // Fetch from Backend API — envia flag quando admin está visualizando para não expor dados pessoais
      const isAdminViewing = !!sessionStorage.getItem('breaker-admin');
      fetch(`${API_URL}/api/client/${hash}`, {
        headers: isAdminViewing ? { 'x-admin-viewing': 'true' } : {}
      })
        .then(res => {
          if (!res.ok) throw new Error('Client not found');
          return res.json();
        })
        .then(data => {
          setDashboardData(prev => {
            const merged = { ...prev, ...data };
            // Enforce that technicalSheets uses the new layout scheme even if DB has old 4 items.
            // Since Dashboard computes this dynamically based on operational data, we can reset it.
            if (merged.cards) {
              const dbTs = merged.cards.technicalSheets || [];
              const getVal = (labelMatch) => dbTs.find(t => t.label?.includes(labelMatch))?.value || '0';
              
              merged.cards.technicalSheets = [
                { label: 'CMV Teórico', value: getVal('CMV Teórico') || getVal('CMV real') || getVal('CMV Global') },
                { label: 'Fichas Desatualizadas', value: getVal('Desatualizadas') },
                { label: 'Produtos Sem Ficha', value: getVal('Sem Ficha') }
              ];
            }

            // If onboarding was NOT completed (no formData), reset financial cards to zeros
            // to prevent stale calculated data from showing before the user fills out the onboarding
            if (!merged.formData) {
              merged.breakEven = initialData.breakEven;
              merged.revenue = { ...initialData.revenue };
              merged.cards = {
                ...merged.cards,
                moneyOnTable: initialData.cards.moneyOnTable,
                costStructure: initialData.cards.costStructure
              };
            }

            return merged;
          });
          setClientDataLoaded(true);
          // Schedule recalculation so computed fields (pctOfRevenue etc.) are up to date
          recalcPendingRef.current = true;
        })
        .catch(err => {
          console.error("Failed to load client data from API", err);
          setClientDataError(true);
          setClientDataLoaded(true);
        });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Helper to parse "R$ 1.234,56" -> 1234.56
  const parseCurrency = (value) => {
    if (!value && value !== 0) return 0;
    if (typeof value === 'number') return value;
    let str = String(value).replace(/R\$/g, '').trim();
    if (str.includes(',') && str.includes('.')) {
        str = str.replace(/\./g, '').replace(',', '.');
    } else if (str.includes(',')) {
        str = str.replace(',', '.');
    }
    return parseFloat(str) || 0;
  };

  // Helper to format 1234.56 -> "1.234,56"
  const formatMoney = (value) => {
    return value.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  };

  const updateDashboardData = (newData, { skipSync = false } = {}) => {

    // Determines if it is Form Data (flat object) or Partial Update (nested object)
    // If it has 'operational' OR 'menuEngineering', assume it's a direct state update
    if (newData.operational || newData.menuEngineering || newData.tips || newData.user || newData.restaurant) {
         setDashboardData(prev => {
             const updated = { ...prev, ...newData };
             // Preserve server-injected fields (merge so callers can update _profile)
             if (prev._clientEmail) updated._clientEmail = prev._clientEmail;
             if (prev._hasCredentials) updated._hasCredentials = prev._hasCredentials;
             updated._profile = { ...(prev._profile || {}), ...(newData._profile || {}) };
             // Persist to Backend — debounced + abortable
             const params = new URLSearchParams(window.location.search);
             const hash = params.get('hash');
             if (hash) syncSchedulerRef.current.schedule(hash, updated);
             return updated;
         });
         // Only trigger recalc for operational/financial changes, not for profile updates (user/restaurant)
         if (newData.operational || newData.menuEngineering || newData.tips) {
             recalcPendingRef.current = true;
         }
         return;
    }

    // Default: It is FORM DATA from Onboarding
    const formData = newData;

    // ... (Calculations remain exactly the same) ...
    // 1. DATA EXTRACTION & CALCULATIONS
    
    // Revenue (Smart Search: Closest to Current Month, then Annual History)
    const months = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
    // BAH-090: mês corrente resolvido no fuso America/Sao_Paulo para consistência
    // entre barras de faturamento, ponto de equilíbrio e custos dinâmicos.
    const currentMonthIndex = getSaoPauloNow().month - 1; // 0 = Jan, 11 = Dec
    
    let currentRevenue = 0;
    let currentMonthStr = "";
    
    // 1. Build Revenue History & Total
    // Check if new array format exists from Onboarding
    let revenueHistory = Array(12).fill(0);
    
    if (formData.revenue_history && Array.isArray(formData.revenue_history)) {
        // Find the most recent valid entries, or just sum them up / map to months
        // The new format is { month: "MM/AAAA", amount: "R$ 0,00" }
        formData.revenue_history.forEach(entry => {
             if (!entry.month || !entry.amount) return;
             const val = parseCurrency(entry.amount);
             const parts = entry.month.split('/');
             if (parts.length === 2) {
                 const monthIdx = parseInt(parts[0], 10) - 1; // 0-based
                 if (monthIdx >= 0 && monthIdx <= 11) {
                     revenueHistory[monthIdx] = val; // overwrite or add
                 }
             }
        });
    } else {
        // Fallback to old format
        revenueHistory = months.map(m => {
            const key = `revenue_${m}`;
            const rawValue = formData.revenue ? formData.revenue[key] : formData[key];
            return parseCurrency(rawValue);
        });
    }
    
    // Overlay daily revenue entries onto revenue bars
    // BAH-090: o faturamento diário (modal "Faturamento Diário" / futuras integrações
    // iFood, Suitable, AiqFome) é gravado em formData.daily_revenue como
    // { "YYYY-MM-DD": valor }. Ele precisa ser agregado por mês para alimentar
    // as barras de faturamento, o ponto de equilíbrio e os custos dinâmicos.
    const dailyRevenueData = formData.daily_revenue || {};
    const spNow = getSaoPauloNow(); // mês/dia corrente no fuso do Brasil
    const currentMonthIdx = spNow.month - 1; // 0-based
    const currentYear = spNow.year;
    const currentMonthKey = `${String(spNow.month).padStart(2, '0')}/${spNow.year}`;

    // dailyByMonth: total diário agregado por índice de mês (0-11), apenas do ANO corrente.
    // dailyByMonthKey: total agregado por chave "MM/YYYY", preservando o ano —
    // necessário para casar com as entradas de revenue_history e para o mês corrente.
    const dailyByMonth = {};
    const dailyByMonthKey = {};
    Object.entries(dailyRevenueData).forEach(([dateStr, v]) => {
        const parts = dateStr.split('-');
        if (parts.length < 2) return;
        const yyyy = parseInt(parts[0], 10);
        const monthNum = parseInt(parts[1], 10);
        if (isNaN(yyyy) || isNaN(monthNum) || monthNum < 1 || monthNum > 12) return;
        const amount = typeof v === 'number' ? v : parseCurrency(v);
        const key = `${String(monthNum).padStart(2, '0')}/${yyyy}`;
        dailyByMonthKey[key] = (dailyByMonthKey[key] || 0) + amount;
        if (yyyy === currentYear) {
            const monthIdx = monthNum - 1;
            dailyByMonth[monthIdx] = (dailyByMonth[monthIdx] || 0) + amount;
        }
    });
    // Apply daily totals to revenueHistory bars (array indexado por mês, ano corrente)
    Object.entries(dailyByMonth).forEach(([idx, total]) => {
        if (total > 0) revenueHistory[parseInt(idx)] = total;
    });

    const totalAnnualRevenue = revenueHistory.reduce((acc, val) => acc + val, 0);

    // Build chronological timeline for chart display (preserves year info)
    // BAH-090: as barras de faturamento consomem `revenueTimeline`. Antes, ele era
    // derivado APENAS de revenue_history (dados mensais do onboarding). Como o
    // faturamento diário do mês corrente normalmente NÃO tem entrada em
    // revenue_history, a barra do mês corrente nunca aparecia — mesmo o valor já
    // sendo contado no Ponto de Equilíbrio (que lê daily_revenue direto).
    // Correção: 1) o overlay diário casa por chave "MM/YYYY" (ano-aware);
    //           2) se o mês corrente não existe em revenue_history mas tem
    //              lançamentos diários, injetamos uma barra sintética para ele.
    const monthNamesShortPT = ['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez'];
    let revenueTimeline = [];
    const timelineKeys = new Set();
    if (formData.revenue_history && Array.isArray(formData.revenue_history)) {
        const parsed = formData.revenue_history
            .filter(e => e.month && e.amount)
            .map(e => {
                const parts = e.month.split('/');
                if (parts.length < 2) return null;
                const mm = parseInt(parts[0], 10);
                const yyyy = parseInt(parts[1], 10);
                if (isNaN(mm) || isNaN(yyyy) || mm < 1 || mm > 12) return null;
                const val = parseCurrency(e.amount);
                // Overlay diário: se há lançamentos diários para este mês/ano,
                // eles substituem o valor mensal (fonte mais granular e atual).
                const monthKey = `${String(mm).padStart(2, '0')}/${yyyy}`;
                const dailyTotal = dailyByMonthKey[monthKey] || 0;
                const finalVal = dailyTotal > 0 ? dailyTotal : val;
                return {
                    key: e.month,
                    label: `${monthNamesShortPT[mm-1]}/${String(yyyy).slice(-2)}`,
                    value: finalVal,
                    monthIdx: mm - 1,
                    year: yyyy
                };
            })
            .filter(Boolean);
        // Sort oldest → newest
        parsed.sort((a, b) => a.year !== b.year ? a.year - b.year : a.monthIdx - b.monthIdx);
        // Deduplicate by key
        revenueTimeline = parsed.filter(e => {
            if (timelineKeys.has(e.key)) return false;
            timelineKeys.add(e.key);
            return true;
        });
    }

    // BAH-090: garante a barra do MÊS CORRENTE.
    // Se o mês corrente (fuso Brasil) tem faturamento diário mas ainda não está
    // representado na timeline, injeta uma barra sintética com o total diário.
    // Assim "Faturamento Diário" reflete imediatamente nas barras, e o sistema
    // fica pronto para receber lançamentos das integrações (iFood/Suitable/AiqFome).
    if (revenueTimeline.length > 0 && !timelineKeys.has(currentMonthKey)
        && (dailyByMonthKey[currentMonthKey] || 0) > 0) {
        revenueTimeline.push({
            key: currentMonthKey,
            label: `${monthNamesShortPT[currentMonthIdx]}/${String(currentYear).slice(-2)}`,
            value: dailyByMonthKey[currentMonthKey],
            monthIdx: currentMonthIdx,
            year: currentYear,
        });
        timelineKeys.add(currentMonthKey);
        // Reordena cronologicamente após a injeção
        revenueTimeline.sort((a, b) => a.year !== b.year ? a.year - b.year : a.monthIdx - b.monthIdx);
    }

    // For financial calcs: past months with daily data use the daily total (complete month).
    // Current month with daily data is partial, so use onboarding value for calcs.
    const revenueHistoryForCalc = [...revenueHistory];
    if (dailyByMonth[currentMonthIdx] > 0) {
        const origVal = formData.revenue_history?.find(e => {
            if (!e?.month) return false;
            const parts = e.month.split('/');
            return parts.length === 2 && parseInt(parts[0], 10) - 1 === currentMonthIdx;
        });
        revenueHistoryForCalc[currentMonthIdx] = origVal ? parseCurrency(origVal.amount) : 0;
    }

    // 2. Find "Current" Revenue (Prioritize current month -> past months -> wrap around to end of year)
    // currentYear já foi resolvido acima a partir do fuso America/Sao_Paulo (BAH-090).
    const searchOrder = [
        ...Array.from({ length: currentMonthIndex + 1 }, (_, i) => currentMonthIndex - i), // Current down to 0
        ...Array.from({ length: 11 - currentMonthIndex }, (_, i) => 11 - i) // 11 down to Current+1
    ];

    // Use revenueHistoryForCalc for currentRevenue so partial daily data doesn't distort financial calcs
    for (let idx of searchOrder) {
        if (revenueHistoryForCalc[idx] > 0) {
            currentRevenue = revenueHistoryForCalc[idx];
            currentMonthStr = new Date(currentYear, idx, 1).toLocaleString('pt-BR', { month: 'long' });
            currentMonthStr = currentMonthStr.charAt(0).toUpperCase() + currentMonthStr.slice(1);
            break;
        }
    }

    // If still 0, default to first non-zero found, or 0
    if (currentRevenue === 0 && totalAnnualRevenue > 0) {
        const firstNonZeroIdx = revenueHistoryForCalc.findIndex(v => v > 0);
        if (firstNonZeroIdx !== -1) {
             currentRevenue = revenueHistoryForCalc[firstNonZeroIdx];
             currentMonthStr = new Date(currentYear, firstNonZeroIdx, 1).toLocaleString('pt-BR', { month: 'long' });
             currentMonthStr = currentMonthStr.charAt(0).toUpperCase() + currentMonthStr.slice(1);
        }
    }

    // Override with selected month if user clicked a bar
    if (selectedMonthIndex !== null && revenueHistory[selectedMonthIndex] > 0) {
        currentRevenue = revenueHistory[selectedMonthIndex];
        currentMonthStr = new Date(currentYear, selectedMonthIndex, 1).toLocaleString('pt-BR', { month: 'long' });
        currentMonthStr = currentMonthStr.charAt(0).toUpperCase() + currentMonthStr.slice(1);
    }

    // Fixed Costs
    let fixedCosts = 0;
    const addCost = (val) => fixedCosts += parseCurrency(val);
    const sumComposite = (parentId, fields) => {
        if (!formData[parentId]) return;
        fields.forEach(f => addCost(formData[parentId][f]));
    };

    // Location
    if (formData.location_costs) {
        addCost(formData.location_costs.rent);
        addCost(parseCurrency(formData.location_costs.iptu_annual) / 12);
    }
    
    // Utilities (with new split fields), Recurring, Operational Fixed
    sumComposite('utilities', ['energy', 'water', 'internet', 'telefone', 'security', 'security_guard']);
    sumComposite('recurring_services', ['pest_control', 'waste_removal', 'cleaning_supplies']);
    sumComposite('operational_fixed', ['kitchen_gas', 'kitchen_oil', 'disposables']);

    // Monthly Services (dynamic list)
    if (formData.monthly_services && Array.isArray(formData.monthly_services)) {
        formData.monthly_services.forEach(item => addCost(item.value));
    }
    
    // Admin Systems
    sumComposite('admin_systems', ['software_pdv', 'accountant', 'card_machine_rent']);
    if (formData.identity?.is_mei === 'Sim') {
        sumComposite('admin_systems', ['taxes_das']);
    }
    
    // Marketing
    sumComposite('marketing_structure', ['agency', 'ads_budget']);
    if (formData.marketing_structure && formData.marketing_structure.gifts_cost && formData.marketing_structure.gifts_qty) {
        const giftCost = parseCurrency(formData.marketing_structure.gifts_cost);
        const giftQty = parseFloat(formData.marketing_structure.gifts_qty) || 0;
        fixedCosts += giftCost * giftQty;
    }

    // Marketplaces (Fixed Fee)
    if (formData.fees_marketplaces && Array.isArray(formData.fees_marketplaces)) {
        formData.fees_marketplaces.forEach(item => addCost(item.monthly_fee));
    }

    // Vehicles
    if (formData.vehicles && Array.isArray(formData.vehicles)) {
        formData.vehicles.forEach(v => {
            addCost(v.installment);
            addCost(v.maintenance_monthly);
            addCost(parseCurrency(v.insurance_annual) / 12);
            addCost(parseCurrency(v.ipva_annual) / 12);
        });
    }

    // Equipment (Depreciation — fixed 5-year lifespan = 60 months)
    let depreciationTotal = 0;
    if (formData.equipment && Array.isArray(formData.equipment)) {
        formData.equipment.forEach(eq => {
            const val = parseCurrency(eq.value);
            const years = parseFloat(eq.lifespan) || 5; // Fixed at 5 years
            if (years > 0) {
                depreciationTotal += val / (years * 12);
                fixedCosts += val / (years * 12);
            }
        });
    }

    // Other Fixed Costs
    if (formData.other_fixed_costs && Array.isArray(formData.other_fixed_costs)) {
        formData.other_fixed_costs.forEach(item => addCost(item.value));
    }

    // Personnel Costs
    // Separados em "efetivo" (caixa todo mês) e "provisionamento" (reservas pra 13º, férias, rescisão).
    // BASE usa apenas efetivo por padrão (toggle no BaseModal pode incluir provisionamento).
    let personnelEfetivo = 0;             // Salário + FGTS + benefícios + prêmio (caixa mensal real)
    let personnelProvisionamento = 0;     // 13º, férias, FGTS sobre prov, multa, aviso (reservas)
    let employeeReserves = 0;             // legado: total de provisões CLT (alias de personnelProvisionamento dos funcionários)
    const employeesWithProvision = [];    // detalhamento por funcionário pra UI

    if (formData.partners && Array.isArray(formData.partners)) {
        formData.partners.forEach(p => {
             const pl = parseCurrency(p.pro_labore);
             // Pró-labore + 11% (INSS) é caixa mensal real, conta como efetivo
             personnelEfetivo += pl + (pl * 0.11);
        });
    }

    if (formData.employees && Array.isArray(formData.employees)) {
        formData.employees.forEach(e => {
             const base = parseCurrency(e.base_salary);
             const premio = parseCurrency(e.premio);
             if (e.regime === 'CLT') {
                 // Efetivo (caixa mensal)
                 const fgts = base * 0.08;
                 const efetivo = base + fgts;
                 // Provisionamento (reservas pra datas específicas)
                 const prov13 = base / 12;
                 const provFerias = (base * 1.3333) / 12;
                 const fgtsProv = (prov13 + provFerias) * 0.08;
                 const multa = (fgts + fgtsProv) * 0.50;
                 const aviso = base / 12;
                 const aviso13 = aviso / 12;
                 const avisoFerias = (aviso + aviso / 3) / 12;
                 const avisoFgts = (aviso13 + avisoFerias) * 0.08;
                 const provisao = prov13 + provFerias + fgtsProv + multa + aviso + aviso13 + avisoFerias + avisoFgts;

                 personnelEfetivo += efetivo + premio;
                 personnelProvisionamento += provisao;
                 employeeReserves += provisao + fgts; // legado: mantém soma anterior pra compatibilidade

                 employeesWithProvision.push({
                     name: e.name || `Funcionário ${employeesWithProvision.length + 1}`,
                     regime: 'CLT',
                     base,
                     efetivoMensal: efetivo + premio,
                     totalProvisionamento: provisao,
                     custoTotal: efetivo + premio + provisao,
                     riskWarning: null,
                 });
             } else if (e.regime === 'PJ') {
                 // PJ: sem encargos, mas risco de vínculo disfarçado se trabalhar como CLT
                 personnelEfetivo += base + premio;
                 employeesWithProvision.push({
                     name: e.name || `Funcionário ${employeesWithProvision.length + 1}`,
                     regime: 'PJ',
                     base,
                     efetivoMensal: base + premio,
                     totalProvisionamento: 0,
                     custoTotal: base + premio,
                     riskWarning: 'Atenção a vínculo disfarçado — exclusividade + subordinação + habitualidade pode gerar passivo trabalhista.',
                 });
             } else {
                 // Freelancer ou outro: pagamento direto
                 personnelEfetivo += base + premio;
                 employeesWithProvision.push({
                     name: e.name || `Funcionário ${employeesWithProvision.length + 1}`,
                     regime: e.regime || 'Freela',
                     base,
                     efetivoMensal: base + premio,
                     totalProvisionamento: 0,
                     custoTotal: base + premio,
                     riskWarning: '⚠️ Risco trabalhista — relação contínua de freelancer pode ser caracterizada como vínculo CLT.',
                 });
             }
        });
    }

    // Total de pessoal — versão efetiva (sem provisionamento) e completa (com)
    const personnelCostsEfetivo = personnelEfetivo;
    const personnelCostsCompleto = personnelEfetivo + personnelProvisionamento;
    // Mantém personnelCosts como o efetivo (default = sem provisionamento, conforme ticket)
    let personnelCosts = personnelCostsEfetivo;
    
    // Benefits per employee (embedded in each employee card)
    if (formData.employees && Array.isArray(formData.employees)) {
        formData.employees.forEach(emp => {
            const transValue = parseCurrency(emp.transport_value);
            const transQty = parseFloat(emp.transport_qty) || 0;
            const workDays = parseFloat(emp.work_days) || 0;
            const foodCost = parseCurrency(emp.food_cost);
            personnelCosts += (transValue * transQty * workDays);
            personnelCosts += (foodCost * workDays);
        });
    }
    // Legacy: support old benefits format
    if (formData.benefits && !formData.employees?.[0]?.transport_value) {
        const transValue = parseCurrency(formData.benefits.transport_value);
        const transQty = parseFloat(formData.benefits.transport_qty) || 0;
        const workDays = parseFloat(formData.benefits.work_days) || 0;
        const foodCost = parseCurrency(formData.benefits.food_cost);
        const empCount = formData.employees ? formData.employees.length : 1;
        personnelCosts += (transValue * transQty * workDays * empCount);
        personnelCosts += (foodCost * workDays * empCount);
    }

    const totalFixedCosts = fixedCosts + personnelCosts;
    // Versão alternativa que inclui provisionamento — usada quando toggle do BaseModal está ON
    const totalFixedCostsCompleto = fixedCosts + personnelCostsCompleto;

    // CMV Teórico: only from fichas técnicas (menuEngineering data)
    // If no fichas exist, CMV = 0 (not 35% default)
    //
    // BAH-089 — Custos Variáveis Totais divergentes:
    //   O campo `sales` da ficha técnica é a MÉDIA/estimativa de vendas que o
    //   cliente digita — NÃO é venda realizada. O sistema usa esse `sales` como
    //   peso de MIX para derivar o CMV% teórico. Como CMV% é uma razão
    //   (custo/preço ponderado), o mix-weighting é estatisticamente válido para
    //   uma ESTIMATIVA — mas o resultado precisa ser tratado HONESTAMENTE como
    //   estimativa, não como CMV realizado.
    //
    //   Problema: quando o cliente "chuta" o `sales` (ou deixa preços/custos
    //   incoerentes numa ficha), o CMV% pode disparar para valores absurdos
    //   (ex.: > 90%). Isso inflava os Custos Variáveis Totais e, via margem de
    //   contribuição, gerava uma curva de Ponto de Equilíbrio IRREAL
    //   (break-even tendendo ao infinito).
    //
    //   Correção (escopo atual, SEM integração DRE):
    //     1. CMV% continua sendo uma ESTIMATIVA derivada das fichas — sinalizado
    //        por `cmvIsEstimate` para a UI deixar isso claro.
    //     2. Clamp de sanidade: CMV% teórico é limitado a 95%. Acima disso é
    //        quase certamente erro de cadastro (preço < custo) e não pode
    //        engessar o P/E num valor irreal.
    //   FUTURO (fora de escopo agora): o CMV "realizado" deveria vir do DRE /
    //   contas a pagar (integração Suitable + conciliação de relatório de
    //   vendas). Enquanto essa integração não existe, este valor permanece
    //   declaradamente uma estimativa.
    const CMV_THEORETICAL_CAP = 0.95; // teto de sanidade p/ não gerar P/E irreal
    let cmvPercentage = 0;
    let hasCmvData = false;
    let cmvIsEstimate = false;
    let cmvWasCapped = false;

    if (dashboardData.menuEngineering && dashboardData.menuEngineering.length > 0) {
        let totalSalesRevenue = 0;
        let totalSalesCost = 0;
        // BAH-083: itens com categoria de insumo (ex.: "Insumo Pronto Preparado")
        // não são pratos vendáveis — auto-criam ficha mas não devem entrar no
        // CMV teórico do cardápio. Mesmo critério usado em MatrizPreco/EngenhariaMenu.
        const isInsumoCat = (c) => String(c || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim() === 'insumo pronto preparado';
        dashboardData.menuEngineering.forEach(item => {
            if (isInsumoCat(item.category) || isInsumoCat(item.type)) return;
            const sales = parseFloat(String(item.sales).replace(',', '.')) || 0;
            const price = parseCurrency(item.price);
            const cost = parseCurrency(item.cost);
            totalSalesRevenue += sales * price;
            totalSalesCost += sales * cost;
        });
        if (totalSalesRevenue > 0) {
            const rawCmv = totalSalesCost / totalSalesRevenue;
            cmvWasCapped = rawCmv > CMV_THEORETICAL_CAP;
            cmvPercentage = Math.min(rawCmv, CMV_THEORETICAL_CAP);
            hasCmvData = true;
            // Sem DRE/integração de vendas reais, o CMV é sempre estimativa.
            cmvIsEstimate = true;
        }
    }

    // ── CMV efetivo: prioriza as fichas técnicas ───────────────────────────
    // O CMV tem duas fontes: (A) fichas com custo+preço cadastrados e
    // (B) menuEngineering com vendas lançadas. O painel de CMV já exibe a
    // fonte A quando existe. Aqui calculamos o CMV EFETIVO (A primeiro, B
    // depois) e passamos a usá-lo no custo variável e no Ponto de Equilíbrio.
    // Antes o P/E só "ligava" pela fonte B — cliente com fichas custeadas
    // mas sem vendas no menuEngineering via "Preencha suas Fichas" mesmo
    // tendo fichas. Agora o P/E funciona com qualquer fonte de CMV.
    const cmvPercentageDisplay = cmvPercentage * 100;
    const allFichasForCmv = dashboardData.operational?.fichas || [];
    const fichasComPreco = allFichasForCmv.filter(f => parseCurrency(f.precoVenda) > 0 && parseCurrency(f.custoTotal) > 0);
    const cmvFromFichas = fichasComPreco.length > 0
      ? (fichasComPreco.reduce((sum, f) => sum + (parseCurrency(f.custoTotal) / parseCurrency(f.precoVenda)), 0) / fichasComPreco.length) * 100
      : 0;
    // BAH-089: mesmo teto de sanidade — ficha com preço < custo não dispara P/E irreal.
    const cmvEffectiveRaw = fichasComPreco.length > 0 ? cmvFromFichas : (hasCmvData ? cmvPercentageDisplay : 0);
    const cmvEffective = Math.min(cmvEffectiveRaw, CMV_THEORETICAL_CAP * 100);
    const cmvEffectiveFraction = cmvEffective / 100; // fração 0-1 p/ custo variável
    // P/E "liga" quando QUALQUER fonte de CMV tem dado (fichas OU vendas).
    const hasCmvDataEffective = hasCmvData || fichasComPreco.length > 0;

    // Card machine fees (Débito + Crédito) — variable cost
    // Reference (ideal) market rates in Brazil
    const IDEAL_DEBIT_RATE = 1.5;  // %
    const IDEAL_CREDIT_RATE = 2.5; // %
    let cardFeePercentage = 0;
    const cardComparisonItems = [];
    if (formData.fees_cards && Array.isArray(formData.fees_cards)) {
        let totalRates = 0;
        let count = 0;
        formData.fees_cards.forEach(card => {
            const debit = parseFloat(String(card.debit_rate || '0').replace(',', '.').replace('%', '')) || 0;
            const credit = parseFloat(String(card.credit_rate || '0').replace(',', '.').replace('%', '')) || 0;
            totalRates += (debit + credit) / 2;
            count++;
            const debitExcess = Math.max(0, debit - IDEAL_DEBIT_RATE);
            const creditExcess = Math.max(0, credit - IDEAL_CREDIT_RATE);
            const avgExcess = (debitExcess + creditExcess) / 2;
            cardComparisonItems.push({
                name: card.provider || card.name || `Máquina ${cardComparisonItems.length + 1}`,
                debit, credit,
                debitIdeal: IDEAL_DEBIT_RATE,
                creditIdeal: IDEAL_CREDIT_RATE,
                avgExcessPct: avgExcess,
                aboveIdeal: debit > IDEAL_DEBIT_RATE || credit > IDEAL_CREDIT_RATE,
            });
        });
        if (count > 0) cardFeePercentage = totalRates / count / 100;
    }
    // Total monthly excess cost if card fees are above ideal
    const idealCardFeePercentage = (IDEAL_DEBIT_RATE + IDEAL_CREDIT_RATE) / 2 / 100;
    const cardFeeExcessCost = currentRevenue * Math.max(0, cardFeePercentage - idealCardFeePercentage);

    // Marketplace commissions (iFood, Rappi, etc.) — variable cost
    let marketplaceCommissionCost = 0;
    if (formData.fees_marketplaces && Array.isArray(formData.fees_marketplaces)) {
        formData.fees_marketplaces.forEach(m => {
            const commission = parseFloat(String(m.commission || '0').replace(',', '.').replace('%', '')) || 0;
            const salesPct = parseFloat(String(m.sales_percentage || '0').replace(',', '.').replace('%', '')) || 0;
            // Commission applies only to the portion of revenue from this marketplace
            marketplaceCommissionCost += currentRevenue * (salesPct / 100) * (commission / 100);
        });
    }

    // Variable costs = Card fees + CMV + Marketplace commissions
    const cardFeeCost = currentRevenue * cardFeePercentage;
    const cmvCost = currentRevenue * cmvEffectiveFraction;
    const variableCosts = cardFeeCost + cmvCost + marketplaceCommissionCost;

    // 2. METRICS CALCULATIONS
    
    // ======= TAX CALCULATIONS (Simples Nacional vs Outros) ========
    let percentTaxSimples = 0;
    let taxCostSimples = 0;
    
    if (formData.identity?.tax_regime === 'Simples Nacional' && formData.identity?.is_mei !== 'Sim') {
        const userProvidedRate = formData.admin_systems?.simples_rate;
        // If user typed '4,5', clean formatting
        const cleanRate = userProvidedRate ? parseFloat(userProvidedRate.toString().replace(',', '.')) : 0;
        
        if (cleanRate > 0) {
            percentTaxSimples = cleanRate / 100;
        } else {
            // Auto calculate based on Anexo I (Comércio) using annualized history (RBT12)
            const activeMonths = revenueHistory.filter(v => v > 0);
            const avgMonthlyRevenue = activeMonths.length > 0 ? (totalAnnualRevenue / activeMonths.length) : 0;
            const rbt12 = avgMonthlyRevenue * 12; // Annualize observed revenue for RBT12 table
            
            if (rbt12 <= 180000) {
                percentTaxSimples = 0.04;
            } else if (rbt12 <= 360000) {
                percentTaxSimples = ((rbt12 * 0.073) - 5940) / rbt12;
            } else if (rbt12 <= 720000) {
                percentTaxSimples = ((rbt12 * 0.095) - 13860) / rbt12;
            } else if (rbt12 <= 1800000) {
                percentTaxSimples = ((rbt12 * 0.107) - 22500) / rbt12;
            } else if (rbt12 <= 3600000) {
                percentTaxSimples = ((rbt12 * 0.143) - 87300) / rbt12;
            } else if (rbt12 > 0) {
                percentTaxSimples = ((rbt12 * 0.19) - 378000) / rbt12;
            }
        }
        taxCostSimples = currentRevenue * percentTaxSimples;
    }

    const totalVariableCosts = variableCosts + taxCostSimples;
    const totalCosts = totalFixedCosts + totalVariableCosts;
    const profit = currentRevenue - totalCosts;
    // DRE Cascade:
    // 1. Receita Líquida = Receita Bruta - Impostos - Taxas de Venda (cartão + marketplace)
    const taxesAndFees = taxCostSimples + cardFeeCost + marketplaceCommissionCost;
    const receitaLiquida = currentRevenue - taxesAndFees;
    // 2. Margem de Contribuição = Receita Líquida - CMV
    const contributionMargin = receitaLiquida - cmvCost;
    // 3. Lucro Líquido = MC - Custos Fixos
    // (profit = currentRevenue - totalCosts, which is equivalent)
    const marginPercentage = currentRevenue > 0 ? (profit / currentRevenue) * 100 : 0;
    const contributionMarginPercentageDisplay = currentRevenue > 0 ? (contributionMargin / currentRevenue) * 100 : 0;
    
    // Marketplace percentages for "Dinheiro na Mesa"
    const marketplaceSalesData = [];
    if (formData.fees_marketplaces && Array.isArray(formData.fees_marketplaces)) {
        formData.fees_marketplaces.forEach(m => {
            const salesPct = parseFloat(String(m.sales_percentage || '0').replace(',', '.').replace('%', '')) || 0;
            if (salesPct > 0) {
                const name = m.provider === 'Outro' ? (m.custom_provider || 'Outro') : m.provider;
                marketplaceSalesData.push({ name, salesPct });
            }
        });
    }
    // Legacy fallback
    if (formData.ifood_sales_percentage && marketplaceSalesData.length === 0) {
        const pct = parseFloat(String(formData.ifood_sales_percentage).replace(',', '.').replace('%', '')) || 0;
        if (pct > 0) marketplaceSalesData.push({ name: 'iFood', salesPct: pct });
    }

    // Fixed Cost % over revenue
    const fixedCostPercentage = currentRevenue > 0 ? (totalFixedCosts / currentRevenue) * 100 : 0;
    const fixedCostPercentageCompleto = currentRevenue > 0 ? (totalFixedCostsCompleto / currentRevenue) * 100 : 0;
    // cmvPercentageDisplay / cmvEffective / cmvEffectiveFraction /
    // hasCmvDataEffective são calculados mais acima (logo após o bloco de
    // CMV do menuEngineering) — precisam estar prontos antes do custo variável.

    // BASE = %CF + %Impostos + %Cartão/Voucher (+ Royalties if franchise)
    // Marketplace commissions weighted by sales_percentage
    let marketplaceFeePct = 0;
    if (formData.fees_marketplaces && Array.isArray(formData.fees_marketplaces)) {
        formData.fees_marketplaces.forEach(m => {
            const commission = parseFloat(String(m.commission || '0').replace(',', '.').replace('%', '')) || 0;
            const salesPct = parseFloat(String(m.sales_percentage || '0').replace(',', '.').replace('%', '')) || 0;
            marketplaceFeePct += (commission * salesPct) / 100;
        });
    }
    // BASE = Custos Fixos + Impostos + Taxas de Cartão (marketplace NÃO entra na base)
    // Por padrão NÃO inclui provisionamento (só salário + FGTS — caixa real mensal)
    const basePercentage = fixedCostPercentage + (percentTaxSimples * 100) + (cardFeePercentage * 100);
    // Versão "com provisionamento" pra quando o usuário ativar o toggle no BaseModal
    const basePercentageCompleto = fixedCostPercentageCompleto + (percentTaxSimples * 100) + (cardFeePercentage * 100);

    // "Dinheiro na Mesa" calculation:
    // Sum excess % above thresholds: iFood>23%, CF>33%, CMV>30%
    let moneyOnTableTotal = 0;
    const moneyOnTableItems = [];

    // Marketplace "Dinheiro na Mesa" = comissão paga (faturamento × %vendido × taxa)
    let mpCommissionTotal = 0;
    let mpWeightedPct = 0; // ponderado para label
    let mpTotalSalesPct = 0;
    if (formData.fees_marketplaces && Array.isArray(formData.fees_marketplaces)) {
        formData.fees_marketplaces.forEach(m => {
            const salesPct = parseFloat(String(m.sales_percentage || '0').replace(',', '.').replace('%', '')) || 0;
            const commission = parseFloat(String(m.commission || '0').replace(',', '.').replace('%', '')) || 0;
            if (salesPct > 0 && commission > 0 && currentRevenue > 0) {
                const commissionValue = currentRevenue * (salesPct / 100) * (commission / 100);
                mpCommissionTotal += commissionValue;
                mpWeightedPct += commission * salesPct; // para média ponderada
                mpTotalSalesPct += salesPct;
            }
        });
    }
    const mpAvgCommission = mpTotalSalesPct > 0 ? (mpWeightedPct / mpTotalSalesPct) : 0;
    // mot_actions: previously acknowledged excess values { [key]: { rawValue, date } }
    const motActions = formData.mot_actions || {};

    // ─── Dinheiro na Mesa — "recuperado" DINÂMICO (mês a mês) ────────────────
    // Causa-raiz do bug "valor recuperado estático": o `calcRecovered` antigo
    // comparava o excesso atual SÓ contra `mot_actions[key].rawValue` — um
    // snapshot gravado UMA única vez, quando o usuário clicava em "Tratar".
    // Sem clique não havia baseline; e mesmo com clique o baseline nunca
    // acompanhava a virada do mês. Resultado: o "R$ X recuperado este mês"
    // mostrava sempre o mesmo número (confirmado no cliente Pizzaiolo).
    //
    // Correção: o "recuperado" passa a refletir a MELHORA REAL entre o mês
    // ANTERIOR e o mês corrente. Guardamos um snapshot mensal dos quatro
    // drivers do Dinheiro na Mesa em `formData.metric_snapshots`, indexado por
    // "YYYY-MM" (fuso America/Sao_Paulo). O baseline é o snapshot do mês
    // anterior; se ele não existir ainda (primeiro mês monitorado), caímos no
    // `mot_actions` como fallback. Assim:
    //   - CMV Teórico cai (alteração no histórico de preço da ficha) → recupera
    //   - %CF cai (vs. último mês) → recupera
    //   - taxa de cartão cai (vs. últimos 30 dias / mês anterior) → recupera
    //   - data do P/E adianta → menos excesso → recupera
    // tudo recalculado a cada mês, sem engessar.
    const motSpNow = getSaoPauloNow();
    const currentMonthSnapKey = `${motSpNow.year}-${String(motSpNow.month).padStart(2, '0')}`;
    // Mês anterior (fuso Brasil) — baseline de comparação.
    const prevMonthDate = motSpNow.month === 1
        ? { year: motSpNow.year - 1, month: 12 }
        : { year: motSpNow.year, month: motSpNow.month - 1 };
    const prevMonthSnapKey = `${prevMonthDate.year}-${String(prevMonthDate.month).padStart(2, '0')}`;
    const metricSnapshots = formData.metric_snapshots || {};
    const prevSnapshot = metricSnapshots[prevMonthSnapKey] || null;
    // Acumula os excessos do mês corrente para gravar o snapshot ao final.
    const currentMonthExcess = {};

    const calcRecovered = (key, currentExcess) => {
        currentMonthExcess[key] = currentExcess;
        // 1) Baseline preferencial: snapshot do mês ANTERIOR (comparação dinâmica).
        if (prevSnapshot && typeof prevSnapshot[key] === 'number') {
            const baseline = prevSnapshot[key];
            return baseline > currentExcess ? baseline - currentExcess : 0;
        }
        // 2) Fallback (sem histórico mensal ainda): acknowledgement manual via "Tratar".
        const stored = motActions[key];
        if (!stored || stored.rawValue <= currentExcess) return 0;
        return stored.rawValue - currentExcess;
    };

    if (mpCommissionTotal > 0) {
        moneyOnTableTotal += mpCommissionTotal;
        const mpPctOfRevenue = currentRevenue > 0 ? (mpCommissionTotal / currentRevenue) * 100 : 0;
        moneyOnTableItems.push({
            key: 'marketplace',
            label: `Marketplaces (${mpTotalSalesPct.toFixed(0)}%)`,
            value: formatMoney(mpCommissionTotal),
            rawValue: mpCommissionTotal,
            pct: `taxa ${mpAvgCommission.toFixed(1)}%`,
            color: '#FF4560',
            pctOfRevenue: mpPctOfRevenue,
            recovered: calcRecovered('marketplace', mpCommissionTotal)
        });
    }

    // BAH-030: Antecipações de recebíveis — total perdido vai como item no MoneyOnTable
    // Dado vem do servidor em _bpo.advancesTotal (agregado de ReceivableAdvance ativos)
    const bpoAdvancesTotal = parseFloat(dashboardData?._bpo?.advancesTotal) || 0;
    if (bpoAdvancesTotal > 0) {
        moneyOnTableTotal += bpoAdvancesTotal;
        const advancesPctOfRevenue = currentRevenue > 0 ? (bpoAdvancesTotal / currentRevenue) * 100 : 0;
        moneyOnTableItems.push({
            key: 'advances',
            label: 'Antecipação Recebíveis',
            value: formatMoney(bpoAdvancesTotal),
            rawValue: bpoAdvancesTotal,
            pct: `${advancesPctOfRevenue.toFixed(1)}% receita`,
            color: '#FF8A9C',
            pctOfRevenue: advancesPctOfRevenue,
            recovered: calcRecovered('advances', bpoAdvancesTotal)
        });
    }

    // BAH-031: Parcelas de empréstimos ativos — comprometimento mensal de caixa
    const bpoLoansMonthly = parseFloat(dashboardData?._bpo?.loansMonthly) || 0;
    if (bpoLoansMonthly > 0) {
        moneyOnTableTotal += bpoLoansMonthly;
        const loansPctOfRevenue = currentRevenue > 0 ? (bpoLoansMonthly / currentRevenue) * 100 : 0;
        moneyOnTableItems.push({
            key: 'loans',
            label: 'Parcelas Financiamento',
            value: formatMoney(bpoLoansMonthly),
            rawValue: bpoLoansMonthly,
            pct: `${loansPctOfRevenue.toFixed(1)}% receita`,
            color: '#A78BFA',
            pctOfRevenue: loansPctOfRevenue,
            recovered: calcRecovered('loans', bpoLoansMonthly)
        });
    }
    if (fixedCostPercentage > 33 && currentRevenue > 0) {
        const excess = ((fixedCostPercentage - 33) / 100) * currentRevenue;
        moneyOnTableTotal += excess;
        moneyOnTableItems.push({ key: 'fixedCosts', label: `Custo Fixo (${fixedCostPercentage.toFixed(0)}%)`, value: formatMoney(excess), rawValue: excess, pct: `${(fixedCostPercentage - 33).toFixed(1)}% acima`, color: '#FF9406', pctOfRevenue: fixedCostPercentage, recovered: calcRecovered('fixedCosts', excess) });
    }
    if (cmvEffective > 30 && currentRevenue > 0) {
        const excess = ((cmvEffective - 30) / 100) * currentRevenue;
        moneyOnTableTotal += excess;
        moneyOnTableItems.push({ key: 'cmv', label: `CMV (${cmvEffective.toFixed(0)}%)`, value: formatMoney(excess), rawValue: excess, pct: `${(cmvEffective - 30).toFixed(1)}% acima`, color: '#FDD789', pctOfRevenue: cmvEffective, recovered: calcRecovered('cmv', excess) });
    }
    if (cardFeeExcessCost > 0 && currentRevenue > 0) {
        moneyOnTableTotal += cardFeeExcessCost;
        const currentCardPct = (cardFeePercentage * 100).toFixed(1);
        moneyOnTableItems.push({ key: 'cardFee', label: `Taxa Cartão (${currentCardPct}%)`, value: formatMoney(cardFeeExcessCost), rawValue: cardFeeExcessCost, pct: `${((cardFeePercentage * 100) - 2.0).toFixed(1)}% acima`, color: '#A78BFA', pctOfRevenue: cardFeePercentage * 100, recovered: calcRecovered('cardFee', cardFeeExcessCost) });
    }

    // Items that were previously above threshold but are now resolved (threshold crossed in right direction)
    // BAH — "recuperado" dinâmico: um driver que estava com excesso no mês
    // ANTERIOR e zerou no mês corrente (não aparece mais em moneyOnTableItems)
    // conta o excesso anterior INTEIRO como recuperado. Baseline = snapshot do
    // mês anterior; fallback = mot_actions (acknowledgement manual).
    const resolvedKeys = ['marketplace', 'fixedCosts', 'cmv', 'cardFee', 'advances', 'loans'];
    const activeKeys = new Set(moneyOnTableItems.map(i => i.key));
    let resolvedRecoveredTotal = 0;
    resolvedKeys.forEach(key => {
        if (activeKeys.has(key)) return;
        // Driver resolvido: registra excesso 0 no snapshot do mês corrente.
        currentMonthExcess[key] = 0;
        // Baseline preferencial: excesso do mês anterior.
        if (prevSnapshot && typeof prevSnapshot[key] === 'number' && prevSnapshot[key] > 0) {
            resolvedRecoveredTotal += prevSnapshot[key];
            return;
        }
        // Fallback: acknowledgement manual.
        const stored = motActions[key];
        if (stored && stored.rawValue > 0) {
            resolvedRecoveredTotal += stored.rawValue;
        }
    });

    const totalRecovered = moneyOnTableItems.reduce((s, i) => s + (i.recovered || 0), 0) + resolvedRecoveredTotal;

    // Persiste o snapshot do mês corrente (drivers do Dinheiro na Mesa) em
    // formData.metric_snapshots["YYYY-MM"]. Isto vira o baseline do mês seguinte
    // e mantém o "recuperado" dinâmico de mês para mês. Só grava se:
    //   - o usuário está vendo o MÊS CORRENTE (não um mês passado selecionado);
    //   - há faturamento corrente (evita snapshots vazios distorcendo a base);
    //   - algo mudou (evita POST sync desnecessário).
    if (currentRevenue > 0 && selectedMonthIndex === null) {
        const existingSnap = metricSnapshots[currentMonthSnapKey] || {};
        const snapChanged = resolvedKeys.some(k => {
            const v = currentMonthExcess[k] || 0;
            return (existingSnap[k] || 0) !== v;
        });
        if (snapChanged) {
            const nextSnapshot = { ...existingSnap };
            resolvedKeys.forEach(k => { nextSnapshot[k] = currentMonthExcess[k] || 0; });
            formData.metric_snapshots = { ...metricSnapshots, [currentMonthSnapKey]: nextSnapshot };
        }
    }

    // Break Even Point (Ponto de Equilíbrio)
    // BEP = Fixed Costs / Marge Contribution Percentage
    const contributionMarginPercentage = currentRevenue > 0 ? (contributionMargin / currentRevenue) : 0;
    const breakEvenValue = contributionMarginPercentage > 0 ? totalFixedCosts / contributionMarginPercentage : 0;
    // 3. CONSTRUCT DASHBOARD OBJECT
    const newDashboardData = {
        ...initialData,
        formData: formData, // Persist raw form data for re-editing
        operational: dashboardData.operational || initialData.operational,
        menuEngineering: dashboardData.menuEngineering || [],
        period: {
            date: new Date().toLocaleDateString('pt-BR', { day: 'numeric', month: 'short', year: 'numeric' }),
            status: profit >= 0 ? "Lucrativo" : "Prejuízo",
            statusColor: profit >= 0 ? "#E2FD89" : "#FF4560"
        },
        revenue: {
            total: formatMoney(currentRevenue),
            month: currentMonthStr || "Mês Atual",
            history: revenueHistory,
            timeline: revenueTimeline,
            annualTotal: formatMoney(totalAnnualRevenue),
            status: profit >= 0 ? "Positivo" : "Alerta",
            change: (() => {
                // Use selected month or find the most recent month with data
                const activeIdx = selectedMonthIndex !== null ? selectedMonthIndex : searchOrder.find(idx => revenueHistory[idx] > 0);
                if (activeIdx === undefined || revenueHistory[activeIdx] === 0) return "0%";
                // Find previous month with data (search backwards from active month)
                let prevIdx = null;
                for (let m = 1; m < 12; m++) {
                    const idx = (activeIdx - m + 12) % 12;
                    if (revenueHistory[idx] > 0) { prevIdx = idx; break; }
                }
                if (prevIdx === null || revenueHistory[prevIdx] === 0) return "0%";
                const change = ((revenueHistory[activeIdx] - revenueHistory[prevIdx]) / revenueHistory[prevIdx]) * 100;
                const sign = change >= 0 ? "+" : "";
                return `${sign}${change.toFixed(1)}%`;
            })(),
            risk: { label: "Estável", count: "-" },
            cards: [
                {
                    label: "Custos Fixos Totais",
                    value: `R$ ${formatMoney(totalFixedCosts)}`,
                    percentage: currentRevenue > 0 ? Math.round((totalFixedCosts / currentRevenue) * 100) + "%" : "0%",
                    status: "neutral",
                    icon: "wallet",
                    tooltip: "Custos que existem independente das vendas: pessoal, infraestrutura, admin, marketing, etc."
                },
                {
                    label: "Custos Variáveis Totais",
                    value: `R$ ${formatMoney(totalVariableCosts)}`,
                    percentage: currentRevenue > 0 ? `${((totalVariableCosts / currentRevenue) * 100).toFixed(1)}%` : "0%",
                    status: "neutral",
                    icon: "pie",
                    // BAH-089: o CMV usado aqui é TEÓRICO/estimado (derivado das
                    // fichas técnicas), não realizado. O tooltip declara isso
                    // explicitamente para o cliente não tomar a estimativa como
                    // venda realizada. `isEstimate` permite a UI marcar o card.
                    isEstimate: cmvIsEstimate,
                    tooltip: cmvIsEstimate
                        ? "Custos que sobem/descem com o faturamento. O CMV é uma ESTIMATIVA teórica a partir das fichas técnicas (médias cadastradas) — não é o CMV realizado do mês. Composição:"
                        : "Custos que sobem/descem com o faturamento. Composição:",
                    breakdown: [
                        { label: cmvIsEstimate ? "CMV (estimado)" : "CMV (insumos)", value: currentRevenue > 0 ? `${((cmvCost / currentRevenue) * 100).toFixed(1)}%` : "0%" },
                        { label: "Taxa de cartão", value: `${(cardFeePercentage * 100).toFixed(1)}%` },
                        { label: "Comissão marketplace", value: currentRevenue > 0 ? `${((marketplaceCommissionCost / currentRevenue) * 100).toFixed(1)}%` : "0%" },
                        { label: "Impostos (Simples)", value: `${(percentTaxSimples * 100).toFixed(1)}%` },
                    ]
                }
            ]
        },
        breakEven: (() => {
            // BAH-090: usa o fuso America/Sao_Paulo para "agora", garantindo que o
            // ponto de equilíbrio e as barras de faturamento concordem sobre qual
            // é o mês corrente e o dia de hoje.
            const bepNow = getSaoPauloNow(); // { year, month (1-12), day }
            const nowMonthIdx = bepNow.month - 1;
            const activeMonthIdx = selectedMonthIndex !== null ? selectedMonthIndex : nowMonthIdx;
            // BAH-099: o mês ativo SER o mês corrente já basta — não exigir
            // selectedMonthIndex null. Antes, selecionar a barra do mês corrente
            // tornava isCurrentMonth=false e o contador caía no wrap-around
            // (mostrava o faturamento do mês ANTERIOR no P/E do mês novo).
            const isCurrentMonth = activeMonthIdx === nowMonthIdx;
            const daysInMonth = new Date(bepNow.year, activeMonthIdx + 1, 0).getDate();

            // BAH-099 — Ponto de Equilíbrio dinâmico (zera no virar do mês):
            //   `revenueForCalc` é o CONTADOR do "potinho" do dashboard. Para o mês
            //   corrente ele DEVE refletir APENAS o que foi faturado dentro do mês
            //   corrente (fuso Brasil). No dia 1, sem nenhum lançamento do mês, o
            //   contador vale 0 e o ponteiro do gráfico volta ao início.
            //
            //   Bug anterior: quando o mês corrente não tinha lançamento diário, o
            //   código fazia `dailyAvg = currentRevenue / daysInMonth` e
            //   `revenueForCalc = dailyAvg * today`. Como `currentRevenue` é
            //   resolvido por um searchOrder que faz wrap-around para meses
            //   anteriores, o "potinho" começava o mês já cheio com a proração do
            //   faturamento do mês ANTERIOR — ou seja, o P/E nunca zerava.
            //
            //   `dailyAvg` (projeção do dia estimado do P/E) continua podendo usar
            //   a média histórica como FORECAST — isso é só uma previsão de "quando
            //   você bate a meta", não infla o contador.
            let revenueForCalc; // contador do mês corrente — zera no dia 1
            let dailyAvg;       // média diária usada SÓ para projetar o dia do P/E
            let hasDailyData = false;
            let projectionFromHistory = false;

            if (isCurrentMonth) {
                // Mês corrente: o contador só conta faturamento DESTE mês.
                const dailyRevenue = formData.daily_revenue || {};
                const currentMonthPrefix = `${bepNow.year}-${String(bepNow.month).padStart(2, '0')}`;
                const currentMonthEntries = Object.entries(dailyRevenue)
                    .filter(([dateStr]) => dateStr.startsWith(currentMonthPrefix))
                    .map(([, amount]) => (typeof amount === 'number' ? amount : parseCurrency(amount)));
                hasDailyData = currentMonthEntries.length > 0;

                if (hasDailyData) {
                    // Faturamento real registrado no mês corrente.
                    revenueForCalc = currentMonthEntries.reduce((sum, v) => sum + v, 0);
                    // Projeção do dia do P/E: extrapola a média dos dias já lançados.
                    dailyAvg = revenueForCalc / currentMonthEntries.length;
                } else {
                    // Sem nenhum lançamento no mês corrente: o "potinho" está vazio.
                    // O contador zera (causa-raiz do BAH-099). A média histórica
                    // (`currentRevenue`, que pode vir de meses anteriores) serve
                    // apenas como FORECAST do dia estimado do P/E, nunca como saldo.
                    revenueForCalc = 0;
                    dailyAvg = currentRevenue > 0 ? currentRevenue / daysInMonth : 0;
                    projectionFromHistory = dailyAvg > 0;
                }
            } else {
                // Mês passado selecionado: usa o faturamento DAQUELE mês específico.
                // NÃO usar `currentRevenue` — ele faz wrap-around pro mês mais
                // recente com dado, o que faria o P/E de um mês sem faturamento
                // mostrar o saldo de outro mês.
                const selMonthRev = (revenueHistory[activeMonthIdx] > 0)
                    ? revenueHistory[activeMonthIdx] : 0;
                revenueForCalc = selMonthRev;
                dailyAvg = selMonthRev > 0 ? selMonthRev / daysInMonth : 0;
            }

            const rawEstimatedDay = dailyAvg > 0 ? Math.ceil(breakEvenValue / dailyAvg) : 0;
            const reachedBreakEven = rawEstimatedDay > 0 && rawEstimatedDay <= daysInMonth;
            let estimatedDay = rawEstimatedDay > daysInMonth ? daysInMonth : rawEstimatedDay;
            const exceedsMonth = rawEstimatedDay > daysInMonth;
            const monthNames = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];
            const estimatedDateStr = estimatedDay > 0 ? `${estimatedDay} ${monthNames[activeMonthIdx]}` : '--';

            // Format max label for gauge — meta is the break-even value
            const maxRaw = breakEvenValue > 0 ? breakEvenValue : Math.max(revenueForCalc, 1);
            const formatKLabel = (val) => {
                if (val >= 1000000) return `${(val / 1000000).toFixed(1)}M`;
                if (val >= 1000) return `${Math.round(val / 1000)}k`;
                return Math.round(val).toString();
            };

            return {
                // Gate do P/E: usa o flag EFETIVO (fichas OU vendas têm CMV).
                hasCmvData: hasCmvDataEffective,
                percentage: !hasCmvDataEffective ? 0 : (breakEvenValue === 0 && revenueForCalc > 0 ? 100 : (breakEvenValue > 0 ? Math.min(Math.round((revenueForCalc / breakEvenValue) * 100), 100) : 0)),
                current: hasCmvDataEffective ? formatMoney(breakEvenValue) : "0,00",
                revenueAccumulated: formatMoney(revenueForCalc),
                min: "0",
                max: formatMoney(maxRaw),
                minLabel: "0k",
                maxLabel: formatKLabel(maxRaw),
                estimatedDate: estimatedDateStr,
                estimatedDay: estimatedDay,
                reachedBreakEven: reachedBreakEven,
                exceedsMonth: exceedsMonth,
                daysInMonth: daysInMonth,
                hasDailyData: hasDailyData,
                // BAH-099: dia estimado é apenas FORECAST (média histórica), não há
                // faturamento real lançado no mês corrente — o contador está zerado.
                projectionFromHistory: projectionFromHistory,
                // BAH-099: mês de referência do contador (YYYY-MM, fuso Brasil).
                // O contador zera quando este valor muda no virar do mês.
                currentMonthRef: `${bepNow.year}-${String(bepNow.month).padStart(2, '0')}`,
                // BAH-089: a curva do P/E depende de um CMV ESTIMADO (fichas),
                // não realizado. `cmvIsEstimate` permite a UI sinalizar isso e
                // `cmvWasCapped` indica que o CMV foi limitado ao teto de
                // sanidade (cadastro provavelmente incoerente: preço < custo).
                cmvIsEstimate: cmvIsEstimate,
                cmvWasCapped: cmvWasCapped,
                base: {
                    value: basePercentage.toFixed(0),
                    valueRaw: basePercentage,
                    status: basePercentage > 60 ? "Crítico" : (basePercentage > 55 ? "Alerta" : (basePercentage >= 45 ? "Saudável" : "Baixo")),
                    range: "Saudável entre 45% e 55%",
                    breakdown: {
                        custosFixos: fixedCostPercentage.toFixed(1),
                        impostos: (percentTaxSimples * 100).toFixed(1),
                        taxasCartao: (cardFeePercentage * 100).toFixed(1),
                    },
                    // Versão "com provisionamento" — pra toggle no BaseModal
                    comProvisionamento: {
                        value: basePercentageCompleto.toFixed(0),
                        valueRaw: basePercentageCompleto,
                        status: basePercentageCompleto > 60 ? "Crítico" : (basePercentageCompleto > 55 ? "Alerta" : (basePercentageCompleto >= 45 ? "Saudável" : "Baixo")),
                        breakdown: {
                            custosFixos: fixedCostPercentageCompleto.toFixed(1),
                            impostos: (percentTaxSimples * 100).toFixed(1),
                            taxasCartao: (cardFeePercentage * 100).toFixed(1),
                        },
                    },
                    // Detalhes do provisionamento pro UI mostrar
                    provisionamento: {
                        valor: formatMoney(personnelProvisionamento),
                        valorRaw: personnelProvisionamento,
                        percentual: currentRevenue > 0 ? ((personnelProvisionamento / currentRevenue) * 100).toFixed(1) : "0",
                    },
                },
                taxPercent: ((percentTaxSimples + cardFeePercentage) * 100).toFixed(2),
                // Comissão média de marketplace (ponderada por % vendas) — usada no SimuladorPrecificacao
                marketplaceFeePct: marketplaceFeePct.toFixed(2),
                // Detalhamento de custo por funcionário (pra Tab "Funcionários" / FuncionariosCard)
                funcionarios: employeesWithProvision.map(emp => ({
                    ...emp,
                    baseFmt: formatMoney(emp.base),
                    efetivoMensalFmt: formatMoney(emp.efetivoMensal),
                    totalProvisionamentoFmt: formatMoney(emp.totalProvisionamento),
                    custoTotalFmt: formatMoney(emp.custoTotal),
                })),
            };
        })(),
        cardComparison: {
            hasData: cardComparisonItems.length > 0,
            idealDebit: IDEAL_DEBIT_RATE,
            idealCredit: IDEAL_CREDIT_RATE,
            currentAvgPct: (cardFeePercentage * 100).toFixed(2),
            excessCost: formatMoney(cardFeeExcessCost),
            hasExcess: cardFeeExcessCost > 0,
            items: cardComparisonItems,
        },
        cards: {
            moneyOnTable: {
                total: formatMoney(moneyOnTableTotal),
                items: moneyOnTableItems,
                hasData: currentRevenue > 0 && (marketplaceSalesData.length > 0 || fixedCostPercentage > 0 || hasCmvData),
                percentage: currentRevenue > 0 && moneyOnTableTotal > 0 ? `${((moneyOnTableTotal / currentRevenue) * 100).toFixed(1)}%` : "0%",
                recoveredTotal: formatMoney(totalRecovered),
                hasRecovered: totalRecovered > 0,
            },
            technicalSheets: (() => {
                // CMV Teórico médio: average of (custoTotal / precoVenda) across all fichas with price
                const allFichas = dashboardData.operational?.fichas || [];
                let cmvTeorico = hasCmvData ? `${cmvPercentageDisplay.toFixed(0)}%` : '0%';
                const fichasWithPrice = allFichas.filter(f => parseCurrency(f.precoVenda) > 0 && parseCurrency(f.custoTotal) > 0);
                if (fichasWithPrice.length > 0) {
                    const avgCmv = fichasWithPrice.reduce((sum, f) => sum + (parseCurrency(f.custoTotal) / parseCurrency(f.precoVenda)), 0) / fichasWithPrice.length;
                    cmvTeorico = `${(avgCmv * 100).toFixed(0)}%`;
                }

                // Fichas desatualizadas: not updated in 30+ days
                const thirtyDaysAgo = Date.now() - (30 * 24 * 60 * 60 * 1000);
                const outdated = allFichas.filter(f => f.lastUpdated && f.lastUpdated < thirtyDaysAgo).length;

                // Produtos sem ficha: menu engineering items without a matching ficha
                const menuItems = dashboardData.menuEngineering || [];
                const fichaNames = new Set(allFichas.map(f => f.name?.toLowerCase().trim()));
                const fichaIds = new Set(allFichas.map(f => `ft_${f.id}`));
                const withoutFicha = menuItems.filter(m => !fichaIds.has(m.id) && !fichaNames.has(m.name?.toLowerCase().trim())).length;

                return [
                    { label: 'CMV Teórico', value: cmvTeorico },
                    { label: 'Fichas Desatualizadas', value: String(outdated) },
                    { label: 'Produtos Sem Ficha', value: String(withoutFicha) },
                ];
            })(),
            costStructure: (() => {
                // Admin e Mkt: ALL admin_systems costs + ALL marketing_structure costs
                const adminMktTotal = 
                    parseCurrency(formData?.admin_systems?.software_pdv || 0) +
                    parseCurrency(formData?.admin_systems?.accountant || 0) +
                    parseCurrency(formData?.admin_systems?.card_machine_rent || 0) +
                    (formData?.identity?.is_mei === 'Sim' ? parseCurrency(formData?.admin_systems?.taxes_das || 0) : 0) +
                    parseCurrency(formData?.marketing_structure?.agency || 0) +
                    parseCurrency(formData?.marketing_structure?.ads_budget || 0) +
                    (parseCurrency(formData?.marketing_structure?.gifts_cost || 0) * (parseFloat(formData?.marketing_structure?.gifts_qty) || 0));

                // Infraestrutura = fixedCosts minus admin/mkt items that were already counted in fixedCosts
                const infraCosts = fixedCosts - 
                    parseCurrency(formData?.admin_systems?.software_pdv || 0) -
                    parseCurrency(formData?.admin_systems?.accountant || 0) -
                    parseCurrency(formData?.admin_systems?.card_machine_rent || 0) -
                    (formData?.identity?.is_mei === 'Sim' ? parseCurrency(formData?.admin_systems?.taxes_das || 0) : 0) -
                    parseCurrency(formData?.marketing_structure?.agency || 0) -
                    parseCurrency(formData?.marketing_structure?.ads_budget || 0) -
                    (parseCurrency(formData?.marketing_structure?.gifts_cost || 0) * (parseFloat(formData?.marketing_structure?.gifts_qty) || 0));

                // Fixed costs % — same revenue base as the main percentage
                const fixedCostPct = currentRevenue > 0 ? Math.round((totalFixedCosts / currentRevenue) * 100) + "%" : "0%";

                return {
                    total: formatMoney(totalCosts),
                    percentage: currentRevenue > 0 ? Math.round((totalCosts / currentRevenue) * 100) + "%" : "0%",
                    fixedCostPercentage: fixedCostPct,
                    breakdown: [
                        { label: 'Pessoal + Sócios', value: `R$ ${formatMoney(personnelCosts)}` },
                        { label: 'Infraestrutura', value: `R$ ${formatMoney(Math.max(0, infraCosts))}` },
                        { label: 'CMV Teórico', value: `R$ ${formatMoney(cmvCost)}` },
                        { label: 'Admin e Mkt', value: `R$ ${formatMoney(adminMktTotal)}` },
                    ],
                    reserves: {
                        employees: formatMoney(employeeReserves),
                        depreciation: formatMoney(depreciationTotal),
                        total: formatMoney(employeeReserves + depreciationTotal),
                        hasData: employeeReserves > 0 || depreciationTotal > 0,
                    }
                };
            })(),
        },
        restaurant: {
            name: formData?.identity?.restaurant_name || "Seu Restaurante",
            logo: formData?.identity?.business_logo || null,
            category: formData?.identity?.cuisine_type || "Gastronomia"
        },
        user: {
            name: formData?.user_info?.user_name || "Usuário",
            photo: formData?.user_info?.user_photo || null,
            role: "Proprietário da Conta",
            initials: (formData?.user_info?.user_name || "U").substring(0, 2).toUpperCase(),
            isOwner: true
        },
        overview: {
            title: formData?.identity?.restaurant_name || "Seu Restaurante",
            subtitle: "Dados baseados no seu preenchimento de onboarding.",
            tags: [
                { label: `Rec. Líquida: R$ ${formatMoney(receitaLiquida)}`, active: false },
                { label: `MC: ${contributionMarginPercentageDisplay.toFixed(0)}%`, active: false },
            ]
        },
        // DRE data for detailed view
        dre: {
            hasData: currentRevenue > 0,
            receitaBruta: formatMoney(currentRevenue),
            receitaBrutaRaw: currentRevenue,
            impostos: formatMoney(taxCostSimples),
            impostoPct: currentRevenue > 0 ? ((taxCostSimples / currentRevenue) * 100).toFixed(1) : '0.0',
            taxasVenda: formatMoney(cardFeeCost + marketplaceCommissionCost),
            taxasVendaPct: currentRevenue > 0 ? (((cardFeeCost + marketplaceCommissionCost) / currentRevenue) * 100).toFixed(1) : '0.0',
            receitaLiquida: formatMoney(receitaLiquida),
            receitaLiquidaPct: currentRevenue > 0 ? ((receitaLiquida / currentRevenue) * 100).toFixed(1) : '0.0',
            cmv: formatMoney(cmvCost),
            cmvPct: currentRevenue > 0 ? ((cmvCost / currentRevenue) * 100).toFixed(1) : '0.0',
            margemContribuicao: formatMoney(contributionMargin),
            margemContribuicaoPct: contributionMarginPercentageDisplay.toFixed(1),
            custosFixos: formatMoney(totalFixedCosts),
            custosFixosPct: currentRevenue > 0 ? ((totalFixedCosts / currentRevenue) * 100).toFixed(1) : '0.0',
            lucroLiquido: formatMoney(profit),
            lucroLiquidoPct: marginPercentage.toFixed(1),
            isProfit: profit >= 0
        },
        // Keep static Tips & Comparison for now
        marketComparison: initialData.marketComparison,
        tips: initialData.tips
    };

    // Preserve server-injected fields that don't go to DB
    setDashboardData(prev => {
      newDashboardData._clientEmail = prev._clientEmail;
      newDashboardData._hasCredentials = prev._hasCredentials;
      newDashboardData._profile = prev._profile;
      // Preserve profile photo/name saved via profile endpoint (not in formData)
      if (!newDashboardData.user.photo && prev.user?.photo) {
        newDashboardData.user.photo = prev.user.photo;
      }
      if (prev.user?.name && prev.user.name !== 'Usuário' && !formData?.user_info?.user_name) {
        newDashboardData.user.name = prev.user.name;
        newDashboardData.user.initials = prev.user.initials || prev.user.name.substring(0, 2).toUpperCase();
      }
      return newDashboardData;
    });

    // Persist full Update to Backend (skip for view-only changes like month selection)
    // Debounced + abortable pra evitar race condition (perda de dados)
    if (!skipSync) {
        const params = new URLSearchParams(window.location.search);
        const hash = params.get('hash');
        if (hash) syncSchedulerRef.current.schedule(hash, newDashboardData);
    }
  };

  // After operational/menuEngineering direct updates, recalculate financial metrics.
  // Dep array trigga só quando operational/menuEngineering mudam — antes rodava em
  // TODA render, dobrando POST sync e setState por edição.
  useEffect(() => {
    if (recalcPendingRef.current && dashboardData.formData && Object.keys(dashboardData.formData).length > 0) {
      recalcPendingRef.current = false;
      updateDashboardData(dashboardData.formData);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dashboardData.operational, dashboardData.menuEngineering, dashboardData.tips]);

  // Recalculate when selected month changes (view-only, no sync)
  useEffect(() => {
    if (dashboardData.formData && Object.keys(dashboardData.formData).length > 0) {
      updateDashboardData(dashboardData.formData, { skipSync: true });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedMonthIndex]);

  return (
    <DashboardContext.Provider value={{ dashboardData, updateDashboardData, clientDataLoaded, clientDataError, selectedMonthIndex, setSelectedMonthIndex }}>
      {children}
    </DashboardContext.Provider>
  );
};
