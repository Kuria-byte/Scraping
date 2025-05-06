const { inferGender } = require('../utils/name-utils');

class GenderEnricher {
  constructor() {}

  enrich(mps) {
    return mps.map(mp => {
      if (!mp.gender || mp.gender === 'Unknown') {
        mp.gender = inferGender(mp.name);
      }
      return mp;
    });
  }
}

module.exports = GenderEnricher; 