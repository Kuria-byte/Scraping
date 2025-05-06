const cheerio = require('cheerio');
const path = require('path');
const MP = require('../models/mp');
const HttpClient = require('../utils/http-client');
const logger = require('../utils/logger');
const { saveJsonData, saveCheckpoint } = require('../utils/file-utils');
const { inferGender } = require('../utils/name-utils');
const { urls, httpConfig, outputConfig } = require('../../config');

class BaseScraper {
  constructor() {
    this.allMPs = [];
    this.httpClient = new HttpClient();
    this.baseUrl = urls.baseUrl;
  }
  
  /**
   * Extract MP data from a page
   */
  async scrapeMPsFromPage(pageNum) {
    try {
      logger.info(`Scraping page ${pageNum}...`);
      // Get the main page with MP listings
      const url = pageNum === 0 
        ? `${this.baseUrl}/the-national-assembly/mps` 
        : `${this.baseUrl}/the-national-assembly/mps?field_name_value=%20&field_parliament_value=2022&field_employment_history_value=&page=${pageNum}`;
      const html = await this.httpClient.get(url);
      const $ = cheerio.load(html);
      // Find all MP rows in the table
      const mpRows = $('table tbody tr.mp');
      logger.info(`Found ${mpRows.length} MPs on this page`);
      // If no rows found, we might have reached the end of pagination
      if (mpRows.length === 0) {
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
        const profilePictureUrl = imgSrc ? (imgSrc.startsWith('http') ? imgSrc : `${this.baseUrl}${imgSrc}`) : '';
        // Extract the More link for additional details
        const moreLink = columns.eq(6).find('a').attr('href');
        // Create MP object
        const mp = new MP({
          name: name,
          profilePictureUrl: profilePictureUrl,
          county: columns.eq(2).text().trim(),
          constituency: columns.eq(3).text().trim(),
          party: columns.eq(4).text().trim(),
          status: columns.eq(5).text().trim(),
          detailsLink: moreLink ? `${this.baseUrl}${moreLink}` : '',
          gender: inferGender(name),
          dataSources: ['parliament']
        });
        logger.info(`Processing MP: ${mp.name}`);
        // If there's a "More..." link, fetch additional details
        if (moreLink) {
          try {
            await this.fetchAdditionalDetails(mp, moreLink);
          } catch (detailError) {
            logger.error(`Error fetching details for MP ${mp.name}: ${detailError.message}`);
          }
        }
        // Add MP to the collection
        this.allMPs.push(mp);
        // Minimal delay between MP detail requests
        await new Promise(resolve => setTimeout(resolve, 500));
      }
      return true; // Successfully scraped this page
    } catch (error) {
      logger.error(`Error scraping page ${pageNum}: ${error.message}`);
      return false;
    }
  }
  
  /**
   * Fetch additional MP details from their individual page
   */
  async fetchAdditionalDetails(mp, moreLink) {
    try {
      const detailUrl = `${this.baseUrl}${moreLink}`;
      logger.info(`Fetching additional details from: ${detailUrl}`);
      const html = await this.httpClient.get(detailUrl);
      const $ = cheerio.load(html);
      // Extract committee information
      const committees = [];
      $('.field--name-field-committees .field__item').each((_, elem) => {
        committees.push($(elem).text().trim());
      });
      mp.committees = committees.length > 0 ? committees : ['Not available'];
      // Extract employment history
      const employmentHistory = [];
      $('.field--name-field-employment-history .field__item').each((_, elem) => {
        employmentHistory.push($(elem).text().trim());
      });
      mp.employmentHistory = employmentHistory.length > 0 ? employmentHistory : ['Not available'];
      // Extract contact information if available
      mp.email = $('a[href^="mailto:"]').text().trim() || 'Not available';
      mp.phone = $('a[href^="tel:"]').text().trim() || 'Not available';
      logger.info(`Successfully fetched details for ${mp.name}`);
    } catch (error) {
      logger.error(`Error fetching details for ${mp.name}: ${error.message}`);
      throw error;
    }
  }
  
  /**
   * Save progress
   */
  saveProgress() {
    if (this.allMPs.length > 0) {
      const timestamp = new Date().toISOString().replace(/:/g, '-');
      const progressPath = path.join(
        outputConfig.checkpointDir, 
        `mps_progress_${timestamp}.json`
      );
      saveJsonData(progressPath, this.allMPs);
      logger.info(`Progress saved: ${this.allMPs.length} MPs`);
    }
  }
  
  /**
   * Scrape all MPs
   */
  async scrapeAllMPs() {
    try {
      logger.info('Starting to scrape Kenya MPs data...');
      // Fetch the first page to get pagination info
      const html = await this.httpClient.get(`${this.baseUrl}/the-national-assembly/mps`);
      const $ = cheerio.load(html);
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
      logger.info(`Detected ${maxPage + 1} pages of MPs`);
      // Process pages in batches for parallel processing
      const batchSize = httpConfig.batchSize;
      const saveIntervalId = setInterval(() => this.saveProgress(), 2 * 60 * 1000); // Save every 2 minutes
      // Process pages in batches
      for (let start = 0; start <= maxPage; start += batchSize) {
        const end = Math.min(start + batchSize - 1, maxPage);
        logger.info(`Processing batch of pages ${start}-${end}`);
        // Create array of page numbers to process in parallel
        const pagePromises = [];
        for (let page = start; page <= end; page++) {
          pagePromises.push(this.scrapeMPsFromPage(page));
        }
        // Wait for all pages in batch to complete
        const results = await Promise.all(pagePromises);
        // Save checkpoint after each batch
        saveCheckpoint('base_scraper_batch', this.allMPs);
        // Short delay between batches
        await new Promise(resolve => setTimeout(resolve, 2000));
      }
      // Stop the auto-save interval
      clearInterval(saveIntervalId);
      // Save final results
      saveJsonData(outputConfig.outputFiles.raw, this.allMPs);
      logger.info(`Scraping completed. ${this.allMPs.length} MPs saved to ${outputConfig.outputFiles.raw}`);
      return this.allMPs;
    } catch (error) {
      logger.error(`Error in scrapeAllMPs: ${error.message}`);
      this.saveProgress();
      throw error;
    }
  }
}

module.exports = BaseScraper; 