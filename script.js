// =============================================
// CONFIGURAÇÕES GLOBAIS OTIMIZADAS PARA CRYPTO
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
  precoAtual: 0,
  resistenciaKey: 0,
  suporteKey: 0
};

const CONFIG = {
  API_ENDPOINTS: {
    BINANCE: "https://api.binance.com/api/v3",
    CRYPTORANK: "https://api.cryptorank.io/v1",
    CRYPTOCOMPARE: "https://min-api.cryptocompare.com/data"
  },
  WS_ENDPOINT: "wss://stream.binance.com:9443/ws/btcusdt@kline_1m",
  PARES: {
    CRYPTO_IDX: "BTCUSDT"
  },
  PERIODOS: {
    RSI: 11,
    STOCH: 9,
    WILLIAMS: 12,
    EMA_CURTA: 13,
    EMA_MEDIA: 48,
    EMA_LONGA: 100,
    EMA_200: 200,
    SMA_VOLUME: 15,
    MACD_RAPIDA: 8,
    MACD_LENTA: 21,
    MACD_SINAL: 7,
    VELAS_CONFIRMACAO: 2,
    ANALISE_LATERAL: 25,
    VWAP: 18,
    ATR: 12,
    SUPERTREND: 11,
    VOLUME_PROFILE: 45,
    LIQUIDITY_ZONES: 15,
    FAIR_VALUE: 28,
    ADX: 12
  },
  LIMIARES: {
    SCORE_ALTO: 78,
    SCORE_MEDIO: 62,
    RSI_OVERBOUGHT: 67,
    RSI_OVERSOLD: 33,
    STOCH_OVERBOUGHT: 82,
    STOCH_OVERSOLD: 18,
    WILLIAMS_OVERBOUGHT: -18,
    WILLIAMS_OVERSOLD: -82,
    VOLUME_ALTO: 2.2,
    VARIACAO_LATERAL: 0.8,
    VWAP_DESVIO: 0.018,
    ATR_LIMIAR: 0.045,
    SUPERTREND_SENSIBILIDADE: 2.8,
    INSTITUTIONAL_FLOW: 3500000,
    ADX_TENDENCIA: 22
  },
  PESOS: {
    RSI: 1.4,
    MACD: 2.2,
    TENDENCIA: 2.5,
    VOLUME: 1.8,
    STOCH: 1.0,
    WILLIAMS: 0.9,
    CONFIRMACAO: 1.4,
    LATERALIDADE: 1.3,
    VWAP: 1.3,
    VOLATILIDADE: 1.5,
    SUPERTREND: 1.9,
    VOLUME_PROFILE: 1.6,
    DIVERGENCIA: 1.9,
    LIQUIDITY: 2.0,
    FAIR_VALUE: 1.6,
    INSTITUTIONAL: 1.7,
    ADX: 1.7
  },
  RISCO: {
    MAX_RISCO_POR_OPERACAO: 0.01,
    R_R_MINIMO: 2.0,
    ATR_MULTIPLICADOR_SL: 1.8,
    ATR_MULTIPLICADOR_TP: 3.5
  },
  MARKET_HOURS: {
    CRYPTO_OPEN: 0,
    CRYPTO_CLOSE: 24
  }
};

// =============================================
// SISTEMA DE TENDÊNCIA REVISADO PARA CRYPTO
// =============================================
function determinarTendenciaPrincipal(closes, volumes, vwap) {
  // Tendência primária: EMA 100 > EMA 200 = ALTA
  const ema100 = calcularMedia.exponencial(closes, 100);
  const ema200 = calcularMedia.exponencial(closes, 200);
  
  const ultimoEma100 = ema100[ema100.length - 1];
  const ultimoEma200 = ema200[ema200.length - 1];
  
  const tendenciaPrincipal = ultimoEma100 > ultimoEma200 ? "ALTA" : "BAIXA";
  
  // Força da tendência: volume acima da média em dias de tendência
  const volumeMedio = calcularMedia.simples(volumes.slice(-50), 50);
  const volumeAtual = volumes[volumes.length - 1];
  const forca = volumeAtual > volumeMedio ? 85 : 60;
  
  return { tendencia: tendenciaPrincipal, forca };
}

function determinarTendenciaMedioPrazo(closes, volumes) {
  // Tendência médio prazo: EMA 13 > EMA 48 = ALTA
  const ema13 = calcularMedia.exponencial(closes, 13);
  const ema48 = calcularMedia.exponencial(closes, 48);
  
  const ultimoEma13 = ema13[ema13.length - 1];
  const ultimoEma48 = ema48[ema48.length - 1];
  
  const direcao = ultimoEma13 > ultimoEma48 ? "ALTA" : "BAIXA";
  
  // Momentum: inclinação das EMAs
  const inclinacao13 = calcularInclinacao(ema13.slice(-10));
  const inclinacao48 = calcularInclinacao(ema48.slice(-20));
  
  const forca = Math.min(100, Math.round(
    (Math.abs(inclinacao13) * 10000 + Math.abs(inclinacao48) * 5000)
  ));
  
  return { tendencia: direcao, forca };
}

function determinarTendenciaCurtoPrazo(closes, volumes, vwap) {
  // Tendência de curto prazo: preço > VWAP = ALTA
  const ultimoClose = closes[closes.length - 1];
  const direcao = ultimoClose > vwap ? "ALTA" : "BAIXA";
  
  // Força: distância do VWAP e volume
  const distanciaVWAP = Math.abs(ultimoClose - vwap) / vwap;
  const volumeRelativo = volumes[volumes.length - 1] / calcularMedia.simples(volumes.slice(-20), 20);
  
  const forca = Math.min(100, Math.round(
    (distanciaVWAP * 1000) + (volumeRelativo * 25)
  ));
  
  return { tendencia: direcao, forca };
}

function avaliarTendenciaConsolidada(dados) {
  const closes = dados.map(v => v.close);
  const volumes = dados.map(v => v.volume);
  const vwap = calcularVWAP(dados);
  
  const tendenciaPrincipal = determinarTendenciaPrincipal(closes, volumes, vwap);
  const tendenciaMedioPrazo = determinarTendenciaMedioPrazo(closes, volumes);
  const tendenciaCurtoPrazo = determinarTendenciaCurtoPrazo(closes, volumes, vwap);
  
  // Consolidação das tendências
  const tendencias = [
    { ...tendenciaPrincipal, peso: 0.4 },
    { ...tendenciaMedioPrazo, peso: 0.35 },
    { ...tendenciaCurtoPrazo, peso: 0.25 }
  ];
  
  let contadorAlta = 0;
  let contadorBaixa = 0;
  let forcaTotal = 0;
  
  for (const t of tendencias) {
    if (t.tendencia === "ALTA") contadorAlta += t.peso;
    else contadorBaixa += t.peso;
    forcaTotal += t.forca * t.peso;
  }
  
  // Determinar tendência consolidada
  const diferenca = Math.abs(contadorAlta - contadorBaixa);
  const forcaFinal = Math.min(100, Math.round(forcaTotal));
  
  if (diferenca < 0.2) {
    return { tendencia: "LATERAL", forca: forcaFinal };
  }
  
  if (contadorAlta > contadorBaixa) {
    return { tendencia: "ALTA", forca: forcaFinal };
  }
  
  return { tendencia: "BAIXA", forca: forcaFinal };
}

// =============================================
// SISTEMA DE SINAIS PRECISOS PARA CRYPTO
// =============================================
function gerarSinal(indicadores, divergencias) {
  const {
    close,
    rsi,
    stoch,
    williams,
    macd,
    volume,
    volumeMedia,
    vwap,
    volumeProfile,
    liquidez,
    superTrend,
    tendencia
  } = indicadores;
  
  // Identificar níveis-chave
  state.suporteKey = Math.min(volumeProfile.vaLow, liquidez.suporte);
  state.resistenciaKey = Math.max(volumeProfile.vaHigh, liquidez.resistencia);
  state.precoAtual = close;
  
  // 1. Sinal de rompimento
  const rompimentoResistencia = close > state.resistenciaKey && volume > volumeMedia * 1.5;
  const rompimentoSuporte = close < state.suporteKey && volume > volumeMedia * 1.5;
  
  // 2. Sinal de reversão por divergência
  const divergenciaAlta = divergencias.divergenciaRSI && divergencias.tipoDivergencia === "ALTA";
  const divergenciaBaixa = divergencias.divergenciaRSI && divergencias.tipoDivergencia === "BAIXA";
  
  // 3. Sinal de momentum
  const momentumAlta = macd.histograma > 0 && stoch.k > 50 && rsi > 55;
  const momentumBaixa = macd.histograma < 0 && stoch.k < 50 && rsi < 45;
  
  // 4. Confirmação de tendência
  const confirmacaoAlta = tendencia.tendencia === "ALTA" && close > superTrend.valor;
  const confirmacaoBaixa = tendencia.tendencia === "BAIXA" && close < superTrend.valor;
  
  // Gerar sinais com confirmações
  if ((rompimentoResistencia || divergenciaAlta) && (momentumAlta || confirmacaoAlta)) {
    return "CALL";
  }
  
  if ((rompimentoSuporte || divergenciaBaixa) && (momentumBaixa || confirmacaoBaixa)) {
    return "PUT";
  }
  
  // Sinal de contra-tendência (apenas para traders experientes)
  if (tendencia.forca < 40) {
    if (rsi < 30 && stoch.k < 20 && close > state.suporteKey && divergenciaAlta) {
      return "CALL";
    }
    
    if (rsi > 70 && stoch.k > 80 && close < state.resistenciaKey && divergenciaBaixa) {
      return "PUT";
    }
  }
  
  return "ESPERAR";
}

function calcularScoreConfianca(sinal, indicadores, divergencias) {
  let score = 65; // Base mais alta para crypto
  
  // Fatores de confirmação
  const fatores = [];
  
  // 1. Volume
  if (indicadores.volume > indicadores.volumeMedia * 2) {
    score += 12;
    fatores.push("Volume alto");
  }
  
  // 2. Alinhamento de tendências
  if (indicadores.tendencia.tendencia === sinal) {
    score += 15;
    fatores.push("Tendência favorável");
  }
  
  // 3. Divergência
  if (divergencias.divergenciaRSI) {
    score += divergencias.tipoDivergencia === sinal ? 18 : -10;
    fatores.push(`Divergência ${divergencias.tipoDivergencia}`);
  }
  
  // 4. Distância de suporte/resistência
  if (sinal === "CALL") {
    const distanciaSuporte = indicadores.close - state.suporteKey;
    score += Math.min(20, distanciaSuporte / indicadores.close * 1000);
    fatores.push(`Distância suporte: ${distanciaSuporte.toFixed(2)}`);
  } else if (sinal === "PUT") {
    const distanciaResistencia = state.resistenciaKey - indicadores.close;
    score += Math.min(20, distanciaResistencia / indicadores.close * 1000);
    fatores.push(`Distância resistência: ${distanciaResistencia.toFixed(2)}`);
  }
  
  // 5. Fluxo institucional
  if (state.institutionalFlow > 5000000) {
    score += sinal === "CALL" ? 10 : -5;
    fatores.push("Fluxo institucional positivo");
  } else if (state.institutionalFlow < -5000000) {
    score += sinal === "PUT" ? 10 : -5;
    fatores.push("Fluxo institucional negativo");
  }
  
  // 6. Gap de valor justo
  if (state.fairValueGap.gap) {
    if (state.fairValueGap.direcao === sinal) {
      score += 15;
      fatores.push(`FV Gap ${state.fairValueGap.direcao}`);
    } else {
      score -= 8;
    }
  }
  
  // Limitar entre 0-100
  return {
    score: Math.min(100, Math.max(0, Math.round(score))),
    fatores
  };
}

// =============================================
// FUNÇÕES UTILITÁRIAS (MANTIDAS)
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

function atualizarInterface(sinal, score, tendencia, forcaTendencia) {
  if (!state.marketOpen) return;
  
  const comandoElement = document.getElementById("comando");
  if (comandoElement) {
    comandoElement.textContent = sinal;
    comandoElement.className = sinal.toLowerCase();
    
    if (sinal === "CALL") comandoElement.textContent += " 📈";
    else if (sinal === "PUT") comandoElement.textContent += " 📉";
    else if (sinal === "ESPERAR") comandoElement.textContent += " ✋";
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
// INDICADORES TÉCNICOS (MANTIDOS)
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
  // Implementação mantida
}

function calcularStochastic(highs, lows, closes, periodo = CONFIG.PERIODOS.STOCH) {
  // Implementação mantida
}

function calcularWilliams(highs, lows, closes, periodo = CONFIG.PERIODOS.WILLIAMS) {
  // Implementação mantida
}

function calcularMACD(closes, rapida = CONFIG.PERIODOS.MACD_RAPIDA, 
                    lenta = CONFIG.PERIODOS.MACD_LENTA, 
                    sinal = CONFIG.PERIODOS.MACD_SINAL) {
  // Implementação mantida
}

function calcularVWAP(dados, periodo = CONFIG.PERIODOS.VWAP) {
  // Implementação mantida
}

function calcularATR(dados, periodo = CONFIG.PERIODOS.ATR) {
  // Implementação mantida
}

function calcularSuperTrend(dados, periodo = CONFIG.PERIODOS.SUPERTREND, multiplicador = CONFIG.LIMIARES.SUPERTREND_SENSIBILIDADE) {
  // Implementação mantida
}

function calcularVolumeProfile(dados, periodo = CONFIG.PERIODOS.VOLUME_PROFILE) {
  // Implementação mantida
}

function detectarFairValueGap(velas) {
  // Implementação mantida
}

function calcularLiquidez(velas, periodo = CONFIG.PERIODOS.LIQUIDITY_ZONES) {
  // Implementação mantida
}

function detectarDivergencias(closes, rsis, highs, lows) {
  // Implementação mantida
}

function calcularInclinacao(medias, periodo = 5) {
  // Implementação mantida
}

// =============================================
// CORE DO SISTEMA ATUALIZADO
// =============================================
async function analisarMercado() {
  if (state.leituraEmAndamento || !state.marketOpen) return;
  state.leituraEmAndamento = true;
  try {
    state.noticiasRecentes = await buscarNoticiasCrypto();
    state.institutionalFlow = await obterFluxoInstitucional();
    state.hiddenOrders = await detectarOrdensOcultas();
    
    const dados = await obterDadosBinance();
    const velaAtual = dados[dados.length - 1];
    const closes = dados.map(v => v.close);
    const highs = dados.map(v => v.high);
    const lows = dados.map(v => v.low);
    const volumes = dados.map(v => v.volume);

    state.fairValueGap = detectarFairValueGap(dados.slice(-3));

    const emaCurtaArray = calcularMedia.exponencial(closes, CONFIG.PERIODOS.EMA_CURTA);
    const emaMediaArray = calcularMedia.exponencial(closes, CONFIG.PERIODOS.EMA_MEDIA);
    const emaLongaArray = calcularMedia.exponencial(closes, CONFIG.PERIODOS.EMA_LONGA);
    const ema200Array  = calcularMedia.exponencial(closes, CONFIG.PERIODOS.EMA_200);
    const emaCurta = emaCurtaArray[emaCurtaArray.length-1] || 0;
    const emaMedia = emaMediaArray[emaMediaArray.length-1] || 0;
    const emaLonga = emaLongaArray[emaLongaArray.length-1] || 0;
    const ema200   = ema200Array[ema200Array.length-1] || 0;

    const atr = calcularATR(dados);
    const superTrend = calcularSuperTrend(dados);
    const volumeProfile = calcularVolumeProfile(dados);
    const liquidez = calcularLiquidez(dados);
    
    const rsiHistory = [];
    for (let i = CONFIG.PERIODOS.RSI; i <= closes.length; i++) {
      rsiHistory.push(calcularRSI(closes.slice(0, i)));
    }
    const divergencias = detectarDivergencias(closes, rsiHistory, highs, lows);

    // SISTEMA DE TENDÊNCIA REVISADO
    const tendencia = avaliarTendenciaConsolidada(dados);
    state.tendenciaDetectada = tendencia.tendencia;

    const indicadores = {
      rsi: calcularRSI(closes),
      macd: calcularMACD(closes),
      emaCurta,
      emaMedia,
      emaLonga,
      ema200,
      volume: velaAtual.volume,
      volumeMedia: calcularMedia.simples(volumes.slice(-CONFIG.PERIODOS.SMA_VOLUME), CONFIG.PERIODOS.SMA_VOLUME) || 1,
      stoch: calcularStochastic(highs, lows, closes),
      williams: calcularWilliams(highs, lows, closes),
      vwap: calcularVWAP(dados),
      atr,
      superTrend,
      volumeProfile,
      liquidez,
      close: velaAtual.close,
      tendencia,
      forcaTendencia: tendencia.forca
    };

    // SISTEMA DE SINAIS PRECISOS
    const sinal = gerarSinal(indicadores, divergencias);
    const scoreData = calcularScoreConfianca(sinal, indicadores, divergencias);
    const score = scoreData.score;

    state.ultimoSinal = sinal !== "ESPERAR" ? sinal : state.ultimoSinal;
    state.ultimoScore = score;
    state.ultimaAtualizacao = new Date().toLocaleTimeString("pt-BR");

    atualizarInterface(sinal, score, state.tendenciaDetectada, tendencia.forca);

    const criteriosElement = document.getElementById("criterios");
    if (criteriosElement) {
      criteriosElement.innerHTML = `
        <li>📊 Tendência: ${state.tendenciaDetectada} (${tendencia.forca}%)</li>
        <li>💰 Preço: $${indicadores.close.toFixed(2)}</li>
        <li>📶 Médias: EMA${CONFIG.PERIODOS.EMA_CURTA} ${indicadores.emaCurta.toFixed(2)} | EMA${CONFIG.PERIODOS.EMA_MEDIA} ${indicadores.emaMedia.toFixed(2)}</li>
        <li>📉 RSI: ${indicadores.rsi.toFixed(2)}</li>
        <li>📊 MACD: ${indicadores.macd.histograma.toFixed(6)}</li>
        <li>📈 Stochastic: ${indicadores.stoch.k.toFixed(2)}/${indicadores.stoch.d.toFixed(2)}</li>
        <li>💹 Volume: ${(indicadores.volume/1000).toFixed(1)}K vs Média ${(indicadores.volumeMedia/1000).toFixed(1)}K</li>
        <li>📌 VWAP: ${indicadores.vwap.toFixed(2)}</li>
        <li>📊 Perfil Volume: PVP ${indicadores.volumeProfile.pvp.toFixed(2)}</li>
        <li>🪙 S/R: ${indicadores.liquidez.suporte.toFixed(2)} | ${indicadores.liquidez.resistencia.toFixed(2)}</li>
        <li>⚠️ Divergência: ${divergencias.tipoDivergencia}</li>
        <li>🏦 Fluxo Instit: $${(state.institutionalFlow/1000000).toFixed(2)}M</li>
        <li>⚡ FVG: ${state.fairValueGap.gap ? state.fairValueGap.direcao : 'Não'}</li>
        <li>🔑 Níveis Chave: S ${state.suporteKey.toFixed(2)} | R ${state.resistenciaKey.toFixed(2)}</li>
        <li>${scoreData.fatores.join('<br>')}</li>
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
    if (++state.tentativasErro > 3) setTimeout(() => location.reload(), 10000);
  } finally {
    state.leituraEmAndamento = false;
  }
}

// =============================================
// FUNÇÕES DE DADOS (MANTIDAS)
// =============================================
async function obterFluxoInstitucional() {
  // Implementação mantida
}

async function detectarOrdensOcultas() {
  // Implementação mantida
}

async function obterDadosBinance() {
  // Implementação mantida
}

async function buscarNoticiasCrypto() {
  // Implementação mantida
}

// =============================================
// CONTROLE DE TEMPO E INICIALIZAÇÃO (MANTIDOS)
// =============================================
function sincronizarTimer() {
  // Implementação mantida
}

function iniciarWebSocket() {
  // Implementação mantida
}

function iniciarAplicativo() {
  // Implementação mantida
}

if(document.readyState === "complete") iniciarAplicativo();
else document.addEventListener("DOMContentLoaded", iniciarAplicativo);
