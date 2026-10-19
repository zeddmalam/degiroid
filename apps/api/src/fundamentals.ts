export type FundamentalHeadline = {
  title: string;
  source?: string;
  publishedAt?: string;
  link?: string;
};

export type FundamentalResearch = {
  query: string;
  companyOverview: string | null;
  wikipediaTitle: string | null;
  wikipediaUrl: string | null;
  headlines: FundamentalHeadline[];
  sources: string[];
  fetchedAt: string;
  notes: string[];
};

const USER_AGENT = "degiroid/0.1 (+local research; not for redistribution)";

function stripHtml(text: string): string {
  return text
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    .replace(/<[^>]+>/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, " ")
    .trim();
}

function splitTitleSource(title: string): { title: string; source?: string } {
  const idx = title.lastIndexOf(" - ");
  if (idx > 0 && idx < title.length - 3) {
    return {
      title: title.slice(0, idx).trim(),
      source: title.slice(idx + 3).trim(),
    };
  }
  return { title };
}

async function fetchText(url: string): Promise<string | null> {
  try {
    const response = await fetch(url, {
      headers: {
        Accept: "application/json, application/rss+xml, text/xml, */*",
        "User-Agent": USER_AGENT,
      },
      signal: AbortSignal.timeout(12_000),
    });
    if (!response.ok) return null;
    return await response.text();
  } catch {
    return null;
  }
}

async function wikipediaSearch(query: string): Promise<string | null> {
  const url = `https://en.wikipedia.org/w/api.php?action=opensearch&search=${encodeURIComponent(query)}&limit=1&namespace=0&format=json`;
  const text = await fetchText(url);
  if (!text) return null;
  try {
    const data = JSON.parse(text) as unknown;
    if (!Array.isArray(data) || data.length < 2) return null;
    const titles = data[1];
    if (!Array.isArray(titles) || typeof titles[0] !== "string") return null;
    return titles[0];
  } catch {
    return null;
  }
}

async function wikipediaSummary(title: string): Promise<{
  extract: string | null;
  pageTitle: string | null;
  url: string | null;
} | null> {
  const url = `https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(title.replace(/ /g, "_"))}`;
  const text = await fetchText(url);
  if (!text) return null;
  try {
    const data = JSON.parse(text) as {
      type?: string;
      title?: string;
      extract?: string;
      content_urls?: { desktop?: { page?: string } };
    };
    if (data.type === "disambiguation") return null;
    const extract = data.extract?.trim() || null;
    return {
      extract,
      pageTitle: data.title ?? title,
      url: data.content_urls?.desktop?.page ?? null,
    };
  } catch {
    return null;
  }
}

function parseRssHeadlines(xml: string, limit: number): FundamentalHeadline[] {
  const items = [...xml.matchAll(/<item>([\s\S]*?)<\/item>/gi)].slice(0, limit);
  const headlines: FundamentalHeadline[] = [];
  for (const match of items) {
    const block = match[1] ?? "";
    const rawTitle = block.match(/<title>([\s\S]*?)<\/title>/i)?.[1];
    if (!rawTitle) continue;
    const cleaned = stripHtml(rawTitle);
    if (!cleaned) continue;
    const { title, source } = splitTitleSource(cleaned);
    const link = stripHtml(block.match(/<link>([\s\S]*?)<\/link>/i)?.[1] ?? "");
    const pubDate = stripHtml(
      block.match(/<pubDate>([\s\S]*?)<\/pubDate>/i)?.[1] ?? "",
    );
    headlines.push({
      title,
      source,
      publishedAt: pubDate || undefined,
      link: link || undefined,
    });
  }
  return headlines;
}

async function googleNewsHeadlines(
  query: string,
  limit: number,
): Promise<FundamentalHeadline[]> {
  const url = `https://news.google.com/rss/search?q=${encodeURIComponent(query)}&hl=en-US&gl=US&ceid=US:en`;
  const xml = await fetchText(url);
  if (!xml) return [];
  return parseRssHeadlines(xml, limit);
}

export async function researchFundamentals(args: {
  name?: string;
  symbol?: string;
  query?: string;
  headlineLimit?: number;
}): Promise<FundamentalResearch> {
  const parts = [args.symbol, args.name, args.query]
    .map((p) => p?.trim())
    .filter((p): p is string => Boolean(p));
  const query = [...new Set(parts)].join(" ").trim();
  if (!query) {
    throw new Error("Provide name, symbol, or query");
  }

  const notes: string[] = [];
  const sources: string[] = [];
  const searchTerm = args.name?.trim() || args.query?.trim() || query;

  const wikiTitle =
    (await wikipediaSearch(searchTerm)) ??
    (args.symbol ? await wikipediaSearch(args.symbol) : null);

  let companyOverview: string | null = null;
  let wikipediaTitle: string | null = null;
  let wikipediaUrl: string | null = null;

  if (wikiTitle) {
    const summary = await wikipediaSummary(wikiTitle);
    if (summary?.extract) {
      companyOverview = summary.extract;
      wikipediaTitle = summary.pageTitle;
      wikipediaUrl = summary.url;
      sources.push("wikipedia");
    } else {
      notes.push("Wikipedia summary unavailable for best match.");
    }
  } else {
    notes.push("No Wikipedia page match found.");
  }

  const newsQuery = [args.symbol, args.name].filter(Boolean).join(" ") || query;
  const headlines = await googleNewsHeadlines(
    newsQuery,
    Math.min(Math.max(args.headlineLimit ?? 8, 1), 15),
  );
  if (headlines.length > 0) {
    sources.push("google_news_rss");
  } else {
    notes.push("No recent news headlines retrieved.");
  }

  return {
    query,
    companyOverview,
    wikipediaTitle,
    wikipediaUrl,
    headlines,
    sources,
    fetchedAt: new Date().toISOString(),
    notes,
  };
}
