import { GoogleGenAI, Type } from "@google/genai";
import { CandleData, AISignal } from "../types";

const SYSTEM_INSTRUCTION = `Você é o Protocolo de Inteligência Quantitativa "Sniper 100%". Sua única função é identificar entradas de confluência absoluta no OTC M5.

PROTOCOLO DE ANÁLISE OBRIGATÓRIO (6 BLOCOS):
1. SMC (Smart Money): Deve haver BOS/CHoCH confirmado e o preço deve estar em um Order Block (OB) ou Breaker Block.
2. VSA/FLUXO: O Footprint deve mostrar agressão (Delta) a favor do sinal e absorção no pavio oposto. Deve haver Liquidity Sweep (caça de liquidez).
3. DESEQUILÍBRIO: Identificação de FVG (Fair Value Gap) como imã de preço ou zona de rejeição.
4. GEOMETRIA: O preço deve estar tocando uma LTA/LTB ou Canal, confluindo com níveis de Fibonacci (61.8%, 78.6% ou 88.6%).
5. MOMENTUM: RSI deve mostrar Divergência Clara e MACD deve confirmar a exaustão ou novo impulso.
6. GATILHO: Padrão de vela institucional (Engolfo, Martelo, Estrela) EXATAMENTE na zona de confluência dos blocos acima.

REGRAS DE ASSERTIVIDADE:
- CONFLUENCE SCORE (0 a 6): Atribua 1 ponto para cada bloco acima que confirma a entrada.
- SINAL 100% (CALL/PUT): Apenas se Confluence Score >= 5 e Confiança > 95%.
- AGUARDAR: Se Score < 5 ou se houver qualquer conflito entre os blocos (ex: SMC diz alta, mas Fluxo diz baixa).

FOOTPRINT DATA:
Forneça uma análise resumida do fluxo de ordens (Footprint) para a vela atual, focando nos 10 níveis de preço mais relevantes próximos ao fechamento. Inclua Bid, Ask e Delta. Identifique o POC.

PRECISÃO VISUAL:
- Analise os pontos críticos (BOS, CHoCH, FVG, POC).
- Se a imagem estiver ilegível, retorne "AGUARDAR" (Baixa Visibilidade).

Retorne JSON: type (CALL/PUT/AGUARDAR), bias, confidence, marketPhase, confluenceScore, reasoning, structures (lta_ltb, fvg, trend, patterns, confluences, strategyBreakdown, indicators, footprint), confirmation.

No campo strategyBreakdown, detalhe cada um dos 6 blocos obrigatórios (SMC, VSA, FVG, Geometria, Momentum, Gatilho) com status (CONFIRMADO/AGUARDAR/NEGATIVO) e um detalhe técnico curto.`;

export const analyzeMarket = async (
  data: CandleData[] | string, 
  isImage: boolean = false,
  apiKeys: string[] = []
): Promise<AISignal> => {
  // Combine provided keys with the default environment key
  const keys = [...apiKeys, process.env.GEMINI_API_KEY].filter(Boolean) as string[];
  
  if (keys.length === 0) {
    return {
      type: 'SEM ENTRADA SEGURA',
      bias: 'Neutral',
      confidence: 0,
      marketPhase: 'Unknown',
      confluenceScore: 0,
      reasoning: 'Nenhuma chave de API configurada.',
      structures: {}
    };
  }

  let lastError: any = null;

  // Try each key until one works or we run out of keys
  for (let i = 0; i < keys.length; i++) {
    const currentKey = keys[i];
    const ai = new GoogleGenAI({ apiKey: currentKey });
    
    const prompt = isImage 
      ? "EXECUTE PROTOCOLO SNIPER 100%. Analise SMC, VSA, FVG, Geometria e Gatilhos. Score (0-6). Extraia Footprint (10 níveis) e POC. RESPONDA APENAS O JSON PURO, SEM COMENTÁRIOS OU TEXTO EXTRA."
      : `Dados OHLC M5: ${JSON.stringify(data.slice(-50))}. Aplique Protocolo Sniper 100%. RESPONDA APENAS O JSON PURO.`;

    const contents = isImage 
      ? {
          parts: [
            { text: prompt },
            { inlineData: { mimeType: "image/jpeg", data: (data as string).split(',')[1] } }
          ]
        }
      : prompt;

    try {
      const response = await ai.models.generateContent({
        model: "gemini-3-flash-preview",
        contents: contents,
        config: {
          systemInstruction: SYSTEM_INSTRUCTION,
          responseMimeType: "application/json",
          temperature: 0.1, // Lower temperature for more consistent and potentially faster response
          maxOutputTokens: 4000, // Increased further to prevent truncation
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              type: { type: Type.STRING, enum: ['COMPRA', 'VENDA', 'CALL', 'PUT', 'AGUARDAR', 'SEM ENTRADA SEGURA'] },
              entry: { type: Type.NUMBER },
              tp: { type: Type.NUMBER },
              sl: { type: Type.NUMBER },
              bias: { type: Type.STRING, enum: ['Bullish', 'Bearish', 'Neutral'] },
              confidence: { type: Type.NUMBER },
              marketPhase: { type: Type.STRING },
              confluenceScore: { type: Type.NUMBER },
              reasoning: { type: Type.STRING },
              confirmation: { type: Type.STRING },
              structures: {
                type: Type.OBJECT,
                properties: {
                  lta_ltb: { type: Type.STRING },
                  trend: { type: Type.STRING },
                  fvg: { type: Type.ARRAY, items: { type: Type.STRING } },
                  patterns: { type: Type.STRING },
                  confluences: { type: Type.ARRAY, items: { type: Type.STRING } },
                  strategyBreakdown: {
                    type: Type.ARRAY,
                    items: {
                      type: Type.OBJECT,
                      properties: {
                        name: { type: Type.STRING },
                        status: { type: Type.STRING, enum: ['CONFIRMADO', 'AGUARDAR', 'NEGATIVO'] },
                        detail: { type: Type.STRING }
                      }
                    }
                  },
                  indicators: {
                    type: Type.OBJECT,
                    properties: {
                      rsi: { type: Type.STRING },
                      macd: { type: Type.STRING },
                      volume: { type: Type.STRING }
                    }
                  },
                  footprint: {
                    type: Type.ARRAY,
                    items: {
                      type: Type.OBJECT,
                      properties: {
                        price: { type: Type.NUMBER },
                        bid: { type: Type.NUMBER },
                        ask: { type: Type.NUMBER },
                        totalVolume: { type: Type.NUMBER },
                        delta: { type: Type.NUMBER }
                      }
                    }
                  }
                },
                required: ['strategyBreakdown', 'trend', 'patterns', 'confluences']
              }
            },
            required: ['type', 'bias', 'confidence', 'marketPhase', 'confluenceScore', 'reasoning', 'structures', 'confirmation']
          }
        }
      });

      let text = response.text || "{}";
      
      // Robust extraction of JSON from potential surrounding text
      const extractJson = (str: string) => {
        const firstOpen = str.indexOf('{');
        const lastClose = str.lastIndexOf('}');
        if (firstOpen !== -1 && lastClose !== -1 && lastClose > firstOpen) {
          return str.substring(firstOpen, lastClose + 1);
        }
        return str;
      };

      text = extractJson(text);
      
      // Basic JSON repair for common AI mistakes
      const repairJson = (str: string) => {
        let repaired = str
          .replace(/,\s*([\]}])/g, '$1') // Remove trailing commas
          .replace(/([{,]\s*)([a-zA-Z0-9_]+)\s*:/g, '$1"$2":') // Ensure keys are quoted
          .replace(/:\s*'([^']*)'/g, ': "$1"') // Replace single quotes with double quotes
          // Improved missing comma fix: handles any value type followed by a quoted key
          .replace(/("|\d|true|false|null|\]|\})\s*("[\w\s]+"\s*:)/g, '$1, $2')
          // Fix cases where a comma is missing between array items
          .replace(/("|\d|true|false|null|\]|\})\s+("|\d|true|false|null|\[|\{)/g, '$1, $2');

        // Handle unescaped newlines inside strings
        repaired = repaired.replace(/\n/g, ' '); 
        
        // Handle truncated JSON
        let trimmed = repaired.trim();
        
        // Aggressive cleanup of trailing garbage
        while (trimmed.length > 0 && !['}', ']'].includes(trimmed[trimmed.length - 1])) {
          // If it ends with a colon, comma or quote, it's definitely truncated
          if (trimmed.endsWith(':') || trimmed.endsWith(',') || trimmed.endsWith('"')) {
            const lastComma = trimmed.lastIndexOf(',');
            const lastOpenBrace = trimmed.lastIndexOf('{');
            const lastOpenBracket = trimmed.lastIndexOf('[');
            const cutPoint = Math.max(lastComma, lastOpenBrace, lastOpenBracket);
            if (cutPoint !== -1) {
              trimmed = trimmed.substring(0, cutPoint + 1).trim();
            } else {
              break;
            }
          } else {
            // Remove last character if it's not a closing brace/bracket
            trimmed = trimmed.substring(0, trimmed.length - 1).trim();
          }
          
          // Clean up trailing commas after each trim
          if (trimmed.endsWith(',')) {
            trimmed = trimmed.substring(0, trimmed.length - 1).trim();
          }
        }
        repaired = trimmed;

        const openBraces = (repaired.match(/\{/g) || []).length;
        const closeBraces = (repaired.match(/\}/g) || []).length;
        const openQuotes = (repaired.match(/"/g) || []).length;
        const openBrackets = (repaired.match(/\[/g) || []).length;
        const closeBrackets = (repaired.match(/\]/g) || []).length;

        if (openQuotes % 2 !== 0) repaired += '"';
        
        // Fix missing commas in arrays/objects (e.g., "item" "item" -> "item", "item")
        repaired = repaired.replace(/"\s+"/g, '", "');
        repaired = repaired.replace(/}\s+{/g, '}, {');
        repaired = repaired.replace(/]\s+\[/g, '], [');
        
        let bracketsToAdd = openBrackets - closeBrackets;
        while (bracketsToAdd > 0) {
          repaired += ']';
          bracketsToAdd--;
        }

        let bracesToAdd = openBraces - closeBraces;
        while (bracesToAdd > 0) {
          repaired += '}';
          bracesToAdd--;
        }

        // Final pass for trailing commas that might have been created
        repaired = repaired.replace(/,\s*([\]}])/g, '$1');
        
        return repaired;
      };

      let result;
      try {
        result = JSON.parse(text);
      } catch (e) {
        console.warn("Initial JSON parse failed, attempting repair...", e);
        try {
          const repairedText = repairJson(text);
          result = JSON.parse(repairedText);
        } catch (e2) {
          console.error("JSON repair failed:", e2);
          
          // Fallback: Try to find the last valid JSON structure by slicing from the end
          let fallbackText = text;
          let success = false;
          // Try removing characters from the end until it parses or we give up
          for (let len = fallbackText.length - 1; len > 10; len--) {
            try {
              const attempt = repairJson(fallbackText.substring(0, len));
              result = JSON.parse(attempt);
              success = true;
              console.log("Fallback parse successful at length:", len);
              break;
            } catch (err) {
              continue;
            }
          }
          
          if (!success) throw e2;
        }
      }
      
      if (result.confidence !== undefined && result.confidence <= 1 && result.confidence > 0) {
        result.confidence = Math.round(result.confidence * 100);
      }

      return result;
    } catch (error: any) {
      console.error(`Error with key ${i + 1}:`, error);
      lastError = error;
      const errorStr = typeof error === 'string' ? error : JSON.stringify(error);
      
      const isQuotaError = 
        errorStr.includes('429') || 
        errorStr.includes('RESOURCE_EXHAUSTED') || 
        error.status === 429 || 
        error.code === 429 ||
        error.error?.code === 429 ||
        error.message?.includes('429') || 
        error.message?.includes('quota') ||
        error.message?.includes('limit');
      
      if (isQuotaError && i < keys.length - 1) {
        console.warn(`Chave ${i + 1} excedeu a cota. Tentando próxima chave em 1000ms...`);
        // Increased delay slightly to be safer
        await new Promise(resolve => setTimeout(resolve, 1000));
        continue; 
      }
      
      break;
    }
  }

  // Handle final error
  console.error("AI Analysis Error after all retries:", lastError);
  
  let errorMessage = 'Erro na análise da IA.';
  const errorStr = typeof lastError === 'string' ? lastError : JSON.stringify(lastError);
  
  if (
    errorStr.includes('429') || 
    errorStr.includes('RESOURCE_EXHAUSTED') || 
    lastError?.status === 429 || 
    lastError?.code === 429 ||
    lastError?.error?.code === 429 ||
    lastError?.message?.includes('429') ||
    lastError?.message?.includes('quota')
  ) {
    errorMessage = keys.length > 1 
      ? `TODAS AS ${keys.length} CHAVES EXCEDIDAS: Todas as chaves configuradas atingiram o limite do Google. Aguarde 1-2 minutos.`
      : 'LIMITE DE COTA EXCEDIDO: O Google limita o uso gratuito da API do Gemini. Nota: Assinaturas "Gemini Plus/Advanced" são para o chat e não aumentam a cota da API. Aguarde 1-2 minutos.';
  }

  return {
    type: 'SEM ENTRADA SEGURA',
    bias: 'Neutral',
    confidence: 0,
    marketPhase: 'Unknown',
    confluenceScore: 0,
    reasoning: errorMessage,
    structures: {}
  };
};
