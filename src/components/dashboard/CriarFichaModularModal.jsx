/**
 * CriarFichaModularModal — Fichas tecnicas MODULARES para Pizzas, Combos e produtos compostos
 * BAH-037
 *
 * Estrutura de dados salvada em fichas[]:
 * {
 *   id, name, category, isModular: true,
 *   modules: [
 *     { id, name, required, options: [
 *       { id, name, custo, default }
 *     ]}
 *   ],
 *   custoTotal: <soma dos defaults>,
 *   custoMin: <melhor combinacao mais barata possivel>,
 *   custoMax: <pior combinacao mais cara possivel>,
 *   precoVenda
 * }
 */

import { useState, useEffect, useMemo } from 'react';
import { useDashboard } from '../../context/DashboardContext';

const fmtBRL = (n) => (n || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

// IDs unicos curtos
const newId = (prefix) => `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).substr(2, 5)}`;

// Parse "R$ 4,05" / "4,05" / "4.05" / 4.05 -> 4.05
const parseCusto = (val) => {
  if (typeof val === 'number') return val;
  if (!val) return 0;
  let str = String(val).replace(/R\$/g, '').trim();
  if (str.includes(',') && str.includes('.')) str = str.replace(/\./g, '').replace(',', '.');
  else if (str.includes(',')) str = str.replace(',', '.');
  return parseFloat(str) || 0;
};

/**
 * Custo efetivo de uma opção: se vinculada a uma ficha existente,
 * lê o custo dela em tempo real (atualiza sozinho se a ficha-mae mudar).
 * Caso contrario usa o custo digitado manualmente.
 */
const getCustoFromOption = (opt, availableFichas) => {
  if (opt.linkedFichaId) {
    const ficha = (availableFichas || []).find(f => String(f.id) === String(opt.linkedFichaId));
    return ficha ? parseCusto(ficha.custoTotal) : 0;
  }
  return parseCusto(opt.custo);
};

// Calcula min/max/default de uma lista de modulos
const calcCustosFromModules = (modules, availableFichas) => {
  let custoDefault = 0, custoMin = 0, custoMax = 0;
  modules.forEach(mod => {
    const opts = mod.options || [];
    // Anota cada opção com seu custo efetivo (vinculada ou manual)
    const enriched = opts.map(o => ({ ...o, _custo: getCustoFromOption(o, availableFichas) }));
    // Válidas: vinculadas (linkedFichaId) ou com nome digitado
    const valid = enriched.filter(o => o.linkedFichaId || (o.name && String(o.name).trim()));
    if (valid.length === 0) return;
    const def = valid.find(o => o.default) || valid[0];
    custoDefault += def._custo || 0;
    if (mod.required) {
      // required: tem que pegar pelo menos uma — min e o mais barato
      const costs = valid.map(o => o._custo || 0);
      custoMin += Math.min(...costs);
      custoMax += Math.max(...costs);
    } else {
      // opcional: min pode ser 0 (nao escolhe), max pega o mais caro
      const max = Math.max(...valid.map(o => o._custo || 0), 0);
      custoMax += max;
    }
  });
  return { custoDefault, custoMin, custoMax };
};

const CriarFichaModularModal = ({ onClose, editingFicha = null, onSave, onDelete }) => {
  const { dashboardData } = useDashboard();
  const isEditing = !!editingFicha;

  // Merge defaults + customs — `||` antigo perdia defaults quando havia
  // 1 custom (bug Djefeline 29/05/2026).
  const DEFAULT_FICHA_CATS = ['Prato Principal', 'Entrada', 'Sobremesa', 'Drinks, Coquetéis e Sucos', 'Acompanhamento'];
  const customFichaCats = dashboardData.operational?.categories?.fichas || [];
  const fichaCategorias = Array.from(new Set([...DEFAULT_FICHA_CATS, ...customFichaCats])).filter(c => c !== 'Insumo Pronto Preparado');

  // Fichas técnicas vinculáveis: não-modulares com custo > 0, excluindo
  // a propria ficha em edicao (evita auto-referencia).
  const availableFichas = useMemo(() => {
    const all = dashboardData.operational?.fichas || [];
    return all
      .filter(f => !f.isModular && parseCusto(f.custoTotal) > 0)
      .filter(f => !editingFicha || String(f.id) !== String(editingFicha.id))
      .sort((a, b) => (a.name || '').localeCompare(b.name || ''));
  }, [dashboardData.operational?.fichas, editingFicha]);

  const [name, setName] = useState(editingFicha?.name || '');
  const [category, setCategory] = useState(editingFicha?.category || fichaCategorias[0] || 'Prato Principal');
  const [precoVenda, setPrecoVenda] = useState(editingFicha?.precoVenda || '');
  const [modules, setModules] = useState(
    editingFicha?.modules || [
      // template inicial: Pizza
      {
        id: newId('mod'), name: 'Tamanho', required: true,
        options: [
          { id: newId('opt'), name: 'Pequena', custo: '', default: true },
          { id: newId('opt'), name: 'Média', custo: '', default: false },
          { id: newId('opt'), name: 'Grande', custo: '', default: false },
        ]
      },
      {
        id: newId('mod'), name: 'Sabor', required: true,
        options: [
          { id: newId('opt'), name: 'Calabresa', custo: '', default: true },
        ]
      }
    ]
  );

  // Adicionar/remover modulo
  const addModule = () => {
    setModules(prev => [...prev, {
      id: newId('mod'),
      name: `Módulo ${prev.length + 1}`,
      required: true,
      options: [{ id: newId('opt'), name: '', custo: '', default: true }]
    }]);
  };
  const removeModule = (modId) => setModules(prev => prev.filter(m => m.id !== modId));
  const updateModule = (modId, field, value) => setModules(prev => prev.map(m => m.id === modId ? { ...m, [field]: value } : m));

  // Adicionar/remover opcao
  const addOption = (modId) => {
    setModules(prev => prev.map(m => m.id === modId ? {
      ...m,
      options: [...m.options, { id: newId('opt'), name: '', custo: '', default: m.options.length === 0 }]
    } : m));
  };
  const removeOption = (modId, optId) => {
    setModules(prev => prev.map(m => {
      if (m.id !== modId) return m;
      const newOptions = m.options.filter(o => o.id !== optId);
      // se removeu o default, marca o primeiro
      if (!newOptions.some(o => o.default) && newOptions.length > 0) {
        newOptions[0] = { ...newOptions[0], default: true };
      }
      return { ...m, options: newOptions };
    }));
  };
  const updateOption = (modId, optId, field, value) => {
    setModules(prev => prev.map(m => {
      if (m.id !== modId) return m;
      // Se marcando default, desmarcar os outros
      if (field === 'default' && value === true) {
        return { ...m, options: m.options.map(o => ({ ...o, default: o.id === optId })) };
      }
      return { ...m, options: m.options.map(o => o.id === optId ? { ...o, [field]: value } : o) };
    }));
  };

  // Vincula uma opcao a uma ficha existente — pre-preenche nome e zera custo manual
  const linkOptionToFicha = (modId, optId, fichaId) => {
    const ficha = availableFichas.find(f => String(f.id) === String(fichaId));
    if (!ficha) return;
    setModules(prev => prev.map(m => {
      if (m.id !== modId) return m;
      return {
        ...m,
        options: m.options.map(o => o.id === optId
          ? { ...o, linkedFichaId: ficha.id, name: ficha.name, custo: '' }
          : o)
      };
    }));
  };

  // Desvincula — volta pra modo manual, mantem nome atual
  const unlinkOption = (modId, optId) => {
    setModules(prev => prev.map(m => {
      if (m.id !== modId) return m;
      return {
        ...m,
        options: m.options.map(o => o.id === optId
          ? { ...o, linkedFichaId: null }
          : o)
      };
    }));
  };

  // Calculos derivados
  const custos = useMemo(() => calcCustosFromModules(modules, availableFichas), [modules, availableFichas]);

  const handleSave = () => {
    if (!name.trim()) {
      alert('Dê um nome pra ficha');
      return;
    }
    const validModules = modules.filter(m => m.options && m.options.length > 0 && m.options.some(o => o.name.trim()));
    if (validModules.length === 0) {
      alert('Adicione pelo menos um módulo com uma opção válida');
      return;
    }

    const ficha = {
      id: editingFicha?.id || newId('ft'),
      name: name.trim(),
      category,
      isModular: true,
      modules: validModules.map(m => ({
        ...m,
        options: m.options
          .filter(o => o.name.trim())
          .map(o => ({ ...o, custo: parseFloat(String(o.custo).replace(',', '.')) || 0 }))
      })),
      ingredients: [], // modular nao usa ingredientes diretos
      custoTotal: custos.custoDefault.toFixed(2).replace('.', ','),
      custoMin: custos.custoMin.toFixed(2).replace('.', ','),
      custoMax: custos.custoMax.toFixed(2).replace('.', ','),
      precoVenda: precoVenda || '',
      lastUpdated: Date.now(),
      // createdAt: só na criação; na edição preserva o valor existente
      // (null se for ficha legada criada antes deste campo).
      createdAt: isEditing ? (editingFicha?.createdAt ?? null) : Date.now(),
    };
    onSave(ficha, isEditing);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-[70] flex items-end md:items-center justify-center bg-black/60 backdrop-blur-sm p-0 md:p-4" onClick={onClose}>
      <div
        className="w-full max-w-3xl bg-[#1B1B1D] border border-[#2F2F31] rounded-t-[24px] md:rounded-[24px] flex flex-col max-h-[95vh]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-start justify-between p-5 pb-3 border-b border-[#2A2A2C] shrink-0">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <span className="px-2 py-0.5 bg-[#F5A623]/15 text-[#F5A623] text-[9px] font-bold rounded uppercase tracking-wider">Modular</span>
              <h2 className="text-[16px] font-bold text-white">{isEditing ? 'Editar' : 'Nova'} Ficha Modular</h2>
            </div>
            <p className="text-[11px] text-[#868686]">Pra pizzas, combos e produtos com variações (tamanho, sabor, borda...)</p>
          </div>
          <button onClick={onClose} className="w-8 h-8 flex items-center justify-center rounded-full bg-[#2A2A2C] hover:bg-[#333] transition-colors shrink-0" aria-label="Fechar">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none">
              <path d="M18 6L6 18M6 6l12 12" stroke="#868686" strokeWidth="2" strokeLinecap="round"/>
            </svg>
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-5 flex flex-col gap-4">
          {/* Nome + Categoria + Preço */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div>
              <label className="text-[10px] text-[#868686] uppercase tracking-wider font-semibold block mb-1.5">Nome do produto</label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Ex: Pizza, Combo Burguer..."
                className="w-full bg-[#252527] border border-[#2A2A2C] rounded-[10px] px-3 py-2 text-[13px] text-white placeholder:text-[#555] outline-none focus:border-[#F5A623]"
              />
            </div>
            <div>
              <label className="text-[10px] text-[#868686] uppercase tracking-wider font-semibold block mb-1.5">Categoria</label>
              <select
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                className="w-full bg-[#252527] border border-[#2A2A2C] rounded-[10px] px-3 py-2 text-[13px] text-white outline-none focus:border-[#F5A623]"
              >
                {fichaCategorias.map((c) => (
                  <option key={c} value={c} className="bg-[#1B1B1D]">{c}</option>
                ))}
              </select>
            </div>
          </div>

          <div>
            <label className="text-[10px] text-[#868686] uppercase tracking-wider font-semibold block mb-1.5">Preço de venda base (combinação padrão)</label>
            <input
              type="text"
              value={precoVenda}
              onChange={(e) => setPrecoVenda(e.target.value)}
              placeholder="R$ 0,00"
              className="w-full md:w-1/2 bg-[#252527] border border-[#2A2A2C] rounded-[10px] px-3 py-2 text-[13px] text-white placeholder:text-[#555] outline-none focus:border-[#F5A623]"
            />
          </div>

          {/* Resumo de custos calculados */}
          <div className="grid grid-cols-3 gap-2 p-3 bg-[#161616] border border-[#2A2A2C] rounded-[10px]">
            <div>
              <div className="text-[9px] text-[#7E7E7E] uppercase mb-0.5">Custo mín</div>
              <div className="text-[14px] font-bold text-[#00B37E]">{fmtBRL(custos.custoMin)}</div>
            </div>
            <div>
              <div className="text-[9px] text-[#7E7E7E] uppercase mb-0.5">Padrão</div>
              <div className="text-[14px] font-bold text-[#F5A623]">{fmtBRL(custos.custoDefault)}</div>
            </div>
            <div>
              <div className="text-[9px] text-[#7E7E7E] uppercase mb-0.5">Custo máx</div>
              <div className="text-[14px] font-bold text-[#FF8A9C]">{fmtBRL(custos.custoMax)}</div>
            </div>
          </div>

          {/* Módulos */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-[12px] font-semibold text-white">Módulos do produto</h3>
              <button
                onClick={addModule}
                className="text-[11px] font-medium text-[#F5A623] hover:text-[#E5961E] flex items-center gap-1"
              >
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none"><path d="M12 5v14M5 12h14" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/></svg>
                Adicionar módulo
              </button>
            </div>

            <div className="flex flex-col gap-3">
              {modules.map((mod) => (
                <div key={mod.id} className="bg-[#161616] border border-[#2A2A2C] rounded-[12px] p-3">
                  {/* Header do modulo: nome + required + delete */}
                  <div className="flex items-center gap-2 mb-3">
                    <input
                      type="text"
                      value={mod.name}
                      onChange={(e) => updateModule(mod.id, 'name', e.target.value)}
                      placeholder="Nome do módulo (ex: Tamanho)"
                      className="flex-1 bg-[#252527] border border-[#2A2A2C] rounded-[8px] px-2.5 py-1.5 text-[12px] text-white font-semibold outline-none focus:border-[#F5A623]"
                    />
                    <label className="flex items-center gap-1.5 text-[10px] text-[#868686] cursor-pointer">
                      <input
                        type="checkbox"
                        checked={mod.required}
                        onChange={(e) => updateModule(mod.id, 'required', e.target.checked)}
                        className="accent-[#F5A623]"
                      />
                      Obrigatório
                    </label>
                    <button
                      onClick={() => removeModule(mod.id)}
                      className="w-6 h-6 rounded-[6px] bg-[#252527] hover:bg-red-500/20 hover:text-red-400 text-[#868686] flex items-center justify-center transition-colors"
                      aria-label="Remover módulo"
                    >
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none"><path d="M18 6L6 18M6 6l12 12" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/></svg>
                    </button>
                  </div>

                  {/* Opcoes */}
                  <div className="flex flex-col gap-1.5">
                    <div className="grid grid-cols-[20px_1fr_100px_28px_24px] gap-2 text-[9px] text-[#555] uppercase font-semibold tracking-wider px-1">
                      <span>Pad</span>
                      <span>Opção</span>
                      <span className="text-right">Custo (R$)</span>
                      <span title="Vincular ficha existente"></span>
                      <span></span>
                    </div>
                    {mod.options.map((opt) => {
                      const isLinked = !!opt.linkedFichaId;
                      const linkedFicha = isLinked
                        ? availableFichas.find(f => String(f.id) === String(opt.linkedFichaId))
                        : null;
                      const linkedCusto = linkedFicha ? parseCusto(linkedFicha.custoTotal) : 0;
                      return (
                      <div key={opt.id} className="grid grid-cols-[20px_1fr_100px_28px_24px] gap-2 items-center">
                        <input
                          type="radio"
                          checked={!!opt.default}
                          onChange={() => updateOption(mod.id, opt.id, 'default', true)}
                          className="accent-[#F5A623]"
                          title="Marcar como combinação padrão"
                        />
                        {isLinked ? (
                          <select
                            value={opt.linkedFichaId || ''}
                            onChange={(e) => linkOptionToFicha(mod.id, opt.id, e.target.value)}
                            className={`bg-[#0F0F0F] border rounded-[6px] px-2 py-1 text-[11px] text-white outline-none focus:border-[#F5A623] truncate ${linkedFicha ? 'border-[#F5A623]/40' : 'border-red-500/50'}`}
                            title={linkedFicha ? `Vinculado a: ${linkedFicha.name}` : 'Ficha vinculada não encontrada'}
                          >
                            {!linkedFicha && <option value={opt.linkedFichaId} className="bg-[#1B1B1D]">⚠ Ficha excluída</option>}
                            {availableFichas.map(f => (
                              <option key={f.id} value={f.id} className="bg-[#1B1B1D]">
                                {f.name} — {fmtBRL(parseCusto(f.custoTotal))}
                              </option>
                            ))}
                          </select>
                        ) : (
                          <input
                            type="text"
                            value={opt.name}
                            onChange={(e) => updateOption(mod.id, opt.id, 'name', e.target.value)}
                            placeholder="Nome da opção"
                            className="bg-[#0F0F0F] border border-[#2A2A2C] rounded-[6px] px-2 py-1 text-[11px] text-white outline-none focus:border-[#F5A623]"
                          />
                        )}
                        {isLinked ? (
                          <div
                            className="bg-[#0F0F0F] border border-[#2A2A2C] rounded-[6px] px-2 py-1 text-[11px] text-[#F5A623] text-right tabular-nums select-none cursor-not-allowed"
                            title="Custo lido da ficha vinculada"
                          >
                            {linkedCusto.toFixed(2).replace('.', ',')}
                          </div>
                        ) : (
                          <input
                            type="text"
                            inputMode="decimal"
                            value={opt.custo}
                            onChange={(e) => updateOption(mod.id, opt.id, 'custo', e.target.value)}
                            placeholder="0,00"
                            className="bg-[#0F0F0F] border border-[#2A2A2C] rounded-[6px] px-2 py-1 text-[11px] text-white text-right outline-none focus:border-[#F5A623] tabular-nums"
                          />
                        )}
                        {/* Toggle vincular/desvincular ficha */}
                        {isLinked ? (
                          <button
                            onClick={() => unlinkOption(mod.id, opt.id)}
                            className="w-7 h-6 rounded-[4px] bg-[#F5A623]/15 text-[#F5A623] flex items-center justify-center transition-colors hover:bg-[#F5A623]/25"
                            title="Desvincular ficha (voltar pra manual)"
                          >
                            <svg width="11" height="11" viewBox="0 0 24 24" fill="none"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.72-1.71" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>
                          </button>
                        ) : (
                          <button
                            onClick={() => {
                              if (availableFichas.length === 0) {
                                alert('Cadastre fichas técnicas regulares (com custo) antes de vincular aqui.');
                                return;
                              }
                              linkOptionToFicha(mod.id, opt.id, availableFichas[0].id);
                            }}
                            className="w-7 h-6 rounded-[4px] bg-[#252527] text-[#868686] hover:bg-[#333] hover:text-[#F5A623] flex items-center justify-center transition-colors"
                            title="Vincular a uma ficha existente (puxa custo automaticamente)"
                          >
                            <svg width="11" height="11" viewBox="0 0 24 24" fill="none"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.72-1.71" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>
                          </button>
                        )}
                        <button
                          onClick={() => removeOption(mod.id, opt.id)}
                          className="w-6 h-6 rounded-[4px] hover:bg-red-500/20 hover:text-red-400 text-[#555] flex items-center justify-center transition-colors"
                          aria-label="Remover opção"
                          disabled={mod.options.length <= 1}
                        >
                          <svg width="10" height="10" viewBox="0 0 24 24" fill="none"><path d="M18 6L6 18M6 6l12 12" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/></svg>
                        </button>
                      </div>
                      );
                    })}
                  </div>

                  <button
                    onClick={() => addOption(mod.id)}
                    className="mt-2 w-full py-1.5 border border-dashed border-[#444] rounded-[6px] text-[10px] text-[#868686] hover:border-[#F5A623] hover:text-[#F5A623] transition-colors"
                  >
                    + opção
                  </button>
                </div>
              ))}
            </div>

            {modules.length === 0 && (
              <div className="text-center py-6 text-[11px] text-[#555]">
                Nenhum módulo adicionado. Clique em "Adicionar módulo" pra começar.
              </div>
            )}
          </div>
        </div>

        {/* Footer com botões */}
        <div className="flex items-center justify-between gap-3 p-5 pt-3 border-t border-[#2A2A2C] shrink-0">
          {isEditing && onDelete ? (
            <button
              onClick={() => {
                if (confirm(`Excluir ficha "${name}"?`)) {
                  onDelete(editingFicha.id);
                  onClose();
                }
              }}
              className="text-[11px] text-[#FF4560] hover:text-[#FF6B7A] font-medium px-3 py-2"
            >
              Excluir ficha
            </button>
          ) : <div />}
          <div className="flex gap-2">
            <button
              onClick={onClose}
              className="px-4 py-2 bg-[#252527] hover:bg-[#333] text-white text-[12px] font-medium rounded-[10px] transition-colors"
            >
              Cancelar
            </button>
            <button
              onClick={handleSave}
              className="px-4 py-2 bg-[#F5A623] hover:bg-[#E5961E] text-black text-[12px] font-bold rounded-[10px] transition-colors"
            >
              {isEditing ? 'Salvar alterações' : 'Criar ficha modular'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default CriarFichaModularModal;
