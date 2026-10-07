import { Pipe, PipeTransform } from '@angular/core';

const FORMAT_LABELS: Readonly<Record<string, string>> = {
  'audio/mpeg': 'MP3',
  'audio/wav': 'WAV',
  'audio/x-wav': 'WAV',
  'audio/ogg': 'OGG',
  'audio/mp4': 'M4A',
  'audio/x-m4a': 'M4A',
};

/** "audio/mpeg" → "MP3". */
@Pipe({ name: 'audioFormat' })
export class AudioFormatPipe implements PipeTransform {
  transform(mimeType: string): string {
    return FORMAT_LABELS[mimeType] ?? mimeType.replace('audio/', '').toUpperCase();
  }
}

/** Size in bytes (as returned by the API) → "3,4 Mo". */
@Pipe({ name: 'fileSize' })
export class FileSizePipe implements PipeTransform {
  transform(bytes: number): string {
    if (bytes < 1024) return `${bytes} o`;
    if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} Ko`;
    return `${(bytes / (1024 * 1024)).toFixed(1).replace('.', ',')} Mo`;
  }
}

/** ISO date → "7 oct. 2026". */
@Pipe({ name: 'shortDate' })
export class ShortDatePipe implements PipeTransform {
  transform(iso: string): string {
    return new Date(iso).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric' });
  }
}
