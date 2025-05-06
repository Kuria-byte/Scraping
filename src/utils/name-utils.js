/**
 * Normalize a name for comparison purposes
 */
function normalizeNameForComparison(name) {
  return name
    .toUpperCase()
    .replace(/HON\.?\s*/, '')
    .replace(/\(.*?\)/, '')  // Remove parenthetical content
    .replace(/DR\.?\s*/, '')
    .replace(/PROF\.?\s*/, '')
    .replace(/ENG\.?\s*/, '')
    .replace(/AMB\.?\s*/, '')
    .replace(/CPA\.?\s*/, '')
    .replace(/COL\.?\s*RTD\.?\s*/, '')
    .replace(/,/g, ' ')  // Replace commas with spaces
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Infer gender from name and title
 */
function inferGender(name) {
  if (name.includes('(MS.)') || name.includes('(MRS.)') || 
      name.includes(' MS ') || name.includes(' MRS ')) {
    return 'Female';
  } else if (name.includes('(MR.)') || name.includes(' MR ')) {
    return 'Male';
  }
  // More sophisticated gender inference using common names
  const maleIndicators = ["JOHN", "DAVID", "PAUL", "GEORGE", "MOSES"];
  const femaleIndicators = ["MARY", "GLADYS", "JOYCE", "ESTHER", "SARAH"];
  const nameUpper = name.toUpperCase();
  if (maleIndicators.some(indicator => nameUpper.includes(indicator))) {
    return 'Male';
  } else if (femaleIndicators.some(indicator => nameUpper.includes(indicator))) {
    return 'Female';
  }
  return 'Unknown';
}

module.exports = {
  normalizeNameForComparison,
  inferGender
}; 