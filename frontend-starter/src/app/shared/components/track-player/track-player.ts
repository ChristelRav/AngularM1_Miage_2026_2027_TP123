import {
  afterNextRender,
  afterRenderEffect,
  Component,
  computed,
  DestroyRef,
  effect,
  ElementRef,
  inject,
  input,
  signal,
  viewChild,
} from '@angular/core';
import { AudioContextService } from '../../services/audio-context.service';
import { ThemeService } from '../../services/theme.service';
import { IconComponent } from '../icon/icon';

/** Number of bars of the waveform, whatever the track length. */
const WAVEFORM_BARS = 96;
const SPECTRUM_BARS = 16;
/** Seconds moved by the arrow keys on the waveform. */
const SEEK_STEP = 5;

/**
 * Audio player drawn with the Web Audio API:
 * - waveform of the whole track (decodeAudioData), clickable to seek, played part highlighted;
 * - live frequency spectrum (AnalyserNode) while the track plays.
 * The <audio> element stays the source (play, pause, position) and is routed through the audio graph:
 * MediaElementSource → Analyser → destination.
 */
@Component({
  selector: 'app-track-player',
  imports: [IconComponent],
  templateUrl: './track-player.html',
  styleUrl: './track-player.css',
})
export class TrackPlayerComponent {
  /** ObjectURL of the downloaded audio Blob. */
  readonly src = input.required<string>();
  /** Track title, used in the accessible labels. */
  readonly label = input.required<string>();

  private readonly audioContext = inject(AudioContextService);
  private readonly destroyRef = inject(DestroyRef);
  private readonly theme = inject(ThemeService);
  private readonly audio = viewChild.required<ElementRef<HTMLAudioElement>>('audio');
  private readonly waveform = viewChild.required<ElementRef<HTMLCanvasElement>>('waveform');
  private readonly spectrum = viewChild.required<ElementRef<HTMLCanvasElement>>('spectrum');

  readonly playing = signal(false);
  readonly currentTime = signal(0);
  readonly duration = signal(0);
  /** Waveform bar heights between 0 and 1, empty until the track is decoded. */
  readonly peaks = signal<readonly number[]>([]);
  readonly elapsedLabel = computed(() => formatTime(this.currentTime()));
  readonly durationLabel = computed(() => formatTime(this.duration()));
  /** Mouse position over the waveform, between 0 and 1, or null outside of it. */
  readonly hover = signal<number | null>(null);
  /** Bubble shown above the cursor with the time the click would jump to. */
  readonly hoverTip = computed(() => {
    const hover = this.hover();
    const duration = this.duration();
    return hover === null || !duration ? null : { left: hover * 100, label: formatTime(hover * duration) };
  });
  /** Canvas width in CSS pixels, so that a resize redraws the waveform. */
  private readonly width = signal(0);

  private analyser: AnalyserNode | null = null;
  private source: MediaElementAudioSourceNode | null = null;
  private frequencies = new Uint8Array(0);
  private frame = 0;
  private decodeVersion = 0;

  constructor() {
    effect(() => void this.decode(this.src()));

    afterNextRender(() => {
      const context = this.audioContext.get();
      this.source = context.createMediaElementSource(this.audio().nativeElement);
      this.analyser = context.createAnalyser();
      this.analyser.fftSize = 256;
      this.analyser.smoothingTimeConstant = 0.8;
      this.frequencies = new Uint8Array(this.analyser.frequencyBinCount);
      this.source.connect(this.analyser).connect(context.destination);

      const canvas = this.waveform().nativeElement;
      const observer = new ResizeObserver(() => this.width.set(canvas.clientWidth));
      observer.observe(canvas);
      this.destroyRef.onDestroy(() => observer.disconnect());
    });

    // Redraw on progress, decode, resize, and theme change (colors come from CSS variables).
    afterRenderEffect(() => {
      this.theme.theme();
      this.width();
      const progress = this.duration() ? this.currentTime() / this.duration() : 0;
      drawWaveform(this.waveform().nativeElement, this.peaks(), progress, this.hover());
      if (!this.playing()) this.drawSpectrum(true);
    });

    this.destroyRef.onDestroy(() => {
      this.releasePlayingSource();
      cancelAnimationFrame(this.frame);
      this.decodeVersion++;
      this.source?.disconnect();
      this.analyser?.disconnect();
    });
  }

  toggle(): void {
    const audio = this.audio().nativeElement;
    this.audioContext.unlock();
    if (audio.paused) {
      audio.play().catch((error: unknown) => console.error('[TrackPlayer] Lecture impossible', error));
    } else {
      audio.pause();
    }
  }

  onPlay(): void {
    this.playing.set(true);
    if (this.source) this.audioContext.playingSource.set(this.source);
    cancelAnimationFrame(this.frame);
    this.frame = requestAnimationFrame(this.tick);
  }

  onPause(): void {
    this.playing.set(false);
    this.releasePlayingSource();
    cancelAnimationFrame(this.frame);
  }

  onLoadedMetadata(): void {
    this.duration.set(this.audio().nativeElement.duration);
  }

  /** Keeps the position right when seeking while paused (no animation frame then). */
  onTimeUpdate(): void {
    this.currentTime.set(this.audio().nativeElement.currentTime);
  }

  seekFromPointer(event: PointerEvent): void {
    this.seek(this.pointerPosition(event) * this.duration());
  }

  /** Hover preview for the mouse only: a touch has no hover and seeks directly. */
  onPointerMove(event: PointerEvent): void {
    if (event.pointerType === 'mouse') this.hover.set(this.pointerPosition(event));
  }

  onPointerLeave(): void {
    this.hover.set(null);
  }

  seekFromKeyboard(event: KeyboardEvent): void {
    const time = this.currentTime();
    const targets: Readonly<Record<string, number>> = {
      ArrowRight: time + SEEK_STEP,
      ArrowUp: time + SEEK_STEP,
      ArrowLeft: time - SEEK_STEP,
      ArrowDown: time - SEEK_STEP,
      Home: 0,
      End: this.duration(),
    };
    if (!(event.key in targets)) return;
    event.preventDefault();
    this.seek(targets[event.key]);
  }

  private pointerPosition(event: PointerEvent): number {
    const rect = this.waveform().nativeElement.getBoundingClientRect();
    return Math.min(Math.max((event.clientX - rect.left) / rect.width, 0), 1);
  }

  /** Only clears the shared source if it is still ours (another player may have started meanwhile). */
  private releasePlayingSource(): void {
    if (this.source && this.audioContext.playingSource() === this.source) this.audioContext.playingSource.set(null);
  }

  private seek(time: number): void {
    const audio = this.audio().nativeElement;
    if (!this.duration()) return;
    audio.currentTime = Math.min(Math.max(time, 0), this.duration());
    this.currentTime.set(audio.currentTime);
  }

  /** One animation frame while playing: smooth progress on the waveform and live spectrum. */
  private readonly tick = (): void => {
    this.currentTime.set(this.audio().nativeElement.currentTime);
    this.drawSpectrum(false);
    this.frame = requestAnimationFrame(this.tick);
  };

  private drawSpectrum(idle: boolean): void {
    const canvas = this.spectrum().nativeElement;
    const ctx = prepareCanvas(canvas);
    if (!ctx) return;
    if (!idle && this.analyser) this.analyser.getByteFrequencyData(this.frequencies);

    const { width, height } = canvas;
    const styles = getComputedStyle(canvas);
    const gradient = ctx.createLinearGradient(0, height, 0, 0);
    gradient.addColorStop(0, styles.getPropertyValue('--primary-fg'));
    gradient.addColorStop(1, styles.getPropertyValue('--accent'));
    ctx.fillStyle = gradient;

    // The highest bins carry little musical energy: only the lower 3/4 are shown.
    const usable = Math.floor(this.frequencies.length * 0.75);
    const binsPerBar = Math.max(1, Math.floor(usable / SPECTRUM_BARS));
    const step = width / SPECTRUM_BARS;
    for (let bar = 0; bar < SPECTRUM_BARS; bar++) {
      let sum = 0;
      for (let bin = bar * binsPerBar; bin < (bar + 1) * binsPerBar; bin++) sum += this.frequencies[bin] ?? 0;
      const level = idle ? 0 : sum / binsPerBar / 255;
      const barHeight = Math.max(2 * devicePixelRatio, level * height);
      ctx.fillRect(bar * step, height - barHeight, step * 0.65, barHeight);
    }
  }

  private async decode(src: string): Promise<void> {
    const version = ++this.decodeVersion;
    this.peaks.set([]);
    try {
      const data = await (await fetch(src)).arrayBuffer();
      const buffer = await this.audioContext.get().decodeAudioData(data);
      // Ignore a decode that finished after the track changed or the player was destroyed.
      if (version === this.decodeVersion) this.peaks.set(computePeaks(buffer, WAVEFORM_BARS));
    } catch (error) {
      console.error('[TrackPlayer] Forme d’onde indisponible', error);
    }
  }
}

/** Loudest sample of each slice of the track, normalized so that the loudest bar is 1. */
function computePeaks(buffer: AudioBuffer, bars: number): number[] {
  const channels = Array.from({ length: buffer.numberOfChannels }, (_, i) => buffer.getChannelData(i));
  const sliceLength = Math.floor(buffer.length / bars);
  // Reading every sample of a long track is slow: ~2000 samples per slice are enough for a drawing.
  const stride = Math.max(1, Math.floor(sliceLength / 2000));
  const peaks: number[] = [];
  for (let bar = 0; bar < bars; bar++) {
    let max = 0;
    for (let i = bar * sliceLength; i < (bar + 1) * sliceLength; i += stride) {
      for (const channel of channels) max = Math.max(max, Math.abs(channel[i]));
    }
    peaks.push(max);
  }
  const loudest = Math.max(...peaks) || 1;
  return peaks.map((peak) => peak / loudest);
}

/**
 * SoundCloud-like mirrored waveform: bars stand on a baseline at 70 % of the height and the
 * remaining 30 % shows their faded reflection. Played bars use a vertical gradient; while hovering,
 * the bars between the playhead and the cursor are half-transparent to preview the jump.
 */
function drawWaveform(
  canvas: HTMLCanvasElement,
  peaks: readonly number[],
  progress: number,
  hover: number | null,
): void {
  const ctx = prepareCanvas(canvas);
  if (!ctx) return;
  const { width, height } = canvas;
  const styles = getComputedStyle(canvas);
  const baseline = Math.round(height * 0.7);
  const gap = Math.max(1, Math.round(devicePixelRatio));
  const minHeight = 2 * devicePixelRatio;

  const playedTop = ctx.createLinearGradient(0, baseline, 0, 0);
  const playedReflection = ctx.createLinearGradient(0, baseline, 0, height);
  // Plain color on the lower 60 %: only the tips of loud bars turn gold (a full blend looks muddy).
  for (const gradient of [playedTop, playedReflection]) {
    gradient.addColorStop(0, styles.getPropertyValue('--wave-played'));
    gradient.addColorStop(0.6, styles.getPropertyValue('--wave-played'));
    gradient.addColorStop(1, styles.getPropertyValue('--wave-played-tip'));
  }
  const rest = styles.getPropertyValue('--wave-rest');

  const solidEnd = Math.min(progress, hover ?? progress);
  const previewEnd = Math.max(progress, hover ?? progress);
  // Flat line while the track is being decoded.
  const bars = peaks.length ? peaks : Array<number>(WAVEFORM_BARS).fill(0);
  const step = width / bars.length;
  const barWidth = Math.max(1, step * 0.6);
  bars.forEach((peak, i) => {
    const position = (i + 0.5) / bars.length;
    const highlighted = position <= previewEnd;
    const opacity = position <= solidEnd ? 1 : highlighted ? 0.5 : 1;
    const top = Math.max(minHeight, peak * (baseline - gap));
    const reflection = Math.max(minHeight / 2, peak * (height - baseline - gap));

    ctx.globalAlpha = opacity;
    ctx.fillStyle = highlighted ? playedTop : rest;
    ctx.fillRect(i * step, baseline - top, barWidth, top);
    ctx.globalAlpha = opacity * 0.35;
    ctx.fillStyle = highlighted ? playedReflection : rest;
    ctx.fillRect(i * step, baseline + gap, barWidth, reflection);
  });

  if (hover !== null) {
    ctx.globalAlpha = 0.6;
    ctx.fillStyle = styles.getPropertyValue('--text');
    ctx.fillRect(Math.round(hover * width), 0, gap, baseline);
  }
  ctx.globalAlpha = 1;
}

/** Matches the canvas resolution to its displayed size (sharp on HiDPI screens) and clears it. */
function prepareCanvas(canvas: HTMLCanvasElement): CanvasRenderingContext2D | null {
  const width = Math.round(canvas.clientWidth * devicePixelRatio);
  const height = Math.round(canvas.clientHeight * devicePixelRatio);
  if (canvas.width !== width) canvas.width = width;
  if (canvas.height !== height) canvas.height = height;
  const ctx = canvas.getContext('2d');
  ctx?.clearRect(0, 0, width, height);
  return ctx;
}

/** 83.4 → "1:23". */
function formatTime(seconds: number): string {
  if (!Number.isFinite(seconds)) return '0:00';
  const whole = Math.floor(seconds);
  return `${Math.floor(whole / 60)}:${String(whole % 60).padStart(2, '0')}`;
}
