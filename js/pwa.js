  // --- Offline-Unterstuetzung: Service Worker (sw.js) und Stimmen im Hintergrund laden ---
  // Nur ueber https oder localhost, nicht beim direkten Oeffnen der index.html.
  const PWA_PREFETCH_DELAY_MS = 5000; // erst laden, wenn das Spiel laeuft
  const PWA_PREFETCH_GAP_MS = 120;    // Pause zwischen zwei Dateien, damit das Netz frei bleibt

  // Alle Dateien fuer offline: Waechter nur mit den Offline-Stimmen, alles andere komplett
  function pwaVoiceUrls() {
    const all = new Set(), offline = new Set();
    if (!voiceManifest) return { all, offline };
    for (const cat in voiceManifest) {
      for (const t in voiceManifest[cat]) {
        for (const p of voiceManifest[cat][t]) {
          const url = new URL(voicePackUrl(p), location.href).href;
          all.add(url);
          if (cat.indexOf('guard_') !== 0 || VOICE_OFFLINE_IDS.includes(voiceIdOf(p))) offline.add(url);
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
    const wanted = all;
    const have = new Set();
    const scope = new URL('.', location.href).href; // nur eigene Dateien, der Cache kann geteilt sein
    for (const req of await cache.keys()) {
      // Veraltete Dateien (neu generiert oder entfernt) wegraeumen
      if (!wanted.has(req.url) && req.url.startsWith(scope)) await cache.delete(req);
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

  // Test-Links (raw.githack.com/<commit>/...): kein Offline-Modus. Alle Commits teilen sich dort
  // eine Domain und damit die Caches; sie wuerden sich gegenseitig die Stimmen loeschen und neu laden.
  // Frueher registrierte Service Worker und Caches werden dort entfernt.
  const PWA_TEST_HOST = /(^|\.)githack\.com$/.test(location.hostname);
  if (PWA_TEST_HOST && 'serviceWorker' in navigator) {
    navigator.serviceWorker.getRegistrations()
      .then(regs => regs.forEach(r => r.unregister()))
      .catch(() => {});
    if (window.caches) {
      caches.keys().then(keys => keys.forEach(k => { if (k.indexOf('claim-') === 0) caches.delete(k); })).catch(() => {});
    }
  }

  if ('serviceWorker' in navigator && location.protocol !== 'file:' && !PWA_TEST_HOST) {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('sw.js')
        .then(() => navigator.serviceWorker.ready)
        .then(() => setTimeout(() => pwaPrefetchVoices().catch(() => {}), PWA_PREFETCH_DELAY_MS))
        .catch(() => {});
    });
  }
