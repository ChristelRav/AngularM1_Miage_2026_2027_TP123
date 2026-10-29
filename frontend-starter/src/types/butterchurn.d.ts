/** Minimal types for butterchurn (MilkDrop in WebGL), which ships without TypeScript declarations. */
declare module 'butterchurn' {
  export interface ButterchurnVisualizer {
    connectAudio(node: AudioNode): void;
    disconnectAudio(node: AudioNode): void;
    /** `blendTime` in seconds: cross-fade from the current preset. */
    loadPreset(preset: object, blendTime: number): void;
    setRendererSize(width: number, height: number): void;
    render(): void;
  }

  export interface ButterchurnOptions {
    width: number;
    height: number;
    pixelRatio?: number;
    textureRatio?: number;
  }

  export interface Butterchurn {
    createVisualizer(context: AudioContext, canvas: HTMLCanvasElement, options: ButterchurnOptions): ButterchurnVisualizer;
  }

  const butterchurn: Butterchurn;
  export default butterchurn;
}
