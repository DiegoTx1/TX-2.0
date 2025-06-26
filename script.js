// =============================================
// CONFIGURAÇÕES GLOBAIS (OTIMIZADAS PARA M5)
// =============================================
const state = {
  ultimos: [],
  timer: 299,  // 4 minutos e 59 segundos
  ultimaAtualizacao: "",
  leituraEmAndamento: false,
  intervaloAtual: null,
  tentativasErro: 0,
  ultimoSinal: null,
  ultimoScore: 0,
  contadorLaterais: 0,
  websocket: null,
  marketOpen: true,
  noticiasRecentes: [],
  volumeProfile: [],
  institutionalFlow: 0,
  fairValueGap: { gap: false },
  hiddenOrders: false,
  tendenciaDetectada: "NEUTRA",
  forcaTendencia: 0,
  dadosHistoricos: [],
  resistenciaKey: 0,
  suporteKey: 0,
  ultimosCloses: [],
  tendenciaCache: null,
  winCount: 0,
  lossCount: 0
};

const CONFIG = {
  API_ENDPOINTS: {
    BINANCE: "https://api.binance.com/api/v3",
    CRYPTORANK: "https://api.cryptorank.io/v1",
    CRYPTOCOMPARE: "https://min-api.cryptocompare.com/data"
  },
  WS_ENDPOINT: "wss://stream.binance.com:9443/ws/btcusdt@kline_5m",
  PARES: {
    CRYPTO_IDX: "BTCUSDT"
  },
  PERIODOS: {
    RSI: 14,
    STOCH: 14,
    WILLIAMS: 14,
    EMA_CURTA: 13,
    EMA_MEDIA: 48,
    EMA_LONGA: 200,
    SMA_VOLUME: 20,
    MACD_RAPIDA: 12,
    MACD_LENTA: 26,
    MACD_SINAL: 9,
    VELAS_CONFIRMACAO: 3,
    ANALISE_LATERAL: 50,
    VWAP: 20,
    ATR: 14,
    SUPERTREND: 10,
    VOLUME_PROFILE: 50,
    LIQUIDITY_ZONES: 30
  },
  LIMIARES: {
    SCORE_ALTO: 80,
    SCORE_MEDIO: 65,
    RSI_OVERBOUGHT: 72,
    RSI_OVERSOLD: 28,
    STOCH_OVERBOUGHT: 82,
    STOCH_OVERSOLD: 18,
    WILLIAMS_OVERBOUGHT: -18,
    WILLIAMS_OVERSOLD: -82,
    VOLUME_ALTO: 1.8,
    VARIACAO_LATERAL: 1.2,
    VWAP_DESVIO: 0.025,
    ATR_LIMIAR: 0.04,
    ATR_MINIMO: 0.008
  },
  PESOS: {
    RSI: 1.5,
    MACD: 2.0,
    TENDENCIA: 2.5,
    VOLUME: 1.8,
    STOCH: 1.0,
    WILLIAMS: 0.9,
    VWAP: 1.3,
    SUPERTREND: 1.7,
    VOLUME_PROFILE: 1.5,
    DIVERGENCIA: 1.8,
    LIQUIDITY: 1.9
  }
};

// =============================================
// SISTEMA DE TENDÊNCIA SIMPLIFICADO E EFICAZ
// =============================================
function avaliarTendencia(closes, emaCurta, emaMedia, emaLonga, volume, volumeMedio) {
  if (state.ultimosCloses === closes) return state.tendenciaCache;
  
  const ultimoClose = closes[closes.length - 1];
  const tendenciaLongoPrazo = ultimoClose > emaLonga ? "ALTA" : "BAIXA";
  const tendenciaMedioPrazo = emaCurta > emaMedia ? "ALTA" : "BAIXA";
  
  const distanciaMedia = Math.abs(emaCurta - emaMedia);
  const forcaBase = Math.min(100, Math.round(distanciaMedia / ultimoClose * 1000));
  const forcaVolume = volume > volumeMedio * 1.5 ? 20 : 0;
  
  let forcaTotal = forcaBase + forcaVolume;
  if (tendenciaLongoPrazo === tendenciaMedioPrazo) forcaTotal += 30;
  
  let resultado;
  if (forcaTotal > 80) {
    resultado = { 
      tendencia: tendenciaMedioPrazo === "ALTA" ? "FORTE_ALTA" : "FORTE_BAIXA",
      forca: Math.min(100, forcaTotal)
    };
  } else if (forcaTotal > 50) {
    resultado = { 
      tendencia: tendenciaMedioPrazo,
      forca: forcaTotal
    };
  } else {
    resultado = { 
      tendencia: "NEUTRA", 
      forca: 0 
    };
  }
  
  state.ultimosCloses = closes;
  state.tendenciaCache = resultado;
  return resultado;
}

// =============================================
// GERADOR DE SINAIS DE ALTA PRECISÃO (M5)
// =============================================
function gerarSinal(indicadores, divergencias) {
  const { rsi, stoch, macd, close, emaCurta, emaMedia, volume, volumeMedia, superTrend } = indicadores;
  
  const atr = calcularATR(indicadores.dadosHistoricos);
  if (atr < CONFIG.LIMIARES.ATR_MINIMO) return "ESPERAR";
  
  state.suporteKey = Math.min(indicadores.volumeProfile.vaLow, indicadores.liquidez.suporte, emaMedia);
  state.resistenciaKey = Math.max(indicadores.volumeProfile.vaHigh, indicadores.liquidez.resistencia, emaMedia);
  
  // Filtro de tempo - só considera sinais nos últimos 2 minutos
  if (state.timer > 120) return "ESPERAR";

  if (indicadores.tendencia.tendencia === "FORTE_ALTA") {
    const condicoesCompra = [
      close > emaCurta,
      macd.histograma > 0,
      stoch.k > 50,
      volume > volumeMedia * 1.2
    ];
    if (condicoesCompra.filter(Boolean).length >= 3) return "CALL";
  }

  if (indicadores.tendencia.tendencia === "FORTE_BAIXA") {
    const condicoesVenda = [
      close < emaCurta,
      macd.histograma < 0,
      stoch.k < 50,
      volume > volumeMedia * 1.2
    ];
    if (condicoesVenda.filter(Boolean).length >= 3) return "PUT";
  }

  if (close > state.resistenciaKey && volume > volumeMedia * 1.8) return "CALL";
  if (close < state.suporteKey && volume > volumeMedia * 1.8) return "PUT";

  if (divergencias.tipoDivergencia === "ALTA" && close > state.suporteKey) return "CALL";
  if (divergencias.tipoDivergencia === "BAIXA" && close < state.resistenciaKey) return "PUT";

  if (rsi < 28 && close > emaMedia) return "CALL";
  if (rsi > 72 && close < emaMedia) return "PUT";

  return "ESPERAR";
}

// =============================================
// CALCULADOR DE CONFIANÇA PRECISO
// =============================================
function calcularScore(sinal, indicadores, divergencias) {
  let score = 60;
  const fatores = {
    volumeAlto: indicadores.volume > indicadores.volumeMedia * 1.5 ? 15 : 0,
    alinhamentoTendencia: sinal === "CALL" && indicadores.tendencia.tendencia.includes("ALTA") ||
                          sinal === "PUT" && indicadores.tendencia.tendencia.includes("BAIXA") ? 20 : 0,
    divergencia: divergencias.divergenciaRSI || divergencias.divergenciaMACD ? 15 : 0,
    posicaoMedia: sinal === "CALL" && indicadores.close > indicadores.emaMedia ? 10 : 
                  sinal === "PUT" && indicadores.close < indicadores.emaMedia ? 10 : 0
  };
  
  score += Object.values(fatores).reduce((sum, val) => sum + val, 0);
  return Math.min(100, Math.max(0, score));
}

// =============================================
// FUNÇÕES UTILITÁRIAS (M5)
// =============================================
function formatarTimer(segundos) {
  const minutos = Math.floor(segundos / 60);
  const segundosRestantes = segundos % 60;
  return `${minutos}:${segundosRestantes.toString().padStart(2, '0')}`;
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

function atualizarInterface(sinal, score, tendencia, forcaTendencia) {
  if (!state.marketOpen) return;
  
  const comandoElement = document.getElementById("comando");
  if (comandoElement) {
    comandoElement.textContent = sinal;
    comandoElement.className = "signal-display " + sinal.toLowerCase();
    
    if (sinal === "CALL") comandoElement.textContent += " 📈";
    else if (sinal === "PUT") comandoElement.textContent += " 📉";
    else if (sinal === "ESPERAR") comandoElement.textContent += " ✋";
  }
  
  const scoreElement = document.getElementById("score");
  const scoreFill = document.getElementById("score-fill");
  if (scoreElement && scoreFill) {
    scoreElement.textContent = `Confiança: ${score}%`;
    scoreFill.style.width = `${score}%`;
    
    if (score >= 80) scoreFill.style.background = 'linear-gradient(90deg, #4caf50, #2e7d32)';
    else if (score >= 65) scoreFill.style.background = 'linear-gradient(90deg, #ff9800, #ff5722)';
    else scoreFill.style.background = 'linear-gradient(90deg, #f44336, #c62828)';
  }
  
  const winCountElement = document.querySelector('.win-count');
  const lossCountElement = document.querySelector('.loss-count');
  if (winCountElement && lossCountElement) {
    winCountElement.textContent = state.winCount;
    lossCountElement.textContent = state.lossCount;
  }
  
  const intervaloElement = document.getElementById("intervalo-display");
  if (intervaloElement) intervaloElement.textContent = "5 Minuto";
}

// =============================================
// INDICADORES TÉCNICOS
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

function calcularRSI(closes, periodo = 14) {
  if (!Array.isArray(closes) || closes.length < periodo + 1) return 50;
  
  let gains = 0, losses = 0;
  for (let i = 1; i <= periodo; i++) {
    const diff = closes[i] - closes[i - 1];
    if (diff > 0) gains += diff;
    else losses += Math.abs(diff);
  }

  let avgGain = gains / periodo;
  let avgLoss = Math.max(losses / periodo, 1e-8);

  for (let i = periodo + 1; i < closes.length; i++) {
    const diff = closes[i] - closes[i - 1];
    const gain = diff > 0 ? diff : 0;
    const loss = diff < 0 ? Math.abs(diff) : 0;
    avgGain = (avgGain * (periodo - 1) + gain) / periodo;
    avgLoss = (avgLoss * (periodo - 1) + loss) / periodo;
  }

  const rs = avgGain / Math.max(avgLoss, 1e-8);
  return 100 - (100 / (1 + rs));
}

function calcularStochastic(highs, lows, closes, periodo = 14) {
  try {
    if (!Array.isArray(closes) || closes.length < periodo) return { k: 50, d: 50 };
    
    const kValues = [];
    for (let i = periodo-1; i < closes.length; i++) {
      const sliceHigh = highs.slice(i-periodo+1, i+1);
      const sliceLow = lows.slice(i-periodo+1, i+1);
      const highestHigh = Math.max(...sliceHigh);
      const lowestLow = Math.min(...sliceLow);
      const range = highestHigh - lowestLow;
      kValues.push(range > 0 ? ((closes[i] - lowestLow) / range) * 100 : 50);
    }
    
    const dValues = kValues.length >= 3 ? calcularMedia.simples(kValues.slice(-3), 3) : 50;
    return {
      k: kValues[kValues.length-1] || 50,
      d: dValues || 50
    };
  } catch (e) {
    console.error("Erro no cálculo Stochastic:", e);
    return { k: 50, d: 50 };
  }
}

function calcularMACD(closes, rapida = 12, lenta = 26, sinal = 9) {
  try {
    if (!Array.isArray(closes) || closes.length < lenta + sinal) {
      return { histograma: 0, macdLinha: 0, sinalLinha: 0 };
    }

    const emaRapida = calcularMedia.exponencial(closes, rapida);
    const emaLenta = calcularMedia.exponencial(closes, lenta);
    const startIdx = lenta - rapida;
    const macdLinha = emaRapida.slice(startIdx).map((val, idx) => val - emaLenta[idx]);
    const sinalLinha = calcularMedia.exponencial(macdLinha, sinal);
    
    const ultimoMACD = macdLinha[macdLinha.length - 1] || 0;
    const ultimoSinal = sinalLinha[sinalLinha.length - 1] || 0;
    
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

function calcularATR(dados, periodo = 14) {
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

function calcularSuperTrend(dados, periodo = 10, multiplicador = 3) {
  try {
    if (!Array.isArray(dados) || dados.length < periodo) return { direcao: 0, valor: 0 };
    
    const atr = calcularATR(dados, periodo);
    const ultimo = dados[dados.length - 1];
    const hl2 = (ultimo.high + ultimo.low) / 2;
    
    const upperBand = hl2 + (multiplicador * atr);
    const lowerBand = hl2 - (multiplicador * atr);
    
    let direcao = 1;
    let superTrend = upperBand;
    
    if (dados.length > periodo) {
      const prev = dados[dados.length - 2];
      if (prev.close > superTrend) {
        direcao = 1;
        superTrend = Math.max(upperBand, prev.superTrend || upperBand);
      } else {
        direcao = -1;
        superTrend = Math.min(lowerBand, prev.superTrend || lowerBand);
      }
    }
    return { direcao, valor: superTrend };
  } catch (e) {
    console.error("Erro no cálculo SuperTrend:", e);
    return { direcao: 0, valor: 0 };
  }
}

function calcularVolumeProfile(dados, periodo = 50) {
  try {
    if (!Array.isArray(dados) || dados.length < periodo) return { pvp: 0, vaHigh: 0, vaLow: 0 };
    
    const slice = dados.slice(-periodo);
    const buckets = {};
    const precisao = 5;
    
    for (const vela of slice) {
      const amplitude = vela.high - vela.low;
      if (amplitude === 0) continue;
      
      const niveis = 20;
      const passo = amplitude / niveis;
      
      for (let i = 0; i < niveis; i++) {
        const preco = parseFloat((vela.low + i * passo).toFixed(precisao));
        buckets[preco] = (buckets[preco] || 0) + (vela.volume / niveis);
      }
    }
    
    const niveisOrdenados = Object.entries(buckets).sort((a, b) => b[1] - a[1]);
    if (niveisOrdenados.length === 0) return { pvp: 0, vaHigh: 0, vaLow: 0 };
    
    const pvp = parseFloat(niveisOrdenados[0][0]);
    const vaHigh = parseFloat(niveisOrdenados[Math.floor(niveisOrdenados.length * 0.3)]?.[0] || pvp);
    const vaLow = parseFloat(niveisOrdenados[Math.floor(niveisOrdenados.length * 0.7)]?.[0] || pvp);
    
    return { pvp, vaHigh, vaLow };
  } catch (e) {
    console.error("Erro no cálculo Volume Profile:", e);
    return { pvp: 0, vaHigh: 0, vaLow: 0 };
  }
}

function calcularLiquidez(velas, periodo = 30) {
  const slice = velas.slice(-periodo);
  const highNodes = [];
  const lowNodes = [];
  
  for (let i = 3; i < slice.length - 3; i++) {
    if (slice[i].high > slice[i-1].high && slice[i].high > slice[i+1].high) highNodes.push(slice[i].high);
    if (slice[i].low < slice[i-1].low && slice[i].low < slice[i+1].low) lowNodes.push(slice[i].low);
  }
  
  return {
    resistencia: highNodes.length > 0 ? calcularMedia.simples(highNodes, highNodes.length) : 0,
    suporte: lowNodes.length > 0 ? calcularMedia.simples(lowNodes, lowNodes.length) : 0
  };
}

function detectarDivergencias(closes, rsis, highs, lows, macdHist) {
  try {
    if (closes.length < 8 || rsis.length < 8) 
      return { 
        divergenciaRSI: false, 
        divergenciaMACD: false,
        tipoDivergencia: "NENHUMA"
      };
    
    const rsiSuavizado = rsis.map((val, idx, arr) => idx > 1 ? (val + arr[idx-1] + arr[idx-2])/3 : val);
    const macdSuavizado = macdHist.map((val, idx, arr) => idx > 1 ? (val + arr[idx-1] + arr[idx-2])/3 : val);
    const ultimosCloses = closes.slice(-8);
    const ultimosRSIs = rsiSuavizado.slice(-8);
    const ultimosMACDs = macdSuavizado.slice(-8);
    const ultimosHighs = highs.slice(-8);
    const ultimosLows = lows.slice(-8);
    
    const baixaPreco = ultimosLows[0] < ultimosLows[2] && ultimosLows[2] < ultimosLows[4] && ultimosLows[4] < ultimosLows[6];
    const altaRSI = ultimosRSIs[0] > ultimosRSIs[2] && ultimosRSIs[2] > ultimosRSIs[4] && ultimosRSIs[4] > ultimosRSIs[6];
    const divergenciaAltaRSI = baixaPreco && altaRSI;
    
    const altaPreco = ultimosHighs[0] > ultimosHighs[2] && ultimosHighs[2] > ultimosHighs[4] && ultimosHighs[4] > ultimosHighs[6];
    const baixaRSI = ultimosRSIs[0] < ultimosRSIs[2] && ultimosRSIs[2] < ultimosRSIs[4] && ultimosRSIs[4] < ultimosRSIs[6];
    const divergenciaBaixaRSI = altaPreco && baixaRSI;
    
    const baixaPrecoMACD = ultimosLows[0] < ultimosLows[2] && ultimosLows[2] < ultimosLows[4] && ultimosLows[4] < ultimosLows[6];
    const altaMACD = ultimosMACDs[0] > ultimosMACDs[2] && ultimosMACDs[2] > ultimosMACDs[4] && ultimosMACDs[4] > ultimosMACDs[6];
    const divergenciaAltaMACD = baixaPrecoMACD && altaMACD;
    
    const altaPrecoMACD = ultimosHighs[0] > ultimosHighs[2] && ultimosHighs[2] > ultimosHighs[4] && ultimosHighs[4] > ultimosHighs[6];
    const baixaMACD = ultimosMACDs[0] < ultimosMACDs[2] && ultimosMACDs[2] < ultimosMACDs[4] && ultimosMACDs[4] < ultimosMACDs[6];
    const divergenciaBaixaMACD = altaPrecoMACD && baixaMACD;
    
    let divergenciaRSI = false;
    let divergenciaMACD = false;
    let tipoDivergencia = "NENHUMA";
    
    if (divergenciaAltaRSI || divergenciaAltaMACD) {
      tipoDivergencia = "ALTA";
      divergenciaRSI = divergenciaAltaRSI;
      divergenciaMACD = divergenciaAltaMACD;
    } else if (divergenciaBaixaRSI || divergenciaBaixaMACD) {
      tipoDivergencia = "BAIXA";
      divergenciaRSI = divergenciaBaixaRSI;
      divergenciaMACD = divergenciaBaixaMACD;
    }
    
    return {
      divergenciaRSI,
      divergenciaMACD,
      tipoDivergencia
    };
  } catch (e) {
    console.error("Erro na detecção de divergências:", e);
    return { 
      divergenciaRSI: false, 
      divergenciaMACD: false,
      tipoDivergencia: "NENHUMA" 
    };
  }
}

// =============================================
// CORE DO SISTEMA (M5)
// =============================================
async function analisarMercado() {
  if (state.leituraEmAndamento || !state.marketOpen) return;
  state.leituraEmAndamento = true;
  
  try {
    const dados = await obterDadosBinance();
    state.dadosHistoricos = dados;
    
    if (dados.length < 200) {
      console.log("Aguardando dados históricos suficientes...");
      atualizarInterface("AGUARDANDO", 0, "AGUARDANDO", 0);
      return;
    }
    
    const velaAtual = dados[dados.length - 1];
    const closes = dados.map(v => v.close);
    const highs = dados.map(v => v.high);
    const lows = dados.map(v => v.low);
    const volumes = dados.map(v => v.volume);

    const ema13Array = calcularMedia.exponencial(closes, 13);
    const ema48Array = calcularMedia.exponencial(closes, 48);
    const ema200Array = calcularMedia.exponencial(closes, 200);
    const ema13 = ema13Array[ema13Array.length-1] || 0;
    const ema48 = ema48Array[ema48Array.length-1] || 0;
    const ema200 = ema200Array[ema200Array.length-1] || 0;

    const volumeMedia = calcularMedia.simples(volumes.slice(-20), 20) || 1;
    const superTrend = calcularSuperTrend(dados);
    const volumeProfile = calcularVolumeProfile(dados);
    const liquidez = calcularLiquidez(dados);
    
    const rsi = calcularRSI(closes);
    const stoch = calcularStochastic(highs, lows, closes);
    const macd = calcularMACD(closes);
    
    const rsiHistory = [];
    const macdHistory = [];
    for (let i = 14; i <= closes.length; i++) {
      rsiHistory.push(calcularRSI(closes.slice(0, i)));
      const slice = closes.slice(0, i);
      const m = calcularMACD(slice);
      macdHistory.push(m.histograma);
    }
    
    const divergencias = detectarDivergencias(closes, rsiHistory, highs, lows, macdHistory);
    const tendencia = avaliarTendencia(closes, ema13, ema48, ema200, velaAtual.volume, volumeMedia);
    state.tendenciaDetectada = tendencia.tendencia;
    state.forcaTendencia = tendencia.forca;

    const indicadores = {
      rsi,
      stoch,
      macd,
      emaCurta: ema13,
      emaMedia: ema48,
      close: velaAtual.close,
      volume: velaAtual.volume,
      volumeMedia,
      superTrend,
      volumeProfile,
      liquidez,
      tendencia,
      dadosHistoricos
    };

    const sinal = gerarSinal(indicadores, divergencias);
    const score = calcularScore(sinal, indicadores, divergencias);
    state.ultimoSinal = sinal;
    state.ultimoScore = score;
    state.ultimaAtualizacao = new Date().toLocaleTimeString("pt-BR");
    atualizarInterface(sinal, score, state.tendenciaDetectada, state.forcaTendencia);

    const criteriosElement = document.getElementById("criterios");
    if (criteriosElement) {
      criteriosElement.innerHTML = `
        <li>📊 Tendência: ${state.tendenciaDetectada} (${state.forcaTendencia}%)</li>
        <li>💰 Preço: $${indicadores.close.toFixed(2)}</li>
        <li>📉 RSI: ${rsi.toFixed(2)} ${rsi < 28 ? '🔻' : rsi > 72 ? '🔺' : ''}</li>
        <li>📊 MACD: ${macd.histograma.toFixed(6)} ${macd.histograma > 0 ? '🟢' : '🔴'}</li>
        <li>📈 Stochastic: ${stoch.k.toFixed(2)}/${stoch.d.toFixed(2)}</li>
        <li>💹 Volume: ${(indicadores.volume/1000).toFixed(1)}K vs ${(volumeMedia/1000).toFixed(1)}K</li>
        <li>📌 Médias: EMA13 ${ema13.toFixed(2)} | EMA48 ${ema48.toFixed(2)}</li>
        <li>📊 Suporte: ${state.suporteKey.toFixed(2)} | Resistência: ${state.resistenciaKey.toFixed(2)}</li>
        <li>⚠️ Divergência: ${divergencias.tipoDivergencia}</li>
        <li>🚦 SuperTrend: ${superTrend.direcao > 0 ? 'ALTA' : 'BAIXA'} (${superTrend.valor.toFixed(2)})</li>
      `;
    }

    state.ultimos.unshift(`${state.ultimaAtualizacao} - ${sinal} (${score}%)`);
    if (state.ultimos.length > 8) state.ultimos.pop();
    const ultimosElement = document.getElementById("ultimos");
    if (ultimosElement) {
      ultimosElement.innerHTML = state.ultimos.map(item => {
        let className = 'signal-wait';
        if (item.includes('CALL')) className = 'signal-call';
        else if (item.includes('PUT')) className = 'signal-put';
        return `<li class="${className}">${item}</li>`;
      }).join("");
    }

    state.tentativasErro = 0;
  } catch (e) {
    console.error("Erro na análise:", e);
    atualizarInterface("ERRO", 0, "ERRO", 0);
    if (++state.tentativasErro > 3) setTimeout(() => location.reload(), 10000);
  } finally {
    state.leituraEmAndamento = false;
  }
}

// =============================================
// FUNÇÕES DE DADOS (M5)
// =============================================
async function obterDadosBinance() {
  try {
    const response = await fetch(`${CONFIG.API_ENDPOINTS.BINANCE}/klines?symbol=BTCUSDT&interval=5m&limit=200`);
    if (!response.ok) throw new Error("Falha na API Binance");
    
    const data = await response.json();
    return data.map(item => ({
      time: new Date(item[0]).toISOString(),
      open: parseFloat(item[1]),
      high: parseFloat(item[2]),
      low: parseFloat(item[3]),
      close: parseFloat(item[4]),
      volume: parseFloat(item[5])
    }));
  } catch (e) {
    console.error("Erro ao obter dados da Binance:", e);
    throw e;
  }
}

// =============================================
// CONTROLE DE TEMPO (M5)
// =============================================
function sincronizarTimer() {
  clearInterval(state.intervaloAtual);
  const agora = Date.now();
  const intervalo = 5 * 60 * 1000;
  const delayProximaVela = intervalo - (agora % intervalo);
  state.timer = Math.floor(delayProximaVela / 1000);
  
  const elementoTimer = document.getElementById("timer");
  if (elementoTimer) {
    elementoTimer.textContent = formatarTimer(state.timer);
    elementoTimer.style.color = state.timer <= 30 ? 'red' : '';
  }
  
  state.intervaloAtual = setInterval(() => {
    state.timer--;
    
    if (elementoTimer) {
      elementoTimer.textContent = formatarTimer(state.timer);
      elementoTimer.style.color = state.timer <= 30 ? 'red' : '';
    }
    
    if (state.timer <= 0) {
      clearInterval(state.intervaloAtual);
      analisarMercado().finally(sincronizarTimer);
    }
  }, 1000);
}

// =============================================
// WEBSOCKET (M5)
// =============================================
function iniciarWebSocket() {
  if (state.websocket) state.websocket.close();
  state.websocket = new WebSocket(CONFIG.WS_ENDPOINT);

  state.websocket.onopen = () => console.log('Conexão WebSocket estabelecida');
  state.websocket.onmessage = (event) => {
    const data = JSON.parse(event.data);
    if (data.k && data.k.x) analisarMercado();
  };
  state.websocket.onerror = (error) => console.error('Erro WebSocket:', error);
  state.websocket.onclose = () => setTimeout(iniciarWebSocket, 5000);
}

// =============================================
// REGISTRO DE OPERAÇÕES
// =============================================
function registrar(resultado) {
  if (resultado === 'WIN') state.winCount++;
  else if (resultado === 'LOSS') state.lossCount++;
  
  document.querySelector('.win-count').textContent = state.winCount;
  document.querySelector('.loss-count').textContent = state.lossCount;
  
  const hora = new Date().toLocaleTimeString("pt-BR");
  state.ultimos.unshift(`${hora} - ${resultado} (Manual)`);
  if (state.ultimos.length > 8) state.ultimos.pop();
  const ultimosElement = document.getElementById("ultimos");
  if (ultimosElement) {
    ultimosElement.innerHTML = state.ultimos.map(item => {
      let className = 'signal-wait';
      if (item.includes('CALL') || item.includes('WIN')) className = 'signal-call';
      else if (item.includes('PUT') || item.includes('LOSS')) className = 'signal-put';
      return `<li class="${className}">${item}</li>`;
    }).join("");
  }
}

// =============================================
// INICIALIZAÇÃO DO SISTEMA
// =============================================
function iniciarAplicativo() {
  const ids = ['comando','score','hora','timer','criterios','ultimos'];
  const falt = ids.filter(id => !document.getElementById(id));
  if (falt.length > 0) return console.error("Elementos faltando:", falt);
  
  setInterval(atualizarRelogio, 1000);
  sincronizarTimer();
  iniciarWebSocket();
  setInterval(() => {
    if (!state.websocket || state.websocket.readyState === WebSocket.CLOSED) iniciarWebSocket();
  }, 5000);
  
  setTimeout(analisarMercado, 2000);
  
  const intervaloElement = document.getElementById("intervalo-display");
  if (intervaloElement) intervaloElement.textContent = "5 Minuto";
}

// Iniciar quando o documento estiver pronto
if (document.readyState === "complete") iniciarAplicativo();
else document.addEventListener("DOMContentLoaded", iniciarAplicativo);
