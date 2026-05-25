const nodemailer = require('nodemailer');

// SMTP_PASS é obrigatório — sem fallback (sec-auditor #2).
// host/port/user têm defaults pra Hostinger porque não são secretos.
if (!process.env.SMTP_PASS) {
  throw new Error(
    '[emailService] SMTP_PASS obrigatório no .env. ' +
    'Configure as credenciais SMTP em server/.env (dev) ou Easypanel (prod).'
  );
}

const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST || 'smtp.hostinger.com',
  port: parseInt(process.env.SMTP_PORT || '465'),
  secure: true, // SSL
  auth: {
    user: process.env.SMTP_USER || 'no-reply@breakr.com.br',
    pass: process.env.SMTP_PASS
  }
});

const APP_URL = process.env.APP_URL || 'https://app.breakr.com.br';

// ============================================
// BREAKR EMAIL TEMPLATE SYSTEM
// ============================================

const emailWrapper = (content) => `
<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8"/>
  <meta name="viewport" content="width=device-width,initial-scale=1"/>
  <title>Breakr</title>
</head>
<body style="margin:0;padding:0;background:#F5F5F5;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;-webkit-font-smoothing:antialiased;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#F5F5F5;padding:32px 16px;">
    <tr><td align="center">
      <table width="580" cellpadding="0" cellspacing="0" style="background:#FFFFFF;border-radius:16px;overflow:hidden;box-shadow:0 2px 12px rgba(0,0,0,0.06);">

        <!-- Logo Header — logo oficial da Breakr (wordmark + raio + tagline
             "Assessoria Gastronomica" + simbolo ®). Hospedada como JPEG
             estatico em /email-logo.jpeg (servida pelo Express estatico).
             JPEG tem suporte universal em clientes de email (Gmail, Apple
             Mail, Outlook 2010+, Yahoo, ProtonMail) — diferente de SVG que
             nao renderiza no Outlook desktop.

             Imagem quadrada (1080x1080) exibida em 180x180px. O JPEG ja
             traz fundo preto, entao o <td> tambem usa background preto pra
             eliminar qualquer borda visivel entre celula e imagem.

             Fallback: ALT "Breakr — Assessoria Gastronomica" caso o cliente
             bloqueie imagens remotas. -->
        <tr>
          <td align="center" style="padding:24px 40px;border-bottom:1px solid #F0F0F0;background:#000;">
            <img
              src="${APP_URL}/email-logo.jpeg"
              width="180" height="180" alt="Breakr — Assessoria Gastronômica"
              style="display:block;width:180px;height:180px;border:0;outline:none;border-radius:12px;"
            />
          </td>
        </tr>

        <!-- Content -->
        <tr>
          <td style="padding:32px 40px 36px;">
            ${content}
          </td>
        </tr>

        <!-- Footer -->
        <tr>
          <td style="padding:20px 40px 24px;border-top:1px solid #F0F0F0;background:#FAFAFA;">
            <p style="margin:0 0 4px;font-size:12px;color:#999;text-align:center;">
              Precisa de ajuda? Responda este email ou acesse nosso suporte.
            </p>
            <p style="margin:0;font-size:11px;color:#CCC;text-align:center;">
              Breakr &mdash; Inteligência para Restaurantes &bull; <a href="${APP_URL}" style="color:#F5A623;text-decoration:none;">breakr.com.br</a>
            </p>
          </td>
        </tr>

      </table>
    </td></tr>
  </table>
</body>
</html>`;

const ctaButton = (text, href) => `
<table cellpadding="0" cellspacing="0" style="margin:28px 0;">
  <tr>
    <td style="background:#F5A623;border-radius:12px;padding:14px 36px;">
      <a href="${href}" style="color:#000;font-size:15px;font-weight:700;text-decoration:none;display:block;">${text}</a>
    </td>
  </tr>
</table>`;

const infoBox = (content) => `
<table width="100%" cellpadding="0" cellspacing="0" style="background:#F9F9F9;border:1px solid #F0F0F0;border-radius:12px;margin:20px 0;">
  <tr>
    <td style="padding:20px 24px;">
      ${content}
    </td>
  </tr>
</table>`;

// ============================================
// EMAIL FUNCTIONS
// ============================================

/**
 * Welcome email — sent when a new client is created
 */
async function sendWelcomeEmail({ to, clientName, hash }) {
  const onboardingLink = `${APP_URL}?hash=${hash}`;

  // Copy revisado pelo Gustavo (2026-05-25): mensagem de boas-vindas
  // mais aspiracional, com 6 bullets cobrindo onboarding + fichas +
  // money-on-the-table + engenharia de menu + financeiro + "muito mais".
  const content = `
    <p style="margin:0 0 8px;font-size:20px;font-weight:700;color:#111;">
      Olá, ${clientName}!
    </p>
    <p style="margin:0 0 24px;font-size:15px;line-height:1.7;color:#666;">
      Sua conta no <strong style="color:#111;">Breakr</strong> foi criada. Acesse agora e configure as informações do seu restaurante para começar a usar a plataforma e colher os primeiros resultados.
    </p>

    <p style="margin:0 0 12px;font-size:15px;font-weight:600;color:#333;">Comece agora:</p>
    <table cellpadding="0" cellspacing="0" style="margin:0 0 4px;">
      <tr><td style="padding:6px 0;font-size:14px;color:#666;line-height:1.5;">
        &bull;&nbsp; Preencha o onboarding com os dados do seu restaurante,
      </td></tr>
      <tr><td style="padding:6px 0;font-size:14px;color:#666;line-height:1.5;">
        &bull;&nbsp; Cadastre suas fichas técnicas e insumos,
      </td></tr>
      <tr><td style="padding:6px 0;font-size:14px;color:#666;line-height:1.5;">
        &bull;&nbsp; Descubra quanto dinheiro você está deixando na mesa,
      </td></tr>
      <tr><td style="padding:6px 0;font-size:14px;color:#666;line-height:1.5;">
        &bull;&nbsp; Multiplique seu lucro com nossa engenharia de menu,
      </td></tr>
      <tr><td style="padding:6px 0;font-size:14px;color:#666;line-height:1.5;">
        &bull;&nbsp; Tenha uma visão macro com nosso financeiro,
      </td></tr>
      <tr><td style="padding:6px 0;font-size:14px;color:#666;line-height:1.5;">
        &bull;&nbsp; E muito mais!
      </td></tr>
    </table>

    ${ctaButton('Acessar o Breakr', onboardingLink)}

    <p style="margin:0;font-size:12px;color:#BBB;line-height:1.5;">
      Ou copie e cole este link no navegador:<br/>
      <a href="${onboardingLink}" style="color:#F5A623;text-decoration:none;word-break:break-all;font-size:11px;">${onboardingLink}</a>
    </p>
  `;

  await transporter.sendMail({
    from: `"Breakr" <no-reply@breakr.com.br>`,
    to,
    subject: 'Bem-vindo ao Breakr!',
    html: emailWrapper(content)
  });
}

/**
 * Credential reset email — sent when admin resets a client's password
 */
async function sendCredentialResetEmail({ to, clientName, newPassword }) {
  const content = `
    <p style="margin:0 0 8px;font-size:20px;font-weight:700;color:#111;">
      Olá, ${clientName}!
    </p>
    <p style="margin:0 0 20px;font-size:15px;line-height:1.7;color:#666;">
      Suas credenciais de acesso ao Breakr foram atualizadas pelo administrador.
    </p>

    ${infoBox(`
      <p style="margin:0 0 12px;font-size:11px;color:#999;text-transform:uppercase;letter-spacing:1.5px;font-weight:600;">Nova Senha</p>
      <p style="margin:0;font-size:22px;font-weight:800;color:#F5A623;letter-spacing:2px;font-family:monospace;">${newPassword}</p>
    `)}

    <p style="margin:0 0 4px;font-size:14px;color:#666;line-height:1.6;">
      Recomendamos que você altere esta senha após o primeiro acesso.
    </p>

    ${ctaButton('Acessar o Breakr', APP_URL)}
  `;

  await transporter.sendMail({
    from: `"Breakr" <no-reply@breakr.com.br>`,
    to,
    subject: 'Breakr — Suas credenciais foram atualizadas',
    html: emailWrapper(content)
  });
}

/**
 * Password reset code email — sent when client requests password recovery
 */
async function sendPasswordResetEmail({ to, clientName, token }) {
  const content = `
    <p style="margin:0 0 8px;font-size:20px;font-weight:700;color:#111;">
      Olá, ${clientName}!
    </p>
    <p style="margin:0 0 20px;font-size:15px;line-height:1.7;color:#666;">
      Recebemos uma solicitação para redefinir sua senha. Use o código abaixo (válido por 30 minutos):
    </p>

    ${infoBox(`
      <p style="margin:0 0 8px;font-size:11px;color:#999;text-transform:uppercase;letter-spacing:2px;font-weight:600;text-align:center;">Código de verificação</p>
      <p style="margin:0;font-size:36px;font-weight:800;color:#F5A623;letter-spacing:8px;text-align:center;font-family:monospace;">${token}</p>
    `)}

    <p style="margin:0;font-size:13px;color:#999;text-align:center;line-height:1.5;">
      Se não foi você quem solicitou, ignore este email.<br/>
      Sua senha não será alterada.
    </p>
  `;

  await transporter.sendMail({
    from: `"Breakr" <no-reply@breakr.com.br>`,
    to,
    subject: 'Breakr — Código para redefinir sua senha',
    html: emailWrapper(content)
  });
}

/**
 * Trial expiring reminder — disparado quando o Stripe sinaliza
 * `customer.subscription.trial_will_end` (1-2 dias antes do fim).
 *
 * NOTA: O Breakr NÃO oferece trial padrão atualmente. Esta função
 * continua existindo pra casos onde o Stripe envia trials manuais
 * (ex: cortesia aplicada via Dashboard) ou casos legacy. Texto evita
 * prometer "grátis" — só lembra que o período de teste termina.
 */
async function sendTrialExpiringEmail({ to, clientName, daysLeft, hash }) {
  const link = `${APP_URL}?hash=${hash}`;

  const content = `
    <p style="margin:0 0 8px;font-size:20px;font-weight:700;color:#111;">
      ${clientName}, seu período de teste está acabando!
    </p>
    <p style="margin:0 0 20px;font-size:15px;line-height:1.7;color:#666;">
      Você tem apenas <strong style="color:#111;">${daysLeft} dia${daysLeft > 1 ? 's' : ''}</strong> restante${daysLeft > 1 ? 's' : ''} no seu período de teste do Breakr.
    </p>

    <p style="margin:0 0 12px;font-size:15px;font-weight:600;color:#333;">Não perca o que você já construiu:</p>
    <table cellpadding="0" cellspacing="0" style="margin:0 0 4px;">
      <tr><td style="padding:6px 0;font-size:14px;color:#666;line-height:1.5;">
        &bull;&nbsp; Seus dados de onboarding e fichas técnicas
      </td></tr>
      <tr><td style="padding:6px 0;font-size:14px;color:#666;line-height:1.5;">
        &bull;&nbsp; Indicadores financeiros do seu restaurante
      </td></tr>
      <tr><td style="padding:6px 0;font-size:14px;color:#666;line-height:1.5;">
        &bull;&nbsp; Engenharia de cardápio e precificação
      </td></tr>
    </table>

    ${ctaButton('Assinar agora', link)}

    <p style="margin:0;font-size:12px;color:#BBB;text-align:center;">
      Após o término do período de teste, seu acesso será pausado até a assinatura ser ativada.
    </p>
  `;

  await transporter.sendMail({
    from: `"Breakr" <no-reply@breakr.com.br>`,
    to,
    subject: `Breakr — Seu período de teste acaba em ${daysLeft} dia${daysLeft > 1 ? 's' : ''}`,
    html: emailWrapper(content)
  });
}

/**
 * Broadcast notification email — admin can send to all or specific clients
 */
async function sendBroadcastEmail({ to, clientName, title, message }) {
  const content = `
    <p style="margin:0 0 8px;font-size:20px;font-weight:700;color:#111;">
      Olá, ${clientName}!
    </p>

    ${infoBox(`
      <p style="margin:0 0 8px;font-size:16px;font-weight:700;color:#111;">${title}</p>
      <p style="margin:0;font-size:14px;color:#666;line-height:1.7;">${message}</p>
    `)}

    ${ctaButton('Ver no Breakr', APP_URL)}
  `;

  await transporter.sendMail({
    from: `"Breakr" <no-reply@breakr.com.br>`,
    to,
    subject: `Breakr — ${title}`,
    html: emailWrapper(content)
  });
}

module.exports = {
  sendWelcomeEmail,
  sendCredentialResetEmail,
  sendPasswordResetEmail,
  sendTrialExpiringEmail,
  sendBroadcastEmail
};
