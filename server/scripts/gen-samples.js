/**
 * gen-samples.js — Gera samples binarios (xlsx + pdf) usados no E2E BPO.
 *
 * Os samples textuais (xml, ofx, csv, txt) ja estao commitados em scripts/samples/.
 * Este script gera os binarios "pesados":
 *   - bulk-fornecedores.xlsx (10 fornecedores pra import Excel)
 *   - boleto-exemplo.pdf (PDF digital com texto contendo CNPJ + valor + vencimento)
 *
 * Uso:
 *   node scripts/gen-samples.js
 *
 * Dependencias:
 *   - xlsx (ja instalado)
 *   - pdf-parse vem com pdfkit-like dependencias? Nao. Usa fallback texto puro pdf-lib.
 *   - Se pdf-lib nao estiver instalado, gera um PDF "dummy" minimo manualmente
 *     (header PDF estatico + texto puro) — funciona pra import de PDF que so faz regex.
 */

const path = require('path');
const fs = require('fs');
const XLSX = require('xlsx');

const SAMPLES_DIR = path.join(__dirname, 'samples');

if (!fs.existsSync(SAMPLES_DIR)) fs.mkdirSync(SAMPLES_DIR, { recursive: true });

function log(...args) {
  console.log('[gen-samples]', ...args);
}

// ============================================================================
// 1. bulk-fornecedores.xlsx
// ============================================================================
function genBulkFornecedoresXlsx() {
  log('Gerando bulk-fornecedores.xlsx...');

  // Headers em pt-BR (alinha com REQUIRED_COLS do backend imports.js)
  const headers = ['cnpj', 'nome', 'email', 'telefone', 'pix', 'banco', 'agencia', 'conta', 'observacoes'];
  const rows = [
    ['11.222.333/0001-81', 'Distribuidora Bebidas SP LTDA', 'contato@distbebidas.com.br', '(11) 98765-4321', '11222333000181', '237', '1234', '56789-0', 'Refrigerantes e cervejas'],
    ['22.333.444/0001-95', 'Hortifruti Cidade Verde', 'compras@hortifruti.com.br', '(11) 98888-1111', '22333444000195', '341', '0001', '12345-6', 'Verduras e legumes'],
    ['33.444.555/0001-09', 'Carnes Premium Atacado', 'vendas@carnespremium.com.br', '(11) 97777-2222', '33444555000109', '001', '1500', '99887-7', 'Carnes nobres'],
    ['44.555.666/0001-23', 'Embalagens Express', 'embalagens@express.com', '(11) 96666-3333', 'embalagens@express.com', '260', '0001', '00012-3', 'Caixas e sacolas'],
    ['55.666.777/0001-37', 'Liquigas Comercial', 'comercial@liquigas.com.br', '(11) 95555-4444', '55666777000137', '237', '0500', '44321-0', 'Botijoes P45'],
    ['66.777.888/0001-51', 'Vivo Empresas', 'empresas@vivo.com.br', '0800-7000123', '66777888000151', '341', '0001', '88800-1', 'Internet e telefonia'],
    ['77.888.999/0001-65', 'Enel Distribuicao SP', 'atendimento@enel.com', '0800-7100123', '77888999000165', '001', '0001', '11122-3', 'Energia eletrica'],
    ['88.999.000/0001-79', 'Contabilidade Silva e Cia', 'contabil@silvaecia.com.br', '(11) 94444-5555', '88999000000179', '237', '1234', '77000-9', 'Contabilidade'],
    ['99.000.111/0001-83', 'Marketing Digital MX', 'comercial@mxdigital.com.br', '(11) 93333-6666', '99000111000183', '260', '0001', '00099-8', 'Gestao midias sociais'],
    ['12.345.678/0001-95', 'Manutencao Frio Ja', 'frio@manutencao.com.br', '(11) 92222-7777', '12345678000195', '341', '0001', '55500-4', 'Manutencao refrigeracao'],
  ];

  const data = [headers, ...rows];
  const ws = XLSX.utils.aoa_to_sheet(data);

  // Largura coluna razoavel
  ws['!cols'] = headers.map(() => ({ wch: 25 }));

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Fornecedores');

  const out = path.join(SAMPLES_DIR, 'bulk-fornecedores.xlsx');
  XLSX.writeFile(wb, out);
  log('  ->', out);
}

// ============================================================================
// 2. boleto-exemplo.pdf
//   Sem pdf-lib instalado, geramos um PDF 1.4 minimo com texto plano.
//   pdf-parse extrai o texto via regex; isso e suficiente pro import "PDF beta".
// ============================================================================
function genBoletoPdf() {
  log('Gerando boleto-exemplo.pdf (PDF minimo manual)...');

  // Conteudo textual que sera extraido pelo pdf-parse
  const lines = [
    'BOLETO BANCARIO - SEED EXEMPLO',
    '',
    'Beneficiario: DISTRIBUIDORA BEBIDAS SP LTDA',
    'CNPJ: 11.222.333/0001-81',
    '',
    'Pagador: BURGER BROTHERS LTDA',
    'CNPJ: 22.333.444/0001-95',
    '',
    'Numero do Documento: BOL-SEED-001',
    'Data de Emissao: 15/04/2026',
    'Vencimento: 15/05/2026',
    'Valor: R$ 1.500,00',
    '',
    'Linha Digitavel:',
    '00190.00009 02817.622008 86680.026046 8 91070000010000',
    '',
    'Nosso Numero: 12345678901',
    'Carteira: 17',
    '',
    'Instrucoes:',
    '- Apos vencimento cobrar multa de 2%',
    '- Juros de mora 1% ao mes',
  ];

  // Monta um PDF 1.4 estatico, com 1 pagina, fonte Helvetica, texto.
  // Cada linha como TJ separado pra ficar limpo.

  const escapePdfString = (s) => s.replace(/\\/g, '\\\\').replace(/\(/g, '\\(').replace(/\)/g, '\\)');

  let textOps = '';
  let y = 750;
  for (const line of lines) {
    textOps += `BT /F1 11 Tf 50 ${y} Td (${escapePdfString(line)}) Tj ET\n`;
    y -= 18;
  }

  const stream = textOps;
  const streamLength = Buffer.byteLength(stream, 'latin1');

  const objects = [];
  objects[1] = `1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n`;
  objects[2] = `2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj\n`;
  objects[3] = `3 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>\nendobj\n`;
  objects[4] = `4 0 obj\n<< /Length ${streamLength} >>\nstream\n${stream}endstream\nendobj\n`;
  objects[5] = `5 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>\nendobj\n`;

  let pdf = '%PDF-1.4\n';
  const offsets = [0];
  for (let i = 1; i <= 5; i++) {
    offsets[i] = Buffer.byteLength(pdf, 'latin1');
    pdf += objects[i];
  }
  const xrefOffset = Buffer.byteLength(pdf, 'latin1');
  pdf += `xref\n0 6\n`;
  pdf += `0000000000 65535 f \n`;
  for (let i = 1; i <= 5; i++) {
    pdf += `${String(offsets[i]).padStart(10, '0')} 00000 n \n`;
  }
  pdf += `trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF\n`;

  const out = path.join(SAMPLES_DIR, 'boleto-exemplo.pdf');
  fs.writeFileSync(out, pdf, 'latin1');
  log('  ->', out);
}

// ============================================================================
// MAIN
// ============================================================================
function main() {
  log('Gerando samples binarios em', SAMPLES_DIR);
  genBulkFornecedoresXlsx();
  genBoletoPdf();
  log('Concluido.');
  log('');
  log('Samples disponiveis:');
  for (const f of fs.readdirSync(SAMPLES_DIR).sort()) {
    const stat = fs.statSync(path.join(SAMPLES_DIR, f));
    log(`  ${f.padEnd(30)} ${(stat.size / 1024).toFixed(1)} KB`);
  }
}

main();
