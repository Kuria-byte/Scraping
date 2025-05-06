// Example static leadership positions (expand as needed)
const leadershipMap = {
  'HON. MOSES WETANGULA': 'Speaker',
  "HON. KIMANI ICHUNG'WAH": 'Majority Leader',
  'HON. OPARANYA WYCLIFFE': 'Minority Leader',
  // ... add more as needed
};

class LeadershipEnricher {
  constructor() {}

  enrich(mps) {
    return mps.map(mp => {
      const normalized = mp.name.toUpperCase().replace(/\s+/g, ' ').trim();
      if (leadershipMap[normalized]) {
        mp.leadershipPosition = leadershipMap[normalized];
      }
      return mp;
    });
  }
}

module.exports = LeadershipEnricher; 