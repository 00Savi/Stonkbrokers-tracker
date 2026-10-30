// Card Wall slab rain: the public /rain feed, read server-side.
//
// thecardwall.com does not send CORS headers, so the browser cannot load this
// list. The hourly snapshot can. The page embeds the slab cards in the RSC
// payload (name, image, block) and stamps membership + landed $ in the HTML.

const SITE = "https://thecardwall.com";
const RAIN_URL = `${SITE}/rain`;
const SHOWN = 48;

function absUrl(path) {
  if (!path) return null;
  if (/^https?:\/\//i.test(path)) return path;
  if (path.startsWith("/")) return `${SITE}${path}`;
  return null;
}

function unescapeHtml(s) {
  return String(s || "")
    .replace(/&#x27;/g, "'")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">");
}

/** Expand Next.js flight string escapes used inside self.__next_f.push payloads. */
function flightBody(raw) {
  try {
    return JSON.parse(`"${raw}"`);
  } catch {
    return raw
      .replace(/\\"/g, '"')
      .replace(/\\n/g, "\n")
      .replace(/\\\\/g, "\\");
  }
}

function certFromImage(image) {
  const m = String(image || "").match(/slab-photos\/(\d+)\.jpg/i);
  return m ? m[1] : null;
}

function gradeFromName(name) {
  const m = String(name || "").match(/\b((?:PSA|CGC|BGS)\s*\d+(?:\s+PRISTINE|\s+GEM\s+MINT)?)\b/i);
  return m ? m[1].replace(/\s+/g, " ").trim() : null;
}

function parseRscSlabs(html) {
  const bodies = [];
  const re = /self\.__next_f\.push\(\[1,"((?:\\.|[^"\\])*)"\]\)/g;
  let m;
  while ((m = re.exec(html))) bodies.push(flightBody(m[1]));
  const full = bodies.join("\n");
  const out = [];
  const seen = new Set();
  const slabRe =
    /\{"collection":"(0x[0-9a-fA-F]+)","tokenId":"(\d+)","atBlock":(\d+),"name":"(.*?)","image":(?:"([^"]*)"|null)/g;
  while ((m = slabRe.exec(full))) {
    const key = `${m[2]}:${m[3]}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const imagePath = m[5] || null;
    out.push({
      kind: "slab",
      collection: m[1],
      tokenId: m[2],
      atBlock: Number(m[3]),
      name: m[4],
      image: absUrl(imagePath),
      cert: certFromImage(imagePath),
    });
  }
  return out;
}

function membershipByName(html) {
  const map = new Map();
  const re = /title="([^"]+)" class="group flex w-full flex-col text-left"/g;
  let m;
  while ((m = re.exec(html))) {
    const name = unescapeHtml(m[1]);
    const window = html.slice(m.index, m.index + 1600);
    const mem = window.match(/Membership #(?:<!-- -->)?(\d+)/);
    const price = window.match(/font-semibold tracking-tight">\$(\d[\d,]*)/);
    const date = window.match(/text-ink-faint">([A-Za-z]{3} \d{1,2})</);
    if (!mem) continue;
    map.set(name, {
      membershipId: Number(mem[1]),
      usd: price ? Number(price[1].replace(/,/g, "")) : null,
      dateLabel: date ? date[1] : null,
    });
  }
  return map;
}

function parseCredits(html) {
  const out = [];
  let idx = 0;
  while (true) {
    const at = html.indexOf("$50 Alley credit", idx);
    if (at < 0) break;
    const window = html.slice(at, at + 600);
    const mem = window.match(/Membership #(?:<!-- -->)?(\d+)/);
    const date = window.match(/text-ink-faint">([A-Za-z]{3} \d{1,2})</);
    if (mem) {
      out.push({
        kind: "credit",
        name: "$50 Alley credit",
        membershipId: Number(mem[1]),
        usd: 50,
        dateLabel: date ? date[1] : null,
        image: null,
        cert: null,
        atBlock: null,
        collection: null,
        tokenId: null,
      });
    }
    idx = at + 16;
  }
  return out;
}

function parseFeedOrder(html) {
  // Newest-first order as painted on /rain: share intents appear once per card.
  const order = [];
  const re =
    /https:\/\/x\.com\/intent\/post\?text=([^"&]+)(?:&amp;|&)url=https%3A%2F%2Fthecardwall\.com%2Frain(?:%2Fdrop%2F([a-z0-9-]+))?/g;
  let m;
  while ((m = re.exec(html))) {
    let text = m[1];
    try {
      text = decodeURIComponent(text.replace(/\+/g, " "));
    } catch {
      /* keep raw */
    }
    text = unescapeHtml(text);
    const dropId = m[2] || null;
    const credit = text.match(/\$(\d+)\s+of\s+Alley\s+credit.*?Membership\s+#(\d+)/i);
    if (credit) {
      order.push({
        kind: "credit",
        usd: Number(credit[1]),
        membershipId: Number(credit[2]),
        dropId,
        name: `$${credit[1]} Alley credit`,
      });
      continue;
    }
    // Share copy is: A $24 slab just rained on Membership #834 at @thecardwall - NAME. Passive…
    const slab = text.match(/A\s+\$(\d+)\s+slab.*?Membership\s+#(\d+).*?-\s+(.+?)\.\s+Passive/i);
    if (slab) {
      order.push({
        kind: "slab",
        usd: Number(slab[1]),
        membershipId: Number(slab[2]),
        name: slab[3].trim(),
        dropId,
      });
    }
  }
  return order;
}

function parseStats(html) {
  const vault = html.match(/(\d+)\s+slabs\s+\+\s+(\d+)\s+credits/i);
  const paid = html.match(/(\d+)\s+DROPS\s*[·•]\s*\$([0-9,]+)\s+PAID\s+OUT/i);
  const today = html.match(/TODAY'?S?\s+RAIN\s+(\d+)\s+drops/i);
  const rotation = html.match(/In rotation[\s\S]{0,120}?>(\d{2,5})</i);
  return {
    vaultSlabs: vault ? Number(vault[1]) : null,
    vaultCredits: vault ? Number(vault[2]) : null,
    dropCount: paid ? Number(paid[1]) : null,
    paidOutUsd: paid ? Number(paid[2].replace(/,/g, "")) : null,
    todayDrops: today ? Number(today[1]) : null,
    inRotation: rotation ? Number(rotation[1]) : null,
  };
}

function assemble(html) {
  const rsc = parseRscSlabs(html);
  const byName = new Map(rsc.map((s) => [s.name, s]));
  const mem = membershipByName(html);
  for (const s of rsc) {
    const info = mem.get(s.name);
    if (info) Object.assign(s, info);
  }
  const credits = parseCredits(html);
  const creditQ = [...credits];
  const feed = parseFeedOrder(html);
  const drops = [];
  const usedSlabs = new Set();

  function takeSlab(row) {
    const byMem = rsc.find(
      (s) =>
        !usedSlabs.has(s.tokenId)
        && s.membershipId === row.membershipId
        && (row.usd == null || s.usd == null || Math.abs(s.usd - row.usd) < 0.5),
    );
    if (byMem) return byMem;
    const byExact = byName.get(row.name);
    if (byExact && !usedSlabs.has(byExact.tokenId)) return byExact;
    return rsc.find((s) => !usedSlabs.has(s.tokenId) && s.name === row.name) || null;
  }

  for (const row of feed) {
    if (row.kind === "credit") {
      const c = creditQ.shift() || row;
      drops.push({
        id: row.dropId ? `rain:${row.dropId}` : `rain:credit:${c.membershipId}:${drops.length}`,
        kind: "credit",
        name: c.name || row.name,
        membershipId: c.membershipId || row.membershipId,
        landedCostUsd: c.usd || row.usd || 50,
        dateLabel: c.dateLabel || null,
        image: null,
        cert: null,
        grade: null,
        atBlock: null,
        href: `${SITE}/rain`,
      });
      continue;
    }
    const slab = takeSlab(row);
    if (slab) usedSlabs.add(slab.tokenId);
    const name = slab?.name || row.name;
    const cert = slab?.cert || null;
    drops.push({
      id: row.dropId ? `rain:${row.dropId}` : `rain:slab:${slab?.tokenId || drops.length}`,
      kind: "slab",
      name,
      membershipId: row.membershipId || slab?.membershipId || null,
      landedCostUsd: row.usd ?? slab?.usd ?? null,
      dateLabel: slab?.dateLabel || null,
      image: slab?.image || (cert ? absUrl(`/gacha3d/slab-photos/${cert}.jpg`) : null),
      cert,
      grade: gradeFromName(name),
      atBlock: slab?.atBlock || null,
      href: row.dropId ? `${SITE}/rain/drop/${row.dropId}` : `${SITE}/rain`,
    });
  }

  // If share intents were truncated, append leftover RSC slabs.
  for (const s of rsc) {
    if (usedSlabs.has(s.tokenId)) continue;
    drops.push({
      id: `rain:slab:${s.tokenId}`,
      kind: "slab",
      name: s.name,
      membershipId: s.membershipId || null,
      landedCostUsd: s.usd ?? null,
      dateLabel: s.dateLabel || null,
      image: s.image,
      cert: s.cert,
      grade: gradeFromName(s.name),
      atBlock: s.atBlock,
      href: `${SITE}/rain`,
    });
  }

  const stats = parseStats(html);
  if (stats.dropCount == null) stats.dropCount = drops.length;
  if (stats.paidOutUsd == null) {
    stats.paidOutUsd = Math.round(drops.reduce((s, d) => s + (Number(d.landedCostUsd) || 0), 0) * 100) / 100;
  }

  return {
    drops: drops.slice(0, SHOWN),
    stats,
    source: RAIN_URL,
  };
}

async function fetchCardwallRain({ signal } = {}) {
  const res = await fetch(RAIN_URL, {
    signal: signal || AbortSignal.timeout(20_000),
    headers: { accept: "text/html", "user-agent": "gg-tracker-rain/1.0" },
  });
  if (!res.ok) throw new Error(`rain page HTTP ${res.status}`);
  const html = await res.text();
  const assembled = assemble(html);
  if (!assembled.drops.length) throw new Error("rain page returned no drops");
  return {
    ...assembled,
    fetchedAt: new Date().toISOString(),
  };
}

module.exports = {
  fetchCardwallRain,
  assemble,
  SITE,
  RAIN_URL,
};
