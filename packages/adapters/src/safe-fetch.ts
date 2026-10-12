import { lookup as dnsLookup } from "node:dns/promises";
import { BlockList, isIP } from "node:net";
import type { Retrieved, Retriever } from "./research";

// Spec D.9, V7-26: the one place that fetches a URL nobody here chose. It
// refuses anything that is not a plain public web page, re-checks every
// redirect, sends no cookies or credentials, and bounds size and time.
//
// ponytail: the address is checked here and resolved again by fetch, so a
// hostile DNS server could answer differently the second time. Close that at
// the network boundary (an egress rule denying private ranges, D.9) or by
// pinning the checked address in a custom dispatcher before going live.

const blocked = new BlockList();
for (const [net, bits] of [
  ["0.0.0.0", 8],
  ["10.0.0.0", 8],
  ["100.64.0.0", 10],
  ["127.0.0.0", 8],
  ["169.254.0.0", 16],
  ["172.16.0.0", 12],
  ["192.0.0.0", 24],
  ["192.0.2.0", 24],
  ["192.168.0.0", 16],
  ["198.18.0.0", 15],
  ["198.51.100.0", 24],
  ["203.0.113.0", 24],
  ["224.0.0.0", 3],
] as const) {
  blocked.addSubnet(net, bits, "ipv4");
}
for (const [net, bits] of [
  ["::", 127], // unspecified and loopback
  ["64:ff9b::", 96], // NAT64
  ["2001:db8::", 32],
  ["2002::", 16], // 6to4
  ["fc00::", 7],
  ["fe80::", 10],
  ["ff00::", 8],
] as const) {
  blocked.addSubnet(net, bits, "ipv6");
}

export function isPublicAddress(address: string): boolean {
  const family = isIP(address);
  if (family === 0) return false;
  // An IPv4-mapped IPv6 address is never a legitimate way to name a web
  // host. (It cannot go in the block list: Node would then match every IPv4
  // address against it.)
  if (family === 6 && /^(0*:)*:?ffff:/i.test(address)) return false;
  return !blocked.check(address, family === 4 ? "ipv4" : "ipv6");
}

type FetchLike = (input: string | URL, init?: RequestInit) => Promise<Response>;

const NOTHING: Retrieved = {
  access: "UNAVAILABLE",
  body: null,
  publishedAt: null,
  author: null,
};
const ENTITIES: Record<string, string> = {
  "&amp;": "&",
  "&lt;": "<",
  "&gt;": ">",
  "&quot;": '"',
  "&#39;": "'",
  "&nbsp;": " ",
};
// Text only. Nothing from the page is ever rendered as markup.
const toText = (html: string) =>
  html
    .replace(/<(script|style|noscript)\b[\s\S]*?(<\/\1>|$)/gi, " ")
    .replace(/<[^>]*>?/g, " ")
    .replace(
      /&(amp|lt|gt|quot|#39|nbsp);/g,
      (entity) => ENTITIES[entity] ?? " ",
    )
    .replace(/\s+/g, " ")
    .trim();

async function readLimited(response: Response, maxBytes: number) {
  const reader = response.body?.getReader();
  if (!reader) return { text: "", truncated: false };
  const chunks: Uint8Array[] = [];
  let size = 0;
  let truncated = false;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    if (size + value.length > maxBytes) {
      chunks.push(value.subarray(0, maxBytes - size));
      truncated = true;
      // Not awaited: a cancel can wait on other readers of the same body.
      void reader.cancel().catch(() => {});
      break;
    }
    chunks.push(value);
    size += value.length;
  }
  return { text: Buffer.concat(chunks).toString("utf8"), truncated };
}

export function httpRetriever(
  options: {
    fetchImpl?: FetchLike;
    lookup?: (host: string) => Promise<string[]>;
    maxBytes?: number;
    timeoutMs?: number;
    maxRedirects?: number;
  } = {},
): Retriever {
  const fetchImpl = options.fetchImpl ?? fetch;
  const lookup =
    options.lookup ??
    (async (host: string) =>
      (await dnsLookup(host, { all: true })).map((a) => a.address));
  const maxBytes = options.maxBytes ?? 1_000_000;
  const timeoutMs = options.timeoutMs ?? 8000;
  const maxRedirects = options.maxRedirects ?? 3;

  // Scheme, credentials, port and every address the name resolves to.
  async function allowed(url: URL): Promise<boolean> {
    if (url.protocol !== "http:" && url.protocol !== "https:") return false;
    if (url.username || url.password || url.port) return false;
    const host = url.hostname.replace(/^\[|\]$/g, "");
    const addresses = isIP(host) ? [host] : await lookup(host);
    return addresses.length > 0 && addresses.every(isPublicAddress);
  }

  return {
    async fetch(input) {
      try {
        let url = new URL(input);
        for (let hop = 0; hop <= maxRedirects; hop += 1) {
          if (!(await allowed(url))) return NOTHING;
          const response = await fetchImpl(url.href, {
            redirect: "manual",
            credentials: "omit",
            headers: {
              accept: "text/html,text/plain;q=0.9",
              "user-agent": "BinimoyResearchBot/0.1",
            },
            signal: AbortSignal.timeout(timeoutMs),
          });
          if (response.status >= 300 && response.status < 400) {
            const location = response.headers.get("location");
            if (!location) return NOTHING;
            url = new URL(location, url);
            continue;
          }
          const type = response.headers.get("content-type") ?? "";
          if (response.status !== 200 || !/^text\/(html|plain)\b/i.test(type)) {
            return NOTHING;
          }
          const { text, truncated } = await readLimited(response, maxBytes);
          // A 200 response asking for a password is not the post.
          if (/type\s*=\s*["']?password/i.test(text)) {
            return { ...NOTHING, access: "LOGIN_WALL" };
          }
          const body = toText(text).slice(0, maxBytes);
          if (!body) return NOTHING;
          return {
            access: truncated ? "PARTIAL_TEXT" : "FULL_TEXT",
            body,
            publishedAt: null,
            author: null,
          };
        }
        return NOTHING;
      } catch {
        // Unreadable, unreachable, too slow: all the same to the caller.
        return NOTHING;
      }
    },
  };
}
