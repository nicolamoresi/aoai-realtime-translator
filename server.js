// server.js - Express + endpoint /session per GPT Realtime (WebRTC)
import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';

// Env (impostate dallo script postprovision)
const {
  AOAI_ENDPOINT,
  AOAI_KEY,
  AOAI_DEPLOYMENT,
  AOAI_API_VERSION = '2025-04-01-preview',
  PORT = 8080
} = process.env;

if (!AOAI_ENDPOINT || !AOAI_KEY || !AOAI_DEPLOYMENT) {
  console.warn('[WARN] AOAI env vars not set yet. Postprovision will configure them.');
}

const app = express();
app.use(express.json());

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Static web
app.use(express.static(path.join(__dirname, 'public')));

/**
 * GET /session
 * Crea una sessione effimera Realtime e ritorna { client_secret, realtimeUrl }.
 * Query param:
 *   targetLang (es. "it-IT"), voice (es. "marin"|"cedar"|"")
 */
app.get('/session', async (req, res) => {
  try {
    const targetLang = (req.query.targetLang || 'it-IT').toString();
    const voice = (req.query.voice || '').toString(); // "" => solo testo
    const sourceLang = (req.query.sourceLang || 'auto').toString();

    if (!AOAI_ENDPOINT || !AOAI_KEY || !AOAI_DEPLOYMENT) {
      return res.status(500).json({ error: 'Azure OpenAI not configured yet' });
    }

    // Istruzioni per interprete simultaneo (traduci in targetLang)
    const instructions =
      `Sei un interprete simultaneo. Trascrivi e TRADUCI in tempo reale in "${targetLang}". ` +
      `Rispondi SOLO con il testo tradotto. Se è impostata una voce, emetti anche audio sintetizzato.`;

    // Crea sessione effimera
    const sessionsUrl = new URL(`/openai/realtime/sessions?api-version=${AOAI_API_VERSION}`, AOAI_ENDPOINT).toString();
    const body = {
      model: AOAI_DEPLOYMENT,                 // su Azure va il deployment name
      modalities: voice ? ['text', 'audio'] : ['text'],
      voice: voice || undefined,              // es. 'marin'|'cedar'
      instructions,
      input_audio_format: 'pcm16',
      input_audio_transcription: { model: 'whisper-1', language: sourceLang },
      turn_detection: {
        type: 'server_vad',
        threshold: 0.5,
        prefix_padding_ms: 300,
        silence_duration_ms: 200,
        create_response: true
      },
      temperature: 0.2
    };

    const resp = await fetch(sessionsUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'api-key': AOAI_KEY },
      body: JSON.stringify(body)
    });

    if (!resp.ok) {
      const text = await resp.text();
      return res.status(resp.status).json({ error: 'Realtime session create failed', details: text });
    }

    const json = await resp.json();

    // Costruisci l'endpoint WebRTC di Azure OpenAI per l'exchange SDP
    const realtimeUrl = `${AOAI_ENDPOINT}/openai/realtime?api-version=${AOAI_API_VERSION}&deployment=${AOAI_DEPLOYMENT}`;

    return res.json({ ...json, realtimeUrl, targetLang, voice });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: String(e) });
  }
});

app.listen(PORT, () => {
  console.log(`Web app up on http://localhost:${PORT}`);
});
