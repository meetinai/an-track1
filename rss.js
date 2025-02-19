const axios = require('axios');
const cheerio = require('cheerio');
const { Feed } = require('feed');
const fs = require('fs');
const path = require('path');
const log4js = require('log4js');
const dayjs = require('dayjs');
const utc = require('dayjs/plugin/utc');

dayjs.extend(utc);

// Set up logging
log4js.configure({
  appenders: {
    file: { type: 'file', filename: 'rss_monitor.log' },
    console: { type: 'console' }
  },
  categories: {
    default: { appenders: ['file', 'console'], level: 'info' }
  }
});
const logger = log4js.getLogger();

/**
 * Get the project root directory
 * @returns {string} Root directory path
 */
function getProjectRoot() {
  return path.dirname(path.dirname(__filename));
}

/**
 * Get the RSS directory
 * @returns {string} RSS directory path
 */
function getRssDirectory() {
  return path.dirname(__filename);
}

/**
 * Ensure the feeds directory exists
 * @returns {string} Path to feeds directory
 */
function ensureFeedsDirectory() {
  const feedsDir = path.join(getRssDirectory(), 'feeds');
  if (!fs.existsSync(feedsDir)) {
    fs.mkdirSync(feedsDir, { recursive: true });
  }
  return feedsDir;
}

/**
 * Load existing articles from JSON state file
 * @param {string} stateFile Path to state file
 * @returns {Array} Array of existing articles
 */
function loadExistingArticles(stateFile) {
  try {
    if (!fs.existsSync(stateFile)) {
      return [];
    }
    
    const articles = JSON.parse(fs.readFileSync(stateFile, 'utf8'));
    // Convert ISO strings back to Date objects
    for (const article of articles) {
      try {
        article.date = dayjs(article.date).toDate();
      } catch (e) {
        article.date = dayjs().utc().toDate();
      }
    }
    return articles;
  } catch (e) {
    logger.error(`Error loading state: ${e.message} - Starting fresh`);
    return [];
  }
}

/**
 * Save articles to JSON state file
 * @param {Array} articles Array of articles
 * @param {string} stateFile Path to state file
 */
function saveArticles(articles, stateFile) {
  try {
    const serializable = articles.map(article => {
      const temp = { ...article };
      temp.date = dayjs(article.date).toISOString();
      return temp;
    });
    
    fs.writeFileSync(stateFile, JSON.stringify(serializable, null, 2));
    logger.info(`Saved ${articles.length} articles to state file`);
  } catch (e) {
    logger.error(`Error saving state: ${e.message}`);
  }
}

/**
 * Fetch news content from Anthropic's website
 * @param {string} url URL to fetch
 * @returns {Promise<string>} HTML content
 */
async function fetchNewsContent(url = 'https://www.anthropic.com/news') {
  try {
    const headers = {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
    };
    const response = await axios.get(url, { headers, timeout: 10000 });
    return response.data;
  } catch (e) {
    logger.error(`Error fetching news content: ${e.message}`);
    throw e;
  }
}

/**
 * Parse the news HTML content and extract article information
 * @param {string} htmlContent HTML content to parse
 * @returns {Array} Array of parsed articles
 */
function parseNewsHtml(htmlContent) {
  try {
    const $ = cheerio.load(htmlContent);
    const articles = [];

    const newsCards = $('a.PostCard_post-card__z_Sqq');

    newsCards.each((_, card) => {
      const titleElem = $(card).find('h3.PostCard_post-heading__Ob1pu');
      if (!titleElem.length) return;
      const title = titleElem.text().trim();

      const href = $(card).attr('href');
      const link = href.startsWith('/') 
        ? `https://www.anthropic.com${href}` 
        : href;

      let date = dayjs().utc().toDate();
      const dateElem = $(card).find('div.PostList_post-date__djrOA');
      if (dateElem.length) {
        try {
          date = dayjs(dateElem.text().trim(), 'MMM D, YYYY').toDate();
        } catch (e) {
          logger.warning(`Could not parse date for article: ${title}`);
        }
      }

      const categoryElem = $(card).find('span.text-label');
      const category = categoryElem.length ? categoryElem.text().trim() : 'News';

      const description = title;

      articles.push({
        title,
        link,
        date,
        category,
        description
      });
    });

    logger.info(`Successfully parsed ${articles.length} articles`);
    return articles;
  } catch (e) {
    logger.error(`Error parsing HTML content: ${e.message}`);
    throw e;
  }
}

/**
 * Generate RSS feed from news articles
 * @param {Array} articles Array of articles
 * @param {string} feedName Name of the feed
 * @returns {Feed} Generated feed
 */
function generateRssFeed(articles, feedName = 'anthropic') {
  try {
    const feed = new Feed({
      title: 'Anthropic News',
      description: 'Latest news and updates from Anthropic',
      id: 'https://www.anthropic.com/news',
      link: 'https://www.anthropic.com/news',
      language: 'en',
      image: 'https://www.anthropic.com/images/icons/apple-touch-icon.png',
      favicon: 'https://www.anthropic.com/favicon.ico',
      copyright: 'Anthropic',
      updated: new Date(),
      generator: 'Custom RSS Generator',
      feedLinks: {
        rss: `https://anthropic.com/news/feed_${feedName}.xml`
      },
      author: {
        name: 'Anthropic'
      }
    });

    for (const article of articles) {
      feed.addItem({
        title: article.title,
        id: article.link,
        link: article.link,
        description: article.description,
        content: article.description,
        date: article.date,
        category: [{ name: article.category }]
      });
    }

    logger.info('Successfully generated RSS feed');
    return feed;
  } catch (e) {
    logger.error(`Error generating RSS feed: ${e.message}`);
    throw e;
  }
}

/**
 * Save the RSS feed to a file in the feeds directory
 * @param {Feed} feedGenerator Feed generator instance
 * @param {string} feedName Name of the feed
 * @returns {string} Output filename
 */
function saveRssFeed(feedGenerator, feedName = 'anthropic') {
  try {
    const feedsDir = ensureFeedsDirectory();
    const outputFilename = path.join(feedsDir, `feed_${feedName}.xml`);
    fs.writeFileSync(outputFilename, feedGenerator.rss2());
    logger.info(`Successfully saved RSS feed to ${outputFilename}`);
    return outputFilename;
  } catch (e) {
    logger.error(`Error saving RSS feed: ${e.message}`);
    throw e;
  }
}

/**
 * Process new articles and update feed
 * @param {Array} existing Existing articles
 * @param {Array} current Current articles
 * @param {string} stateFile Path to state file
 */
function handleNewArticles(existing, current, stateFile) {
  const existingUrls = new Set(existing.map(a => a.link));
  const newArticles = current.filter(a => !existingUrls.has(a.link));

  if (!newArticles.length) {
    logger.info('No new articles found');
    return;
  }

  logger.info(`Found ${newArticles.length} new articles`);
  const updatedArticles = [...existing, ...newArticles].sort(
    (a, b) => dayjs(b.date).valueOf() - dayjs(a.date).valueOf()
  );
  
  const feed = generateRssFeed(updatedArticles);
  saveRssFeed(feed);
  saveArticles(updatedArticles, stateFile);
}

/**
 * Continuous monitoring loop with 60-second interval
 */
async function mainLoop() {
  const feedsDir = ensureFeedsDirectory();
  const stateFile = path.join(getRssDirectory(), 'news_state.json');
  
  const shutdown = (signal) => {
    logger.info('\nGracefully shutting down...');
    process.exit(0);
  };
  
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);

  logger.info('Starting RSS feed monitor...');
  while (true) {
    try {
      const html = await fetchNewsContent();
      const currentArticles = parseNewsHtml(html);
      const existingArticles = loadExistingArticles(stateFile);
      handleNewArticles(existingArticles, currentArticles, stateFile);
    } catch (e) {
      logger.error(`Monitoring error: ${e.message}`);
    }
    
    await new Promise(resolve => setTimeout(resolve, 60000));
  }
}

if (require.main === module) {
  mainLoop();
}

module.exports = {
  fetchNewsContent,
  parseNewsHtml,
  generateRssFeed,
  saveRssFeed,
  loadExistingArticles,
  saveArticles,
  handleNewArticles,
  mainLoop
};