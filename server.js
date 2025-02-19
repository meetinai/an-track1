const express = require('express');
const path = require('path');
const fs = require('fs');
const { mainLoop } = require('./rss');

const app = express();
const PORT = process.env.PORT || 3000;

// Serve the RSS feed
app.get('/feed.xml', (req, res) => {
  const feedPath = path.join(__dirname, 'feeds', 'feed_anthropic.xml');
  
  if (fs.existsSync(feedPath)) {
    res.type('application/xml');
    res.sendFile(feedPath);
  } else {
    res.status(404).send('Feed not yet generated');
  }
});

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
  // Start the RSS monitoring in the background
  mainLoop();
});