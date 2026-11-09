/**
 * ===================================================================
 * SLANGUAGE - TERMS OF SERVICE (ĐIỀU KHOẢN NGƯỜI DÙNG) CONTROLLER
 * ===================================================================
 */

function initTerms(): void {
  (window as unknown as { termsApp?: boolean }).termsApp = true;
  const backBtn = document.getElementById('btnBackToAuth') as HTMLAnchorElement | null;
  if (backBtn) {
    backBtn.addEventListener('click', (e) => {
      if ((window.history.length > 1 && document.referrer.includes('/login/')) || document.referrer.includes('/register/')) {
        e.preventDefault();
        window.history.back();
      }
    });
  }
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initTerms);
} else {
  initTerms();
}
