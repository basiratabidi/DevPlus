import express from 'express';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import { createProxyMiddleware } from 'http-proxy-middleware';
import { webhookRouter } from './services/whatsapp/webhook.js';
import { cronRouter } from './routes/cron.js';
import { logsRouter } from './routes/logs.js';

dotenv.config();

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();

// Reverse-proxies OpenSearch Dashboards through the backend's own port,
// so it's reachable via the same single ngrok tunnel the backend
// already uses - free ngrok accounts only allow one simultaneous
// tunnel, and this avoids needing a second one. Must be registered
// before express.json() below: the proxy needs the untouched request
// stream, and a body-parser consuming it first would break OSD's own
// POST/PUT calls (saving visualizations, etc).
app.use(
  '/opensearch-dashboards',
  createProxyMiddleware({
    target: process.env.OPENSEARCH_DASHBOARDS_URL || 'http://localhost:5601',
    changeOrigin: true,
    ws: true,
  })
);

// Capture raw body alongside parsed JSON - needed for Meta's
// x-hub-signature-256 verification in webhook.js.
app.use(
  express.json({
    verify: (req, res, buf) => {
      req.rawBody = buf;
    },
  })
);

app.use(webhookRouter);
app.use(cronRouter);
app.use(logsRouter);
app.use('/dashboard', express.static(path.join(__dirname, '../public')));

app.get('/health', (req, res) => res.send('ok'));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`DevPulse listening on port ${PORT}`);
});