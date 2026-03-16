/* eslint-disable react-refresh/only-export-components */
import React, { useState } from 'react';

// ============ DATA ============
export const parseSafeNumber = (val) => {
    if (typeof val === 'number') return val;
    if (!val && val !== 0) return 0;
    let str = String(val).replace(/R\$/g, '').trim();
    if (str.includes(',') && str.includes('.')) str = str.replace(/\./g, '').replace(',', '.');
    else if (str.includes(',')) str = str.replace(',', '.');
    return parseFloat(str) || 0;
};
// Constants moved to DashboardContext


// ============ CARD: Ficha Técnica ============
const FichaTecnicaCard = ({ item, onClick, basePercent }) => {
  const pv = parseSafeNumber(item.precoVenda);
  const cmv = parseSafeNumber(item.custoTotal);
  const base = parseSafeNumber(basePercent) / 100;
  const lucroLiqPct = pv > 0 ? (((pv - (pv * base)) - cmv) / pv) * 100 : null;
  const lucroLiqRS = pv > 0 ? ((pv - (pv * base)) - cmv) : null;
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
        <div>
          <div className="font-semibold text-[13px] text-white">{item.name}</div>
          <div className="text-[10px] text-[#868686]">{item.type}</div>
        </div>
      </div>
      {pv > 0 && lucroLiqPct !== null && (
        <div
          className="relative"
          onMouseEnter={() => setShowTooltip(true)}
          onMouseLeave={() => setShowTooltip(false)}
        >
          <div className={`text-[11px] font-semibold px-2.5 py-1 rounded-full ${
            lucroLiqPct > 0 ? 'bg-[#00B37E]/15 text-[#00B37E]' : 'bg-[#FF4560]/15 text-[#FF4560]'
          }`}>
            {lucroLiqPct.toFixed(1)}%
          </div>
          {showTooltip && (
            <div className="absolute right-0 top-full mt-1 bg-[#252527] border border-[#333] rounded-lg px-3 py-2 z-50 whitespace-nowrap shadow-lg">
              <div className="text-[10px] text-[#868686]">Lucro Líquido Estimado</div>
              <div className={`text-[12px] font-bold ${lucroLiqRS > 0 ? 'text-[#00B37E]' : 'text-[#FF4560]'}`}>
                R$ {lucroLiqRS.toFixed(2).replace('.', ',')}
              </div>
              <div className="text-[9px] text-[#555] mt-0.5">Base: {parseSafeNumber(basePercent).toFixed(0)}% | CMV: R$ {cmv.toFixed(2).replace('.', ',')}</div>
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
        <span className="text-[11px] text-[#868686]">{item.insumos} Insumos</span>
      </div>
      <button
        onClick={(e) => { e.stopPropagation(); onClick && onClick(); }}
        className="flex items-center gap-1 text-[11px] text-white font-medium hover:text-[#F5A623] transition-colors"
      >
        Adicionar
        <svg width="10" height="10" viewBox="0 0 16 16" fill="none">
          <path d="M4 12L12 4M12 4H6M12 4V10" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
        </svg>
      </button>
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
    </div>
  </div>
  );
};

// ============ CARD: Insumo ============
const InsumoCard = ({ item, onClick }) => (
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
        <div>
          <div className="font-semibold text-[13px] text-white">{item.name}</div>
          <div className="text-[10px] text-[#868686]">{item.category}</div>
        </div>
      </div>
      <div className="bg-[#2A2A2C] text-[#868686] text-[10px] font-medium px-2.5 py-1 rounded-full border border-[#3A3A3C]">
        Insumo
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
        <span className="text-white font-medium">{item.custo}</span>
      </div>
    </div>
  </div>
);

// ============ MODAL: Editar/Criar Insumo ============
const EditarInsumoModal = ({ insumo, onClose, onSave, onDelete }) => {
  const isEditing = !!insumo.id;
  const [nome, setNome] = useState(insumo.name || '');
  const [categoria, setCategoria] = useState(insumo.category || 'Proteínas');
  
  // Safe parsing for creation vs edit
  const safeRendimento = insumo.rendimento || '0gr';
  const qty = safeRendimento.replace(/[^0-9.,]/g, '');
  const unitMatch = safeRendimento.replace(/[0-9.,]/g, '') || 'gr';

  const [quantidade, setQuantidade] = useState(insumo.qty || insumo.defaultQty || qty || '');
  const [unit, setUnit] = useState(insumo.unit || unitMatch || 'gr');

  const safeCusto = insumo.custo || '0,00';
  const [custo, setCusto] = useState(safeCusto.replace(/R\$\s?/g, '').trim());

  const { dashboardData } = useDashboard();
  const categoryOptions = dashboardData.operational?.categories?.insumos || ['Proteínas', 'Grãos', 'Vinhos', 'Molhos', 'Legumes', 'Temperos', 'Óleos', 'Laticínios', 'Insumo Pronto Preparado', 'Outros'];

  // Custo unitário simples (sem FC)
  const numericCusto = parseSafeNumber(custo);
  const numericQtd = parseSafeNumber(quantidade);
  const unitPrice = numericQtd > 0 ? (numericCusto / numericQtd) : 0;

  const handleSave = () => {
    if (!nome.trim()) return;
    onSave({
      ...insumo,
      id: insumo.id || Date.now().toString(),
      name: nome,
      category: categoria,
      qty: quantidade,
      unit: unit,
      rendimento: `${quantidade}${unit}`,
      custo: `R$ ${custo}`,
      defaultQty: quantidade,
      grossQty: quantidade,
    });
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-[95vw] sm:w-[90vw] max-w-[480px] max-h-[90vh] overflow-y-auto bg-[#1B1B1D] rounded-[20px] p-5 sm:p-8 shadow-2xl border border-[#2A2A2C]">
        {/* Header */}
        <div className="flex items-start justify-between mb-6 sm:mb-8">
          <div>
            <h2 className="text-[20px] font-bold text-white">{isEditing ? 'Editar Insumo' : 'Criar Insumo'}</h2>
            <p className="text-[12px] text-[#868686] mt-1">{isEditing ? 'Atualize os dados do insumo' : 'Cadastre um novo insumo'}</p>
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
        <div className="flex flex-col gap-5">
          {/* Nome */}
          <div>
            <label className="block text-[12px] text-[#868686] mb-2">Nome</label>
            <input
              type="text"
              value={nome}
              onChange={(e) => setNome(e.target.value)}
              className="w-full bg-[#252527] border border-[#2A2A2C] rounded-[12px] px-4 py-3.5 text-[14px] text-white outline-none focus:border-[#F5A623] transition-colors"
              placeholder="Ex: Peito de Frango"
            />
          </div>

          {/* Categoria */}
          <div>
            <label className="block text-[12px] text-[#868686] mb-2">Categoria</label>
            <div className="relative">
              <select
                value={categoria}
                onChange={(e) => setCategoria(e.target.value)}
                className="w-full bg-[#252527] border border-[#2A2A2C] rounded-[12px] px-4 py-3.5 text-[14px] text-white outline-none focus:border-[#F5A623] transition-colors appearance-none cursor-pointer"
              >
                {categoryOptions.map(c => (
                  <option key={c} value={c} className="bg-[#1B1B1D] text-white">{c}</option>
                ))}
              </select>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" className="absolute right-4 top-1/2 -translate-y-1/2 pointer-events-none">
                 <path d="M6 9L12 15L18 9" stroke="#868686" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            </div>
          </div>

          {/* Unit + Custo */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-[12px] text-[#868686] mb-2">Unidade</label>
              <div className="relative bg-[#252527] border border-[#2A2A2C] rounded-[12px] overflow-hidden focus-within:border-[#F5A623] transition-colors">
                <select
                  value={unit}
                  onChange={(e) => setUnit(e.target.value)}
                  className="w-full bg-transparent px-4 py-3.5 text-[14px] text-white outline-none appearance-none cursor-pointer"
                >
                  <option value="gr" className="bg-[#1B1B1D] text-white">Gramas (gr)</option>
                  <option value="ml" className="bg-[#1B1B1D] text-white">Mililitros (ml)</option>
                  <option value="un" className="bg-[#1B1B1D] text-white">Unidade (un)</option>
                  <option value="kg" className="bg-[#1B1B1D] text-white">Quilogramas (kg)</option>
                </select>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" className="absolute right-4 top-1/2 -translate-y-1/2 pointer-events-none">
                   <path d="M6 9L12 15L18 9" stroke="#868686" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
              </div>
            </div>
            <div>
              <label className="block text-[12px] text-[#868686] mb-2">Custo de Compra</label>
              <div className="flex items-center bg-[#252527] border border-[#2A2A2C] rounded-[12px] overflow-hidden focus-within:border-[#F5A623] transition-colors">
                <span className="text-[13px] text-[#868686] pl-4 shrink-0">R$</span>
                <input
                  type="text"
                  value={custo}
                  onChange={(e) => setCusto(e.target.value)}
                  className="flex-1 bg-transparent px-2 py-3.5 text-[14px] text-white outline-none"
                  placeholder="0,00"
                />
              </div>
            </div>
          </div>

          {/* Quantidade */}
          <div>
            <label className="block text-[12px] text-[#868686] mb-2">Quantidade Comprada</label>
            <div className="flex items-center bg-[#252527] border border-[#2A2A2C] rounded-[12px] overflow-hidden focus-within:border-[#F5A623] transition-colors">
              <input
                type="text"
                value={quantidade}
                onChange={(e) => setQuantidade(e.target.value)}
                className="flex-1 bg-transparent px-4 py-3.5 text-[14px] text-white outline-none"
                placeholder="Ex: 1000"
              />
              <span className="text-[13px] text-[#868686] pr-4 shrink-0">{unit}</span>
            </div>
          </div>

          {/* Custo unitário */}
          {unitPrice > 0 && (
            <div className="bg-[#252527] rounded-[12px] p-4 border border-[#2A2A2C]">
              <div className="flex items-center justify-between">
                <div className="text-[11px] text-[#868686]">Custo Unitário</div>
                <div className="text-[12px] font-semibold text-white">
                  R$ {unitPrice.toFixed(4).replace('.', ',')} <span className="text-[#868686] font-normal text-[10px]">/ {unit}</span>
                </div>
              </div>
            </div>
          )}
          
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between mt-6 sm:mt-8 pt-4">
          <button onClick={onClose} className="text-[13px] sm:text-[14px] text-[#F5A623] font-medium hover:text-[#E5961E] transition-colors">
            Cancelar
          </button>
          <button onClick={handleSave} className="bg-[#F5A623] text-black font-semibold text-[13px] sm:text-[14px] px-6 sm:px-8 py-3 sm:py-3.5 rounded-[12px] hover:bg-[#E5961E] transition-colors">
            {isEditing ? 'Atualizar Insumo' : 'Salvar Insumo'}
          </button>
        </div>
      </div>
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
  
  const fichaCategoryOptions = dashboardData.operational?.categories?.fichas || ['Prato Principal', 'Entrada', 'Sobremesa', 'Drinks, Coquetéis e Sucos', 'Acompanhamento'];
  const insumoCategoryOptions = dashboardData.operational?.categories?.insumos || ['Proteínas', 'Grãos', 'Vinhos', 'Molhos', 'Legumes', 'Temperos', 'Óleos', 'Laticínios', 'Insumo Pronto Preparado', 'Outros'];
  const availableInsumos = dashboardData.operational?.insumos || [];

  const [categoria, setCategoria] = useState(editingFicha ? editingFicha.type : fichaCategoryOptions[0]);
  const [rendimento, setRendimento] = useState(editingFicha ? editingFicha.rendimento.replace(/[^0-9]/g, '') : '200');
  const [custoEmbalagem, setCustoEmbalagem] = useState(editingFicha ? editingFicha.custoEmbalagem.replace('R$', '') : '');
  
  // Sales & Price Fields (Integration with Menu Engineering)
  const [precoVenda, setPrecoVenda] = useState(editingFicha?.precoVenda || '');
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
      return editingFicha.ingredients || [];
    }
    return [];
  });
  const [showNewInsumoForm, setShowNewInsumoForm] = useState(false);
  const [newInsumo, setNewInsumo] = useState({ name: '', category: insumoCategoryOptions[0], qty: '200', grossQty: '', unit: 'gr', price: '' });

  const calculatedInsumoCost = addedInsumos.reduce((sum, i) => {
      const totalPricePB = parseSafeNumber(i.price);
      const pb = parseSafeNumber(i.grossQty || i.defaultQty || 1) || 1;
      const unitCost = totalPricePB / pb;
      const requiredQty = parseSafeNumber(i.qty);
      return sum + (requiredQty * unitCost);
  }, 0);

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
    (searchInsumo === '' || i.name.toLowerCase().includes(searchInsumo.toLowerCase()) || i.category.toLowerCase().includes(searchInsumo.toLowerCase()))
  );

  const handleAddInsumo = (insumo) => {
    // When adding existing insumo, assume PB=PL and FC=1 for now unless defined
    setAddedInsumos(prev => [...prev, { 
        ...insumo, 
        qty: insumo.defaultQty,
        netQty: insumo.defaultQty,
        grossQty: insumo.defaultQty,
        fc: '1.00'
    }]);
  };

  const handleRemoveInsumo = (id) => {
    setAddedInsumos(prev => prev.filter(i => i.id !== id));
  };

  const handleCreateNewInsumo = () => {
    if (!newInsumo.name.trim() || !newInsumo.price.trim()) return;
    
    // Parse values
    const netQty = parseSafeNumber(newInsumo.qty);
    const grossQty = parseSafeNumber(newInsumo.grossQty || newInsumo.qty) || netQty;
    const unitPrice = parseSafeNumber(newInsumo.price);
    
    // Calculate FC
    const fc = netQty > 0 ? (grossQty / netQty).toFixed(2) : '1.00';

    const created = {
      id: `new_${Date.now()}`,
      name: newInsumo.name,
      category: newInsumo.category,
      defaultQty: newInsumo.qty,
      
      // Store metrics
      qty: newInsumo.qty, 
      netQty: newInsumo.qty,
      grossQty: grossQty.toString().replace('.', ','),
      fc: fc,
      
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

    setNewInsumo({ name: '', category: insumoCategoryOptions[0], qty: '200', grossQty: '', unit: 'gr', price: '' });
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

      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={onClose} />

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
                                    <button 
                                        onClick={() => setFotoPrato(null)}
                                        className="absolute top-2 right-2 bg-black/50 p-1 rounded-full text-white hover:bg-red-500 transition-colors"
                                    >
                                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 6L6 18M6 6L18 18"/></svg>
                                    </button>
                                 </>
                             ) : (
                                 <>
                                    <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#555" strokeWidth="1.5" className="mb-2">
                                        <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
                                        <circle cx="8.5" cy="8.5" r="1.5" />
                                        <polyline points="21 15 16 10 5 21" />
                                    </svg>
                                    <span className="text-[12px] text-[#555]">Clique para adicionar foto</span>
                                    {/* Hidden File Input Simulation */}
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
                        {addedInsumos.map((insumo) => (
                          <div key={insumo.id} className="bg-[#1E1E1E] rounded-[14px] p-3.5 flex items-center gap-3 border border-[#2A2A2C] cursor-pointer hover:border-[#F5A623]/30 transition-colors group" onClick={() => handleRemoveInsumo(insumo.id)}>
                            <div className="w-[38px] h-[38px] rounded-[10px] bg-[#252527] flex items-center justify-center shrink-0">
                              <svg width="16" height="16" viewBox="0 0 24 24" fill="none"><path d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" stroke="#868686" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg>
                            </div>
                            <div className="flex-1 min-w-0">
                              <div className="font-medium text-[13px] text-white">{insumo.name}</div>
                              <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] text-[#868686]">
                                  <span>Qtd: <span className="font-medium text-white">{insumo.qty}{insumo.unit}</span></span>
                                  <span className="w-1 h-1 rounded-full bg-[#555]" />
                                  <span className="text-[#00B37E]">
                                    Custo: R$ {((parseSafeNumber(insumo.price) / (parseSafeNumber(insumo.grossQty || insumo.defaultQty || 1) || 1)) * parseSafeNumber(insumo.qty)).toFixed(2)}
                                  </span>
                              </div>
                            </div>
                            <div className="bg-[#F5A623] text-black text-[10px] font-semibold px-3 py-1.5 rounded-full flex items-center gap-1 shrink-0 group-hover:bg-red-500 group-hover:text-white transition-colors">
                              <span className="group-hover:hidden">Adicionado</span>
                              <span className="hidden group-hover:inline">Remover</span>
                            </div>
                          </div>
                        ))}
                        <div className="w-full h-px bg-[#2A2A2C] my-2" />
                      </>
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
                            <div className="text-[11px] text-[#555]">R$ {insumo.price}</div>
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
                                
                                {/* Net Quantity (PL) */}
                                <div>
                                    <label className="text-[10px] text-[#868686] mb-1 block">Qtd Líquida/Útil (PL)</label>
                                    <div className="flex items-center bg-[#1E1E1E] border border-[#2A2A2C] rounded-[10px] overflow-hidden">
                                        <input type="text" placeholder="100" value={newInsumo.qty} onChange={(e) => setNewInsumo(p => ({ ...p, qty: e.target.value }))} className="w-full bg-transparent px-3 py-2 text-[12px] text-white outline-none" />
                                    </div>
                                </div>

                                {/* Gross Quantity (PB) */}
                                <div>
                                    <label className="text-[10px] text-[#868686] mb-1 block">Qtd Bruta (PB)</label>
                                    <div className="flex items-center bg-[#1E1E1E] border border-[#2A2A2C] rounded-[10px] overflow-hidden">
                                        <input type="text" placeholder="120" value={newInsumo.grossQty || ''} onChange={(e) => setNewInsumo(p => ({ ...p, grossQty: e.target.value }))} className="w-full bg-transparent px-3 py-2 text-[12px] text-white outline-none" />
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
                                
                                {/* Price (Total for Gross Qty) */}
                                <div>
                                    <label className="text-[10px] text-[#868686] mb-1 block">Custo Total (PB)</label>
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

// ... (keep Modals and sub-components as is)

// ============ MAIN COMPONENT ============
const FichaTecnica = () => {
  const { dashboardData, updateDashboardData } = useDashboard();
  const [activeTab, setActiveTab] = useState('insumos');
  const [modalFicha, setModalFicha] = useState(null);
  
  // Use Context Data with fallback
  const fichas = dashboardData.operational?.fichas || [];
  const insumos = dashboardData.operational?.insumos || [];
  
  const [editingInsumo, setEditingInsumo] = useState(null);
  const [showCategoriesModal, setShowCategoriesModal] = useState(false);

  const handleSaveFicha = (fichaData, isEditing) => {
    let newFichas;
    if (isEditing) {
      newFichas = fichas.map(f => f.id === fichaData.id ? fichaData : f);
    } else {
      newFichas = [...fichas, fichaData];
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
    let newInsumos;
    const exists = insumos.some(i => i.id === updatedInsumo.id);

    if (exists) {
      newInsumos = insumos.map(i => i.id === updatedInsumo.id ? updatedInsumo : i);
    } else {
      newInsumos = [...insumos, updatedInsumo];
    }

    const updatePayload = {
        operational: {
            ...dashboardData.operational,
            insumos: newInsumos
        }
    };

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

      // Add "Insumo Pronto Preparado" to fichas categories if not present
      const fichaCategories = [...(updatePayload.operational.categories?.fichas || [])];
      if (!fichaCategories.includes('Insumo Pronto Preparado')) {
        fichaCategories.push('Insumo Pronto Preparado');
        updatePayload.operational.categories = {
          ...updatePayload.operational.categories,
          fichas: fichaCategories
        };
      }

      updatePayload.operational.fichas = [...(dashboardData.operational?.fichas || []), autoFicha];
    }

    updateDashboardData(updatePayload);
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
        for (let i = 1; i < lines.length; i++) {
            const line = lines[i].trim();
            if (!line) continue;
            const separator = line.includes(';') ? ';' : ',';
            const cols = line.split(separator);
            if (cols.length >= 4) {
                const name = cols[0].trim();
                const cat = cols[1].trim();
                const cmv = parseSafeNumber(cols[2].trim());
                const price = parseSafeNumber(cols[3].trim());
                
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
                    vendasMes: "0",
                    isImported: true, // Flag to indicate manual CMV
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
    <div className="flex flex-col w-full h-full min-h-screen bg-[#101010] font-jakarta text-white">

      {/* TOP AREA: Left Panel + Right Content */}
      <div className="flex flex-col lg:flex-row flex-1">

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
        <div className="flex-1 flex flex-col min-w-0">

          {/* Content Area */}
          <div className="flex-1 overflow-y-auto">
            {/* Breadcrumb + Title + Actions */}
            <div className="px-6 pt-6 pb-4">
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

            {/* Cards Grid with grey background */}
            <div className="bg-[#1B1B1D] mx-4 rounded-[16px] p-4 flex-1">
              {activeTab === 'insumos' ? (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                  {insumos.map((item) => (
                    <InsumoCard key={item.id} item={item} onClick={() => setEditingInsumo(item)} />
                  ))}
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                  {fichas.map((item) => (
                    <FichaTecnicaCard key={item.id} item={item} onClick={() => setModalFicha(item)} basePercent={dashboardData.breakEven?.base?.value || '0'} />
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* FAB Button */}
          <div className="fixed bottom-20 md:bottom-8 right-6 md:right-auto md:left-[60%] z-40">
            <button
              onClick={() => {
                if (activeTab === 'insumos') {
                  setEditingInsumo({}); // Empty object triggers "Create" mode
                } else {
                  setModalFicha('new');
                }
              }}
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
    </div>
  );
};

export default FichaTecnica;
