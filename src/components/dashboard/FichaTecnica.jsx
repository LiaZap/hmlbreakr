/* eslint-disable react-refresh/only-export-components, no-unused-vars */
import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

// ============ DATA ============
export const parseSafeNumber = (val) => {
    if (typeof val === 'number') return val;
    if (!val && val !== 0) return 0;
    let str = String(val).replace(/R\$/g, '').trim();
    if (str.includes(',') && str.includes('.')) str = str.replace(/\./g, '').replace(',', '.');
    else if (str.includes(',')) str = str.replace(',', '.');
    return parseFloat(str) || 0;
};
// Unit conversion: converts a quantity from one unit to another
// e.g., 100gr → 0.1kg, 500ml → 0.5lt
const convertUnit = (qty, fromUnit, toUnit) => {
  if (fromUnit === toUnit) return qty;
  const norm = (u) => (u || '').toLowerCase().replace(/[^a-z]/g, '');
  const from = norm(fromUnit);
  const to = norm(toUnit);
  if (from === to) return qty;
  // gr <-> kg
  if (from === 'gr' && to === 'kg') return qty / 1000;
  if (from === 'kg' && to === 'gr') return qty * 1000;
  // ml <-> lt
  if (from === 'ml' && to === 'lt') return qty / 1000;
  if (from === 'lt' && to === 'ml') return qty * 1000;
  // Same family fallback
  return qty;
};

// Constants moved to DashboardContext


// ============ CARD: Ficha Técnica ============
const FichaTecnicaCard = ({ item, onClick, onDuplicate, onDelete, basePercent, taxPercent }) => {
  const pv = parseSafeNumber(item.precoVenda);
  const cmv = parseSafeNumber(item.custoTotal);
  const baseRaw = parseSafeNumber(basePercent);
  const hasValidBase = baseRaw > 0 && baseRaw <= 100;
  const base = hasValidBase ? baseRaw / 100 : 0;
  const taxRate = parseSafeNumber(taxPercent) / 100;
  const taxAmount = pv * taxRate;

  // If valid base, show Lucro Líquido (includes all costs); otherwise MC com impostos
  const displayPct = pv > 0 ? (hasValidBase
    ? (((pv - (pv * base)) - cmv) / pv) * 100
    : ((pv - cmv - taxAmount) / pv) * 100
  ) : null;
  const displayRS = pv > 0 ? (hasValidBase
    ? (pv - (pv * base)) - cmv
    : pv - cmv - taxAmount
  ) : null;
  const displayLabel = hasValidBase ? 'Lucro Líquido Estimado' : 'Margem de Contribuição';
  const [showTooltip, setShowTooltip] = useState(false);

  return (
  <div
    className="bg-[#1B1B1D] border border-[#2A2A2C] rounded-[16px] p-4 flex flex-col gap-3 cursor-pointer hover:border-[#F5A623]/40 hover:scale-[1.01] transition-all"
    onClick={onClick}
  >
    <div className="flex items-start justify-between">
      <div className="flex items-center gap-3">
        <div className="w-[36px] h-[36px] rounded-[10px] bg-[#252527] flex items-center justify-center">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
            <rect x="4" y="2" width="16" height="20" rx="2" stroke="#959387" strokeWidth="1.5"/>
            <path d="M8 6H16M8 10H12M8 14H16" stroke="#959387" strokeWidth="1.5" strokeLinecap="round"/>
          </svg>
        </div>
        <div className="min-w-0">
          <div className="flex items-center gap-1.5 flex-wrap">
            <div className="font-semibold text-[13px] text-white truncate max-w-[150px]">{item.name}</div>
            {item.isModular && (
              <span className="px-1.5 py-0.5 bg-[#F5A623]/15 text-[#F5A623] text-[8px] font-bold rounded uppercase tracking-wider whitespace-nowrap">Modular</span>
            )}
          </div>
          <div className="text-[10px] text-[#868686]">
            {item.isModular ? `${item.modules?.length || 0} módulos` : item.type}
          </div>
        </div>
      </div>
      {pv > 0 && displayPct !== null && (
        <div
          className="relative"
          onMouseEnter={() => setShowTooltip(true)}
          onMouseLeave={() => setShowTooltip(false)}
        >
          <div className={`text-[11px] font-semibold px-2.5 py-1 rounded-full ${
            displayPct > 0 ? 'bg-[#00B37E]/15 text-[#00B37E]' : 'bg-[#FF4560]/15 text-[#FF4560]'
          }`}>
            {displayPct.toFixed(1)}%
          </div>
          {showTooltip && (
            <div className="absolute right-0 top-full mt-1 bg-[#252527] border border-[#333] rounded-lg px-3 py-2 z-50 whitespace-nowrap shadow-lg">
              <div className="text-[10px] text-[#868686]">{displayLabel}</div>
              <div className={`text-[12px] font-bold ${displayRS > 0 ? 'text-[#00B37E]' : 'text-[#FF4560]'}`}>
                R$ {displayRS.toFixed(2).replace('.', ',')}
              </div>
              <div className="text-[9px] text-[#555] mt-0.5">{hasValidBase ? `Base: ${baseRaw.toFixed(0)}% | ` : (taxRate > 0 ? `Impostos+Taxas: ${(taxRate*100).toFixed(1)}% | ` : '')}CMV: R$ {cmv.toFixed(2).replace('.', ',')}</div>
            </div>
          )}
        </div>
      )}
    </div>
    <div className="flex items-center justify-between">
      <div className="flex items-center gap-2">
        <div className="w-[20px] h-[20px] rounded-full bg-[#252527] flex items-center justify-center">
          <svg width="10" height="10" viewBox="0 0 24 24" fill="none">
            <rect x="4" y="2" width="16" height="20" rx="2" stroke="#959387" strokeWidth="2"/>
          </svg>
        </div>
        <span className="text-[11px] text-[#868686]">
          {item.isModular
            ? `${(item.modules || []).reduce((s, m) => s + (m.options?.length || 0), 0)} opções`
            : `${item.insumos || (item.ingredients?.length || 0)} Insumos`}
        </span>
      </div>
      <div className="flex items-center gap-2">
        {onDelete && (
          <button
            onClick={(e) => { e.stopPropagation(); if (window.confirm(`Excluir "${item.name}"?`)) onDelete(item.id); }}
            className="flex items-center gap-1 text-[11px] text-[#868686] hover:text-[#FF4560] transition-colors"
            title="Excluir ficha"
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none">
              <path d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
            Excluir
          </button>
        )}
        {onDuplicate && (
          <button
            onClick={(e) => { e.stopPropagation(); onDuplicate(item); }}
            className="flex items-center gap-1 text-[11px] text-[#868686] hover:text-[#F5A623] transition-colors"
            title="Duplicar ficha"
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none">
              <rect x="9" y="9" width="13" height="13" rx="2" stroke="currentColor" strokeWidth="1.5"/>
              <path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1" stroke="currentColor" strokeWidth="1.5"/>
            </svg>
            Duplicar
          </button>
        )}
        <button
          onClick={(e) => { e.stopPropagation(); onClick && onClick(); }}
          className="flex items-center gap-1 text-[11px] text-white font-medium hover:text-[#F5A623] transition-colors"
        >
          Editar
          <svg width="10" height="10" viewBox="0 0 16 16" fill="none">
            <path d="M4 12L12 4M12 4H6M12 4V10" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        </button>
      </div>
    </div>
    <div className="w-full h-px bg-[#2A2A2C]" />
    <div className="flex flex-col gap-1.5">
      <div className="flex justify-between text-[11px]">
        <span className="text-[#868686]">Insumos</span>
        <span className="text-white">{item.custoInsumos}</span>
      </div>
      <div className="flex justify-between text-[11px]">
        <span className="text-[#868686]">Embalagem</span>
        <span className="text-white">{item.custoEmbalagem}</span>
      </div>
    </div>
    <div className="w-full h-px bg-[#2A2A2C]" />
    <div className="flex flex-col gap-1.5">
      <div className="flex justify-between text-[11px]">
        <span className="text-[#868686]">Rendimento</span>
        <span className="text-white">{item.rendimento}</span>
      </div>
      <div className="flex justify-between text-[11px]">
        <span className="text-[#868686]">Custo</span>
        <span className="text-white font-medium">{item.custoTotal}</span>
      </div>
      {pv > 0 && displayRS !== null && (
        <div className="flex justify-between text-[11px]">
          <span className="text-[#868686]">MC(%)</span>
          <span className={`font-medium ${displayRS >= 0 ? 'text-[#00B37E]' : 'text-[#FF4560]'}`}>
            {displayPct !== null ? `${displayPct.toFixed(1)}%` : ''} / R$ {displayRS.toFixed(2).replace('.', ',')}
          </span>
        </div>
      )}
    </div>
  </div>
  );
};

// ============ CARD: Insumo ============
const InsumoCard = ({ item, onClick, onDuplicate, onDelete }) => {
  const hasZeroCost = parseSafeNumber(item.price) === 0 && parseSafeNumber(item.custo) === 0;
  return (
  <div
    className={`bg-[#1B1B1D] border rounded-[16px] p-4 flex flex-col gap-3 cursor-pointer hover:scale-[1.01] transition-all ${hasZeroCost ? 'border-[#FF4560]/40 hover:border-[#FF4560]/70' : 'border-[#2A2A2C] hover:border-[#F5A623]/40'}`}
    onClick={onClick}
    title={hasZeroCost ? 'Atenção: este insumo está com custo zero. Clique para preencher.' : ''}
  >
    <div className="flex items-start justify-between">
      <div className="flex items-center gap-3">
        <div className="w-[36px] h-[36px] rounded-[10px] bg-[#252527] flex items-center justify-center">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
            <rect x="4" y="2" width="16" height="20" rx="2" stroke="#959387" strokeWidth="1.5"/>
            <path d="M8 6H16M8 10H12M8 14H16" stroke="#959387" strokeWidth="1.5" strokeLinecap="round"/>
          </svg>
        </div>
        <div className="min-w-0">
          <div className="font-semibold text-[13px] text-white break-words leading-tight">{item.name}</div>
          <div className="text-[10px] text-[#868686]">{item.category}</div>
        </div>
      </div>
      <div className="flex flex-col items-end gap-1 shrink-0">
        <div className="bg-[#2A2A2C] text-[#868686] text-[10px] font-medium px-2.5 py-1 rounded-full border border-[#3A3A3C]">
          {item.isPrepared ? 'Preparado' : 'Insumo'}
        </div>
        {hasZeroCost && (
          <div className="bg-[#FF4560]/10 text-[#FF4560] text-[9px] font-semibold px-2 py-0.5 rounded-full border border-[#FF4560]/30 flex items-center gap-1">
            <svg width="9" height="9" viewBox="0 0 24 24" fill="none"><path d="M12 9v4M12 17h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>
            Custo zero
          </div>
        )}
      </div>
    </div>
    <div className="w-full h-px bg-[#2A2A2C]" />
    <div className="flex flex-col gap-1.5">
      {item.isPrepared ? (
        // ─── Insumo Preparado: mostra rendimento da receita ───
        <>
          <div className="flex justify-between text-[11px]">
            <span className="text-[#868686]">Rendimento</span>
            <span className="text-white">{item.rendimentoPreparado || 0}{item.rendimentoUnit || 'gr'}</span>
          </div>
          <div className="flex justify-between text-[11px]">
            <span className="text-[#868686]">Custo por {item.unit || 'un'}</span>
            <span className="text-[#F5A623] font-semibold">{item.custo}</span>
          </div>
        </>
      ) : (
        // ─── Insumo Pronto: mostra última compra (opcional) + preço por unidade ───
        <>
          {item.purchaseQty && item.purchaseTotal && (
            <div className="flex justify-between text-[11px]">
              <span className="text-[#868686]">Comprou</span>
              <span className="text-white">{item.purchaseQty}{item.unit || ''} por R$ {item.purchaseTotal}</span>
            </div>
          )}
          <div className="flex justify-between text-[11px]">
            <span className="text-[#868686]">Preço por {item.unit || 'un'}</span>
            <span className="text-[#F5A623] font-semibold">{item.custo}</span>
          </div>
        </>
      )}
    </div>
    <div className="flex items-center justify-end gap-3">
      {onDelete && (
        <button
          onClick={(e) => { e.stopPropagation(); if (window.confirm(`Excluir "${item.name}"?`)) onDelete(item.id); }}
          className="flex items-center gap-1 text-[11px] text-[#868686] hover:text-[#FF4560] transition-colors"
          title="Excluir insumo"
        >
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none">
            <path d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
          Excluir
        </button>
      )}
      {onDuplicate && (
        <button
          onClick={(e) => { e.stopPropagation(); onDuplicate(item); }}
          className="flex items-center gap-1 text-[11px] text-[#868686] hover:text-[#F5A623] transition-colors"
          title="Duplicar insumo"
        >
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none">
            <rect x="9" y="9" width="13" height="13" rx="2" stroke="currentColor" strokeWidth="1.5"/>
            <path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1" stroke="currentColor" strokeWidth="1.5"/>
          </svg>
          Duplicar
        </button>
      )}
      <button
        onClick={(e) => { e.stopPropagation(); onClick && onClick(); }}
        className="flex items-center gap-1 text-[11px] text-white font-medium hover:text-[#F5A623] transition-colors"
      >
        Editar
        <svg width="10" height="10" viewBox="0 0 16 16" fill="none">
          <path d="M4 12L12 4M12 4H6M12 4V10" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
        </svg>
      </button>
    </div>
  </div>
  );
};

// ============ MODAL: Editar/Criar Insumo ============
const EditarInsumoModal = ({ insumo, onClose, onSave, onDelete }) => {
  const isEditing = !!insumo.id;
  const [nome, setNome] = useState(insumo.name || '');
  const [categoria, setCategoria] = useState(insumo.category || 'Proteínas');
  
  // Safe parsing for creation vs edit
  const safeRendimento = insumo.rendimento || '0gr';
  const qty = safeRendimento.replace(/[^0-9.,]/g, '');
  const unitMatch = safeRendimento.replace(/[0-9.,]/g, '') || 'gr';

  const [quantidade] = useState(insumo.qty || insumo.defaultQty || qty || '');
  const [unit, setUnit] = useState(insumo.unit || unitMatch || 'gr');

  const safeCusto = insumo.custo || '0,00';
  const [custo, setCusto] = useState(safeCusto.replace(/R\$\s?/g, '').trim());

  // Purchase info — quantidade comprada + valor pago total (para calcular preço por unidade base)
  // purchaseQty é a qtd comprada na unidade purchaseUnit; purchaseTotal é o valor pago pela embalagem inteira
  const [purchaseQty, setPurchaseQty] = useState(insumo.purchaseQty || '');
  const [purchaseUnit, setPurchaseUnit] = useState(insumo.purchaseUnit || insumo.unit || unitMatch || 'gr');
  const [purchaseTotal, setPurchaseTotal] = useState(insumo.purchaseTotal || '');

  // Prepared insumo state
  const [tipo, setTipo] = useState(insumo.isPrepared ? 'preparado' : 'pronto');
  const [rendimentoPreparado, setRendimentoPreparado] = useState(insumo.rendimentoPreparado || '');
  const [rendimentoUnit, setRendimentoUnit] = useState(insumo.rendimentoUnit || 'gr');
  const [subIngredients, setSubIngredients] = useState(insumo.subIngredients || []);
  const [subSearch, setSubSearch] = useState('');
  // Inline creation of new insumo when not found
  const [showInlineCreate, setShowInlineCreate] = useState(false);
  const [inlineInsumo, setInlineInsumo] = useState({ name: '', category: 'Proteínas', qty: '1', unit: 'un', price: '' });

  // Auto-format currency: user types "190" → "1,90", "3300" → "33,00"
  const handleCustoChange = (e) => {
    const raw = e.target.value.replace(/[^0-9]/g, ''); // strip non-digits
    if (!raw) { setCusto(''); return; }
    const cents = parseInt(raw, 10);
    const formatted = (cents / 100).toFixed(2).replace('.', ',');
    setCusto(formatted);
  };

  const handlePurchaseTotalChange = (e) => {
    const raw = e.target.value.replace(/[^0-9]/g, '');
    if (!raw) { setPurchaseTotal(''); return; }
    const formatted = (parseInt(raw, 10) / 100).toFixed(2).replace('.', ',');
    setPurchaseTotal(formatted);
  };

  // Auto-calcula preço por unidade base a partir de quantidade comprada + valor pago
  // Ex: comprou 900ml por R$15 → unidade base lt → calcula R$ 16,67/lt
  const calculatedPricePerUnit = (() => {
    const pQty = parseSafeNumber(purchaseQty);
    const pTotal = parseSafeNumber(purchaseTotal);
    if (!pQty || !pTotal) return null;
    // Convert purchaseQty to base unit
    const qtyInBaseUnit = convertUnit(pQty, purchaseUnit, unit);
    if (!qtyInBaseUnit || qtyInBaseUnit <= 0) return null;
    return pTotal / qtyInBaseUnit;
  })();

  // Sync custo field when auto-calc changes
  React.useEffect(() => {
    if (calculatedPricePerUnit !== null) {
      setCusto(calculatedPricePerUnit.toFixed(2).replace('.', ','));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [calculatedPricePerUnit]);

  // Purchase unit sempre acompanha a unidade base — APENAS ao criar novo
  // (não sobrescreve purchaseUnit de insumos antigos ao editar)
  React.useEffect(() => {
    if (!insumo.id) setPurchaseUnit(unit);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [unit]);

  const { dashboardData, updateDashboardData } = useDashboard();
  const categoryOptions = dashboardData.operational?.categories?.insumos || ['Proteínas', 'Grãos', 'Vinhos', 'Molhos', 'Legumes', 'Temperos', 'Óleos', 'Laticínios', 'Insumo Pronto Preparado', 'Outros'];
  // Todos os insumos EXCETO o próprio que está sendo editado (para permitir qualquer insumo como sub-ingrediente)
  const availableInsumos = (dashboardData.operational?.insumos || []).filter(i =>
    String(i.id) !== String(insumo.id)
  );


  // Create new insumo inline (from within prepared modal) — adds to global list + as sub-ingredient
  const handleCreateInlineInsumo = () => {
    if (!inlineInsumo.name.trim() || !inlineInsumo.price.trim()) {
      alert('Preencha o nome e o preço do insumo.');
      return;
    }
    const unitPrice = parseSafeNumber(inlineInsumo.price);
    const newId = `new_${Date.now()}`;
    const created = {
      id: newId,
      name: inlineInsumo.name.trim(),
      category: inlineInsumo.category,
      defaultQty: inlineInsumo.qty,
      qty: inlineInsumo.qty,
      netQty: inlineInsumo.qty,
      grossQty: inlineInsumo.qty,
      fc: '1.00',
      unit: inlineInsumo.unit,
      price: unitPrice.toFixed(2).replace('.', ','),
      rendimento: `${inlineInsumo.qty}${inlineInsumo.unit}`,
      custo: `R$ ${unitPrice.toFixed(2).replace('.', ',')}`,
      lastUpdated: Date.now(),
    };

    // Add to global insumos list
    const currentInsumos = dashboardData.operational?.insumos || [];
    updateDashboardData({
      ...dashboardData,
      operational: {
        ...dashboardData.operational,
        insumos: [created, ...currentInsumos]
      }
    });

    // Add as sub-ingredient
    const pUnit = created.unit;
    const defUnit = (pUnit === 'kg') ? 'gr' : (pUnit === 'lt') ? 'ml' : pUnit;
    const defQty = (pUnit === 'kg') ? '100' : (pUnit === 'lt') ? '100' : '1';
    setSubIngredients(prev => [...prev, {
      ...created,
      purchaseUnit: pUnit,
      originalUnit: pUnit,
      usageUnit: defUnit,
      qty: defQty,
    }]);

    // Reset inline form
    setInlineInsumo({ name: '', category: 'Proteínas', qty: '1', unit: 'un', price: '' });
    setShowInlineCreate(false);
    setSubSearch('');
  };

  // For prepared insumo: total cost = sum of sub-ingredient costs
  const calcSubIngredientCost = (sub) => {
    const pricePerUnit = parseSafeNumber(sub.price) || parseSafeNumber(sub.custo);
    const purchaseUnit = sub.purchaseUnit || sub.originalUnit || sub.unit || 'gr';
    const usageQty = parseSafeNumber(sub.qty);
    const usageUnit = sub.usageUnit || sub.unit || 'gr';
    const usageInPurchaseUnit = convertUnit(usageQty, usageUnit, purchaseUnit);
    return usageInPurchaseUnit * pricePerUnit;
  };
  const totalPreparedCost = subIngredients.reduce((sum, s) => sum + calcSubIngredientCost(s), 0);
  const rendQty = parseSafeNumber(rendimentoPreparado);
  const preparedPricePerUnit = rendQty > 0 ? totalPreparedCost / rendQty : 0;

  const handleSave = () => {
    if (!nome.trim()) {
      alert('Preencha o nome do insumo.');
      return;
    }

    if (tipo === 'preparado') {
      const rQty = parseSafeNumber(rendimentoPreparado);

      // Validação: rendimento obrigatório
      if (rQty <= 0) {
        alert('Preencha o rendimento da receita (deve ser maior que zero).\n\nEx: essa receita rende 500gr de molho.');
        return;
      }

      // Validação: pelo menos 1 sub-ingrediente
      if (subIngredients.length === 0) {
        alert('Adicione pelo menos um ingrediente para calcular o custo do preparado.');
        return;
      }

      // Prepared insumo: cost derived from sub-ingredients
      const totalCost = subIngredients.reduce((sum, s) => sum + calcSubIngredientCost(s), 0);
      const pricePerUnit = totalCost / rQty;

      onSave({
        ...insumo,
        id: insumo.id || Date.now().toString(),
        name: nome,
        category: categoria,
        qty: rendimentoPreparado,
        unit: rendimentoUnit,
        rendimento: `${rendimentoPreparado}${rendimentoUnit}`,
        // Preço com 4 decimais internos para preservar precisão em molhos/especiarias
        // (ex: R$ 3,50 / 500gr = R$ 0,007/gr → antes era arredondado pra 0,01 = erro de 43%)
        custo: `R$ ${pricePerUnit.toFixed(2).replace('.', ',')}`,  // exibição 2 decimais
        price: pricePerUnit.toFixed(4).replace('.', ','),  // cálculo 4 decimais
        defaultQty: rendimentoPreparado,
        grossQty: rendimentoPreparado,
        isPrepared: true,
        subIngredients: subIngredients,
        rendimentoPreparado: rendimentoPreparado,
        rendimentoUnit: rendimentoUnit,
        totalCost: totalCost,
        lastUpdated: Date.now(),
      });
    } else {
      onSave({
        ...insumo,
        id: insumo.id || Date.now().toString(),
        name: nome,
        category: categoria,
        qty: quantidade,
        unit: unit,
        rendimento: `${quantidade}${unit}`,
        custo: `R$ ${custo}`,
        price: custo,
        defaultQty: quantidade,
        grossQty: quantidade,
        // Purchase info — preservado para exibir/editar depois
        purchaseQty: purchaseQty || '',
        purchaseUnit: purchaseUnit || unit,
        purchaseTotal: purchaseTotal || '',
        isPrepared: false,
        lastUpdated: Date.now(),
      });
    }
    onClose();
  };

  return (
    <div className="fixed inset-0 z-[90] flex items-center justify-center">
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" />
      <div className={`relative w-[95vw] sm:w-[90vw] ${tipo === 'preparado' ? 'max-w-[580px]' : 'max-w-[480px]'} max-h-[92vh] overflow-y-auto bg-[#1B1B1D] rounded-[20px] p-4 sm:p-6 shadow-2xl border border-[#2A2A2C]`}>
        {/* Header */}
        <div className="flex items-start justify-between mb-4">
          <div>
            <h2 className="text-[18px] font-bold text-white">{isEditing ? 'Editar Insumo' : 'Criar Insumo'}</h2>
            <p className="text-[11px] text-[#868686] mt-0.5">{isEditing ? 'Atualize os dados' : 'Cadastre um novo insumo'}</p>
          </div>
          <div className="flex items-center gap-2">
            {isEditing && (
              <button
                onClick={() => onDelete(insumo.id)}
                className="w-[36px] h-[36px] rounded-[10px] bg-[#252527] flex items-center justify-center hover:bg-red-500/10 hover:text-red-500 text-[#868686] transition-colors"
                title="Excluir Insumo"
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
                  <path d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
              </button>
            )}
            <button className="w-[36px] h-[36px] rounded-[10px] bg-[#252527] flex items-center justify-center hover:bg-[#333] transition-colors" onClick={onClose}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
                <path d="M18 6L6 18M6 6L18 18" stroke="#868686" strokeWidth="1.5" strokeLinecap="round"/>
              </svg>
            </button>
          </div>
        </div>

        {/* Form */}
        <div className="flex flex-col gap-3">
          {/* Nome */}
          <div>
            <label className="block text-[11px] text-[#868686] mb-1.5 font-medium">Nome</label>
            <input
              type="text"
              value={nome}
              onChange={(e) => setNome(e.target.value)}
              className="w-full bg-[#252527] border border-[#2A2A2C] rounded-[10px] px-3 py-2.5 text-[13px] text-white outline-none focus:border-[#F5A623] transition-colors"
              placeholder="Ex: Peito de Frango"
            />
          </div>

          {/* Tipo - Pronto ou Preparado */}
          {!isEditing ? (
            <div>
              <label className="block text-[11px] text-[#868686] mb-1.5 font-medium">
                Tipo de Insumo
                <span className="ml-1 text-[10px] text-[#555] cursor-help" title="Pronto: vem pronto do fornecedor. Preparado: você produz na casa com outros insumos.">ⓘ</span>
              </label>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setTipo('pronto')}
                  className={`flex-1 py-2.5 rounded-[10px] text-[12px] font-semibold transition-all border ${
                    tipo === 'pronto'
                      ? 'bg-[#F5A623]/15 border-[#F5A623] text-[#F5A623]'
                      : 'bg-[#252527] border-[#2A2A2C] text-[#868686] hover:border-[#444]'
                  }`}
                >
                  Pronto
                </button>
                <button
                  type="button"
                  onClick={() => setTipo('preparado')}
                  className={`flex-1 py-2.5 rounded-[10px] text-[12px] font-semibold transition-all border ${
                    tipo === 'preparado'
                      ? 'bg-[#F5A623]/15 border-[#F5A623] text-[#F5A623]'
                      : 'bg-[#252527] border-[#2A2A2C] text-[#868686] hover:border-[#444]'
                  }`}
                >
                  Preparado
                </button>
              </div>
              <div className="mt-1.5 text-[10px] text-[#555]">
                {tipo === 'pronto'
                  ? 'Vem pronto do fornecedor. Ex: Mussarela, Farinha de Trigo.'
                  : 'Produzido na casa. Ex: Molho de tomate, Blend de hambúrguer.'}
              </div>
            </div>
          ) : (
            <div className="flex items-center gap-2">
              <span className="text-[11px] text-[#868686]">Tipo:</span>
              <span className={`text-[11px] font-semibold px-2.5 py-1 rounded-[6px] ${
                tipo === 'preparado'
                  ? 'bg-[#F5A623]/15 text-[#F5A623]'
                  : 'bg-[#252527] text-[#AAA]'
              }`}>
                {tipo === 'preparado' ? 'Preparado' : 'Pronto'}
              </span>
            </div>
          )}

          {tipo === 'pronto' && (
            <>
              {/* Categoria + Unidade Base lado a lado */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] text-[#868686] mb-1.5 font-medium">Categoria</label>
                  <div className="relative">
                    <select
                      value={categoria}
                      onChange={(e) => setCategoria(e.target.value)}
                      className="w-full bg-[#252527] border border-[#2A2A2C] rounded-[10px] px-3 py-2.5 text-[13px] text-white outline-none focus:border-[#F5A623] transition-colors appearance-none cursor-pointer pr-8"
                    >
                      {categoryOptions.map(c => (
                        <option key={c} value={c} className="bg-[#1B1B1D] text-white">{c}</option>
                      ))}
                    </select>
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none">
                      <path d="M6 9L12 15L18 9" stroke="#868686" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                    </svg>
                  </div>
                </div>

                <div>
                  <label className="block text-[11px] text-[#868686] mb-1.5 font-medium">Unidade Base</label>
                  <div className="relative bg-[#252527] border border-[#2A2A2C] rounded-[10px] overflow-hidden focus-within:border-[#F5A623] transition-colors">
                    <select
                      value={unit}
                      onChange={(e) => { setUnit(e.target.value); if (!insumo.id) setPurchaseUnit(e.target.value); }}
                      className="w-full bg-transparent px-3 py-2.5 text-[13px] text-white outline-none appearance-none cursor-pointer pr-8"
                    >
                      <option value="gr" className="bg-[#1B1B1D] text-white">Gramas (gr)</option>
                      <option value="ml" className="bg-[#1B1B1D] text-white">Mililitros (ml)</option>
                      <option value="un" className="bg-[#1B1B1D] text-white">Unidade (un)</option>
                      <option value="kg" className="bg-[#1B1B1D] text-white">Quilogramas (kg)</option>
                      <option value="lt" className="bg-[#1B1B1D] text-white">Litros (lt)</option>
                    </select>
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none">
                      <path d="M6 9L12 15L18 9" stroke="#868686" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                    </svg>
                  </div>
                </div>
              </div>

              {/* Informações da Compra — bloco compacto (usa unidade base) */}
              <div className="bg-gradient-to-br from-[#F5A623]/5 to-transparent border border-[#F5A623]/20 rounded-[12px] p-3 space-y-2.5">
                <div className="flex items-center gap-2">
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none"><path d="M9 11l3 3L22 4M21 12v7a2 2 0 01-2 2H5a2 2 0 01-2-2V5a2 2 0 012-2h11" stroke="#F5A623" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg>
                  <span className="text-[12px] text-[#F5A623] font-semibold">Informações da Compra</span>
                  <span className="text-[9px] text-[#666] ml-auto">Calcula preço por {unit} automaticamente</span>
                </div>

                {/* Linha única: Qty + Total (usa a unidade base definida acima) */}
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="block text-[10px] text-[#868686] mb-1">Quantidade comprada ({unit})</label>
                    <input
                      type="text"
                      inputMode="decimal"
                      value={purchaseQty}
                      onChange={(e) => setPurchaseQty(e.target.value.replace(/[^0-9.,]/g, ''))}
                      className="w-full bg-[#252527] border border-[#2A2A2C] rounded-[8px] px-2.5 py-2 text-[13px] text-white outline-none focus:border-[#F5A623] transition-colors"
                      placeholder={unit === 'un' ? 'Ex: 100' : unit === 'kg' ? 'Ex: 3' : unit === 'lt' ? 'Ex: 1' : 'Ex: 900'}
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] text-[#868686] mb-1">Valor pago pela embalagem</label>
                    <div className="flex items-center bg-[#252527] border border-[#2A2A2C] rounded-[8px] overflow-hidden focus-within:border-[#F5A623] transition-colors">
                      <span className="text-[12px] text-[#868686] pl-2 shrink-0">R$</span>
                      <input
                        type="text"
                        inputMode="numeric"
                        value={purchaseTotal}
                        onChange={handlePurchaseTotalChange}
                        className="w-full bg-transparent px-1.5 py-2 text-[13px] text-white outline-none"
                        placeholder="0,00"
                      />
                    </div>
                  </div>
                </div>

                {/* Preço calculado */}
                {calculatedPricePerUnit !== null && (
                  <div className="flex items-center justify-between pt-2 border-t border-[#F5A623]/15">
                    <span className="text-[11px] text-[#868686]">Preço por {unit}:</span>
                    <span className="text-[14px] font-bold text-[#F5A623]">R$ {calculatedPricePerUnit.toFixed(2).replace('.', ',')}</span>
                  </div>
                )}
              </div>

              {/* Fallback manual — só aparece se não tiver purchase info */}
              {!calculatedPricePerUnit && (
                <div>
                  <label className="block text-[11px] text-[#868686] mb-1.5 font-medium">Preço por {unit} <span className="text-[9px] text-[#555] font-normal">(ou preencha acima)</span></label>
                  <div className="flex items-center bg-[#252527] border border-[#2A2A2C] rounded-[10px] overflow-hidden focus-within:border-[#F5A623] transition-colors">
                    <span className="text-[13px] text-[#868686] pl-3 shrink-0">R$</span>
                    <input
                      type="text"
                      inputMode="numeric"
                      value={custo}
                      onChange={handleCustoChange}
                      className="flex-1 bg-transparent px-2 py-2.5 text-[13px] text-white outline-none"
                      placeholder="0,00"
                    />
                  </div>
                </div>
              )}
            </>
          )}

          {tipo === 'preparado' && (
            <>
              {/* Categoria */}
              <div>
                <label className="block text-[12px] text-[#868686] mb-2">Categoria</label>
                <div className="relative">
                  <select value={categoria} onChange={(e) => setCategoria(e.target.value)} className="w-full bg-[#252527] border border-[#2A2A2C] rounded-[12px] px-4 py-3.5 text-[14px] text-white outline-none focus:border-[#F5A623] transition-colors appearance-none cursor-pointer">
                    {categoryOptions.map(c => (<option key={c} value={c} className="bg-[#1B1B1D] text-white">{c}</option>))}
                  </select>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" className="absolute right-4 top-1/2 -translate-y-1/2 pointer-events-none"><path d="M6 9L12 15L18 9" stroke="#868686" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg>
                </div>
              </div>

              {/* Rendimento */}
              <div>
                <label className="block text-[12px] text-[#868686] mb-2">Rendimento da Receita</label>
                <div className="flex gap-2">
                  <div className="flex-1 flex items-center bg-[#252527] border border-[#2A2A2C] rounded-[12px] overflow-hidden focus-within:border-[#F5A623] transition-colors">
                    <input type="text" value={rendimentoPreparado} onChange={(e) => setRendimentoPreparado(e.target.value)} className="flex-1 bg-transparent px-4 py-3.5 text-[14px] text-white outline-none" placeholder="Ex: 10" />
                  </div>
                  <div className="relative w-[120px] bg-[#252527] border border-[#2A2A2C] rounded-[12px] overflow-hidden focus-within:border-[#F5A623] transition-colors">
                    <select value={rendimentoUnit} onChange={(e) => setRendimentoUnit(e.target.value)} className="w-full bg-transparent px-3 py-3.5 text-[14px] text-white outline-none appearance-none cursor-pointer">
                      <option value="gr">Gramas</option><option value="kg">Kg</option><option value="ml">mL</option><option value="lt">Litros</option><option value="un">Un</option>
                    </select>
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none"><path d="M6 9L12 15L18 9" stroke="#868686" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg>
                  </div>
                </div>
              </div>

              {/* Sub-ingredientes */}
              <div>
                <label className="block text-[12px] text-[#868686] mb-2">Ingredientes</label>

                {/* Added sub-ingredients */}
                {subIngredients.length > 0 && (
                  <div className="flex flex-col gap-2 mb-3">
                    {subIngredients.map((sub, idx) => {
                      const subCost = calcSubIngredientCost(sub);
                      const dUnit = sub.usageUnit || sub.unit || 'gr';
                      return (
                        <div key={sub.id || idx} className="flex items-center gap-2 bg-[#252527] rounded-[10px] p-2.5 border border-[#2A2A2C]">
                          <div className="flex-1 min-w-0">
                            <div className="text-[12px] text-white font-medium truncate">{sub.name}</div>
                            <div className="text-[10px] text-[#868686]">R$ {subCost.toFixed(2).replace('.', ',')}</div>
                          </div>
                          <input type="text" value={sub.qty || ''} onChange={(e) => {
                            setSubIngredients(prev => prev.map((s, i) => i === idx ? { ...s, qty: e.target.value } : s));
                          }} className="w-[60px] bg-[#1E1E1E] text-white text-[12px] px-2 py-1.5 rounded-[6px] border border-[#333] outline-none text-center" />
                          <select value={dUnit} onChange={(e) => {
                            setSubIngredients(prev => prev.map((s, i) => i === idx ? { ...s, usageUnit: e.target.value } : s));
                          }} className="w-[55px] bg-[#1E1E1E] text-white text-[11px] px-1 py-1.5 rounded-[6px] border border-[#333] outline-none">
                            <option value="gr">gr</option><option value="kg">kg</option><option value="ml">ml</option><option value="lt">lt</option><option value="un">un</option>
                          </select>
                          <button onClick={() => setSubIngredients(prev => prev.filter((_, i) => i !== idx))} className="text-[#868686] hover:text-red-400 transition-colors p-1">
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none"><path d="M18 6L6 18M6 6L18 18" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/></svg>
                          </button>
                        </div>
                      );
                    })}
                  </div>
                )}

                {/* Search to add sub-ingredients */}
                <div className="flex items-center bg-[#252527] border border-[#2A2A2C] rounded-[10px] px-3 py-2.5 mb-2 focus-within:border-[#F5A623]/40 transition-colors">
                  <input type="text" placeholder="Buscar insumo para adicionar..." value={subSearch} onChange={(e) => setSubSearch(e.target.value)} className="flex-1 bg-transparent text-[12px] text-white placeholder-[#555] outline-none" />
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none"><circle cx="11" cy="11" r="7" stroke="#555" strokeWidth="1.5"/><path d="M16.5 16.5L21 21" stroke="#555" strokeWidth="1.5" strokeLinecap="round"/></svg>
                </div>

                {/* Botão "Criar novo insumo" — sempre visível, abre painel lateral */}
                <button
                  onClick={() => { setInlineInsumo(prev => ({ ...prev, name: subSearch })); setShowInlineCreate(true); }}
                  className="w-full flex items-center justify-center gap-2 bg-gradient-to-r from-[#F5A623]/15 to-[#F5A623]/8 border border-[#F5A623]/40 rounded-[10px] py-2.5 mb-2 hover:from-[#F5A623]/25 hover:to-[#F5A623]/15 hover:border-[#F5A623]/60 transition-all group"
                >
                  <div className="w-[22px] h-[22px] rounded-full bg-[#F5A623] flex items-center justify-center shrink-0 shadow-[0_2px_8px_rgba(245,166,35,0.3)]">
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none"><path d="M12 5V19M5 12H19" stroke="black" strokeWidth="2.5" strokeLinecap="round"/></svg>
                  </div>
                  <span className="text-[13px] text-[#F5A623] font-semibold">Criar novo insumo</span>
                </button>

                {/* Available insumos to add (matching search) */}
                {subSearch && (() => {
                  const matches = availableInsumos
                    .filter(i => !subIngredients.some(s => String(s.id) === String(i.id)))
                    .filter(i => i.name.toLowerCase().includes(subSearch.toLowerCase()))
                    .slice(0, 5);
                  if (matches.length === 0) {
                    return (
                      <div className="text-center py-3 text-[11px] text-[#555] italic mb-2">
                        Nenhum insumo encontrado com "{subSearch}". Clique no botão acima para criar.
                      </div>
                    );
                  }
                  return (
                    <div className="max-h-[180px] overflow-y-auto flex flex-col gap-1 mb-2">
                      {matches.map(i => {
                        const pUnit = i.unit || 'gr';
                        const defUnit = (pUnit === 'kg') ? 'gr' : (pUnit === 'lt') ? 'ml' : pUnit;
                        const defQty = (pUnit === 'kg') ? '100' : (pUnit === 'lt') ? '100' : '1';
                        return (
                          <div key={i.id} className="flex items-center gap-2 bg-[#1E1E1E] rounded-[8px] p-2 cursor-pointer hover:bg-[#252527] transition-colors" onClick={() => {
                            setSubIngredients(prev => [...prev, {
                              ...i,
                              price: i.price || (i.custo ? i.custo.replace(/R\$\s?/g, '').trim() : '0'),
                              purchaseUnit: pUnit,
                              originalUnit: pUnit,
                              usageUnit: defUnit,
                              qty: defQty,
                            }]);
                            setSubSearch('');
                          }}>
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none"><path d="M12 5V19M5 12H19" stroke="#555" strokeWidth="1.5" strokeLinecap="round"/></svg>
                            <span className="text-[12px] text-[#AAA]">{i.name}</span>
                            <span className="text-[10px] text-[#555] ml-auto">{i.custo || ''}</span>
                          </div>
                        );
                      })}
                    </div>
                  );
                })()}

              </div>

              {/* Cost Summary */}
              {subIngredients.length > 0 && rendQty > 0 && (
                <div className="bg-[#252527] rounded-[12px] p-4 border border-[#2A2A2C]">
                  <div className="flex justify-between text-[11px] mb-1">
                    <span className="text-[#868686]">Custo total da receita</span>
                    <span className="text-white font-medium">R$ {totalPreparedCost.toFixed(2).replace('.', ',')}</span>
                  </div>
                  <div className="flex justify-between text-[11px]">
                    <span className="text-[#868686]">Custo por {rendimentoUnit}</span>
                    <span className="text-[#F5A623] font-semibold">R$ {preparedPricePerUnit.toFixed(2).replace('.', ',')}</span>
                  </div>
                </div>
              )}
            </>
          )}

        </div>

        {/* Footer */}
        <div className="flex items-center justify-between mt-5 pt-3 border-t border-[#2A2A2C]">
          <button onClick={onClose} className="text-[13px] text-[#F5A623] font-medium hover:text-[#E5961E] transition-colors">
            Cancelar
          </button>
          <button onClick={handleSave} className="bg-[#F5A623] text-black font-semibold text-[13px] px-6 py-2.5 rounded-[10px] hover:bg-[#E5961E] transition-colors">
            {isEditing ? 'Atualizar Insumo' : 'Salvar Insumo'}
          </button>
        </div>
      </div>

      {/* ===== SIDE DRAWER: Criar Novo Insumo ===== */}
      <AnimatePresence>
      {showInlineCreate && (
        <>
          {/* Overlay backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => { setShowInlineCreate(false); setInlineInsumo({ name: '', category: 'Proteínas', qty: '1', unit: 'un', price: '' }); }}
            className="fixed inset-0 bg-black/60 z-[95]"
          />
          {/* Drawer panel — full height on all devices, above MobileNav */}
          <motion.div
            initial={{ x: '100%' }}
            animate={{ x: 0 }}
            exit={{ x: '100%' }}
            transition={{ type: 'tween', ease: [0.32, 0.72, 0, 1], duration: 0.35 }}
            className="fixed inset-y-0 right-0 w-full sm:w-[420px] bg-[#1B1B1D] border-l border-[#2A2A2C] z-[100] shadow-2xl flex flex-col"
          >
            {/* Drawer Header — com safe area no iPhone (notch) */}
            <div className="flex items-center justify-between px-5 py-4 border-b border-[#2A2A2C]" style={{ paddingTop: 'max(1rem, env(safe-area-inset-top, 1rem))' }}>
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-[10px] bg-[#F5A623]/15 flex items-center justify-center">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none"><path d="M12 5v14M5 12h14" stroke="#F5A623" strokeWidth="2" strokeLinecap="round"/></svg>
                </div>
                <div>
                  <h3 className="text-[16px] font-bold text-white">Criar Novo Insumo</h3>
                  <p className="text-[11px] text-[#666]">Será adicionado à sua lista e ao preparado</p>
                </div>
              </div>
              <button
                onClick={() => { setShowInlineCreate(false); setInlineInsumo({ name: '', category: 'Proteínas', qty: '1', unit: 'un', price: '' }); }}
                className="p-2 rounded-[8px] text-[#666] hover:text-white hover:bg-white/[0.06] transition-colors"
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none"><path d="M18 6L6 18M6 6l12 12" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/></svg>
              </button>
            </div>

            {/* Drawer Body — scrollable */}
            <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
              {/* Nome */}
              <div>
                <label className="block text-[11px] font-semibold text-[#666] uppercase tracking-wider mb-2">Nome do Insumo</label>
                <input
                  type="text"
                  placeholder="Ex: Farinha de trigo"
                  value={inlineInsumo.name}
                  onChange={(e) => setInlineInsumo(prev => ({ ...prev, name: e.target.value }))}
                  autoFocus
                  className="w-full bg-[#252527] border border-[#2A2A2C] rounded-[10px] px-4 py-3 text-[14px] text-white placeholder-[#555] outline-none focus:border-[#F5A623]/50 transition-colors"
                />
              </div>

              {/* Categoria */}
              <div>
                <label className="block text-[11px] font-semibold text-[#666] uppercase tracking-wider mb-2">Categoria</label>
                <select
                  value={inlineInsumo.category}
                  onChange={(e) => setInlineInsumo(prev => ({ ...prev, category: e.target.value }))}
                  className="w-full bg-[#252527] border border-[#2A2A2C] rounded-[10px] px-4 py-3 text-[14px] text-white outline-none focus:border-[#F5A623]/50 [color-scheme:dark] cursor-pointer"
                >
                  {categoryOptions.filter(c => c !== 'Insumo Pronto Preparado').map(cat => (
                    <option key={cat} value={cat}>{cat}</option>
                  ))}
                </select>
              </div>

              {/* Quantidade + Unidade */}
              <div>
                <label className="block text-[11px] font-semibold text-[#666] uppercase tracking-wider mb-2">Quantidade da Embalagem</label>
                <div className="grid grid-cols-[1fr_100px] gap-2">
                  <input
                    type="text"
                    placeholder="Ex: 1000"
                    value={inlineInsumo.qty}
                    onChange={(e) => setInlineInsumo(prev => ({ ...prev, qty: e.target.value.replace(/[^0-9.,]/g, '') }))}
                    className="bg-[#252527] border border-[#2A2A2C] rounded-[10px] px-4 py-3 text-[14px] text-white placeholder-[#555] outline-none focus:border-[#F5A623]/50"
                  />
                  <select
                    value={inlineInsumo.unit}
                    onChange={(e) => setInlineInsumo(prev => ({ ...prev, unit: e.target.value }))}
                    className="bg-[#252527] border border-[#2A2A2C] rounded-[10px] px-3 py-3 text-[14px] text-white outline-none focus:border-[#F5A623]/50 [color-scheme:dark] cursor-pointer"
                  >
                    <option value="un">un</option>
                    <option value="gr">gramas</option>
                    <option value="kg">kg</option>
                    <option value="ml">ml</option>
                    <option value="lt">litros</option>
                  </select>
                </div>
                <p className="text-[10px] text-[#555] mt-1.5">Ex: pacote de 1000 gramas</p>
              </div>

              {/* Preço */}
              <div>
                <label className="block text-[11px] font-semibold text-[#666] uppercase tracking-wider mb-2">Preço de Compra</label>
                <div className="relative">
                  <span className="absolute left-4 top-1/2 -translate-y-1/2 text-[#666] text-[14px] font-medium">R$</span>
                  <input
                    type="text"
                    placeholder="0,00"
                    value={inlineInsumo.price}
                    onChange={(e) => {
                      const raw = e.target.value.replace(/[^0-9]/g, '');
                      if (!raw) { setInlineInsumo(prev => ({ ...prev, price: '' })); return; }
                      const formatted = (parseInt(raw, 10) / 100).toFixed(2).replace('.', ',');
                      setInlineInsumo(prev => ({ ...prev, price: formatted }));
                    }}
                    className="w-full bg-[#252527] border border-[#2A2A2C] rounded-[10px] pl-12 pr-4 py-3 text-[14px] text-white placeholder-[#555] outline-none focus:border-[#F5A623]/50"
                  />
                </div>
                <p className="text-[10px] text-[#555] mt-1.5">Valor pago pela embalagem inteira</p>
              </div>

              {/* Info card */}
              <div className="bg-[#F5A623]/5 border border-[#F5A623]/15 rounded-[10px] p-3 flex gap-2">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" className="shrink-0 mt-0.5"><circle cx="12" cy="12" r="10" stroke="#F5A623" strokeWidth="1.5"/><path d="M12 8v4M12 16h.01" stroke="#F5A623" strokeWidth="1.5" strokeLinecap="round"/></svg>
                <p className="text-[11px] text-[#D4A84F] leading-relaxed">
                  Este insumo ficará disponível na sua lista geral e também será adicionado automaticamente como sub-ingrediente deste preparado.
                </p>
              </div>
            </div>

            {/* Drawer Footer — fixo no final, com safe area no iPhone */}
            <div className="px-5 py-4 border-t border-[#2A2A2C] flex gap-3 bg-[#161618]" style={{ paddingBottom: 'max(1rem, env(safe-area-inset-bottom, 1rem))' }}>
              <button
                onClick={() => { setShowInlineCreate(false); setInlineInsumo({ name: '', category: 'Proteínas', qty: '1', unit: 'un', price: '' }); }}
                className="flex-1 bg-[#252527] text-[#868686] text-[13px] font-semibold py-3 rounded-[10px] hover:bg-[#2F2F2F] hover:text-white transition-colors"
              >
                Cancelar
              </button>
              <button
                onClick={handleCreateInlineInsumo}
                disabled={!inlineInsumo.name.trim() || !inlineInsumo.price.trim()}
                className="flex-1 bg-gradient-to-b from-[#F5B638] to-[#E5961E] text-black text-[13px] font-bold py-3 rounded-[10px] hover:shadow-[0_8px_24px_-6px_rgba(245,166,35,0.5)] transition-all disabled:opacity-40 disabled:cursor-not-allowed disabled:shadow-none"
              >
                Criar e Adicionar
              </button>
            </div>
          </motion.div>
        </>
      )}
      </AnimatePresence>
    </div>
  );
};



// Removed availableInsumosPool mock

// ... (imports)
import FichaTecnicaPrint from './FichaTecnicaPrint';

// ============ MODAL: Criar/Editar Ficha Técnica ============
const CriarFichaTecnicaModal = ({ onClose, editingFicha, onSave, onSyncInsumo, onDelete }) => {
  const isEditing = !!editingFicha;
  const { dashboardData } = useDashboard();
  
  // State
  const [activeTab, setActiveTab] = useState('custos'); // 'custos' or 'operacional'
  const [nome, setNome] = useState(editingFicha ? editingFicha.name : '');
  
  const DEFAULT_FICHA_CATS = ['Prato Principal', 'Entrada', 'Sobremesa', 'Drinks, Coquetéis e Sucos', 'Acompanhamento'];
  const _rawFichaCats = (dashboardData.operational?.categories?.fichas || []).filter(c => c !== 'Insumo Pronto Preparado');
  const fichaCategoryOptions = _rawFichaCats.length > 0 ? _rawFichaCats : DEFAULT_FICHA_CATS;
  const insumoCategoryOptions = dashboardData.operational?.categories?.insumos || ['Proteínas', 'Grãos', 'Vinhos', 'Molhos', 'Legumes', 'Temperos', 'Óleos', 'Laticínios', 'Insumo Pronto Preparado', 'Outros'];
  const availableInsumos = dashboardData.operational?.insumos || [];

  const [categoria, setCategoria] = useState(editingFicha ? editingFicha.type : fichaCategoryOptions[0]);
  const [rendimento, setRendimento] = useState(editingFicha ? String(editingFicha.rendimento || '0').replace(/[^0-9.,]/g, '') : '200');
  const [custoEmbalagem, setCustoEmbalagem] = useState(editingFicha ? String(editingFicha.custoEmbalagem).replace(/R\$\s*/g, '').trim() : '');
  
  // Sales & Price Fields (Integration with Menu Engineering)
  const [precoVenda, setPrecoVenda] = useState(editingFicha?.precoVenda ? String(editingFicha.precoVenda).replace(/R\$\s*/g, '').trim() : '');
  const [vendasMes, setVendasMes] = useState(editingFicha?.vendasMes || '');
  
  // Operational Fields
  const [tempoPreparo, setTempoPreparo] = useState(editingFicha?.tempoPreparo || '');
  const [utensilios, setUtensilios] = useState(editingFicha?.utensilios || '');
  const [fotoPrato, setFotoPrato] = useState(editingFicha?.fotoPrato || null); 
  const [modoPreparo, setModoPreparo] = useState(editingFicha?.modoPreparo || ['']); 
  const [finalizacao, setFinalizacao] = useState(editingFicha?.finalizacao || '');

  // Insumos State
  const [searchInsumo, setSearchInsumo] = useState('');
  const [addedInsumos, setAddedInsumos] = useState(() => {
    if (editingFicha && editingFicha.insumos > 0) {
      const currentInsumos = dashboardData.operational?.insumos || [];
      // Enrich ingredients from current insumos list
      // Old fichas may not have purchaseUnit/originalUnit/grossQty stored
      return (editingFicha.ingredients || []).map(ing => {
        const master = currentInsumos.find(s => String(s.id) === String(ing.id));
        const masterUnit = master?.unit || 'gr';
        return {
          ...ing,
          // Ensure purchaseUnit is always the ORIGINAL unit from the insumo (kg, gr, lt, etc.)
          purchaseUnit: ing.purchaseUnit || ing.originalUnit || masterUnit,
          originalUnit: ing.originalUnit || masterUnit,
          // If usageUnit is missing, derive from purchaseUnit
          usageUnit: ing.usageUnit || ((masterUnit === 'kg') ? 'gr' : (masterUnit === 'lt') ? 'ml' : masterUnit),
          grossQty: ing.grossQty || ing.defaultQty || (master ? (master.grossQty || master.defaultQty || master.qty) : ing.qty),
          defaultQty: ing.defaultQty || (master ? (master.defaultQty || master.qty) : ing.qty),
          // Ensure price reflects master's current price
          price: ing.price || (master ? master.price : ing.custo),
        };
      });
    }
    return [];
  });
  const [showNewInsumoForm, setShowNewInsumoForm] = useState(false);
  const [newInsumo, setNewInsumo] = useState({ name: '', category: insumoCategoryOptions[0], qty: '200', unit: 'gr', price: '' });
  const [editingInsumoId, setEditingInsumoId] = useState(null);
  const [pendingInsumo, setPendingInsumo] = useState(null); // insumo waiting for qty input
  const [pendingQty, setPendingQty] = useState('');
  const [pendingUnit, setPendingUnit] = useState('gr');

  const handleUpdateAddedInsumo = (id, field, value) => {
    setAddedInsumos(prev => prev.map(i => i.id === id ? { ...i, [field]: value } : i));
  };

  // Calculate ingredient cost:
  // price = cost PER UNIT as entered in "Preço por {unit}" field (e.g., R$1.05/un, R$33/kg)
  // cost = usageQty (converted to purchase unit) × pricePerUnit
  const calcInsumoCost = (i) => {
    // 'price' from EditarInsumoModal = preço POR UNIDADE (e.g., R$1,05/un or R$33,00/kg)
    // 'custo' = "R$ X,XX" formatted total — may be same as price or total
    // 'grossQty'/'defaultQty' = quantity purchased (reference only, NOT package divisor)
    //
    // Price is ALWAYS per-unit as entered in "Preço por {unit}" field.
    // So: cost = usageQty (converted to purchase unit) × pricePerUnit
    const pricePerUnit = parseSafeNumber(i.price) || parseSafeNumber(i.custo);
    const purchaseUnit = i.purchaseUnit || i.originalUnit || i.unit || 'gr';
    const usageQty = parseSafeNumber(i.qty);
    const usageUnit = i.usageUnit || i.unit || 'gr';
    const usageInPurchaseUnit = convertUnit(usageQty, usageUnit, purchaseUnit);
    return usageInPurchaseUnit * pricePerUnit;
  };

  const calculatedInsumoCost = addedInsumos.reduce((sum, i) => sum + calcInsumoCost(i), 0);

  // If no insumos added yet but ficha has saved cost, use the saved CMV
  const currentCustoTotalInsumos = (addedInsumos.length === 0 && editingFicha && parseSafeNumber(editingFicha.custoInsumos) > 0)
    ? parseSafeNumber(editingFicha.custoInsumos)
    : calculatedInsumoCost;

  // Handlers
  const handleSave = () => {
    if (!nome.trim()) {
        alert("Preencha o nome da ficha.");
        return;
    }
    const custoTotalInsumos = currentCustoTotalInsumos;
    const custoEmb = parseSafeNumber(custoEmbalagem);
    
    const fichaData = {
      ...editingFicha, // Preserve isImported and other flags
      id: editingFicha ? editingFicha.id : Date.now().toString(),
      name: nome,
      type: categoria,
      progress: editingFicha ? editingFicha.progress : 0, 
      insumos: addedInsumos.length,
      ingredients: addedInsumos, 
      custoInsumos: `R$ ${custoTotalInsumos.toFixed(2).replace('.', ',')}`,
      custoEmbalagem: `R$ ${custoEmb.toFixed(2).replace('.', ',')}`,
      rendimento: `${rendimento}gr`,
      custoTotal: `R$ ${(custoTotalInsumos + custoEmb).toFixed(2).replace('.', ',')}`,
      
      // Keep isImported true only if we haven't added ingredients
      isImported: addedInsumos.length === 0 && (editingFicha?.isImported || false),
      
      // Menu Engineering integration
      precoVenda: `R$ ${(parseSafeNumber(precoVenda) || 0).toFixed(2).replace('.', ',')}`,
      vendasMes: `${parseInt(vendasMes, 10) || 0}`,
      
      tempoPreparo,
      utensilios,
      fotoPrato,
      modoPreparo: modoPreparo.filter(s => s.trim() !== ''),
      finalizacao,
      lastUpdated: Date.now()
    };
    onSave(fichaData, isEditing);
    onClose();
  };

  const addedIds = new Set(addedInsumos.map(i => i.id));
  const filteredInsumos = availableInsumos.filter(i =>
    !addedIds.has(i.id) &&
    (searchInsumo === '' || i.name.toLowerCase().includes(searchInsumo.toLowerCase()) || (i.category || '').toLowerCase().includes(searchInsumo.toLowerCase()))
  );

  const handleAddInsumo = (insumo) => {
    const purchaseUnit = insumo.unit || 'gr';
    const defaultUsageUnit = (purchaseUnit === 'kg') ? 'gr' : (purchaseUnit === 'lt') ? 'ml' : purchaseUnit;
    const defaultUsageQty = (purchaseUnit === 'kg') ? '100' : (purchaseUnit === 'lt') ? '100' : (insumo.defaultQty || '100');
    setPendingInsumo(insumo);
    setPendingQty(defaultUsageQty);
    setPendingUnit(defaultUsageUnit);
  };

  const confirmAddPendingInsumo = () => {
    if (!pendingInsumo || !pendingQty) return;
    const insumo = pendingInsumo;
    const resolvedPrice = insumo.price || (insumo.custo ? insumo.custo.replace(/R\$\s?/g, '').trim() : '0');
    const purchaseUnit = insumo.unit || 'gr';
    setAddedInsumos(prev => [...prev, {
        ...insumo,
        price: resolvedPrice,
        purchaseUnit: purchaseUnit,
        originalUnit: purchaseUnit,
        usageUnit: pendingUnit,
        qty: pendingQty,
        netQty: pendingQty,
        grossQty: insumo.grossQty || insumo.defaultQty,
        fc: '1.00'
    }]);
    setPendingInsumo(null);
    setPendingQty('');
    setPendingUnit('gr');
  };

  const cancelPendingInsumo = () => {
    setPendingInsumo(null);
    setPendingQty('');
    setPendingUnit('gr');
  };

  const handleRemoveInsumo = (id) => {
    setAddedInsumos(prev => prev.filter(i => i.id !== id));
  };

  const handleCreateNewInsumo = () => {
    if (!newInsumo.name.trim() || !newInsumo.price.trim()) return;
    
    // Parse values
    const unitPrice = parseSafeNumber(newInsumo.price);

    const created = {
      id: `new_${Date.now()}`,
      name: newInsumo.name,
      category: newInsumo.category,
      defaultQty: newInsumo.qty,
      
      // Store metrics
      qty: newInsumo.qty, 
      netQty: newInsumo.qty,
      grossQty: newInsumo.qty,
      fc: '1.00',
      
      unit: newInsumo.unit,
      price: unitPrice.toFixed(2).replace('.', ','),
    };
    
    setAddedInsumos(prev => [...prev, created]);

    // Sync new insumo to the global insumos list
    if (onSyncInsumo) {
      onSyncInsumo({
        ...created,
        rendimento: `${created.qty}${created.unit}`,
        custo: `R$ ${unitPrice.toFixed(2).replace('.', ',')}`,
      });
    }

    setNewInsumo({ name: '', category: insumoCategoryOptions[0], qty: '200', unit: 'gr', price: '' });
    setShowNewInsumoForm(false);
  };

  const updateStep = (index, value) => {
      const newSteps = [...modoPreparo];
      newSteps[index] = value;
      setModoPreparo(newSteps);
  };
  const addStep = () => setModoPreparo([...modoPreparo, '']);
  const removeStep = (index) => setModoPreparo(modoPreparo.filter((_, i) => i !== index));
  
  // Construct data for print
  const getPrintData = () => {
     return {
        name: nome,
        type: categoria,
        rendimento: `${rendimento}gr`, // Append unit as in render
        utensilios,
        tempoPreparo,
        fotoPrato,
        ingredients: addedInsumos,
        modoPreparo,
        finalizacao
     };
  };

  const [mobilePanel, setMobilePanel] = useState('form'); // 'form' or 'insumos' — mobile only

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Print Component (Hidden unless printing) */}
      <FichaTecnicaPrint data={getPrintData()} />

      {/* Backdrop — no onClick to prevent accidental data loss */}
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" />

      {/* Modal Content — fullscreen on mobile, centered on desktop */}
      <div className="relative w-full h-full md:w-[90vw] md:max-w-[1000px] md:h-[85vh] md:max-h-[750px] bg-[#1B1B1D] md:rounded-[20px] flex flex-col md:flex-row overflow-hidden shadow-2xl border-0 md:border border-[#2A2A2C]">

        {/* MOBILE: Toggle between Form and Insumos panels */}
        <div className="md:hidden flex items-center bg-[#151515] border-b border-[#2A2A2C] px-4 py-2 gap-2 shrink-0">
          <button
            onClick={() => setMobilePanel('form')}
            className={`flex-1 py-2 rounded-[8px] text-[12px] font-semibold transition-all ${mobilePanel === 'form' ? 'bg-[#F5A623] text-black' : 'bg-[#252527] text-[#868686]'}`}
          >
            {isEditing ? 'Editar Ficha' : 'Nova Ficha'}
          </button>
          <button
            onClick={() => setMobilePanel('insumos')}
            className={`flex-1 py-2 rounded-[8px] text-[12px] font-semibold transition-all ${mobilePanel === 'insumos' ? 'bg-[#F5A623] text-black' : 'bg-[#252527] text-[#868686]'}`}
          >
            {activeTab === 'operacional' ? 'Foto & Finalização' : 'Insumos'}
          </button>
        </div>

        {/* LEFT PANEL - Changes based on Tab (hidden on mobile unless insumos panel selected) */}
        <div className={`${mobilePanel === 'insumos' ? 'flex' : 'hidden'} md:flex w-full md:w-[380px] shrink-0 bg-[#151515] flex-col border-r border-[#2A2A2C] flex-1 md:flex-initial overflow-hidden`}>
            {/* ... (rest of the component) ... */}

            {activeTab === 'operacional' ? (
                // LEFT PANEL for OPERATIONAL (Photo & Finalization Preview?)
                <div className="p-4 md:p-6 flex flex-col gap-4 md:gap-6 h-full overflow-y-auto">
                    {/* Foto do Prato */}
                    <div>
                        <label className="block text-[12px] text-[#868686] mb-2 font-medium">FOTO DO PRATO PRONTO</label>
                        <div className="w-full aspect-square bg-[#1E1E1E] border-2 border-dashed border-[#2A2A2C] rounded-[16px] flex flex-col items-center justify-center cursor-pointer hover:border-[#F5A623]/50 transition-colors relative group overflow-hidden">
                             {fotoPrato ? (
                                 <>
                                    <img src={fotoPrato} alt="Prato" className="w-full h-full object-cover" />
                                    {/* Tap to replace photo */}
                                    <input
                                        type="file"
                                        accept="image/*"
                                        className="absolute inset-0 opacity-0 cursor-pointer z-10"
                                        onChange={(e) => {
                                            const file = e.target.files[0];
                                            if (file) {
                                                const reader = new FileReader();
                                                reader.onload = (ev) => setFotoPrato(ev.target.result);
                                                reader.readAsDataURL(file);
                                            }
                                        }}
                                    />
                                    <button
                                        onClick={(e) => { e.stopPropagation(); setFotoPrato(null); }}
                                        className="absolute top-2 right-2 bg-black/50 p-1.5 rounded-full text-white hover:bg-red-500 transition-colors z-20"
                                    >
                                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 6L6 18M6 6L18 18"/></svg>
                                    </button>
                                    <div className="absolute bottom-2 left-0 right-0 text-center z-20 pointer-events-none">
                                        <span className="bg-black/60 text-white text-[10px] px-2 py-1 rounded-full">Toque para trocar</span>
                                    </div>
                                 </>
                             ) : (
                                 <>
                                    <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#555" strokeWidth="1.5" className="mb-2">
                                        <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
                                        <circle cx="8.5" cy="8.5" r="1.5" />
                                        <polyline points="21 15 16 10 5 21" />
                                    </svg>
                                    <span className="text-[12px] text-[#555]">Toque para adicionar foto</span>
                                    <input
                                        type="file"
                                        accept="image/*"
                                        className="absolute inset-0 opacity-0 cursor-pointer"
                                        onChange={(e) => {
                                            const file = e.target.files[0];
                                            if (file) {
                                                const reader = new FileReader();
                                                reader.onload = (ev) => setFotoPrato(ev.target.result);
                                                reader.readAsDataURL(file);
                                            }
                                        }}
                                    />
                                 </>
                             )}
                        </div>
                    </div>

                    {/* Finalização */}
                    <div className="flex-1 flex flex-col">
                         <label className="block text-[12px] text-[#868686] mb-2 font-medium">PADRÃO DE FINALIZAÇÃO E SAÍDA</label>
                         <textarea
                            value={finalizacao}
                            onChange={(e) => setFinalizacao(e.target.value)}
                            className="w-full flex-1 bg-[#1E1E1E] border border-[#2A2A2C] rounded-[12px] p-3 text-[13px] text-white resize-none outline-none focus:border-[#F5A623] transition-colors"
                            placeholder="Descreva como o prato deve ser finalizado e montado para o serviço..."
                         />
                    </div>
                </div>
            ) : (
                // LEFT PANEL for CUSTOS (Insumos List) - Keeping existing logic
                <>
                  <div className="p-3 md:p-5">
                    <div className="flex items-center bg-[#1E1E1E] rounded-[12px] border border-[#2A2A2C] px-3 md:px-4 py-2.5 md:py-3">
                      <input
                        type="text"
                        placeholder="Encontrar Insumos"
                        value={searchInsumo}
                        onChange={(e) => setSearchInsumo(e.target.value)}
                        className="flex-1 bg-transparent text-[13px] text-white placeholder-[#555] outline-none"
                      />
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
                        <circle cx="11" cy="11" r="7" stroke="#555" strokeWidth="1.5"/>
                        <path d="M16.5 16.5L21 21" stroke="#555" strokeWidth="1.5" strokeLinecap="round"/>
                      </svg>
                    </div>
                  </div>

                  <div className="flex-1 overflow-y-auto px-3 md:px-5 flex flex-col gap-2">
                    {/* Added Insumos Section */}
                    {addedInsumos.length > 0 && (
                      <>
                        <div className="mb-1">
                          <div className="text-[13px] font-semibold text-white">Insumos</div>
                          <div className="text-[11px] text-[#868686]">Insumos Adicionados</div>
                        </div>
                        {addedInsumos.map((insumo) => {
                          const isEditingThis = editingInsumoId === insumo.id;
                          const insumoCost = calcInsumoCost(insumo).toFixed(2);
                          const displayUnit = insumo.usageUnit || insumo.unit || 'gr';
                          const pUnit = insumo.purchaseUnit || insumo.originalUnit || insumo.unit || 'gr';

                          if (isEditingThis) {
                            return (
                              <div key={insumo.id} className="bg-[#1E1E1E] rounded-[14px] p-3.5 border border-[#F5A623]/50">
                                <div className="flex items-center justify-between mb-3">
                                  <div>
                                    <div className="font-medium text-[13px] text-white">{insumo.name}</div>
                                    <div className="text-[9px] text-[#868686]">Compra: R$ {parseSafeNumber(insumo.price || insumo.custo).toFixed(2).replace('.', ',')} / {pUnit}</div>
                                  </div>
                                  <button onClick={() => setEditingInsumoId(null)} className="text-[10px] text-[#F5A623] font-semibold px-2 py-1 rounded-full bg-[#F5A623]/10">Concluir</button>
                                </div>
                                <div className="flex gap-2 mb-2">
                                  <div className="flex-1">
                                    <label className="text-[9px] text-[#868686] mb-1 block">Qtd Utilizada</label>
                                    <input type="text" value={insumo.qty} onChange={e => handleUpdateAddedInsumo(insumo.id, 'qty', e.target.value)} className="w-full bg-[#252527] text-white text-[12px] px-2.5 py-1.5 rounded-[8px] border border-[#333] outline-none focus:border-[#F5A623]" />
                                  </div>
                                  <div className="w-[70px]">
                                    <label className="text-[9px] text-[#868686] mb-1 block">Unidade</label>
                                    <select value={displayUnit} onChange={e => handleUpdateAddedInsumo(insumo.id, 'usageUnit', e.target.value)} className="w-full bg-[#252527] text-white text-[12px] px-2 py-1.5 rounded-[8px] border border-[#333] outline-none focus:border-[#F5A623]">
                                      <option value="gr">gr</option>
                                      <option value="kg">kg</option>
                                      <option value="ml">ml</option>
                                      <option value="lt">lt</option>
                                      <option value="un">un</option>
                                    </select>
                                  </div>
                                </div>
                                <div className="flex items-center justify-between mt-2 pt-2 border-t border-[#333]">
                                  <span className="text-[10px] text-[#868686]">Custo na receita:</span>
                                  <span className="text-[11px] text-[#00B37E] font-medium">R$ {insumoCost}</span>
                                </div>
                              </div>
                            );
                          }

                          return (
                          <div key={insumo.id} className="bg-[#1E1E1E] rounded-[14px] p-3.5 flex items-center gap-3 border border-[#2A2A2C] transition-colors group">
                            <div className="w-[38px] h-[38px] rounded-[10px] bg-[#252527] flex items-center justify-center shrink-0 cursor-pointer hover:bg-[#F5A623]/20" onClick={() => setEditingInsumoId(insumo.id)}>
                              <svg width="16" height="16" viewBox="0 0 24 24" fill="none"><path d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" stroke="#868686" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg>
                            </div>
                            <div className="flex-1 min-w-0">
                              <div className="font-medium text-[13px] text-white">{insumo.name}</div>
                              <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] text-[#868686]">
                                  <span>Qtd: <span className="font-medium text-white">{insumo.qty}{displayUnit}</span></span>
                                  <span className="w-1 h-1 rounded-full bg-[#555]" />
                                  <span className="text-[#00B37E]">Custo: R$ {insumoCost}</span>
                              </div>
                            </div>
                            <div className="bg-red-500/10 text-red-400 text-[10px] font-semibold px-3 py-1.5 rounded-full shrink-0 cursor-pointer hover:bg-red-500 hover:text-white transition-colors" onClick={() => handleRemoveInsumo(insumo.id)}>
                              Remover
                            </div>
                          </div>
                          );
                        })}
                        <div className="w-full h-px bg-[#2A2A2C] my-2" />
                      </>
                    )}

                    {/* Pending Insumo - Quantity Prompt */}
                    {pendingInsumo && (
                      <div className="bg-[#1E1E1E] rounded-[14px] p-4 border border-[#F5A623]/60 mb-2 animate-in">
                        <div className="flex items-center gap-2 mb-3">
                          <div className="w-[32px] h-[32px] rounded-[8px] bg-[#F5A623]/15 flex items-center justify-center">
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none"><path d="M12 5V19M5 12H19" stroke="#F5A623" strokeWidth="2" strokeLinecap="round"/></svg>
                          </div>
                          <div>
                            <div className="font-medium text-[13px] text-white">{pendingInsumo.name}</div>
                            <div className="text-[10px] text-[#868686]">Defina a quantidade utilizada na receita</div>
                          </div>
                        </div>
                        <div className="flex gap-2 mb-3">
                          <div className="flex-1">
                            <label className="text-[9px] text-[#868686] mb-1 block">Quantidade</label>
                            <input
                              type="text"
                              value={pendingQty}
                              onChange={e => setPendingQty(e.target.value)}
                              autoFocus
                              onKeyDown={e => { if (e.key === 'Enter') confirmAddPendingInsumo(); if (e.key === 'Escape') cancelPendingInsumo(); }}
                              className="w-full bg-[#252527] text-white text-[13px] px-3 py-2 rounded-[8px] border border-[#333] outline-none focus:border-[#F5A623]"
                            />
                          </div>
                          <div className="w-[80px]">
                            <label className="text-[9px] text-[#868686] mb-1 block">Unidade</label>
                            <select
                              value={pendingUnit}
                              onChange={e => setPendingUnit(e.target.value)}
                              className="w-full bg-[#252527] text-white text-[13px] px-2 py-2 rounded-[8px] border border-[#333] outline-none focus:border-[#F5A623]"
                            >
                              <option value="gr">gr</option>
                              <option value="kg">kg</option>
                              <option value="ml">ml</option>
                              <option value="lt">lt</option>
                              <option value="un">un</option>
                            </select>
                          </div>
                        </div>
                        <div className="flex gap-2">
                          <button onClick={cancelPendingInsumo} className="flex-1 text-[12px] text-[#868686] py-2 rounded-[8px] hover:bg-[#252527] transition-colors">Cancelar</button>
                          <button onClick={confirmAddPendingInsumo} className="flex-1 bg-[#F5A623] text-black text-[12px] font-semibold py-2 rounded-[8px] hover:bg-[#E5961E] transition-colors">Confirmar</button>
                        </div>
                      </div>
                    )}

                    {/* Available Insumos */}
                    {filteredInsumos.length > 0 && (
                      <>
                        <div className="mb-1">
                          <div className="text-[13px] font-semibold text-white">Disponíveis</div>
                          <div className="text-[11px] text-[#868686]">Clique para adicionar</div>
                        </div>
                        {filteredInsumos.map((insumo) => (
                          <div key={insumo.id} className="bg-[#1A1A1A] rounded-[14px] p-3.5 flex items-center gap-3 border border-[#222] cursor-pointer hover:border-[#F5A623]/40 hover:bg-[#1E1E1E] transition-all" onClick={() => handleAddInsumo(insumo)}>
                            <div className="w-[38px] h-[38px] rounded-[10px] bg-[#202020] flex items-center justify-center shrink-0">
                              <svg width="16" height="16" viewBox="0 0 24 24" fill="none"><path d="M12 5V19M5 12H19" stroke="#555" strokeWidth="1.5" strokeLinecap="round"/></svg>
                            </div>
                            <div className="flex-1 min-w-0">
                              <div className="font-medium text-[13px] text-[#AAA]">{insumo.name}</div>
                              <div className="text-[10px] text-[#555]">{insumo.category} • {insumo.defaultQty}{insumo.unit}</div>
                            </div>
                            <div className="text-[11px] text-[#555]">{insumo.custo || (insumo.price ? `R$ ${insumo.price}` : 'R$')}</div>
                          </div>
                        ))}
                      </>
                    )}
                  </div>
                  
                  {/* New Insumo Form */}
                  <div className="p-4 border-t border-[#2A2A2C]">
                    {!showNewInsumoForm ? (
                      <button onClick={() => setShowNewInsumoForm(true)} className="flex items-center gap-3 w-full hover:bg-[#1E1E1E] rounded-[12px] p-2 transition-colors">
                        <div className="w-[40px] h-[40px] rounded-full bg-[#252527] flex items-center justify-center"><svg width="18" height="18" viewBox="0 0 24 24" fill="none"><path d="M12 5V19M5 12H19" stroke="#868686" strokeWidth="1.5" strokeLinecap="round"/></svg></div>
                        <div className="flex-1 text-left"><div className="font-medium text-[13px] text-white">Adicionar Insumo</div><div className="text-[11px] text-[#868686]">Cadastre um novo insumo</div></div>
                      </button>
                    ) : (
                         <div className="flex flex-col gap-3">
                            <div className="text-[12px] font-semibold text-white">Novo Insumo</div>
                            <input type="text" placeholder="Nome" value={newInsumo.name} onChange={(e) => setNewInsumo(p => ({ ...p, name: e.target.value }))} className="w-full bg-[#1E1E1E] border border-[#2A2A2C] rounded-[10px] px-3 py-2.5 text-[12px] text-white outline-none" />
                            
                            <div className="grid grid-cols-2 gap-2">
                                <select value={newInsumo.category} onChange={(e) => setNewInsumo(p => ({ ...p, category: e.target.value }))} className="col-span-2 bg-[#1E1E1E] border border-[#2A2A2C] rounded-[10px] px-3 py-2.5 text-[12px] text-white outline-none">
                                    {insumoCategoryOptions.map(c => <option key={c} value={c}>{c}</option>)}
                                </select>
                                
                                <div>
                                    <label className="text-[10px] text-[#868686] mb-1 block">Quantidade</label>
                                    <div className="flex items-center bg-[#1E1E1E] border border-[#2A2A2C] rounded-[10px] overflow-hidden">
                                        <input type="text" placeholder="100" value={newInsumo.qty} onChange={(e) => setNewInsumo(p => ({ ...p, qty: e.target.value }))} className="w-full bg-transparent px-3 py-2 text-[12px] text-white outline-none" />
                                    </div>
                                </div>
                            </div>
                            
                            <div className="grid grid-cols-2 gap-2">
                                {/* Unit Selection */}
                                <div>
                                    <label className="text-[10px] text-[#868686] mb-1 block">Unidade</label>
                                    <select value={newInsumo.unit} onChange={(e) => setNewInsumo(p => ({ ...p, unit: e.target.value }))} className="w-full bg-[#1E1E1E] border border-[#2A2A2C] rounded-[10px] px-3 py-2 text-[12px] text-white outline-none">
                                        <option value="gr">gr</option>
                                        <option value="ml">ml</option>
                                        <option value="un">un</option>
                                        <option value="kg">kg</option>
                                    </select>
                                </div>
                                
                                {/* Unit Price */}
                                <div>
                                    <label className="text-[10px] text-[#868686] mb-1 block">Preço por un.</label>
                                    <div className="flex items-center bg-[#1E1E1E] border border-[#2A2A2C] rounded-[10px] overflow-hidden">
                                        <span className="text-[12px] text-[#868686] pl-2 shrink-0">R$</span>
                                        <input type="text" placeholder="0,00" value={newInsumo.price} onChange={(e) => setNewInsumo(p => ({ ...p, price: e.target.value }))} className="w-full bg-transparent px-2 py-2 text-[12px] text-white outline-none" />
                                    </div>
                                </div>
                            </div>

                            <div className="flex gap-2 mt-1">
                                <button onClick={() => setShowNewInsumoForm(false)} className="flex-1 text-[12px] text-[#868686] py-2 rounded-[10px] hover:bg-[#1E1E1E]">Cancelar</button>
                                <button onClick={handleCreateNewInsumo} className="flex-1 bg-[#F5A623] text-black text-[12px] font-semibold py-2 rounded-[10px]">Adicionar</button>
                            </div>
                         </div>
                    )}
                  </div>
                </>
            )}
        </div>

        {/* RIGHT PANEL - Form (hidden on mobile when insumos panel selected) */}
        <div className={`${mobilePanel === 'form' ? 'flex' : 'hidden'} md:flex flex-1 flex-col bg-[#1B1B1D] p-4 sm:p-6 md:p-8 overflow-hidden`}>
          {/* Header */}
          <div className="flex items-start justify-between mb-6">
            <div>
              <h2 className="text-[20px] font-bold text-white mb-2">{isEditing ? 'Editar Ficha Técnica' : 'Criar Ficha Técnica'}</h2>
              
              {/* TABS */}
              <div className="flex items-center gap-1 bg-[#252527] p-1 rounded-[10px]">
                  <button 
                    onClick={() => setActiveTab('custos')}
                    className={`px-4 py-1.5 rounded-[8px] text-[12px] font-semibold transition-all ${activeTab === 'custos' ? 'bg-[#3A3A3C] text-white shadow-sm' : 'text-[#868686] hover:text-[#CCC]'}`}
                  >
                    Custos & Insumos
                  </button>
                  <button 
                    onClick={() => setActiveTab('operacional')}
                    className={`px-4 py-1.5 rounded-[8px] text-[12px] font-semibold transition-all ${activeTab === 'operacional' ? 'bg-[#3A3A3C] text-white shadow-sm' : 'text-[#868686] hover:text-[#CCC]'}`}
                  >
                    Operacional
                  </button>
              </div>
            </div>
            
            <div className="flex items-center gap-2">
              <button className="w-[40px] h-[40px] rounded-[10px] bg-[#252527] flex items-center justify-center hover:bg-[#333] transition-colors" onClick={onClose}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none"><path d="M18 6L6 18M6 6L18 18" stroke="#868686" strokeWidth="1.5" strokeLinecap="round"/></svg>
              </button>
            </div>
          </div>

          {/* Form Content */}
          <div className="flex flex-col gap-6 flex-1 overflow-y-auto pr-2">
            
            {activeTab === 'custos' ? (
                // CUSTOS TAB FIELDS
                <>
                    <div className="flex flex-col gap-4">
                        <div>
                        <label className="block text-[12px] text-[#868686] mb-2">Nome</label>
                        <input type="text" value={nome} onChange={(e) => setNome(e.target.value)} placeholder="Nome da ficha técnica" className="w-full bg-[#252527] border border-[#2A2A2C] rounded-[12px] px-4 py-3.5 text-[14px] text-white outline-none focus:border-[#F5A623] transition-colors" />
                        </div>
                        <div>
                        <label className="block text-[12px] text-[#868686] mb-2">Categoria</label>
                        <div className="relative">
                            <select value={categoria} onChange={(e) => setCategoria(e.target.value)} className="w-full bg-[#252527] border border-[#2A2A2C] rounded-[12px] px-4 py-3.5 text-[14px] text-white outline-none appearance-none cursor-pointer focus:border-[#F5A623] transition-colors">
                            {fichaCategoryOptions.map(c => <option key={c} value={c}>{c}</option>)}
                            </select>
                            <svg className="absolute right-4 top-1/2 -translate-y-1/2 pointer-events-none" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#868686" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M6 9L12 15L18 9"/></svg>
                        </div>
                        </div>
                        <div className="grid grid-cols-2 gap-4">
                        <div>
                            <label className="block text-[12px] text-[#868686] mb-2">Rendimento (gr)</label>
                            <input type="text" value={rendimento} onChange={(e) => setRendimento(e.target.value)} className="w-full bg-[#252527] border border-[#2A2A2C] rounded-[12px] px-4 py-3.5 text-[14px] text-white outline-none focus:border-[#F5A623]" />
                        </div>
                        <div>
                            <label className="block text-[12px] text-[#868686] mb-2">Custo Embalagem</label>
                            <div className="flex items-center bg-[#252527] border border-[#2A2A2C] rounded-[12px] overflow-hidden">
                                <span className="pl-4 text-[13px] text-[#868686]">R$</span>
                                <input type="text" value={custoEmbalagem} onChange={(e) => setCustoEmbalagem(e.target.value)} className="flex-1 bg-transparent px-2 py-3.5 text-[14px] text-white outline-none" />
                            </div>
                        </div>
                        </div>
                        
                        {/* Engenharia de Menu Fields */}
                        <div className="bg-[#1E1E1E] p-4 rounded-[12px] border border-[#2A2A2C] mt-2">
                           <div className="mb-3">
                               <div className="text-[13px] font-semibold text-white">Integração com Engenharia de Menu</div>
                               <div className="text-[11px] text-[#868686]">Preencha para classificar o prato automaticamente na Matriz de Preço.</div>
                           </div>
                           <div className="grid grid-cols-2 gap-4">
                               <div>
                                   <label className="block text-[11px] text-[#868686] mb-1.5">Preço de Venda Praticado</label>
                                   <div className="flex items-center bg-[#131313] border border-[#333] rounded-[8px] overflow-hidden focus-within:border-[#F5A623] transition-colors">
                                       <span className="pl-3 text-[12px] text-[#868686]">R$</span>
                                       <input type="text" value={precoVenda} onChange={(e) => setPrecoVenda(e.target.value)} placeholder="0,00" className="flex-1 bg-transparent px-2 py-2.5 text-[13px] text-white outline-none" />
                                   </div>
                               </div>
                               <div>
                                   <label className="block text-[11px] text-[#868686] mb-1.5">Média de Vendas / Mês</label>
                                   <div className="flex items-center bg-[#131313] border border-[#333] rounded-[8px] overflow-hidden focus-within:border-[#F5A623] transition-colors">
                                       <input type="text" value={vendasMes} onChange={(e) => setVendasMes(e.target.value)} placeholder="Ex: 50" className="w-full bg-transparent px-3 py-2.5 text-[13px] text-white outline-none" />
                                   </div>
                               </div>
                           </div>
                           
                           {/* Quick Margin Calculation Preview */}
                           {parseSafeNumber(precoVenda) > 0 && (() => {
                               const pv = parseSafeNumber(precoVenda);
                               const cmvTotal = currentCustoTotalInsumos + parseSafeNumber(custoEmbalagem);
                               const margem = pv - cmvTotal;
                               const margemPct = (margem / pv) * 100;
                               return (
                               <div className="mt-3 pt-3 border-t border-[#333] flex items-center justify-between">
                                  <div className="text-[11px] text-[#868686]">Margem de Contribuição</div>
                                  <div className={`text-[12px] font-bold ${margem > 0 ? 'text-[#00B37E]' : 'text-[#FF4560]'}`}>
                                     R$ {margem.toFixed(2).replace('.', ',')} ({margemPct.toFixed(1)}%)
                                  </div>
                               </div>
                               );
                           })()}
                        </div>
                    </div>
                </>
            ) : (
                // OPERATIONAL TAB FIELDS
                <>
                    <div className="flex flex-col gap-5">
                         {/* Header fields */}
                         <div className="grid grid-cols-2 gap-4">
                            <div>
                                <label className="block text-[12px] text-[#868686] mb-2">Tempo de Preparo</label>
                                <input 
                                    type="text" 
                                    value={tempoPreparo} 
                                    onChange={(e) => setTempoPreparo(e.target.value)} 
                                    placeholder="Ex: 45 min" 
                                    className="w-full bg-[#252527] border border-[#2A2A2C] rounded-[12px] px-4 py-3.5 text-[14px] text-white outline-none focus:border-[#F5A623]" 
                                />
                            </div>
                            <div>
                                <label className="block text-[12px] text-[#868686] mb-2">Utensílios Necessários</label>
                                <input 
                                    type="text" 
                                    value={utensilios} 
                                    onChange={(e) => setUtensilios(e.target.value)} 
                                    placeholder="Ex: Faca, Tábua, Panela de Pressão" 
                                    className="w-full bg-[#252527] border border-[#2A2A2C] rounded-[12px] px-4 py-3.5 text-[14px] text-white outline-none focus:border-[#F5A623]" 
                                />
                            </div>
                         </div>

                         {/* Steps */}
                         <div>
                             <div className="flex items-center justify-between mb-2">
                                <label className="block text-[12px] text-[#868686]">MODO DE PREPARO E MONTAGEM (PASSO A PASSO)</label>
                                <button onClick={addStep} className="text-[11px] text-[#F5A623] font-semibold hover:underline">+ Adicionar Passo</button>
                             </div>
                             <div className="flex flex-col gap-2">
                                 {modoPreparo.map((step, idx) => (
                                     <div key={idx} className="flex items-start gap-2 group">
                                         <div className="w-6 h-6 mt-2 rounded-full bg-[#333] flex items-center justify-center text-[10px] text-[#888] font-bold shrink-0">
                                            {idx + 1}
                                         </div>
                                         <textarea 
                                            value={step}
                                            onChange={(e) => updateStep(idx, e.target.value)}
                                            placeholder={`Descreva o passo ${idx + 1}...`}
                                            className="flex-1 bg-[#252527] border border-[#2A2A2C] rounded-[12px] p-3 text-[13px] text-white resize-none h-[60px] outline-none focus:border-[#F5A623] transition-colors"
                                         />
                                         <button 
                                            onClick={() => removeStep(idx)}
                                            className="mt-2 text-[#555] hover:text-red-500 transition-colors opacity-0 group-hover:opacity-100"
                                         >
                                             <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 6L6 18M6 6L18 18"/></svg>
                                         </button>
                                     </div>
                                 ))}
                             </div>
                         </div>
                    </div>
                </>
            )}

          </div>

          {/* Footer Buttons */}
          <div className="flex flex-col-reverse sm:flex-row items-center justify-between mt-4 sm:mt-6 pt-4 border-t border-[#2A2A2C] gap-3 shrink-0">
            <button
              onClick={onClose}
              className="text-[14px] text-[#F5A623] font-medium hover:text-[#E5961E] transition-colors"
            >
              Cancelar
            </button>
            <div className="flex flex-wrap items-center gap-2 sm:gap-3 w-full sm:w-auto justify-end">
                {/* Print Button */}
                {isEditing && (
                    <button
                        onClick={() => window.print()}
                        className="hidden sm:flex px-4 py-3 rounded-[12px] bg-[#252527] text-white text-[13px] font-medium hover:bg-[#333] transition-colors items-center gap-2"
                    >
                         <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M6 9V2h12v7M6 18H4a2 2 0 01-2-2v-5a2 2 0 012-2h16a2 2 0 012 2v5a2 2 0 01-2 2h-2"/><path d="M6 14h12v8H6z"/></svg>
                         Imprimir
                    </button>
                )}

                {isEditing && onDelete && (
                  <button
                    onClick={() => { if (window.confirm('Tem certeza que deseja excluir esta ficha?')) onDelete(editingFicha.id); }}
                    className="px-3 sm:px-4 py-3 rounded-[12px] bg-[#FF4560]/10 text-[#FF4560] text-[13px] font-medium hover:bg-[#FF4560]/20 transition-colors"
                  >
                    Excluir
                  </button>
                )}

                <button
                onClick={handleSave}
                className="bg-[#F5A623] text-black font-semibold text-[13px] sm:text-[14px] px-6 sm:px-8 py-3 sm:py-3.5 rounded-[12px] hover:bg-[#E5961E] transition-colors flex-1 sm:flex-initial"
                >
                {isEditing ? 'Atualizar Ficha' : 'Salvar Ficha'}
                </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

import { useDashboard } from '../../context/DashboardContext';
import CategoriesModal from './CategoriesModal';
import SimuladorPrecificacao from './SimuladorPrecificacao';
import CriarFichaModularModal from './CriarFichaModularModal';

// ... (keep Modals and sub-components as is)

// ============ AUX COMPONENTS ============

// Numeric pagination with prev/next + page numbers (auto-collapses with ellipsis)
const NumericPagination = ({ page, totalPages, onChange, totalItems }) => {
  // Build a windowed page list: 1 ... (page-1) page (page+1) ... totalPages
  const buildPages = () => {
    const pages = new Set([0, totalPages - 1, page]);
    if (page - 1 >= 0) pages.add(page - 1);
    if (page + 1 <= totalPages - 1) pages.add(page + 1);
    const sorted = Array.from(pages).sort((a, b) => a - b);
    const result = [];
    sorted.forEach((p, idx) => {
      if (idx > 0 && p - sorted[idx - 1] > 1) result.push('ellipsis-' + idx);
      result.push(p);
    });
    return result;
  };
  const pages = buildPages();

  return (
    <div className="flex flex-col sm:flex-row items-center justify-between gap-3 mt-4 pt-4 border-t border-[#2A2A2C]">
      <div className="text-[11px] text-[#555]">
        {totalItems} {totalItems === 1 ? 'item' : 'itens'}
      </div>
      <div className="flex items-center gap-1.5">
        <button
          onClick={() => onChange((p) => Math.max(0, p - 1))}
          disabled={page === 0}
          className="w-8 h-8 rounded-[8px] bg-[#252527] flex items-center justify-center text-[#868686] hover:bg-[#333] disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
          aria-label="Página anterior"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none"><path d="M15 18l-6-6 6-6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>
        </button>
        {pages.map((p) =>
          typeof p === 'string' ? (
            <span key={p} className="text-[11px] text-[#555] px-1">…</span>
          ) : (
            <button
              key={p}
              onClick={() => onChange(p)}
              className={`min-w-[32px] h-8 rounded-[8px] text-[12px] font-medium transition-colors ${
                p === page
                  ? 'bg-[#F5A623] text-black'
                  : 'bg-[#252527] text-[#868686] hover:bg-[#333] hover:text-white'
              }`}
            >
              {p + 1}
            </button>
          )
        )}
        <button
          onClick={() => onChange((p) => Math.min(totalPages - 1, p + 1))}
          disabled={page === totalPages - 1}
          className="w-8 h-8 rounded-[8px] bg-[#252527] flex items-center justify-center text-[#868686] hover:bg-[#333] disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
          aria-label="Próxima página"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none"><path d="M9 18l6-6-6-6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>
        </button>
      </div>
    </div>
  );
};

// Empty state when search/filter returns no results
const EmptyState = ({ searchTerm, filterCategory, type }) => {
  const hasFilter = searchTerm !== '' || filterCategory !== 'all';
  const label = type === 'insumos' ? 'insumo' : 'ficha';
  return (
    <div className="flex flex-col items-center justify-center py-12 text-center">
      <div className="w-[56px] h-[56px] rounded-[14px] bg-[#252527] flex items-center justify-center mb-3">
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none"><circle cx="11" cy="11" r="8" stroke="#868686" strokeWidth="1.5"/><path d="M21 21l-4.35-4.35" stroke="#868686" strokeWidth="1.5" strokeLinecap="round"/></svg>
      </div>
      <div className="text-[14px] font-medium text-white mb-1">
        {hasFilter ? `Nenhum ${label} encontrado` : `Nenhum ${label} cadastrado ainda`}
      </div>
      <div className="text-[12px] text-[#868686]">
        {hasFilter
          ? 'Tente ajustar busca ou categoria'
          : `Use o botão + ou Importar pra criar o primeiro ${label}`}
      </div>
    </div>
  );
};

// ============ MAIN COMPONENT ============
const ITEMS_PER_PAGE = 12;

const FichaTecnica = () => {
  const { dashboardData, updateDashboardData } = useDashboard();
  const [activeTab, setActiveTab] = useState('insumos');
  const [modalFicha, setModalFicha] = useState(null);

  // Use Context Data with fallback
  const fichas = dashboardData.operational?.fichas || [];
  const insumos = dashboardData.operational?.insumos || [];

  // Pagination
  const [fichasPage, setFichasPage] = useState(0);
  const [insumoPage, setInsumoPage] = useState(0);

  // Search and filter
  const [searchTerm, setSearchTerm] = useState('');
  const [filterCategory, setFilterCategory] = useState('all');

  // Reset page and clear search when switching tabs
  useEffect(() => {
    setSearchTerm('');
    setFilterCategory('all');
  }, [activeTab]);

  // Reset to first page when search/filter changes
  useEffect(() => {
    setInsumoPage(0);
    setFichasPage(0);
  }, [searchTerm, filterCategory]);

  const [editingInsumo, setEditingInsumo] = useState(null);
  const [showCategoriesModal, setShowCategoriesModal] = useState(false);
  const [showSimulador, setShowSimulador] = useState(false);
  // BAH-037: ficha modular (pizzas, combos)
  const [modalFichaModular, setModalFichaModular] = useState(null); // null | 'new' | ficha object

  const handleSaveFicha = (fichaData, isEditing) => {
    let newFichas;
    if (isEditing) {
      newFichas = fichas.map(f => f.id === fichaData.id ? fichaData : f);
    } else {
      newFichas = [fichaData, ...fichas];
      setFichasPage(0);
    }
    
    // Build update payload — only include menuEngineering if this ficha has pricing data
    const updatePayload = {
        operational: {
            ...dashboardData.operational,
            fichas: newFichas
        }
    };
    
    // MENU ENGINEERING SYNC — only when ficha has pricing + sales data
    const priceFloat = parseSafeNumber(fichaData.precoVenda);
    
    if (priceFloat > 0 && fichaData.vendasMes) {
        const newMenuEngineering = [...(dashboardData.menuEngineering || [])];
        const menuData = {
            id: `ft_${fichaData.id}`,
            name: fichaData.name,
            category: fichaData.type,
            sales: String(fichaData.vendasMes),
            price: `R$ ${priceFloat.toFixed(2).replace('.', ',')}`,
            cost: fichaData.custoTotal
        };
        
        const existingIdx = newMenuEngineering.findIndex(m => m.id === menuData.id || m.name.toLowerCase() === menuData.name.toLowerCase());
        if (existingIdx >= 0) {
            newMenuEngineering[existingIdx] = menuData;
        } else {
            newMenuEngineering.push(menuData);
        }
        updatePayload.menuEngineering = newMenuEngineering;
    }
    
    updateDashboardData(updatePayload);
  };

  const handleSaveInsumo = (updatedInsumo) => {
    const exists = insumos.some(i => i.id === updatedInsumo.id);

    // Step 1: Update the insumo in the list
    let newInsumos = exists
      ? insumos.map(i => i.id === updatedInsumo.id ? updatedInsumo : i)
      : [updatedInsumo, ...insumos];

    // ========== CASCADE PROPAGATION ==========
    // Helper: recalcular custo de um insumo preparado usando a lista atual de insumos
    const recalcPreparedCost = (prepared, currentInsumos) => {
      if (!prepared.isPrepared || !prepared.subIngredients || prepared.subIngredients.length === 0) return prepared;
      const rQty = parseSafeNumber(prepared.rendimentoPreparado);
      if (rQty <= 0) return prepared;

      const totalCost = prepared.subIngredients.reduce((sum, sub) => {
        // Buscar versão ATUAL do sub-ingrediente na lista (pode ter sido editado)
        const currentSub = currentInsumos.find(i => String(i.id) === String(sub.id)) || sub;
        const pricePerUnit = parseSafeNumber(currentSub.price) || parseSafeNumber(currentSub.custo);
        const purchaseUnit = currentSub.purchaseUnit || currentSub.unit || 'gr';
        const usageQty = parseSafeNumber(sub.qty);
        const usageUnit = sub.usageUnit || sub.unit || 'gr';
        return sum + convertUnit(usageQty, usageUnit, purchaseUnit) * pricePerUnit;
      }, 0);

      const newPricePerUnit = totalCost / rQty;
      return {
        ...prepared,
        totalCost,
        // Preço com 4 decimais internos (precisão) + 2 na exibição do custo
        price: newPricePerUnit.toFixed(4).replace('.', ','),
        custo: `R$ ${newPricePerUnit.toFixed(2).replace('.', ',')}`,
        lastUpdated: Date.now(),
      };
    };

    // Step 2 (CASCATA NIVEL 1): recalcular todos os PREPARADOS que usam este insumo
    if (exists) {
      newInsumos = newInsumos.map(i => {
        if (!i.isPrepared) return i;
        // Preparado usa este insumo como sub-ingrediente?
        const usesUpdatedInsumo = (i.subIngredients || []).some(sub => String(sub.id) === String(updatedInsumo.id));
        if (!usesUpdatedInsumo) return i;
        return recalcPreparedCost(i, newInsumos);
      });
    }

    const updatePayload = {
        operational: {
            ...dashboardData.operational,
            insumos: newInsumos
        }
    };

    // Step 3 (CASCATA NIVEL 2): propagar para FICHAS que usam qualquer insumo atualizado
    // Inclui o insumo editado direto + preparados recalculados
    // SEGURANÇA: só roda se fichas existem no estado. Se fichas.length === 0,
    // NÃO sobrescrever (pode ser que o estado ainda não carregou — evita apagar dados).
    if (exists && fichas.length > 0) {
      const updatedInsumoIds = new Set([
        String(updatedInsumo.id),
        ...newInsumos.filter(i => i.isPrepared && (i.subIngredients || []).some(sub => String(sub.id) === String(updatedInsumo.id))).map(i => String(i.id))
      ]);

      let newMenuEngineering = [...(dashboardData.menuEngineering || [])];
      const updatedFichas = fichas.map(ficha => {
        if (!ficha.ingredients || ficha.ingredients.length === 0) return ficha;
        // Ficha tem algum ingrediente que é insumo/preparado atualizado?
        const hasAffectedIngredient = ficha.ingredients.some(ing => updatedInsumoIds.has(String(ing.id)));
        if (!hasAffectedIngredient) return ficha;

        // Atualiza ingredients com preços mais recentes dos insumos
        const newIngredients = ficha.ingredients.map(ing => {
          const currentInsumo = newInsumos.find(i => String(i.id) === String(ing.id));
          if (!currentInsumo) return ing;
          return {
            ...ing,
            name: currentInsumo.name,
            price: currentInsumo.price,
            custo: currentInsumo.custo,
            unit: currentInsumo.unit || ing.unit,
            purchaseUnit: currentInsumo.unit || ing.purchaseUnit,
            originalUnit: currentInsumo.unit || ing.originalUnit,
            grossQty: currentInsumo.grossQty || currentInsumo.defaultQty || ing.grossQty,
            defaultQty: currentInsumo.defaultQty || ing.defaultQty,
          };
        });

        const custoInsumos = newIngredients.reduce((sum, i) => {
          const pricePerUnit = parseSafeNumber(i.price) || parseSafeNumber(i.custo);
          const purchaseUnit = i.purchaseUnit || i.originalUnit || i.unit || 'gr';
          const usageQty = parseSafeNumber(i.qty);
          const usageUnit = i.usageUnit || i.unit || 'gr';
          return sum + convertUnit(usageQty, usageUnit, purchaseUnit) * pricePerUnit;
        }, 0);

        const custoEmb = parseSafeNumber(ficha.custoEmbalagem);
        const newCustoTotal = `R$ ${(custoInsumos + custoEmb).toFixed(2).replace('.', ',')}`;

        const meIdx = newMenuEngineering.findIndex(m => m.id === `ft_${ficha.id}`);
        if (meIdx >= 0) {
          newMenuEngineering[meIdx] = { ...newMenuEngineering[meIdx], cost: newCustoTotal };
        }

        return {
          ...ficha,
          ingredients: newIngredients,
          custoInsumos: `R$ ${custoInsumos.toFixed(2).replace('.', ',')}`,
          custoTotal: newCustoTotal,
          lastUpdated: Date.now()
        };
      });

      updatePayload.operational.fichas = updatedFichas;
      updatePayload.menuEngineering = newMenuEngineering;
    }

    // Auto-create ficha técnica for "Insumo Pronto Preparado"
    if (updatedInsumo.category === 'Insumo Pronto Preparado' && !exists) {
      const autoFicha = {
        id: `auto_${updatedInsumo.id}`,
        name: updatedInsumo.name,
        type: 'Insumo Pronto Preparado',
        progress: 0,
        insumos: 0,
        ingredients: [],
        custoInsumos: updatedInsumo.custo,
        custoEmbalagem: 'R$ 0,00',
        rendimento: updatedInsumo.rendimento || '0gr',
        custoTotal: updatedInsumo.custo,
        precoVenda: '',
        vendasMes: '0',
        lastUpdated: Date.now(),
        isImported: false
      };

      updatePayload.operational.fichas = [...(dashboardData.operational?.fichas || []), autoFicha];
    }

    updateDashboardData(updatePayload);
  };

  const handleDuplicateFicha = (ficha) => {
    const newId = `${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    const copy = {
      ...ficha,
      id: newId,
      name: `Cópia de ${ficha.name}`,
      ingredientes: ficha.ingredientes ? ficha.ingredientes.map(ing => ({ ...ing })) : [],
      precoVenda: '',
      vendasMes: '0',
      lastUpdated: Date.now()
    };
    const newFichas = [copy, ...fichas];
    updateDashboardData({
      operational: { ...dashboardData.operational, fichas: newFichas }
    });
    setFichasPage(0);
  };

  const handleDuplicateInsumo = (insumo) => {
    const newId = `${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    const copy = { ...insumo, id: newId, name: `Cópia de ${insumo.name}` };
    const newInsumos = [copy, ...insumos];
    updateDashboardData({
      operational: { ...dashboardData.operational, insumos: newInsumos }
    });
    setInsumoPage(0);
  };

  const handleDeleteFicha = (id) => {
    const newFichas = fichas.filter(f => String(f.id) !== String(id));
    const newMenuEngineering = (dashboardData.menuEngineering || []).filter(
      m => m.id !== `ft_${id}`
    );
    updateDashboardData({
        operational: {
            ...dashboardData.operational,
            fichas: newFichas
        },
        menuEngineering: newMenuEngineering
    });
    setModalFicha(null);
  };

  const handleDeleteInsumo = (id) => {
    const newInsumos = insumos.filter(i => String(i.id) !== String(id));
    // Also remove this insumo from any fichas that reference it
    const newFichas = (dashboardData.operational?.fichas || []).map(f => {
      if (f.ingredients && f.ingredients.some(ing => String(ing.id) === String(id))) {
        return { ...f, ingredients: f.ingredients.filter(ing => String(ing.id) !== String(id)) };
      }
      return f;
    });
    updateDashboardData({
        operational: {
            ...dashboardData.operational,
            insumos: newInsumos,
            fichas: newFichas
        }
    });
    setEditingInsumo(null);
  };

  const handleDownloadTemplate = () => {
    const header = "Nome;Categoria;Rendimento;Unidade;Custo\n";
    const example = "Exemplo Insumo;Proteínas;200;gr;10.00\n";
    // Add UTF-8 BOM (\uFEFF) so Excel opens it with correct encoding for ç, ã, etc.
    const blob = new Blob(["\uFEFF" + header + example], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    if (link.download !== undefined) {
        const url = URL.createObjectURL(blob);
        link.setAttribute('href', url);
        link.setAttribute('download', 'modelo_insumos.csv');
        link.style.visibility = 'hidden';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    }
  };

  const handleImportInsumos = (event) => {
    const file = event.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (e) => {
        const text = e.target.result;
        const lines = text.split('\n');
        // Skip header
        const newItems = [];
        for (let i = 1; i < lines.length; i++) {
            const line = lines[i].trim();
            if (!line) continue;
            // Handle both comma and semicolon separators for flexibility
            const separator = line.includes(';') ? ';' : ',';
            const cols = line.split(separator);
            if (cols.length >= 5) {
                newItems.push({
                    id: `imp_${Date.now()}_${i}`,
                    name: cols[0].trim(),
                    category: cols[1].trim(),
                    rendimento: `${cols[2].trim()}${cols[3].trim()}`,
                    custo: `R$ ${cols[4].trim()}`
                });
            }
        }
        
        if (newItems.length > 0) {
            // Smart Merge: Update existing items by name, add new ones
            const updatedInsumos = [...insumos];
            
            newItems.forEach(newItem => {
                const existingIndex = updatedInsumos.findIndex(
                    i => i.name.toLowerCase().trim() === newItem.name.toLowerCase().trim()
                );
                
                if (existingIndex >= 0) {
                    // Update existing item (preserve ID)
                    updatedInsumos[existingIndex] = {
                        ...updatedInsumos[existingIndex],
                        ...newItem,
                        id: updatedInsumos[existingIndex].id // Keep original ID
                    };
                } else {
                    // Add new item
                    updatedInsumos.push(newItem);
                }
            });

            updateDashboardData({
                operational: {
                    ...dashboardData.operational,
                    insumos: updatedInsumos
                }
            });
            alert(`${newItems.length} itens processados com sucesso!`);
        }
    };
    reader.readAsText(file);
    // Reset input
    event.target.value = '';
  };

  const handleDownloadFichasTemplate = () => {
    const header = "Nome do Prato;Categoria;Valor do CMV (R$);Valor de Venda (R$)\n";
    const example = "Pizza Margherita;Prato Principal;15.50;45.00\n";
    const blob = new Blob(["\uFEFF" + header + example], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    if (link.download !== undefined) {
        const url = URL.createObjectURL(blob);
        link.setAttribute('href', url);
        link.setAttribute('download', 'modelo_fichas_tecnicas.csv');
        link.style.visibility = 'hidden';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    }
  };

  const handleImportFichas = (event) => {
    const file = event.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (e) => {
        const text = e.target.result;
        const lines = text.split('\n');
        const newItems = [];

        // Detect separator from header line
        const headerLine = (lines[0] || '').trim();
        const separator = headerLine.includes(';') ? ';' : ',';
        const headers = headerLine.split(separator).map(h => h.trim().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, ''));

        // Map header names to column indices (flexible matching)
        const findCol = (...patterns) => headers.findIndex(h => patterns.some(p => h.includes(p)));
        const colName = findCol('produto', 'nome', 'name', 'item');
        const colCat = findCol('categoria', 'category', 'tipo');
        const colCmv = findCol('cmv', 'custo');
        const colPrice = findCol('preco', 'price', 'venda');
        const colSales = findCol('vendas', 'sales', 'qtd vendida', 'quantidade');

        // Fallback to positional if no headers matched
        const iName = colName >= 0 ? colName : 0;
        const iCat = colCat >= 0 ? colCat : 1;
        const iCmv = colCmv >= 0 ? colCmv : 2;
        const iPrice = colPrice >= 0 ? colPrice : 3;
        const iSales = colSales >= 0 ? colSales : -1;

        for (let i = 1; i < lines.length; i++) {
            const line = lines[i].trim();
            if (!line) continue;
            const cols = line.split(separator);
            if (cols.length >= 3) {
                const name = (cols[iName] || '').trim();
                if (!name) continue;
                const cat = (cols[iCat] || '').trim();
                const cmv = parseSafeNumber((cols[iCmv] || '').trim());
                const price = parseSafeNumber((cols[iPrice] || '').trim());
                const sales = iSales >= 0 ? parseInt((cols[iSales] || '').trim(), 10) || 0 : 0;

                newItems.push({
                    id: `imp_ft_${Date.now()}_${i}`,
                    name: name,
                    type: cat || 'Prato Principal',
                    progress: 0,
                    insumos: 0,
                    ingredients: [],
                    custoInsumos: `R$ ${cmv.toFixed(2).replace('.', ',')}`,
                    custoEmbalagem: "R$ 0,00",
                    rendimento: "0gr",
                    custoTotal: `R$ ${cmv.toFixed(2).replace('.', ',')}`,
                    precoVenda: `R$ ${price.toFixed(2).replace('.', ',')}`,
                    vendasMes: `${sales}`,
                    isImported: true,
                    lastUpdated: Date.now()
                });
            }
        }
        
        if (newItems.length > 0) {
            const updatedFichas = [...fichas];
            const updatedMenuEngineering = [...(dashboardData.menuEngineering || [])];

            newItems.forEach(newItem => {
                const existingIndex = updatedFichas.findIndex(
                    f => f.name.toLowerCase().trim() === newItem.name.toLowerCase().trim()
                );
                
                if (existingIndex >= 0) {
                    updatedFichas[existingIndex] = {
                        ...updatedFichas[existingIndex],
                        ...newItem,
                        id: updatedFichas[existingIndex].id
                    };
                } else {
                    updatedFichas.push(newItem);
                }

                // Also update Menu Engineering for immediately visible data
                const menuData = {
                    id: `ft_${newItem.id}`,
                    name: newItem.name,
                    category: newItem.type,
                    sales: "0",
                    price: newItem.precoVenda,
                    cost: newItem.custoTotal
                };
                const mIdx = updatedMenuEngineering.findIndex(m => m.name.toLowerCase() === newItem.name.toLowerCase());
                if (mIdx >= 0) updatedMenuEngineering[mIdx] = menuData;
                else updatedMenuEngineering.push(menuData);
            });

            updateDashboardData({
                operational: {
                    ...dashboardData.operational,
                    fichas: updatedFichas
                },
                menuEngineering: updatedMenuEngineering
            });
            alert(`${newItems.length} fichas pré-processadas com sucesso!`);
        }
    };
    reader.readAsText(file);
    event.target.value = '';
  };

  return (
    <div className="flex flex-col w-full h-full min-h-screen lg:h-screen lg:min-h-0 lg:overflow-hidden bg-[#101010] font-jakarta text-white">

      {/* TOP AREA: Left Panel + Right Content */}
      <div className="flex flex-col lg:flex-row flex-1 lg:min-h-0">

        {/* LEFT PANEL - Summary (hidden on mobile — stats shown in compact form) */}
        <div className="hidden lg:flex w-full lg:w-[320px] xl:w-[380px] shrink-0 bg-[#101010] p-6 lg:p-8 flex-col gap-5 lg:border-r border-[#1E1E1E]">
          {/* Breadcrumb */}
          <div className="text-[11px] text-[#868686]">
            <span className="text-[#555]">Breakr</span>
            <span className="mx-1.5 text-[#555]">›</span>
            <span className="text-[#F5A623]">Ficha Técnica</span>
          </div>

          {/* Title */}
          <div>
            <h1 className="text-[22px] font-bold text-white leading-tight">Insumos e Fichas<br/>Técnicas</h1>
            <p className="text-[12px] text-[#868686] mt-2">Configure seus custos e veja dados e informações</p>
          </div>

          {/* Fichas Técnicas Stats */}
          <div>
            <h3 className="font-semibold text-[13px] text-white mb-3">Fichas Técnicas</h3>
            <div className="flex items-center justify-between mb-4">
              <div>
                <div className="text-[32px] font-bold text-white">{fichas.length}</div>
                <div className="text-[11px] text-[#868686]">Fichas Técnicas</div>
              </div>
              <button className="w-[36px] h-[36px] rounded-[10px] bg-[#252527] flex items-center justify-center hover:bg-[#333] transition-colors">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
                  <rect x="4" y="2" width="16" height="20" rx="2" stroke="#868686" strokeWidth="1.5"/>
                  <path d="M8 6H16M8 10H12" stroke="#868686" strokeWidth="1.5" strokeLinecap="round"/>
                </svg>
              </button>
            </div>

            <div className="flex flex-col gap-4 mb-4">
              <div>
                <div className="text-[12px] text-[#E0E0E0] font-medium mb-1">Custo Médio Embalagem</div>
                <div className="text-[24px] font-bold text-white">
                  R$ {fichas.length > 0 
                      ? (fichas.reduce((acc, f) => acc + parseSafeNumber(f.custoEmbalagem), 0) / fichas.length).toFixed(2).replace('.', ',') 
                      : '0,00'}
                </div>
                <div className="text-[11px] text-[#A0A0A0]">Por Ficha Técnica (Média)</div>
              </div>
            </div>
          </div>

          <div className="w-full h-px bg-[#1E1E1E]" />

          {/* Insumos Stats */}
          <div>
            <h3 className="font-semibold text-[13px] text-white mb-3">Insumos</h3>
            <div className="flex items-center justify-between">
              <div>
                <div className="text-[32px] font-bold text-white">{insumos.length}</div>
                <div className="text-[11px] text-[#868686]">Insumos Cadastrados</div>
              </div>
              <button className="w-[36px] h-[36px] rounded-[10px] bg-[#252527] flex items-center justify-center hover:bg-[#333] transition-colors">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
                  <path d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" stroke="#868686" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
              </button>
            </div>
          </div>
        </div>

        {/* MIDDLE PANEL - Submenu (horizontal on mobile, vertical on desktop) */}
        <div className="w-full lg:w-[220px] shrink-0 bg-[#131313] p-3 lg:py-6 lg:px-4 flex flex-row lg:flex-col gap-2 lg:gap-4 lg:border-r border-[#1E1E1E] overflow-x-auto">
          {/* Operacional Header — desktop only */}
          <div className="hidden lg:flex items-center justify-between mb-2">
            <div>
              <div className="font-semibold text-[13px] text-white">Operacional</div>
              <div className="text-[10px] text-[#868686]">Gestão de Cardápio</div>
            </div>
            <button className="w-[32px] h-[32px] rounded-[8px] flex items-center justify-center hover:bg-[#1E1E1E] transition-colors">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
                <path d="M4 6H20M4 12H20M4 18H20" stroke="#868686" strokeWidth="1.5" strokeLinecap="round"/>
              </svg>
            </button>
          </div>

          {/* Insumos Tab */}
          <button
            onClick={() => setActiveTab('insumos')}
            className={`flex items-center gap-2 lg:gap-3 p-2.5 lg:p-3 rounded-[12px] transition-colors w-auto lg:w-full text-left whitespace-nowrap ${
              activeTab === 'insumos' ? 'bg-[#1E1E1E]' : 'hover:bg-[#1A1A1A]'
            }`}
          >
            <div className={`w-[32px] h-[32px] lg:w-[36px] lg:h-[36px] rounded-[10px] flex items-center justify-center shrink-0 ${
              activeTab === 'insumos' ? 'bg-[#252527]' : 'bg-[#1A1A1A]'
            }`}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
                <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-1 17.93c-3.95-.49-7-3.85-7-7.93 0-.62.08-1.21.21-1.79L9 15v1c0 1.1.9 2 2 2v1.93zm6.9-2.54c-.26-.81-1-1.39-1.9-1.39h-1v-3c0-.55-.45-1-1-1H8v-2h2c.55 0 1-.45 1-1V7h2c1.1 0 2-.9 2-2v-.41c2.93 1.19 5 4.06 5 7.41 0 2.08-.8 3.97-2.1 5.39z" fill={activeTab === 'insumos' ? '#F5A623' : '#868686'}/>
              </svg>
            </div>
            <div className="flex-1 min-w-0">
              <div className={`flex items-center gap-2 font-medium text-[12px] ${activeTab === 'insumos' ? 'text-white' : 'text-[#868686]'}`}>
                Insumos
                <span className="bg-[#2A2A2C] text-[#868686] text-[9px] font-bold px-1.5 py-0.5 rounded-full">{String(insumos.length).padStart(2, '0')}</span>
              </div>
              <div className="text-[10px] text-[#555] hidden lg:block">Gestão de insumos</div>
            </div>
          </button>

          {/* Ficha Técnica Tab */}
          <button
            onClick={() => setActiveTab('fichas')}
            className={`flex items-center gap-2 lg:gap-3 p-2.5 lg:p-3 rounded-[12px] transition-colors w-auto lg:w-full text-left whitespace-nowrap ${
              activeTab === 'fichas' ? 'bg-[#1E1E1E]' : 'hover:bg-[#1A1A1A]'
            }`}
          >
            <div className={`w-[32px] h-[32px] lg:w-[36px] lg:h-[36px] rounded-[10px] flex items-center justify-center shrink-0 ${
              activeTab === 'fichas' ? 'bg-[#252527]' : 'bg-[#1A1A1A]'
            }`}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
                <path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z" fill={activeTab === 'fichas' ? '#F5A623' : '#868686'}/>
              </svg>
            </div>
            <div className="flex-1 min-w-0">
              <div className={`flex items-center gap-2 font-medium text-[12px] ${activeTab === 'fichas' ? 'text-white' : 'text-[#868686]'}`}>
                Fichas
                <span className="bg-[#2A2A2C] text-[#868686] text-[9px] font-bold px-1.5 py-0.5 rounded-full">{String(fichas.length).padStart(2, '0')}</span>
              </div>
              <div className="text-[10px] text-[#555] hidden lg:block">Gestão de ficha técnica</div>
            </div>
          </button>
        </div>

        {/* RIGHT PANEL - Content */}
        <div className="flex-1 flex flex-col min-w-0 lg:min-h-0 lg:overflow-hidden">

          {/* Content Area */}
          <div className="flex-1 lg:overflow-hidden flex flex-col">
            {/* Breadcrumb + Title + Actions — fixo no topo */}
            <div className="px-6 pt-6 pb-4 shrink-0">
              <div className="text-[11px] text-[#868686] mb-2">
                <span className="text-[#555]">Breakr</span>
                <span className="mx-1.5 text-[#555]">›</span>
                <span className="text-[#555]">{activeTab === 'insumos' ? 'Insumos' : 'Ficha Técnica'}</span>
              </div>
              
              <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-3">
                  <div>
                      <h2 className="text-[20px] sm:text-[22px] font-bold text-white mb-1">
                        {activeTab === 'insumos' ? 'Insumos' : 'Fichas Técnicas'}
                      </h2>
                      <p className="text-[12px] text-[#868686]">
                        {activeTab === 'insumos'
                          ? 'Adicione insumos para compor ficha técnica'
                          : 'Configure as fichas técnicas para precificar o produto'
                        }
                      </p>
                  </div>

                  {activeTab === 'insumos' ? (
                      <div className="flex flex-wrap items-center gap-2 sm:gap-3">
                          <button
                            onClick={() => setShowCategoriesModal(true)}
                            className="bg-[#2A2A2C] hover:bg-[#333] text-white text-[11px] font-medium px-3 py-1.5 rounded-[8px] flex items-center gap-1.5 transition-colors"
                          >
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
                               <path d="M4 6H20M4 12H20M4 18H20" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                            </svg>
                            Categorias
                          </button>

                          <button
                              onClick={handleDownloadTemplate}
                              className="text-[11px] font-medium text-[#F5A623] hover:text-[#E5961E] transition-colors flex items-center gap-1.5"
                          >
                              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
                              Baixar
                          </button>

                          <label className="bg-[#252527] hover:bg-[#333] border border-[#2A2A2C] text-white text-[11px] font-medium px-3 py-1.5 rounded-[8px] transition-colors cursor-pointer flex items-center gap-1.5">
                              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>
                              Importar
                              <input type="file" accept=".csv" onChange={handleImportInsumos} hidden />
                          </label>
                      </div>
                  ) : (
                      <div className="flex flex-wrap items-center gap-2 sm:gap-3">
                          <button
                              onClick={() => setShowSimulador(true)}
                              className="bg-[#F5A623]/15 hover:bg-[#F5A623]/25 border border-[#F5A623]/30 text-[#F5A623] text-[11px] font-medium px-3 py-1.5 rounded-[8px] flex items-center gap-1.5 transition-colors"
                              title="Simulador de precificação (BASE + CMV + Lucro)"
                          >
                              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 3v18h18"/><path d="M7 12l4-4 4 4 5-5"/></svg>
                              Simular Preço
                          </button>

                          {/* BAH-037: Nova ficha modular (pizzas, combos) */}
                          <button
                              onClick={() => setModalFichaModular('new')}
                              className="bg-[#252527] hover:bg-[#333] border border-[#2A2A2C] text-white text-[11px] font-medium px-3 py-1.5 rounded-[8px] flex items-center gap-1.5 transition-colors"
                              title="Ficha modular pra pizzas, combos e produtos compostos"
                          >
                              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/></svg>
                              Nova Modular
                          </button>

                          <button
                              onClick={handleDownloadFichasTemplate}
                              className="text-[11px] font-medium text-[#F5A623] hover:text-[#E5961E] transition-colors flex items-center gap-1.5"
                          >
                              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
                              Baixar Modelo
                          </button>

                          <label className="bg-[#252527] hover:bg-[#333] border border-[#2A2A2C] text-white text-[11px] font-medium px-3 py-1.5 rounded-[8px] transition-colors cursor-pointer flex items-center gap-1.5">
                              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>
                              Importar
                              <input type="file" accept=".csv" onChange={handleImportFichas} hidden />
                          </label>
                      </div>
                  )}
              </div>
            </div>

            {/* Cards Grid with grey background — agora flex column com scroll interno e paginação sticky */}
            <div className="bg-[#1B1B1D] mx-4 mb-6 lg:mb-8 rounded-[16px] p-4 flex-1 lg:min-h-0 flex flex-col">
              {/* Search + Category Filter — fixo no topo do cards container */}
              {(() => {
                const items = activeTab === 'insumos' ? insumos : fichas;
                const defaultInsumoCats = ['Proteínas', 'Grãos', 'Vinhos', 'Molhos', 'Legumes', 'Temperos', 'Óleos', 'Laticínios', 'Insumo Pronto Preparado', 'Outros'];
                const defaultFichaCats = ['Prato Principal', 'Entrada', 'Sobremesa', 'Drinks, Coquetéis e Sucos', 'Acompanhamento'];
                const allCategories = activeTab === 'insumos'
                  ? (dashboardData.operational?.categories?.insumos || defaultInsumoCats)
                  : (dashboardData.operational?.categories?.fichas?.length
                      ? dashboardData.operational.categories.fichas
                      : defaultFichaCats);
                // Only show categories that have at least one item.
                // Fichas use the `type` field; insumos use `category`.
                const itemCatField = activeTab === 'insumos' ? 'category' : 'type';
                const usedCategories = allCategories.filter(cat =>
                  items.some(it => (it[itemCatField] || it.category || '').toLowerCase() === cat.toLowerCase())
                );

                return (
                  <div className="flex flex-col gap-3 mb-4 shrink-0">
                    {/* Search input */}
                    <div className="relative">
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" className="absolute left-3 top-1/2 -translate-y-1/2 text-[#868686]"><circle cx="11" cy="11" r="8" stroke="currentColor" strokeWidth="2"/><path d="M21 21l-4.35-4.35" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/></svg>
                      <input
                        type="text"
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        placeholder={`Buscar ${activeTab === 'insumos' ? 'insumo' : 'ficha'} por nome...`}
                        className="w-full bg-[#252527] border border-[#2A2A2C] rounded-[10px] pl-9 pr-9 py-2 text-[13px] text-white placeholder:text-[#555] outline-none focus:border-[#F5A623] transition-colors"
                      />
                      {searchTerm && (
                        <button
                          onClick={() => setSearchTerm('')}
                          className="absolute right-3 top-1/2 -translate-y-1/2 text-[#868686] hover:text-white transition-colors"
                          aria-label="Limpar busca"
                        >
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none"><path d="M18 6L6 18M6 6l12 12" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/></svg>
                        </button>
                      )}
                    </div>

                    {/* Category chips */}
                    {usedCategories.length > 0 && (
                      <div className="flex flex-wrap gap-1.5">
                        <button
                          onClick={() => setFilterCategory('all')}
                          className={`text-[11px] font-medium px-3 py-1.5 rounded-[8px] transition-colors ${
                            filterCategory === 'all'
                              ? 'bg-[#F5A623] text-black'
                              : 'bg-[#252527] text-[#868686] hover:bg-[#333] hover:text-white'
                          }`}
                        >
                          Todas
                        </button>
                        {usedCategories.map((cat) => (
                          <button
                            key={cat}
                            onClick={() => setFilterCategory(cat)}
                            className={`text-[11px] font-medium px-3 py-1.5 rounded-[8px] transition-colors ${
                              filterCategory === cat
                                ? 'bg-[#F5A623] text-black'
                                : 'bg-[#252527] text-[#868686] hover:bg-[#333] hover:text-white'
                            }`}
                          >
                            {cat}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })()}

              {activeTab === 'insumos' ? (() => {
                const filtered = insumos.filter((it) => {
                  const matchesSearch = searchTerm === '' || (it.name || '').toLowerCase().includes(searchTerm.toLowerCase());
                  const matchesCategory = filterCategory === 'all' || (it.category || '').toLowerCase() === filterCategory.toLowerCase();
                  return matchesSearch && matchesCategory;
                });
                const totalPages = Math.ceil(filtered.length / ITEMS_PER_PAGE);
                const page = Math.min(insumoPage, Math.max(0, totalPages - 1));
                const pageItems = filtered.slice(page * ITEMS_PER_PAGE, (page + 1) * ITEMS_PER_PAGE);
                return (
                  <>
                    <div className="flex-1 lg:min-h-0 lg:overflow-y-auto pr-1 -mr-1">
                      {filtered.length === 0 ? (
                        <EmptyState searchTerm={searchTerm} filterCategory={filterCategory} type="insumos" />
                      ) : (
                        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4 gap-4">
                          {pageItems.map((item) => (
                            <InsumoCard key={item.id} item={item} onClick={() => setEditingInsumo(item)} onDuplicate={handleDuplicateInsumo} onDelete={handleDeleteInsumo} />
                          ))}
                        </div>
                      )}
                    </div>
                    {totalPages > 1 && (
                      <div className="shrink-0">
                        <NumericPagination
                          page={page}
                          totalPages={totalPages}
                          onChange={setInsumoPage}
                          totalItems={filtered.length}
                        />
                      </div>
                    )}
                  </>
                );
              })() : (() => {
                const filtered = fichas.filter((it) => {
                  const matchesSearch = searchTerm === '' || (it.name || '').toLowerCase().includes(searchTerm.toLowerCase());
                  const fichaCat = (it.type || it.category || '').toLowerCase();
                  const matchesCategory = filterCategory === 'all' || fichaCat === filterCategory.toLowerCase();
                  return matchesSearch && matchesCategory;
                });
                const totalPages = Math.ceil(filtered.length / ITEMS_PER_PAGE);
                const page = Math.min(fichasPage, Math.max(0, totalPages - 1));
                const pageItems = filtered.slice(page * ITEMS_PER_PAGE, (page + 1) * ITEMS_PER_PAGE);
                return (
                  <>
                    <div className="flex-1 lg:min-h-0 lg:overflow-y-auto pr-1 -mr-1">
                      {filtered.length === 0 ? (
                        <EmptyState searchTerm={searchTerm} filterCategory={filterCategory} type="fichas" />
                      ) : (
                        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                          {pageItems.map((item) => (
                            <FichaTecnicaCard key={item.id} item={item} onClick={() => item.isModular ? setModalFichaModular(item) : setModalFicha(item)} onDuplicate={handleDuplicateFicha} onDelete={handleDeleteFicha} basePercent={dashboardData.breakEven?.base?.value || '0'} taxPercent={dashboardData.breakEven?.taxPercent || '0'} />
                          ))}
                        </div>
                      )}
                    </div>
                    {totalPages > 1 && (
                      <div className="shrink-0">
                        <NumericPagination
                          page={page}
                          totalPages={totalPages}
                          onChange={setFichasPage}
                          totalItems={filtered.length}
                        />
                      </div>
                    )}
                  </>
                );
              })()}
            </div>
          </div>

          {/* FAB Button — fica no canto inferior direito sem cobrir paginação */}
          <div className="fixed bottom-20 md:bottom-8 right-6 md:right-8 z-40">
            <button
              onClick={() => {
                if (activeTab === 'insumos') {
                  setEditingInsumo({}); // Empty object triggers "Create" mode
                } else {
                  setModalFicha('new');
                }
              }}
              title={activeTab === 'insumos' ? 'Novo insumo' : 'Nova ficha'}
              aria-label={activeTab === 'insumos' ? 'Novo insumo' : 'Nova ficha'}
              className="w-[52px] h-[52px] rounded-[14px] bg-[#F5A623] flex items-center justify-center shadow-lg hover:bg-[#E5961E] transition-colors hover:scale-105 active:scale-95"
            >
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
                <path d="M12 5V19M5 12H19" stroke="black" strokeWidth="2.5" strokeLinecap="round"/>
              </svg>
            </button>
          </div>
        </div>
      </div>

      {/* Modal */}
      {modalFicha && (
        <CriarFichaTecnicaModal
          onClose={() => setModalFicha(null)}
          editingFicha={modalFicha !== 'new' ? modalFicha : null}
          onSave={handleSaveFicha}
          onDelete={handleDeleteFicha}
          onSyncInsumo={handleSaveInsumo}
        />
      )}

      {/* Editar Insumo Modal */}
      {editingInsumo && (
        <EditarInsumoModal
          insumo={editingInsumo}
          onClose={() => setEditingInsumo(null)}
          onSave={handleSaveInsumo}
          onDelete={handleDeleteInsumo}
        />
      )}

      {/* Categories Modal */}
      {showCategoriesModal && (
        <CategoriesModal onClose={() => setShowCategoriesModal(false)} />
      )}

      {/* Simulador de Precificação (BAH-039) */}
      {showSimulador && (
        <SimuladorPrecificacao onClose={() => setShowSimulador(false)} />
      )}

      {/* Ficha Modular Modal (BAH-037) — pizza, combos, compostos */}
      {modalFichaModular && (
        <CriarFichaModularModal
          editingFicha={modalFichaModular !== 'new' ? modalFichaModular : null}
          onClose={() => setModalFichaModular(null)}
          onSave={handleSaveFicha}
          onDelete={handleDeleteFicha}
        />
      )}
    </div>
  );
};

export default FichaTecnica;
