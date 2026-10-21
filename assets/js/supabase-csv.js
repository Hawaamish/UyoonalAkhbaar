// Loads a Supabase table (named after the former CSV file) and returns it as CSV text,
// so the existing CSV parsing code in each page keeps working unchanged.
(function () {
  const SUPABASE_URL = 'https://xbxpcgrwxrlqxxgtdtgp.supabase.co';
  const SUPABASE_ANON_KEY = 'sb_publishable_TvFKfakJN3BmxVGVA6Kdhw_secO1Mi3';
  const PAGE_SIZE = 1000;

  const quote = (v) => {
    const s = v === null || v === undefined ? '' : String(v);
    return /[",\r\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
  };

  window.fetchTableAsCsv = async function (table) {
    const rows = [];
    for (let from = 0; ; from += PAGE_SIZE) {
      const res = await fetch(`${SUPABASE_URL}/rest/v1/${encodeURIComponent(table)}?select=*&order=id.asc`, {
        cache: 'no-store',
        headers: {
          apikey: SUPABASE_ANON_KEY,
          Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
          Range: `${from}-${from + PAGE_SIZE - 1}`
        }
      });
      if (!res.ok) throw new Error(`Supabase table "${table}" load failed: ${res.status}`);
      const batch = await res.json();
      rows.push(...batch);
      if (batch.length < PAGE_SIZE) break;
    }
    if (!rows.length) return '';
    const headers = Object.keys(rows[0]).filter((h) => h !== 'id');
    return [headers, ...rows.map((r) => headers.map((h) => r[h]))]
      .map((line) => line.map(quote).join(','))
      .join('\n');
  };
})();
