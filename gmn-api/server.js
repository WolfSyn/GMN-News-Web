import express from 'express';
import fetch from 'node-fetch';
import dotenv from 'dotenv';
import cors from 'cors';
import { JSDOM } from 'jsdom';
import sanitizeHtml from 'sanitize-html';

dotenv.config();
const app = express();
app.use(cors());

const API_KEY = process.env.GAMESPOT_API_KEY;
const GS_BASE = 'https://www.gamespot.com/api/articles/';

// ---- helper: choose the largest/most useful image variant ----
function pickImage(img) {
  if (!img) return null;
  // Try larger fields first, then fall back to smaller/legacy fields.
  return (
    img.original ||
    img.super_url ||
    img.medium_url ||
    img.small_url ||
    img.square_medium ||
    img.square_small ||
    img.thumb_url ||
    img.tiny_url ||
    null
  );
}

// ---------- existing list endpoint ----------
app.get('/api/articles', async (req, res) => {
  try {
    const limit  = req.query.limit  ? Number(req.query.limit)  : 20;
    const offset = req.query.offset ? Number(req.query.offset) : 0;

    const url = new URL(GS_BASE);
    url.searchParams.append('api_key', API_KEY);
    url.searchParams.append('format', 'json');
    url.searchParams.append('sort', 'publish_date:desc');
    url.searchParams.append('limit', String(limit));
    url.searchParams.append('offset', String(offset));

    const response = await fetch(url.toString());
    const json = await response.json();

    const articles = (json.results || []).map(a => ({
      title: a.title,
      link:  a.site_detail_url,
      date:  a.publish_date?.slice(0, 10),
      deck:  a.deck,
      image: pickImage(a.image) // ← improved image selection
    }));

    res.json({
      articles,
      paging: {
        limit, offset,
        count: articles.length,
        hasMore: articles.length === limit
      }
    });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Failed to fetch' });
  }
});

// ---------- NEW: single-article reader endpoint ----------
app.get('/api/article', async (req, res) => {
  try {
    const articleUrl = req.query.url;
    if (!articleUrl) return res.status(400).json({ error: 'Missing url param' });

    // (Optional) restrict to GameSpot
    const u = new URL(articleUrl);
    if (!u.hostname.endsWith('gamespot.com')) {
      return res.status(400).json({ error: 'Only GameSpot URLs are allowed' });
    }

    // Fetch raw HTML of the article
    const htmlResp = await fetch(articleUrl, {
      headers: { 'User-Agent': 'GMN-Reader/1.0 (+https://yourdomain)' }
    });
    const html = await htmlResp.text();

    // Parse & extract readable content
    const dom = new JSDOM(html, { url: articleUrl });
    const doc = dom.window.document;

    const { Readability } = await import('@mozilla/readability');
    const reader = new Readability(doc);
    const parsed = reader.parse(); // { title, byline, content, excerpt, length, siteName }

    if (!parsed) {
      return res.status(500).json({ error: 'Unable to parse article' });
    }

    // Sanitize the HTML we’ll send to the browser
    const clean = sanitizeHtml(parsed.content, {
      allowedTags: sanitizeHtml.defaults.allowedTags.concat(['img', 'figure', 'figcaption']),
      allowedAttributes: {
        a: ['href', 'name', 'target', 'rel'],
        img: ['src', 'alt', 'title'],
        '*': ['id', 'class', 'style']
      },
      transformTags: {
        a: (tagName, attribs) => ({
          tagName: 'a',
          attribs: { ...attribs, target: '_blank', rel: 'noopener' }
        })
      }
    });

    // Try to pick a lead image
    const leadImg =
      doc.querySelector('meta[property="og:image"]')?.getAttribute('content') ||
      doc.querySelector('meta[name="twitter:image"]')?.getAttribute('content') ||
      null;

    res.json({
      title: parsed.title,
      byline: parsed.byline || null,
      excerpt: parsed.excerpt || null,
      siteName: parsed.siteName || 'GameSpot',
      leadImage: leadImg,
      html: clean
    });
  } catch (e) {
    console.error('reader error:', e);
    res.status(500).json({ error: 'Reader failed' });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`API listening on ${PORT}`));
