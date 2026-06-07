/**
 * Money helpers — keep currency math consistent across modules.
 */

// Round to 2 decimal places (satang), avoiding binary float artefacts.
const round2 = (n) => Math.round((Number(n) + Number.EPSILON) * 100) / 100

/**
 * Extract the VAT portion from a VAT-INCLUSIVE amount (Thai retail model:
 * the displayed/selling price already contains VAT). Used by POS sales & returns
 * so both always use the identical formula.
 * @param {number} inclusiveAmount - amount that already includes VAT
 * @param {number} vatRatePercent - e.g. 7 for 7%
 * @returns {number} VAT amount, rounded to 2 decimals
 */
const vatFromInclusive = (inclusiveAmount, vatRatePercent) =>
  vatRatePercent > 0 ? round2((inclusiveAmount * vatRatePercent) / (100 + vatRatePercent)) : 0

module.exports = { round2, vatFromInclusive }
