import axios from 'axios';
import WebSocket from 'ws';
import { EventEmitter } from 'events';
import https from 'https';

export interface Candle {
  id: number;
  from: number;
  at: number;
  to: number;
  open: number;
  close: number;
  min: number;
  max: number;
  volume: number;
}

export class BrokerService extends EventEmitter {
  private ws: WebSocket | null = null;
  private ssid: string | null = null;
  private isConnected = false;
  private messageId = 1;
  private activeSubscriptions = new Set<string>();
  private httpsAgent = new https.Agent({
    rejectUnauthorized: false
  });

  constructor(private baseUrl: string = 'bullex.com') {
    super();
  }

  async login(email: string, password: string, baseUrl?: string): Promise<string> {
    if (baseUrl) this.baseUrl = baseUrl;
    
    // Rotate User-Agents to avoid pattern detection
    const userAgents = [
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36',
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
      'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36'
    ];
    const userAgent = userAgents[Math.floor(Math.random() * userAgents.length)];

    try {
      // Step 1: Session Warmup
      console.log(`Warming up session for ${this.baseUrl}...`);
      let cookies: string[] = [];
      try {
        const warmup = await axios.get(`https://${this.baseUrl}/`, {
          headers: {
            'User-Agent': userAgent,
            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
            'Accept-Language': 'pt-BR,pt;q=0.9,en-US;q=0.8,en;q=0.7',
          },
          httpsAgent: this.httpsAgent,
          timeout: 10000
        });
        if (warmup.headers['set-cookie']) {
          cookies = warmup.headers['set-cookie'];
          console.log('Cookies acquired from warmup');
        }
      } catch (e: any) {
        console.log(`Warmup failed: ${e.message}. Proceeding...`);
      }

      let response;
      let lastError = null;
      const urls = this.baseUrl.includes('bullex') 
        ? [`https://${this.baseUrl}/api/v2/login`, `https://api.${this.baseUrl}/api/v2/login`, `https://auth.${this.baseUrl}/api/v2/login`]
        : [`https://auth.${this.baseUrl}/api/v2/login`, `https://api.${this.baseUrl}/api/v2/login`, `https://${this.baseUrl}/api/v2/login`];

      for (const url of urls) {
        try {
          console.log(`Attempting login at: ${url}`);
          const attemptTimeout = 12000; 
          
          response = await axios.post(url, {
            identifier: email,
            password: password,
            platform: 9 // Android platform ID
          }, {
            headers: {
              'Accept': 'application/json, text/plain, */*',
              'Accept-Language': 'pt-BR,pt;q=0.9,en-US;q=0.8,en;q=0.7',
              'Content-Type': 'application/json',
              'Origin': `https://${this.baseUrl}`,
              'Referer': `https://${this.baseUrl}/`,
              'User-Agent': userAgent,
              'X-Requested-With': 'XMLHttpRequest',
              'Cookie': cookies.join('; '),
              'Cache-Control': 'no-cache',
              'Pragma': 'no-cache',
              'Connection': 'keep-alive'
            },
            timeout: attemptTimeout,
            httpsAgent: this.httpsAgent
          });

          if (response.data && response.data.ssid) break;
        } catch (e: any) {
          lastError = e;
          console.log(`Login attempt failed at ${url}: ${e.message}`);
          if (e.response?.status === 401 || (e.response?.data?.message && !e.message.includes('timeout'))) break;
        }
      }

      if (!response || !response.data || !response.data.ssid) {
        if (lastError) throw lastError;
        throw new Error('Login failed: No SSID returned');
      }
      
      this.ssid = response.data.ssid;
      this.isConnected = true;
      return this.ssid;
    } catch (error: any) {
      const errorData = error.response?.data;
      const isTimeout = error.code === 'ECONNABORTED' || error.message.includes('timeout') || error.message.includes('ETIMEDOUT');
      
      console.error('Broker Login Error:', JSON.stringify(errorData || error.message));
      
      let errorMessage = 'Falha na autenticação com a corretora';
      if (isTimeout) {
        errorMessage = 'Tempo de conexão esgotado. Verifique se a corretora está acessível ou tente novamente.';
      } else if (errorData) {
        if (typeof errorData === 'string') errorMessage = errorData;
        else if (errorData.message) errorMessage = errorData.message;
        else if (errorData.errors && errorData.errors[0]?.title) errorMessage = errorData.errors[0].title;
      } else {
        errorMessage = error.message;
      }
      
      throw new Error(errorMessage);
    }
  }

  setSSID(ssid: string) {
    this.ssid = ssid;
    this.isConnected = true;
    console.log('SSID set manually.');
  }

  getSSID(): string | null {
    return this.ssid;
  }

  async connect(): Promise<void> {
    if (!this.ssid) throw new Error('Not logged in');
    if (this.isConnected && this.ws?.readyState === WebSocket.OPEN) return;

    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        if (this.ws) {
          this.ws.terminate();
          this.ws = null;
        }
        reject(new Error('Tempo esgotado ao conectar ao servidor da corretora (Timeout)'));
      }, 15000);

      try {
        console.log(`Connecting to WebSocket: wss://ws2.${this.baseUrl}/echo/websocket`);
        this.ws = new WebSocket(`wss://ws2.${this.baseUrl}/echo/websocket`, {
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Safari/537.36'
          },
          rejectUnauthorized: false
        });

        this.ws.on('open', () => {
          clearTimeout(timeout);
          this.isConnected = true;
          this.authenticate();
          console.log('WebSocket connected and authenticated');
          resolve();
        });

        this.ws.on('error', (err) => {
          console.error('WebSocket error:', err);
          clearTimeout(timeout);
          reject(err);
        });

        this.ws.on('message', (data: string) => {
          try {
            const message = JSON.parse(data.toString());
            this.handleMessage(message);
          } catch (e) {
            console.error('Failed to parse WS message:', e);
          }
        });

        this.ws.on('error', (error) => {
          clearTimeout(timeout);
          console.error('WebSocket Error:', error);
          this.isConnected = false;
          reject(new Error('Erro na conexão WebSocket com a corretora'));
        });

        this.ws.on('close', () => {
          clearTimeout(timeout);
          this.isConnected = false;
          this.emit('disconnected');
        });
      } catch (err: any) {
        clearTimeout(timeout);
        reject(err);
      }
    });
  }

  private authenticate() {
    this.send('ssid', this.ssid);
  }

  private send(name: string, msg: any) {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return;
    
    const payload = {
      name,
      msg,
      request_id: (this.messageId++).toString()
    };
    this.ws.send(JSON.stringify(payload));
  }

  subscribeCandles(activeId: number, size: number = 60) {
    const key = `${activeId}_${size}`;
    if (this.activeSubscriptions.has(key)) return;
    
    this.send('subscribeCandles', {
      active_id: activeId,
      size: size
    });
    this.activeSubscriptions.add(key);
  }

  private handleMessage(message: any) {
    if (message.name === 'candle') {
      this.emit('candle', message.msg);
    }
  }
  
  async getCandles(activeId: number, size: number, to: number, count: number): Promise<Candle[]> {
    if (!this.ssid) throw new Error('Not logged in');
    
    const response = await axios.get(`https://${this.baseUrl}/api/v2/candles`, {
      params: {
        active_id: activeId,
        size: size,
        to: to,
        count: count
      },
      headers: {
        'Cookie': `ssid=${this.ssid}`
      },
      httpsAgent: this.httpsAgent
    });
    
    return response.data;
  }
}

export const broker = new BrokerService();
