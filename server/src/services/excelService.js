const xlsx = require('xlsx');

const parseMenuExcel = (buffer, originalname = '') => {
  let workbook;
  
  // If we know it's a CSV, parse it as a UTF-8 string to preserve special characters (ç, ã, etc.)
  if (originalname.toLowerCase().endsWith('.csv')) {
      const csvString = buffer.toString('utf8');
      workbook = xlsx.read(csvString, { type: 'string' });
  } else {
      // For binary Excel files (.xlsx, .xls)
      workbook = xlsx.read(buffer, { type: 'buffer' });
  }

  const sheetName = workbook.SheetNames[0];
  const worksheet = workbook.Sheets[sheetName];
  const data = xlsx.utils.sheet_to_json(worksheet, { defval: "" }); // defval ensures empty cells are string


  // Transform data to our Menu Engineering format
  // Expected Excel columns: Nome, Vendas, Preço, Custo, Categoria
  
  const parseNumber = (val) => {
      if (typeof val === 'number') return val;
      if (!val) return 0;
      const str = String(val).trim();
      
      // Try simple parsing first
      if (!isNaN(Number(str))) return Number(str);

      // Handle PT-BR (1.234,56) vs US (1,234.56)
      // Assumption: If comma exists, it might be decimal separator
      // If "R$" is present, strip it
      const cleanStr = str.replace(/[R$\s]/g, '');
      
      if (cleanStr.includes(',') && !cleanStr.includes('.')) {
          // "50,00" -> 50.00
          return parseFloat(cleanStr.replace(',', '.'));
      }
      if (cleanStr.includes('.') && cleanStr.includes(',')) {
          // "1.200,00" -> 1200.00
          return parseFloat(cleanStr.replace(/\./g, '').replace(',', '.'));
      }
      
      return parseFloat(cleanStr) || 0;
  };

  const menuItems = data.map((row, index) => {
    // Helper to find case-insensitive key with partial matching
    // Tries exact match first, then checks if any column contains one of the keywords
    const findVal = (keys) => {
        const lowerKeys = keys.map(k => k.toLowerCase());
        // Exact match first
        const exactKey = Object.keys(row).find(k => lowerKeys.includes(k.toLowerCase().trim()));
        if (exactKey) return row[exactKey];
        // Partial match: column header contains one of the keywords
        const partialKey = Object.keys(row).find(colName => {
            const col = colName.toLowerCase().trim();
            return lowerKeys.some(k => col.includes(k));
        });
        return partialKey ? row[partialKey] : null;
    };

    // Helper that WON'T partial-match ambiguous short keywords
    // Uses exact match for short keys, partial for longer ones (4+ chars)
    const findValStrict = (keys) => {
        const lowerKeys = keys.map(k => k.toLowerCase());
        const exactKey = Object.keys(row).find(k => lowerKeys.includes(k.toLowerCase().trim()));
        if (exactKey) return row[exactKey];
        const longKeys = lowerKeys.filter(k => k.length >= 4);
        if (longKeys.length === 0) return null;
        const partialKey = Object.keys(row).find(colName => {
            const col = colName.toLowerCase().trim();
            return longKeys.some(k => col.includes(k));
        });
        return partialKey ? row[partialKey] : null;
    };

    return {
        id: Date.now() + index, // Generate temporary unique ID
        name: findVal(['Nome', 'Prato', 'Produto', 'Item', 'Name']) || 'Sem Nome',
        category: findVal(['Categoria', 'Grupo', 'Category']) || 'Geral',
        sales: parseNumber(findValStrict(['Vendas', 'Volume', 'Qtd', 'Quantidade', 'Sales'])),
        price: parseNumber(findValStrict(['Preço de Venda', 'Preco de Venda', 'Preço', 'Preco', 'Valor de Venda', 'Price', 'Valor'])),
        cost: parseNumber(findValStrict(['Custo', 'CMV', 'Cost']))
    };
  });
  

  return menuItems;
};

module.exports = { parseMenuExcel };
