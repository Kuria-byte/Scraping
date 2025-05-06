const committeeMap = {
  'HON. MOSES WETANGULA': ['House Business Committee'],
  "HON. KIMANI ICHUNG'WAH": ['Budget and Appropriations Committee'],
  // ... add more as needed
};

class CommitteesEnricher {
  constructor() {}

  enrich(mps) {
    return mps.map(mp => {
      const normalized = mp.name.toUpperCase().replace(/\s+/g, ' ').trim();
      if (committeeMap[normalized]) {
        mp.committees = Array.from(new Set([...(mp.committees || []), ...committeeMap[normalized]]));
      }
      return mp;
    });
  }
}

module.exports = CommitteesEnricher; 