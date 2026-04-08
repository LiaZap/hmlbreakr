/* eslint-disable react-refresh/only-export-components */
import React, { createContext, useState, useContext, useRef, useEffect } from 'react';

export const DashboardContext = createContext();

export const useDashboard = () => useContext(DashboardContext);

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

  // Load Client Data if Hash exists
  React.useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const hash = params.get('hash');

    if (hash) {
      // Fetch from Backend API
      fetch(`/api/client/${hash}`)
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
             // Persist to Backend
             const params = new URLSearchParams(window.location.search);
             const hash = params.get('hash');
             if (hash) {
                 fetch(`/api/client/${hash}/sync`, {
                     method: 'POST',
                     headers: { 'Content-Type': 'application/json' },
                     body: JSON.stringify(updated)
                 }).catch(e => console.error("Sync failed", e));
             }
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
    const currentMonthIndex = new Date().getMonth(); // 0 = Jan, 11 = Dec
    
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
    // Any month with daily entries uses the daily total (current month = partial, past months = final)
    const dailyRevenueData = formData.daily_revenue || {};
    const nowForRevenue = new Date();
    const currentMonthIdx = nowForRevenue.getMonth();
    const dailyByMonth = {};
    Object.entries(dailyRevenueData).forEach(([dateStr, v]) => {
        const parts = dateStr.split('-');
        if (parts.length < 2) return;
        const monthIdx = parseInt(parts[1], 10) - 1;
        if (monthIdx < 0 || monthIdx > 11) return;
        const amount = typeof v === 'number' ? v : parseCurrency(v);
        dailyByMonth[monthIdx] = (dailyByMonth[monthIdx] || 0) + amount;
    });
    // Apply daily totals to revenueHistory bars
    Object.entries(dailyByMonth).forEach(([idx, total]) => {
        if (total > 0) revenueHistory[parseInt(idx)] = total;
    });

    const totalAnnualRevenue = revenueHistory.reduce((acc, val) => acc + val, 0);

    // Build chronological timeline for chart display (preserves year info)
    const monthNamesShortPT = ['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez'];
    let revenueTimeline = [];
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
                // Apply daily overlay for this month (current year only)
                const isCurrentYearMonth = yyyy === nowForRevenue.getFullYear() && mm - 1 === currentMonthIdx;
                const finalVal = isCurrentYearMonth && dailyByMonth[mm - 1] > 0
                    ? dailyByMonth[mm - 1]
                    : val;
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
        const seen = new Set();
        revenueTimeline = parsed.filter(e => { if (seen.has(e.key)) return false; seen.add(e.key); return true; });
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
    const currentYear = new Date().getFullYear();
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
    sumComposite('operational_fixed', ['kitchen_gas', 'kitchen_oil']);

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
    let personnelCosts = 0;
    let employeeReserves = 0; // CLT provisions: 13°, férias, FGTS, multa, aviso prévio

    if (formData.partners && Array.isArray(formData.partners)) {
        formData.partners.forEach(p => {
             const pl = parseCurrency(p.pro_labore);
             personnelCosts += pl + (pl * 0.11);
        });
    }

    if (formData.employees && Array.isArray(formData.employees)) {
        formData.employees.forEach(e => {
             const base = parseCurrency(e.base_salary);
             const premio = parseCurrency(e.premio);
             if (e.regime === 'CLT') {
                 const fgts = base * 0.08;
                 const prov13 = base / 12;
                 const provFerias = (base * 1.3333) / 12;
                 const fgtsProv = (prov13 + provFerias) * 0.08;
                 const multa = (fgts + fgtsProv) * 0.50;
                 const aviso = base / 12;
                 const aviso13 = aviso / 12;
                 const avisoFerias = (aviso + aviso / 3) / 12;
                 const avisoFgts = (aviso13 + avisoFerias) * 0.08;
                 const reserves = fgts + prov13 + provFerias + fgtsProv + multa + aviso + aviso13 + avisoFerias + avisoFgts;
                 employeeReserves += reserves;
                 personnelCosts += base + reserves + premio;
             } else {
                 personnelCosts += base + premio;
             }
        });
    }
    
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

    // CMV Teórico: only from fichas técnicas (menuEngineering data)
    // If no fichas exist, CMV = 0 (not 35% default)
    let cmvPercentage = 0;
    let hasCmvData = false;
    
    if (dashboardData.menuEngineering && dashboardData.menuEngineering.length > 0) {
        let totalSalesRevenue = 0;
        let totalSalesCost = 0;
        dashboardData.menuEngineering.forEach(item => {
            const sales = parseFloat(String(item.sales).replace(',', '.')) || 0;
            const price = parseCurrency(item.price);
            const cost = parseCurrency(item.cost);
            totalSalesRevenue += sales * price;
            totalSalesCost += sales * cost;
        });
        if (totalSalesRevenue > 0) {
            cmvPercentage = totalSalesCost / totalSalesRevenue;
            hasCmvData = true;
        }
    }

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
    const cmvCost = currentRevenue * cmvPercentage;
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
    const cmvPercentageDisplay = cmvPercentage * 100;

    // CMV effective: mirrors exactly what cmvTeorico panel shows
    // 1. If fichas have precoVenda → use fichas avg (same as panel)
    // 2. Else if menuEngineering has sales data → use cmvPercentageDisplay (same as panel fallback)
    // 3. Else → 0
    const allFichasForCmv = dashboardData.operational?.fichas || [];
    const fichasComPreco = allFichasForCmv.filter(f => parseCurrency(f.precoVenda) > 0 && parseCurrency(f.custoTotal) > 0);
    const cmvFromFichas = fichasComPreco.length > 0
      ? (fichasComPreco.reduce((sum, f) => sum + (parseCurrency(f.custoTotal) / parseCurrency(f.precoVenda)), 0) / fichasComPreco.length) * 100
      : 0;
    // Mirror cmvTeorico: fichas take priority, then menuEngineering, then 0
    const cmvEffective = fichasComPreco.length > 0 ? cmvFromFichas : (hasCmvData ? cmvPercentageDisplay : 0);

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
    const basePercentage = fixedCostPercentage + (percentTaxSimples * 100) + (cardFeePercentage * 100) + marketplaceFeePct;

    // "Dinheiro na Mesa" calculation:
    // Sum excess % above thresholds: iFood>23%, CF>33%, CMV>30%
    let moneyOnTableTotal = 0;
    const moneyOnTableItems = [];

    // Combine all marketplaces into one item using average percentage
    let mpExcessTotal = 0;
    const mpAboveThreshold = [];
    marketplaceSalesData.forEach(mp => {
        if (mp.salesPct > 23 && currentRevenue > 0) {
            const excess = ((mp.salesPct - 23) / 100) * currentRevenue;
            mpExcessTotal += excess;
            mpAboveThreshold.push(mp);
        }
    });
    // mot_actions: previously acknowledged excess values { [key]: { rawValue, date } }
    const motActions = formData.mot_actions || {};

    const calcRecovered = (key, currentExcess) => {
        const stored = motActions[key];
        if (!stored || stored.rawValue <= currentExcess) return 0;
        return stored.rawValue - currentExcess;
    };

    if (mpAboveThreshold.length > 0) {
        moneyOnTableTotal += mpExcessTotal;
        const avgPct = mpAboveThreshold.reduce((s, m) => s + m.salesPct, 0) / mpAboveThreshold.length;
        moneyOnTableItems.push({ key: 'marketplace', label: `Marketplaces (${avgPct.toFixed(0)}%)`, value: formatMoney(mpExcessTotal), rawValue: mpExcessTotal, pct: `${(avgPct - 23).toFixed(1)}% acima`, color: '#FF4560', pctOfRevenue: avgPct, recovered: calcRecovered('marketplace', mpExcessTotal) });
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
    const resolvedKeys = ['marketplace', 'fixedCosts', 'cmv', 'cardFee'];
    const activeKeys = new Set(moneyOnTableItems.map(i => i.key));
    let resolvedRecoveredTotal = 0;
    resolvedKeys.forEach(key => {
        const stored = motActions[key];
        if (stored && stored.rawValue > 0 && !activeKeys.has(key)) {
            resolvedRecoveredTotal += stored.rawValue;
        }
    });

    const totalRecovered = moneyOnTableItems.reduce((s, i) => s + (i.recovered || 0), 0) + resolvedRecoveredTotal;

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
                    icon: "wallet"
                },
                {
                    label: "Custos Variáveis Estimados",
                    value: `R$ ${formatMoney(totalVariableCosts)}`,
                    percentage: currentRevenue > 0 ? `${((totalVariableCosts / currentRevenue) * 100).toFixed(1)}%` : "0%",
                    status: "neutral",
                    icon: "pie"
                }
            ]
        },
        breakEven: (() => {
            const now = new Date();
            const activeMonthIdx = selectedMonthIndex !== null ? selectedMonthIndex : now.getMonth();
            const isCurrentMonth = activeMonthIdx === now.getMonth() && selectedMonthIndex === null;
            const daysInMonth = new Date(now.getFullYear(), activeMonthIdx + 1, 0).getDate();

            let revenueForCalc, dailyAvg;
            let hasDailyData = false;

            if (isCurrentMonth) {
                // Current month: use daily entries if available, else prorate
                const dailyRevenue = formData.daily_revenue || {};
                const currentMonthPrefix = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
                const currentMonthEntries = Object.entries(dailyRevenue)
                    .filter(([dateStr]) => dateStr.startsWith(currentMonthPrefix))
                    .map(([, amount]) => (typeof amount === 'number' ? amount : parseCurrency(amount)));
                hasDailyData = currentMonthEntries.length > 0;

                const today = now.getDate();
                if (hasDailyData) {
                    revenueForCalc = currentMonthEntries.reduce((sum, v) => sum + v, 0);
                    dailyAvg = revenueForCalc / currentMonthEntries.length;
                } else {
                    dailyAvg = currentRevenue > 0 ? currentRevenue / daysInMonth : 0;
                    revenueForCalc = dailyAvg * today;
                }
            } else {
                // Selected/past month: use the full month revenue
                revenueForCalc = currentRevenue;
                dailyAvg = currentRevenue > 0 ? currentRevenue / daysInMonth : 0;
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
                hasCmvData: hasCmvData,
                percentage: !hasCmvData ? 0 : (breakEvenValue === 0 && revenueForCalc > 0 ? 100 : (breakEvenValue > 0 ? Math.min(Math.round((revenueForCalc / breakEvenValue) * 100), 100) : 0)),
                current: hasCmvData ? formatMoney(breakEvenValue) : "0,00",
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
                base: {
                    value: basePercentage.toFixed(0),
                    valueRaw: basePercentage,
                    status: basePercentage > 60 ? "Crítico" : (basePercentage > 55 ? "Alerta" : (basePercentage >= 45 ? "Saudável" : "Baixo")),
                    range: "Saudável entre 45% e 55%",
                    breakdown: {
                        custosFixos: fixedCostPercentage.toFixed(1),
                        impostos: (percentTaxSimples * 100).toFixed(1),
                        taxasCartao: (cardFeePercentage * 100).toFixed(1),
                        marketplace: marketplaceFeePct.toFixed(1),
                    }
                },
                taxPercent: ((percentTaxSimples + cardFeePercentage) * 100).toFixed(2)
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

                // Fixed costs % over average annual revenue
                const activeMonthsCount = revenueHistory.filter(v => v > 0).length;
                const avgMonthlyRev = activeMonthsCount > 0 ? totalAnnualRevenue / activeMonthsCount : 0;
                const fixedCostPctAnnual = avgMonthlyRev > 0 ? Math.round((totalFixedCosts / avgMonthlyRev) * 100) + "%" : "0%";

                return {
                    total: formatMoney(totalCosts),
                    percentage: currentRevenue > 0 ? Math.round((totalCosts / currentRevenue) * 100) + "%" : "0%",
                    fixedCostPercentage: fixedCostPctAnnual,
                    breakdown: [
                        { label: 'Pessoal + Sócios', value: `R$ ${formatMoney(personnelCosts)}` },
                        { label: 'Infraestrutura', value: `R$ ${formatMoney(Math.max(0, infraCosts))}` },
                        { label: 'CMV Estimado', value: `R$ ${formatMoney(cmvCost)}` },
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
    if (!skipSync) {
        const params = new URLSearchParams(window.location.search);
        const hash = params.get('hash');
        if (hash) {
            fetch(`/api/client/${hash}/sync`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(newDashboardData)
            }).catch(e => console.error("Sync failed", e));
        }
    }
  };

  // After operational/menuEngineering direct updates, recalculate financial metrics
  useEffect(() => {
    if (recalcPendingRef.current && dashboardData.formData && Object.keys(dashboardData.formData).length > 0) {
      recalcPendingRef.current = false;
      updateDashboardData(dashboardData.formData);
    }
  });

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
