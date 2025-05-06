const fs = require('fs');
const path = require('path');
const { outputConfig } = require('../../config');

/**
 * Load JSON data from a file
 */
function loadJsonData(filePath) {
  try {
    if (!fs.existsSync(filePath)) {
      return null;
    }
    const rawData = fs.readFileSync(filePath, 'utf8');
    return JSON.parse(rawData);
  } catch (error) {
    throw new Error(`Error loading data from ${filePath}: ${error.message}`);
  }
}

/**
 * Save JSON data to a file
 */
function saveJsonData(filePath, data) {
  try {
    const dir = path.dirname(filePath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
    return true;
  } catch (error) {
    throw new Error(`Error saving data to ${filePath}: ${error.message}`);
  }
}

/**
 * Save a checkpoint during long-running operations
 */
function saveCheckpoint(stage, data) {
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const checkpointPath = path.join(
    outputConfig.checkpointDir, 
    `checkpoint_${stage}_${timestamp}.json`
  );
  return saveJsonData(checkpointPath, {
    timestamp: new Date().toISOString(),
    stage,
    data
  });
}

/**
 * Find the latest checkpoint for a stage
 */
function findLatestCheckpoint(stage) {
  try {
    const files = fs.readdirSync(outputConfig.checkpointDir)
      .filter(file => file.startsWith(`checkpoint_${stage}_`))
      .sort()
      .reverse();
    if (files.length === 0) return null;
    return loadJsonData(path.join(outputConfig.checkpointDir, files[0]));
  } catch (error) {
    throw new Error(`Error finding checkpoint: ${error.message}`);
  }
}

module.exports = {
  loadJsonData,
  saveJsonData,
  saveCheckpoint,
  findLatestCheckpoint
}; 