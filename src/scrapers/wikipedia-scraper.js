/**
 * Enhanced Wikipedia Data Enrichment Scraper
 * 
 * This module specializes in extracting rich biographical and career information
 * from Wikipedia pages of Kenya MPs to enhance the existing MP database.
 */

const cheerio = require('cheerio');
const HttpClient = require('../utils/http-client');
const logger = require('../utils/logger');
const { saveCheckpoint } = require('../utils/file-utils');
const { normalizeNameForComparison } = require('../utils/name-utils');

class WikipediaScraper {
  constructor() {
    this.httpClient = new HttpClient();
    this.baseUrl = 'https://en.wikipedia.org';
  }

  /**
   * Find Wikipedia pages for MPs based on their names
   */
  async findWikipediaPages(mps) {
    const mpWithWikipediaUrls = [];
    const batchSize = 5; // Process MPs in small batches

    for (let i = 0; i < mps.length; i += batchSize) {
      const batch = mps.slice(i, i + batchSize);
      const batchPromises = batch.map(mp => this.findWikipediaPage(mp));
      
      const results = await Promise.all(batchPromises);
      mpWithWikipediaUrls.push(...results);
      
      logger.info(`Processed ${Math.min(i + batchSize, mps.length)}/${mps.length} MPs`);
      
      // Save progress checkpoint
      if (mpWithWikipediaUrls.length > 0) {
        saveCheckpoint('wikipedia_url_search', mpWithWikipediaUrls);
      }
      
      // Add a delay between batches
      if (i + batchSize < mps.length) {
        await new Promise(resolve => setTimeout(resolve, 2000));
      }
    }

    return mpWithWikipediaUrls;
  }

  /**
   * Find Wikipedia page for a single MP
   */
  async findWikipediaPage(mp) {
    const enrichedMp = { ...mp };
    const searchQuery = `${mp.name} Kenya MP`;
    
    try {
      logger.info(`Searching for Wikipedia page for: ${mp.name}`);
      
      // Construct search URL
      const searchUrl = `${this.baseUrl}/w/index.php?search=${encodeURIComponent(searchQuery)}&title=Special:Search&profile=advanced&fulltext=1&ns0=1`;
      
      const html = await this.httpClient.get(searchUrl);
      const $ = cheerio.load(html);
      
      // Check for direct match (Wikipedia redirects to page if exact match found)
      const title = $('h1#firstHeading').text().trim();
      const currentUrl = $('link[rel="canonical"]').attr('href');
      
      if (currentUrl && !currentUrl.includes('Special:Search')) {
        // We were redirected to an exact match
        enrichedMp.wikipediaUrl = currentUrl;
        enrichedMp.wikipediaTitle = title;
        logger.info(`Direct match found for ${mp.name}: ${currentUrl}`);
        return enrichedMp;
      }
      
      // Look for search results
      const searchResults = $('.mw-search-result-heading a');
      
      if (searchResults.length > 0) {
        // Get the first result
        const firstResultHref = $(searchResults[0]).attr('href');
        const firstResultTitle = $(searchResults[0]).text().trim();
        
        if (firstResultHref) {
          const wikipediaUrl = `${this.baseUrl}${firstResultHref}`;
          enrichedMp.wikipediaUrl = wikipediaUrl;
          enrichedMp.wikipediaTitle = firstResultTitle;
          logger.info(`Search result found for ${mp.name}: ${wikipediaUrl}`);
        }
      } else {
        logger.warn(`No Wikipedia page found for ${mp.name}`);
      }
    } catch (error) {
      logger.error(`Error finding Wikipedia page for ${mp.name}: ${error.message}`);
    }
    
    return enrichedMp;
  }

  /**
   * Enrich MP data with information from their Wikipedia pages
   */
  async enrichMPsWithWikipediaData(mps) {
    const enrichedMPs = [];
    const batchSize = 3; // Process MPs in small batches
    
    for (let i = 0; i < mps.length; i += batchSize) {
      const batch = mps.slice(i, i + batchSize);
      const batchPromises = batch.map(mp => {
        if (mp.wikipediaUrl) {
          return this.extractMPDetails(mp);
        }
        return Promise.resolve(mp);
      });
      
      const results = await Promise.all(batchPromises);
      enrichedMPs.push(...results);
      
      logger.info(`Enriched ${Math.min(i + batchSize, mps.length)}/${mps.length} MPs`);
      
      // Save progress checkpoint
      if (enrichedMPs.length > 0) {
        saveCheckpoint('wikipedia_enrichment', enrichedMPs);
      }
      
      // Add a delay between batches
      if (i + batchSize < mps.length) {
        await new Promise(resolve => setTimeout(resolve, 2000));
      }
    }
    
    return enrichedMPs;
  }

  /**
   * Extract detailed information from a single MP's Wikipedia page
   */
  async extractMPDetails(mp) {
    const enrichedMp = { ...mp };
    enrichedMp.wikipediaData = {};
    
    try {
      logger.info(`Extracting details from Wikipedia for: ${mp.name}`);
      
      const html = await this.httpClient.get(mp.wikipediaUrl);
      const $ = cheerio.load(html);
      
      // Extract basic information
      enrichedMp.wikipediaData.biography = this.extractBiography($);
      enrichedMp.wikipediaData.shortDescription = $('.shortdescription').text().trim();
      
      // Extract infobox data (rich structured information)
      enrichedMp.wikipediaData.infobox = this.extractInfoboxData($);
      
      // Extract political career
      enrichedMp.wikipediaData.politicalCareer = this.extractPoliticalCareer($);
      
      // Extract committees
      enrichedMp.wikipediaData.committees = this.extractCommittees($);
      
      // Extract election results
      enrichedMp.wikipediaData.electionResults = this.extractElectionResults($);
      
      // Extract personal details
      enrichedMp.wikipediaData.personalDetails = this.extractPersonalDetails($);
      
      // Extract controversies
      enrichedMp.wikipediaData.controversies = this.extractControversies($);
      
      // Extract education
      enrichedMp.wikipediaData.education = this.extractEducation($);
      
      // Extract categories
      enrichedMp.wikipediaData.categories = this.extractCategories($);
      
      // Extract image URL
      const imageUrl = this.extractImage($);
      if (imageUrl) {
        enrichedMp.wikipediaData.imageUrl = imageUrl;
      }
      
      // Add source information
      enrichedMp.wikipediaData.source = mp.wikipediaUrl;
      enrichedMp.wikipediaData.extractedDate = new Date().toISOString();
      
      // Add to data sources
      if (!enrichedMp.dataSources) {
        enrichedMp.dataSources = [];
      }
      if (!enrichedMp.dataSources.includes('wikipedia')) {
        enrichedMp.dataSources.push('wikipedia');
      }
      
      logger.info(`Successfully extracted Wikipedia details for: ${mp.name}`);
    } catch (error) {
      logger.error(`Error extracting Wikipedia details for ${mp.name}: ${error.message}`);
    }
    
    return enrichedMp;
  }

  /**
   * Extract main biography text
   */
  extractBiography($) {
    // Get the first paragraph, which usually contains biographical info
    const firstPara = $('#mw-content-text > .mw-parser-output > p').first().text().trim();
    
    // If first para is very short, include more paragraphs
    if (firstPara.length < 50) {
      const bioParagraphs = [];
      $('#mw-content-text > .mw-parser-output > p').slice(0, 3).each((i, el) => {
        const paraText = $(el).text().trim();
        if (paraText.length > 0) {
          bioParagraphs.push(paraText);
        }
      });
      return bioParagraphs.join('\n\n');
    }
    
    return firstPara;
  }

  /**
   * Extract data from the infobox
   */
  extractInfoboxData($) {
    const infobox = {};
    
    // Process infobox
    $('.infobox tr').each((i, row) => {
      const header = $(row).find('th').text().trim();
      const value = $(row).find('td').text().trim();
      
      if (header && value) {
        // Clean up the value - remove citation numbers
        const cleanValue = value.replace(/\[\d+\]/g, '').trim();
        infobox[header] = cleanValue;
      }
    });
    
    // Specific extractions for politician infobox
    const specificFields = [
      { selector: '.infobox th.infobox-above', key: 'name' },
      { selector: '.infobox .honorific-suffix', key: 'suffix' },
      { selector: 'th:contains("Member of Parliament") + td, .infobox-header:contains("Member of Parliament") + .infobox-data', key: 'constituency' },
      { selector: 'th:contains("In office") + td, th:contains("Assumed office") + td', key: 'term' },
      { selector: 'th:contains("Political party") + td', key: 'party' },
      { selector: 'th:contains("Born") + td', key: 'birthDetails' },
      { selector: 'th:contains("Nationality") + td', key: 'nationality' },
      { selector: 'th:contains("Majority") + td', key: 'majority' }
    ];
    
    specificFields.forEach(field => {
      const element = $(field.selector).first();
      if (element.length) {
        infobox[field.key] = element.text().trim().replace(/\[\d+\]/g, '');
      }
    });
    
    return infobox;
  }

  /**
   * Extract political career information
   */
  extractPoliticalCareer($) {
    const politicalCareer = [];
    
    // Find political career section
    const politicalCareerSection = $('#Political_career, #Political_life, #Career').closest('h2');
    
    if (politicalCareerSection.length) {
      let current = politicalCareerSection.next();
      
      while (current.length && !current.is('h2')) {
        if (current.is('p')) {
          const text = current.text().trim();
          if (text) {
            politicalCareer.push(text);
          }
        } else if (current.is('ul')) {
          current.find('li').each((i, item) => {
            politicalCareer.push('• ' + $(item).text().trim());
          });
        }
        current = current.next();
      }
    }
    
    // If no political career section, look for general career information
    if (politicalCareer.length === 0) {
      $('#mw-content-text > .mw-parser-output > p').each((i, para) => {
        const text = $(para).text().trim();
        if (text.includes('elected') || 
            text.includes('parliament') || 
            text.includes('committee') || 
            text.includes('constituency') || 
            text.includes('served') || 
            text.includes('represent')) {
          politicalCareer.push(text);
        }
      });
    }
    
    return politicalCareer;
  }

  /**
   * Extract committee memberships
   */
  extractCommittees($) {
    const committees = [];
    
    // First look for direct mentions of committee membership in text
    const committeeMentions = [];
    $('#mw-content-text p').each((i, para) => {
      const text = $(para).text();
      
      // Advanced pattern matching for committee mentions
      const matches = text.match(/(?:member|chair(?:man|person)?|vice[\s-]chair(?:man|person)?) of (?:the )?(?:Departmental )?Committee on ([^.,]+)/gi);
      
      if (matches) {
        matches.forEach(match => {
          const committee = match.replace(/member of (?:the )?(?:Departmental )?Committee on /i, '').trim();
          committeeMentions.push(committee);
        });
      }
      
      // Look for specific committee phrases
      if (text.includes('Committee') && 
         (text.includes('member of') || text.includes('chairman of') || text.includes('served on'))) {
        committeeMentions.push(text);
      }
    });
    
    // Add unique committee mentions
    new Set(committeeMentions).forEach(committee => {
      committees.push(committee);
    });
    
    return committees;
  }

  /**
   * Extract election results information
   */
  extractElectionResults($) {
    const elections = [];
    
    // Find election results tables
    $('.wikitable').each((i, table) => {
      const caption = $(table).find('caption').text().trim();
      
      // Check if this appears to be an election results table
      if (caption.includes('election') || $(table).find('th').text().includes('Votes') || $(table).find('th').text().includes('Party')) {
        const election = {
          title: caption || `Election ${i+1}`,
          results: []
        };
        
        // Extract headers
        const headers = [];
        $(table).find('tr:first-child th').each((j, th) => {
          headers.push($(th).text().trim());
        });
        
        // Extract rows
        $(table).find('tr:not(:first-child)').each((j, tr) => {
          const row = {};
          
          $(tr).find('td').each((k, td) => {
            if (headers[k]) {
              row[headers[k]] = $(td).text().trim();
            }
          });
          
          // Only add rows with meaningful data
          if (Object.keys(row).length > 0) {
            election.results.push(row);
          }
        });
        
        elections.push(election);
      }
    });
    
    return elections;
  }

  /**
   * Extract personal details
   */
  extractPersonalDetails($) {
    const personalDetails = {};
    
    // Extract birth information
    const birthRegex = /born (?:on )?(.*?)(?:in|,|\(|\[|\)|\]|$)/i;
    const biography = this.extractBiography($);
    
    const birthMatch = biography.match(birthRegex);
    if (birthMatch && birthMatch[1]) {
      personalDetails.birth = birthMatch[1].trim();
    }
    
    // Extract place of birth
    const birthPlaceRegex = /born (?:on )?(?:.*?)(?:in|,) ([^()\[\]]+)/i;
    const birthPlaceMatch = biography.match(birthPlaceRegex);
    if (birthPlaceMatch && birthPlaceMatch[1]) {
      personalDetails.birthPlace = birthPlaceMatch[1].trim();
    }
    
    // Extract education if mentioned in biography
    const educationRegex = /(?:educated|studied|graduate[d]?) (?:at|from) ([^.]+)/i;
    const educationMatch = biography.match(educationRegex);
    if (educationMatch && educationMatch[1]) {
      personalDetails.education = educationMatch[1].trim();
    }
    
    // Look for specific personal information sections
    $('#Personal_life, #Early_life, #Background, #Education').each((i, section) => {
      const sectionTitle = $(section).text().trim();
      let content = '';
      
      let current = $(section).closest('h2, h3').next();
      while (current.length && !current.is('h2, h3')) {
        if (current.is('p')) {
          content += ' ' + current.text().trim();
        }
        current = current.next();
      }
      
      if (content) {
        personalDetails[sectionTitle.toLowerCase()] = content.trim();
      }
    });
    
    return personalDetails;
  }

  /**
   * Extract controversies and legal issues
   */
  extractControversies($) {
    const controversies = [];
    
    // Find controversy sections
    $('#Controversy, #Controversies, #Legal_issues, #Corruption_allegations, #Scandal, #Criminal_charges').each((i, section) => {
      const sectionHeading = $(section).text().trim();
      const sectionData = {
        title: sectionHeading,
        details: []
      };
      
      let current = $(section).closest('h2, h3').next();
      while (current.length && !current.is('h2, h3')) {
        if (current.is('p')) {
          const text = current.text().trim();
          if (text) {
            sectionData.details.push(text);
          }
        } else if (current.is('ul')) {
          current.find('li').each((j, item) => {
            sectionData.details.push('• ' + $(item).text().trim());
          });
        }
        current = current.next();
      }
      
      if (sectionData.details.length > 0) {
        controversies.push(sectionData);
      }
    });
    
    // Check for subsections that might indicate controversies
    $('h3, h4').each((i, heading) => {
      const headingText = $(heading).text().toLowerCase();
      
      if (headingText.includes('allegation') || 
          headingText.includes('controversy') || 
          headingText.includes('scandal') || 
          headingText.includes('corruption') || 
          headingText.includes('charge') || 
          headingText.includes('investigation')) {
        
        const sectionData = {
          title: $(heading).text().trim(),
          details: []
        };
        
        let current = $(heading).next();
        while (current.length && !current.is('h3, h4, h2')) {
          if (current.is('p')) {
            const text = current.text().trim();
            if (text) {
              sectionData.details.push(text);
            }
          }
          current = current.next();
        }
        
        if (sectionData.details.length > 0) {
          controversies.push(sectionData);
        }
      }
    });
    
    return controversies;
  }

  /**
   * Extract education information
   */
  extractEducation($) {
    const education = [];
    
    // Look for education section
    const educationSection = $('#Education, #Academic_background, #Educational_background').closest('h2, h3');
    
    if (educationSection.length) {
      let current = educationSection.next();
      
      while (current.length && !current.is('h2, h3')) {
        if (current.is('p')) {
          const text = current.text().trim();
          if (text) {
            education.push(text);
          }
        } else if (current.is('ul')) {
          current.find('li').each((i, item) => {
            education.push('• ' + $(item).text().trim());
          });
        }
        current = current.next();
      }
    }
    
    // If no dedicated section, look for education mentions in text
    if (education.length === 0) {
      $('#mw-content-text p').each((i, para) => {
        const text = $(para).text();
        if (text.includes('education') || 
            text.includes('university') || 
            text.includes('college') || 
            text.includes('school') || 
            text.includes('degree') || 
            text.includes('diploma')) {
          education.push(text);
        }
      });
    }
    
    return education;
  }

  /**
   * Extract image URL from the page
   */
  extractImage($) {
    // Try to get image from infobox first
    const infoboxImage = $('.infobox img').first();
    if (infoboxImage.length) {
      let imgSrc = infoboxImage.attr('src');
      
      // Fix relative URLs
      if (imgSrc && imgSrc.startsWith('//')) {
        imgSrc = 'https:' + imgSrc;
      }
      
      return imgSrc;
    }
    
    // Try other images
    const otherImage = $('#mw-content-text img').first();
    if (otherImage.length) {
      let imgSrc = otherImage.attr('src');
      
      // Fix relative URLs
      if (imgSrc && imgSrc.startsWith('//')) {
        imgSrc = 'https:' + imgSrc;
      }
      
      return imgSrc;
    }
    
    return null;
  }

  /**
   * Extract categories from the page
   */
  extractCategories($) {
    const categories = [];
    
    $('#mw-normal-catlinks li').each((i, li) => {
      categories.push($(li).text().trim());
    });
    
    return categories;
  }

  /**
   * Update existing MPs with Wikipedia data
   */
  mergeWikipediaData(existingMPs, enrichedMPs) {
    const mpsByName = {};
    
    // Create map of existing MPs
    existingMPs.forEach(mp => {
      const normalizedName = normalizeNameForComparison(mp.name);
      mpsByName[normalizedName] = mp;
    });
    
    // Update with Wikipedia data
    enrichedMPs.forEach(enrichedMP => {
      const normalizedName = normalizeNameForComparison(enrichedMP.name);
      
      if (mpsByName[normalizedName]) {
        // Update existing MP with Wikipedia data
        mpsByName[normalizedName].wikipediaUrl = enrichedMP.wikipediaUrl;
        mpsByName[normalizedName].wikipediaData = enrichedMP.wikipediaData;
        
        // Add dataSources if not already present
        if (!mpsByName[normalizedName].dataSources) {
          mpsByName[normalizedName].dataSources = ['parliament'];
        }
        if (!mpsByName[normalizedName].dataSources.includes('wikipedia')) {
          mpsByName[normalizedName].dataSources.push('wikipedia');
        }
        
        // Update missing fields from Wikipedia data
        this.updateMissingFields(mpsByName[normalizedName], enrichedMP);
      } else {
        // This is a new MP found only on Wikipedia
        existingMPs.push(enrichedMP);
      }
    });
    
    return existingMPs;
  }

  /**
   * Update missing fields in an MP record with data from Wikipedia
   */
  updateMissingFields(mp, wikipediaMP) {
    // List of fields to update if missing
    const fieldsToUpdate = [
      'constituency', 
      'county', 
      'party', 
      'gender',
      'profilePictureUrl'
    ];
    
    fieldsToUpdate.forEach(field => {
      if (!mp[field] && wikipediaMP[field]) {
        mp[field] = wikipediaMP[field];
      }
    });
    
    // Handle specific infobox data
    if (wikipediaMP.wikipediaData && wikipediaMP.wikipediaData.infobox) {
      const infobox = wikipediaMP.wikipediaData.infobox;
      
      // Update constituency if missing
      if (!mp.constituency && infobox.constituency) {
        mp.constituency = infobox.constituency;
      }
      
      // Update party if missing
      if (!mp.party && infobox['Political party']) {
        mp.party = infobox['Political party'];
      }
      
      // Update gender if missing
      if (!mp.gender || mp.gender === 'Unknown') {
        // Try to infer gender from pronouns in biography
        if (wikipediaMP.wikipediaData.biography) {
          const text = wikipediaMP.wikipediaData.biography.toLowerCase();
          if (text.includes(' he ') || text.includes(' his ')) {
            mp.gender = 'Male';
          } else if (text.includes(' she ') || text.includes(' her ')) {
            mp.gender = 'Female';
          }
        }
      }
      
      // Add profile picture if available
      if (!mp.profilePictureUrl && wikipediaMP.wikipediaData.imageUrl) {
        mp.profilePictureUrl = wikipediaMP.wikipediaData.imageUrl;
      }
      
      // Add committees if available
      if ((!mp.committees || mp.committees.length === 0) && 
          wikipediaMP.wikipediaData.committees && 
          wikipediaMP.wikipediaData.committees.length > 0) {
        mp.committees = wikipediaMP.wikipediaData.committees;
      }
    }
    
    return mp;
  }

  /**
   * Main process to enrich MPs with Wikipedia data
   */
  async enrichMPsWithWikipedia(mps) {
    logger.info(`Starting Wikipedia enrichment for ${mps.length} MPs`);
    
    // Step 1: Find Wikipedia pages for MPs
    logger.info('Step 1: Finding Wikipedia pages for MPs');
    const mpsWithWikipediaUrls = await this.findWikipediaPages(mps);
    
    // Step 2: Extract detailed information from Wikipedia pages
    logger.info('Step 2: Extracting detailed information from Wikipedia pages');
    const mpsWithWikipediaFiltered = mpsWithWikipediaUrls.filter(mp => mp.wikipediaUrl);
    logger.info(`Found Wikipedia pages for ${mpsWithWikipediaFiltered.length} MPs`);
    
    const enrichedMPs = await this.enrichMPsWithWikipediaData(mpsWithWikipediaFiltered);
    
    // Step 3: Merge Wikipedia data with existing MPs
    logger.info('Step 3: Merging Wikipedia data with existing MPs');
    const mergedMPs = this.mergeWikipediaData(mps, enrichedMPs);
    
    logger.info(`Wikipedia enrichment completed for ${mps.length} MPs`);
    
    return mergedMPs;
  }
}

module.exports = WikipediaScraper;