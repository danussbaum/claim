  // --- Offline-Unterstuetzung: Service Worker (sw.js) und Stimmen im Hintergrund laden ---
  // Nur ueber https oder localhost, nicht beim direkten Oeffnen der index.html.
  const PWA_PREFETCH_DELAY_MS = 5000; // erst laden, wenn das Spiel laeuft
  const PWA_PREFETCH_GAP_MS = 120;    // Pause zwischen zwei Dateien, damit das Netz frei bleibt

  // Alle Dateien fuer offline: Waechter nur mit den Offline-Stimmen, alles andere komplett
  function pwaVoiceUrls() {
    const all = [], offline = [];
    if (!voiceManifest) return { all, offline };
    for (const cat in voiceManifest) {
      for (const t in voiceManifest[cat]) {
        for (const p of voiceManifest[cat][t]) {
          const url = new URL(p, location.href).href;
          all.push(url);
          if (cat.indexOf('guard_') !== 0 || VOICE_OFFLINE_IDS.includes(voiceIdOf(p))) offline.push(url);
        }
      }
    }
    return { all, offline };
  }

  // Mobile Daten oder Datensparmodus: nichts im Hintergrund laden
  function pwaMeteredConnection() {
    const c = navigator.connection;
    return !!(c && (c.saveData || c.type === 'cellular'));
  }

  async function pwaPrefetchVoices() {
    if (!window.caches || !voiceManifest || pwaMeteredConnection()) return;
    const { all, offline } = pwaVoiceUrls();
    const cache = await caches.open('claim-voice');
    const wanted = new Set(all);
    const have = new Set();
    for (const req of await cache.keys()) {
      // Veraltete Dateien (neu generiert oder entfernt) wegraeumen
      if (!wanted.has(req.url)) await cache.delete(req);
      else have.add(req.url);
    }
    for (const url of offline) {
      if (have.has(url)) continue;
      if (!navigator.onLine || pwaMeteredConnection()) return; // spaeter weitermachen
      try {
        const res = await fetch(url);
        if (res.ok) await cache.put(url, res);
      } catch (e) { return; }
      await new Promise(r => setTimeout(r, PWA_PREFETCH_GAP_MS));
    }
  }

  if ('serviceWorker' in navigator && location.protocol !== 'file:') {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('sw.js')
        .then(() => navigator.serviceWorker.ready)
        .then(() => setTimeout(() => pwaPrefetchVoices().catch(() => {}), PWA_PREFETCH_DELAY_MS))
        .catch(() => {});
    });
  }
