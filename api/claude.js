export const config = { maxDuration: 30 };
 
export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }
 
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
 
  const { system, message, messages } = req.body;
 
  // Support both single message and messages array (for conversation memory)
  const msgs = messages || [{ role: 'user', content: message }];
 
  if (!msgs || msgs.length === 0) {
    return res.status(400).json({ error: 'Message required' });
  }
 
  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': process.env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 1000,
        system: system || 'You are a helpful assistant.',
        messages: msgs
      })
    });
 
    const data = await response.json();
 
    if (!response.ok) {
      return res.status(response.status).json({ error: data });
    }
 
    return res.status(200).json({
      text: data.content[0].text
    });
 
  } catch (error) {
    console.error('Claude API error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
}
 
