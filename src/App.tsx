import { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  History, 
  Settings, 
  Zap, 
  ShieldAlert, 
  ArrowUpRight, 
  ArrowDownRight,
  Monitor,
  Camera,
  RefreshCw,
  Activity,
  ShieldCheck,
  X
} from 'lucide-react';
import { cn } from './lib/utils';
import { analyzeMarket } from './services/geminiService';
import { AISignal, Trade } from './types';
import { BrokerChart } from './components/BrokerChart';

export default function App() {
  const [capturedImage, setCapturedImage] = useState<string | null>(null);
  const [signal, setSignal] = useState<AISignal | null>(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [analysisTime, setAnalysisTime] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [retryCountdown, setRetryCountdown] = useState<number | null>(null);
  const [trades, setTrades] = useState<Trade[]>([]);
  const [showFootprint, setShowFootprint] = useState(true);
  const [isIframe, setIsIframe] = useState(false);
  const [apiKeys, setApiKeys] = useState<string[]>([]);
  const [showKeyModal, setShowKeyModal] = useState(false);
  const [newKey, setNewKey] = useState('');
  const [isLiveMode, setIsLiveMode] = useState(false);
  const [liveStream, setLiveStream] = useState<MediaStream | null>(null);
  const liveVideoRef = useRef<HTMLVideoElement | null>(null);
  const liveIntervalRef = useRef<NodeJS.Timeout | null>(null);

  // Broker API State
  const [analysisMode, setAnalysisMode] = useState<'capture' | 'broker'>('capture');
  const [brokerConnected, setBrokerConnected] = useState(false);
  const [brokerCandles, setBrokerCandles] = useState<any[]>([]);
  const [showBrokerModal, setShowBrokerModal] = useState(false);
  const [brokerEmail, setBrokerEmail] = useState('');
  const [brokerPassword, setBrokerPassword] = useState('');
  const [manualSSID, setManualSSID] = useState('');
  const [isBrokerLoggingIn, setIsBrokerLoggingIn] = useState(false);
  const [brokerLoginStep, setBrokerLoginStep] = useState('');
  const [brokerBaseUrl, setBrokerBaseUrl] = useState('iqoption.com');
  const [activeAsset, setActiveAsset] = useState(1); // EUR/USD

  useEffect(() => {
    const savedKeys = localStorage.getItem('otc_sniper_api_keys');
    if (savedKeys) {
      try {
        setApiKeys(JSON.parse(savedKeys));
      } catch (e) {
        console.error("Error loading keys", e);
      }
    }
    setIsIframe(window.self !== window.top);

    return () => {
      if (liveIntervalRef.current) clearInterval(liveIntervalRef.current);
    };
  }, []);

  const saveKeys = (keys: string[]) => {
    setApiKeys(keys);
    localStorage.setItem('otc_sniper_api_keys', JSON.stringify(keys));
  };

  const addKey = () => {
    if (newKey.trim() && !apiKeys.includes(newKey.trim())) {
      const updated = [...apiKeys, newKey.trim()];
      saveKeys(updated);
      setNewKey('');
    }
  };

  const removeKey = (index: number) => {
    const updated = apiKeys.filter((_, i) => i !== index);
    saveKeys(updated);
  };

  const stopLiveMode = () => {
    setIsLiveMode(false);
    if (liveStream) {
      liveStream.getTracks().forEach(track => track.stop());
      setLiveStream(null);
    }
    if (liveIntervalRef.current) {
      clearInterval(liveIntervalRef.current);
      liveIntervalRef.current = null;
    }
  };

  const startLiveMode = async () => {
    setError(null);
    try {
      const stream = await navigator.mediaDevices.getDisplayMedia({ 
        video: { cursor: "always" } as any 
      });
      
      setLiveStream(stream);
      setIsLiveMode(true);

      const video = document.createElement('video');
      video.srcObject = stream;
      video.play();
      liveVideoRef.current = video;

      await new Promise((resolve) => (video.onloadedmetadata = resolve));

      // Start the analysis loop
      const runAnalysis = async () => {
        if (!stream.active) {
          stopLiveMode();
          return;
        }

        const canvas = document.createElement('canvas');
        const MAX_WIDTH = 800;
        const scale = video.videoWidth > MAX_WIDTH ? MAX_WIDTH / video.videoWidth : 1;
        canvas.width = video.videoWidth * scale;
        canvas.height = video.videoHeight * scale;
        
        const ctx = canvas.getContext('2d');
        ctx?.drawImage(video, 0, 0, canvas.width, canvas.height);
        
        const imageData = canvas.toDataURL('image/jpeg', 0.75);
        setCapturedImage(imageData);

        setIsAnalyzing(true);
        setAnalysisTime(0);
        const startTime = Date.now();
        const timerInterval = setInterval(() => {
          setAnalysisTime(Math.floor((Date.now() - startTime) / 1000));
        }, 1000);

        try {
          const result = await analyzeMarket(imageData, true, apiKeys);
          setSignal(result);
          if (result.reasoning.includes('COTA') || result.reasoning.includes('LIMITE')) {
            setError(result.reasoning);
          } else {
            setError(null);
          }

          if (result.type !== 'AGUARDAR' && result.type !== 'SEM ENTRADA SEGURA') {
            const newTrade: Trade = {
              id: Date.now().toString(),
              symbol: 'LIVE OTC',
              type: result.type as any,
              entryPrice: 0,
              status: 'Aberto',
              timestamp: Date.now()
            };
            setTrades(prev => [newTrade, ...prev]);
          }
        } catch (err: any) {
          console.error("Live analysis error:", err);
        } finally {
          setIsAnalyzing(false);
          clearInterval(timerInterval);
        }
      };

      // Initial run
      runAnalysis();

      // Set interval for every 20 seconds (safer for quota)
      liveIntervalRef.current = setInterval(runAnalysis, 20000);

      stream.getVideoTracks()[0].onended = () => {
        stopLiveMode();
      };

    } catch (err: any) {
      console.error("Live mode error:", err);
      setError(`Erro ao iniciar Modo Live: ${err.message}`);
      stopLiveMode();
    }
  };

  const loginToBroker = async () => {
    setIsBrokerLoggingIn(true);
    setBrokerLoginStep('Autenticando...');
    setError(null);
    try {
      const response = await fetch('/api/broker/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          email: brokerEmail, 
          password: brokerPassword,
          baseUrl: brokerBaseUrl
        })
      });
      
      const data = await response.json();
      if (data.success) {
        setBrokerLoginStep('Conectando ao Gráfico...');
        setBrokerConnected(true);
        setShowBrokerModal(false);
        loadInitialCandles();
        startBrokerStream();
      } else {
        throw new Error(data.error || 'Falha no login');
      }
    } catch (err: any) {
      setError(err.message);
    } finally {
      setIsBrokerLoggingIn(false);
      setBrokerLoginStep('');
    }
  };

  const loginWithSSID = async () => {
    setIsBrokerLoggingIn(true);
    setBrokerLoginStep('Conectando com SSID...');
    setError(null);
    try {
      const response = await fetch('/api/broker/ssid', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ssid: manualSSID })
      });
      
      const data = await response.json();
      if (data.success) {
        setBrokerConnected(true);
        setShowBrokerModal(false);
        loadInitialCandles();
        startBrokerStream();
      } else {
        throw new Error(data.error || 'Falha na conexão com SSID');
      }
    } catch (err: any) {
      setError(err.message);
    } finally {
      setIsBrokerLoggingIn(false);
      setBrokerLoginStep('');
    }
  };

  const loadInitialCandles = async () => {
    try {
      console.log('DEBUG: Fetching candles for asset:', activeAsset);
      const response = await fetch(`/api/broker/candles/${activeAsset}?count=100&size=60`);
      const data = await response.json();
      console.log('DEBUG: Candles data received:', data);
      
      const candleArray = Array.isArray(data) ? data : (data.data || data.candles || []);
      console.log('DEBUG: Extracted candle array length:', candleArray.length);
      
      const formatted = candleArray.map((c: any) => ({
        time: c.from as any,
        open: c.open,
        high: c.max,
        low: c.min,
        close: c.close
      }));
      console.log('DEBUG: Formatted candles:', formatted);
      setBrokerCandles(formatted);
    } catch (err) {
      console.error('Error loading candles:', err);
    }
  };

  const startBrokerStream = () => {
    const eventSource = new EventSource('/api/broker/stream');
    eventSource.onmessage = (event) => {
      const candle = JSON.parse(event.data);
      if (candle.active_id === activeAsset) {
        setBrokerCandles(prev => {
          const last = prev[prev.length - 1];
          const newCandle = {
            time: candle.from as any,
            open: candle.open,
            high: candle.max,
            low: candle.min,
            close: candle.close
          };

          if (last && last.time === newCandle.time) {
            return [...prev.slice(0, -1), newCandle];
          } else {
            return [...prev, newCandle].slice(-200);
          }
        });
      }
    };

    return () => eventSource.close();
  };

  const analyzeBrokerData = async () => {
    if (brokerCandles.length < 50) return;
    
    setIsAnalyzing(true);
    setAnalysisTime(0);
    const startTime = Date.now();
    const timerInterval = setInterval(() => {
      setAnalysisTime(Math.floor((Date.now() - startTime) / 1000));
    }, 1000);

    try {
      const result = await analyzeMarket(brokerCandles, false, apiKeys);
      setSignal(result);
      if (result.type !== 'AGUARDAR' && result.type !== 'SEM ENTRADA SEGURA') {
        const newTrade: Trade = {
          id: Date.now().toString(),
          symbol: 'API EUR/USD',
          type: result.type as any,
          entryPrice: brokerCandles[brokerCandles.length - 1].close,
          status: 'Aberto',
          timestamp: Date.now()
        };
        setTrades(prev => [newTrade, ...prev]);
      }
    } catch (err: any) {
      setError(err.message);
    } finally {
      setIsAnalyzing(false);
      clearInterval(timerInterval);
    }
  };
  
  const captureScreen = async () => {
    setError(null);
    try {
      const stream = await navigator.mediaDevices.getDisplayMedia({ 
        video: { cursor: "always" } as any 
      });
      const video = document.createElement('video');
      video.srcObject = stream;
      video.play();

      await new Promise((resolve) => (video.onloadedmetadata = resolve));

      const canvas = document.createElement('canvas');
      const MAX_WIDTH = 800; // Balanced for speed and vision
      const scale = video.videoWidth > MAX_WIDTH ? MAX_WIDTH / video.videoWidth : 1;
      canvas.width = video.videoWidth * scale;
      canvas.height = video.videoHeight * scale;
      
      const ctx = canvas.getContext('2d');
      ctx?.drawImage(video, 0, 0, canvas.width, canvas.height);
      
      const imageData = canvas.toDataURL('image/jpeg', 0.75); // Balanced quality
      setCapturedImage(imageData);
      
      stream.getTracks().forEach(track => track.stop());

      setIsAnalyzing(true);
      setAnalysisTime(0);
      const startTime = Date.now();
      const timerInterval = setInterval(() => {
        setAnalysisTime(Math.floor((Date.now() - startTime) / 1000));
      }, 1000);

      console.time("MarketAnalysis");
      console.log("Starting market analysis...");
      
      try {
        // 30-second timeout to prevent infinite hang
        const analysisPromise = analyzeMarket(imageData, true, apiKeys);
        const timeoutPromise = new Promise<AISignal>((_, reject) => 
          setTimeout(() => reject(new Error("TIMEOUT: A análise demorou mais de 30 segundos.")), 30000)
        );

        const result = await Promise.race([analysisPromise, timeoutPromise]);
        
        console.timeEnd("MarketAnalysis");
        console.log("Analysis result received:", result.type);
        setSignal(result);
        clearInterval(timerInterval);

        if (result.reasoning.includes('COTA') || result.reasoning.includes('LIMITE')) {
          setError(result.reasoning);
          setRetryCountdown(60); // Start 60s countdown
        } else {
          setError(null);
          setRetryCountdown(null);
        }

        // Add to history
        if (result.type !== 'AGUARDAR' && result.type !== 'SEM ENTRADA SEGURA') {
          const newTrade: Trade = {
            id: Date.now().toString(),
            symbol: 'OTC CAPTURE',
            type: result.type as any,
            entryPrice: 0,
            status: 'Aberto',
            timestamp: Date.now()
          };
          setTrades(prev => [newTrade, ...prev]);
        }

        if (Notification.permission === 'granted' && ['CALL', 'PUT'].includes(result.type)) {
          new Notification(`Sinal OTC: ${result.type}`, {
            body: `Análise: ${result.reasoning}`,
          });
        }
      } catch (err: any) {
        clearInterval(timerInterval);
        throw err;
      }
    } catch (err: any) {
      console.error("Screen capture error:", err);
      const isPermissionError = 
        err.name === 'NotAllowedError' || 
        err.message?.includes('permissions policy') || 
        err.message?.includes('disallowed by permissions policy') ||
        err.message?.includes('display-capture');

      if (isPermissionError) {
        setError("BLOQUEIO DE CAPTURA: O navegador bloqueia a captura de tela dentro de um frame por segurança. Clique no botão 'NOVA ABA' no topo para abrir o terminal em tela cheia e liberar a captura.");
      } else {
        setError(`Erro: ${err.message || "Falha na captura"}`);
      }
    } finally {
      setIsAnalyzing(false);
    }
  };

  useEffect(() => {
    if (retryCountdown !== null && retryCountdown > 0) {
      const timer = setTimeout(() => setRetryCountdown(retryCountdown - 1), 1000);
      return () => clearTimeout(timer);
    } else if (retryCountdown === 0) {
      setRetryCountdown(null);
      setError(null);
      // Auto-retry if we have a captured image
      if (capturedImage) {
        const retryAnalysis = async () => {
          try {
            setIsAnalyzing(true);
            console.log("Retrying analysis...");
            
            const analysisPromise = analyzeMarket(capturedImage, true, apiKeys);
            const timeoutPromise = new Promise<AISignal>((_, reject) => 
              setTimeout(() => reject(new Error("TIMEOUT: A análise demorou mais de 30 segundos.")), 30000)
            );

            const result = await Promise.race([analysisPromise, timeoutPromise]);
            
            setSignal(result);
            if (result.reasoning.includes('COTA') || result.reasoning.includes('LIMITE')) {
              setError(result.reasoning);
              setRetryCountdown(60);
            } else {
              setError(null);
            }
          } catch (err: any) {
            console.error("Retry analysis error:", err);
            setError(err.message || "Erro na retentativa automática.");
          } finally {
            setIsAnalyzing(false);
          }
        };
        retryAnalysis();
      }
    }
  }, [retryCountdown, capturedImage, apiKeys]);

  useEffect(() => {
    if (Notification.permission === 'default') {
      Notification.requestPermission();
    }
  }, []);

  return (
    <div className="flex h-screen w-full bg-[#09090b] text-zinc-400 font-sans selection:bg-zinc-800">
      {/* Sidebar Esquerda */}
      <aside className="w-64 border-r border-zinc-800 flex flex-col bg-[#09090b]/50 backdrop-blur-xl">
        <div className="p-6 flex items-center gap-3">
          <div className="w-8 h-8 bg-amber-500 rounded-lg flex items-center justify-center">
            <Zap className="w-5 h-5 text-zinc-900 fill-zinc-900" />
          </div>
          <h1 className="text-zinc-100 font-bold tracking-tight text-lg">OTC Sniper</h1>
        </div>

          <nav className="flex-1 px-4 space-y-1">
            <button 
              onClick={() => setAnalysisMode('capture')}
              className={cn(
                "w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-all",
                analysisMode === 'capture' ? "bg-amber-500/10 text-amber-500" : "text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800/50"
              )}
            >
              <Monitor size={18} />
              <span className="text-sm font-medium">Captura de Tela</span>
            </button>
            <button 
              onClick={() => {
                setAnalysisMode('broker');
                if (!brokerConnected) setShowBrokerModal(true);
              }}
              className={cn(
                "w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-all",
                analysisMode === 'broker' ? "bg-amber-500/10 text-amber-500" : "text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800/50"
              )}
            >
              <Zap size={18} />
              <span className="text-sm font-medium">Broker API (Live)</span>
              {brokerConnected && <div className="ml-auto w-2 h-2 rounded-full bg-green-500" />}
            </button>
            <NavItem icon={<History size={18} />} label="Histórico OTC" />
            <button 
              onClick={() => setShowKeyModal(true)}
              className="w-full flex items-center gap-3 px-4 py-3 text-zinc-400 hover:text-amber-500 hover:bg-amber-500/5 rounded-xl transition-all group"
            >
              <Settings size={18} className="group-hover:rotate-45 transition-transform" />
              <span className="text-sm font-medium">Configurações API</span>
              {apiKeys.length > 0 && (
                <span className="ml-auto bg-amber-500/20 text-amber-500 text-[10px] px-1.5 py-0.5 rounded-full font-bold">
                  {apiKeys.length}
                </span>
              )}
            </button>
          </nav>

        <div className="p-4 border-t border-zinc-800">
          <div className="bg-zinc-900/50 rounded-xl p-4 border border-zinc-800">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-mono uppercase tracking-wider text-zinc-500">Status IA</span>
              <div className="flex items-center gap-1.5">
                <div className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse" />
                <span className="text-[10px] font-mono text-green-500">PRONTA</span>
              </div>
            </div>
            <div className="text-sm font-medium text-zinc-300 italic">"Focada em OTC M5 Vela a Vela"</div>
          </div>
        </div>
      </aside>

      {/* Área Central */}
      <main className="flex-1 flex flex-col overflow-hidden">
        {/* Header */}
        <header className="h-16 border-b border-zinc-800 flex items-center justify-between px-8 bg-[#09090b]/50 backdrop-blur-xl">
          <div className="flex items-center gap-6">
            <h2 className="text-zinc-100 font-bold flex items-center gap-2">
              <Camera size={18} className="text-amber-500" />
              Terminal de Captura OTC
            </h2>
          </div>

          <div className="flex items-center gap-3">
            {analysisMode === 'broker' ? (
              <button 
                onClick={analyzeBrokerData}
                disabled={isAnalyzing || !brokerConnected}
                className={cn(
                  "flex items-center gap-2 px-6 py-2 rounded-lg text-sm font-black transition-all active:scale-95 shadow-[0_0_20px_-5px_rgba(255,255,255,0.3)] min-w-[180px] justify-center",
                  isAnalyzing || !brokerConnected ? "bg-zinc-800 text-zinc-500 cursor-not-allowed" : "bg-amber-500 text-zinc-900 hover:bg-amber-600"
                )}
              >
                {isAnalyzing ? (
                  <div className="flex items-center gap-2">
                    <RefreshCw size={16} className="animate-spin" />
                    <span>{analysisTime || 0}s ...</span>
                  </div>
                ) : (
                  <>
                    <Zap size={16} />
                    <span>ANALISAR DADOS API</span>
                  </>
                )}
              </button>
            ) : (
              <>
                <button 
                  onClick={isLiveMode ? stopLiveMode : startLiveMode}
                  className={cn(
                    "flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-bold transition-all active:scale-95 border",
                    isLiveMode 
                      ? "bg-red-500/10 border-red-500/50 text-red-500 hover:bg-red-500/20" 
                      : "bg-zinc-900 border-zinc-800 text-zinc-400 hover:text-amber-500 hover:border-amber-500/50"
                  )}
                >
                  <div className={cn(
                    "w-2 h-2 rounded-full",
                    isLiveMode ? "bg-red-500 animate-pulse" : "bg-zinc-600"
                  )} />
                  {isLiveMode ? "PARAR LIVE" : "MODO LIVE"}
                </button>
                <button 
                  onClick={captureScreen}
                  disabled={isAnalyzing || isLiveMode}
                  className={cn(
                    "flex items-center gap-2 px-6 py-2 rounded-lg text-sm font-black transition-all active:scale-95 shadow-[0_0_20px_-5px_rgba(255,255,255,0.3)] min-w-[180px] justify-center",
                    isAnalyzing || isLiveMode ? "bg-zinc-800 text-zinc-500 cursor-not-allowed" : "bg-zinc-100 text-zinc-900 hover:bg-zinc-200"
                  )}
                >
                  {isAnalyzing ? (
                    <div className="flex items-center gap-2">
                      <RefreshCw size={16} className="animate-spin" />
                      <span>{analysisTime || 0}s ...</span>
                    </div>
                  ) : (
                    <>
                      <Camera size={16} />
                      <span>{isLiveMode ? "ANALISANDO..." : "CAPTURAR E ANALISAR"}</span>
                    </>
                  )}
                </button>
              </>
            )}
          </div>
        </header>

        {isIframe && !error && (
          <div className="mx-8 mt-4 p-3 bg-amber-500/10 border border-amber-500/20 rounded-lg flex items-center justify-between">
            <div className="flex items-center gap-2 text-amber-400 text-[10px] font-bold uppercase tracking-wider">
              <ShieldAlert size={14} />
              <span>Aviso: Modo Preview detectado. Use "Nova Aba" para evitar erros de captura.</span>
            </div>
            <button 
              onClick={() => window.open(window.location.href, '_blank')}
              className="px-3 py-1 bg-amber-500 text-zinc-900 rounded text-[9px] font-black uppercase"
            >
              Corrigir Agora
            </button>
          </div>
        )}

        {error && (
          <div className="mx-8 mt-4 p-4 bg-red-500/10 border border-red-500/20 rounded-xl flex flex-col gap-3">
            <div className="flex items-center gap-3 text-red-400">
              <div className="w-8 h-8 rounded-full bg-red-500/20 flex items-center justify-center shrink-0">
                <ShieldAlert size={18} />
              </div>
              <div>
                <p className="text-sm font-bold">
                  {error.includes('COTA') || error.includes('quota') ? 'Limite de Uso do Google (Gemini)' : 'Erro Detectado'}
                </p>
                <p className="text-xs opacity-80">{error}</p>
              </div>
            </div>
            <div className="flex items-center gap-3 pl-11">
              {error.includes('COTA') || error.includes('quota') ? (
                <div className="flex flex-col gap-3">
                  <div className="space-y-1">
                    <p className="text-[10px] text-red-300 italic font-bold">Por que isso acontece?</p>
                    <p className="text-[10px] text-zinc-400 leading-relaxed">
                      Assinaturas como "Gemini Plus" ou "Advanced" são para o site do Google Gemini (chat) e **não aumentam** o limite da API usada por este app. A API gratuita do Google tem um limite de velocidade (RPM).
                    </p>
                  </div>
                  <div className="flex gap-2">
                    <button 
                      onClick={() => window.open('https://aistudio.google.com/app/apikey', '_blank')}
                      className="px-3 py-1.5 bg-zinc-800 text-white rounded border border-white/10 text-[10px] font-bold hover:bg-zinc-700 transition-all"
                    >
                      Obter Minha Chave API Grátis
                    </button>
                    <button 
                      onClick={() => setError(null)}
                      className="px-3 py-1.5 bg-red-500 text-white rounded text-[10px] font-bold hover:bg-red-600 transition-all flex items-center gap-2"
                    >
                      {retryCountdown !== null ? (
                        <>
                          <RefreshCw size={12} className="animate-spin" />
                          Tentando em {retryCountdown}s...
                        </>
                      ) : (
                        'Entendi, vou aguardar'
                      )}
                    </button>
                  </div>
                </div>
              ) : (
                <>
                  {error.includes('iframe') || error.includes('aba') ? (
                    <button 
                      onClick={() => window.open(window.location.href, '_blank')}
                      className="px-4 py-2 bg-red-500 text-white rounded-lg text-[11px] font-black hover:bg-red-600 transition-all active:scale-95 uppercase tracking-wider"
                    >
                      Abrir em Nova Aba (Correção Definitiva)
                    </button>
                  ) : null}
                  <button 
                    onClick={() => setError(null)}
                    className="text-[10px] font-bold text-zinc-500 hover:text-zinc-300 uppercase tracking-wider"
                  >
                    Fechar Aviso
                  </button>
                </>
              )}
            </div>
          </div>
        )}

        {/* Visualização da Captura / Broker Chart */}
        <div className="flex-1 relative bg-[#050505] overflow-hidden flex items-center justify-center p-4">
          {analysisMode === 'broker' ? (
            brokerConnected ? (
              <div className="w-full h-full relative">
                {brokerCandles.length > 0 ? (
                  <BrokerChart data={brokerCandles} />
                ) : (
                  <div className="flex items-center justify-center h-full text-zinc-500">Carregando dados...</div>
                )}
                <div className="absolute top-4 left-4 bg-black/60 backdrop-blur-md px-3 py-1.5 rounded-lg border border-white/10 text-[10px] font-mono text-zinc-300 flex items-center gap-2">
                  <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
                  CONEXÃO API ATIVA: EUR/USD
                </div>
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center text-center space-y-6 max-w-md">
                <div className="w-24 h-24 bg-zinc-900 rounded-full flex items-center justify-center border border-zinc-800">
                  <Zap size={48} className="text-zinc-600" />
                </div>
                <div className="space-y-2">
                  <h3 className="text-xl font-bold text-zinc-100">Conectar à Corretora</h3>
                  <p className="text-sm">Para usar a leitura precisa via API, você precisa conectar sua conta da Bullex ou IQ Option.</p>
                  <button 
                    onClick={() => setShowBrokerModal(true)}
                    className="mt-4 px-6 py-2 bg-amber-500 text-zinc-900 rounded-lg font-bold hover:bg-amber-600 transition-all"
                  >
                    Conectar Agora
                  </button>
                </div>
              </div>
            )
          ) : capturedImage ? (
            <div className="relative w-full h-full flex items-center justify-center">
              <img 
                src={capturedImage} 
                alt="OTC Capture" 
                className="max-w-full max-h-full object-contain rounded-xl border border-zinc-800 shadow-2xl"
              />
              <div className="absolute top-4 left-4 bg-black/60 backdrop-blur-md px-3 py-1.5 rounded-lg border border-white/10 text-[10px] font-mono text-zinc-300 flex items-center gap-2">
                <div className={cn(
                  "w-2 h-2 rounded-full animate-pulse",
                  isLiveMode ? "bg-red-500" : "bg-amber-500"
                )} />
                {isLiveMode ? "MODO LIVE ATIVO (20s)" : "ÚLTIMA CAPTURA OTC"}
              </div>
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center text-center space-y-6 max-w-md opacity-50">
              <div className="w-24 h-24 bg-zinc-900 rounded-full flex items-center justify-center border border-zinc-800">
                <Monitor size={48} className="text-zinc-600" />
              </div>
              <div className="space-y-2">
                <h3 className="text-xl font-bold text-zinc-100">Nenhuma Captura Ativa</h3>
                <p className="text-sm">Clique no botão acima para capturar a tela da sua corretora (Quotex, IQ Option, etc.) e prever a próxima vela.</p>
              </div>
            </div>
          )}
        </div>

        {/* Histórico Inferior */}
        <div className="h-48 border-t border-zinc-800 bg-[#09090b]/50 backdrop-blur-xl p-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-bold text-zinc-100 flex items-center gap-2">
              <History size={16} />
              Últimas Previsões OTC
            </h3>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs font-mono">
              <thead>
                <tr className="text-zinc-500 border-b border-zinc-800">
                  <th className="pb-3 font-medium">Hora</th>
                  <th className="pb-3 font-medium">Ativo</th>
                  <th className="pb-3 font-medium">Previsão</th>
                  <th className="pb-3 font-medium">Análise</th>
                </tr>
              </thead>
              <tbody className="text-zinc-300">
                {trades.length === 0 ? (
                  <tr>
                    <td colSpan={4} className="py-8 text-center text-zinc-600 italic">Nenhuma análise realizada ainda</td>
                  </tr>
                ) : (
                  trades.map(trade => (
                    <tr key={trade.id} className="border-b border-zinc-800/50 hover:bg-zinc-800/20 transition-colors">
                      <td className="py-3">{new Date(trade.timestamp).toLocaleTimeString()}</td>
                      <td className="py-3 font-bold">GRÁFICO CAPTURADO</td>
                      <td className="py-3">
                        <span className={cn(
                          "px-2 py-0.5 rounded text-[10px] font-bold",
                          ['CALL', 'COMPRA'].includes(trade.type) ? "bg-green-500/10 text-green-500" : "bg-red-500/10 text-red-500"
                        )}>
                          {trade.type}
                        </span>
                      </td>
                      <td className="py-3 text-zinc-500 truncate max-w-xs italic">
                        {signal?.reasoning || 'Análise concluída'}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </main>

      {/* Sidebar Direita - Sinais IA */}
      <aside className="w-80 border-l border-zinc-800 bg-[#09090b]/50 backdrop-blur-xl flex flex-col">
        <div className="p-6 border-b border-zinc-800">
          <h2 className="text-sm font-bold text-zinc-100 flex items-center gap-2">
            <Zap size={16} className="text-amber-500" />
            Análise OTC Vela a Vela
          </h2>
        </div>

        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          <AnimatePresence mode="wait">
            {signal ? (
              <motion.div 
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                className="space-y-6"
              >
                {/* Signal Card */}
                <div className={cn(
                  "p-6 rounded-2xl border-2 flex flex-col gap-5 relative overflow-hidden transition-all duration-500",
                  ['COMPRA', 'CALL'].includes(signal.type) ? "bg-green-500/10 border-green-500/30 shadow-[0_0_30px_-10px_rgba(34,197,94,0.3)]" : 
                  ['VENDA', 'PUT'].includes(signal.type) ? "bg-red-500/10 border-red-500/30 shadow-[0_0_30px_-10px_rgba(239,68,68,0.3)]" : 
                  signal.type === 'AGUARDAR' ? "bg-amber-500/10 border-amber-500/30 shadow-[0_0_30px_-10px_rgba(245,158,11,0.2)]" :
                  "bg-zinc-900 border-zinc-800"
                )}>
                  {/* Decorative Background Icon */}
                  <div className="absolute -right-4 -bottom-4 opacity-10 rotate-12">
                    {['COMPRA', 'CALL'].includes(signal.type) ? <ArrowUpRight size={120} /> : 
                     ['VENDA', 'PUT'].includes(signal.type) ? <ArrowDownRight size={120} /> :
                     <ShieldAlert size={120} />}
                  </div>

                  <div className="flex items-start justify-between relative z-10 gap-4">
                    <div className="flex flex-col min-w-0">
                      <span className="text-[10px] font-mono uppercase tracking-[0.2em] text-zinc-500 mb-1 shrink-0">
                        {['CALL', 'PUT'].includes(signal.type) ? 'PRÓXIMA VELA' : 'RECOMENDAÇÃO'}
                      </span>
                      <div className={cn(
                        "text-2xl sm:text-3xl font-black italic tracking-tighter truncate",
                        ['COMPRA', 'CALL'].includes(signal.type) ? "text-green-500" : 
                        ['VENDA', 'PUT'].includes(signal.type) ? "text-red-500" : 
                        signal.type === 'AGUARDAR' ? "text-amber-500" :
                        "text-zinc-100"
                      )}>
                        {signal.type}
                      </div>
                    </div>
                    <div className="text-right shrink-0">
                      <span className="text-[10px] font-mono uppercase tracking-widest text-zinc-500 block mb-1">Confiança</span>
                      <div className="flex items-center gap-2 justify-end">
                        <div className="w-12 sm:w-16 h-1.5 bg-zinc-800 rounded-full overflow-hidden">
                          <div 
                            className={cn(
                              "h-full transition-all duration-1000",
                              signal.confidence > 80 ? "bg-green-500" : "bg-amber-500"
                            )}
                            style={{ width: `${signal.confidence > 1 ? signal.confidence : signal.confidence * 100}%` }}
                          />
                        </div>
                        <span className="text-xs font-bold text-zinc-100">
                          {isNaN(signal.confidence) ? 0 : (signal.confidence > 1 ? Math.round(signal.confidence) : Math.round(signal.confidence * 100))}%
                        </span>
                      </div>
                    </div>
                  </div>
                    
                    <div className="flex items-center justify-between px-1">
                      <div className="flex flex-col">
                        <span className="text-[9px] font-mono uppercase text-zinc-500">Confluência Sniper</span>
                        <div className="flex items-center gap-1 mt-0.5">
                          {[...Array(6)].map((_, i) => (
                            <div 
                              key={i} 
                              className={cn(
                                "w-3 h-1.5 rounded-sm transition-all duration-500",
                                i < signal.confluenceScore ? "bg-amber-500 shadow-[0_0_8px_rgba(245,158,11,0.5)]" : "bg-zinc-800"
                              )} 
                            />
                          ))}
                          <span className="ml-1 text-[10px] font-black text-amber-500">{isNaN(signal.confluenceScore) ? 0 : signal.confluenceScore}/6</span>
                        </div>
                      </div>
                      <div className="text-right flex flex-col items-end shrink-0">
                        <span className="text-[9px] font-mono uppercase text-zinc-500">Fase do Mercado</span>
                        <span className="text-[10px] font-bold text-zinc-300 uppercase tracking-tight">{signal.marketPhase}</span>
                      </div>
                    </div>
                    
                    <div className="p-4 bg-black/40 rounded-xl border border-white/5 relative z-10">
                    {signal.type === 'AGUARDAR' ? (
                      <div className="space-y-2">
                        <div className="text-[9px] font-mono uppercase text-amber-500/60">Motivo da Pausa</div>
                        <p className="text-xs text-zinc-300 leading-relaxed italic">
                          "{signal.reasoning}"
                        </p>
                      </div>
                    ) : (
                      <div className="space-y-4">
                        <div className="flex justify-between items-center">
                          <div className="flex flex-col">
                            <div className="text-[9px] font-mono uppercase text-zinc-500 mb-1">Tempo de Expiração</div>
                            <div className="text-sm font-bold text-zinc-100 italic">5 Minutos (M5)</div>
                          </div>
                        </div>
                        
                        {signal.confirmation && (
                          <div className="p-3 bg-green-500/5 rounded-lg border border-green-500/20">
                            <div className="text-[9px] font-mono uppercase text-green-500/60 mb-1">Gatilho de Confirmação</div>
                            <p className="text-[11px] text-green-200 leading-snug font-medium">
                              {signal.confirmation}
                            </p>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                </div>

                {/* Analysis Details */}
                <div className="space-y-4">
                  <h4 className="text-xs font-bold text-zinc-100 uppercase tracking-wider">Padrões Identificados</h4>
                  
                  {signal.structures?.patterns && (
                    <div className="p-4 bg-amber-500/10 rounded-xl border border-amber-500/20">
                      <div className="text-[9px] font-mono uppercase text-amber-500/60 mb-1">Padrão de Vela</div>
                      <div className="text-sm font-black text-amber-500 uppercase tracking-tight">{signal.structures?.patterns}</div>
                    </div>
                  )}

                  <div className="grid grid-cols-2 gap-2">
                    <ConfluenceItem label="Tendência" value={signal.structures?.trend || 'N/A'} />
                    <ConfluenceItem label="LTA / LTB" value={signal.structures?.lta_ltb || 'N/A'} />
                    <ConfluenceItem label="RSI" value={signal.structures?.indicators?.rsi || 'N/A'} />
                    <ConfluenceItem label="MACD" value={signal.structures?.indicators?.macd || 'N/A'} />
                    <ConfluenceItem label="Volume" value={signal.structures?.indicators?.volume || 'N/A'} />
                  </div>

                  {signal.structures?.strategyBreakdown && signal.structures.strategyBreakdown.length > 0 && (
                    <div className="space-y-3">
                      <h4 className="text-[10px] font-bold text-zinc-100 uppercase tracking-wider flex items-center gap-2">
                        <ShieldCheck size={14} className="text-amber-500" />
                        Protocolo Sniper (6 Blocos)
                      </h4>
                      <div className="grid grid-cols-1 gap-2">
                        {signal.structures.strategyBreakdown.map((block, idx) => (
                          <div key={idx} className="p-3 bg-zinc-900/80 border border-zinc-800 rounded-xl flex items-start gap-3">
                            <div className={cn(
                              "w-2 h-2 rounded-full mt-1 shrink-0",
                              block.status === 'CONFIRMADO' ? "bg-green-500 shadow-[0_0_8px_rgba(34,197,94,0.5)]" :
                              block.status === 'AGUARDAR' ? "bg-amber-500 shadow-[0_0_8px_rgba(245,158,11,0.5)]" :
                              "bg-red-500 shadow-[0_0_8px_rgba(239,68,68,0.5)]"
                            )} />
                            <div className="flex flex-col gap-0.5">
                              <div className="flex items-center gap-2">
                                <span className="text-[10px] font-black text-zinc-100 uppercase tracking-tight">{block.name}</span>
                                <span className={cn(
                                  "text-[8px] font-mono px-1.5 py-0.5 rounded uppercase",
                                  block.status === 'CONFIRMADO' ? "bg-green-500/10 text-green-500" :
                                  block.status === 'AGUARDAR' ? "bg-amber-500/10 text-amber-500" :
                                  "bg-red-500/10 text-red-500"
                                )}>
                                  {block.status}
                                </span>
                              </div>
                              <p className="text-[10px] text-zinc-400 leading-tight">{block.detail}</p>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {signal.structures?.confluences && signal.structures.confluences.length > 0 && (
                    <div className="space-y-2">
                      <span className="text-[10px] font-mono uppercase opacity-50">Checklist de Confluência</span>
                      <div className="grid grid-cols-1 gap-1">
                        {signal.structures.confluences.map((c, i) => (
                          <div key={i} className="flex items-center gap-2 text-[10px] text-green-400 bg-green-500/5 border border-green-500/10 px-2 py-1 rounded">
                            <div className="w-1 h-1 rounded-full bg-green-500" />
                            {c}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                  
                  <div className="p-4 bg-zinc-900/50 rounded-xl border border-zinc-800">
                    <span className="text-[10px] font-mono uppercase opacity-50 block mb-2">Análise Técnica</span>
                    <p className="text-xs leading-relaxed text-zinc-300">
                      {signal.reasoning}
                    </p>
                  </div>

                  {showFootprint && signal.structures?.footprint && (
                    <div className="space-y-3 pt-4 border-t border-zinc-800">
                      <div className="flex items-center justify-between">
                        <h4 className="text-xs font-bold text-zinc-100 uppercase tracking-wider flex items-center gap-2">
                          <Activity size={14} className="text-amber-500" />
                          Order Flow Footprint
                        </h4>
                        <div className="flex items-center gap-3">
                          <div className="flex items-center gap-1">
                            <div className="w-2 h-2 bg-amber-500 rounded-full" />
                            <span className="text-[9px] text-zinc-500 uppercase font-mono">POC</span>
                          </div>
                        </div>
                      </div>

                      <div className="bg-black/60 rounded-xl border border-white/5 overflow-hidden shadow-2xl">
                        <div className="grid grid-cols-[1fr_1.5fr_1fr_1fr] text-[9px] font-mono uppercase text-zinc-500 bg-zinc-900/80 p-2.5 border-b border-white/5">
                          <span className="pl-2">Bid Vol</span>
                          <span className="text-center">Nível de Preço</span>
                          <span className="text-center">Ask Vol</span>
                          <span className="text-right pr-2">Delta</span>
                        </div>
                        <div className="max-h-64 overflow-y-auto custom-scrollbar">
                          {(() => {
                            const footprint = signal.structures?.footprint || [];
                            if (footprint.length === 0) return null;
                            
                            const maxVol = Math.max(...footprint.map(f => (f.totalVolume || (f.bid + f.ask))));
                            const pocPrice = footprint.reduce((prev, current) => 
                              ((current.totalVolume || (current.bid + current.ask)) > (prev.totalVolume || (prev.bid + prev.ask))) ? current : prev
                            , footprint[0]).price;

                            return footprint.map((f, i) => {
                              const totalVol = f.totalVolume || (f.bid + f.ask);
                              const delta = f.delta !== undefined ? f.delta : (f.ask - f.bid);
                              const isPOC = f.price === pocPrice;
                              const volPercent = (totalVol / maxVol) * 100;

                              return (
                                <div 
                                  key={i} 
                                  className={cn(
                                    "grid grid-cols-[1fr_1.5fr_1fr_1fr] p-2 text-[10px] font-mono border-b border-white/5 last:border-0 items-center relative group transition-colors hover:bg-white/5",
                                    isPOC && "bg-amber-500/5"
                                  )}
                                >
                                  {/* Volume Intensity Bar */}
                                  <div 
                                    className={cn(
                                      "absolute inset-y-0 left-0 opacity-10 transition-all duration-500",
                                      delta > 0 ? "bg-green-500" : delta < 0 ? "bg-red-500" : "bg-zinc-500"
                                    )}
                                    style={{ width: `${volPercent}%` }}
                                  />

                                  {/* Bid Column */}
                                  <div className={cn(
                                    "flex items-center gap-2 pl-2 relative z-10",
                                    f.bid > f.ask ? "text-red-400 font-bold" : "text-zinc-500"
                                  )}>
                                    <div className="w-1 h-3 bg-red-500/20 rounded-full overflow-hidden">
                                      <div 
                                        className="h-full bg-red-500" 
                                        style={{ height: `${(f.bid / totalVol) * 100}%` }}
                                      />
                                    </div>
                                    {isNaN(f.bid) ? 0 : f.bid}
                                  </div>

                                  {/* Price Column (POC Highlight) */}
                                  <div className="text-center relative z-10">
                                    <span className={cn(
                                      "px-2 py-0.5 rounded font-bold transition-all",
                                      isPOC ? "bg-amber-500 text-zinc-900 shadow-[0_0_10px_rgba(245,158,11,0.4)]" : "text-zinc-400 bg-zinc-800/30"
                                    )}>
                                      {isNaN(f.price) ? '0.00000' : f.price.toFixed(5)}
                                    </span>
                                  </div>

                                  {/* Ask Column */}
                                  <div className={cn(
                                    "text-center flex items-center justify-center gap-2 relative z-10",
                                    f.ask > f.bid ? "text-green-400 font-bold" : "text-zinc-500"
                                  )}>
                                    {isNaN(f.ask) ? 0 : f.ask}
                                    <div className="w-1 h-3 bg-green-500/20 rounded-full overflow-hidden">
                                      <div 
                                        className="h-full bg-green-500" 
                                        style={{ height: `${(f.ask / totalVol) * 100}%` }}
                                      />
                                    </div>
                                  </div>

                                  {/* Delta Column */}
                                  <div className={cn(
                                    "text-right pr-2 font-bold relative z-10",
                                    delta > 0 ? "text-green-500" : delta < 0 ? "text-red-500" : "text-zinc-500"
                                  )}>
                                    {isNaN(delta) ? 0 : (delta > 0 ? `+${delta}` : delta)}
                                  </div>
                                </div>
                              );
                            });
                          })()}
                        </div>
                        <div className="p-2 bg-zinc-900/80 border-t border-white/5 flex justify-between items-center px-4">
                          <div className="flex flex-col">
                            <span className="text-[7px] font-mono text-zinc-500 uppercase tracking-widest">Total Venda</span>
                            <span className="text-[10px] font-bold text-red-500">{signal.structures?.footprint?.reduce((acc, curr) => acc + (Number(curr.bid) || 0), 0) || 0}</span>
                          </div>
                          <div className="flex flex-col items-center">
                            <span className="text-[7px] font-mono text-zinc-500 uppercase tracking-widest">Delta Total</span>
                            <span className={cn(
                              "text-[10px] font-bold",
                              (signal.structures?.footprint?.reduce((acc, curr) => acc + ((Number(curr.ask) || 0) - (Number(curr.bid) || 0)), 0) || 0) > 0 ? "text-green-500" : "text-red-500"
                            )}>
                              {(signal.structures?.footprint?.reduce((acc, curr) => acc + ((Number(curr.ask) || 0) - (Number(curr.bid) || 0)), 0) || 0) > 0 ? "+" : ""}
                              {signal.structures?.footprint?.reduce((acc, curr) => acc + ((Number(curr.ask) || 0) - (Number(curr.bid) || 0)), 0) || 0}
                            </span>
                          </div>
                          <div className="flex flex-col text-right">
                            <span className="text-[7px] font-mono text-zinc-500 uppercase tracking-widest">Total Compra</span>
                            <span className="text-[10px] font-bold text-green-500">{signal.structures?.footprint?.reduce((acc, curr) => acc + (Number(curr.ask) || 0), 0) || 0}</span>
                          </div>
                        </div>
                      </div>
                    </div>
                  )}

                  <div className="space-y-2">
                    <span className="text-[10px] font-mono uppercase opacity-50">Zonas de Retração/Romper</span>
                    <div className="flex flex-wrap gap-2">
                      {signal.structures?.fvg?.map((f, i) => (
                        <span key={i} className="text-[10px] bg-zinc-900 border border-zinc-800 px-2 py-1 rounded text-zinc-400">
                          Zona: {f}
                        </span>
                      ))}
                    </div>
                  </div>
                </div>
              </motion.div>
            ) : (
              <div className="h-full flex flex-col items-center justify-center text-center space-y-4 opacity-40 py-20">
                <ShieldAlert size={48} strokeWidth={1} />
                <div className="space-y-1">
                  <p className="text-sm font-medium">Aguardando Captura</p>
                  <p className="text-xs">Capture a tela do seu gráfico OTC para receber a análise vela a vela.</p>
                </div>
              </div>
            )}
          </AnimatePresence>
        </div>
      </aside>

      {/* Modal de Chaves API */}
      {/* Modal Broker Login */}
      <AnimatePresence>
        {showBrokerModal && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setShowBrokerModal(false)}
              className="absolute inset-0 bg-black/80 backdrop-blur-sm"
            />
            <motion.div 
              initial={{ opacity: 0, scale: 0.9, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9, y: 20 }}
              className="relative w-full max-w-md bg-zinc-900 border border-zinc-800 rounded-2xl shadow-2xl overflow-hidden"
            >
              <div className="p-6 border-b border-zinc-800 flex items-center justify-between bg-zinc-900/50">
                <h3 className="text-lg font-bold text-zinc-100 flex items-center gap-2">
                  <Zap className="text-amber-500" size={20} />
                  Conectar Corretora (API)
                </h3>
                <button onClick={() => setShowBrokerModal(false)} className="text-zinc-500 hover:text-zinc-300">
                  <X size={20} />
                </button>
              </div>
              
              <div className="p-6 space-y-4">
                <div className="space-y-1.5">
                  <label className="text-[10px] font-bold text-zinc-500 uppercase ml-1">Corretora</label>
                  <div className="grid grid-cols-2 gap-2">
                    <button 
                      onClick={() => setBrokerBaseUrl('iqoption.com')}
                      className={cn(
                        "px-4 py-2 rounded-xl text-xs font-bold border transition-all",
                        brokerBaseUrl === 'iqoption.com' ? "bg-amber-500/10 border-amber-500 text-amber-500" : "bg-zinc-950 border-zinc-800 text-zinc-500 hover:border-zinc-700"
                      )}
                    >
                      IQ Option
                    </button>
                    <button 
                      onClick={() => setBrokerBaseUrl('bullex.com')}
                      className={cn(
                        "px-4 py-2 rounded-xl text-xs font-bold border transition-all",
                        brokerBaseUrl === 'bullex.com' ? "bg-amber-500/10 border-amber-500 text-amber-500" : "bg-zinc-950 border-zinc-800 text-zinc-500 hover:border-zinc-700"
                      )}
                    >
                      Bullex
                    </button>
                  </div>
                  {brokerBaseUrl !== 'iqoption.com' && brokerBaseUrl !== 'bullex.com' && (
                    <input 
                      type="text"
                      value={brokerBaseUrl}
                      onChange={(e) => setBrokerBaseUrl(e.target.value)}
                      placeholder="ex: corretora.com"
                      className="w-full mt-2 bg-zinc-950 border border-zinc-800 rounded-xl px-4 py-2 text-xs focus:outline-none focus:border-amber-500/50 transition-colors"
                    />
                  )}
                  <button 
                    onClick={() => setBrokerBaseUrl('')}
                    className="text-[9px] text-zinc-600 hover:text-zinc-400 mt-1 ml-1 underline"
                  >
                    Outra corretora?
                  </button>
                </div>

                <div className="bg-amber-500/10 border border-amber-500/20 p-3 rounded-lg">
                  <p className="text-[10px] text-amber-500 leading-relaxed">
                    <strong>Aviso de Segurança:</strong> Seus dados são usados apenas para gerar o SSID de conexão e não são armazenados em nosso servidor. Recomendamos usar uma conta de treinamento para testes.
                  </p>
                </div>

                <div className="space-y-4">
                  <div className="space-y-1.5">
                    <label className="text-[10px] font-bold text-zinc-500 uppercase ml-1">E-mail da Corretora</label>
                    <input 
                      type="email"
                      value={brokerEmail}
                      onChange={(e) => setBrokerEmail(e.target.value)}
                      placeholder="seu@email.com"
                      className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-amber-500/50 transition-colors"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-[10px] font-bold text-zinc-500 uppercase ml-1">Senha</label>
                    <input 
                      type="password"
                      value={brokerPassword}
                      onChange={(e) => setBrokerPassword(e.target.value)}
                      placeholder="••••••••"
                      className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-amber-500/50 transition-colors"
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <label className="text-xs font-semibold text-zinc-500 uppercase tracking-wider">Ou insira o SSID manualmente</label>
                  <input 
                    type="text"
                    value={manualSSID}
                    onChange={(e) => setManualSSID(e.target.value)}
                    placeholder="Cole o SSID aqui"
                    className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-amber-500/50 transition-colors"
                  />
                  <button 
                    onClick={loginWithSSID}
                    disabled={isBrokerLoggingIn || !manualSSID}
                    className="w-full py-3 bg-zinc-800 text-white rounded-xl font-bold text-sm hover:bg-zinc-700 transition-all disabled:opacity-50"
                  >
                    {isBrokerLoggingIn ? 'Conectando...' : 'CONECTAR COM SSID'}
                  </button>
                </div>

                <button 
                  onClick={loginToBroker}
                  disabled={isBrokerLoggingIn || !brokerEmail || !brokerPassword}
                  className="w-full py-4 bg-amber-500 text-zinc-900 rounded-xl font-black text-sm hover:bg-amber-600 transition-all active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                >
                  {isBrokerLoggingIn ? (
                    <>
                      <RefreshCw size={18} className="animate-spin" />
                      {brokerLoginStep || 'AUTENTICANDO...'}
                    </>
                  ) : (
                    <>
                      <Zap size={18} />
                      CONECTAR AGORA
                    </>
                  )}
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {showKeyModal && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setShowKeyModal(false)}
              className="absolute inset-0 bg-black/80 backdrop-blur-sm"
            />
            <motion.div 
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="relative w-full max-w-md bg-zinc-900 border border-zinc-800 rounded-2xl shadow-2xl overflow-hidden"
            >
              <div className="p-6 border-b border-zinc-800 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 bg-amber-500/10 rounded-lg flex items-center justify-center">
                    <Settings className="w-4 h-4 text-amber-500" />
                  </div>
                  <div>
                    <h3 className="text-zinc-100 font-bold">Configurações de API</h3>
                    <p className="text-[10px] text-zinc-500 uppercase tracking-wider">Gerenciador de Chaves Gemini</p>
                  </div>
                </div>
                <button 
                  onClick={() => setShowKeyModal(false)}
                  className="text-zinc-500 hover:text-zinc-300 transition-colors"
                >
                  <RefreshCw className="w-4 h-4 rotate-45" />
                </button>
              </div>

              <div className="p-6 space-y-6">
                <div className="space-y-3">
                  <label className="text-[10px] font-mono uppercase text-zinc-500 tracking-widest">Adicionar Nova Chave</label>
                  <div className="flex gap-2">
                    <input 
                      type="password"
                      value={newKey}
                      onChange={(e) => setNewKey(e.target.value)}
                      placeholder="Cole sua chave API aqui..."
                      className="flex-1 bg-black border border-zinc-800 rounded-lg px-4 py-2 text-sm text-zinc-100 focus:outline-none focus:border-amber-500/50 transition-colors"
                    />
                    <button 
                      onClick={addKey}
                      className="px-4 py-2 bg-amber-500 text-zinc-900 rounded-lg text-xs font-black hover:bg-amber-600 transition-all active:scale-95"
                    >
                      ADD
                    </button>
                  </div>
                  <p className="text-[10px] text-zinc-500 italic">As chaves são salvas apenas no seu navegador.</p>
                </div>

                <div className="space-y-3">
                  <label className="text-[10px] font-mono uppercase text-zinc-500 tracking-widest">Minhas Chaves ({apiKeys.length})</label>
                  <div className="max-h-48 overflow-y-auto space-y-2 pr-2 custom-scrollbar">
                    {apiKeys.length === 0 ? (
                      <div className="text-center py-8 border border-dashed border-zinc-800 rounded-xl">
                        <p className="text-xs text-zinc-600">Nenhuma chave pessoal adicionada.</p>
                      </div>
                    ) : (
                      apiKeys.map((key, index) => (
                        <div key={index} className="flex items-center justify-between p-3 bg-black rounded-lg border border-zinc-800 group">
                          <div className="flex items-center gap-3">
                            <div className="w-2 h-2 rounded-full bg-green-500" />
                            <span className="text-xs font-mono text-zinc-400">
                              {key.substring(0, 6)}...{key.substring(key.length - 4)}
                            </span>
                          </div>
                          <button 
                            onClick={() => removeKey(index)}
                            className="text-zinc-600 hover:text-red-500 transition-colors opacity-0 group-hover:opacity-100"
                          >
                            <RefreshCw className="w-3 h-3 rotate-45" />
                          </button>
                        </div>
                      ))
                    )}
                  </div>
                </div>

                <div className="p-4 bg-amber-500/5 border border-amber-500/10 rounded-xl">
                  <p className="text-[11px] text-amber-500/80 leading-relaxed">
                    <strong>Dica Sniper:</strong> O sistema alterna automaticamente entre suas chaves caso uma atinja o limite de cota do Google. Quanto mais chaves, mais análises seguidas você pode fazer.
                  </p>
                </div>
              </div>

              <div className="p-4 bg-zinc-900/50 border-t border-zinc-800 flex justify-end">
                <button 
                  onClick={() => setShowKeyModal(false)}
                  className="px-6 py-2 bg-zinc-100 text-zinc-900 rounded-lg text-xs font-black hover:bg-white transition-all active:scale-95"
                >
                  CONCLUÍDO
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}

function NavItem({ icon, label, active = false }: { icon: React.ReactNode, label: string, active?: boolean }) {
  return (
    <button className={cn(
      "w-full flex items-center gap-3 px-4 py-2.5 rounded-xl text-sm font-medium transition-all",
      active ? "bg-zinc-100 text-zinc-900" : "hover:bg-zinc-900 text-zinc-500 hover:text-zinc-300"
    )}>
      {icon}
      {label}
    </button>
  );
}

function StatCard({ label, value }: { label: string, value: string }) {
  return (
    <div className="px-4 py-2 bg-[#09090b]/80 backdrop-blur-md border border-zinc-800 rounded-xl">
      <div className="text-[9px] font-mono uppercase text-zinc-500">{label}</div>
      <div className="text-sm font-mono text-zinc-100">{value}</div>
    </div>
  );
}

function FilterBadge({ label, active = false }: { label: string, active?: boolean }) {
  return (
    <button className={cn(
      "px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider transition-all",
      active ? "bg-zinc-100 text-zinc-900" : "bg-zinc-900 text-zinc-500 border border-zinc-800"
    )}>
      {label}
    </button>
  );
}

function ConfluenceItem({ label, value }: { label: string, value: string }) {
  return (
    <div className="p-3 bg-zinc-900/50 rounded-xl border border-zinc-800">
      <div className="text-[9px] font-mono uppercase text-zinc-500 mb-1">{label}</div>
      <div className="text-xs font-bold text-zinc-100">{value}</div>
    </div>
  );
}
