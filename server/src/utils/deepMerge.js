/**
 * deepMerge — Recursive merge utility for partial client.data patches.
 *
 * Semantics:
 *  - Plain objects: merged recursively (keys from `patch` override `base`, others preserved).
 *  - Arrays: REPLACED (not concatenated). This is intentional — the client app treats
 *    arrays like `fichas`, `insumos`, `revenue_history`, `partners`, `employees` as
 *    full lists; concatenation would duplicate entries and corrupt state.
 *  - Primitives (string/number/boolean) and null: overwrite.
 *  - `undefined` values in `patch` are skipped (preserves existing value).
 *
 * Pure function — does not mutate inputs. Returns a new object.
 *
 * @param {object} base   The current saved state (already JSON.parsed).
 * @param {object} patch  Partial patch from the client.
 * @returns {object}      Merged result.
 */
function isPlainObject(v) {
  return v !== null && typeof v === 'object' && !Array.isArray(v);
}

function deepMerge(base, patch) {
  if (!isPlainObject(base)) base = {};
  if (!isPlainObject(patch)) return base;

  const out = { ...base };

  for (const key of Object.keys(patch)) {
    const pv = patch[key];

    if (pv === undefined) continue; // skip undefined — preserve existing

    if (Array.isArray(pv)) {
      // Arrays REPLACE (do not concat). Documented behavior.
      out[key] = pv;
    } else if (isPlainObject(pv)) {
      out[key] = deepMerge(base[key], pv);
    } else {
      // primitive or null — overwrite
      out[key] = pv;
    }
  }

  return out;
}

module.exports = { deepMerge };
