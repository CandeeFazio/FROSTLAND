(() => {
  let deferredPrompt = null;

  const installBtn = document.getElementById("installAppBtn");
  const iosGuide = document.getElementById("iosInstallGuide");
  const closeIosGuide = document.getElementById("closeIosGuide");

  if (!installBtn) return;

  const isStandalone =
    window.matchMedia("(display-mode: standalone)").matches ||
    window.navigator.standalone === true;

  const isIOS = /iphone|ipad|ipod/i.test(navigator.userAgent);
  const isSafari = /safari/i.test(navigator.userAgent) && !/crios|fxios|edgios/i.test(navigator.userAgent);

  if (isStandalone) {
    installBtn.hidden = true;
    return;
  }

  window.addEventListener("beforeinstallprompt", (event) => {
    event.preventDefault();
    deferredPrompt = event;
    installBtn.hidden = false;
  });

  if (isIOS && isSafari) {
    installBtn.hidden = false;
  }

  installBtn.addEventListener("click", async () => {
    if (deferredPrompt) {
      deferredPrompt.prompt();
      await deferredPrompt.userChoice;
      deferredPrompt = null;
      installBtn.hidden = true;
      return;
    }

    if (isIOS && isSafari && iosGuide) {
      iosGuide.hidden = false;
      return;
    }

    alert("Abrí el menú del navegador y elegí “Instalar aplicación” o “Agregar a pantalla de inicio”.");
  });

  closeIosGuide?.addEventListener("click", () => {
    iosGuide.hidden = true;
  });

  iosGuide?.addEventListener("click", (event) => {
    if (event.target === iosGuide) iosGuide.hidden = true;
  });

  window.addEventListener("appinstalled", () => {
    installBtn.hidden = true;
    deferredPrompt = null;
  });
})();
