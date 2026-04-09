import express from "express";
import { createServer as createViteServer } from "vite";
import path from "path";
import YahooFinance from 'yahoo-finance2';
import { broker } from './broker';

const yahooFinance = new (YahooFinance as any)();

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json());

  // Broker Endpoints
  app.post("/api/broker/login", async (req, res) => {
    try {
      const { email, password, baseUrl } = req.body;
      const ssid = await broker.login(email, password, baseUrl);
      await broker.connect();
      res.json({ success: true, ssid });
    } catch (error: any) {
      res.status(401).json({ error: error.message });
    }
  });

  app.post("/api/broker/ssid", async (req, res) => {
    try {
      const { ssid } = req.body;
      broker.setSSID(ssid);
      await broker.connect();
      res.json({ success: true });
    } catch (error: any) {
      res.status(401).json({ error: error.message });
    }
  });

  app.get("/api/broker/candles/:activeId", async (req, res) => {
    try {
      const { activeId } = req.params;
      const { size = 60, count = 100 } = req.query;
      console.log(`DEBUG SERVER: Fetching candles for ${activeId}, size ${size}, count ${count}`);
      const candles = await broker.getCandles(Number(activeId), Number(size), Math.floor(Date.now() / 1000), Number(count));
      console.log(`DEBUG SERVER: Candles fetched successfully`);
      res.json(candles);
    } catch (error: any) {
      console.error(`DEBUG SERVER: Error fetching candles:`, error.message);
      res.status(500).json({ error: error.message });
    }
  });

  // Real-time Candles via SSE
  app.get("/api/broker/stream", (req, res) => {
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');

    const onCandle = (candle: any) => {
      res.write(`data: ${JSON.stringify(candle)}\n\n`);
    };

    broker.on('candle', onCandle);

    req.on('close', () => {
      broker.removeListener('candle', onCandle);
    });
  });

  // API Routes
  app.get("/api/quote/:symbol", async (req, res) => {
    try {
      const { symbol } = req.params;
      const result = await yahooFinance.quote(symbol);
      res.json(result);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch quote" });
    }
  });

  app.get("/api/history/:symbol", async (req, res) => {
    try {
      const { symbol } = req.params;
      const { interval = '1d', range = '1mo' } = req.query;
      
      // Map range/interval to yahoo-finance2 format if needed
      const result = await yahooFinance.chart(symbol, {
        period1: Math.floor(Date.now() / 1000) - (30 * 24 * 60 * 60), // 30 days ago
        interval: interval as any,
      });
      res.json(result);
    } catch (error) {
      console.error(error);
      res.status(500).json({ error: "Failed to fetch history" });
    }
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
