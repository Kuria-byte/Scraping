function generateDataQualityReport(mps) {
  const missing = {
    photo: 0,
    gender: 0,
    party: 0,
    constituency: 0,
    committees: 0,
    contact: 0
  };
  mps.forEach(mp => {
    if (!mp.profilePictureUrl) missing.photo++;
    if (!mp.gender || mp.gender === 'Unknown') missing.gender++;
    if (!mp.party) missing.party++;
    if (!mp.constituency) missing.constituency++;
    if (!mp.committees || mp.committees.length === 0) missing.committees++;
    if (!mp.email || mp.email === 'Not available') missing.contact++;
  });
  return {
    totalMPs: mps.length,
    missing
  };
}

module.exports = { generateDataQualityReport }; 