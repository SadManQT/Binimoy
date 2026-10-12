import type { SearchProvider } from "./research";

// A live SearchProvider for Tavily (spec C7.6, C34). Written against
// https://docs.tavily.com/documentation/api-reference/endpoint/search as read
// on 2026-10-12: POST https://api.tavily.com/search, bearer key, results of
// {title, url, content, published_date?}.
//
// NOT RUN LIVE: no key was available when this was written. Its tests use a
// scripted fetch. Run one real search and check the cost before relying on it.
export function tavilySearchProvider(
  apiKey: string,
  fetchImpl: typeof fetch = fetch,
): SearchProvider {
  return {
    name: "tavily",
    async search(query) {
      const response = await fetchImpl("https://api.tavily.com/search", {
        method: "POST",
        headers: {
          authorization: `Bearer ${apiKey}`,
          "content-type": "application/json",
        },
        // One credit per query at basic depth; 12 queries per lookup.
        body: JSON.stringify({
          query,
          search_depth: "basic",
          max_results: 10,
          include_published_date: true,
        }),
        signal: AbortSignal.timeout(15_000),
      });
      // The status is all that is kept: an error body may echo the key.
      if (!response.ok) throw new Error(`tavily ${response.status}`);
      const data = (await response.json()) as { results?: unknown };
      const results = Array.isArray(data.results) ? data.results : [];
      return {
        results: results.flatMap((r) =>
          typeof r?.url === "string"
            ? [
                {
                  url: r.url,
                  title: String(r.title ?? "").slice(0, 300),
                  snippet: String(r.content ?? "").slice(0, 500),
                  ...(typeof r.published_date === "string"
                    ? { displayedDate: r.published_date }
                    : {}),
                },
              ]
            : [],
        ),
      };
    },
  };
}
