import express from 'express';
import dotenv from 'dotenv';
import { webhookRouter } from './whatsapp/webhook.js';
import { cronRouter } from './routes/cron.js';

dotenv.config();

const app = express();

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

app.get('/health', (req, res) => res.send('ok'));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`DevPulse listening on port ${PORT}`);
});