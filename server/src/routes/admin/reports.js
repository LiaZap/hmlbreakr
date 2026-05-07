/**
 * Reports — endpoint de envio de relatórios filtrados pra clientes (BAH-016)
 *
 * V1 (atual): stub. Aceita o snapshot do relatório montado no frontend e apenas
 * loga + retorna sucesso. Não envia email real ainda.
 *
 * V2 (futuro): integrar com emailService pra disparar email real com:
 *   - Template HTML branded Breakr
 *   - PDF anexo gerado server-side a partir do snapshot
 *   - Tracking de open/click via pixel transparente
 *   - Persistir histórico de envios em tabela ReportSendLog
 *
 * Contract:
 *   POST /api/admin/reports/send
 *     body: { clientId, message?, period: { from, to, label }, snapshot: {...} }
 *     resp: { success: true, sentAt: ISO timestamp }
 */

const express = require('express');

const router = express.Router();

router.post('/send', async (req, res) => {
  try {
    const { clientId, message, period, snapshot } = req.body || {};

    if (!clientId) {
      return res.status(400).json({ error: 'clientId é obrigatório' });
    }

    // V1: apenas loga. V2: enviar email real via emailService.
    console.log('[admin reports send]', {
      clientId,
      period: period?.label || 'sem período',
      messageLen: typeof message === 'string' ? message.length : 0,
      hasSnapshot: !!snapshot,
    });

    return res.json({ success: true, sentAt: new Date().toISOString() });
  } catch (err) {
    console.error('[admin reports send] erro:', err.message);
    return res.status(500).json({ error: 'Erro ao enviar relatório' });
  }
});

module.exports = router;
