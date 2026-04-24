#!/usr/bin/env node
/**
 * Morning Edition — Daily HN + Reddit + Substack Magazine Generator
 * Sections: MOVE / EAT / SLEEP
 * Palette: Blue #417DC1 · Red #990000 · Yellow #FFC72C · Brown #713907 · Black #000 · Pearl #FAFAFA
 *
 * Usage: node generate.js [YYYY-MM-DD]
 *
 * Optional env vars:
 *   TELEGRAM_BOT_TOKEN  — your bot token
 *   TELEGRAM_CHAT_ID    — your chat / channel id
 */

const https = require("https");
const http  = require("http");
const fs    = require("fs");
const path  = require("path");

// ─── DATE ─────────────────────────────────────────────────────────────────────
const argDate = process.argv.find(a => /^\d{4}-\d{2}-\d{2}$/.test(a));
const DATE = argDate || new Date().toISOString().slice(0, 10);
const DISPLAY_DATE = new Date(DATE + "T12:00:00Z").toLocaleDateString("en-AU", {
  weekday: "long", year: "numeric", month: "long", day: "numeric"
});

// ─── PALETTE ──────────────────────────────────────────────────────────────────
const P = {
  blue:   "#417DC1",
  red:    "#990000",
  yellow: "#FFC72C",
  brown:  "#713907",
  black:  "#000000",
  pearl:  "#FAFAFA",
};

// ─── SOURCES ──────────────────────────────────────────────────────────────────
const SUBREDDITS = [
  "technology", "science", "worldnews", "business",
  "environment", "programming", "politics", "economics",
  "gadgets", "innovation"
];

const SUBSTACKS = [
  // General / News / Culture
  { handle: "alonmizrahi",                label: "Alon Mizrahi"                },
  { handle: "mikebrock",                  label: "Mike Brock"                  },
  { handle: "secretsofprivacy",           label: "Secrets of Privacy"          },
  { handle: "expatprep",                  label: "Expat Prep"                  },
  { handle: "sullydish",                  label: "The Dish"                    },
  { handle: "sirevanamato",               label: "Sir Evan Amato"              },
  { handle: "alexmccann",                 label: "Alex McCann"                 },
  { handle: "culturist",                  label: "The Culturist"               },
  { handle: "regenearthstudio",           label: "Regen Earth Studio"          },
  { handle: "sanderson1581",              label: "Sanderson"                   },
  { handle: "americanpoliticalfreakshow", label: "American Political Freakshow" },
  // Food
  { handle: "notoriousfoodie",            label: "Notorious Foodie"            },
  { handle: "cocolarkincooks",            label: "Coco Larkin Cooks"           },
  { handle: "ruthreichl",                 label: "Ruth Reichl"                 },
  { handle: "gaberoberge",                label: "Gabe Roberge"                },
  { handle: "luckydragonsupperclub",      label: "Lucky Dragon Supper Club"    },
];

const FOOD_HANDLES = new Set([
  "notoriousfoodie","cocolarkincooks","ruthreichl","gaberoberge","luckydragonsupperclub"
]);

// ─── SECTION DEFINITIONS ──────────────────────────────────────────────────────
const SECTIONS = {
  MOVE: {
    label:   "MOVE",
    tagline: "What's shifting. What's launching. What demands attention.",
    keywords: [
      "launch","release","startup","funding","policy","regulation","politics",
      "election","war","conflict","geopolitics","market","business","economics",
      "breaking","world","innovation","disruption","AI","LLM","agent","robot",
      "autonomous","breakthrough","new","introduces","announces","unveils",
      "chips","GPU","hardware","infrastructure","energy","EV","electric",
      "nuclear","space","gadgets","product","competition","china","europe",
      "treaty","summit","protest","strike","crisis","collapse","invasion"
    ],
    bg:        "#FFFDF7",
    headColor: P.red,
    accent:    P.red,
    cardBg:    "#FFFFFF",
    cardBorder:"#EDE8DF",
    inkColor:  "#1C1008",
  },
  EAT: {
    label:   "EAT",
    tagline: "Ideas worth ingesting. Tools, recipes, research, and deep reads.",
    keywords: [
      "research","paper","study","science","programming","developer","open source",
      "tool","library","framework","database","algorithm","security","privacy",
      "compiler","language","tutorial","guide","how","why","explained","analysis",
      "deep dive","review","cancer","biology","physics","chemistry","math",
      "medicine","health","nutrition","psychology","cognition","memory",
      "productivity","workflow","editor","terminal","CLI","software",
      "recipe","food","cook","restaurant","chef","dish","eat","meal",
      "ingredient","flavour","flavor","wine","coffee","cuisine","kitchen"
    ],
    bg:        "#F7F9FC",
    headColor: P.blue,
    accent:    P.blue,
    cardBg:    "#FFFFFF",
    cardBorder:"#DDE6F0",
    inkColor:  "#0D1A2B",
  },
  SLEEP: {
    label:   "SLEEP",
    tagline: "Slow, strange, and worth sitting with.",
    keywords: [
      "environment","nature","ocean","forest","climate","ecology","animal",
      "universe","cosmos","philosophy","history","art","design","music",
      "culture","weird","unusual","strange","discovery","ancient","fossil",
      "archaeology","map","photo","documentary","book","essay","meditation",
      "sleep","dream","quiet","slow","contemplative","beautiful","wonder",
      "poetry","ritual","travel","landscape","garden","solitude","reflection"
    ],
    bg:        "#F9F7F4",
    headColor: P.brown,
    accent:    P.brown,
    cardBg:    "#FFFFFF",
    cardBorder:"#E8E0D4",
    inkColor:  "#1C1008",
  }
};

// ─── TASTE FILTER ─────────────────────────────────────────────────────────────
const SKIP_KW = [
  "crypto","blockchain","NFT","web3","metaverse",
  "sports","celebrity","stock market","IPO",
  "hiring","layoffs","lawsuit","court"
].map(s => s.toLowerCase());

const FLAG_KW = [
  "Claude","Anthropic","dev tools","AI agent","open source",
  "privacy","local-first","self-hosted","australia","australian"
].map(s => s.toLowerCase());

// ─── GEO FILTER ───────────────────────────────────────────────────────────────
const AU_KW = [
  "australia","australian","sydney","melbourne","brisbane","perth","adelaide",
  "canberra","queensland","victoria","nsw","asx","abc news au","sbs","crikey",
  "afr","smh","the age","guardian australia","abc.net.au"
].map(s => s.toLowerCase());

const US_KW = [
  "trump","biden","white house","congress","senate","republican","democrat",
  "washington dc","new york times","cnn","fox news","nbc","wall street journal",
  "wsj","nytimes","united states","u.s. ","american","federal reserve"
].map(s => s.toLowerCase());

const US_SUBS = new Set(["r/politics"]);

function geoTag(story) {
  const text = (story.title + " " + (story.url || "") + " " + story.source).toLowerCase();
  return {
    ...story,
    isAU: AU_KW.some(k => text.includes(k)),
    isUS: US_KW.some(k => text.includes(k)) || US_SUBS.has(story.source),
  };
}

function applyGeoFilter(stories) {
  const tagged = stories.map(geoTag);
  // Boost AU scores by 40%
  const boosted = tagged.map(s => s.isAU ? { ...s, score: Math.round(s.score * 1.4) } : s);
  boosted.sort((a, b) => b.score - a.score);
  // Cap US at 25%
  const maxUS = Math.ceil(boosted.length * 0.25);
  let usCount = 0;
  return boosted.filter(s => {
    if (s.isUS) {
      if (usCount >= maxUS) return false;
      usCount++;
    }
    return true;
  });
}

// ─── HTTP GET ─────────────────────────────────────────────────────────────────
function get(url, asText = false) {
  return new Promise((res, rej) => {
    const mod = url.startsWith("https") ? https : http;
    const req = mod.get(url, {
      headers: {
        "User-Agent": "MorningEdition/1.0 (+daily digest)",
        "Accept": asText
          ? "text/xml,application/rss+xml,application/xml,text/html"
          : "application/json"
      }
    }, r => {
      if (r.statusCode >= 300 && r.statusCode < 400 && r.headers.location) {
        return get(r.headers.location, asText).then(res).catch(rej);
      }
      let data = "";
      r.on("data", c => data += c);
      r.on("end", () => {
        if (asText) return res(data);
        try { res(JSON.parse(data)); }
        catch (e) { rej(new Error(`JSON parse fail: ${url}`)); }
      });
    });
    req.on("error", rej);
    req.setTimeout(12000, () => { req.destroy(); rej(new Error(`Timeout: ${url}`)); });
  });
}

// ─── FETCH HN ─────────────────────────────────────────────────────────────────
async function fetchHN() {
  console.log("📡  Hacker News...");
  const ids = await get("https://hacker-news.firebaseio.com/v0/topstories.json");
  const stories = await Promise.all(
    ids.slice(0, 60).map(id =>
      get(`https://hacker-news.firebaseio.com/v0/item/${id}.json`).catch(() => null)
    )
  );
  return stories
    .filter(s => s && s.title && s.url && s.score > 30)
    .map(s => ({
      title: s.title, url: s.url, score: s.score,
      comments: s.descendants || 0,
      source: "HN", sourceLabel: "Hacker News", sourceColor: P.brown,
    }));
}

// ─── FETCH REDDIT ─────────────────────────────────────────────────────────────
async function fetchSubreddit(sub) {
  try {
    const data = await get(`https://www.reddit.com/r/${sub}/hot.json?limit=15`);
    return (data?.data?.children || [])
      .map(c => c.data)
      .filter(p => !p.stickied && !p.is_video && p.url && p.score > 100)
      .slice(0, 6)
      .map(p => ({
        title: p.title,
        url: p.url.startsWith("/r/") ? `https://reddit.com${p.url}` : p.url,
        score: p.score, comments: p.num_comments || 0,
        source: `r/${sub}`, sourceLabel: `r/${sub}`, sourceColor: "#FF4500",
      }));
  } catch (e) {
    console.warn(`  ⚠️  r/${sub}: ${e.message}`);
    return [];
  }
}

async function fetchReddit() {
  console.log("📡  Reddit...");
  return (await Promise.all(SUBREDDITS.map(fetchSubreddit))).flat();
}

// ─── FETCH SUBSTACK ───────────────────────────────────────────────────────────
function parseRSS(xml, handle, label, color) {
  const items = [];
  const rx = /<item>([\s\S]*?)<\/item>/g;
  let m;
  while ((m = rx.exec(xml)) !== null) {
    const b = m[1];
    const title = (b.match(/<title><!\[CDATA\[(.*?)\]\]><\/title>/) ||
                   b.match(/<title>(.*?)<\/title>/))?.[1]?.trim();
    const link  = (b.match(/<link>(.*?)<\/link>/) ||
                   b.match(/<guid[^>]*>(https?:\/\/[^<]+)<\/guid>/))?.[1]?.trim();
    if (title && link?.startsWith("http")) {
      items.push({
        title, url: link, score: 500, comments: 0,
        source: `substack/${handle}`, sourceLabel: label, sourceColor: color,
      });
    }
    if (items.length >= 3) break;
  }
  return items;
}

async function fetchSubstack(entry, index) {
  const colors = [P.blue, P.red, P.brown, P.blue, P.red];
  const color = colors[index % colors.length];
  try {
    const xml = await get(`https://${entry.handle}.substack.com/feed`, true);
    const items = parseRSS(xml, entry.handle, entry.label, color);
    console.log(`  ✓  ${entry.label}: ${items.length}`);
    return items;
  } catch (e) {
    console.warn(`  ⚠️  ${entry.label}: ${e.message}`);
    return [];
  }
}

async function fetchAllSubstacks() {
  console.log("📡  Substacks...");
  return (await Promise.all(SUBSTACKS.map((e, i) => fetchSubstack(e, i)))).flat();
}

// ─── CLASSIFY ─────────────────────────────────────────────────────────────────
function classifyStory(story) {
  const text = (story.title + " " + story.source).toLowerCase();
  if (SKIP_KW.some(k => text.includes(k))) return null;

  const scores = { MOVE: 0, EAT: 0, SLEEP: 0 };
  for (const [key, sec] of Object.entries(SECTIONS)) {
    scores[key] = sec.keywords.filter(k => text.includes(k.toLowerCase())).length;
  }

  if (["r/environment","r/science"].includes(story.source))                        scores.SLEEP += 3;
  if (["r/politics","r/worldnews","r/economics","r/business"].includes(story.source)) scores.MOVE += 3;
  if (["r/programming","r/technology","r/gadgets"].includes(story.source))          scores.EAT  += 2;
  if (story.source === "HN")                                                        scores.EAT  += 1;

  // Food Substacks → EAT
  const handle = story.source.replace("substack/","");
  if (FOOD_HANDLES.has(handle)) scores.EAT += 6;

  const best = Object.entries(scores).sort((a, b) => b[1] - a[1])[0];
  return {
    ...story,
    section: best[1] > 0 ? best[0] : "EAT",
    flagged: FLAG_KW.some(k => text.includes(k)),
  };
}

// ─── DEDUP ────────────────────────────────────────────────────────────────────
function dedup(stories) {
  const seen = new Set();
  return stories.filter(s => {
    const key = s.title.slice(0, 60).toLowerCase().replace(/\W/g, "");
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

// ─── RENDER ───────────────────────────────────────────────────────────────────
function renderCard(story, index, sec) {
  const num     = String(index + 1).padStart(2, "0");
  const layouts = ["card-hero","card-wide","card-compact","card-accent","card-minimal"];
  const layout  = layouts[index % layouts.length];
  const flagBadge = story.flagged ? `<span class="flag-badge">★ WATCH</span>` : "";
  const auBadge   = story.isAU   ? `<span class="au-badge">🇦🇺 AU</span>`    : "";
  return `
  <article class="story-card ${layout}" style="background:${sec.cardBg};border-color:${sec.cardBorder}">
    <div class="card-numeral" style="color:${sec.accent}">${num}</div>
    <div class="card-body">
      <div class="card-meta">
        <span class="source-tag" style="border-color:${story.sourceColor};color:${story.sourceColor}">${story.sourceLabel}</span>
        ${auBadge}${flagBadge}
        <span class="card-score" style="color:${sec.inkColor}">${story.score >= 1000 ? (story.score/1000).toFixed(1)+"k" : story.score}</span>
      </div>
      <h3 class="card-title"><a href="${story.url}" target="_blank" rel="noopener" style="color:${sec.inkColor}">${story.title}</a></h3>
      ${story.comments ? `<div class="card-footer" style="color:${sec.inkColor}">${story.comments} comments</div>` : ""}
    </div>
  </article>`;
}

function renderSection(key, stories) {
  const sec = SECTIONS[key];
  if (!stories.length) return "";
  return `
<section class="mag-section" id="section-${key}" style="background:${sec.bg}">
  <header class="section-header">
    <div class="section-eyebrow" style="color:${sec.accent}">${DISPLAY_DATE}</div>
    <h2 class="section-title" style="color:${sec.headColor}">${sec.label}</h2>
    <p class="section-tagline" style="color:${sec.inkColor}">${sec.tagline}</p>
    <div class="section-rule" style="background:${sec.accent}"></div>
  </header>
  <div class="section-grid">
    ${stories.map((s, i) => renderCard(s, i, sec)).join("\n")}
  </div>
</section>`;
}

function renderHTML(sections) {
  const total = Object.values(sections).reduce((n, a) => n + a.length, 0);
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>Kaswari News · ${DATE}</title>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=EB+Garamond:ital,wght@0,400;0,600;1,400&family=Cormorant+Garamond:ital,wght@0,300;0,600;1,300;1,600&family=DM+Mono:wght@400;500&display=swap" rel="stylesheet">
  <style>
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
    :root {
      --blue:   ${P.blue};
      --red:    ${P.red};
      --yellow: ${P.yellow};
      --brown:  ${P.brown};
      --black:  ${P.black};
      --pearl:  ${P.pearl};
      --ink:    #1C1008;
      --muted:  #8A7F74;
      --rule:   #E2DAD0;
      --fh: 'La Orleans', 'Cormorant Garamond', 'Palatino Linotype', Georgia, serif;
      --fs: 'Bellerose', 'EB Garamond', 'Palatino', Georgia, serif;
      --fb: 'EB Garamond', 'Garamond', Georgia, serif;
      --fm: 'DM Mono', 'Courier New', monospace;
    }
    html { scroll-behavior: smooth; }
    body { background: #FDFAF5; color: var(--ink); font-family: var(--fb); font-size: 17px; line-height: 1.7; -webkit-font-smoothing: antialiased; }
    a { text-decoration: none; }

    /* ── COLOUR BAR — all 5 hex colours ── */
    .colour-bar { height: 4px; background: linear-gradient(90deg, var(--blue) 0%, var(--blue) 20%, var(--red) 20%, var(--red) 40%, var(--yellow) 40%, var(--yellow) 60%, var(--brown) 60%, var(--brown) 80%, var(--black) 80%, var(--black) 100%); }

    /* ── MASTHEAD ── */
    .masthead { background: #FDFAF5; border-bottom: 1px solid var(--rule); padding: 3rem 5rem 2.5rem; display: grid; grid-template-columns: 1fr auto; align-items: end; gap: 2rem; }
    .masthead-top { border-bottom: 3px solid var(--ink); padding-bottom: 1rem; margin-bottom: 1rem; }
    .pub-name { font-family: var(--fh); font-size: clamp(3.5rem, 10vw, 9rem); font-weight: 600; line-height: 0.9; letter-spacing: 0.01em; }
    .pub-name .kaswari { color: var(--red); }
    .pub-name .news    { color: var(--blue); font-style: italic; font-weight: 300; }
    .pub-name .dot     { color: var(--yellow); }
    .pub-sub { font-family: var(--fm); font-size: 0.62rem; letter-spacing: 0.18em; text-transform: uppercase; color: var(--muted); margin-top: 0.8rem; }
    .masthead-right { text-align: right; }
    .issue-count { font-family: var(--fh); font-size: 3.5rem; font-weight: 600; color: var(--brown); line-height: 1; }
    .issue-count-label { font-family: var(--fm); font-size: 0.55rem; letter-spacing: 0.15em; text-transform: uppercase; color: var(--muted); }
    .issue-sources { font-family: var(--fm); font-size: 0.55rem; color: var(--muted); margin-top: 0.5rem; line-height: 1.9; }

    /* ── NAV ── */
    .section-nav { background: #FDFAF5; border-bottom: 1px solid var(--rule); padding: 0 5rem; display: flex; position: sticky; top: 0; z-index: 100; box-shadow: 0 1px 12px rgba(0,0,0,0.04); }
    .nav-item { font-family: var(--fs); font-size: 1rem; font-weight: 600; letter-spacing: 0.08em; padding: 0.85rem 2rem; color: var(--muted); border-bottom: 2px solid transparent; transition: all 0.15s; }
    .nav-item:hover { color: var(--ink); }
    .nav-move:hover { color: var(--red);   border-color: var(--red);   }
    .nav-eat:hover  { color: var(--blue);  border-color: var(--blue);  }
    .nav-sleep:hover{ color: var(--brown); border-color: var(--brown); }

    /* ── SECTION ── */
    .mag-section { padding: 5rem 5rem 6rem; }
    .section-header { margin-bottom: 3rem; }
    .section-eyebrow { font-family: var(--fm); font-size: 0.58rem; letter-spacing: 0.22em; text-transform: uppercase; color: var(--muted); margin-bottom: 0.6rem; }
    .section-title { font-family: var(--fh); font-size: clamp(4.5rem, 12vw, 11rem); font-weight: 600; font-style: italic; line-height: 0.88; letter-spacing: 0.01em; margin-bottom: 1.2rem; }
    .section-tagline { font-family: var(--fs); font-size: 1.05rem; font-weight: 300; font-style: italic; color: var(--muted); max-width: 500px; line-height: 1.6; }
    .section-rule { width: 40px; height: 2px; margin-top: 1.6rem; opacity: 0.6; }

    /* ── CARD GRID ── */
    .section-grid { display: grid; grid-template-columns: repeat(12, 1fr); gap: 1px; border: 1px solid var(--rule); background: var(--rule); }
    .story-card { padding: 1.8rem; display: flex; gap: 1.2rem; border: none; transition: background 0.15s; position: relative; }
    .story-card:hover { background: #FFFEF9 !important; }
    .story-card::before { content: ''; position: absolute; top: 0; left: 0; bottom: 0; width: 3px; opacity: 0; transition: opacity 0.15s; }
    .story-card:hover::before { opacity: 1; }

    .card-hero    { grid-column: span 7; min-height: 220px; }
    .card-wide    { grid-column: span 5; min-height: 220px; }
    .card-compact { grid-column: span 4; }
    .card-accent  { grid-column: span 5; }
    .card-minimal { grid-column: span 3; }

    .card-numeral { font-family: var(--fh); font-size: 3.2rem; font-weight: 300; font-style: italic; line-height: 1; opacity: 0.1; flex-shrink: 0; user-select: none; transition: opacity 0.15s; }
    .story-card:hover .card-numeral { opacity: 0.22; }
    .card-hero .card-numeral { font-size: 5rem; }

    .card-body { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 0.55rem; }
    .card-meta { display: flex; align-items: center; gap: 0.55rem; flex-wrap: wrap; }

    .source-tag, .flag-badge, .au-badge { font-family: var(--fm); font-size: 0.52rem; letter-spacing: 0.1em; text-transform: uppercase; padding: 0.15em 0.5em; border-radius: 2px; }
    .source-tag { border: 1px solid; background: transparent; }
    .flag-badge { background: var(--yellow); color: var(--black); }
    .au-badge   { background: var(--blue);   color: #fff; }
    .card-score { font-family: var(--fm); font-size: 0.55rem; color: var(--muted); margin-left: auto; }

    .card-title { font-family: var(--fs); font-size: 1rem; font-weight: 600; line-height: 1.35; flex: 1; }
    .card-hero .card-title { font-size: 1.25rem; }
    .card-title a { transition: color 0.15s; }
    .card-title a:hover { opacity: 0.65; }
    .card-footer { font-family: var(--fm); font-size: 0.54rem; color: var(--muted); margin-top: auto; }

    /* ── DIVIDERS — thin rule + colour dots ── */
    .section-divider { display: flex; align-items: center; gap: 0.75rem; padding: 2rem 5rem; }
    .section-divider::before, .section-divider::after { content: ''; flex: 1; height: 1px; background: var(--rule); }
    .divider-dots { display: flex; gap: 5px; }
    .divider-dots span { width: 7px; height: 7px; border-radius: 50%; display: block; }

    /* ── FOOTER ── */
    .mag-footer { background: #FDFAF5; border-top: 3px solid var(--ink); padding: 2.5rem 5rem; display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 1.5rem; margin-top: 4rem; }
    .footer-brand { font-family: var(--fh); font-size: 1.8rem; font-weight: 600; }
    .footer-brand .kaswari { color: var(--red); }
    .footer-brand .news    { color: var(--blue); font-style: italic; font-weight: 300; }
    .footer-brand .dot     { color: var(--yellow); }
    .footer-meta { font-family: var(--fm); font-size: 0.55rem; letter-spacing: 0.1em; color: var(--muted); text-align: right; line-height: 2; }

    @media (max-width: 860px) {
      .masthead, .mag-section, .mag-footer { padding: 2rem 1.5rem; }
      .masthead { grid-template-columns: 1fr; }
      .section-nav { padding: 0 1rem; }
      .section-divider { padding: 1.5rem; }
      .section-grid { grid-template-columns: 1fr; background: transparent; border: 1px solid var(--rule); gap: 0; }
      .story-card { grid-column: span 1 !important; border-bottom: 1px solid var(--rule); }
      .mag-footer { flex-direction: column; }
      .footer-meta { text-align: left; }
    }
  </style>
</head>
<body>

<div class="colour-bar"></div>

<header class="masthead">
  <div>
    <div class="masthead-top">
      <div class="pub-name">
        <span class="kaswari">Kaswari</span> <span class="news">News</span><span class="dot">.</span>
      </div>
    </div>
    <div class="pub-sub">HN · Reddit · Substack · Curated Daily · ${DISPLAY_DATE}</div>
  </div>
  <div class="masthead-right">
    <div class="issue-count">${total}</div>
    <div class="issue-count-label">Stories Today</div>
    <div class="issue-sources">
      Hacker News · ${SUBREDDITS.length} Subreddits<br>
      ${SUBSTACKS.length} Substack Writers<br>
      Max 25% US · 🇦🇺 AU Boosted
    </div>
  </div>
</header>

<nav class="section-nav">
  <a href="#section-MOVE"  class="nav-item nav-move">MOVE</a>
  <a href="#section-EAT"   class="nav-item nav-eat">EAT</a>
  <a href="#section-SLEEP" class="nav-item nav-sleep">SLEEP</a>
</nav>

${renderSection("MOVE", sections.MOVE)}
<div class="section-divider">
  <div class="divider-dots">
    <span style="background:var(--red)"></span>
    <span style="background:var(--yellow)"></span>
    <span style="background:var(--blue)"></span>
    <span style="background:var(--brown)"></span>
    <span style="background:var(--black)"></span>
  </div>
</div>
${renderSection("EAT", sections.EAT)}
<div class="section-divider">
  <div class="divider-dots">
    <span style="background:var(--blue)"></span>
    <span style="background:var(--yellow)"></span>
    <span style="background:var(--red)"></span>
    <span style="background:var(--brown)"></span>
    <span style="background:var(--black)"></span>
  </div>
</div>
${renderSection("SLEEP", sections.SLEEP)}

<footer class="mag-footer">
  <div class="footer-brand">
    <span class="kaswari">Kaswari</span> <span class="news">News</span><span class="dot">.</span>
  </div>
  <div class="footer-meta">
    Generated by Claude · ${DATE}<br>
    HN + r/${SUBREDDITS.join(", r/")}
  </div>
</footer>

</body>
</html>`;
}


// ─── MAIN ─────────────────────────────────────────────────────────────────────
async function main() {
  console.log(`\n📰  Morning Edition — ${DATE}\n`);

  const [hnStories, redditStories, substackStories] = await Promise.all([
    fetchHN(),
    fetchReddit(),
    fetchAllSubstacks(),
  ]);

  const all = dedup([...hnStories, ...redditStories, ...substackStories]);
  console.log(`\nRaw: ${all.length} (HN: ${hnStories.length}, Reddit: ${redditStories.length}, Substack: ${substackStories.length})`);

  const sections = { MOVE: [], EAT: [], SLEEP: [] };
  for (const story of all.map(classifyStory).filter(Boolean)) {
    sections[story.section]?.push(story);
  }

  for (const key of Object.keys(sections)) {
    sections[key] = applyGeoFilter(sections[key]).slice(0, 14);
    const au = sections[key].filter(s => s.isAU).length;
    const us = sections[key].filter(s => s.isUS).length;
    console.log(`  ${key}: ${sections[key].length} stories  (AU: ${au}  US: ${us})`);
  }

  const html = renderHTML(sections);
  const dir = path.join(__dirname, "magazines");
  fs.mkdirSync(dir, { recursive: true });
  const out = path.join(dir, `${DATE}.html`);
  fs.writeFileSync(out, html, "utf8");
  console.log(`\n✅  Written: ${out}\n`);

  if (process.env.TELEGRAM_BOT_TOKEN && process.env.TELEGRAM_CHAT_ID) {
    const msg = `📰 Morning Edition · ${DATE}\n` +
      Object.entries(sections).map(([k,v]) => `${k}: ${v.length}`).join(" · ");
    get(`https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}/sendMessage?chat_id=${process.env.TELEGRAM_CHAT_ID}&text=${encodeURIComponent(msg)}`)
      .then(() => console.log("📱  Telegram sent"))
      .catch(e => console.warn("Telegram failed:", e.message));
  }
}

main().catch(e => { console.error("Fatal:", e); process.exit(1); });
