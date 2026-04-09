import React, { useRef, useEffect } from 'react';
import { FootprintCandle, FootprintLevel } from '../types';
import { cn } from '../lib/utils';

interface FootprintChartProps {
  candles: FootprintCandle[];
  width: number;
  height: number;
  className?: string;
}

export const FootprintChart: React.FC<FootprintChartProps> = ({ candles, width, height, className }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Clear canvas
    ctx.clearRect(0, 0, width, height);

    if (candles.length === 0) return;

    const candleWidth = width / candles.length;
    const padding = 10;
    
    // Find global price range for scaling
    const allPrices = candles.flatMap(c => [c.high, c.low]);
    const maxPrice = Math.max(...allPrices);
    const minPrice = Math.min(...allPrices);
    const priceRange = maxPrice - minPrice;

    const getPriceY = (price: number) => {
      return height - ((price - minPrice) / priceRange) * (height - 2 * padding) - padding;
    };

    candles.forEach((candle, index) => {
      const x = index * candleWidth;
      const midX = x + candleWidth / 2;

      // Draw candle wick
      ctx.strokeStyle = '#27272a';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(midX, getPriceY(candle.high));
      ctx.lineTo(midX, getPriceY(candle.low));
      ctx.stroke();

      // Draw footprint levels
      const levelHeight = Math.max(2, (candleWidth / 10)); // Approximate
      
      candle.levels.forEach(level => {
        const y = getPriceY(level.price);
        const isBullish = candle.close >= candle.open;
        
        // Background for the level
        const totalVol = level.bidVolume + level.askVolume;
        const maxVolInCandle = Math.max(...candle.levels.map(l => l.bidVolume + l.askVolume));
        const intensity = totalVol / maxVolInCandle;
        
        ctx.fillStyle = isBullish 
          ? `rgba(34, 197, 94, ${0.1 + intensity * 0.4})` 
          : `rgba(239, 68, 68, ${0.1 + intensity * 0.4})`;
        
        const rectWidth = candleWidth - 4;
        const rectX = x + 2;
        ctx.fillRect(rectX, y - levelHeight / 2, rectWidth, levelHeight);

        // POC (Point of Control) highlight
        if (level.price === candle.poc) {
          ctx.strokeStyle = '#f59e0b';
          ctx.lineWidth = 2;
          ctx.strokeRect(rectX, y - levelHeight / 2, rectWidth, levelHeight);
        }

        // Text (only if wide enough)
        if (candleWidth > 60) {
          ctx.fillStyle = '#ffffff';
          ctx.font = '8px monospace';
          ctx.textAlign = 'center';
          const text = `${Math.round(level.bidVolume)}x${Math.round(level.askVolume)}`;
          ctx.fillText(text, midX, y + 3);
        }
      });
    });

  }, [candles, width, height]);

  return (
    <div className={cn("relative bg-[#09090b] border border-zinc-800 rounded-xl overflow-hidden", className)}>
      <canvas
        ref={canvasRef}
        width={width}
        height={height}
        className="w-full h-full"
      />
      <div className="absolute top-2 left-2 bg-zinc-900/80 px-2 py-1 rounded text-[10px] font-mono text-zinc-400 border border-zinc-800">
        FOOTPRINT VIEW (BID x ASK)
      </div>
    </div>
  );
};
