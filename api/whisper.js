export const config = { maxDuration: 30 };

export default async function handler(req, res) {
  const reqId = Date.now().toString(36); // short ID to correlate logs per request
  console.log(`[whisper:${reqId}] ${req.method} /api/whisper query=${JSON.stringify(req.query)}`);

  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') {
    console.warn(`[whisper:${reqId}] rejected — method not allowed: ${req.method}`);
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // Guard: API key must be configured
  if (!process.env.OPENAI_API_KEY) {
    console.error(`[whisper:${reqId}] OPENAI_API_KEY is not set`);
    return res.status(500).json({ error: 'Server misconfiguration: missing OPENAI_API_KEY' });
  }

  const filename = req.query.filename || 'audio.webm';
  const lang = req.query.lang || null;

  // ── Read body ──
  let audioBuffer;
  try {
    audioBuffer = await getRawBody(req);
    console.log(`[whisper:${reqId}] body received — ${audioBuffer.byteLength} bytes, filename=${filename}, lang=${lang}`);
  } catch (err) {
    console.error(`[whisper:${reqId}] failed to read request body:`, err.message);
    return res.status(400).json({ error: 'Failed to read audio data', detail: err.message });
  }

  if (audioBuffer.byteLength < 1000) {
    console.warn(`[whisper:${reqId}] audio too short (${audioBuffer.byteLength} bytes) — rejecting`);
    return res.status(400).json({ error: 'Audio too short', bytes: audioBuffer.byteLength });
  }

  // ── Build FormData ──
  const formData = new FormData();
  formData.append('file', new Blob([audioBuffer]), filename);
  formData.append('model', 'whisper-1');
  if (lang) formData.append('language', lang);

  // ── Call OpenAI ──
  let openaiRes;
  try {
    console.log(`[whisper:${reqId}] calling OpenAI whisper-1...`);
    openaiRes = await fetch('https://api.openai.com/v1/audio/transcriptions', {
      method: 'POST',
      headers: { Authorization: `Bearer ${process.env.OPENAI_API_KEY}` },
      body: formData
    });
  } catch (err) {
    console.error(`[whisper:${reqId}] network error reaching OpenAI:`, err.message);
    return res.status(502).json({ error: 'Failed to reach OpenAI', detail: err.message });
  }

  // ── Parse response ──
  let data;
  try {
    data = await openaiRes.json();
  } catch (err) {
    console.error(`[whisper:${reqId}] failed to parse OpenAI response (status ${openaiRes.status}):`, err.message);
    return res.status(502).json({ error: 'Invalid response from OpenAI', detail: err.message });
  }

  if (!openaiRes.ok) {
    console.error(`[whisper:${reqId}] OpenAI error ${openaiRes.status}:`, JSON.stringify(data));
    return res.status(openaiRes.status).json({
      error: data?.error?.message || 'OpenAI transcription failed',
      code: data?.error?.code || null,
      openai_status: openaiRes.status
    });
  }

  if (!data.text) {
    console.warn(`[whisper:${reqId}] OpenAI returned OK but no text field:`, JSON.stringify(data));
    return res.status(502).json({ error: 'Empty transcription returned by OpenAI' });
  }

  console.log(`[whisper:${reqId}] success — transcript length=${data.text.length} chars`);
  return res.status(200).json({ text: data.text });
}

// Read raw request body as Buffer (Vercel disables bodyParser for binary data)
function getRawBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on('data', chunk => chunks.push(chunk));
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}
