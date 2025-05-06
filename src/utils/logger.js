const fs = require('fs');
const path = require('path');
const { loggingConfig } = require('../../config');

class Logger {
  constructor(options = {}) {
    this.logDir = options.logDir || loggingConfig.logDir;
    this.logFile = options.logFile || 
      path.join(this.logDir, `scraper_${new Date().toISOString().replace(/:/g, '-')}.log`);
    
    // Ensure log directory exists
    if (!fs.existsSync(this.logDir)) {
      fs.mkdirSync(this.logDir, { recursive: true });
    }
  }

  log(message, level = 'info') {
    const timestamp = new Date().toISOString();
    const logMessage = `[${timestamp}] [${level.toUpperCase()}] ${message}`;
    
    console.log(logMessage);
    fs.appendFileSync(this.logFile, logMessage + '\n');
  }

  info(message) { this.log(message, 'info'); }
  warn(message) { this.log(message, 'warn'); }
  error(message) { this.log(message, 'error'); }
}

module.exports = new Logger(); // Singleton 