/**
 * ===================================================================
 * SLANGUAGE - TERMS OF SERVICE (ĐIỀU KHOẢN NGƯỜI DÙNG) CONTROLLER
 * ===================================================================
 */

document.addEventListener('DOMContentLoaded', () => {
  const backBtn = document.getElementById('btnBackToAuth') as HTMLAnchorElement | null;
  if (backBtn) {
    // Preserve history back if opened from login/register, or fallback to login page
    backBtn.addEventListener('click', (e) => {
      if (window.history.length > 1 && document.referrer.includes('/login/') || document.referrer.includes('/register/')) {
        e.preventDefault();
        window.history.back();
      }
    });
  }
});
