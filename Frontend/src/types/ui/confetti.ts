const COLORS = ["#117e83", "#e8d28b", "#e58b68", "#4fb6bd", "#9e402c"];
const DURATION = 2000;
const PARTICLE_COUNT = 60;

export function launchConfetti(container: HTMLElement): void {
  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

  const canvas = document.createElement("canvas");
  canvas.className = "slg-confetti slg-confetti--dialog";
  canvas.setAttribute("aria-hidden", "true");
  container.append(canvas);

  const context = canvas.getContext("2d");
  if (!context) {
    canvas.remove();
    return;
  }

  let width = 0;
  let height = 0;
  let frame = 0;
  const resize = (): void => {
    const scale = Math.min(window.devicePixelRatio || 1, 2);
    const bounds = container.getBoundingClientRect();
    width = bounds.width;
    height = bounds.height;
    canvas.width = Math.round(width * scale);
    canvas.height = Math.round(height * scale);
    context.setTransform(scale, 0, 0, scale, 0, 0);
  };
  resize();
  window.addEventListener("resize", resize);

  const particles = Array.from({ length: PARTICLE_COUNT }, () => ({
    x: width * (0.25 + Math.random() * 0.5),
    y: -16 - Math.random() * height * 0.22,
    vx: (Math.random() - 0.5) * 2.8,
    vy: 2 + Math.random() * 3.8,
    rotation: Math.random() * Math.PI,
    spin: (Math.random() - 0.5) * 0.16,
    size: 4 + Math.random() * 5,
    color: COLORS[Math.floor(Math.random() * COLORS.length)],
  }));
  const startedAt = performance.now();

  const draw = (now: number): void => {
    const elapsed = now - startedAt;
    context.clearRect(0, 0, width, height);
    for (const particle of particles) {
      particle.x += particle.vx;
      particle.y += particle.vy;
      particle.vy += 0.035;
      particle.rotation += particle.spin;
      context.save();
      context.translate(particle.x, particle.y);
      context.rotate(particle.rotation);
      context.fillStyle = particle.color;
      context.globalAlpha = Math.max(0, 1 - elapsed / DURATION);
      context.fillRect(-particle.size / 2, -particle.size / 2, particle.size, particle.size * 0.62);
      context.restore();
    }

    if (elapsed < DURATION) {
      frame = window.requestAnimationFrame(draw);
    } else {
      window.cancelAnimationFrame(frame);
      window.removeEventListener("resize", resize);
      canvas.remove();
    }
  };
  frame = window.requestAnimationFrame(draw);
}
