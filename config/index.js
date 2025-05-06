const path = require('path');

// Base paths
const rootDir = path.resolve(__dirname, '..');
const outputDir = path.join(rootDir, 'output');

module.exports = {
  // URLs
  urls: {
    baseUrl: 'http://www.parliament.go.ke',
    wikipediaApi: 'https://en.wikipedia.org/w/api.php',
    newsApi: 'https://newsapi.org/v2/everything'
  },
  
  // HTTP settings
  httpConfig: {
    timeout: 30000,
    retryDelay: 2000,
    maxRetries: 3,
    batchSize: 3, // number of pages to process in parallel
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
  },
  
  // API keys
  apiKeys: {
    newsApiKey: process.env.NEWS_API_KEY || '22d0ee9a74814bad886eaecbe94db4af'
  },
  
  // Output paths
  outputConfig: {
    dataDir: path.join(outputDir, 'data'),
    checkpointDir: path.join(outputDir, 'checkpoints'),
    outputFiles: {
      raw: path.join(outputDir, 'data', 'kenyan_mps_data.json'),
      enhanced: path.join(outputDir, 'data', 'kenyan_mps_enhanced.json'),
      withWikipedia: path.join(outputDir, 'data', 'kenyan_mps_with_wikipedia.json'),
      report: path.join(outputDir, 'data', 'kenyan_mps_report.json')
    }
  },
  
  // Logging
  loggingConfig: {
    logDir: path.join(outputDir, 'logs')
  }
};
