import OpenAI, { toFile } from "openai";
import axios from "axios";

class TranscriptionService {
  private client: OpenAI;
  private readonly audioPrefix = "https://livetiming.formula1.com/static/";
  private backoffMs: number = 3000;
  private queue: Array<{
    call: () => Promise<any>;
    resolve: (v: any) => void;
    reject: (e: any) => void;
  }> = [];
  private isBackoff = false;
  private workerRunning = false;
  private backoffTimer?: NodeJS.Timeout;
  private backoffPromise: Promise<void> | null = null;

  constructor(apiKey?: string) {
    const key = apiKey ?? process.env.OPENAI_API_KEY;
    if (!key)
      throw new Error("OpenAI API key not provided (OPENAI_API_KEY)");
    this.client = new OpenAI({ apiKey: key });
  }

  private enqueueApiCall<T>(call: () => Promise<T>): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      this.queue.push({ call, resolve, reject });
      this.startWorker();
    });
  }

  private async startWorker(): Promise<void> {
    if (this.workerRunning) return;
    this.workerRunning = true;
    try {
      while (this.queue.length) {
        // wait while backoff active
        if (this.isBackoff) {
          if (!this.backoffPromise) {
            this.backoffPromise = new Promise((res) => {
              this.backoffTimer = setTimeout(() => {
                this.isBackoff = false;
                this.backoffPromise = null;
                res();
              }, this.backoffMs);
            });
          }
          await this.backoffPromise;
        }

        const task = this.queue.shift()!;
        try {
          const result = await task.call();
          task.resolve(result);
        } catch (err) {
          task.reject(err);
        }

        // activate backoff after each request
        this.isBackoff = true;
        // ensure next loop will wait on backoffPromise
        this.backoffPromise = new Promise((res) => {
          if (this.backoffTimer) clearTimeout(this.backoffTimer);
          this.backoffTimer = setTimeout(() => {
            this.isBackoff = false;
            this.backoffPromise = null;
            res();
          }, this.backoffMs);
        });
      }
    } finally {
      this.workerRunning = false;
    }
  }

  async transcribe(audioPath: string): Promise<string> {
    return this.enqueueApiCall(async () => {
      try {
        const url = this.audioPrefix + audioPath;

        // Download audio file as buffer
        const response = await axios.get(url, { responseType: "arraybuffer" });
        const audioBuffer = Buffer.from(response.data);

        // Create a file object compatible with OpenAI API in Node.js
        const file = await toFile(audioBuffer, "audio.mp3", {
          type: "audio/mpeg",
        });

        // Use OpenAI Whisper for transcription
        const transcription = await this.client.audio.transcriptions.create({
          file: file,
          model: "whisper-1",
        });

        return transcription.text ?? "";
      } catch (err) {
        console.error("Transcription error:", err);
        throw err;
      }
    });
  }
}

export { TranscriptionService };
