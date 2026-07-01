let dismissed = false;

export function dismissSplash() {
  if (dismissed) return;
  dismissed = true;
  const splash = document.getElementById('splash');
  if (!splash) return;
  splash.classList.add('fade-out');
  setTimeout(() => splash.remove(), 600);
}
