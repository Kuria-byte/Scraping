const axios = require('axios');
const cheerio = require('cheerio');
const fs = require('fs');
const path = require('path');

// Configuration
const WIKIPEDIA_MP_URLS = [
  'https://en.wikipedia.org/wiki/13th_Parliament_of_Kenya',
  'https://en.wikipedia.org/wiki/List_of_members_of_the_National_Assembly_of_Kenya,_2022-2027'
];
const WIKIPEDIA_API_URL = 'https://en.wikipedia.org/w/api.php';

// Load existing MP data for matching
function loadExistingMPData(filePath) {
  try {
    const rawData = fs.readFileSync(filePath, 'utf8');
    return JSON.parse(rawData);
  } catch (error) {
    console.error(`Error loading MP data: ${error.message}`);
    return [];
  }
}

// Axios instance with custom settings
const axiosInstance = axios.create({
  timeout: 30000,
  headers: {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
    'Accept-Language': 'en-US,en;q=0.5'
  }
});

// Function to fetch content from Wikipedia
async function fetchWikipediaPage(url) {
  try {
    console.log(`Fetching Wikipedia page: ${url}`);
    const response = await axiosInstance.get(url);
    return response.data;
  } catch (error) {
    console.error(`Error fetching Wikipedia page: ${error.message}`);
    return null;
  }
}

// Function to get MP biographies from Wikipedia API
async function getWikipediaBio(mpName) {
  try {
    // Normalize the name for Wikipedia search
    let searchName = mpName.replace(/^HON\.\s*/, '').replace(/\(.*?\)/, '').trim();
    
    // Add Kenya MP to improve search results
    searchName = `${searchName} Kenya MP`;
    
    console.log(`Searching Wikipedia for: ${searchName}`);
    
    // First, search for the page
    const searchResponse = await axiosInstance.get(WIKIPEDIA_API_URL, {
      params: {
        action: 'query',
        list: 'search',
        srsearch: searchName,
        format: 'json',
        utf8: 1
      }
    });
    
    const searchResults = searchResponse.data.query.search;
    
    // If no results, return empty bio
    if (!searchResults || searchResults.length === 0) {
      return { found: false };
    }
    
    // Get the first result (most relevant)
    const topResult = searchResults[0];
    
    // Now get the page extract
    const extractResponse = await axiosInstance.get(WIKIPEDIA_API_URL, {
      params: {
        action: 'query',
        prop: 'extracts|pageimages',
        exintro: 1,
        explaintext: 1,
        titles: topResult.title,
        pithumbsize: 500,
        format: 'json',
        utf8: 1
      }
    });
    
    // Process the response
    const pages = extractResponse.data.query.pages;
    const pageId = Object.keys(pages)[0];
    const page = pages[pageId];
    
    // Check if this is actually about the MP (simple heuristic)
    const isRelevant = 
      page.extract.toLowerCase().includes('parliament') || 
      page.extract.toLowerCase().includes('mp') ||
      page.extract.toLowerCase().includes('politician') ||
      page.extract.toLowerCase().includes('elected') ||
      page.extract.toLowerCase().includes('constituency');
    
    if (!isRelevant) {
      return { found: false };
    }
    
    // Return the bio info
    return {
      found: true,
      title: page.title,
      extract: page.extract,
      url: `https://en.wikipedia.org/wiki/${encodeURIComponent(page.title.replace(/ /g, '_'))}`,
      image: page.thumbnail ? page.thumbnail.source : null
    };
  } catch (error) {
    console.error(`Error getting Wikipedia bio for ${mpName}: ${error.message}`);
    return { found: false };
  }
}

// Extract MPs from Wikipedia tables
async function extractMPsFromWikipedia() {
  const allMPs = [];
  
  for (const url of WIKIPEDIA_MP_URLS) {
    const html = await fetchWikipediaPage(url);
    
    if (!html) {
      console.log(`Skipping ${url} due to fetch error`);
      continue;
    }
    
    const $ = cheerio.load(html);
    
    // Find all tables that might contain MP data
    const tables = $('table.wikitable');
    
    console.log(`Found ${tables.length} tables on ${url}`);
    
    tables.each((tableIndex, table) => {
      // Check if this table has headers that match what we're looking for
      const headers = $(table).find('th');
      const headerText = headers.map((i, el) => $(el).text().trim()).get().join('|').toLowerCase();
      
      // Check if this looks like an MP table
      if (headerText.includes('name') || 
          headerText.includes('constituency') || 
          headerText.includes('party') || 
          headerText.includes('county')) {
        
        console.log(`Found potential MP table with headers: ${headerText}`);
        
        // Find the index of important columns
        const headerArray = headers.map((i, el) => $(el).text().trim().toLowerCase()).get();
        const nameIndex = headerArray.findIndex(h => h.includes('name') || h.includes('member'));
        const constituencyIndex = headerArray.findIndex(h => h.includes('constituency'));
        const countyIndex = headerArray.findIndex(h => h.includes('county'));
        const partyIndex = headerArray.findIndex(h => h.includes('party'));
        
        // Process rows if we found a name column
        if (nameIndex !== -1) {
          // Process each row
          $(table).find('tr').each((rowIndex, row) => {
            // Skip header row
            if (rowIndex === 0) return;
            
            const columns = $(row).find('td');
            
            // Skip rows with insufficient columns
            if (columns.length <= nameIndex) return;
            
            // Extract the MP name
            let name = $(columns[nameIndex]).text().trim();
            
            // Skip empty names
            if (!name) return;
            
            // Create MP object
            const mp = {
              name,
              source: 'Wikipedia',
              url: url,
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
            
            // Check for links to MP's own Wikipedia page
            const nameCell = $(columns[nameIndex]);
            const link = nameCell.find('a').attr('href');
            
            if (link && link.startsWith('/wiki/')) {
              mp.wikipediaUrl = `https://en.wikipedia.org${link}`;
            }
            
            allMPs.push(mp);
          });
        }
      }
    });
  }
  
  console.log(`Extracted ${allMPs.length} MPs from Wikipedia`);
  return allMPs;
}

// Function to get additional data for each MP from their Wikipedia page
async function enrichMPsWithWikipediaData(mps) {
  console.log('Enriching MPs with Wikipedia data...');
  
  const enrichedMPs = [];
  
  for (let i = 0; i < mps.length; i++) {
    const mp = { ...mps[i] };
    
    // If we already have a Wikipedia URL, use it directly
    if (mp.wikipediaUrl) {
      try {
        const html = await fetchWikipediaPage(mp.wikipediaUrl);
        
        if (html) {
          const $ = cheerio.load(html);
          
          // Extract infobox data (if available)
          const infobox = $('.infobox');
          if (infobox.length > 0) {
            mp.wikipediaData.infobox = {};
            
            infobox.find('tr').each((_, row) => {
              const header = $(row).find('th').text().trim();
              const value = $(row).find('td').text().trim();
              
              if (header && value) {
                mp.wikipediaData.infobox[header] = value;
              }
            });
          }
          
          // Extract first paragraph of content (biography)
          const firstPara = $('#mw-content-text p').first().text().trim();
          if (firstPara) {
            mp.wikipediaData.biography = firstPara;
          }
          
          console.log(`Enriched MP with Wikipedia data: ${mp.name}`);
        }
      } catch (error) {
        console.error(`Error fetching Wikipedia page for ${mp.name}: ${error.message}`);
      }
    } else {
      // Try to find Wikipedia data using the MP's name
      const bioData = await getWikipediaBio(mp.name);
      
      if (bioData.found) {
        mp.wikipediaData.biography = bioData.extract;
        mp.wikipediaData.imageUrl = bioData.image;
        mp.wikipediaUrl = bioData.url;
        
        console.log(`Found Wikipedia bio for ${mp.name}`);
      } else {
        console.log(`No Wikipedia bio found for ${mp.name}`);
      }
    }
    
    enrichedMPs.push(mp);
    
    // Add a small delay to avoid overwhelming Wikipedia's API
    await new Promise(resolve => setTimeout(resolve, 1000));
  }
  
  return enrichedMPs;
}

// Merge Wikipedia data with existing MP data
function mergeWithExistingData(wikipediaMPs, existingMPs) {
  console.log('Merging Wikipedia data with existing MP data...');
  
  // Create maps for faster lookups
  const mpsByName = {};
  const mpsByConstituency = {};
  
  // Index existing MPs by name and constituency
  existingMPs.forEach(mp => {
    const normalizedName = normalizeName(mp.name);
    mpsByName[normalizedName] = mp;
    
    if (mp.constituency) {
      const normalizedConstituency = mp.constituency.toUpperCase().trim();
      mpsByConstituency[normalizedConstituency] = mp;
    }
  });
  
  // Track match statistics
  let directMatches = 0;
  let constituencyMatches = 0;
  let noMatches = 0;
  
  // Try to match Wikipedia MPs with existing MPs
  wikipediaMPs.forEach(wikiMP => {
    const normalizedName = normalizeName(wikiMP.name);
    let existingMP = mpsByName[normalizedName];
    
    // If no direct name match, try matching by constituency
    if (!existingMP && wikiMP.constituency) {
      const normalizedConstituency = wikiMP.constituency.toUpperCase().trim();
      existingMP = mpsByConstituency[normalizedConstituency];
      
      if (existingMP) {
        constituencyMatches++;
      }
    } else if (existingMP) {
      directMatches++;
    }
    
    // If we found a match, merge the data
    if (existingMP) {
      // Add Wikipedia data to the existing MP
      existingMP.wikipediaData = wikiMP.wikipediaData || {};
      existingMP.wikipediaUrl = wikiMP.wikipediaUrl;
      
      // Update other fields if they're missing in the existing data
      if (!existingMP.constituency && wikiMP.constituency) {
        existingMP.constituency = wikiMP.constituency;
      }
      
      if (!existingMP.county && wikiMP.county) {
        existingMP.county = wikiMP.county;
      }
      
      if (!existingMP.party && wikiMP.party) {
        existingMP.party = wikiMP.party;
      }
    } else {
      // If no match, add this as a new MP
      existingMPs.push(wikiMP);
      noMatches++;
    }
  });
  
  console.log(`Direct name matches: ${directMatches}`);
  console.log(`Constituency matches: ${constituencyMatches}`);
  console.log(`No matches (added as new MPs): ${noMatches}`);
  
  return existingMPs;
}

// Helper function to normalize names for comparison
function normalizeName(name) {
  return name
    .toUpperCase()
    .replace(/HON\.?\s*/, '')
    .replace(/\(.*?\)/, '')
    .replace(/DR\.?\s*/, '')
    .replace(/PROF\.?\s*/, '')
    .replace(/\s+/g, ' ')
    .trim();
}

// Main function
async function main() {
  try {
    // Load existing MPs data
    const existingMPs = loadExistingMPData('kenyan_mps_enhanced.json');
    
    if (existingMPs.length === 0) {
      console.error('No MP data found. Please run the scraper and enrichment script first.');
      return;
    }
    
    // Extract MPs data from Wikipedia
    const wikipediaMPs = await extractMPsFromWikipedia();
    
    // Enrich with additional Wikipedia data
    const enrichedWikipediaMPs = await enrichMPsWithWikipediaData(wikipediaMPs);
    
    // Merge Wikipedia data with existing MP data
    const mergedMPs = mergeWithExistingData(enrichedWikipediaMPs, existingMPs);
    
    // Save the enriched data
    fs.writeFileSync('kenyan_mps_with_wikipedia.json', JSON.stringify(mergedMPs, null, 2));
    console.log('Enriched MP data saved to kenyan_mps_with_wikipedia.json');
    
  } catch (error) {
    console.error(`An error occurred: ${error.message}`);
  }
}

// Run the main function
main();
