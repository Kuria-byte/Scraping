# Kenya MPs Data Collection Suite

A modular, maintainable, and extensible system for collecting, enriching, and analyzing data about Kenya's Members of Parliament.

## Directory Structure

```
kenya-mps-scraper/
├── package.json
├── README.md
├── config/
│   ├── index.js                  # Central config with URLs, timeouts, etc.
│   └── committees.js             # Committee definitions
├── src/
│   ├── index.js                  # Main entry point
│   ├── utils/
│   │   ├── logger.js             # Unified logging
│   │   ├── http-client.js        # Centralized HTTP client
│   │   ├── name-utils.js         # Name normalization functions
│   │   └── file-utils.js         # File operations and checkpoints
│   ├── models/
│   │   └── mp.js                 # MP data model
│   ├── scrapers/
│   │   ├── base-scraper.js       # Base scraper from parliament
│   │   ├── wikipedia-scraper.js  # Wikipedia scraper
│   │   └── news-scraper.js       # News articles scraper
│   ├── enrichers/
│   │   ├── leadership.js         # Leadership positions
│   │   ├── committees.js         # Committee assignments
│   │   ├── gender.js             # Gender inference
│   │   └── wikipedia.js          # Wikipedia biography enhancement
│   └── reports/
│       ├── data-quality.js       # Data quality assessment
│       └── summary-report.js     # Summary statistics
└── output/
    ├── data/                     # JSON data output
    ├── checkpoints/              # Progress checkpoints
    └── logs/                     # Log files
```

## Pipeline Steps

1. **Scrape**: Collects all MPs from the official Parliament website, including details and contact info.
2. **Enrich**: Adds leadership positions, committee assignments, and improves gender inference using enrichers.
3. **Wikipedia**: Scrapes Wikipedia for additional MP data (bio, image, etc.) and merges it with the main dataset.
4. **Report**: Generates data quality and summary reports (missing fields, party/county/gender breakdowns, etc.).

## Usage

- Run `npm install` to install dependencies.
- Use `npm start scrape` to run the base scraper and collect MP data from the Parliament website.
- Use `npm start enrich` to run the enrichment pipeline (leadership, committees, gender, Wikipedia enrichment).
- Use `npm start wikipedia` to run the Wikipedia data integration (scrapes Wikipedia and merges with MPs).
- Use `npm start report` to generate data quality and summary reports.
- Use `npm start` or `npm start all` to run the full pipeline (scrape, enrich, wikipedia, report) sequentially.
- Output data will be saved in the `output/data/` directory. Logs are in `output/logs/`.

### Example Commands

```bash
npm install
npm start scrape      # Scrape Parliament website for MPs
npm start enrich      # Enrich MP data (leadership, committees, gender, etc.)
npm start wikipedia   # Add Wikipedia data to MPs
npm start report      # Generate data quality and summary reports
npm start             # Run the full pipeline (all steps)
```

- See the `src/index.js` for command options (scrape, enrich, wikipedia, report, all).

## Modular Approach

- Each module handles a specific task (scraping, enrichment, reporting, etc.)
- Utilities and models are reusable and testable
- Central configuration for easy adjustments
- Output, logs, and checkpoints are organized in the `output/` directory

## Troubleshooting

- If you encounter connection timeouts, try increasing the timeout in `config/index.js`.
- If you see missing data, check the logs in `output/logs/` for errors or incomplete runs.
- For Wikipedia scraping, ensure you have a stable internet connection.

## Next Steps

- Expand the enrichers with more leadership and committee data.
- Improve Wikipedia scraping to fetch more detailed biographies and images.
- Add more advanced analytics or visualizations to the reports.
- Integrate additional data sources (e.g., news, scorecards).
- Write tests for each module for better reliability.

---

(See code for further details on each module.)

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