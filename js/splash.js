  // --- Splash screen ---
  (function() {
    const splash = document.getElementById('splash');
    let dismissed = false;
    function dismissSplash() {
      if (dismissed) return;
      dismissed = true;
      splash.classList.add('hidden');
    }
    setTimeout(dismissSplash, 1600);
    splash.addEventListener('click', dismissSplash);
    splash.addEventListener('touchstart', (e) => { e.preventDefault(); dismissSplash(); }, { passive: false });
  })();
