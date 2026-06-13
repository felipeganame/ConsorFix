import type { ITranscriber } from './ports.js';

/**
 * OpenAI Whisper transcription adapter.
 * Usa multipart/form-data con un Blob y nombre de archivo .ogg/.m4a.
 */
export class OpenAITranscriber implements ITranscriber {
  constructor(
    private readonly apiKey: string,
    private readonly model: string = process.env.AI_TRANSCRIBER_MODEL ?? 'whisper-1',
    private readonly baseUrl: string = process.env.OPENAI_BASE_URL ?? 'https://api.openai.com/v1',
  ) {
    if (!apiKey) throw new Error('OPENAI_API_KEY required for OpenAITranscriber');
  }

  async transcribe(audio: ArrayBuffer, opts: { language?: string }) {
    const form = new FormData();
    form.append('model', this.model);
    if (opts.language) form.append('language', opts.language);
    const blob = new Blob([audio], { type: 'audio/ogg' });
    form.append('file', blob, 'audio.ogg');

    const res = await fetch(`${this.baseUrl}/audio/transcriptions`, {
      method: 'POST',
      headers: { authorization: `Bearer ${this.apiKey}` },
      body: form,
    });
    if (!res.ok) {
      throw new Error(`whisper transcribe failed: ${res.status} ${await res.text()}`);
    }
    const json = (await res.json()) as { text?: string };
    return { text: json.text ?? '', modelVersion: this.model };
  }
}
