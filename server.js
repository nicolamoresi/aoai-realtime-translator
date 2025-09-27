// server.js
// Web server Express per GPT Realtime WebRTC
// Espone /session per creare sessioni effimere e serve i file statici da /public

import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import fetch from 'node-fetch';

const {
  AOAI_ENDPOINT,
  AOAI_KEY,
  AOAI_DEPLOYMENT,
  AOAI_API_VERSION = '2025-04-01-preview',
  PORT = process.env.PORT || 8080
} = process.env;

if (!AOAI_ENDPOINT || !AOAI_KEY || !AOAI_DEPLOYMENT) {
  console.warn('[WARN] AOAI env vars not set. Check App Settings in Azure.');
}

const app = express();
app.use(express.json());

// Serve i file statici da /public
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
app.use(express.static(path.join(__dirname, 'public')));

// Endpoint GET /session per creare sessione GPT Realtime
app.get('/session', async (req, res) => {
  try {
    const targetLang = (req.query.targetLang || 'it-IT').toString();
    const voice = (req.query.voice || '').toString();
    const sourceLang = (req.query.sourceLang || 'auto').toString();

    const instructions = [
      `Sei un interprete simultaneo.`,
      `Trascrivi e traduci in tempo reale tutto ciò che ascolti in "${targetLang}".`,
      `Rispondi solo con il testo tradotto.`,
      `Se è impostata una voce, emetti anche audio sintetizzato.`
    ].join(' ');

    const sessionsUrl = new URL(`/openai/realtime/sessions?api-version=${AOAI_API_VERSION}`, AOAI_ENDPOINT).toString();

    const body = {
      model: AOAI_DEPLOYMENT,
      modalities: voice ? ['text', 'audio'] : ['text'],
      voice: voice || undefined,
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
      headers: {
        'Content-Type': 'application/json',
        'api-key': AOAI_KEY
      },
      body: JSON.stringify(body)
    });

    if (!resp.ok) {
      const text = await resp.text();
      return res.status(resp.status).json({ error: 'Realtime session creation failed', details: text });
    }

    const json = await resp.json();
    const realtimeUrl = `${AOAI_ENDPOINT}/openai/realtime?api-version=${AOAI_API_VERSION}&deployment=${AOAI_DEPLOYMENT}`;

    return res.json({ ...json, realtimeUrl, targetLang, voice });
  } catch (e) {
    console.error('[ERROR] /session failed:', e);
    res.status(500).json({ error: String(e) });
  }
});

// Avvia il server
app.listen(PORT, () => {
  console.log(`✅ Server avviato su http://localhost:${PORT}`);
});
