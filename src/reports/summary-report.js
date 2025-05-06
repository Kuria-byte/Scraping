function generateSummaryReport(mps) {
  const byParty = {};
  const byCounty = {};
  const byGender = {};
  mps.forEach(mp => {
    if (mp.party) byParty[mp.party] = (byParty[mp.party] || 0) + 1;
    if (mp.county) byCounty[mp.county] = (byCounty[mp.county] || 0) + 1;
    if (mp.gender) byGender[mp.gender] = (byGender[mp.gender] || 0) + 1;
  });
  return {
    totalMPs: mps.length,
    byParty,
    byCounty,
    byGender
  };
}

module.exports = { generateSummaryReport }; 