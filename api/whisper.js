export const config = { maxDuration: 30 };

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    // req.body is a Buffer (raw audio bytes) sent as application/octet-stream
    // with the filename passed via query param: ?filename=audio.webm
    const filename = req.query.filename || 'audio.webm';
    const audioBuffer = await getRawBody(req);

    const formData = new FormData();
    formData.append('file', new Blob([audioBuffer]), filename);
    formData.append('model', 'whisper-1');
    // Language hint improves speed & accuracy - pass via query e.g. ?lang=en
    if (req.query.lang) formData.append('language', req.query.lang);

    const response = await fetch('https://api.openai.com/v1/audio/transcriptions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${process.env.OPENAI_API_KEY}`
      },
      body: formData
    });

    const data = await response.json();

    if (!response.ok) {
      console.error('Whisper error:', data);
      return res.status(response.status).json({ error: data });
    }

    return res.status(200).json({ text: data.text });

  } catch (error) {
    console.error('Whisper handler error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
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
