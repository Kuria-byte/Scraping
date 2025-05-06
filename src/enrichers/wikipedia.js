class WikipediaEnricher {
  constructor() {}

  enrich(mps) {
    return mps.map(mp => {
      if (mp.wikipediaData && mp.wikipediaData.biography) {
        mp.biography = mp.wikipediaData.biography;
      }
      if (mp.wikipediaData && mp.wikipediaData.imageUrl) {
        mp.profilePictureUrl = mp.profilePictureUrl || mp.wikipediaData.imageUrl;
      }
      return mp;
    });
  }
}

module.exports = WikipediaEnricher; 