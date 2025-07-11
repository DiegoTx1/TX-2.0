// =============================================
// CONFIGURAÇÕES GLOBAIS (ATUALIZADAS PARA EURUSD)
// =============================================
const state = {
  ultimos: [],
  timer: 60,
  ultimaAtualizacao: "",
  leituraEmAndamento: false,
  intervaloAtual: null,
  tentativasErro: 0,
  ultimoSinal: null,
  ultimoScore: 0,
  contadorLaterais: 0,
  marketOpen: true,
  tendenciaDetectada: "NEUTRA",
  forcaTendencia: 0,
  dadosHistoricos: [],
  resistenciaKey: 0,
  suporteKey: 0,
  // Inicialização de caches
  rsiCache: { avgGain: 0, avgLoss: 0, initialized: false },
  emaCache: {
    ema5: null,
    ema13: null,
    ema200: null
  },
  macdCache: {
    emaRapida: null,
    emaLenta: null,
    macdLine: [],
    signalLine: []
  },
  superTrendCache: [],
  atrGlobal: 0,
  rsiHistory: [],
  cooldown: 0
};

const CONFIG = {
  API_ENDPOINTS: {
    TWELVE_DATA: "https://api.twelvedata.com"
  },
  PARES: {
    FOREX_IDX: "EUR/USD"
  },
  PERIODOS: {
    RSI: 9,
    STOCH_K: 14,
    STOCH_D: 3,
    EMA_CURTA: 5,
    EMA_MEDIA: 13,
    EMA_LONGA: 200,
    MACD_RAPIDA: 6,
    MACD_LENTA: 13,
    MACD_SINAL: 9,
    VELAS_CONFIRMACAO: 3,
    ANALISE_LATERAL: 20,
    ATR: 14,
    SUPERTREND: 7,
    DIVERGENCIA_LOOKBACK: 8,
    EXTREME_LOOKBACK: 2
  },
  LIMIARES: {
    SCORE_ALTO: 85,
    SCORE_MEDIO: 70,
    RSI_OVERBOUGHT: 70,
    RSI_OVERSOLD: 30,
    STOCH_OVERBOUGHT: 85,
    STOCH_OVERSOLD: 15,
    VARIACAO_LATERAL: 0.0003,
    ATR_LIMIAR: 0.00015,
    LATERALIDADE_LIMIAR: 0.0003
  },
  PESOS: {
    RSI: 1.7,
    MACD: 2.2,
    TENDENCIA: 2.8,
    STOCH: 1.2,
    SUPERTREND: 1.9,
    DIVERGENCIA: 2.0
  }
};

// =============================================
// GERENCIADOR DE CHAVES API (SUA CHAVE INTEGRADA)
// =============================================
const API_KEYS = [
  "0105e6681b894e0185704171c53f5075"  // SUA CHAVE AQUI
];

// =============================================
// SISTEMA DE PROXY ATUALIZADO (SEM LIMITAÇÕES)
// =============================================
async function obterDadosTwelveData() {
  try {
    const apiKey = API_KEYS[0];
    const PROXY_URL = "https://corsproxy.io/?";
    const API_URL = `${CONFIG.API_ENDPOINTS.TWELVE_DATA}/time_series?symbol=${CONFIG.PARES.FOREX_IDX}&interval=1min&outputsize=100&apikey=${apiKey}`;
    
    const response = await fetch(PROXY_URL + encodeURIComponent(API_URL));
    
    if (!response.ok) {
      throw new Error(`Falha na API: ${response.status}`);
    }
    
    const data = await response.json();
    
    if (data.status === 'error') {
      throw new Error(data.message || `Erro Twelve Data: ${data.code}`);
    }
    
    const valores = data.values ? data.values.reverse() : [];
    
    return valores.map(item => ({
      time: item.datetime,
      open: parseFloat(item.open),
      high: parseFloat(item.high),
      low: parseFloat(item.low),
      close: parseFloat(item.close),
      volume: parseFloat(item.volume) || 1
    }));
  } catch (e) {
    console.error("Erro ao obter dados:", e);
    throw e;
  }
}

// =============================================
// SISTEMA DE TENDÊNCIA OTIMIZADO PARA FOREX
// =============================================
function avaliarTendencia(ema5, ema13) {
  const diff = ema5 - ema13;
  const forca = Math.min(100, Math.abs(diff * 10000));
  
  if (forca > 75) {
    return diff > 0 
      ? { tendencia: "FORTE_ALTA", forca }
      : { tendencia: "FORTE_BAIXA", forca };
  }
  
  if (forca > 40) {
    return diff > 0 
      ? { tendencia: "ALTA", forca } 
      : { tendencia: "BAIXA", forca };
  }
  
  return { tendencia: "NEUTRA", forca: 0 };
}

// =============================================
// DETECÇÃO DE LATERALIDADE (CHOPP INDEX)
// =============================================
function detectarLateralidade(closes, periodo = CONFIG.PERIODOS.ANALISE_LATERAL, limiar = CONFIG.LIMIARES.LATERALIDADE_LIMIAR) {
  const variacoes = [];
  for (let i = 1; i < periodo; i++) {
    if (closes.length - i - 1 < 0) break;
    variacoes.push(Math.abs(closes[closes.length - i] - closes[closes.length - i - 1]));
  }
  if (variacoes.length < periodo - 1) return false;
  const mediaVariacao = calcularMedia.simples(variacoes, periodo-1);
  return mediaVariacao < limiar;
}

// =============================================
// CÁLCULO DINÂMICO DE SUPORTE/RESISTÊNCIA
// =============================================
function calcularZonasPreco(dados, periodo = 50) {
  if (dados.length < periodo) periodo = dados.length;
  const slice = dados.slice(-periodo);
  const highs = slice.map(v => v.high);
  const lows = slice.map(v => v.low);
  return {
    resistencia: Math.max(...highs),
    suporte: Math.min(...lows),
    pivot: (Math.max(...highs) + Math.min(...lows) + dados[dados.length-1].close) / 3
  };
}

// =============================================
// GERADOR DE SINAIS DE ALTA PRECISÃO PARA EURUSD
// =============================================
function gerarSinal(indicadores, divergencias, lateral) {
  const {
    rsi,
    stoch,
    macd,
    close,
    emaCurta,
    emaMedia,
    superTrend,
    tendencia
  } = indicadores;
  
  // Cálculo de suporte/resistência
  const zonas = calcularZonasPreco(state.dadosHistoricos);
  state.suporteKey = zonas.suporte;
  state.resistenciaKey = zonas.resistencia;
  
  // Forçar espera em lateralidade
  if (lateral) {
    return "ESPERAR";
  }

  // Priorizar tendência forte
  if (tendencia.forca > 80) {
    if (tendencia.tendencia === "FORTE_ALTA" && close > emaCurta && macd.histograma > 0) {
      return "CALL";
    }
    if (tendencia.tendencia === "FORTE_BAIXA" && close < emaCurta && macd.histograma < 0) {
      return "PUT";
    }
  }

  if (tendencia.tendencia === "FORTE_ALTA") {
    const condicoesCompra = [
      close > emaCurta,
      macd.histograma > 0,
      stoch.k > 60,
      close > superTrend.valor && superTrend.direcao > 0
    ];
    
    if (condicoesCompra.filter(Boolean).length >= 3) {
      return "CALL";
    }
  }
  
  if (tendencia.tendencia === "FORTE_BAIXA") {
    const condicoesVenda = [
      close < emaCurta,
      macd.histograma < 0,
      stoch.k < 40,
      close < superTrend.valor && superTrend.direcao < 0
    ];
    
    if (condicoesVenda.filter(Boolean).length >= 3) {
      return "PUT";
    }
  }
  
  const variacao = state.resistenciaKey - state.suporteKey;
  const limiteBreakout = variacao * 0.1;
  
  if (close > (state.resistenciaKey + limiteBreakout)) {
    return "CALL";
  }
  
  if (close < (state.suporteKey - limiteBreakout)) {
    return "PUT";
  }
  
  if (divergencias.divergenciaRSI) {
    if (divergencias.tipoDivergencia === "ALTA" && close > state.suporteKey) {
      return "CALL";
    }
    
    if (divergencias.tipoDivergencia === "BAIXA" && close < state.resistenciaKey) {
      return "PUT";
    }
  }
  
  if (rsi < 25 && close > emaMedia) {
    return "CALL";
  }
  
  if (rsi > 75 && close < emaMedia) {
    return "PUT";
  }
  
  return "ESPERAR";
}

// =============================================
// CALCULADOR DE CONFIANÇA PRECISO (OTIMIZADO)
// =============================================
function calcularScore(sinal, indicadores, divergencias) {
  let score = 65;

  const fatores = {
    alinhamentoTendencia: sinal === "CALL" && indicadores.tendencia.tendencia.includes("ALTA") ||
                          sinal === "PUT" && indicadores.tendencia.tendencia.includes("BAIXA") ? 25 : 0,
    divergencia: divergencias.divergenciaRSI ? 20 : 0,
    posicaoMedia: sinal === "CALL" && indicadores.close > indicadores.emaMedia ? 15 : 
                  sinal === "PUT" && indicadores.close < indicadores.emaMedia ? 15 : 0,
    superTrend: sinal === "CALL" && indicadores.close > indicadores.superTrend.valor ? 10 :
                sinal === "PUT" && indicadores.close < indicadores.superTrend.valor ? 10 : 0
  };
  
  score += Object.values(fatores).reduce((sum, val) => sum + val, 0);
  
  return Math.min(100, Math.max(0, score));
}

// =============================================
// FUNÇÕES UTILITÁRIAS
// =============================================
function formatarTimer(segundos) {
  return `0:${segundos.toString().padStart(2, '0')}`;
}

function atualizarRelogio() {
  const elementoHora = document.getElementById("hora");
  if (elementoHora) {
    const now = new Date();
    state.ultimaAtualizacao = now.toLocaleTimeString("pt-BR", {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit'
    });
    elementoHora.textContent = state.ultimaAtualizacao;
    state.marketOpen = true;
  }
}

function tocarSom(sinal) {
  try {
    const audio = new Audio();
    
    if (sinal === "CALL") {
      audio.src = "https://www.soundjay.com/buttons/sounds/button-09.mp3";
    } else if (sinal === "PUT") {
      audio.src = "https://www.soundjay.com/buttons/sounds/button-08.mp3";
    } else {
      return;
    }
    
    audio.play().catch(e => console.log("Erro ao tocar som:", e));
  } catch (e) {
    console.error("Erro no player de áudio:", e);
  }
}

function atualizarInterface(sinal, score, tendencia, forcaTendencia) {
  if (!state.marketOpen) return;
  
  const comandoElement = document.getElementById("comando");
  if (comandoElement) {
    comandoElement.textContent = sinal;
    comandoElement.className = sinal.toLowerCase();
    
    if (sinal === "CALL") {
      comandoElement.textContent += " 📈";
      tocarSom("CALL");
    } else if (sinal === "PUT") {
      comandoElement.textContent += " 📉";
      tocarSom("PUT");
    } else if (sinal === "ESPERAR") {
      comandoElement.textContent += " ✋";
    }
  }
  
  const scoreElement = document.getElementById("score");
  if (scoreElement) {
    scoreElement.textContent = `Confiança: ${score}%`;
    if (score >= CONFIG.LIMIARES.SCORE_ALTO) scoreElement.style.color = '#00ff00';
    else if (score >= CONFIG.LIMIARES.SCORE_MEDIO) scoreElement.style.color = '#ffff00';
    else scoreElement.style.color = '#ff0000';
  }
  
  const tendenciaElement = document.getElementById("tendencia");
  const forcaElement = document.getElementById("forca-tendencia");
  if (tendenciaElement && forcaElement) {
    tendenciaElement.textContent = tendencia;
    forcaElement.textContent = `${forcaTendencia}%`;
  }
}

// =============================================
// INDICADORES TÉCNICOS (AJUSTADOS PARA FOREX)
// =============================================
const calcularMedia = {
  simples: (dados, periodo) => {
    if (!Array.isArray(dados) || dados.length < periodo) return null;
    const slice = dados.slice(-periodo);
    return slice.reduce((a, b) => a + b, 0) / periodo;
  },

  exponencial: (dados, periodo) => {
    if (!Array.isArray(dados) || dados.length < periodo) return [];
    
    const k = 2 / (periodo + 1);
    let ema = calcularMedia.simples(dados.slice(0, periodo), periodo);
    const emaArray = [ema];
    
    for (let i = periodo; i < dados.length; i++) {
      ema = dados[i] * k + ema * (1 - k);
      emaArray.push(ema);
    }
    
    return emaArray;
  }
};

function calcularRSI(closes, periodo = CONFIG.PERIODOS.RSI) {
  if (closes.length < periodo + 1) return 50;
  
  if (!state.rsiCache.initialized) {
    let gains = 0, losses = 0;
    for (let i = 1; i <= periodo; i++) {
      const diff = closes[i] - closes[i - 1];
      if (diff > 0) gains += diff;
      else losses -= diff;
    }
    
    state.rsiCache.avgGain = gains / periodo;
    state.rsiCache.avgLoss = losses / periodo;
    state.rsiCache.initialized = true;
    
    const rs = state.rsiCache.avgLoss === 0 ? Infinity : state.rsiCache.avgGain / state.rsiCache.avgLoss;
    return 100 - (100 / (1 + rs));
  }
  
  const diff = closes[closes.length - 1] - closes[closes.length - 2];
  
  if (diff > 0) {
    state.rsiCache.avgGain = ((state.rsiCache.avgGain * (periodo - 1)) + diff) / periodo;
    state.rsiCache.avgLoss = (state.rsiCache.avgLoss * (periodo - 1)) / periodo;
  } else {
    state.rsiCache.avgGain = (state.rsiCache.avgGain * (periodo - 1)) / periodo;
    state.rsiCache.avgLoss = ((state.rsiCache.avgLoss * (periodo - 1)) - diff) / periodo;
  }
  
  const rs = state.rsiCache.avgLoss === 0 ? Infinity : state.rsiCache.avgGain / state.rsiCache.avgLoss;
  return 100 - (100 / (1 + rs));
}

function calcularStochastic(highs, lows, closes, 
                          periodoK = CONFIG.PERIODOS.STOCH_K, 
                          periodoD = CONFIG.PERIODOS.STOCH_D) {
  try {
    if (closes.length < periodoK) return { k: 50, d: 50 };
    
    const kValues = [];
    for (let i = periodoK - 1; i < closes.length; i++) {
      const startIndex = Math.max(0, i - periodoK + 1);
      const sliceHigh = highs.slice(startIndex, i + 1);
      const sliceLow = lows.slice(startIndex, i + 1);
      
      if (sliceHigh.length === 0 || sliceLow.length === 0) {
        kValues.push(50);
        continue;
      }
      
      const highestHigh = Math.max(...sliceHigh);
      const lowestLow = Math.min(...sliceLow);
      const range = highestHigh - lowestLow;
      const k = range !== 0 ? ((closes[i] - lowestLow) / range) * 100 : 50;
      kValues.push(k);
    }
    
    const kSuavizado = [];
    for (let i = periodoD - 1; i < kValues.length; i++) {
      const startIndex = Math.max(0, i - periodoD + 1);
      const slice = kValues.slice(startIndex, i + 1);
      const mediaK = calcularMedia.simples(slice, periodoD) || 50;
      kSuavizado.push(mediaK);
    }
    
    const dValues = [];
    for (let i = periodoD - 1; i < kSuavizado.length; i++) {
      const startIndex = Math.max(0, i - periodoD + 1);
      const slice = kSuavizado.slice(startIndex, i + 1);
      dValues.push(calcularMedia.simples(slice, periodoD) || 50);
    }
    
    return {
      k: kSuavizado[kSuavizado.length - 1] || 50,
      d: dValues[dValues.length - 1] || 50
    };
  } catch (e) {
    console.error("Erro no cálculo Stochastic:", e);
    return { k: 50, d: 50 };
  }
}

function calcularMACD(closes, rapida = CONFIG.PERIODOS.MACD_RAPIDA, 
                    lenta = CONFIG.PERIODOS.MACD_LENTA, 
                    sinal = CONFIG.PERIODOS.MACD_SINAL) {
  try {
    if (state.macdCache.emaRapida === null || state.macdCache.emaLenta === null) {
      const emaRapida = calcularMedia.exponencial(closes, rapida);
      const emaLenta = calcularMedia.exponencial(closes, lenta);
      
      const startIdx = Math.max(0, lenta - rapida);
      const macdLinha = emaRapida.slice(startIdx).map((val, idx) => val - emaLenta[idx]);
      const sinalLinha = calcularMedia.exponencial(macdLinha, sinal);
      
      const ultimoMACD = macdLinha[macdLinha.length - 1] || 0;
      const ultimoSinal = sinalLinha[sinalLinha.length - 1] || 0;
      
      state.macdCache = {
        emaRapida: emaRapida[emaRapida.length - 1],
        emaLenta: emaLenta[emaLenta.length - 1],
        macdLine: macdLinha,
        signalLine: sinalLinha
      };
      
      return {
        histograma: ultimoMACD - ultimoSinal,
        macdLinha: ultimoMACD,
        sinalLinha: ultimoSinal
      };
    }
    
    const kRapida = 2 / (rapida + 1);
    const kLenta = 2 / (lenta + 1);
    const kSinal = 2 / (sinal + 1);
    
    const novoValor = closes[closes.length - 1];
    
    state.macdCache.emaRapida = novoValor * kRapida + state.macdCache.emaRapida * (1 - kRapida);
    state.macdCache.emaLenta = novoValor * kLenta + state.macdCache.emaLenta * (1 - kLenta);
    
    const novaMacdLinha = state.macdCache.emaRapida - state.macdCache.emaLenta;
    state.macdCache.macdLine.push(novaMacdLinha);
    
    if (state.macdCache.signalLine.length === 0) {
      state.macdCache.signalLine.push(novaMacdLinha);
    } else {
      const ultimoSinal = state.macdCache.signalLine[state.macdCache.signalLine.length - 1];
      const novoSignal = novaMacdLinha * kSinal + ultimoSinal * (1 - kSinal);
      state.macdCache.signalLine.push(novoSignal);
    }
    
    const ultimoMACD = novaMacdLinha;
    const ultimoSinal = state.macdCache.signalLine[state.macdCache.signalLine.length - 1];
    
    return {
      histograma: ultimoMACD - ultimoSinal,
      macdLinha: ultimoMACD,
      sinalLinha: ultimoSinal
    };
  } catch (e) {
    console.error("Erro no cálculo MACD:", e);
    return { histograma: 0, macdLinha: 0, sinalLinha: 0 };
  }
}

function calcularATR(dados, periodo = CONFIG.PERIODOS.ATR) {
  try {
    if (!Array.isArray(dados) || dados.length < periodo + 1) return 0;
    
    const trValues = [];
    for (let i = 1; i < dados.length; i++) {
      const tr = Math.max(
        dados[i].high - dados[i].low,
        Math.abs(dados[i].high - dados[i-1].close),
        Math.abs(dados[i].low - dados[i-1].close)
      );
      trValues.push(tr);
    }
    
    return calcularMedia.simples(trValues.slice(-periodo), periodo);
  } catch (e) {
    console.error("Erro no cálculo ATR:", e);
    return 0;
  }
}

function calcularSuperTrend(dados, periodo = CONFIG.PERIODOS.SUPERTREND, multiplicador = 3) {
  try {
    if (dados.length < periodo) return { direcao: 0, valor: 0 };
    
    if (state.atrGlobal === 0) {
      state.atrGlobal = calcularATR(dados, periodo);
    }
    
    const current = dados[dados.length - 1];
    const hl2 = (current.high + current.low) / 2;
    const atr = state.atrGlobal;
    
    const upperBand = hl2 + (multiplicador * atr);
    const lowerBand = hl2 - (multiplicador * atr);
    
    let superTrend;
    let direcao;
    
    if (state.superTrendCache.length === 0) {
      superTrend = upperBand;
      direcao = 1;
    } else {
      const prev = dados[dados.length - 2];
      const prevSuperTrend = state.superTrendCache[state.superTrendCache.length - 1];
      
      if (prev.close > prevSuperTrend.valor) {
        direcao = 1;
        superTrend = Math.max(lowerBand, prevSuperTrend.valor);
      } else {
        direcao = -1;
        superTrend = Math.min(upperBand, prevSuperTrend.valor);
      }
    }
    
    state.superTrendCache.push({ direcao, valor: superTrend });
    return { direcao, valor: superTrend };
    
  } catch (e) {
    console.error("Erro no cálculo SuperTrend:", e);
    return { direcao: 0, valor: 0 };
  }
}

function detectarDivergencias(closes, rsis, highs, lows) {
  try {
    const lookback = CONFIG.PERIODOS.DIVERGENCIA_LOOKBACK;
    const extremeLookback = CONFIG.PERIODOS.EXTREME_LOOKBACK;
    
    if (closes.length < lookback || rsis.length < lookback) {
      return { divergenciaRSI: false, tipoDivergencia: "NENHUMA" };
    }
    
    const findExtremes = (data, isHigh = true) => {
      const extremes = [];
      for (let i = extremeLookback; i < data.length - extremeLookback; i++) {
        let isExtreme = true;
        
        for (let j = 1; j <= extremeLookback; j++) {
          if (isHigh) {
            if (data[i] <= data[i-j] || data[i] <= data[i+j]) {
              isExtreme = false;
              break;
            }
          } else {
            if (data[i] >= data[i-j] || data[i] >= data[i+j]) {
              isExtreme = false;
              break;
            }
          }
        }
        
        if (isExtreme) {
          extremes.push({ index: i, value: data[i] });
        }
      }
      return extremes;
    };
    
    const priceHighs = findExtremes(highs, true);
    const priceLows = findExtremes(lows, false);
    const rsiHighs = findExtremes(rsis, true);
    const rsiLows = findExtremes(rsis, false);
    
    let divergenciaRegularAlta = false;
    let divergenciaRegularBaixa = false;
    
    if (priceHighs.length >= 2 && rsiHighs.length >= 2) {
      const lastPriceHigh = priceHighs[priceHighs.length - 1];
      const prevPriceHigh = priceHighs[priceHighs.length - 2];
      const lastRsiHigh = rsiHighs[rsiHighs.length - 1];
      const prevRsiHigh = rsiHighs[rsiHighs.length - 2];
      
      if (lastPriceHigh.value > prevPriceHigh.value && 
          lastRsiHigh.value < prevRsiHigh.value) {
        divergenciaRegularBaixa = true;
      }
    }
    
    if (priceLows.length >= 2 && rsiLows.length >= 2) {
      const lastPriceLow = priceLows[priceLows.length - 1];
      const prevPriceLow = priceLows[priceLows.length - 2];
      const lastRsiLow = rsiLows[rsiLows.length - 1];
      const prevRsiLow = rsiLows[rsiLows.length - 2];
      
      if (lastPriceLow.value < prevPriceLow.value && 
          lastRsiLow.value > prevRsiLow.value) {
        divergenciaRegularAlta = true;
      }
    }
    
    return {
      divergenciaRSI: divergenciaRegularAlta || divergenciaRegularBaixa,
      tipoDivergencia: divergenciaRegularAlta ? "ALTA" : 
                      divergenciaRegularBaixa ? "BAIXA" : "NENHUMA"
    };
  } catch (e) {
    console.error("Erro na detecção de divergências:", e);
    return { divergenciaRSI: false, tipoDivergencia: "NENHUMA" };
  }
}

// =============================================
// CORE DO SISTEMA (ATUALIZADO PARA EURUSD)
// =============================================
async function analisarMercado() {
  if (state.leituraEmAndamento) return;
  state.leituraEmAndamento = true;
  
  try {
    const dados = await obterDadosTwelveData();
    state.dadosHistoricos = dados;
    
    if (dados.length < 20) {
      throw new Error(`Dados insuficientes (${dados.length} velas)`);
    }
    
    const velaAtual = dados[dados.length - 1];
    const closes = dados.map(v => v.close);
    const highs = dados.map(v => v.high);
    const lows = dados.map(v => v.low);

    // Calcular EMAs
    const calcularEMA = (dados, periodo) => {
      const emaArray = calcularMedia.exponencial(dados, periodo);
      return emaArray[emaArray.length - 1];
    };

    const ema5 = calcularEMA(closes, CONFIG.PERIODOS.EMA_CURTA);
    const ema13 = calcularEMA(closes, CONFIG.PERIODOS.EMA_MEDIA);

    const superTrend = calcularSuperTrend(dados);
    const rsi = calcularRSI(closes);
    const stoch = calcularStochastic(highs, lows, closes);
    const macd = calcularMACD(closes);
    
    // Preencher histórico de RSI CORRETAMENTE
    state.rsiHistory = [];
    for (let i = CONFIG.PERIODOS.RSI; i < closes.length; i++) {
      state.rsiHistory.push(calcularRSI(closes.slice(0, i+1)));
    }
    
    const divergencias = detectarDivergencias(closes, state.rsiHistory, highs, lows);
    const tendencia = avaliarTendencia(ema5, ema13);
    const lateral = detectarLateralidade(closes);

    state.tendenciaDetectada = tendencia.tendencia;
    state.forcaTendencia = tendencia.forca;

    const indicadores = {
      rsi,
      stoch,
      macd,
      emaCurta: ema5,
      emaMedia: ema13,
      close: velaAtual.close,
      superTrend,
      tendencia
    };

    let sinal = gerarSinal(indicadores, divergencias, lateral);
    
    // Aplicar cooldown
    if (sinal !== "ESPERAR" && state.cooldown <= 0) {
      state.cooldown = 3;
    } else if (state.cooldown > 0) {
      state.cooldown--;
      sinal = "ESPERAR";
    }

    const score = calcularScore(sinal, indicadores, divergencias);

    state.ultimoSinal = sinal;
    state.ultimoScore = score;
    state.ultimaAtualizacao = new Date().toLocaleTimeString("pt-BR");

    atualizarInterface(sinal, score, state.tendenciaDetectada, state.forcaTendencia);

    const criteriosElement = document.getElementById("criterios");
    if (criteriosElement) {
      criteriosElement.innerHTML = `
        <li>📊 Tendência: ${state.tendenciaDetectada} (${state.forcaTendencia}%)</li>
        <li>💰 Preço: ${indicadores.close.toFixed(5)}</li>
        <li>📉 RSI: ${rsi.toFixed(2)} ${rsi < 30 ? '🔻' : rsi > 70 ? '🔺' : ''}</li>
        <li>📊 MACD: ${macd.histograma > 0 ? '+' : ''}${macd.histograma.toFixed(6)} ${macd.histograma > 0 ? '🟢' : '🔴'}</li>
        <li>📈 Stochastic: ${stoch.k.toFixed(2)}/${stoch.d.toFixed(2)}</li>
        <li>📌 Médias: EMA5 ${ema5.toFixed(5)} | EMA13 ${ema13.toFixed(5)}</li>
        <li>📊 Suporte: ${state.suporteKey.toFixed(5)} | Resistência: ${state.resistenciaKey.toFixed(5)}</li>
        <li>⚠️ Divergência: ${divergencias.tipoDivergencia}</li>
        <li>🚦 SuperTrend: ${superTrend.direcao > 0 ? 'ALTA' : 'BAIXA'} (${superTrend.valor.toFixed(5)})</li>
        <li>🔄 Lateral: ${lateral ? 'SIM' : 'NÃO'}</li>
      `;
    }

    state.ultimos.unshift(`${state.ultimaAtualizacao} - ${sinal} (${score}%)`);
    if (state.ultimos.length > 8) state.ultimos.pop();
    const ultimosElement = document.getElementById("ultimos");
    if (ultimosElement) ultimosElement.innerHTML = state.ultimos.map(i => `<li>${i}</li>`).join("");

    state.tentativasErro = 0;
  } catch (e) {
    console.error("Erro na análise:", e);
    atualizarInterface("ERRO", 0, "ERRO", 0);
    
    const criteriosElement = document.getElementById("criterios");
    if (criteriosElement) {
      criteriosElement.innerHTML = `<li>ERRO: ${e.message}</li>`;
    }
    
    if (++state.tentativasErro > 3) setTimeout(() => location.reload(), 10000);
  } finally {
    state.leituraEmAndamento = false;
  }
}

// =============================================
// CONTROLE DE TEMPO
// =============================================
function sincronizarTimer() {
  clearInterval(state.intervaloAtual);
  const agora = new Date();
  const segundos = agora.getSeconds();
  state.timer = 60 - segundos;
  
  const elementoTimer = document.getElementById("timer");
  if (elementoTimer) {
    elementoTimer.textContent = formatarTimer(state.timer);
    elementoTimer.style.color = state.timer <= 5 ? 'red' : '';
  }
  
  state.intervaloAtual = setInterval(() => {
    state.timer--;
    
    if (elementoTimer) {
      elementoTimer.textContent = formatarTimer(state.timer);
      elementoTimer.style.color = state.timer <= 5 ? 'red' : '';
    }
    
    if (state.timer <= 0) {
      clearInterval(state.intervaloAtual);
      analisarMercado();
      sincronizarTimer();
    }
  }, 1000);
}

// =============================================
// INICIALIZAÇÃO
// =============================================
function iniciarAplicativo() {
  // Criar interface
  const appContainer = document.getElementById('app');
  appContainer.innerHTML = `
    <h1>Robô de Trading EUR/USD</h1>
    <div id="status-container">
      <div id="comando">--</div>
      <div id="info">
        <div id="score">--</div>
        <div>Atualização: <span id="hora">--:--:--</span></div>
        <div>Próxima: <span id="timer">0:60</span></div>
      </div>
    </div>
    <div id="tendencia-container">
      <h3>Tendência: <span id="tendencia">--</span> (<span id="forca-tendencia">--</span>%)</h3>
    </div>
    <div id="ultimos-container">
      <h3>Últimos Sinais</h3>
      <ul id="ultimos"></ul>
    </div>
    <div id="criterios-container">
      <h3>Indicadores</h3>
      <ul id="criterios"></ul>
    </div>
    <div class="sinal-sonoro"></div>
  `;
  
  // Iniciar processos
  setInterval(atualizarRelogio, 1000);
  sincronizarTimer();
  
  // Primeira análise
  setTimeout(analisarMercado, 1000);
}

// Iniciar quando o documento estiver pronto
if (document.readyState === "complete") iniciarAplicativo();
else document.addEventListener("DOMContentLoaded", iniciarAplicativo);
