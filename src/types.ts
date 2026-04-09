export interface CandleData {
  time: string | number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume?: number;
}

export interface FootprintLevel {
  price: number;
  bidVolume: number;
  askVolume: number;
  totalVolume: number;
}

export interface FootprintCandle extends CandleData {
  levels: FootprintLevel[];
  poc?: number; // Point of Control
}

export interface AISignal {
  type: 'COMPRA' | 'VENDA' | 'CALL' | 'PUT' | 'AGUARDAR' | 'SEM ENTRADA SEGURA';
  entry?: number;
  tp?: number;
  sl?: number;
  bias: 'Bullish' | 'Bearish' | 'Neutral';
  confidence: number; // 0-100
  marketPhase: string; // e.g., 'Accumulation', 'Trend', 'Distribution'
  confluenceScore: number; // 0-6 (one for each strategy block)
  reasoning: string;
  structures: {
    lta_ltb?: string;
    trend?: string;
    fvg?: string[];
    patterns?: string;
    confluences?: string[];
    strategyBreakdown?: {
      name: string;
      status: 'CONFIRMADO' | 'AGUARDAR' | 'NEGATIVO';
      detail: string;
    }[];
    indicators?: {
      rsi?: string;
      macd?: string;
      volume?: string;
    };
    footprint?: {
      price: number;
      bid: number;
      ask: number;
      totalVolume?: number;
      delta?: number;
    }[];
  };
  confirmation?: string;
}

export interface Trade {
  id: string;
  symbol: string;
  type: 'COMPRA' | 'VENDA';
  entryPrice: number;
  exitPrice?: number;
  status: 'Aberto' | 'Fechado';
  pnl?: number;
  timestamp: number;
}
