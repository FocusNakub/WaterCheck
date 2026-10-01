// ตัวกลางบน Cloudflare Pages Functions: ดึงข้อมูลจากต้นทางแทนเบราว์เซอร์ (ไม่ติด CORS) และแคชที่ขอบเครือข่าย
// ไม่ต้อง build ใหม่เมื่อข้อมูลเปลี่ยน เพราะดึงสดทุกครั้งที่แคชหมดอายุ
const UA = 'Mozilla/5.0 (flood-th proxy)';
const TW = 'https://api-v3.thaiwater.net/api/v1/thaiwater30/';
const FEWS = 'https://fews2.hii.or.th/model-output/data_portal/';

// รายการที่อนุญาตเท่านั้น (กันคนใช้เป็นพร็อกซีเปิด)
const ROUTES = {
  roads: { url: () => 'https://floodboard.org/api/export/roads.geojson', ttl: 300 },
  tide:  { url: () => FEWS + 'tide_table/summary.txt', ttl: 1800 },
  ff:    { url: () => FEWS + 'flashflood/flashflood_report.txt', ttl: 900 },
  ews:   { url: () => 'https://ews.dwr.go.th/ews/web-service/stn', ttl: 300,
           init: { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: 'action=LoadStation', simple: true },
           transform: slimEws },
};
// เก็บเฉพาะสถานีที่สถานะมากกว่า 0 และฟิลด์ที่ใช้ (ไฟล์ต้นทางประมาณ 3 MB)
function slimEws(text) {
  const out = [], total = { n: 0 };
  (function walk(o) {
    if (Array.isArray(o)) return o.forEach(walk);
    if (o && typeof o === 'object') {
      if ('stn' in o && 'status' in o) {
        total.n++;
        if (+o.status > 0) out.push({ stn: o.stn, name: o.name, status: +o.status, province: o.province, rain: o.rain, wl: o.wl, soil: o.soil, latitude: o.latitude, longitude: o.longitude });
        return;
      }
      for (const k in o) walk(o[k]);
    }
  })(JSON.parse(text));
  return JSON.stringify({ total: total.n, stations: out });
}
const TW_OK = /^(public\/(waterlevel_load|rain_24h|rain_today|rain_yesterday|rain_monthly|rain_yearly)|analyst\/dam)$/;

export async function onRequest({ request, params, waitUntil }) {
  const [name, ...rest] = [].concat(params.route || []);
  const search = new URL(request.url).search;
  let upstream, ttl = 300, init = {};

  if (name === 'tw') {
    const p = rest.join('/');
    if (!TW_OK.test(p)) return new Response('not allowed', { status: 404 });
    upstream = TW + p + search;
  } else if (ROUTES[name]) {
    upstream = ROUTES[name].url();
    ttl = ROUTES[name].ttl;
    init = ROUTES[name].init || {};
  } else {
    return new Response('not found', { status: 404 });
  }

  // แคชตามลิงก์ต้นทาง (ใช้ GET เสมอ เพื่อให้ POST ของ EWS แคชได้)
  const cache = caches.default;
  const key = new Request('https://cache.local/' + encodeURIComponent(upstream));
  let res = await cache.match(key);
  if (!res) {
    try {
      const go = u => { const { simple, ...o } = init; return fetch(u, { ...o, headers: simple ? (init.headers || {}) : { 'User-Agent': UA, Accept: '*/*', ...(init.headers || {}) } }); };
      let r;
      try { r = await go(upstream); }
      catch (e1) {
        // EWS: ใบรับรอง https ของเซิร์ฟเวอร์อาจเข้มงวดเกินไปสำหรับ Workers ลองผ่าน http แทน
        if (name !== 'ews') throw e1;
        try { r = await go(upstream.replace('https://', 'http://')); }
        catch (e2) { throw new Error(e1.message + ' / http: ' + e2.message); }
      }
      if (!r.ok) return new Response('upstream ' + r.status + ' ' + (await r.text()).slice(0, 120), { status: 502 });
      const t = ROUTES[name] && ROUTES[name].transform;
      res = t ? new Response(t(await r.text()), { status: 200, headers: { 'Content-Type': 'application/json' } }) : new Response(r.body, r);
      res.headers.set('Cache-Control', 'public, max-age=' + ttl);
      waitUntil(cache.put(key, res.clone()));
    } catch (e) {
      return new Response('upstream error: ' + (e && e.message), { status: 502 });
    }
  }
  const out = new Response(res.body, res);
  out.headers.set('Access-Control-Allow-Origin', '*');
  return out;
}
