const fs = require('fs');
const path = require('path');
const axios = require('axios');
const pdf = require('pdf-parse');
const { createWorker } = require('tesseract.js');

// Configuration
// Array of possible scorecard URLs to try
const SCORECARD_URLS = [
  'https://mzalendo.com/media/resources/2023_Parliamentary_Scorecard.pdf',
  'https://mzalendo.com/media/resources/2022_Parliamentary_Scorecard.pdf',
  'https://mzalendo.com/media/resources/2021_Parliamentary_Scorecard.pdf',
  'https://mzalendo.com/media/resources/2020_Parliamentary_Scorecard.pdf',
  'https://mzalendo.com/media/resources/2019_Parliamentary_Scorecard.pdf'
];
const OUTPUT_PATH = path.join(__dirname, 'scorecard_data.json');

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

// Try to download the PDF files from multiple possible URLs
async function tryDownloadPDFs() {
  const downloadResults = [];
  
  for (const url of SCORECARD_URLS) {
    try {
      console.log(`Attempting to download from ${url}...`);
      
      const response = await axios({
        method: 'GET',
        url: url,
        responseType: 'stream',
        timeout: 10000  // 10 seconds timeout
      });
      
      // Get the filename from the URL
      const filename = path.basename(url);
      const outputPath = path.join(__dirname, filename);
      
      const writer = fs.createWriteStream(outputPath);
      response.data.pipe(writer);
      
      await new Promise((resolve, reject) => {
        writer.on('finish', resolve);
        writer.on('error', reject);
      });
      
      console.log(`Successfully downloaded ${filename}`);
      downloadResults.push({
        url,
        path: outputPath,
        success: true
      });
    } catch (error) {
      console.error(`Failed to download from ${url}: ${error.message}`);
      downloadResults.push({
        url,
        success: false,
        error: error.message
      });
    }
  }
  
  return downloadResults;
}

// Extract text from PDF using pdf-parse
async function extractTextFromPDF(pdfPath) {
  try {
    console.log(`Extracting text from PDF at ${pdfPath}...`);
    const dataBuffer = fs.readFileSync(pdfPath);
    const data = await pdf(dataBuffer);
    return data.text;
  } catch (error) {
    console.error(`Error extracting text from PDF: ${error.message}`);
    throw error;
  }
}

// Use OCR for PDFs that resist text extraction
async function ocrPDF(pdfPath) {
  try {
    console.log('PDF text extraction failed or produced poor results. Attempting OCR...');
    
    // Create a worker for Tesseract OCR
    const worker = await createWorker();
    
    // Initialize worker with English language
    await worker.load();
    await worker.loadLanguage('eng');
    await worker.initialize('eng');
    
    // For PDFs, we'd need to convert to images first
    // This is a simplified example - in a real scenario, you'd use a tool like pdf2image
    // to convert each page to an image, then process each image
    
    // Placeholder for OCR result
    const result = await worker.recognize(pdfPath);
    
    // Terminate worker
    await worker.terminate();
    
    return result.data.text;
  } catch (error) {
    console.error(`Error performing OCR: ${error.message}`);
    throw error;
  }
}

// Parse parliamentary scorecard data
function parseScorecard(text) {
  console.log('Parsing scorecard data...');
  
  // Array to store all MP scorecard data
  const scorecardData = [];
  
  // Split the text into lines
  const lines = text.split('\n').map(line => line.trim()).filter(line => line);
  
  // Regular expressions for different data patterns
  const mpNameRegex = /^(HON\.?\s*)?([A-Z\s\.\(\),-]+)$/i;
  const scoreRegex = /^(\d+)%$/;
  const rankRegex = /^Rank:\s*(\d+)(?:\s*\/\s*(\d+))?$/i;
  
  // Track current MP being processed
  let currentMP = null;
  
  // Process each line
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    
    // Check if line contains an MP name
    const nameMatch = line.match(mpNameRegex);
    if (nameMatch && !line.toLowerCase().includes('parliamentary') && !line.toLowerCase().includes('scorecard')) {
      // Start a new MP record
      currentMP = {
        name: nameMatch[2].trim(),
        scores: {},
        rank: null,
        totalScore: null
      };
      scorecardData.push(currentMP);
      continue;
    }
    
    // If we have a current MP, check for score data
    if (currentMP) {
      // Check for score percentage
      const scoreMatch = line.match(scoreRegex);
      if (scoreMatch) {
        const score = parseInt(scoreMatch[1]);
        
        // Try to determine what type of score this is from previous lines
        let scoreType = 'unknown';
        for (let j = 1; j <= 3; j++) {
          const prevLine = i - j >= 0 ? lines[i - j].toLowerCase() : '';
          if (prevLine.includes('participation')) {
            scoreType = 'participation';
            break;
          } else if (prevLine.includes('debate')) {
            scoreType = 'debate';
            break;
          } else if (prevLine.includes('committee')) {
            scoreType = 'committee';
            break;
          } else if (prevLine.includes('bills')) {
            scoreType = 'bills';
            break;
          } else if (prevLine.includes('total') || prevLine.includes('overall')) {
            scoreType = 'total';
            break;
          }
        }
        
        if (scoreType === 'total') {
          currentMP.totalScore = score;
        } else {
          currentMP.scores[scoreType] = score;
        }
        continue;
      }
      
      // Check for rank information
      const rankMatch = line.match(rankRegex);
      if (rankMatch) {
        currentMP.rank = {
          position: parseInt(rankMatch[1]),
          outOf: rankMatch[2] ? parseInt(rankMatch[2]) : null
        };
        continue;
      }
    }
  }
  
  console.log(`Extracted scorecard data for ${scorecardData.length} MPs`);
  return scorecardData;
}

// Alternative parsing approach for different scorecard formats
function parseScorecard2(text) {
  console.log('Using alternative parsing approach...');
  
  // Array to store all MP scorecard data
  const scorecardData = [];
  
  // Split the text into lines and remove empty lines
  const lines = text.split('\n').map(line => line.trim()).filter(line => line);
  
  // Detect sections with MP names
  let currentMP = null;
  
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    
    // Look for lines containing MP names (typically capitalized)
    if (/^([A-Z][A-Za-z\.\s]+)$/.test(line) && line.length > 5) {
      const mpName = line.trim();
      
      // Start a new MP record
      currentMP = {
        name: mpName,
        scores: {},
        rank: null,
        totalScore: null,
        rawText: []  // Store raw text associated with this MP for debugging
      };
      
      scorecardData.push(currentMP);
      continue;
    }
    
    // If we have a current MP, collect data
    if (currentMP) {
      // Store this line in the raw text
      currentMP.rawText.push(line);
      
      // Look for percentage scores
      const percentMatch = line.match(/(\d+)%/);
      if (percentMatch) {
        const score = parseInt(percentMatch[1]);
        
        // Try to determine score type from the same line or previous line
        const lineText = line.toLowerCase();
        const prevLine = i > 0 ? lines[i-1].toLowerCase() : '';
        
        if (lineText.includes('overall') || prevLine.includes('overall') || 
            lineText.includes('total') || prevLine.includes('total')) {
          currentMP.totalScore = score;
        } else if (lineText.includes('participation') || prevLine.includes('participation')) {
          currentMP.scores.participation = score;
        } else if (lineText.includes('debate') || prevLine.includes('debate')) {
          currentMP.scores.debate = score;
        } else if (lineText.includes('committee') || prevLine.includes('committee')) {
          currentMP.scores.committee = score;
        } else if (lineText.includes('bill') || prevLine.includes('bill')) {
          currentMP.scores.bills = score;
        } else {
          // If we can't determine the type, store as unknown
          if (!currentMP.scores.unknown) {
            currentMP.scores.unknown = [];
          }
          currentMP.scores.unknown.push(score);
        }
      }
      
      // Look for rank information
      const rankMatch = line.match(/Rank:?\s*(\d+)(?:\s*\/\s*(\d+))?/i);
      if (rankMatch) {
        currentMP.rank = {
          position: parseInt(rankMatch[1]),
          outOf: rankMatch[2] ? parseInt(rankMatch[2]) : null
        };
      }
    }
  }
  
  console.log(`Alternative parsing extracted data for ${scorecardData.length} MPs`);
  return scorecardData;
}

// Match scorecard data with existing MP data
function matchScorecardWithMPs(scorecardData, mps) {
  console.log('Matching scorecard data with existing MPs...');
  
  // Create a map of normalized names to MPs for faster lookup
  const mpMap = {};
  mps.forEach(mp => {
    const normalizedName = normalizeName(mp.name);
    mpMap[normalizedName] = mp;
    
    // Also add variations without titles
    const simplifiedName = simplifyName(mp.name);
    if (simplifiedName !== normalizedName) {
      mpMap[simplifiedName] = mp;
    }
  });
  
  // Track match statistics
  let matchCount = 0;
  let noMatchCount = 0;
  
  // Try to match each scorecard entry with an MP
  scorecardData.forEach(scorecard => {
    // Normalize the name for matching
    const normalizedName = normalizeName(scorecard.name);
    const simplifiedName = simplifyName(scorecard.name);
    
    // Try to find a match in our MP data
    let matchedMP = mpMap[normalizedName] || mpMap[simplifiedName];
    
    // If no direct match, try a more fuzzy approach
    if (!matchedMP) {
      // Split names into parts and try to match on significant parts
      const nameParts = simplifiedName.split(' ').filter(part => part.length > 3);
      
      // Look for MPs with matching name parts
      for (const [mpName, mp] of Object.entries(mpMap)) {
        const mpNameParts = mpName.split(' ');
        // Count how many parts match
        const matchingParts = nameParts.filter(part => 
          mpNameParts.some(mpPart => mpPart.includes(part) || part.includes(mpPart))
        );
        
        // If we have a good match (more than half of the parts match), use this MP
        if (matchingParts.length >= Math.ceil(nameParts.length / 2)) {
          matchedMP = mp;
          break;
        }
      }
    }
    
    if (matchedMP) {
      // Add scorecard data to the MP
      matchedMP.scorecard = {
        scores: scorecard.scores,
        totalScore: scorecard.totalScore,
        rank: scorecard.rank
      };
      matchCount++;
    } else {
      console.log(`No match found for MP: ${scorecard.name}`);
      noMatchCount++;
    }
  });
  
  console.log(`Matched ${matchCount} MPs with scorecard data`);
  console.log(`Could not match ${noMatchCount} scorecard entries`);
  
  return mps;
}

// Helper function to normalize names for matching
function normalizeName(name) {
  return name
    .toUpperCase()
    .replace(/\s+/g, ' ')
    .trim();
}

// Helper function to simplify names by removing titles
function simplifyName(name) {
  return name
    .toUpperCase()
    .replace(/HON\.\s*/, '')
    .replace(/\(.*?\)/, '')
    .replace(/DR\.\s*/, '')
    .replace(/PROF\.\s*/, '')
    .replace(/\s+/g, ' ')
    .trim();
}

// Scrape data directly from Mzalendo website as an alternative approach
async function scrapeMzalendoWebsite() {
  try {
    console.log('Attempting to scrape data directly from Mzalendo website...');
    
    // Example: scrape the top performers page
    const response = await axios.get('https://info.mzalendo.com/');
    
    // Process the response here...
    // This is just a placeholder for a more comprehensive web scraping approach
    // if the PDF extraction doesn't work well
    
    return {
      success: true,
      message: 'Web scraping successful'
    };
  } catch (error) {
    console.error(`Error scraping Mzalendo website: ${error.message}`);
    return {
      success: false,
      error: error.message
    };
  }
}

// Main function
async function main() {
  try {
    // Load existing MPs data
    const mps = loadExistingMPData('kenyan_mps_enhanced.json');
    if (mps.length === 0) {
      console.error('No MP data found. Please run the scraper and enrichment script first.');
      return;
    }
    
    // Try to download scorecards from multiple URLs
    const downloadResults = await tryDownloadPDFs();
    const successfulDownloads = downloadResults.filter(result => result.success);
    
    if (successfulDownloads.length === 0) {
      console.log('Failed to download any scorecard PDFs. Trying web scraping approach...');
      await scrapeMzalendoWebsite();
      return;
    }
    
    // Process each successfully downloaded PDF
    let allScorecardData = [];
    
    for (const download of successfulDownloads) {
      console.log(`Processing ${download.path}...`);
      
      // Extract text from the PDF
      let pdfText;
      try {
        pdfText = await extractTextFromPDF(download.path);
        
        // Check if the extracted text is too short or empty (indicating poor extraction)
        if (!pdfText || pdfText.length < 500) {
          console.log('PDF text extraction produced poor results, attempting OCR...');
          pdfText = await ocrPDF(download.path);
        }
      } catch (error) {
        console.log('Error in PDF text extraction, attempting OCR as fallback...');
        pdfText = await ocrPDF(download.path);
      }
      
      // Save the extracted text for debugging
      const textFilename = path.basename(download.path, '.pdf') + '_text.txt';
      fs.writeFileSync(textFilename, pdfText);
      console.log(`Saved extracted text to ${textFilename}`);
      
      // Try both parsing approaches
      let scorecardData = parseScorecard(pdfText);
      
      // If first parser didn't find much, try the alternative parser
      if (scorecardData.length < 10) {
        console.log('First parser found few results, trying alternative parser...');
        scorecardData = parseScorecard2(pdfText);
      }
      
      // Add year information based on filename
      const yearMatch = download.url.match(/(\d{4})_Parliamentary_Scorecard/);
      const year = yearMatch ? yearMatch[1] : 'unknown';
      
      scorecardData.forEach(mp => {
        mp.year = year;
      });
      
      allScorecardData = allScorecardData.concat(scorecardData);
    }
    
    // Match scorecard data with MPs
    const enrichedMPs = matchScorecardWithMPs(allScorecardData, mps);
    
    // Save the enriched data
    fs.writeFileSync('kenyan_mps_with_scorecard.json', JSON.stringify(enrichedMPs, null, 2));
    console.log('Enriched MP data saved to kenyan_mps_with_scorecard.json');
    
    // Extract a summary of the scorecard data
    const scorecardSummary = allScorecardData.map(mp => ({
      name: mp.name,
      year: mp.year,
      totalScore: mp.totalScore,
      rank: mp.rank
    }));
    
    // Save the summary
    fs.writeFileSync('scorecard_summary.json', JSON.stringify(scorecardSummary, null, 2));
    console.log('Scorecard summary saved to scorecard_summary.json');
    
  } catch (error) {
    console.error(`An error occurred: ${error.message}`);
  }
}

// Run the main function
main();