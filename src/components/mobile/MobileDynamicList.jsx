import { useState } from 'react';
import MobileFieldInput from './MobileFieldInput';
import { calculateProLabore, calculateCLT, calculateDepreciation, parseCurrencyToNumber, formatMonthInput } from '../../utils/onboardingCalculations';

const MobileDynamicList = ({ question, items, onAdd, onRemove, onItemChange, globalData }) => {
  const [expandedIndex, setExpandedIndex] = useState(items.length > 0 ? 0 : -1);

  const getItemCost = (item) => {
    switch (question.calcType) {
      case 'pro_labore':
        return calculateProLabore(item.pro_labore);
      case 'clt_cost': {
        const { total } = calculateCLT(item.base_salary);
        const transport = (parseCurrencyToNumber(item.transport_value) * (parseFloat(item.transport_qty) || 0)) * (parseFloat(item.work_days) || 0);
        const food = parseCurrencyToNumber(item.food_cost) * (parseFloat(item.work_days) || 0);
        return total + transport + food;
      }
      case 'depreciation':
        return calculateDepreciation(item.value, item.lifespan || '5');
      case 'vehicle_cost': {
        const installment = parseCurrencyToNumber(item.installment);
        const insurance = parseCurrencyToNumber(item.insurance_annual) / 12;
        const ipva = parseCurrencyToNumber(item.ipva_annual) / 12;
        const maint = parseCurrencyToNumber(item.maintenance_monthly);
        return installment + insurance + ipva + maint;
      }
      default: {
        const val = parseCurrencyToNumber(item.value) || parseCurrencyToNumber(item.monthly_fee);
        return val;
      }
    }
  };

  const getItemLabel = (item, index) => {
    return item.name || item.provider || item.custom_provider || `${question.itemLabel} ${index + 1}`;
  };

  const handleFieldChange = (index, fieldId, value, type) => {
    // Format month input for revenue_history
    if (fieldId === 'month' && question.id === 'revenue_history') {
      value = formatMonthInput(value);
    }
    onItemChange(question.id, index, fieldId, value, type);
  };

  return (
    <div className="space-y-3">
      {items.map((item, index) => {
        const isExpanded = expandedIndex === index;
        const cost = getItemCost(item);
        const label = getItemLabel(item, index);

        return (
          <div key={index} className="bg-[#2A2A2C] rounded-[14px] overflow-hidden">
            {/* Accordion Header */}
            <div
              className="w-full flex items-center justify-between px-4 py-3.5 active:bg-[#333] cursor-pointer"
              onClick={() => setExpandedIndex(isExpanded ? -1 : index)}
            >
              <div className="flex items-center gap-3 min-w-0">
                <div className="w-8 h-8 rounded-full bg-[#333] flex items-center justify-center shrink-0">
                  <span className="text-[11px] font-bold text-[#868686]">{index + 1}</span>
                </div>
                <div className="min-w-0">
                  <div className="text-[13px] font-medium text-white truncate">{label}</div>
                  {cost > 0 && (
                    <div className="text-[11px] text-[#F5A623]">
                      R$ {cost.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}/mês
                    </div>
                  )}
                </div>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                {items.length > (question.minItems || 0) && (
                  <button
                    onClick={(e) => { e.stopPropagation(); onRemove(question.id, index); if (expandedIndex >= items.length - 1) setExpandedIndex(items.length - 2); }}
                    className="w-8 h-8 rounded-full bg-red-500/10 flex items-center justify-center"
                  >
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
                      <path d="M5 12h14" stroke="#ef4444" strokeWidth="2" strokeLinecap="round" />
                    </svg>
                  </button>
                )}
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" className={`transition-transform ${isExpanded ? 'rotate-180' : ''}`}>
                  <path d="M6 9l6 6 6-6" stroke="#868686" strokeWidth="2" strokeLinecap="round" />
                </svg>
              </div>
            </div>

            {/* Accordion Content */}
            {isExpanded && (
              <div className="px-4 pb-4 border-t border-white/5">
                <div className="pt-3">
                  {question.fields.map(field => (
                    <MobileFieldInput
                      key={field.id}
                      field={field}
                      value={item[field.id]}
                      onChange={(fieldId, val, type) => handleFieldChange(index, fieldId, val, type)}
                      allValues={item}
                      globalData={globalData}
                    />
                  ))}
                </div>

                {/* CLT Breakdown */}
                {question.calcType === 'clt_cost' && item.regime === 'CLT' && parseCurrencyToNumber(item.base_salary) > 0 && (
                  <CLTBreakdown salary={item.base_salary} />
                )}
              </div>
            )}
          </div>
        );
      })}

      {/* Add Button */}
      <button
        className="w-full min-h-[48px] flex items-center justify-center gap-2 bg-[#F5A623]/10 rounded-[14px] text-[#F5A623] text-[14px] font-medium active:bg-[#F5A623]/20"
        onClick={() => { onAdd(question.id); setExpandedIndex(items.length); }}
      >
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
          <path d="M12 5v14M5 12h14" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
        </svg>
        Adicionar {question.itemLabel}
      </button>
    </div>
  );
};

const CLTBreakdown = ({ salary }) => {
  const [open, setOpen] = useState(false);
  const { total, breakdown } = calculateCLT(salary);

  return (
    <div className="mt-2 bg-[#1D1D1D] rounded-[10px] overflow-hidden">
      <button
        className="w-full flex items-center justify-between px-3 py-2.5 active:bg-[#252525]"
        onClick={() => setOpen(!open)}
      >
        <span className="text-[11px] text-[#868686]">Custo Fantasma CLT</span>
        <span className="text-[12px] font-bold text-[#F5A623]">
          R$ {total.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
        </span>
      </button>
      {open && (
        <div className="px-3 pb-3 space-y-1">
          {breakdown.map(b => (
            <div key={b.item} className="flex justify-between text-[10px]">
              <span className="text-[#868686]">{b.comp}</span>
              <span className="text-white">R$ {b.val.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default MobileDynamicList;
