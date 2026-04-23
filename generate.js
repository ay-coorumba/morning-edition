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
    bg:        P.black,
    headColor: P.yellow,
    accent:    P.red,
    cardBg:    "#111111",
    cardBorder:"#222222",
    inkColor:  P.pearl,
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
    bg:        P.pearl,
    headColor: P.brown,
    accent:    P.blue,
    cardBg:    "#F0EAD6",
    cardBorder:"#DDD0BC",
    inkColor:  "#1A0E04",
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
    bg:        "#0B1220",
    headColor: P.pearl,
    accent:    P.yellow,
    cardBg:    "rgba(65,125,193,0.09)",
    cardBorder:"rgba(65,125,193,0.2)",
    inkColor:  P.pearl,
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
  <title>Morning Edition · ${DATE}</title>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Playfair+Display:ital,wght@0,700;0,900;1,400&family=DM+Sans:wght@300;400;500&family=DM+Mono:wght@400;500&display=swap" rel="stylesheet">
  <style>
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
    :root {
      --blue: ${P.blue}; --red: ${P.red}; --yellow: ${P.yellow};
      --brown: ${P.brown}; --pearl: ${P.pearl};
      --fd: 'Playfair Display', Georgia, serif;
      --fb: 'DM Sans', sans-serif;
      --fm: 'DM Mono', monospace;
    }
    html { scroll-behavior: smooth; }
    body { font-family: var(--fb); font-size: 16px; line-height: 1.6; -webkit-font-smoothing: antialiased; }
    a { text-decoration: none; }

    .masthead {
      background: #000; border-bottom: 5px solid var(--yellow);
      padding: 3rem 5rem 2.5rem;
      display: grid; grid-template-columns: 1fr auto; align-items: end; gap: 2rem;
    }
    .pub-name {
      font-family: var(--fd); font-size: clamp(4rem, 11vw, 10rem);
      font-weight: 900; line-height: 0.88; color: var(--pearl); letter-spacing: -0.02em;
    }
    .pub-name em { font-style: italic; font-weight: 400; color: var(--yellow); }
    .pub-sub {
      font-family: var(--fm); font-size: 0.65rem; letter-spacing: 0.18em;
      text-transform: uppercase; color: rgba(250,250,250,0.35); margin-top: 1rem;
    }
    .masthead-right { text-align: right; }
    .issue-count { font-family: var(--fd); font-size: 4rem; font-weight: 900; color: var(--yellow); line-height: 1; }
    .issue-count-label { font-family: var(--fm); font-size: 0.58rem; letter-spacing: 0.15em; text-transform: uppercase; color: rgba(250,250,250,0.3); }
    .issue-sources { font-family: var(--fm); font-size: 0.58rem; color: rgba(250,250,250,0.25); margin-top: 0.6rem; line-height: 1.9; }

    .section-nav {
      background: #000; border-bottom: 1px solid #1a1a1a;
      padding: 0 5rem; display: flex;
      position: sticky; top: 0; z-index: 100;
    }
    .nav-item {
      font-family: var(--fd); font-size: 1.05rem; font-weight: 700;
      padding: 0.9rem 2rem; color: rgba(250,250,250,0.3);
      border-bottom: 3px solid transparent; transition: all 0.15s;
    }
    .nav-item:hover { color: var(--pearl); }
    .nav-move:hover { color: var(--yellow); border-color: var(--red); }
    .nav-eat:hover  { color: var(--pearl); border-color: var(--blue); }
    .nav-sleep:hover{ color: var(--pearl); border-color: var(--yellow); }

    .mag-section { padding: 5rem 5rem 6rem; }
    .section-header { margin-bottom: 3.5rem; }
    .section-eyebrow { font-family: var(--fm); font-size: 0.6rem; letter-spacing: 0.2em; text-transform: uppercase; opacity: 0.6; margin-bottom: 0.5rem; }
    .section-title { font-family: var(--fd); font-size: clamp(5rem, 13vw, 12rem); font-weight: 900; line-height: 0.85; letter-spacing: -0.02em; margin-bottom: 1.2rem; }
    .section-tagline { font-family: var(--fb); font-size: 1rem; font-weight: 300; font-style: italic; opacity: 0.55; max-width: 480px; }
    .section-rule { width: 48px; height: 3px; margin-top: 1.8rem; }

    .section-grid { display: grid; grid-template-columns: repeat(12, 1fr); gap: 3px; }

    .story-card {
      padding: 1.8rem; display: flex; gap: 1.2rem;
      border: 1px solid; transition: opacity 0.15s, transform 0.15s;
    }
    .story-card:hover { opacity: 0.82; transform: translateY(-1px); }
    .card-hero    { grid-column: span 7; min-height: 230px; }
    .card-wide    { grid-column: span 5; min-height: 230px; }
    .card-compact { grid-column: span 4; }
    .card-accent  { grid-column: span 5; }
    .card-minimal { grid-column: span 3; }

    .card-numeral {
      font-family: var(--fd); font-size: 3.5rem; font-weight: 900;
      line-height: 1; opacity: 0.15; flex-shrink: 0; user-select: none; transition: opacity 0.15s;
    }
    .story-card:hover .card-numeral { opacity: 0.4; }
    .card-hero .card-numeral { font-size: 5.5rem; }

    .card-body { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 0.6rem; }
    .card-meta { display: flex; align-items: center; gap: 0.55rem; flex-wrap: wrap; }

    .source-tag, .flag-badge, .au-badge {
      font-family: var(--fm); font-size: 0.55rem; letter-spacing: 0.1em;
      text-transform: uppercase; padding: 0.18em 0.55em; border-radius: 2px;
    }
    .source-tag { border: 1px solid; }
    .flag-badge { background: var(--yellow); color: #000; }
    .au-badge   { background: var(--blue);   color: #fff; }
    .card-score { font-family: var(--fm); font-size: 0.58rem; opacity: 0.35; margin-left: auto; }

    .card-title { font-family: var(--fd); font-size: 1rem; font-weight: 700; line-height: 1.3; flex: 1; }
    .card-hero .card-title { font-size: 1.3rem; }
    .card-title a:hover { opacity: 0.65; }
    .card-footer { font-family: var(--fm); font-size: 0.56rem; opacity: 0.35; margin-top: auto; }

    .section-divider { height: 5px; background: linear-gradient(90deg, var(--yellow), var(--red), var(--blue), var(--brown)); }

    .mag-footer {
      background: #000; border-top: 5px solid var(--yellow);
      padding: 3rem 5rem; display: flex; justify-content: space-between;
      align-items: center; flex-wrap: wrap; gap: 1.5rem;
    }
    .footer-brand { font-family: var(--fd); font-size: 2rem; font-weight: 900; color: var(--pearl); }
    .footer-brand em { font-style: italic; font-weight: 400; color: var(--yellow); }
    .footer-meta { font-family: var(--fm); font-size: 0.58rem; letter-spacing: 0.1em; color: rgba(250,250,250,0.25); text-align: right; line-height: 2; }

    @media (max-width: 860px) {
      .masthead, .mag-section, .mag-footer { padding: 2rem 1.5rem; }
      .masthead { grid-template-columns: 1fr; }
      .section-nav { padding: 0 1rem; }
      .section-grid { grid-template-columns: 1fr; }
      .story-card { grid-column: span 1 !important; }
      .mag-footer { flex-direction: column; }
      .footer-meta { text-align: left; }
    }
  </style>
</head>
<body>

<header class="masthead">
  <div>
    <div class="pub-name">Morning<em>.</em></div>
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
<div class="section-divider"></div>
${renderSection("EAT",  sections.EAT)}
<div class="section-divider"></div>
${renderSection("SLEEP", sections.SLEEP)}

<footer class="mag-footer">
  <div class="footer-brand">Morning<em>.</em></div>
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
