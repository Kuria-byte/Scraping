# Kenya MPs Data Collection Suite

A comprehensive system for collecting, enriching, and analyzing data about Kenya's Members of Parliament.

## Overview

This project provides tools to collect rich, structured data about Kenyan MPs from multiple sources. The suite includes several components that work together to create a comprehensive dataset:

1. **Base Scraper** - Extracts core MP data from the official Kenya Parliament website
2. **Data Enrichment** - Adds additional biographical details and parliamentary information
3. **Wikipedia Enhancer** - Obtains biographical information from Wikipedia
4. **Analytics Components** - Tools for analyzing and visualizing the MP data

## Components

### 1. Base MP Scraper (`http-kenyan-mps-scraper.js`)

This is the foundation of the data collection pipeline. It scrapes the Kenya Parliament website to obtain the basic information about MPs.

#### Features:
- Scrapes all MPs from the Parliament website
- Handles pagination properly
- Follows "More..." links to get detailed information
- Extracts name, constituency, county, party, photo, gender, and contact information
- Uses parallel processing to improve performance
- Implements robust error handling and automatic retries

#### Usage:
```bash
npm install axios cheerio
node http-kenyan-mps-scraper.js
```

### 2. MP Data Enrichment (`kenya-mps-data-enrichment-fixed.js`)

Adds more details to the base dataset, including:

#### Features:
- Leadership positions (Speaker, Majority Leader, etc.)
- Committee memberships and details
- More accurate gender classification
- Infers committee roles based on employment history
- Generates statistical summaries of the dataset

#### Usage:
```bash
node kenya-mps-data-enrichment-fixed.js
```

### 3. Wikipedia Data Enhancement (`wikipedia-kenya-mps-scraper.js`)

Takes our enriched MP data and adds information from Wikipedia.

#### Features:
- Extracts MP data from Wikipedia's Parliament pages
- Gets detailed information from individual MP Wikipedia pages
- Uses the Wikipedia API to find biographical information
- Merges Wikipedia data with our existing dataset
- Adds images, career information, and biographical details
- Implements intelligent fuzzy name matching between datasets

#### Usage:
```bash
node wikipedia-kenya-mps-scraper.js
```

## Required Dependencies

- **Node.js** (v14 or higher)
- **npm packages**:
  - axios (for HTTP requests)
  - cheerio (for HTML parsing)

Install with:
```bash
npm install axios cheerio
```

## Data Pipeline Flow

The recommended sequence for running the scripts:

1. First, run the base scraper:
   ```
   node http-kenyan-mps-scraper.js
   ```
   This creates `kenyan_mps_data.json`.

2. Next, run the enrichment script:
   ```
   node kenya-mps-data-enrichment-fixed.js
   ```
   This creates `kenyan_mps_enhanced.json`.

3. Finally, run the Wikipedia enhancer:
   ```
   node wikipedia-kenya-mps-scraper.js
   ```
   This creates `kenyan_mps_with_wikipedia.json`.

## Output Files

- **kenyan_mps_data.json** - Raw MP data from Parliament website
- **kenyan_mps_enhanced.json** - Enhanced with leadership positions and committees
- **kenyan_mps_with_wikipedia.json** - Further enhanced with Wikipedia data
- **kenyan_mps_report.json** - Statistical summary of the MP data

## Timeout and Error Handling

All scripts include:
- Automatic retries for failed requests
- Exponential backoff for rate limits
- Timeout settings to handle hanging connections
- Progress saving to avoid losing data if a script fails

## Advanced Features

### Parallel Processing

The main scraper uses batch processing to handle multiple pages simultaneously, significantly improving performance.

### Fuzzy Name Matching

The Wikipedia enhancer uses sophisticated name normalization and matching to correctly join different data sources even when names are formatted differently.

### Intelligent Committee Assignment

The enrichment script can infer committee memberships based on an MP's background and experience when direct data is unavailable.

## Customization

You can modify the following parameters in the scripts:

- **Batch size** - Number of pages to process in parallel (default: 3)
- **Delay between requests** - Time to wait between requests (default: 500ms)
- **Timeout** - Maximum time to wait for a response (default: 30 seconds)

## Troubleshooting

### Common Issues:

1. **Connection timeouts**:
   - Try increasing the timeout value
   - Run the script during off-peak hours
   - Use a VPN if the Parliament website is blocking your IP

2. **Rate limiting**:
   - Increase the delay between requests
   - Reduce the batch size for parallel processing

3. **Memory issues**:
   - For very large datasets, add `--max-old-space-size=4096` to the Node.js command

## License

MIT License - Feel free to use, modify, and distribute this code.

## Acknowledgments

- Kenya Parliament website for providing the base data
- Wikipedia for biographical information
- Mzalendo for parliamentary performance data