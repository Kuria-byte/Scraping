const axios = require('axios');
const cheerio = require('cheerio');
const fs = require('fs');
const http = require('http');

// Array to store all MP data
const allMPs = [];
const baseUrl = 'http://www.parliament.go.ke';

// Optimized HTTP agent with more concurrent connections
const httpAgent = new http.Agent({
  keepAlive: true,
  maxSockets: 10, // Increased from 5 to allow more concurrent connections
  timeout: 30000,  // Reduced timeout to 30 seconds
  freeSocketTimeout: 10000 // Close idle sockets after 10 seconds
});

// Configure axios with optimized settings for speed
const axiosInstance = axios.create({
  httpAgent: httpAgent,
  timeout: 30000, // 30 seconds timeout - reduced from 60
  maxRedirects: 5,
  headers: {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
    'Accept-Language': 'en-US,en;q=0.5',
    'Connection': 'keep-alive'
  }
});

// Function to extract MP data from a page
async function scrapeMPsFromPage(pageNum) {
  try {
    console.log(`Scraping page ${pageNum}...`);
    
    // Get the main page with MP listings
    const url = pageNum === 0 
      ? `${baseUrl}/the-national-assembly/mps` 
      : `${baseUrl}/the-national-assembly/mps?field_name_value=%20&field_parliament_value=2022&field_employment_history_value=&page=${pageNum}`;
    
    console.log(`Fetching: ${url}`);
    
    const response = await axiosInstance.get(url, {
      responseType: 'text'
    });
    
    const $ = cheerio.load(response.data);
    
    // Find all MP rows in the table
    const mpRows = $('table tbody tr.mp');
    
    console.log(`Found ${mpRows.length} MPs on this page`);
    
    // If no rows found, we might have reached the end of pagination
    if (mpRows.length === 0) {
      // Check if there's an error message or if the page is actually empty
      const pageContent = $('body').text();
      if (pageContent.includes('error') || pageContent.includes('not found')) {
        console.warn('Page might contain an error or no MPs');
      }
      return false;
    }
    
    // Process each MP row
    for (let i = 0; i < mpRows.length; i++) {
      const row = mpRows.eq(i);
      const columns = row.find('td');
      
      // Skip rows without enough columns
      if (columns.length < 6) continue;
      
      const name = columns.eq(0).text().trim();
      
      // Skip empty names
      if (!name) continue;
      
      // Extract image URL if available
      const imgSrc = columns.eq(1).find('img').attr('src') || '';
      const profilePictureUrl = imgSrc ? (imgSrc.startsWith('http') ? imgSrc : `${baseUrl}${imgSrc}`) : '';
      
      // Extract the More link for additional details
      const moreLink = columns.eq(6).find('a').attr('href');
      
      // Basic MP data
      const mp = {
        name: name,
        profilePictureUrl: profilePictureUrl,
        county: columns.eq(2).text().trim(),
        constituency: columns.eq(3).text().trim(),
        party: columns.eq(4).text().trim(),
        status: columns.eq(5).text().trim(),
        detailsLink: moreLink ? `${baseUrl}${moreLink}` : '',
        gender: determineGender(name),
        committees: [],
        employmentHistory: []
      };
      
      console.log(`Processing MP: ${mp.name}`);
      
      // If there's a "More..." link, fetch additional details
      if (moreLink) {
        try {
          await fetchAdditionalDetails(mp, moreLink);
        } catch (detailError) {
          console.error(`Error fetching details for MP ${mp.name}:`, detailError.message);
          mp.fetchError = detailError.message;
        }
      }
      
      // Add MP to the collection
      allMPs.push(mp);
      console.log(`Added MP: ${mp.name}, Constituency: ${mp.constituency}, Party: ${mp.party}`);
      
      // Minimal delay between MP detail requests
      await new Promise(resolve => setTimeout(resolve, 500));
    }
    
    return true; // Successfully scraped this page
  } catch (error) {
    if (error.code === 'ETIMEDOUT' || error.code === 'ECONNABORTED') {
      console.error(`Timeout error on page ${pageNum}: ${error.message}`);
      console.log('Retrying after a delay...');
      
      // Wait longer before retry
      await new Promise(resolve => setTimeout(resolve, 10000));
      return true; // Return true to continue with next page
    } else {
      console.error(`Error scraping page ${pageNum}:`, error.message);
      return false;
    }
  }
}

// Helper function to guess gender based on title/honorific
function determineGender(name) {
  if (name.includes('(MS.)') || name.includes('(MRS.)')) {
    return 'Female';
  } else if (name.includes('(MR.)')) {
    return 'Male';
  } else {
    // Try to determine from the HON title if possible
    return 'Unknown';
  }
}

// Function to fetch additional MP details from their individual page
async function fetchAdditionalDetails(mp, moreLink) {
  try {
    const detailUrl = `${baseUrl}${moreLink}`;
    console.log(`Fetching additional details from: ${detailUrl}`);
    
    const detailResponse = await axiosInstance.get(detailUrl, {
      responseType: 'text'
    });
    
    const detailPage = cheerio.load(detailResponse.data);
    
    // Extract committee information
    const committees = [];
    detailPage('.field--name-field-committees .field__item').each((_, elem) => {
      committees.push(detailPage(elem).text().trim());
    });
    mp.committees = committees.length > 0 ? committees : ['Not available'];
    
    // Extract employment history
    const employmentHistory = [];
    detailPage('.field--name-field-employment-history .field__item').each((_, elem) => {
      employmentHistory.push(detailPage(elem).text().trim());
    });
    mp.employmentHistory = employmentHistory.length > 0 ? employmentHistory : ['Not available'];
    
    // Extract contact information if available
    mp.email = detailPage('a[href^="mailto:"]').text().trim() || 'Not available';
    mp.phone = detailPage('a[href^="tel:"]').text().trim() || 'Not available';
    
    console.log(`Successfully fetched details for ${mp.name}`);
  } catch (error) {
    console.error(`Error fetching details for ${mp.name}:`, error.message);
    throw error; // Re-throw to be handled by the caller
  }
}

// Save data to file periodically to preserve progress
function saveProgress() {
  if (allMPs.length > 0) {
    const timestamp = new Date().toISOString().replace(/:/g, '-');
    fs.writeFileSync(`kenyan_mps_data_progress_${timestamp}.json`, JSON.stringify(allMPs, null, 2));
    console.log(`Progress saved: ${allMPs.length} MPs`);
  }
}

// Main function to scrape all pages with parallel processing
async function scrapeAllMPs() {
  try {
    console.log('Starting to scrape Kenya MPs data...');
    
    // Fetch the first page to get pagination info
    const firstPageResponse = await axiosInstance.get(`${baseUrl}/the-national-assembly/mps`, { responseType: 'text' });
    const $ = cheerio.load(firstPageResponse.data);
    
    // Find the last page number from pagination
    let maxPage = 0;
    $('nav.pager li.pager__item:not(.pager__item--next):not(.pager__item--last):not(.pager__item--ellipsis) a').each((_, el) => {
      const pageNum = parseInt($(el).text().trim());
      if (!isNaN(pageNum) && pageNum > maxPage) {
        maxPage = pageNum;
      }
    });
    
    // Check the "last page" link
    const lastPageHref = $('li.pager__item--last a').attr('href');
    if (lastPageHref) {
      const match = lastPageHref.match(/page=(\d+)/);
      if (match && match[1]) {
        const lastPageNum = parseInt(match[1]);
        if (lastPageNum > maxPage) {
          maxPage = lastPageNum;
        }
      }
    }
    
    console.log(`Detected ${maxPage + 1} pages of MPs`);
    
    // Process pages in batches of 3 for parallel processing
    const batchSize = 3;
    const saveInterval = setInterval(saveProgress, 2 * 60 * 1000); // Save every 2 minutes
    
    // Process pages in batches
    for (let start = 0; start <= maxPage; start += batchSize) {
      const end = Math.min(start + batchSize - 1, maxPage);
      console.log(`Processing batch of pages ${start}-${end}`);
      
      // Create array of page numbers to process in parallel
      const pagePromises = [];
      for (let page = start; page <= end; page++) {
        pagePromises.push(scrapeMPsFromPage(page));
      }
      
      // Wait for all pages in batch to complete
      const results = await Promise.all(pagePromises);
      
      // Check if any page failed
      if (results.some(success => !success)) {
        console.warn(`Some pages in batch ${start}-${end} failed. Continuing with next batch.`);
      }
      
      // Short delay between batches
      await new Promise(resolve => setTimeout(resolve, 2000));
    }
    
    // Stop the auto-save interval
    clearInterval(saveInterval);
    
    // Save final results
    fs.writeFileSync('kenyan_mps_data.json', JSON.stringify(allMPs, null, 2));
    console.log(`Scraping completed. ${allMPs.length} MPs saved to kenyan_mps_data.json`);
    
  } catch (error) {
    console.error('Error in main scraping function:', error.message);
    
    // Save what we have in case of a fatal error
    saveProgress();
  }
}

// Alternative function to process local HTML file if scraping still fails
function processLocalHTML(filePath) {
  try {
    console.log(`Processing local HTML file: ${filePath}`);
    
    const htmlContent = fs.readFileSync(filePath, 'utf8');
    const $ = cheerio.load(htmlContent);
    
    const mpRows = $('table tbody tr.mp');
    console.log(`Found ${mpRows.length} MPs in local file`);
    
    const localMPs = [];
    
    mpRows.each((index, element) => {
      const row = $(element);
      const columns = row.find('td');
      
      if (columns.length < 6) return;
      
      const name = columns.eq(0).text().trim();
      if (!name) return;
      
      const imgSrc = columns.eq(1).find('img').attr('src') || '';
      
      const mp = {
        name: name,
        profilePictureUrl: imgSrc ? `${baseUrl}${imgSrc}` : '',
        county: columns.eq(2).text().trim(),
        constituency: columns.eq(3).text().trim(),
        party: columns.eq(4).text().trim(),
        status: columns.eq(5).text().trim(),
        gender: determineGender(name)
      };
      
      localMPs.push(mp);
    });
    
    fs.writeFileSync('kenyan_mps_from_local.json', JSON.stringify(localMPs, null, 2));
    console.log(`Processed ${localMPs.length} MPs from local file`);
    
    return localMPs;
  } catch (error) {
    console.error('Error processing local HTML:', error.message);
    return [];
  }
}

// Run the scraper
console.log('Starting Kenya MPs scraper...');
console.log('If online scraping fails, you can use processLocalHTML("your-html-file.html") function.');

// Uncomment to run the scraper:
scrapeAllMPs();

// Uncomment to process a local HTML file instead:
// processLocalHTML('parliament_sample.html');
