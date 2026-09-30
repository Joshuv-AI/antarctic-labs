export type TypographyVortexMode = "dark" | "light";

export type TypographyVortexOptions = {
  mode: TypographyVortexMode;
  phrase: string;
  speed: number;
  ringGrowth: number;
  opacity: number;
  dissolveRadius: number;
  particleAmount: number;
  suctionDuration: number;
  // Frozen mode: render one static frame, then park the animation loop.
  // Used on content-heavy routes (the Tower library index) where a living
  // backdrop costs more than it gives — every animated frame forces the
  // frosted-glass content above the canvas to repaint its backdrop blur.
  frozen?: boolean;
};

function resolveMode(mode: TypographyVortexOptions["mode"] | number | string | undefined): TypographyVortexMode {
  if (mode === "light" || mode === 1 || mode === "1") return "light";
  return "dark";
}

type Ring = {
  radius: number;
  fontSize: number;
  alpha: number;
  speed: number;
  offset: number;
  spacing: number;
  wobble: number;
  bitmap: HTMLCanvasElement;
  size: number;
};

type Stray = {
  radius: number;
  angle: number;
  speed: number;
  character: string;
  alpha: number;
  fontSize: number;
};

type Dust = {
  x: number;
  y: number;
  velocityX: number;
  velocityY: number;
  size: number;
  life: number;
  maxLife: number;
  age: number;
  phase: number;
  spin: number;
  color: string;
  sucked: boolean;
};

const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));
const lerp = (from: number, to: number, amount: number) => from + (to - from) * amount;
const mulberry32 = (seed: number) => () => {
  seed |= 0;
  seed = seed + 0x6d2b79f5 | 0;
  let value = Math.imul(seed ^ seed >>> 15, 1 | seed);
  value = value + Math.imul(value ^ value >>> 7, 61 | value) ^ value;
  return ((value ^ value >>> 14) >>> 0) / 4294967296;
};

export function createTypographyVortexRenderer(
  host: HTMLElement,
  canvas: HTMLCanvasElement,
  getOptions: () => TypographyVortexOptions,
) {
  const context = canvas.getContext("2d");
  const layer = document.createElement("canvas");
  const layerContext = layer.getContext("2d", { willReadFrequently: true });
  if (!context || !layerContext) return () => undefined;

  const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const pixelRatio = Math.min(window.devicePixelRatio || 1, 2);
  const pointer = { x: 0, y: 0, inside: false };
  const suction = { x: 0, y: 0, started: 0, until: 0 };
  let width = 0;
  let height = 0;
  let rings: Ring[] = [];
  let strays: Stray[] = [];
  let particles: Dust[] = [];
  let dissolve = 0;
  let lastSpawn = 0;
  let lastAmbientSpawn = 0;
  let lastTime = 0;
  let lastDraw = 0;
  let stateFrame = 0;
  let framesDrawn = 0;
  let frame = 0;
  let visible = true;
  let renderSignature = "";

  type RingBuildCursor = {
    options: TypographyVortexOptions;
    phrase: string;
    random: () => number;
    fontFamily: string;
    ringPixelRatio: number;
    maximumRadius: number;
    radius: number;
    index: number;
  };
  let ringCursor: RingBuildCursor | null = null;

  // Rings built per animation frame while (re)building the bitmaps. The
  // full build is ~2,500 canvas text ops — doing it synchronously blocks
  // the main thread for hundreds of ms, which froze the Tower boot
  // animation on the library route. Building a couple of rings per frame
  // keeps every frame well under budget; draw() renders whatever rings
  // exist so far, so the vortex blooms in over a few frames instead of
  // popping in after one long freeze. The seeded random sequence is
  // untouched, so the finished result is pixel-identical.
  const RINGS_PER_STEP = 2;

  const buildOneRing = (cursor: RingBuildCursor): boolean => {
    const { options, phrase, random, fontFamily, ringPixelRatio, maximumRadius } = cursor;
    const sparse = cursor.index % 3 === 2;
    const ringBase = {
      radius: cursor.radius,
      fontSize: clamp(7 + cursor.radius * 0.015, 7, 17),
      alpha: clamp(0.34 + cursor.radius / maximumRadius, 0.36, 0.92) * (sparse ? 0.72 : 1) * options.opacity,
      speed: (0.05 + 40 / (cursor.radius + 60)) * 0.35,
      offset: random() * Math.PI * 2,
      spacing: sparse ? 2.4 + random() * 1.2 : 1.02 + random() * 0.14,
      wobble: random() * Math.PI * 2,
    };
    const size = Math.ceil((ringBase.radius + ringBase.fontSize * 2) * 2);
    const bitmap = document.createElement("canvas");
    bitmap.width = bitmap.height = Math.ceil(size * ringPixelRatio);
    const bitmapContext = bitmap.getContext("2d");
    if (!bitmapContext) return false;
    bitmapContext.scale(ringPixelRatio, ringPixelRatio);
    bitmapContext.translate(size / 2, size / 2);
    bitmapContext.font = `${ringBase.fontSize}px ${fontFamily}`;
    bitmapContext.textAlign = "center";
    bitmapContext.textBaseline = "middle";
    const ink = resolveMode(options.mode) === "light" ? "42,44,52" : "211,211,206";
    bitmapContext.fillStyle = `rgba(${ink},${ringBase.alpha})`;
    const step = (ringBase.fontSize * 0.62 * ringBase.spacing) / ringBase.radius;
    const count = Math.max(4, Math.floor((Math.PI * 2) / step));
    const actualStep = (Math.PI * 2) / count;
    for (let characterIndex = 0; characterIndex < count; characterIndex += 1) {
      const angle = characterIndex * actualStep;
      const character = phrase[characterIndex % phrase.length];
      if (character === " ") continue;
      bitmapContext.save();
      bitmapContext.translate(Math.cos(angle) * ringBase.radius, Math.sin(angle) * ringBase.radius);
      bitmapContext.rotate(angle + Math.PI / 2);
      bitmapContext.fillText(character, 0, 0);
      bitmapContext.restore();
    }
    rings.push({ ...ringBase, bitmap, size });
    cursor.radius *= Math.max(1.08, options.ringGrowth);
    cursor.index += 1;
    return true;
  };

  const buildRings = () => {
    const options = getOptions();
    const phrase = options.phrase || "SABLE / SYSTEMS IN MOTION / ";
    const random = mulberry32(7 * 17 + 3);
    const fontFamily = '"ThreeUI Fragment Mono", ui-monospace, "SFMono-Regular", Menlo, Consolas, monospace';
    const ringPixelRatio = Math.max(pixelRatio, 1.5);
    const maximumRadius = Math.hypot(Math.max(width * 0.55, width * 0.48), Math.max(height * 0.52, height * 0.5)) + 40;
    rings = [];
    ringCursor = {
      options,
      phrase,
      random,
      fontFamily,
      ringPixelRatio,
      maximumRadius,
      radius: Math.max(26, width * 0.038),
      index: 0,
    };
  };

  const stepRingBuild = () => {
    const cursor = ringCursor;
    if (!cursor) return;
    let failed = false;
    for (let n = 0; n < RINGS_PER_STEP && cursor.radius < cursor.maximumRadius && !failed; n += 1) {
      if (!buildOneRing(cursor)) failed = true;
    }
    if (failed || cursor.radius >= cursor.maximumRadius) {
      strays = [];
      for (let strayIndex = 0; strayIndex < 34; strayIndex += 1) {
        strays.push({
          radius: 30 + cursor.random() * (cursor.maximumRadius - 60),
          angle: cursor.random() * Math.PI * 2,
          speed: (cursor.random() - 0.5) * 0.06,
          character: cursor.phrase[(cursor.random() * cursor.phrase.length) | 0],
          alpha: (0.18 + cursor.random() * 0.3) * cursor.options.opacity,
          fontSize: 8 + cursor.random() * 6,
        });
      }
      ringCursor = null;
    }
  };

  // Dimensions the ring bitmaps were last built for. Mobile browser chrome
  // (URL bar) showing/hiding during a scroll changes the viewport height in
  // small steps; rebuilding and recentering on each one makes the whole
  // background hop up and down. Height changes under the threshold are
  // ignored — the canvas stretches via CSS instead, which is imperceptible
  // for this artwork — while real resizes (rotation, window resize) rebuild.
  let builtW = 0;
  let builtH = 0;
  const resize = () => {
    const bounds = host.getBoundingClientRect();
    const cssW = Math.max(1, Math.round(bounds.width));
    const cssH = Math.max(1, Math.round(bounds.height));
    if (builtW > 0 && cssW === builtW && Math.abs(cssH - builtH) < 100) return;
    builtW = cssW;
    builtH = cssH;
    width = Math.max(1, bounds.width);
    height = Math.max(1, bounds.height);
    canvas.width = Math.round(width * pixelRatio);
    canvas.height = Math.round(height * pixelRatio);
    layer.width = Math.round(width * pixelRatio);
    layer.height = Math.round(height * pixelRatio);
    context.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
    layerContext.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
    particles = [];
    renderSignature = "";
  };

  const spawnPointerDust = (time: number, radius: number) => {
    const options = getOptions();
    if (reduced || time < suction.until || !pointer.inside || dissolve < 0.08 || time - lastSpawn < 44) return;
    lastSpawn = time;
    const x0 = Math.max(0, Math.floor((pointer.x - radius) * pixelRatio));
    const y0 = Math.max(0, Math.floor((pointer.y - radius) * pixelRatio));
    const x1 = Math.min(layer.width, Math.ceil((pointer.x + radius) * pixelRatio));
    const y1 = Math.min(layer.height, Math.ceil((pointer.y + radius) * pixelRatio));
    if (x1 <= x0 || y1 <= y0) return;
    const sampleWidth = x1 - x0;
    const sampleHeight = y1 - y0;
    const pixels = layerContext.getImageData(x0, y0, sampleWidth, sampleHeight).data;
    const sampleStep = Math.max(4, Math.round(4.5 * pixelRatio));
    const spawnLimit = Math.max(1, Math.round(44 * options.particleAmount));
    let spawned = 0;
    for (let y = 0; y < sampleHeight && spawned < spawnLimit; y += sampleStep) {
      for (let x = 0; x < sampleWidth && spawned < spawnLimit; x += sampleStep) {
        const pixelIndex = (y * sampleWidth + x) * 4;
        const alpha = pixels[pixelIndex + 3];
        if (alpha < 34 || Math.random() > 0.34) continue;
        const particleX = (x0 + x) / pixelRatio;
        const particleY = (y0 + y) / pixelRatio;
        const deltaX = particleX - pointer.x;
        const deltaY = particleY - pointer.y;
        const distance = Math.hypot(deltaX, deltaY);
        if (distance > radius || distance < radius * 0.16) continue;
        const normalX = deltaX / Math.max(1, distance);
        const normalY = deltaY / Math.max(1, distance);
        const burst = 0.35 + Math.random() * 1.35;
        const tangent = (Math.random() - 0.5) * 1.4;
        particles.push({
          x: particleX,
          y: particleY,
          velocityX: normalX * burst - normalY * tangent + (Math.random() - 0.5) * 0.35,
          velocityY: normalY * burst + normalX * tangent - 0.15 + Math.random() * 0.55,
          size: 0.65 + Math.random() * 1.55,
          life: 560 + Math.random() * 620,
          maxLife: 1180,
          age: 0,
          phase: Math.random() * Math.PI * 2,
          spin: Math.random() > 0.5 ? 1 : -1,
          color: `${pixels[pixelIndex]},${pixels[pixelIndex + 1]},${pixels[pixelIndex + 2]}`,
          sucked: false,
        });
        spawned += 1;
      }
    }
    const maximum = Math.max(1, Math.round(720 * options.particleAmount));
    if (particles.length > maximum) particles.splice(0, particles.length - maximum);
  };

  const spawnAmbientDust = (time: number, ambientWidth: number) => {
    const options = getOptions();
    // Throttled to ~3x/sec: each call does a getImageData readback, which
    // stalls the canvas pipeline, so calling it every 115ms on a
    // full-height strip was a steady source of frame hitches. The dust is
    // stochastic, so a lower spawn cadence is visually indistinguishable.
    if (reduced || time < suction.until || time - lastAmbientSpawn < 300) return;
    lastAmbientSpawn = time;
    const sampleWidth = Math.min(width, ambientWidth * 1.12);
    const pixelWidth = Math.max(1, Math.floor(sampleWidth * pixelRatio));
    const pixelHeight = Math.max(1, Math.floor(height * pixelRatio));
    // Sample a random ~240px band of the strip instead of its full height:
    // the readback cost scales with pixel count, and random bands keep the
    // spawn distribution uniform over time.
    const bandHeight = Math.max(1, Math.min(pixelHeight, Math.floor(240 * pixelRatio)));
    const bandY = pixelHeight > bandHeight ? Math.floor(Math.random() * (pixelHeight - bandHeight)) : 0;
    const pixels = layerContext.getImageData(0, bandY, pixelWidth, bandHeight).data;
    const spawnLimit = Math.max(1, Math.round(16 * options.particleAmount));
    let spawned = 0;
    for (let attempt = 0; attempt < 520 && spawned < spawnLimit; attempt += 1) {
      const x = (Math.random() * pixelWidth) | 0;
      const y = (Math.random() * bandHeight) | 0;
      const pixelIndex = (y * pixelWidth + x) * 4;
      if (pixels[pixelIndex + 3] < 32) continue;
      const particleX = x / pixelRatio;
      const particleY = (bandY + y) / pixelRatio;
      const edge = clamp(particleX / sampleWidth, 0, 1);
      particles.push({
        x: particleX,
        y: particleY,
        velocityX: 0.18 + Math.random() * 0.8 + edge * 0.35,
        velocityY: (Math.random() - 0.5) * 0.8,
        size: 0.55 + Math.random() * 1.35,
        life: 620 + Math.random() * 520,
        maxLife: 1140,
        age: 0,
        phase: Math.random() * Math.PI * 2,
        spin: Math.random() > 0.5 ? 1 : -1,
        color: `${pixels[pixelIndex]},${pixels[pixelIndex + 1]},${pixels[pixelIndex + 2]}`,
        sucked: false,
      });
      spawned += 1;
    }
    const maximum = Math.max(1, Math.round(720 * options.particleAmount));
    if (particles.length > maximum) particles.splice(0, particles.length - maximum);
  };

  const updateDust = (time: number, deltaTime: number) => {
    const options = getOptions();
    const step = clamp(deltaTime / 16.67, 0.25, 3);
    const suctionActive = !reduced && time < suction.until;
    const alive: Dust[] = [];
    for (const particle of particles) {
      particle.life -= deltaTime;
      particle.age += deltaTime;
      if (particle.life <= 0 || (particle.sucked && !suctionActive)) continue;
      let distanceToSink = Infinity;
      if (suctionActive && particle.sucked) {
        const deltaX = suction.x - particle.x;
        const deltaY = suction.y - particle.y;
        distanceToSink = Math.hypot(deltaX, deltaY);
        if (distanceToSink < 5) continue;
        const targetSpeed = clamp(distanceToSink * 0.078, 3.2, 28);
        const pull = 1 - Math.pow(0.76, step);
        particle.velocityX = lerp(particle.velocityX, deltaX / distanceToSink * targetSpeed, pull);
        particle.velocityY = lerp(particle.velocityY, deltaY / distanceToSink * targetSpeed, pull);
      } else {
        const swirl = Math.sin(time * 0.0024 + particle.phase) * 0.018 * particle.spin;
        particle.velocityX += Math.cos(particle.phase + time * 0.0017) * 0.012 * step - swirl * particle.velocityY;
        particle.velocityY += 0.018 * step + swirl * particle.velocityX;
        particle.velocityX *= Math.pow(0.987, step);
        particle.velocityY *= Math.pow(0.991, step);
      }
      particle.x += particle.velocityX * step;
      particle.y += particle.velocityY * step;
      const sinkFade = suctionActive && particle.sucked ? clamp(distanceToSink / 42, 0.12, 1) : 1;
      const fadeIn = clamp(particle.age / 240, 0, 1);
      const alpha = clamp(particle.life / Math.min(particle.maxLife, 820), 0, 1) * fadeIn * sinkFade * options.opacity;
      context.fillStyle = `rgba(${particle.color},${alpha * 0.88})`;
      const size = particle.size * (0.5 + alpha * 0.5);
      context.fillRect(particle.x - size * 0.5, particle.y - size * 0.5, size, size);
      alive.push(particle);
    }
    particles = alive;
    if (suctionActive) {
      const progress = clamp((time - suction.started) / (suction.until - suction.started), 0, 1);
      context.save();
      const suctionInk = resolveMode(getOptions().mode) === "light" ? "42,44,52" : "218,218,212";
      const suctionCore = resolveMode(getOptions().mode) === "light" ? "28,30,38" : "226,226,220";
      context.strokeStyle = `rgba(${suctionInk},${(1 - progress) * 0.34 * options.opacity})`;
      context.lineWidth = 1;
      context.beginPath();
      context.arc(suction.x, suction.y, 5 + progress * 22, 0, Math.PI * 2);
      context.stroke();
      context.fillStyle = `rgba(${suctionCore},${(1 - progress) * 0.62 * options.opacity})`;
      context.fillRect(suction.x - 1, suction.y - 1, 2, 2);
      context.restore();
    }
  };

  const draw = (time: number) => {
    const options = getOptions();
    const isLight = resolveMode(options.mode) === "light";
    const signature = `${options.mode}|${options.phrase}|${options.ringGrowth}|${options.opacity}|${width}|${height}`;
    if (signature !== renderSignature) {
      renderSignature = signature;
      buildRings();
    }
    // The ring bitmaps build a couple per frame (see stepRingBuild) so a
    // rebuild never blocks the main thread; draw what exists so far.
    if (ringCursor) stepRingBuild();
    context.clearRect(0, 0, width, height);
    context.fillStyle = isLight ? "#eef1f6" : "#151515";
    context.fillRect(0, 0, width, height);
    layerContext.clearRect(0, 0, width, height);
    const deltaTime = Math.min(time - (lastTime || time), 100);
    lastTime = time;
    const dissolveTarget = pointer.inside && !reduced ? 1 : 0;
    dissolve = lerp(dissolve, dissolveTarget, 1 - Math.pow(0.78, deltaTime / 16.6));
    if (dissolve < 0.002) dissolve = 0;
    const centerX = width * 0.52;
    const centerY = height * 0.485;
    const seconds = time / 1000 * options.speed;
    const guideInk = isLight ? "42,44,52" : "198,198,193";
    const strayInk = isLight ? "48,50,58" : "188,188,183";

    context.save();
    context.translate(centerX, centerY);
    context.strokeStyle = `rgba(${guideInk},${(isLight ? 0.1 : 0.065) * options.opacity})`;
    context.lineWidth = 1;
    context.setLineDash([1, 5]);
    for (const ring of rings) {
      context.beginPath();
      context.arc(0, 0, ring.radius * 1.115, 0, Math.PI * 2);
      context.stroke();
    }
    context.restore();

    layerContext.save();
    layerContext.translate(centerX, centerY);
    for (const ring of rings) {
      const base = ring.offset + seconds * ring.speed + Math.sin(seconds * 0.11 + ring.wobble) * 0.02;
      layerContext.save();
      layerContext.rotate(base);
      layerContext.drawImage(ring.bitmap, -ring.size / 2, -ring.size / 2, ring.size, ring.size);
      layerContext.restore();
    }
    const fontFamily = '"ThreeUI Fragment Mono", ui-monospace, "SFMono-Regular", Menlo, Consolas, monospace';
    layerContext.textAlign = "center";
    layerContext.textBaseline = "middle";
    for (const stray of strays) {
      const angle = stray.angle + seconds * stray.speed;
      layerContext.font = `${stray.fontSize}px ${fontFamily}`;
      layerContext.fillStyle = `rgba(${strayInk},${stray.alpha})`;
      layerContext.save();
      layerContext.translate(Math.cos(angle) * stray.radius, Math.sin(angle) * stray.radius);
      layerContext.rotate(angle + Math.PI / 2);
      layerContext.fillText(stray.character, 0, 0);
      layerContext.restore();
    }
    layerContext.restore();

    const ambientWidth = clamp(width * 0.22, 108, 180);
    const radius = clamp(Math.min(width, height) * 0.24, 128, 196) * options.dissolveRadius;
    spawnAmbientDust(time, ambientWidth);
    spawnPointerDust(time, radius);

    if (!reduced) {
      layerContext.save();
      layerContext.globalCompositeOperation = "destination-out";
      const ambientMask = layerContext.createLinearGradient(0, 0, ambientWidth, 0);
      ambientMask.addColorStop(0, "rgba(0,0,0,.98)");
      ambientMask.addColorStop(0.34, "rgba(0,0,0,.88)");
      ambientMask.addColorStop(0.72, "rgba(0,0,0,.36)");
      ambientMask.addColorStop(1, "rgba(0,0,0,0)");
      layerContext.fillStyle = ambientMask;
      layerContext.fillRect(0, 0, ambientWidth, height);
      layerContext.restore();
    }

    if (dissolve > 0.002) {
      const maskedRadius = radius * (0.42 + dissolve * 0.58);
      layerContext.save();
      layerContext.globalCompositeOperation = "destination-out";
      const mask = layerContext.createRadialGradient(pointer.x, pointer.y, maskedRadius * 0.06, pointer.x, pointer.y, maskedRadius);
      mask.addColorStop(0, "rgba(0,0,0,1)");
      mask.addColorStop(0.57, "rgba(0,0,0,.98)");
      mask.addColorStop(0.84, "rgba(0,0,0,.42)");
      mask.addColorStop(1, "rgba(0,0,0,0)");
      layerContext.fillStyle = mask;
      layerContext.beginPath();
      layerContext.arc(pointer.x, pointer.y, maskedRadius, 0, Math.PI * 2);
      layerContext.fill();
      layerContext.restore();
    }

    context.drawImage(layer, 0, 0, layer.width, layer.height, 0, 0, width, height);
    updateDust(time, deltaTime);
    if (dissolve > 0.02) {
      context.save();
      const dissolveInk = isLight ? "42,44,52" : "210,210,205";
      context.strokeStyle = `rgba(${dissolveInk},${(0.08 + dissolve * 0.13) * options.opacity})`;
      context.lineWidth = 1;
      context.setLineDash([2, 6]);
      context.beginPath();
      context.arc(pointer.x, pointer.y, radius * (0.42 + dissolve * 0.58), 0, Math.PI * 2);
      context.stroke();
      context.restore();
    }

    if (++stateFrame % 5 === 0) {
      const suctionActive = !reduced && time < suction.until;
      host.dataset.dissolveState = reduced ? "reduced" : suctionActive ? "suction" : pointer.inside ? "active" : dissolve > 0.02 ? "recovering" : "ambient";
      host.dataset.suctionState = suctionActive ? "active" : "idle";
      host.dataset.particles = String(particles.length);
      host.dataset.dissolveStrength = dissolve.toFixed(2);
    }
  };

  const animate = (time: number) => {
    // 30fps cap: halves the per-frame raster cost and evens the frame
    // cadence, which keeps the animation smooth while the browser is busy
    // compositing a scroll. Ring positions derive from absolute time, so
    // rendering fewer frames changes nothing visually.
    //
    // While the visitor is typing in a text field (the library search box),
    // skip drawing entirely. The canvas is an ambient backdrop, and a frozen
    // frame is imperceptible while attention is on the keyboard — but every
    // frame otherwise forces the phone to repaint the frosted-glass rows
    // sitting above the canvas (their backdrop blur re-samples on every
    // backdrop change), which is what kept keystrokes feeling heavy. Ring
    // positions and dust aging derive from absolute time/deltaTime, so when
    // focus leaves the field the animation resumes exactly where it should
    // be — no jump, no state to repair. The frame loop keeps running so
    // resume is instant.
    const typing =
      document.activeElement instanceof HTMLInputElement ||
      document.activeElement instanceof HTMLTextAreaElement;
    // Frozen mode (library page): once the ring build is done and a full
    // frame has drawn, stop drawing. The bitmap stays put as a static
    // backdrop, so the frosted-glass content above it never repaints its
    // backdrop blur — the per-frame tax that made scrolling and typing on
    // the 3,448-row index feel heavy. The loop itself keeps ticking (a few
    // property reads per wake — negligible), so un-freezing or a
    // resize-triggered rebuild resumes drawing immediately.
    const frozen = !!getOptions().frozen;
    const buildDone = ringCursor === null && framesDrawn > 0;
    if ((!frozen || !buildDone) && !typing && time - lastDraw >= 33.34) {
      lastDraw = time;
      draw(time);
      framesDrawn += 1;
    }
    frame = 0;
    if (visible && !document.hidden) frame = requestAnimationFrame(animate);
  };
  const locatePointer = (event: PointerEvent) => {
    const bounds = host.getBoundingClientRect();
    pointer.x = clamp(event.clientX - bounds.left, 0, bounds.width);
    pointer.y = clamp(event.clientY - bounds.top, 0, bounds.height);
    pointer.inside = true;
  };
  const onPointerLeave = () => { pointer.inside = false; };
  const onPointerDown = (event: PointerEvent) => {
    locatePointer(event);
    const options = getOptions();
    suction.x = pointer.x;
    suction.y = pointer.y;
    suction.started = performance.now();
    suction.until = suction.started + options.suctionDuration;
    for (const particle of particles) {
      particle.sucked = true;
      particle.life = Math.max(particle.life, options.suctionDuration + 20);
      particle.maxLife = Math.max(particle.maxLife, options.suctionDuration + 20);
    }
    host.dataset.suctionState = "active";
  };
  const onVisibility = () => {
    if (!document.hidden && visible && !frame) frame = requestAnimationFrame(animate);
  };
  let resizeTimer = 0;
  // Debounced resize: on mobile the URL bar collapsing/expanding during a
  // scroll fires resize continuously, and rebuilding every ring bitmap on
  // each one hitches the main thread and stutters the animation. Coalesce
  // into a single rebuild once sizing settles.
  // Frozen mode: the ticking loop deliberately skips draw() once the
  // static frame is complete, so a resize (which clears the canvas and
  // invalidates the ring build) would otherwise leave a blank backdrop.
  // Rebuild and repaint the single frame synchronously. This path is rare
  // (rotation or a real window resize — sub-100px height wiggles never
  // reach it), so a few hundred ms of canvas work here is acceptable.
  const renderStaticFrame = () => {
    let guard = 0;
    draw(performance.now()); // signature check triggers buildRings()
    while (ringCursor && guard++ < 1000) stepRingBuild();
    draw(performance.now());
    framesDrawn += 1;
  };
  const scheduleResize = () => {
    if (resizeTimer) window.clearTimeout(resizeTimer);
    resizeTimer = window.setTimeout(() => {
      resizeTimer = 0;
      resize();
      if (getOptions().frozen) renderStaticFrame();
    }, 250);
  };
  const resizeObserver = new ResizeObserver(scheduleResize);
  const intersectionObserver = new IntersectionObserver(([entry]) => {
    visible = entry?.isIntersecting ?? true;
    if (visible && !frame && !document.hidden) frame = requestAnimationFrame(animate);
    if (!visible && frame) {
      cancelAnimationFrame(frame);
      frame = 0;
    }
  });

  host.addEventListener("pointerenter", locatePointer);
  host.addEventListener("pointermove", locatePointer);
  host.addEventListener("pointerleave", onPointerLeave);
  host.addEventListener("pointerdown", onPointerDown);
  document.addEventListener("visibilitychange", onVisibility);
  resizeObserver.observe(host);
  intersectionObserver.observe(host);
  resize();
  frame = requestAnimationFrame(animate);

  return () => {
    if (frame) cancelAnimationFrame(frame);
    if (resizeTimer) window.clearTimeout(resizeTimer);
    resizeObserver.disconnect();
    intersectionObserver.disconnect();
    host.removeEventListener("pointerenter", locatePointer);
    host.removeEventListener("pointermove", locatePointer);
    host.removeEventListener("pointerleave", onPointerLeave);
    host.removeEventListener("pointerdown", onPointerDown);
    document.removeEventListener("visibilitychange", onVisibility);
  };
}
