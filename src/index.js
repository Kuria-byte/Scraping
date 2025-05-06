const BaseScraper = require('./scrapers/base-scraper');
const WikipediaScraper = require('./scrapers/wikipedia-scraper');
const LeadershipEnricher = require('./enrichers/leadership');
const CommitteesEnricher = require('./enrichers/committees');
const GenderEnricher = require('./enrichers/gender');
const WikipediaEnricher = require('./enrichers/wikipedia');
const { loadJsonData, saveJsonData } = require('./utils/file-utils');
const { generateDataQualityReport } = require('./reports/data-quality');
const { generateSummaryReport } = require('./reports/summary-report');
const logger = require('./utils/logger');
const { outputConfig } = require('../config');

async function main() {
  try {
    const args = process.argv.slice(2);
    const command = args[0] || 'all';
    
    if (command === 'scrape' || command === 'all') {
      logger.info('Starting base scraping...');
      const baseScraper = new BaseScraper();
      await baseScraper.scrapeAllMPs();
    }
    
    if (command === 'enrich' || command === 'all') {
      logger.info('Starting enrichment...');
      // Load raw MP data
      const rawMPs = loadJsonData(outputConfig.outputFiles.raw);
      if (!rawMPs || rawMPs.length === 0) {
        logger.error('No raw MP data found. Run scrape first.');
        process.exit(1);
      }
      // Apply enrichers
      const leadershipEnricher = new LeadershipEnricher();
      const committeesEnricher = new CommitteesEnricher();
      const genderEnricher = new GenderEnricher();
      const wikipediaEnricher = new WikipediaEnricher();
      let enrichedMPs = leadershipEnricher.enrich(rawMPs);
      enrichedMPs = committeesEnricher.enrich(enrichedMPs);
      enrichedMPs = genderEnricher.enrich(enrichedMPs);
      enrichedMPs = wikipediaEnricher.enrich(enrichedMPs);
      // Save enriched data
      saveJsonData(outputConfig.outputFiles.enhanced, enrichedMPs);
      logger.info(`Enrichment completed. Saved to ${outputConfig.outputFiles.enhanced}`);
    }
    
    if (command === 'wikipedia' || command === 'all') {
      logger.info('Starting Wikipedia data integration...');
      // Load enhanced MP data
      const enhancedMPs = loadJsonData(outputConfig.outputFiles.enhanced);
      if (!enhancedMPs || enhancedMPs.length === 0) {
        logger.error('No enhanced MP data found. Run enrich first.');
        process.exit(1);
      }
      // Run Wikipedia scraper
      const wikipediaScraper = new WikipediaScraper();
      
      // FIXED: Use one of these approaches, not both
      
      // Approach 1: If your WikipediaScraper has scrapeWikipediaMPs and mergeWithExistingData
      // const wikipediaMPs = await wikipediaScraper.scrapeWikipediaMPs();
      // const mergedMPs = wikipediaScraper.mergeWithExistingData(wikipediaMPs, enhancedMPs);
      
      // Approach 2: If your WikipediaScraper has the enrichMPsWithWikipedia method
      const mergedMPs = await wikipediaScraper.enrichMPsWithWikipedia(enhancedMPs);
      
      // Save merged data
      saveJsonData(outputConfig.outputFiles.withWikipedia, mergedMPs);
      logger.info(`Wikipedia integration completed. Saved to ${outputConfig.outputFiles.withWikipedia}`);
    }
    
    if (command === 'report' || command === 'all') {
      logger.info('Generating reports...');
      // Load final MP data
      const finalMPs = loadJsonData(outputConfig.outputFiles.withWikipedia) || 
                   loadJsonData(outputConfig.outputFiles.enhanced) ||
                   loadJsonData(outputConfig.outputFiles.raw);
      if (!finalMPs || finalMPs.length === 0) {
        logger.error('No MP data found.');
        process.exit(1);
      }
      // Generate reports
      const qualityReport = generateDataQualityReport(finalMPs);
      const summaryReport = generateSummaryReport(finalMPs);
      // Save reports
      saveJsonData(outputConfig.outputFiles.report, {
        qualityReport,
        summaryReport
      });
      logger.info(`Reports generated. Saved to ${outputConfig.outputFiles.report}`);
    }
    
    logger.info('All tasks completed successfully!');
  } catch (error) {
    logger.error(`Error in main: ${error.message}`);
    logger.error(error.stack);
    process.exit(1);
  }
}

// Run if called directly
if (require.main === module) {
  main();
}

module.exports = { main };