/**
 * Lista dos 18 bancos brasileiros suportados pelo BPO
 * (alinhado com Pluggy / Open Finance — Fase 3)
 */

export const BRAZILIAN_BANKS = [
  { code: '001', name: 'Banco do Brasil' },
  { code: '033', name: 'Santander' },
  { code: '041', name: 'Banrisul' },
  { code: '077', name: 'Inter' },
  { code: '104', name: 'Caixa Econômica Federal' },
  { code: '197', name: 'Stone' },
  { code: '208', name: 'BTG Pactual' },
  { code: '237', name: 'Bradesco' },
  { code: '260', name: 'Nubank' },
  { code: '290', name: 'PagSeguro' },
  { code: '323', name: 'Mercado Pago' },
  { code: '341', name: 'Itaú' },
  { code: '380', name: 'PicPay' },
  { code: '403', name: 'Cora' },
  { code: '422', name: 'Safra' },
  { code: '461', name: 'Asaas' },
  { code: '748', name: 'Sicredi' },
  { code: '756', name: 'Sicoob' },
  { code: 'IFD', name: 'iFood (Conta Digital)' },
  { code: 'IFP', name: 'InfinitePay' },
];

export const findBank = (code) => BRAZILIAN_BANKS.find((b) => b.code === code);
