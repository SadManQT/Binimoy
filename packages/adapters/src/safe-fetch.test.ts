import { expect, test } from "vitest";
import { httpRetriever, isPublicAddress } from "./safe-fetch";

// A fetch that serves scripted responses and records what it was asked.
function scripted(pages: Record<string, Response | (() => Response)>) {
  const calls: { url: string; init?: RequestInit }[] = [];
  const fetchImpl = async (input: string | URL, init?: RequestInit) => {
    const url = String(input);
    calls.push({ url, init });
    const page = pages[url];
    if (!page) return new Response("not found", { status: 404 });
    return typeof page === "function" ? page() : page.clone();
  };
  return { fetchImpl, calls };
}
const html = (body: string, headers: Record<string, string> = {}) =>
  new Response(body, {
    status: 200,
    headers: { "content-type": "text/html; charset=utf-8", ...headers },
  });
const redirect = (location: string) =>
  new Response(null, { status: 302, headers: { location } });
// Every name resolves to a public address unless the test says otherwise.
const dns =
  (table: Record<string, string[]> = {}) =>
  async (host: string) =>
    table[host] ?? ["93.184.216.34"];

test("D.9: private, loopback, link-local and metadata addresses are not public, in IPv4 or IPv6", () => {
  for (const address of [
    "127.0.0.1",
    "10.1.2.3",
    "172.16.0.1",
    "172.31.255.255",
    "192.168.1.1",
    "169.254.169.254",
    "100.64.0.1",
    "0.0.0.0",
    "224.0.0.1",
    "255.255.255.255",
    "::1",
    "::",
    "fe80::1",
    "fc00::1",
    "fd12:3456::1",
    "::ffff:127.0.0.1",
    "::ffff:10.0.0.1",
    "64:ff9b::7f00:1",
    "not-an-address",
  ]) {
    expect(isPublicAddress(address), address).toBe(false);
  }
  for (const address of ["93.184.216.34", "8.8.8.8", "2606:4700::1111"]) {
    expect(isPublicAddress(address), address).toBe(true);
  }
});

test("V7-26: an internal destination is refused before any request is made", async () => {
  for (const url of [
    "http://127.0.0.1/admin",
    "http://169.254.169.254/latest/meta-data/",
    "http://[::1]/",
    "http://[::ffff:10.0.0.1]/",
    "http://localhost/",
    "http://intranet.example.test/",
    "https://user:pass@example.test/",
    "ftp://example.test/file",
    "http://example.test:8080/",
    "http://example.test:22/",
  ]) {
    const { fetchImpl, calls } = scripted({});
    const retriever = httpRetriever({
      fetchImpl,
      lookup: dns({
        localhost: ["127.0.0.1"],
        "intranet.example.test": ["10.0.0.5"],
      }),
    });
    expect(await retriever.fetch(url), url).toMatchObject({
      access: "UNAVAILABLE",
      body: null,
    });
    expect(calls, url).toEqual([]);
  }
});

test("V7-26: a name with any internal address is refused, and so is a redirect to one", async () => {
  const mixed = scripted({});
  expect(
    await httpRetriever({
      fetchImpl: mixed.fetchImpl,
      lookup: dns({ "rebind.example.test": ["93.184.216.34", "127.0.0.1"] }),
    }).fetch("https://rebind.example.test/"),
  ).toMatchObject({ access: "UNAVAILABLE" });
  expect(mixed.calls).toEqual([]);

  const hop = scripted({
    "https://public.example.test/post": redirect(
      "http://169.254.169.254/latest/meta-data/",
    ),
  });
  expect(
    await httpRetriever({ fetchImpl: hop.fetchImpl, lookup: dns() }).fetch(
      "https://public.example.test/post",
    ),
  ).toMatchObject({ access: "UNAVAILABLE" });
  // The public page was asked; the internal one never was.
  expect(hop.calls.map((c) => c.url)).toEqual([
    "https://public.example.test/post",
  ]);

  const named = scripted({
    "https://public.example.test/post": redirect(
      "https://inside.example.test/",
    ),
  });
  await httpRetriever({
    fetchImpl: named.fetchImpl,
    lookup: dns({ "inside.example.test": ["192.168.0.10"] }),
  }).fetch("https://public.example.test/post");
  expect(named.calls).toHaveLength(1);
});

test("a public page is read as text, without scripts, cookies or credentials", async () => {
  const { fetchImpl, calls } = scripted({
    "https://shop.example.test/post": redirect("/post/1"),
    "https://shop.example.test/post/1": html(
      "<html><head><title>T</title><style>p{color:red}</style><script>steal()</script></head>" +
        "<body><p>Paid 2500 taka &amp; got the key.</p><p>Works.</p></body></html>",
    ),
  });
  const result = await httpRetriever({ fetchImpl, lookup: dns() }).fetch(
    "https://shop.example.test/post",
  );
  expect(result).toEqual({
    access: "FULL_TEXT",
    body: "T Paid 2500 taka & got the key. Works.",
    // Nothing on the page is trusted to say when it was written or by whom.
    publishedAt: null,
    author: null,
  });
  for (const call of calls) {
    expect(call.init?.redirect).toBe("manual");
    expect(call.init?.credentials).toBe("omit");
    const headers = new Headers(call.init?.headers);
    expect(headers.has("cookie")).toBe(false);
    expect(headers.has("authorization")).toBe(false);
  }
});

test("D.9: a 200 response that is a login form is a wall, not the post", async () => {
  const { fetchImpl } = scripted({
    "https://social.example.test/p/1": html(
      '<form><h1>Log in to continue</h1><input type="password" name="pass"></form><p>Tech Bazar BD is a scam</p>',
    ),
  });
  expect(
    await httpRetriever({ fetchImpl, lookup: dns() }).fetch(
      "https://social.example.test/p/1",
    ),
  ).toEqual({
    access: "LOGIN_WALL",
    body: null,
    publishedAt: null,
    author: null,
  });
});

test("limits: redirects, size, type, status and time are bounded", async () => {
  const loop = scripted({
    "https://a.example.test/1": redirect("https://a.example.test/2"),
    "https://a.example.test/2": redirect("https://a.example.test/3"),
    "https://a.example.test/3": redirect("https://a.example.test/4"),
    "https://a.example.test/4": redirect("https://a.example.test/5"),
    "https://a.example.test/5": html("<p>too far</p>"),
  });
  const bounded = httpRetriever({
    fetchImpl: loop.fetchImpl,
    lookup: dns(),
    maxRedirects: 3,
    maxBytes: 100,
    timeoutMs: 50,
  });
  expect(await bounded.fetch("https://a.example.test/1")).toMatchObject({
    access: "UNAVAILABLE",
  });
  expect(loop.calls).toHaveLength(4);

  const pages = scripted({
    "https://b.example.test/big": html(`<p>${"word ".repeat(200)}</p>`),
    "https://b.example.test/pdf": new Response("%PDF", {
      status: 200,
      headers: { "content-type": "application/pdf" },
    }),
    "https://b.example.test/gone": new Response("gone", { status: 410 }),
  });
  const limited = httpRetriever({
    fetchImpl: pages.fetchImpl,
    lookup: dns(),
    maxBytes: 100,
  });
  const big = await limited.fetch("https://b.example.test/big");
  expect(big.access).toBe("PARTIAL_TEXT");
  expect((big.body as string).length).toBeLessThanOrEqual(100);
  expect(await limited.fetch("https://b.example.test/pdf")).toMatchObject({
    access: "UNAVAILABLE",
  });
  expect(await limited.fetch("https://b.example.test/gone")).toMatchObject({
    access: "UNAVAILABLE",
  });

  const slow = httpRetriever({
    lookup: dns(),
    timeoutMs: 30,
    fetchImpl: (_url, init) =>
      new Promise((_resolve, reject) => {
        init?.signal?.addEventListener("abort", () =>
          reject(new Error("aborted")),
        );
      }),
  });
  expect(await slow.fetch("https://c.example.test/")).toMatchObject({
    access: "UNAVAILABLE",
  });
});
