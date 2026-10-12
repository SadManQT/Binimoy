import { expect, test } from "vitest";
import { tavilySearchProvider } from "./tavily";

test("the Tavily adapter sends a bearer key and maps results; nothing else from the response is used", async () => {
  const calls: { url: string; init?: RequestInit }[] = [];
  const provider = tavilySearchProvider("tvly-test", (async (
    url: string,
    init?: RequestInit,
  ) => {
    calls.push({ url, init });
    return Response.json({
      answer: "This seller is a scammer.",
      results: [
        {
          title: "A post",
          url: "https://example.test/a",
          content: "text",
          score: 0.9,
          published_date: "2026-08-02",
        },
        { title: "No link", content: "dropped" },
      ],
    });
  }) as typeof fetch);
  expect(provider.name).toBe("tavily");
  const found = await provider.search('"Tech Bazar BD" review');
  expect(found).toEqual({
    results: [
      {
        url: "https://example.test/a",
        title: "A post",
        snippet: "text",
        displayedDate: "2026-08-02",
      },
    ],
  });
  expect(calls[0]?.url).toBe("https://api.tavily.com/search");
  expect(new Headers(calls[0]?.init?.headers).get("authorization")).toBe(
    "Bearer tvly-test",
  );
  const body = JSON.parse(String(calls[0]?.init?.body));
  expect(body).toMatchObject({ query: '"Tech Bazar BD" review' });
  // The provider's own generated answer is never requested.
  expect(body.include_answer).toBeUndefined();
});

test("a provider error is thrown without the response body, so the key cannot leak into coverage", async () => {
  const provider = tavilySearchProvider(
    "tvly-secret",
    (async () =>
      new Response("invalid key tvly-secret", { status: 401 })) as typeof fetch,
  );
  await expect(provider.search("x")).rejects.toThrow("tavily 401");
  await expect(provider.search("x")).rejects.not.toThrow(/tvly-secret/);
});
