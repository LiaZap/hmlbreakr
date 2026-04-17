/**
 * BREAKR BACKUP VIA API
 *
 * Faz backup puxando dados da API admin (não precisa de acesso direto ao banco).
 * Útil quando o banco está em servidor remoto.
 *
 * Usage: node scripts/backup-via-api.js https://app.breakr.com.br
 *
 * Requer: o servidor estar rodando com as rotas admin acessíveis.
 */

const fs = require('fs');
const path = require('path');

const API_BASE = process.argv[2] || 'http://localhost:3000';

async function backup() {
  console.log(`🔄 Backup via API de: ${API_BASE}\n`);

  try {
    // Try full export first (includes fichas/insumos/all data)
    console.log('📥 Tentando export completo (/api/admin/export)...');
    let data;
    try {
      const exportRes = await fetch(`${API_BASE}/api/admin/export`);
      if (exportRes.ok) {
        data = await exportRes.json();
        data._meta.source = API_BASE;
        data._meta.method = 'full-export';
        console.log('✅ Export completo obtido (dados FULL com fichas/insumos)');
      } else {
        throw new Error('Export route not available');
      }
    } catch {
      // Fallback to lightweight endpoints
      console.log('⚠️  Export completo indisponível, usando endpoints padrão...');
      const clientsRes = await fetch(`${API_BASE}/api/admin/clients`);
      const clients = await clientsRes.json();
      const broadcastsRes = await fetch(`${API_BASE}/api/admin/broadcasts`);
      const broadcasts = await broadcastsRes.json();

      data = {
        _meta: {
          version: '1.2',
          exportedAt: new Date().toISOString(),
          source: API_BASE,
          method: 'api-lightweight',
          counts: {
            clients: Array.isArray(clients) ? clients.length : 0,
            broadcasts: Array.isArray(broadcasts) ? broadcasts.length : 0,
          },
          note: 'Lightweight backup - client.data sem fichas/insumos. Para full backup, deploy a rota /admin/export e rode novamente.'
        },
        clients: Array.isArray(clients) ? clients : [],
        broadcasts: Array.isArray(broadcasts) ? broadcasts : [],
      };
    }

    const now = new Date();
    const ts = now.toISOString().replace(/[:.]/g, '-').substring(0, 19);
    const filename = `backup-api-${ts}.json`;
    const filepath = path.resolve(__dirname, '..', filename);

    fs.writeFileSync(filepath, JSON.stringify(data, null, 2), 'utf-8');

    console.log(`\n✅ Backup via API concluído!`);
    console.log(`📁 Arquivo: ${filepath}`);
    console.log(`📊 ${data._meta.counts.clients} clientes, ${data._meta.counts.broadcasts || 0} broadcasts`);
    console.log(`📦 Tamanho: ${(fs.statSync(filepath).size / 1024).toFixed(1)} KB`);
    console.log(`📋 Método: ${data._meta.method}`);
    if (data._meta.method === 'api-lightweight') {
      console.log(`\n⚠️  NOTA: Backup lightweight (sem fichas/insumos).`);
      console.log(`   Deploy a nova versão com /admin/export e rode novamente para backup completo.`);
    }

  } catch (error) {
    console.error('❌ Erro:', error.message);
    console.error('   Verifique se o servidor está rodando em:', API_BASE);
    process.exit(1);
  }
}

backup();
