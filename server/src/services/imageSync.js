/**
 * imageSync — sobe as imagens base64 do Client.data pro object storage (MinIO)
 * e grava as URLs nas tabelas Drizzle (CompanyProfile, TechnicalSheet, Partner).
 *
 * Estratégia F5 (incremental): a cada save, as imagens NOVAS em base64 vão pro
 * MinIO e a URL é gravada na tabela. O base64 PERMANECE no blob (fonte da verdade
 * até o backfill em massa + corte F5) — o coreRead já prefere a URL da tabela e
 * cai pro base64 do blob quando a coluna está vazia. Assim:
 *   - sem MinIO configurado  → no-op (lê do blob, como hoje);
 *   - com MinIO              → uploads novos migram pro storage, leitura usa URL.
 *
 * Best-effort: NUNCA lança (roda no .catch/.finally do save, não pode bloquear).
 * Roda DEPOIS do coreSync (que projeta as linhas) — aqui só fazemos UPDATE das
 * colunas de imagem nas linhas já criadas, casando por clientId + legacyId.
 */
const { eq, and } = require('drizzle-orm');
const { uploadDataUrl, isConfigured } = require('./storage');

const first = (...v) => v.find((x) => x !== undefined && x !== null && x !== '');
const isB64Image = (v) => typeof v === 'string' && /^data:image\//i.test(v);

/**
 * @param {object} db   drizzle db
 * @param {object} s    schema (require('../db/schema'))
 * @param {string} clientId
 * @param {object} data Client.data já parseado
 * @returns {Promise<{skipped?:boolean, uploaded?:number, error?:string}>}
 */
async function syncClientImages(db, s, clientId, data) {
  if (!isConfigured()) return { skipped: true };
  if (!data || typeof data !== 'object') return { uploaded: 0 };
  const fd = data.formData || {};
  const op = data.operational || {};
  let uploaded = 0;

  try {
    // 1) CompanyProfile (1 linha por cliente) — logo + foto do dono.
    const logoSrc = first(fd.identity && fd.identity.business_logo, data.restaurant && data.restaurant.logo);
    const ownerSrc = first(data.user && data.user.photo, data.profile && data.profile.photo, fd.user_info && fd.user_info.user_photo);
    const cpSet = {};
    if (isB64Image(logoSrc)) { const u = await uploadDataUrl(logoSrc, `clients/${clientId}/logo`); if (u) { cpSet.businessLogo = u; uploaded++; } }
    if (isB64Image(ownerSrc)) { const u = await uploadDataUrl(ownerSrc, `clients/${clientId}/owner`); if (u) { cpSet.ownerPhoto = u; uploaded++; } }
    if (Object.keys(cpSet).length) {
      cpSet.updatedAt = new Date();
      cpSet.modifiedBy = 'imageSync';
      await db.update(s.companyProfile).set(cpSet).where(eq(s.companyProfile.clientId, clientId));
    }

    // 2) TechnicalSheet.dishPhoto — casa por legacyId (= String(ficha.id)).
    for (const f of (op.fichas || [])) {
      if (!f || f.id == null || !isB64Image(f.fotoPrato)) continue;
      const u = await uploadDataUrl(f.fotoPrato, `clients/${clientId}/fichas/${f.id}`);
      if (!u) continue;
      await db.update(s.technicalSheet)
        .set({ dishPhoto: u, updatedAt: new Date(), modifiedBy: 'imageSync' })
        .where(and(eq(s.technicalSheet.clientId, clientId), eq(s.technicalSheet.legacyId, String(f.id))));
      uploaded++;
    }

    // 3) Partner.photoUrl — casa por legacyId (= String(partner.id)).
    for (const p of (fd.partners || [])) {
      if (!p || p.id == null || !isB64Image(p.photo)) continue;
      const u = await uploadDataUrl(p.photo, `clients/${clientId}/partners/${p.id}`);
      if (!u) continue;
      await db.update(s.partner)
        .set({ photoUrl: u, updatedAt: new Date(), modifiedBy: 'imageSync' })
        .where(and(eq(s.partner.clientId, clientId), eq(s.partner.legacyId, String(p.id))));
      uploaded++;
    }

    return { uploaded };
  } catch (err) {
    console.error('[imageSync] falhou:', err && err.message ? err.message : err);
    return { error: err && err.message };
  }
}

module.exports = { syncClientImages };
