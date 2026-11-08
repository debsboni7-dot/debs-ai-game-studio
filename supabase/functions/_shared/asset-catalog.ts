export function extractPublicDownloadLinks(html: string, pageUrl: URL): URL[] {
  const decode = (value: string) => value
    .replace(/&amp;/gi, "&").replace(/&quot;/gi, '"').replace(/&#39;|&apos;/gi, "'")
    .replace(/&lt;/gi, "<").replace(/&gt;/gi, ">")
    .replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(Number(code)))
    .replace(/&#x([0-9a-f]+);/gi, (_, code) => String.fromCodePoint(parseInt(code, 16)));
  const candidates: Array<{ url: URL; score: number }> = [];
  const anchorPattern = /<a\b([^>]*?)href\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))([^>]*)>([\s\S]*?)<\/a\s*>/gi;
  let match: RegExpExecArray | null;
  while ((match = anchorPattern.exec(html)) !== null) {
    const href = decode(match[2] ?? match[3] ?? match[4] ?? "").trim();
    if (!href || /^(?:javascript:|mailto:|data:|#)/i.test(href)) continue;
    let url: URL;
    try { url = new URL(href, pageUrl); } catch { continue; }
    if (url.protocol !== "https:") continue;
    const text = decode((match[6] ?? "").replace(/<[^>]+>/g, " ")).replace(/\s+/g, " ").trim();
    const attrs = (match[1] + " " + match[5]).toLowerCase();
    const hint = (url.pathname + url.search + " " + text + " " + attrs).toLowerCase();
    let score = 0;
    if (/\.zip(?:$|[?#&])/i.test(url.href)) score += 10;
    if (/download|télécharg|telecharg|export|asset|package|archive|\.zip/.test(hint)) score += 4;
    if (/button|download|asset|file/.test(attrs)) score += 2;
    if (score > 0) candidates.push({ url, score });
  }
  const unique = new Map<string, { url: URL; score: number }>();
  for (const item of candidates) {
    const key = item.url.toString();
    if (!unique.has(key) || unique.get(key)!.score < item.score) unique.set(key, item);
  }
  return [...unique.values()].sort((a, b) => b.score - a.score).slice(0, 8).map((item) => item.url);
}
