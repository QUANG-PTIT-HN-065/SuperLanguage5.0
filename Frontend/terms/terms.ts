/**
 * ===================================================================
 * SLANGUAGE - TERMS OF SERVICE (ĐIỀU KHOẢN NGƯỜI DÙNG) CONTROLLER
 * ===================================================================
 */

function triggerLoadingAndRedirect(targetUrl: string, duration: number = 1500): void {
  const overlay = document.getElementById('slanguageLoadingOverlay');
  const video = document.getElementById('loadingVideoPlayer') as HTMLVideoElement | null;
  if (overlay) {
    overlay.classList.add('active');
    if (video) {
      video.muted = false;
      video.volume = 1.0;
      video.currentTime = 0;
      const playPromise = video.play();
      if (playPromise !== undefined) {
        playPromise.catch(() => {
          if (video) {
            video.muted = true;
            video.play().catch(() => {});
          }
        });
      }
    }
  }
  setTimeout(() => {
    if (video) {
      video.pause();
      video.muted = true;
    }
    if (overlay) {
      overlay.classList.remove('active');
    }
    window.location.href = targetUrl;
  }, duration);
}

function initTerms(): void {
  (window as unknown as { termsApp?: boolean }).termsApp = true;
  const backBtn = document.getElementById('btnBackToAuth') as HTMLAnchorElement | null;
  if (backBtn) {
    backBtn.addEventListener('click', (e) => {
      e.preventDefault();
      triggerLoadingAndRedirect('../login/index.html', 1500);
    });
  }

  function bindPageTransitions(): void {
    document.querySelectorAll<HTMLAnchorElement>('a[href]').forEach(link => {
    if (link === backBtn) return;
    const href = link.getAttribute('href');
    if (
      href &&
      !href.startsWith('#') &&
      !href.startsWith('javascript:') &&
      !link.hasAttribute('target') &&
      !href.startsWith('mailto:') &&
      !href.startsWith('tel:')
    ) {
      link.addEventListener('click', (e: MouseEvent) => {
        e.preventDefault();
        triggerLoadingAndRedirect(href, 1500);
      });
    }
  });

  }
  bindPageTransitions();

  window.addEventListener('pageshow', () => {
    const overlay = document.getElementById('slanguageLoadingOverlay');
    const video = document.getElementById('loadingVideoPlayer') as HTMLVideoElement | null;
    if (overlay) overlay.classList.remove('active');
    if (video) {
      video.pause();
      video.muted = true;
      video.currentTime = 0;
    }
  });

  window.addEventListener('pagehide', () => {
    const video = document.getElementById('loadingVideoPlayer') as HTMLVideoElement | null;
    if (video) {
      video.pause();
      video.muted = true;
    }
  });
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initTerms);
} else {
  initTerms();
}
