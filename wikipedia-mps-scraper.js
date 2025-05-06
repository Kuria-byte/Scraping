/**
 * Enhanced Wikipedia Scraper for Kenya MPs
 * Extracts detailed biographical and career information from Wikipedia
 */

const cheerio = require('cheerio');
const path = require('path');
const HttpClient = require('../utils/http-client');
const logger = require('../utils/logger');
const { saveCheckpoint, findLatestCheckpoint } = require('../utils/file-utils');
const { normalizeNameForComparison } = require('../utils/name-utils');
const { urls, outputConfig } = require('../../config');

// Updated URLs based on actual Wikipedia pages
const WIKIPEDIA_SOURCES = {
  // Main lists of MPs
  mpLists: [
    'https://en.wikipedia.org/wiki/13th_Parliament_of_Kenya',
    'https://en.wikipedia.org/wiki/List_of_members_of_the_National_Assembly_of_Kenya,_2017%E2%80%932022'
  ],
  // Categories containing politicians
  categories: [
    'https://en.wikipedia.org/wiki/Category:21st-century_Kenyan_politicians',
    'https://en.wikipedia.org/wiki/Category:Kenyan_politicians',
    'https://en.wikipedia.org/wiki/Category:Members_of_the_13th_Parliament_of_Kenya'
  ],
  // Fallback to official parliament website
  official: [
    'http://www.parliament.go.ke/the-national-assembly/mps'
  ]
};

class WikipediaScraper {
  constructor() {
    this.httpClient = new HttpClient();
    this.processedLinks = new Set(); // Track already processed links to avoid duplicates
  }

  /**
   * Main method to scrape Wikipedia for MP data
   */
  async scrapeWikipediaMPs() {
    logger.info('Starting enhanced Wikipedia MP extraction...');
    
    // Check for existing checkpoint
    const checkpoint = findLatestCheckpoint('wikipedia_extraction');
    if (checkpoint) {
      logger.info(`Resuming from checkpoint with ${checkpoint.data.length} MPs`);
      return checkpoint.data;
    }
    
    const allMPs = [];
    
    // First extract MPs from main Parliament pages
    for (const url of WIKIPEDIA_SOURCES.mpLists) {
      try {
        logger.info(`Fetching Wikipedia page: ${url}`);
        const html = await this.httpClient.get(url);
        const pageMPs = this.extractMPsFromPage(html, url);
        allMPs.push(...pageMPs);
        
        // Save checkpoint after each main page
        saveCheckpoint('wikipedia_extraction', allMPs);
      } catch (err) {
        logger.error(`Failed to fetch Wikipedia page: ${url} (${err.message})`);
      }
    }
    
    // Then try to extract MPs from category pages
    for (const url of WIKIPEDIA_SOURCES.categories) {
      try {
        logger.info(`Fetching Wikipedia category: ${url}`);
        const html = await this.httpClient.get(url);
        const categoryMPs = await this.extractMPsFromCategory(html, url);
        allMPs.push(...categoryMPs);
        
        // Save checkpoint after each category
        saveCheckpoint('wikipedia_extraction', allMPs);
      } catch (err) {
        logger.error(`Failed to fetch Wikipedia category: ${url} (${err.message})`);
      }
    }
    
    // If we still don't have enough MPs, try the official website
    if (allMPs.length < 50) {
      logger.warn('Few MPs found on Wikipedia. Trying official Parliament website...');
      for (const url of WIKIPEDIA_SOURCES.official) {
        try {
          logger.info(`Fetching official page: ${url}`);
          const html = await this.httpClient.get(url);
          const officialMPs = this.extractMPsFromOfficialSite(html, url);
          allMPs.push(...officialMPs);
          
          saveCheckpoint('wikipedia_extraction', allMPs);
        } catch (err) {
          logger.error(`Failed to fetch official page: ${url} (${err.message})`);
        }
      }
    }
    
    logger.info(`Extracted ${allMPs.length} MPs from all sources`);
    
    // Deduplicate MPs based on normalized name
    const uniqueMPs = this.deduplicateMPs(allMPs);
    logger.info(`After deduplication: ${uniqueMPs.length} unique MPs`);
    
    return uniqueMPs;
  }

  /**
   * Extract MPs from a Wikipedia page containing tables
   */
  extractMPsFromPage(html, sourceUrl) {
    const $ = cheerio.load(html);
    const pageMPs = [];
    
    // Find all tables that might contain MP data
    const tables = $('table.wikitable');
    logger.info(`Found ${tables.length} tables on ${sourceUrl}`);
    
    tables.each((tableIndex, table) => {
      const headers = $(table).find('th');
      const headerText = headers.map((i, el) => $(el).text().trim()).get().join('|').toLowerCase();
      
      // Check if this looks like an MP table
      if (headerText.includes('name') || 
          headerText.includes('constituency') || 
          headerText.includes('party') || 
          headerText.includes('county')) {
        
        const headerArray = headers.map((i, el) => $(el).text().trim().toLowerCase()).get();
        const nameIndex = headerArray.findIndex(h => h.includes('name') || h.includes('member'));
        const constituencyIndex = headerArray.findIndex(h => h.includes('constituency'));
        const countyIndex = headerArray.findIndex(h => h.includes('county'));
        const partyIndex = headerArray.findIndex(h => h.includes('party'));
        const genderIndex = headerArray.findIndex(h => h.includes('gender'));
        
        if (nameIndex !== -1) {
          $(table).find('tr').each((rowIndex, row) => {
            if (rowIndex === 0) return; // Skip header row
            
            const columns = $(row).find('td');
            if (columns.length <= nameIndex) return;
            
            let name = $(columns[nameIndex]).text().trim();
            if (!name) return;
            
            // Check for links to MP's own Wikipedia page
            const nameCell = $(columns[nameIndex]);
            const link = nameCell.find('a').attr('href');
            const wikipediaUrl = link && link.startsWith('/wiki/') 
              ? `https://en.wikipedia.org${link}` 
              : '';
            
            // Create MP object with available information
            const mp = {
              name,
              source: 'Wikipedia',
              sourceUrl,
              wikipediaUrl,
              wikipediaData: {}
            };
            
            // Add constituency if available
            if (constituencyIndex !== -1 && columns.length > constituencyIndex) {
              mp.constituency = $(columns[constituencyIndex]).text().trim();
            }
            
            // Add county if available
            if (countyIndex !== -1 && columns.length > countyIndex) {
              mp.county = $(columns[countyIndex]).text().trim();
            }
            
            // Add party if available
            if (partyIndex !== -1 && columns.length > partyIndex) {
              mp.party = $(columns[partyIndex]).text().trim();
            }
            
            // Add gender if available
            if (genderIndex !== -1 && columns.length > genderIndex) {
              mp.gender = $(columns[genderIndex]).text().trim();
            }
            
            // Add this MP to the collection
            pageMPs.push(mp);
            
            // Remember this link to avoid processing it again
            if (wikipediaUrl) {
              this.processedLinks.add(wikipediaUrl);
            }
          });
        }
      }
    });
    
    // Look for MP links outside of tables (e.g., in lists)
    this.extractMPLinksFromPage($, sourceUrl, pageMPs);
    
    return pageMPs;
  }

  /**
   * Extract MP links from text content of a page
   */
  extractMPLinksFromPage($, sourceUrl, pageMPs) {
    // Look for lists of MPs
    $('ul li a, ol li a').each((i, link) => {
      const $link = $(link);
      const href = $link.attr('href');
      const text = $link.text().trim();
      
      // Check if this might be an MP link
      if (href && href.startsWith('/wiki/') && 
          !href.includes(':') && // Exclude category and special pages
          !this.processedLinks.has(`https://en.wikipedia.org${href}`)) {
        
        // Add as potential MP
        pageMPs.push({
          name: text,
          source: 'Wikipedia',
          sourceUrl,
          wikipediaUrl: `https://en.wikipedia.org${href}`,
          wikipediaData: {}
        });
        
        // Remember this link
        this.processedLinks.add(`https://en.wikipedia.org${href}`);
      }
    });
  }

  /**
   * Extract MPs from a Wikipedia category page
   */
  async extractMPsFromCategory(html, sourceUrl) {
    const $ = cheerio.load(html);
    const categoryMPs = [];
    
    // Find all category members
    const categoryMembers = $('#mw-pages .mw-category-group li a');
    logger.info(`Found ${categoryMembers.length} entries in category ${sourceUrl}`);
    
    // Process batch of members to avoid overwhelming the server
    const batchSize = 5;
    for (let i = 0; i < categoryMembers.length; i += batchSize) {
      const batch = categoryMembers.slice(i, i + batchSize);
      const batchPromises = [];
      
      batch.each((j, link) => {
        const $link = $(link);
        const href = $link.attr('href');
        const text = $link.text().trim();
        
        if (href && href.startsWith('/wiki/') && 
            !this.processedLinks.has(`https://en.wikipedia.org${href}`)) {
          
          // Add as potential MP with basic info
          const mp = {
            name: text,
            source: 'Wikipedia',
            sourceUrl,
            wikipediaUrl: `https://en.wikipedia.org${href}`,
            wikipediaData: {}
          };
          
          categoryMPs.push(mp);
          
          // Remember this link
          this.processedLinks.add(`https://en.wikipedia.org${href}`);
          
          // Queue this MP page for detailed extraction
          batchPromises.push(this.getWikipediaDetails(mp));
        }
      });
      
      // Wait for batch to complete
      await Promise.all(batchPromises);
      
      // Short delay between batches
      if (i + batchSize < categoryMembers.length) {
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
    }
    
    return categoryMPs;
  }

  /**
   * Extract MPs from the official Parliament website
   */
  extractMPsFromOfficialSite(html, sourceUrl) {
    const $ = cheerio.load(html);
    const officialMPs = [];
    
    // Find MP entries - adjust selectors based on the actual structure
    $('tr.mp').each((i, row) => {
      const $row = $(row);
      const columns = $row.find('td');
      
      if (columns.length < 4) return;
      
      const name = $(columns[0]).text().trim();
      if (!name) return;
      
      // Create MP object
      const mp = {
        name,
        source: 'Official Parliament Website',
        sourceUrl,
        county: $(columns[2]).text().trim(),
        constituency: $(columns[3]).text().trim(),
        party: $(columns[4]).text().trim(),
        wikipediaData: {}
      };
      
      // Extract the 'More...' link for additional details
      const moreLink = $(columns[6]).find('a').attr('href');
      if (moreLink) {
        mp.detailsLink = moreLink.startsWith('http') ? moreLink : `http://www.parliament.go.ke${moreLink}`;
      }
      
      officialMPs.push(mp);
    });
    
    return officialMPs;
  }

  /**
   * Deduplicate MPs based on name
   */
  deduplicateMPs(mps) {
    const uniqueMPs = [];
    const seenNames = new Set();
    
    for (const mp of mps) {
      const normalizedName = normalizeNameForComparison(mp.name);
      
      if (!seenNames.has(normalizedName)) {
        seenNames.add(normalizedName);
        uniqueMPs.push(mp);
      }
    }
    
    return uniqueMPs;
  }

  /**
   * Enrich MP objects with detailed information from their Wikipedia pages
   */
  async enrichMPsWithWikipediaData(mps) {
    logger.info('Enriching MPs with Wikipedia data...');
    
    // Check for existing checkpoint
    const checkpoint = findLatestCheckpoint('wikipedia_enrichment');
    if (checkpoint) {
      logger.info(`Resuming from enrichment checkpoint with ${checkpoint.data.length} MPs`);
      return checkpoint.data;
    }
    
    const enrichedMPs = [];
    
    // Process MPs in batches to avoid overwhelming the server
    const batchSize = 5;
    for (let i = 0; i < mps.length; i += batchSize) {
      logger.info(`Processing MPs ${i+1}-${Math.min(i+batchSize, mps.length)} of ${mps.length}`);
      
      const batch = mps.slice(i, i + batchSize);
      const batchPromises = batch.map(mp => this.getWikipediaDetails(mp));
      
      // Wait for all MPs in this batch to be processed
      const processedBatch = await Promise.all(batchPromises);
      enrichedMPs.push(...processedBatch);
      
      // Save checkpoint after each batch
      if (enrichedMPs.length > 0) {
        saveCheckpoint('wikipedia_enrichment', enrichedMPs);
      }
      
      // Add a delay between batches to be nice to Wikipedia
      if (i + batchSize < mps.length) {
        await new Promise(resolve => setTimeout(resolve, 2000));
      }
    }
    
    return enrichedMPs;
  }

  /**
   * Get detailed information from an MP's Wikipedia page
   */
  async getWikipediaDetails(mp) {
    // Create a copy of the MP object to avoid modifying the original
    const enrichedMP = { ...mp };
    
    // Skip if no Wikipedia URL
    if (!enrichedMP.wikipediaUrl) {
      return enrichedMP;
    }
    
    try {
      logger.info(`Fetching Wikipedia details for: ${enrichedMP.name}`);
      const html = await this.httpClient.get(enrichedMP.wikipediaUrl);
      const $ = cheerio.load(html);
      
      // Basic biographical information
      enrichedMP.wikipediaData.biography = this.extractBiography($);
      
      // Infobox data
      enrichedMP.wikipediaData.infobox = this.extractInfoboxData($);
      
      // Political career, leadership positions
      enrichedMP.wikipediaData.politicalCareer = this.extractPoliticalCareer($);
      
      // Committee memberships
      enrichedMP.wikipediaData.committees = this.extractCommittees($);
      
      // Education history
      enrichedMP.wikipediaData.education = this.extractEducation($);
      
      // Extract the structured information using regex
      if (enrichedMP.wikipediaData.biography) {
        enrichedMP.wikipediaData.structuredInfo = this.extractStructuredInfo(enrichedMP.wikipediaData.biography);
      }
      
      // Extract image if available
      const imageUrl = this.extractImageUrl($);
      if (imageUrl) {
        enrichedMP.wikipediaData.imageUrl = imageUrl;
      }
      
      logger.info(`Successfully enriched MP: ${enrichedMP.name}`);
    } catch (error) {
      logger.error(`Error fetching Wikipedia details for ${enrichedMP.name}: ${error.message}`);
    }
    
    return enrichedMP;
  }

  /**
   * Extract the main biography from a Wikipedia page
   */
  extractBiography($) {
    // Get the first paragraph, which typically contains the biography
    const firstPara = $('#mw-content-text p').first().text().trim();
    
    // If the first paragraph is empty or very short, try to get more paragraphs
    if (!firstPara || firstPara.length < 50) {
      const allParas = [];
      $('#mw-content-text p').slice(0, 3).each((i, el) => {
        const text = $(el).text().trim();
        if (text && text.length > 10) {
          allParas.push(text);
        }
      });
      return allParas.join(' ');
    }
    
    return firstPara;
  }

  /**
   * Extract data from the infobox
   */
  extractInfoboxData($) {
    const infobox = {};
    
    // Find the infobox table
    const infoboxTable = $('.infobox');
    if (infoboxTable.length === 0) {
      return infobox;
    }
    
    // Extract key-value pairs
    infoboxTable.find('tr').each((i, row) => {
      const header = $(row).find('th').text().trim();
      const value = $(row).find('td').text().trim();
      
      if (header && value) {
        infobox[header] = value;
      }
    });
    
    return infobox;
  }

  /**
   * Extract political career information
   */
  extractPoliticalCareer($) {
    const career = [];
    
    // Look for sections about political career
    let foundSection = false;
    $('#Political_career, #Career, #Political_career ~ h2, #Career ~ h2').each((i, section) => {
      foundSection = true;
      
      // Get the text until next heading
      let content = '';
      let current = $(section).next();
      
      while (current.length && !current.is('h1, h2')) {
        if (current.is('p')) {
          content += ' ' + current.text().trim();
        }
        current = current.next();
      }
      
      if (content) {
        career.push(content.trim());
      }
    });
    
    // If no specific sections found, try to find political content in paragraphs
    if (!foundSection) {
      $('#mw-content-text p').each((i, para) => {
        const text = $(para).text().trim();
        if (text && 
            (text.includes('elected') || 
             text.includes('parliament') || 
             text.includes('political') || 
             text.includes('constituency'))) {
          career.push(text);
        }
      });
    }
    
    return career;
  }

  /**
   * Extract committee memberships
   */
  extractCommittees($) {
    const committees = [];
    
    // Look for sections about committees
    $('#Committee, #Committees, #Parliamentary_committees').each((i, section) => {
      // Get the text until next heading
      let current = $(section).next();
      
      while (current.length && !current.is('h1, h2, h3')) {
        if (current.is('p')) {
          const text = current.text().trim();
          if (text) {
            committees.push(text);
          }
        } else if (current.is('ul, ol')) {
          current.find('li').each((j, item) => {
            const text = $(item).text().trim();
            if (text) {
              committees.push(text);
            }
          });
        }
        current = current.next();
      }
    });
    
    // Look for committee mentions in paragraphs
    if (committees.length === 0) {
      $('#mw-content-text p').each((i, para) => {
        const text = $(para).text().trim();
        if (text && 
            (text.includes('committee') || 
             text.includes('Commission'))) {
          committees.push(text);
        }
      });
    }
    
    return committees;
  }

  /**
   * Extract education information
   */
  extractEducation($) {
    const education = [];
    
    // Look for sections about education
    $('#Education, #Academic_background, #Educational_background').each((i, section) => {
      // Get the text until next heading
      let current = $(section).next();
      
      while (current.length && !current.is('h1, h2, h3')) {
        if (current.is('p')) {
          const text = current.text().trim();
          if (text) {
            education.push(text);
          }
        } else if (current.is('ul, ol')) {
          current.find('li').each((j, item) => {
            const text = $(item).text().trim();
            if (text) {
              education.push(text);
            }
          });
        }
        current = current.next();
      }
    });
    
    // Look for education mentions in paragraphs
    if (education.length === 0) {
      $('#mw-content-text p').each((i, para) => {
        const text = $(para).text().trim();
        if (text && 
            (text.includes('educated') || 
             text.includes('school') || 
             text.includes('university') || 
             text.includes('college') || 
             text.includes('degree'))) {
          education.push(text);
        }
      });
    }
    
    return education;
  }

  /**
   * Extract image URL from Wikipedia page
   */
  extractImageUrl($) {
    // Try to find the main image
    const infoboxImage = $('.infobox img').first();
    if (infoboxImage.length) {
      return infoboxImage.attr('src')?.startsWith('//') 
        ? 'https:' + infoboxImage.attr('src')
        : infoboxImage.attr('src');
    }
    
    // Try other images
    const otherImage = $('#mw-content-text img').first();
    if (otherImage.length) {
      return otherImage.attr('src')?.startsWith('//') 
        ? 'https:' + otherImage.attr('src')
        : otherImage.attr('src');
    }
    
    return null;
  }

  /**
   * Extract structured information from biography text using regex
   */
  extractStructuredInfo(biography) {
    if (!biography) return {};
    
    const info = {
      education: [],
      professions: [],
      birthYear: null,
      birthPlace: null,
      politicalPositions: []
    };
    
    // Extract education information
    const educationRegex = /(?:graduated|studied|degree|educated|diploma|certificate|bachelor|master|phd|doctorate) (?:from|at|in) ([^.]+)/gi;
    let educationMatch;
    while ((educationMatch = educationRegex.exec(biography)) !== null) {
      info.education.push(educationMatch[1].trim());
    }
    
    // Extract professional background
    const professionRegex = /(?:worked as|profession|career|professional|occupation) (?:is|as|in) ([^.]+)/gi;
    let professionMatch;
    while ((professionMatch = professionRegex.exec(biography)) !== null) {
      info.professions.push(professionMatch[1].trim());
    }
    
    // Extract birth year
    const yearMatch = biography.match(/born (?:in|on)?\s?(?:the year )?\s?(\d{4})/i);
    if (yearMatch) {
      info.birthYear = parseInt(yearMatch[1]);
    }
    
    // Extract birth place
    const birthPlaceMatch = biography.match(/born (?:in|at) ([^,.]+)/i);
    if (birthPlaceMatch) {
      info.birthPlace = birthPlaceMatch[1].trim();
    }
    
    // Extract political positions
    const politicalRegex = /(?:elected|appointed|served|serving) as ([^.]+)/gi;
    let politicalMatch;
    while ((politicalMatch = politicalRegex.exec(biography)) !== null) {
      info.politicalPositions.push(politicalMatch[1].trim());
    }
    
    return info;
  }

  /**
   * Merge Wikipedia data with existing MP data
   */
  mergeWithExistingData(wikipediaMPs, existingMPs) {
    logger.info('Merging Wikipedia data with existing MP data...');
    
    // Create maps for faster lookups
    const mpsByName = {};
    const mpsByConstituency = {};
    const mpsByCounty = {};
    
    // Index existing MPs by name and constituency
    existingMPs.forEach(mp => {
      const normalizedName = normalizeNameForComparison(mp.name);
      mpsByName[normalizedName] = mp;
      
      if (mp.constituency) {
        const normalizedConstituency = mp.constituency.toUpperCase().trim();
        mpsByConstituency[normalizedConstituency] = mp;
      }
      
      if (mp.county) {
        const normalizedCounty = mp.county.toUpperCase().trim();
        if (!mpsByCounty[normalizedCounty]) {
          mpsByCounty[normalizedCounty] = [];
        }
        mpsByCounty[normalizedCounty].push(mp);
      }
    });
    
    // Track match statistics
    let directMatches = 0;
    let constituencyMatches = 0;
    let countyFuzzyMatches = 0;
    let fuzzyMatches = 0;
    let noMatches = 0;
    
    // Try to match Wikipedia MPs with existing MPs
    wikipediaMPs.forEach(wikiMP => {
      const normalizedName = normalizeNameForComparison(wikiMP.name);
      let existingMP = mpsByName[normalizedName];
      let matchType = 'none';
      
      // If no direct name match, try matching by constituency
      if (!existingMP && wikiMP.constituency) {
        const normalizedConstituency = wikiMP.constituency.toUpperCase().trim();
        existingMP = mpsByConstituency[normalizedConstituency];
        
        if (existingMP) {
          matchType = 'constituency';
          constituencyMatches++;
        }
      }
      
      // If still no match, try matching by county and partial name
      if (!existingMP && wikiMP.county) {
        const normalizedCounty = wikiMP.county.toUpperCase().trim();
        const countyMPs = mpsByCounty[normalizedCounty] || [];
        
        // Try to find a partial name match within the same county
        for (const countyMP of countyMPs) {
          const nameParts = normalizedName.split(' ');
          const mpNameParts = normalizeNameForComparison(countyMP.name).split(' ');
          
          // Check if at least two name parts match
          const matchingParts = nameParts.filter(part => 
            mpNameParts.some(mpPart => mpPart === part && part.length > 2)
          );
          
          if (matchingParts.length >= 2) {
            existingMP = countyMP;
            matchType = 'county_fuzzy';
            countyFuzzyMatches++;
            break;
          }
        }
      }
      
      // If still no match, try fuzzy matching based on name parts
      if (!existingMP) {
        const nameParts = normalizedName.split(' ').filter(part => part.length > 3);
        
        for (const [mpName, mp] of Object.entries(mpsByName)) {
          const mpNameParts = mpName.split(' ');
          
          // Check if at least half of the significant name parts match
          const matchingParts = nameParts.filter(part => 
            mpNameParts.some(mpPart => mpPart.includes(part) || part.includes(mpPart))
          );
          
          if (matchingParts.length >= Math.ceil(nameParts.length / 2)) {
            existingMP = mp;
            matchType = 'fuzzy';
            fuzzyMatches++;
            break;
          }
        }
      }
      
      if (existingMP && matchType === 'none') {
        directMatches++;
      }
      
      // If we found a match, merge the data
      if (existingMP) {
        // Add Wikipedia data to the existing MP
        existingMP.wikipediaData = wikiMP.wikipediaData || {};
        existingMP.wikipediaUrl = existingMP.wikipediaUrl || wikiMP.wikipediaUrl;
        
        // Update missing fields with Wikipedia data
        if (!existingMP.constituency && wikiMP.constituency) {
          existingMP.constituency = wikiMP.constituency;
        }
        
        if (!existingMP.county && wikiMP.county) {
          existingMP.county = wikiMP.county;
        }
        
        if (!existingMP.party && wikiMP.party) {
          existingMP.party = wikiMP.party;
        }
        
        if ((!existingMP.gender || existingMP.gender === 'Unknown') && wikiMP.gender) {
          existingMP.gender = wikiMP.gender;
        }
        
        // Add data source if not already present
        if (!existingMP.dataSources) {
          existingMP.dataSources = ['parliament'];
        }
        if (!existingMP.dataSources.includes('wikipedia')) {
          existingMP.dataSources.push('wikipedia');
        }
      } else {
        // If no match, add this as a new MP
        wikiMP.dataSources = ['wikipedia'];
        existingMPs.push(wikiMP);
        noMatches++;
      }
    });
    
    logger.info(`Match statistics: Direct: ${directMatches}, Constituency: ${constituencyMatches}, County fuzzy: ${countyFuzzyMatches}, Fuzzy: ${fuzzyMatches}, No match: ${noMatches}`);
    
    return existingMPs;
  }
}

module.exports = WikipediaScraper;