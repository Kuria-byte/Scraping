/**
 * MP data model class
 */
class MP {
  constructor(data = {}) {
    this.name = data.name || '';
    this.gender = data.gender || 'Unknown';
    this.constituency = data.constituency || '';
    this.county = data.county || '';
    this.party = data.party || '';
    this.status = data.status || '';
    this.profilePictureUrl = data.profilePictureUrl || '';
    this.email = data.email || 'Not available';
    this.phone = data.phone || 'Not available';
    this.committees = data.committees || [];
    this.committeeDetails = data.committeeDetails || [];
    this.employmentHistory = data.employmentHistory || [];
    this.leadershipPosition = data.leadershipPosition || '';
    this.wikipediaUrl = data.wikipediaUrl || '';
    this.wikipediaData = data.wikipediaData || {};
    this.newsMentions = data.newsMentions || [];
    this.dataSources = data.dataSources || [];
  }

  /**
   * Add a data source to the MP record
   */
  addDataSource(source) {
    if (!this.dataSources.includes(source)) {
      this.dataSources.push(source);
    }
  }
  
  /**
   * Update MP data from another source
   */
  updateFrom(sourceData, sourceName) {
    // Update basic properties if they're missing
    Object.entries(sourceData).forEach(([key, value]) => {
      // Skip arrays and objects for simple merging
      if (Array.isArray(value) || typeof value === 'object') return;
      // Update if current value is empty
      if (!this[key] && value) {
        this[key] = value;
      }
    });
    // Add the source
    this.addDataSource(sourceName);
    // Merge arrays (committees, employmentHistory)
    ['committees', 'employmentHistory', 'newsMentions'].forEach(arrayProp => {
      if (sourceData[arrayProp] && Array.isArray(sourceData[arrayProp])) {
        // Merge arrays, removing duplicates
        this[arrayProp] = [...new Set([
          ...(this[arrayProp] || []), 
          ...sourceData[arrayProp]
        ])];
      }
    });
    // Handle Wikipedia data separately
    if (sourceData.wikipediaData) {
      this.wikipediaData = { ...(this.wikipediaData || {}), ...sourceData.wikipediaData };
      this.wikipediaUrl = this.wikipediaUrl || sourceData.wikipediaUrl;
    }
    return this;
  }
  
  /**
   * Check if the MP has missing data in important fields
   */
  getMissingFields() {
    const missing = [];
    if (!this.gender || this.gender === 'Unknown') missing.push('gender');
    if (!this.constituency) missing.push('constituency');
    if (!this.county) missing.push('county');
    if (!this.party) missing.push('party');
    if (!this.profilePictureUrl) missing.push('profilePictureUrl');
    if (!this.committees.length) missing.push('committees');
    if (!this.email || this.email === 'Not available') missing.push('email');
    return missing;
  }
}

module.exports = MP; 