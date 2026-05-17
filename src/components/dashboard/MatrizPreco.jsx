import React, { useState, useMemo } from 'react';
import { useDashboard } from '../../context/DashboardContext';

// ============ MOCK DATA ============
// Removed initialItems as it was unused

const CATEGORIES = {
  ESTRELA: { label: 'Estrelas', color: '#00C8F4', description: 'Alta popularidade e alta rentabilidade.', icon: '★' },
  POPULAR: { label: 'Populares', color: '#00E396', description: 'Alta popularidade mas baixa rentabilidade.', icon: '●' },
  POTENCIAL: { label: 'Potenciais', color: '#FEB019', description: 'Baixa popularidade mas alta rentabilidade.', icon: '●' },
  CRITICO: { label: 'Críticos', color: '#FF4560', description: 'Baixa popularidade e baixa rentabilidade.', icon: '●' },
};

// BAH-083: categorias que NÃO são pratos vendáveis e não devem aparecer
// na Engenharia de Menu. "Insumo Pronto Preparado" gera uma ficha técnica
// auto-criada (FichaTecnica.jsx) apenas para ser usada como ingrediente
// dentro de outras fichas — não é um item de cardápio que o restaurante vende.
const NON_MENU_CATEGORIES = new Set(['insumo pronto preparado']);

// Verdadeiro quando o item/ficha é um insumo (não um prato vendável).
// Critério: a categoria/type marca explicitamente o item como insumo.
const isInsumoItem = (categoryOrType) =>
  NON_MENU_CATEGORIES.has(String(categoryOrType || '').toLowerCase().trim());

const MatrizPreco = () => {
  const { dashboardData } = useDashboard();
  const [activeCategory, setActiveCategory] = useState(null); // Filter by click on chips (classification)
  const [selectedMenuCategory, setSelectedMenuCategory] = useState(null); // null = show all, or a specific category


  // Helper to parse currency safely
  const parseCurrency = (val) => {
      if (typeof val === 'number') return val;
      if (!val) return 0;
      let str = String(val).replace(/R\$/g, '').trim();
      // If it has comma formatting like 1.200,50 -> remove dots, change comma to dot
      if (str.includes(',')) {
          str = str.replace(/\./g, '').replace(',', '.');
      }
      return parseFloat(str) || 0;
  };

  const parseSales = (val) => {
      if (typeof val === 'number') return val;
      if (!val) return 0;
      let str = String(val).trim();
      // Simple heuristic for thousand separators like "1.000"
      if (str.includes('.') && str.indexOf('.') === str.lastIndexOf('.') && str.split('.')[1].length === 3) {
          str = str.replace(/\./g, '');
      }
      return parseInt(str, 10) || 0;
  };

  const itemsWithMetrics = useMemo(() => {
    const allFichas = dashboardData.operational?.fichas || [];

    // BAH-083: nomes das fichas que são insumos (ex.: "Insumo Pronto Preparado").
    // Itens de menuEngineering antigos podem não carregar a categoria correta;
    // cruzamos pelo nome da ficha de origem para garantir a exclusão.
    const insumoFichaNames = new Set(
      allFichas
        .filter(f => isInsumoItem(f.type))
        .map(f => f.name?.toLowerCase().trim())
        .filter(Boolean)
    );

    // Mantém apenas pratos vendáveis: exclui itens cuja categoria é de insumo
    // ou cujo nome bate com uma ficha-insumo auto-criada.
    const displayItems = (dashboardData.menuEngineering || []).filter(
      item => !isInsumoItem(item.category) && !insumoFichaNames.has(item.name?.toLowerCase().trim())
    );
    const fichaNames = new Set(allFichas.map(f => f.name?.toLowerCase().trim()));
    const fichaIds = new Set(allFichas.map(f => `ft_${f.id}`));

    return displayItems.map(item => ({
      ...item,
      category: item.category || 'Geral',
      sales: parseSales(item.sales),
      price: parseCurrency(item.price),
      cost: parseCurrency(item.cost),
      margin: parseCurrency(item.price) - parseCurrency(item.cost),
      hasFicha: fichaIds.has(item.id) || fichaNames.has(item.name?.toLowerCase().trim()),
    }));
  }, [dashboardData.menuEngineering, dashboardData.operational?.fichas]);

  const uniqueMenuCategories = useMemo(() => {
    const cats = new Set(itemsWithMetrics.map(item => item.category));
    return Array.from(cats).sort();
  }, [itemsWithMetrics]);

  // Filter items first so averages are based on the viewed items
  const baseFilteredItems = useMemo(() => {
    if (!selectedMenuCategory) return itemsWithMetrics;
    return itemsWithMetrics.filter(i => i.category === selectedMenuCategory);
  }, [itemsWithMetrics, selectedMenuCategory]);

  const currentAverages = useMemo(() => {
    if (baseFilteredItems.length === 0) return { sales: 0, margin: 0 };
    const totalSales = baseFilteredItems.reduce((sum, item) => sum + item.sales, 0);
    const totalMargin = baseFilteredItems.reduce((sum, item) => sum + item.margin, 0);
    return {
      sales: totalSales / baseFilteredItems.length,
      margin: totalMargin / baseFilteredItems.length,
    };
  }, [baseFilteredItems]);

  // 2. Classify Items (always compare against the CURRENT average view)
  const classifiedItems = useMemo(() => {
    return baseFilteredItems.map(item => {
      let type;
      if (item.sales >= currentAverages.sales && item.margin >= currentAverages.margin) type = 'ESTRELA';
      else if (item.sales >= currentAverages.sales && item.margin < currentAverages.margin) type = 'POPULAR';
      else if (item.sales < currentAverages.sales && item.margin >= currentAverages.margin) type = 'POTENCIAL';
      else type = 'CRITICO';
      
      return { ...item, type };
    });
  }, [baseFilteredItems, currentAverages]);

  const filteredItemsForDisplay = classifiedItems; // Already filtered

  // 3. Counts (based on filtered view)
  const counts = useMemo(() => {
    const c = { ESTRELA: 0, POPULAR: 0, POTENCIAL: 0, CRITICO: 0 };
    filteredItemsForDisplay.forEach(item => {
        if (c[item.type] !== undefined) c[item.type]++;
    });
    return c;
  }, [filteredItemsForDisplay]);

  // 4. Chart Scaling (based on filtered view)
  // Generate "nice" tick values for an axis
  const generateNiceTicks = (maxVal, count = 5) => {
    if (maxVal <= 0) return [0];
    const rawStep = maxVal / (count - 1);
    const magnitude = Math.pow(10, Math.floor(Math.log10(rawStep)));
    const residual = rawStep / magnitude;
    let niceStep;
    if (residual <= 1.5) niceStep = 1 * magnitude;
    else if (residual <= 3) niceStep = 2 * magnitude;
    else if (residual <= 7) niceStep = 5 * magnitude;
    else niceStep = 10 * magnitude;
    const ticks = [];
    for (let v = 0; v <= maxVal + niceStep * 0.01; v += niceStep) {
      ticks.push(Math.round(v * 100) / 100);
    }
    if (ticks.length === 0) ticks.push(0);
    return ticks;
  };

  const chartConfig = useMemo(() => {
    const maxSales = Math.max(0, ...filteredItemsForDisplay.map(i => i.sales)) * 1.25;
    const maxMargin = Math.max(0, ...filteredItemsForDisplay.map(i => i.margin)) * 1.25;
    const safeMaxX = maxSales || 10;
    const safeMaxY = maxMargin || 10;
    const xTicks = generateNiceTicks(safeMaxX);
    const yTicks = generateNiceTicks(safeMaxY);
    return { 
      maxX: xTicks[xTicks.length - 1] || safeMaxX,
      maxY: yTicks[yTicks.length - 1] || safeMaxY,
      xTicks,
      yTicks,
    };
  }, [filteredItemsForDisplay]);

  const [hoveredItem, setHoveredItem] = useState(null);

  // Helper to map data to SVG coordinates (0-100%)
  const getX = (val) => (val / chartConfig.maxX) * 100;
  const getY = (val) => 100 - ((val / chartConfig.maxY) * 100); // Inverted Y for SVG

  return (
    <div className="flex flex-col md:flex-row md:h-[calc(100vh-140px)] gap-4 md:gap-6 p-4 md:p-6 overflow-y-auto md:overflow-hidden bg-[#101010] text-white font-jakarta">

      {/* LEFT PANEL: LIST */}
      <div className="w-full md:w-[320px] shrink-0 flex flex-col gap-4 md:gap-6 md:overflow-hidden">
        <div>
          <div className="text-[12px] text-[#868686] mb-1">Breakr &gt; Precificação</div>
          <h1 className="text-[24px] font-bold leading-tight">Engenharia de<br/>Menu</h1>
          <p className="text-[12px] text-[#868686] mt-2">Configure seus custos e veja dados e informações</p>
        </div>

        {/* Categories List */}
        <div className="flex-1 md:overflow-y-auto pr-2 space-y-4">
          {Object.entries(CATEGORIES).map(([key, config]) => {
            const categoryItems = filteredItemsForDisplay.filter(i => i.type === key);
            if (categoryItems.length === 0) return null;

            return (
              <div key={key} className="flex flex-col gap-2">
                <div className="flex items-center justify-between cursor-pointer group">
                  <div className="flex items-center gap-2">
                     <span className="text-[14px] font-semibold text-[#CACACA]" style={{ color: config.color === '#00B8D9' ? '#3B82F6' : config.color }}>{config.label}</span>
                  </div>
                  <svg width="10" height="6" viewBox="0 0 10 6" fill="none" className="group-hover:translate-y-0.5 transition-transform"><path d="M1 1L5 5L9 1" stroke="#555" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg>
                </div>
                <p className="text-[10px] text-[#595959] leading-tight mb-2">{config.description}</p>
                
                <div className="space-y-1">
                  {categoryItems.map(item => (
                    <div 
                      key={item.id} 
                      className={`flex items-center justify-between p-2 rounded-[8px] border border-transparent hover:bg-[#1E1E1E] transition-colors ${hoveredItem === item.id ? 'bg-[#1E1E1E] border-[#333]' : 'bg-transparent'}`}
                      onMouseEnter={() => setHoveredItem(item.id)}
                      onMouseLeave={() => setHoveredItem(null)}
                    >
                      <div className="flex items-center gap-2 overflow-hidden">
                        <div className={`w-1.5 h-1.5 rounded-full shrink-0`} style={{ backgroundColor: config.color }} />
                        <span className={`text-[11px] truncate ${item.hasFicha ? 'text-[#E1E1E1]' : 'text-red-500'}`} title={!item.hasFicha ? 'Produto sem ficha técnica' : ''}>{item.name}</span>
                      </div>
                      <div className="flex items-center gap-4 text-[10px]">
                        <span className="text-[#868686]">Vendas <span className="text-white font-medium">{item.sales}</span></span>
                        <span className="text-[#868686] w-[60px] text-right">R$ {item.price.toFixed(2)}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* RIGHT PANEL: CHART (visible on all screens) */}
      <div className="flex flex-1 bg-[#1B1B1D] rounded-[16px] md:rounded-[24px] border border-[#2A2A2C] p-4 md:p-6 flex-col relative min-h-[400px] md:min-h-0">

        {/* Header / Filter Chips */}
        <div className="flex flex-col gap-3 mb-4 md:mb-6 z-10 relative">
          <div className="flex flex-col sm:flex-row gap-3 sm:gap-4 items-start sm:items-center justify-between">
             <div>
                 <h2 className="text-[16px] md:text-[18px] font-bold text-white">Matriz de Cardápio</h2>
                 <p className="text-[11px] md:text-[12px] text-[#868686]">
                   {!selectedMenuCategory
                     ? "Comparativo de pratos contra a média geral."
                     : "Comparativo contra a média da categoria."}
                 </p>
             </div>

             {/* MENU CATEGORY DROPDOWN */}
             <div className="sm:ml-4 sm:pl-4 sm:border-l border-[#2A2A2C]">
                <label className="block text-[10px] text-[#868686] mb-1">Filtrar Categoria</label>
                <select
                   className="bg-[#151515] text-[12px] text-white border border-[#2A2A2C] rounded-[8px] px-3 py-1.5 outline-none hover:border-[#444] min-w-[120px]"
                   value={selectedMenuCategory || ''}
                   onChange={(e) => setSelectedMenuCategory(e.target.value || null)}
                >
                    <option value="">Selecione</option>
                    {uniqueMenuCategories.map(cat => (
                        <option key={cat} value={cat}>{cat}</option>
                    ))}
                </select>
             </div>
          </div>
          <div className="flex flex-wrap items-center gap-1.5 md:gap-2">
            {Object.entries(CATEGORIES).map(([key, config]) => (
              <div
                key={key}
                className={`px-2 md:px-3 py-1 md:py-1.5 rounded-full border border-[#2A2A2C] bg-[#151515] flex items-center gap-1.5 md:gap-2 cursor-pointer transition-all hover:bg-[#252527]`}
                onClick={() => setActiveCategory(activeCategory === key ? null : key)}
                style={{ opacity: activeCategory && activeCategory !== key ? 0.3 : 1 }}
              >
                 <div className="w-2 h-2 rounded-full" style={{ backgroundColor: config.color }} />
                 <span className="text-[9px] md:text-[10px] text-white font-medium">{config.label}</span>
                 <span className="text-[9px] md:text-[10px] text-[#595959] bg-[#1E1E1E] px-1 md:px-1.5 rounded">{counts[key]}</span>
              </div>
            ))}
          </div>
        </div>

        {/* CHART AREA */}
        <div className="flex-1 relative w-full h-full min-h-[300px]">
          {/* Y-Axis Label (outside chart area) */}
          <div className="absolute left-[20px] top-1/2 -translate-x-1/2 -translate-y-1/2 -rotate-90 text-[10px] text-[#868686] font-medium tracking-wide whitespace-nowrap text-center" style={{ transformOrigin: 'center center' }}>
             Margem (R$)
             <span className="block text-[8px] font-normal text-[#555]">Quanto este produto gera de margem</span>
          </div>
          {/* X-Axis Label (outside chart area) */}
          <div className="absolute bottom-0 left-[80px] right-[20px] text-center text-[10px] text-[#868686] font-medium tracking-wide">
             Volume de Vendas
             <span className="block text-[8px] font-normal text-[#555]">Quanto este produto vende em comparativos</span>
          </div>

          {/* Chart container with margins for axes */}
          <div className="absolute top-[10px] left-[80px] right-[20px] bottom-[40px]">

            {/* Y-Axis Tick Labels (positioned outside SVG, left edge) */}
            {chartConfig.yTicks.map((val) => {
              const pct = 100 - (val / chartConfig.maxY) * 100;
              return (
                <div 
                  key={`yt-${val}`}
                  className="absolute text-[9px] text-[#555] text-right"
                  style={{ top: `${pct}%`, right: '100%', transform: 'translateY(-50%)', paddingRight: '6px', whiteSpace: 'nowrap' }}
                >
                  {val % 1 === 0 ? val : val.toFixed(0)}
                </div>
              );
            })}

            {/* X-Axis Tick Labels (positioned outside SVG, bottom edge) */}
            {chartConfig.xTicks.map((val) => {
              const pct = (val / chartConfig.maxX) * 100;
              return (
                <div
                  key={`xt-${val}`}
                  className="absolute text-[9px] text-[#555] text-center"
                  style={{ left: `${pct}%`, top: '100%', transform: 'translateX(-50%)', paddingTop: '4px' }}
                >
                  {val % 1 === 0 ? val : val.toFixed(1)}
                </div>
              );
            })}

            {/* SVG Chart (fills the container, 0-100% coordinates) */}
            <svg className="w-full h-full" style={{ overflow: 'visible' }}>
              
              {/* Dotted Grid Background */}
              {[...Array(11)].map((_, i) => (
                 <line key={`h-${i}`} x1="0" y1={`${i * 10}%`} x2="100%" y2={`${i * 10}%`} stroke="#333" strokeWidth="1" strokeDasharray="2 4" opacity="0.3" />
              ))}
              {[...Array(11)].map((_, i) => (
                 <line key={`v-${i}`} x1={`${i * 10}%`} y1="0" x2={`${i * 10}%`} y2="100%" stroke="#333" strokeWidth="1" strokeDasharray="2 4" opacity="0.3" />
              ))}

              {/* Quadrant Lines (Average Lines) */}
              {filteredItemsForDisplay.length > 0 && (
                  <>
                      <line 
                        x1={`${Math.max(0, Math.min(100, getX(currentAverages.sales)))}%`} y1="0" 
                        x2={`${Math.max(0, Math.min(100, getX(currentAverages.sales)))}%`} y2="100%" 
                        stroke="#888" strokeWidth="1" strokeDasharray="4 4" 
                      />
                      <line 
                        x1="0" y1={`${Math.max(0, Math.min(100, getY(currentAverages.margin)))}%`} 
                        x2="100%" y2={`${Math.max(0, Math.min(100, getY(currentAverages.margin)))}%`} 
                        stroke="#888" strokeWidth="1" strokeDasharray="4 4" 
                      />
                      
                      {/* Sub-label for lines */}
                      {getX(currentAverages.sales) >= 0 && getX(currentAverages.sales) <= 100 && (
                          <text x={`${getX(currentAverages.sales) + 1}%`} y="15" fill="#888" fontSize="9">
                              Média Vendas ({currentAverages.sales.toFixed(1)})
                          </text>
                      )}
                      {getY(currentAverages.margin) >= 0 && getY(currentAverages.margin) <= 100 && (
                          <text x="5" y={`${getY(currentAverages.margin) - 2}%`} fill="#888" fontSize="9">
                              Média Margem (R${currentAverages.margin.toFixed(2)})
                          </text>
                      )}
                  </>
              )}

              {/* Data Points */}
              {filteredItemsForDisplay.map((item) => {
                 const isHovered = hoveredItem === item.id;
                 const isActive = !activeCategory || activeCategory === item.type;
                 
                 return (
                   <g 
                      key={item.id} 
                      style={{ 
                         opacity: isActive ? 1 : 0.3, 
                         transition: 'all 0.3s ease',
                         cursor: 'pointer' 
                      }}
                      onMouseEnter={() => setHoveredItem(item.id)}
                      onMouseLeave={() => setHoveredItem(null)}
                   >
                     <circle 
                        cx={`${getX(item.sales)}%`} 
                        cy={`${getY(item.margin)}%`} 
                        r={isHovered ? 8 : 6} 
                        fill={CATEGORIES[item.type].color}
                        stroke="#1B1B1D"
                        strokeWidth="2"
                        className="transition-all duration-300"
                     />
                     {/* Label — renderizado SÓ pro item sob o mouse. Antes todos
                         os cards ficavam no DOM com opacity-0; dentro de
                         <foreignObject> o opacity nem sempre oculta de forma
                         confiável, então todos apareciam e se sobrepunham.
                         Renderização condicional = só existe o card do hover. */}
                     {isHovered && (() => {
                        const yPct = getY(item.margin);
                        const isNearTop = yPct < 25;
                        return (
                        <foreignObject
                           x={`${getX(item.sales)}%`}
                           y={`${yPct}%`}
                           width="1"
                           height="1"
                           style={{ overflow: 'visible', pointerEvents: 'none' }}
                        >
                        <div
                           className="bg-[#252527] border border-[#333] px-3 py-2 rounded-[8px] shadow-xl text-center z-50"
                           style={{ minWidth: '120px', position: 'absolute', left: '-60px', ...(isNearTop ? { top: '10px' } : { bottom: '10px' }) }}
                        >
                           <p className="text-[11px] font-bold text-white mb-0.5">{item.name}</p>
                           <div className="flex justify-center gap-2 text-[9px] text-[#999]">
                              <span>V: {item.sales}</span>
                              <span>M: R${item.margin.toFixed(0)}</span>
                           </div>
                           <div
                              className="text-[9px] font-bold mt-1 uppercase tracking-wider"
                              style={{ color: CATEGORIES[item.type].color }}
                           >
                              {CATEGORIES[item.type].label}
                           </div>
                        </div>
                     </foreignObject>
                        );
                     })()}
                   </g>
                 )
              })}

            </svg>
          </div>
        </div>
      </div>
    </div>
  );
};

export default MatrizPreco;
