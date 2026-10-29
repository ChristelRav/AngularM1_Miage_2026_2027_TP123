import {
  afterRenderEffect,
  Component,
  computed,
  DestroyRef,
  effect,
  ElementRef,
  inject,
  signal,
  untracked,
  viewChild,
} from '@angular/core';
import type { Butterchurn, ButterchurnVisualizer } from 'butterchurn';
import { AudioContextService } from '../../services/audio-context.service';
import { ThemeService } from '../../services/theme.service';
import { VisualizerService } from '../../services/visualizer.service';
import { loadPresets } from './visualizer-presets';

/** The preset changes on a beat, every 32 beats (≈ 16 s at 120 BPM), with a short cross-fade (s). */
const BEATS_PER_PRESET = 32;
const BLEND_TIME = 1.2;
/** Fallback for quiet tracks where no beat is detected (s). */
const PRESET_FALLBACK = 30;
/** Bass band kept by the low-pass filter before the beat detection: kick drum and bass (Hz). */
const BASS_MAX_HZ = 150;
/**
 * A beat is a bass energy (RMS²) clearly above its average over the last second, and not silence.
 * Linear energy, not the dB values of getByteFrequencyData: those saturate at 255 as soon as the
 * bass is loud, so a kick over a bass line would never stand out.
 */
const BEAT_THRESHOLD = 1.6;
const BEAT_MIN_RMS = 0.04;
/** Weight of the new value in the running average, at 50 Hz: about one second of memory. */
const AVERAGE_WEIGHT = 0.02;
/** At least 350 ms between two beats: fewer than 3 flashes per second (WCAG 2.3.1). */
const BEAT_COOLDOWN = 350;
/** How fast the pulse fades after a beat, per 1/60 s. */
const PULSE_DECAY = 0.86;
/**
 * The beat detector runs on its own 50 Hz timer, not on the drawing frames: when MilkDrop renders
 * slowly (old computer, phone), a frame-based detector would miss the short kicks.
 */
const DETECT_INTERVAL = 20;
/** Rendering below the screen resolution keeps the GPU cost low; the result is blurred anyway. */
const RENDER_SCALE = 0.6;
/** CSS custom properties of the palette, from the darkest to the brightest pixels. */
const PALETTE_TOKENS = ['--viz-0', '--viz-1', '--viz-2', '--viz-3', '--viz-4', '--viz-5'];

/**
 * Full-screen MilkDrop background (butterchurn, WebGL) that follows the rhythm of the track playing.
 * The original preset colors are replaced by the app palette with an SVG gradient map:
 * luminance of each pixel → color of the `--viz-*` gradient (light and dark theme).
 *
 * On top of MilkDrop's own reactions, a beat detector on the bass band drives two CSS variables:
 * `--viz-pulse` (1 on each beat, then fading) and `--viz-level` (current bass level). The CSS turns
 * them into a zoom / brightness punch and a gold glow on the screen edges, which cards never hide.
 */
@Component({
  selector: 'app-visualizer-background',
  host: { 'aria-hidden': 'true', '[class.visible]': 'visible()' },
  templateUrl: './visualizer-background.html',
  styleUrl: './visualizer-background.css',
})
export class VisualizerBackgroundComponent {
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  private readonly audio = inject(AudioContextService);
  private readonly settings = inject(VisualizerService);
  private readonly theme = inject(ThemeService);
  private readonly canvas = viewChild.required<ElementRef<HTMLCanvasElement>>('canvas');
  private readonly transfer = viewChild.required<ElementRef<SVGFEComponentTransferElement>>('transfer');

  private readonly ready = signal(false);
  private readonly pageVisible = signal(!document.hidden);
  /** Drawing only makes sense while it is on, loaded, the music plays and the tab is shown. */
  private readonly running = computed(
    () => this.settings.enabled() && this.ready() && this.audio.playingSource() !== null && this.pageVisible(),
  );
  readonly visible = computed(() => this.running());

  private visualizer: ButterchurnVisualizer | null = null;
  private presets: object[] = [];
  private presetIndex = 0;
  private connectedSource: AudioNode | null = null;
  private loading = false;
  private frame = 0;
  private detectTimer = 0;

  private bassFilter: BiquadFilterNode | null = null;
  private beatAnalyser: AnalyserNode | null = null;
  private samples = new Float32Array(0);
  /** Average bass energy over the last second: the reference a kick must clearly exceed. */
  private energyAverage = 0;
  private pulse = 0;
  private lastBeat = 0;
  private lastFrame = 0;
  private beatsSincePreset = 0;
  private lastPresetChange = 0;

  constructor() {
    const destroyRef = inject(DestroyRef);
    const onVisibility = () => this.pageVisible.set(!document.hidden);
    const onResize = () => this.resize();
    document.addEventListener('visibilitychange', onVisibility);
    window.addEventListener('resize', onResize);

    // Butterchurn and the presets are only downloaded the first time a track plays with the switch on.
    effect(() => {
      if (this.settings.enabled() && this.audio.playingSource() && !this.visualizer && !this.loading) {
        untracked(() => void this.init());
      }
    });

    // Listen to the track currently playing (the source changes when another card is played).
    effect(() => {
      const source = this.settings.enabled() && this.ready() ? this.audio.playingSource() : null;
      untracked(() => this.connect(source));
    });

    effect(() => {
      const running = this.running();
      untracked(() => (running ? this.start() : this.stop()));
    });

    // Lets the page background show the visualizer through (see `.viz-on` in styles.css).
    effect(() => document.documentElement.classList.toggle('viz-on', this.visible()));

    // The palette comes from CSS variables, so it follows the light / dark theme.
    afterRenderEffect(() => {
      this.theme.theme();
      this.applyPalette();
    });

    destroyRef.onDestroy(() => {
      this.stop();
      this.connect(null);
      document.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener('resize', onResize);
      document.documentElement.classList.remove('viz-on');
    });
  }

  private async init(): Promise<void> {
    this.loading = true;
    try {
      const [module, presets] = await Promise.all([import('butterchurn'), loadPresets()]);
      // The UMD bundle may come through as `default` or `default.default` depending on the interop.
      const exported = module.default as Butterchurn | { default: Butterchurn };
      const butterchurn = 'createVisualizer' in exported ? exported : exported.default;
      const { width, height } = this.renderSize();
      this.visualizer = butterchurn.createVisualizer(this.audio.get(), this.canvas().nativeElement, {
        width,
        height,
        pixelRatio: 1,
        textureRatio: 1,
      });
      // Own chain for the beat detection: low-pass (bass only) → analyser read as a waveform.
      const context = this.audio.get();
      this.bassFilter = new BiquadFilterNode(context, { type: 'lowpass', frequency: BASS_MAX_HZ });
      this.beatAnalyser = new AnalyserNode(context, { fftSize: 1024 });
      this.bassFilter.connect(this.beatAnalyser);
      this.samples = new Float32Array(this.beatAnalyser.fftSize);
      this.presets = presets;
      this.presetIndex = Math.floor(Math.random() * presets.length);
      this.visualizer.loadPreset(presets[this.presetIndex], 0);
      this.ready.set(true);
    } catch (error) {
      console.error('[Visualizer] Chargement impossible', error);
    } finally {
      this.loading = false;
    }
  }

  private connect(source: AudioNode | null): void {
    if (source === this.connectedSource || !this.visualizer || !this.bassFilter) return;
    if (this.connectedSource) {
      this.visualizer.disconnectAudio(this.connectedSource);
      this.connectedSource.disconnect(this.bassFilter);
    }
    if (source) {
      this.visualizer.connectAudio(source);
      source.connect(this.bassFilter);
    }
    this.connectedSource = source;
  }

  private start(): void {
    this.stop();
    this.resize();
    this.lastFrame = 0;
    this.lastPresetChange = performance.now();
    const render = () => {
      this.visualizer?.render();
      this.frame = requestAnimationFrame(render);
    };
    this.frame = requestAnimationFrame(render);
    this.detectTimer = window.setInterval(() => this.followRhythm(performance.now()), DETECT_INTERVAL);
  }

  private stop(): void {
    cancelAnimationFrame(this.frame);
    clearInterval(this.detectTimer);
    this.pulse = 0;
    this.setRhythmVariables(0, 0);
  }

  /** Beat detection on the bass energy, then CSS variables for the pulse (see the component CSS). */
  private followRhythm(now: number): void {
    if (!this.beatAnalyser) return;
    const elapsed = this.lastFrame ? now - this.lastFrame : DETECT_INTERVAL;
    this.lastFrame = now;

    // RMS of the last ~21 ms of bass (1024 samples at 48 kHz).
    this.beatAnalyser.getFloatTimeDomainData(this.samples);
    let sum = 0;
    for (const sample of this.samples) sum += sample * sample;
    const rms = Math.sqrt(sum / this.samples.length);
    const energy = rms * rms;

    // Decay first (scaled by the real elapsed time), so that a beat on this tick shows at full strength.
    this.pulse *= Math.pow(PULSE_DECAY, elapsed / (1000 / 60));

    const isBeat =
      energy > this.energyAverage * BEAT_THRESHOLD && rms > BEAT_MIN_RMS && now - this.lastBeat > BEAT_COOLDOWN;
    this.energyAverage += (energy - this.energyAverage) * AVERAGE_WEIGHT;
    if (isBeat) this.onBeat(now);
    if (now - this.lastPresetChange > PRESET_FALLBACK * 1000) this.nextPreset(now);

    // Bass level for a gentle "breathing" between beats, scaled so that a loud bass gets close to 1.
    this.setRhythmVariables(this.pulse, Math.min(1, rms * 3));
  }

  private onBeat(now: number): void {
    this.lastBeat = now;
    this.pulse = 1;
    this.beatsSincePreset++;
    if (this.beatsSincePreset >= BEATS_PER_PRESET) this.nextPreset(now);
  }

  /** Changing on a beat makes the transition land with the music. */
  private nextPreset(now: number): void {
    this.beatsSincePreset = 0;
    this.lastPresetChange = now;
    if (!this.visualizer || !this.presets.length) return;
    this.presetIndex = (this.presetIndex + 1) % this.presets.length;
    this.visualizer.loadPreset(this.presets[this.presetIndex], BLEND_TIME);
  }

  /** Written straight to the DOM on every tick: no change detection involved. */
  private setRhythmVariables(pulse: number, level: number): void {
    const style = this.host.nativeElement.style;
    style.setProperty('--viz-pulse', pulse.toFixed(3));
    style.setProperty('--viz-level', level.toFixed(3));
  }

  private resize(): void {
    const { width, height } = this.renderSize();
    const canvas = this.canvas().nativeElement;
    if (canvas.width === width && canvas.height === height) return;
    canvas.width = width;
    canvas.height = height;
    this.visualizer?.setRendererSize(width, height);
  }

  private renderSize(): { width: number; height: number } {
    return {
      width: Math.max(1, Math.round(window.innerWidth * RENDER_SCALE)),
      height: Math.max(1, Math.round(window.innerHeight * RENDER_SCALE)),
    };
  }

  /** Writes the `--viz-*` colors into the gradient map: one table of values per RGB channel. */
  private applyPalette(): void {
    const styles = getComputedStyle(document.documentElement);
    const colors = PALETTE_TOKENS.map((token) => toRgb(styles.getPropertyValue(token)));
    const channels = ['R', 'G', 'B'] as const;
    for (const [i, channel] of channels.entries()) {
      const func = this.transfer().nativeElement.querySelector(`feFunc${channel}`);
      func?.setAttribute('tableValues', colors.map((rgb) => (rgb[i] / 255).toFixed(3)).join(' '));
    }
  }
}

/** Any CSS color → [r, g, b] (0-255), normalized by a canvas context. */
function toRgb(color: string): [number, number, number] {
  const ctx = document.createElement('canvas').getContext('2d');
  if (!ctx) return [0, 0, 0];
  ctx.fillStyle = color.trim() || '#000';
  const hex = ctx.fillStyle.startsWith('#') ? ctx.fillStyle : '#000000';
  return [1, 3, 5].map((start) => parseInt(hex.slice(start, start + 2), 16)) as [number, number, number];
}
