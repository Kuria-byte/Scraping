const axios = require('axios');
const { httpConfig } = require('../../config');

class HttpClient {
  constructor(options = {}) {
    this.client = axios.create({
      timeout: options.timeout || httpConfig.timeout,
      headers: {
        'User-Agent': httpConfig.userAgent,
        ...options.headers
      }
    });
    this.retryDelay = options.retryDelay || httpConfig.retryDelay;
    this.maxRetries = options.maxRetries || httpConfig.maxRetries;
  }

  async get(url, options = {}) {
    return this._request('get', url, null, options);
  }

  async _request(method, url, data = null, options = {}) {
    let retries = 0;
    while (retries <= this.maxRetries) {
      try {
        const response = await this.client[method](url, data, options);
        return response.data;
      } catch (error) {
        if (retries === this.maxRetries) throw error;
        const delay = this.retryDelay * Math.pow(1.5, retries);
        await new Promise(resolve => setTimeout(resolve, delay));
        retries++;
      }
    }
  }
}

module.exports = HttpClient; 