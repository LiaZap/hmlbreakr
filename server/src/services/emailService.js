const nodemailer = require('nodemailer');

const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST || 'smtp.hostinger.com',
  port: parseInt(process.env.SMTP_PORT || '465'),
  secure: true, // SSL
  auth: {
    user: process.env.SMTP_USER || 'no-reply@breakr.com.br',
    pass: process.env.SMTP_PASS || '$Dev-NoReply26_Sistema@'
  }
});

const APP_URL = process.env.APP_URL || 'https://app.breakr.com.br';

/**
 * Sends a welcome email with the onboarding link.
 */
async function sendWelcomeEmail({ to, clientName, hash }) {
  const onboardingLink = `${APP_URL}?hash=${hash}`;

  await transporter.sendMail({
    from: `"Breakr" <no-reply@breakr.com.br>`,
    to,
    subject: 'Bem-vindo ao Breakr — Acesse seu painel',
    html: `
      <!DOCTYPE html>
      <html lang="pt-BR">
      <head><meta charset="UTF-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/></head>
      <body style="margin:0;padding:0;background:#111111;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;">
        <table width="100%" cellpadding="0" cellspacing="0" style="background:#111111;padding:40px 0;">
          <tr><td align="center">
            <table width="520" cellpadding="0" cellspacing="0" style="background:#161616;border-radius:20px;overflow:hidden;border:1px solid #222;">
              <!-- Header -->
              <tr>
                <td style="background:#FF9406;padding:28px 36px;text-align:center;">
                  <span style="font-size:22px;font-weight:800;color:#000;letter-spacing:-0.5px;">Breakr</span>
                </td>
              </tr>
              <!-- Body -->
              <tr>
                <td style="padding:36px 36px 28px;color:#E1E1E1;">
                  <p style="margin:0 0 16px;font-size:15px;line-height:1.6;color:#999;">Olá, <strong style="color:#fff;">${clientName}</strong></p>
                  <p style="margin:0 0 24px;font-size:15px;line-height:1.6;color:#999;">
                    Seu acesso ao painel Breakr está pronto. Clique no botão abaixo para iniciar o preenchimento dos seus dados e começar a enxergar seu negócio de um jeito novo.
                  </p>
                  <!-- CTA Button -->
                  <table cellpadding="0" cellspacing="0" style="margin:0 auto 28px;">
                    <tr>
                      <td style="background:#FF9406;border-radius:12px;padding:14px 32px;">
                        <a href="${onboardingLink}" style="color:#000;font-size:15px;font-weight:700;text-decoration:none;display:block;">
                          Acessar meu painel →
                        </a>
                      </td>
                    </tr>
                  </table>
                  <p style="margin:0 0 6px;font-size:12px;color:#555;text-align:center;">Ou copie o link abaixo:</p>
                  <p style="margin:0;font-size:11px;color:#444;text-align:center;word-break:break-all;">${onboardingLink}</p>
                </td>
              </tr>
              <!-- Footer -->
              <tr>
                <td style="padding:20px 36px;border-top:1px solid #222;text-align:center;">
                  <p style="margin:0;font-size:11px;color:#444;">Este email foi enviado automaticamente pelo sistema Breakr.</p>
                </td>
              </tr>
            </table>
          </td></tr>
        </table>
      </body>
      </html>
    `
  });
}

/**
 * Sends a credential reset email with new password.
 */
async function sendCredentialResetEmail({ to, clientName, newPassword }) {
  await transporter.sendMail({
    from: `"Breakr" <no-reply@breakr.com.br>`,
    to,
    subject: 'Breakr — Suas credenciais foram atualizadas',
    html: `
      <!DOCTYPE html>
      <html lang="pt-BR">
      <head><meta charset="UTF-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/></head>
      <body style="margin:0;padding:0;background:#111111;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;">
        <table width="100%" cellpadding="0" cellspacing="0" style="background:#111111;padding:40px 0;">
          <tr><td align="center">
            <table width="520" cellpadding="0" cellspacing="0" style="background:#161616;border-radius:20px;overflow:hidden;border:1px solid #222;">
              <tr>
                <td style="background:#FF9406;padding:28px 36px;text-align:center;">
                  <span style="font-size:22px;font-weight:800;color:#000;letter-spacing:-0.5px;">Breakr</span>
                </td>
              </tr>
              <tr>
                <td style="padding:36px 36px 28px;color:#E1E1E1;">
                  <p style="margin:0 0 16px;font-size:15px;line-height:1.6;color:#999;">Olá, <strong style="color:#fff;">${clientName}</strong></p>
                  <p style="margin:0 0 24px;font-size:15px;line-height:1.6;color:#999;">
                    Suas credenciais de acesso ao Breakr foram atualizadas pelo administrador.
                  </p>
                  <table width="100%" cellpadding="0" cellspacing="0" style="background:#1F1F1F;border-radius:12px;margin-bottom:24px;">
                    <tr>
                      <td style="padding:18px 20px;">
                        <p style="margin:0 0 8px;font-size:11px;color:#666;text-transform:uppercase;letter-spacing:1px;">Nova Senha</p>
                        <p style="margin:0;font-size:18px;font-weight:700;color:#FF9406;letter-spacing:1px;">${newPassword}</p>
                      </td>
                    </tr>
                  </table>
                  <p style="margin:0 0 6px;font-size:12px;color:#555;text-align:center;">Acesse em:</p>
                  <p style="margin:0;font-size:11px;color:#444;text-align:center;">${APP_URL}</p>
                </td>
              </tr>
              <tr>
                <td style="padding:20px 36px;border-top:1px solid #222;text-align:center;">
                  <p style="margin:0;font-size:11px;color:#444;">Este email foi enviado automaticamente pelo sistema Breakr.</p>
                </td>
              </tr>
            </table>
          </td></tr>
        </table>
      </body>
      </html>
    `
  });
}

module.exports = { sendWelcomeEmail, sendCredentialResetEmail };
