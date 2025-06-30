// =============================================
// CONFIGURAÇÕES GLOBAIS (ESTRATÉGIA CONSERVADORA)
// =============================================
const state = {
  ultimos: [],
  timer: 59,
  ultimaAtualizacao: "",
  leituraEmAndamento: false,
  intervaloAtual: null,
  tentativasErro: 0,
  ultimoSinal: null,
  ultimoScore: 0,
  websocket: null,
  dadosHistoricos: {m1: [], m5: [], m15: []},
  winCount: 0,
  lossCount: 0,
  consecutiveLosses: 0,
  lastTradeTime: null
};

const CONFIG = {
  API_ENDPOINTS: {
    BINANCE: "https://api.binance.com/api/v3"
  },
  WS_ENDPOINT: "wss://stream.binance.com:9443/ws/btcusdt@kline_1m",
  PERIODOS: {
    RSI: 14,
    EMA_CURTA: 9,
    EMA_MEDIA: 21,
    SMA_VOLUME: 20,
    BANDA_LATERAL: 15
  },
  LIMIARES: {
    VOLUME_ALTO: 2.0,
    SCORE_MINIMO: 80,
    MAX_CONSECUTIVE_LOSSES: 2,
    MIN_RECOVERY_TIME: 30 * 60 * 1000
  }
};

// =============================================
// DETECÇÃO DE BANDA LATERAL
// =============================================
function detectarBandaLateral(closes, periodo = 15) {
  if (closes.length < periodo) return null;
  
  const ultimosPrecos = closes.slice(-periodo);
  const max = Math.max(...ultimosPrecos);
  const min = Math.min(...ultimosPrecos);
  const amplitude = max - min;
  const amplitudePercentual = (amplitude / closes[closes.length-1]) * 100;
  
  return {
    min,
    max,
    amplitude,
    amplitudePercentual,
    isLateral: amplitudePercentual < 1.0
  };
}

// =============================================
// SISTEMA DE TENDÊNCIA SIMPLIFICADO
// =============================================
function avaliarTendencia(closes) {
  if (closes.length < 50) return "NEUTRA";
  
  const media50 = calcularSMA(closes, 50);
  const media200 = calcularSMA(closes, 200);
  const ultimoClose = closes[closes.length-1];
  
  if (ultimoClose > media50 && media50 > media200) return "FORTE_ALTA";
  if (ultimoClose < media50 && media50 < media200) return "FORTE_BAIXA";
  if (ultimoClose > media50) return "ALTA";
  if (ultimoClose < media50) return "BAIXA";
  
  return "NEUTRA";
}

// =============================================
// GERADOR DE SINAIS DE ALTA CONFIANÇA
// =============================================
function gerarSinal(analises) {
  // Bloqueio após 2 losses consecutivos
  if (state.consecutiveLosses >= CONFIG.LIMIARES.MAX_CONSECUTIVE_LOSSES) {
    const tempoAtual = Date.now();
    if (!state.lastTradeTime || 
        (tempoAtual - state.lastTradeTime) < CONFIG.LIMIARES.MIN_RECOVERY_TIME) {
      return "ESPERAR";
    }
  }

  const {m1, m5, m15} = analises;
  
  // Filtro de tendência principal
  const tendenciaM15 = m15.tendencia;
  if (!tendenciaM15.includes("ALTA") && !tendenciaM15.includes("BAIXA")) {
    return "ESPERAR";
  }
  
  // Detecção de banda lateral
  const bandaM1 = detectarBandaLateral(m1.closes, CONFIG.PERIODOS.BANDA_LATERAL);
  if (!bandaM1 || !bandaM1.isLateral) {
    return "ESPERAR";
  }
  
  // Filtro de volume
  if (m1.volume < m1.volumeMedia * CONFIG.LIMIARES.VOLUME_ALTO) {
    return "ESPERAR";
  }
  
  // Confirmação de rompimento
  const ultimoClose = m1.close;
  const penultimoClose = m1.closes[m1.closes.length-2];
  const candleSize = Math.abs(ultimoClose - m1.open);
  const candleRange = m1.high - m1.low;
  
  // Rompimento de resistência
  if (ultimoClose > bandaM1.max && 
      ultimoClose > penultimoClose &&
      candleSize > (candleRange * 0.7)) {
      
    // Confirmação de divergência positiva
    if (m1.rsi > m5.rsi && m5.rsi < 45) {
      return "CALL";
    }
  }
  
  // Rompimento de suporte
  if (ultimoClose < bandaM1.min && 
      ultimoClose < penultimoClose &&
      candleSize > (candleRange * 0.7)) {
      
    // Confirmação de divergência negativa
    if (m1.rsi < m5.rsi && m5.rsi > 55) {
      return "PUT";
    }
  }
  
  return "ESPERAR";
}

// =============================================
// CALCULADOR DE CONFIANÇA
// =============================================
function calcularScore(sinal, analises) {
  if (sinal === "ESPERAR") return 0;
  
  const {m1, m5, m15} = analises;
  let score = 60;
  
  // Força do rompimento
  const banda = detectarBandaLateral(m1.closes);
  const distanciaRompimento = sinal === "CALL" 
    ? (m1.close - banda.max) / banda.max * 10000
    : (banda.min - m1.close) / banda.min * 10000;
  
  score += Math.min(20, distanciaRompimento * 2);
  
  // Volume
  score += Math.min(15, ((m1.volume / m1.volumeMedia) - 1) * 10);
  
  // Tendência M15
  if (sinal === "CALL" && m15.tendencia.includes("ALTA")) score += 15;
  else if (sinal === "PUT" && m15.tendencia.includes("BAIXA")) score += 15;
  
  return Math.min(100, Math.max(0, score));
}

// =============================================
// INDICADORES TÉCNICOS
// =============================================
function calcularSMA(dados, periodo) {
  if (dados.length < periodo) return 0;
  const slice = dados.slice(-periodo);
  return slice.reduce((a, b) => a + b, 0) / periodo;
}

function calcularRSI(closes, periodo = 14) {
  if (closes.length < periodo + 1) return 50;
  
  let gains = 0, losses = 0;
  for (let i = closes.length - periodo; i < closes.length - 1; i++) {
    const diff = closes[i + 1] - closes[i];
    if (diff > 0) gains += diff;
    else losses -= diff;
  }

  const avgGain = gains / periodo;
  const avgLoss = losses / periodo || 0.0001;
  const rs = avgGain / avgLoss;
  return 100 - (100 / (1 + rs));
}

// =============================================
// OBTENÇÃO DE DADOS
// =============================================
async function obterDadosBinance(timeframe = "1m", limit = 100) {
  try {
    const response = await fetch(
      `${CONFIG.API_ENDPOINTS.BINANCE}/klines?symbol=BTCUSDT&interval=${timeframe}&limit=${limit}`
    );
    const data = await response.json();
    return data.map(item => ({
      time: item[0],
      open: parseFloat(item[1]),
      high: parseFloat(item[2]),
      low: parseFloat(item[3]),
      close: parseFloat(item[4]),
      volume: parseFloat(item[5])
    }));
  } catch (e) {
    console.error(`Erro ao obter dados (${timeframe}):`, e);
    return [];
  }
}

async function carregarDadosMultiplosTimeframes() {
  try {
    const [dadosM1, dadosM5, dadosM15] = await Promise.all([
      obterDadosBinance("1m", 100),
      obterDadosBinance("5m", 100),
      obterDadosBinance("15m", 100)
    ]);
    
    return {
      m1: dadosM1,
      m5: dadosM5,
      m15: dadosM15
    };
  } catch (e) {
    return { m1: [], m5: [], m15: [] };
  }
}

// =============================================
// CORE DO SISTEMA
// =============================================
async function analisarMercado() {
  if (state.leituraEmAndamento) return;
  state.leituraEmAndamento = true;
  
  try {
    const dados = await carregarDadosMultiplosTimeframes();
    state.dadosHistoricos = dados;
    
    if (dados.m1.length < 50 || dados.m5.length < 50 || dados.m15.length < 50) return;
    
    const analises = {};
    const timeframes = ['m1', 'm5', 'm15'];
    
    for (const tf of timeframes) {
      const tfDados = dados[tf];
      const ultimaVela = tfDados[tfDados.length-1];
      
      analises[tf] = {
        time: ultimaVela.time,
        open: ultimaVela.open,
        high: ultimaVela.high,
        low: ultimaVela.low,
        close: ultimaVela.close,
        volume: ultimaVela.volume,
        closes: tfDados.map(v => v.close),
        volumeMedia: calcularSMA(tfDados.map(v => v.volume), CONFIG.PERIODOS.SMA_VOLUME),
        tendencia: avaliarTendencia(tfDados.map(v => v.close)),
        rsi: calcularRSI(tfDados.map(v => v.close))
      };
    }
    
    const sinal = gerarSinal(analises);
    const score = calcularScore(sinal, analises);
    
    state.ultimoSinal = sinal;
    state.ultimoScore = score;
    state.ultimaAtualizacao = new Date().toLocaleTimeString("pt-BR");
    
    if (score >= CONFIG.LIMIARES.SCORE_MINIMO) {
      const entrada = `${state.ultimaAtualizacao} - ${sinal} (${score}%)`;
      state.ultimos.unshift(entrada);
      if (state.ultimos.length > 5) state.ultimos.pop();
    }
    
    atualizarInterface(sinal, score, analises);
    
    state.tentativasErro = 0;
  } catch (e) {
    atualizarInterface("ERRO", 0, {});
    state.tentativasErro++;
    
    if (state.tentativasErro > 3) reiniciarSistema();
  } finally {
    state.leituraEmAndamento = false;
  }
}

// =============================================
// GESTÃO DE RISCO
// =============================================
function registrar(resultado) {
  const now = Date.now();
  
  if (resultado === 'WIN') {
    state.winCount++;
    state.consecutiveLosses = 0;
  } else if (resultado === 'LOSS') {
    state.lossCount++;
    state.consecutiveLosses++;
    state.lastTradeTime = now;
  }
  
  document.querySelector('.win-count').textContent = state.winCount;
  document.querySelector('.loss-count').textContent = state.lossCount;
  
  const hora = new Date().toLocaleTimeString("pt-BR");
  const entradaManual = `${hora} - ${resultado} (${state.ultimoScore}%)`;
  state.ultimos.unshift(entradaManual);
  if (state.ultimos.length > 5) state.ultimos.pop();
  
  atualizarListaHistorico();
  atualizarTaxaAcerto();
}

function reiniciarSistema() {
  state.consecutiveLosses = 0;
  state.lastTradeTime = null;
  state.tentativasErro = 0;
}

// =============================================
// FUNÇÕES DE INTERFACE
// =============================================
function atualizarInterface(sinal, score, analises) {
  const comandoElement = document.getElementById("comando");
  if (comandoElement) {
    comandoElement.textContent = sinal;
    comandoElement.className = "signal-display " + sinal.toLowerCase();
    
    if (sinal === "CALL") comandoElement.innerHTML = "CALL 📈";
    else if (sinal === "PUT") comandoElement.innerHTML = "PUT 📉";
    else if (sinal === "ESPERAR") comandoElement.innerHTML = "ESPERAR ✋";
    
    if (state.consecutiveLosses >= CONFIG.LIMIARES.MAX_CONSECUTIVE_LOSSES) {
      comandoElement.innerHTML += "<br> (2 Losses)";
      comandoElement.classList.add("blocked");
    }
  }
  
  const scoreElement = document.getElementById("score");
  if (scoreElement) {
    scoreElement.textContent = `Confiança: ${score}%`;
    scoreElement.style.color = score > 85 ? '#00b894' : 
                             score > 75 ? '#fdcb6e' : '#ff7675';
  }
  
  atualizarListaHistorico();
  atualizarTaxaAcerto();
  if (analises) atualizarDadosTimeframe(analises);
}

function atualizarListaHistorico() {
  const ultimosElement = document.getElementById("ultimos");
  if (ultimosElement) {
    ultimosElement.innerHTML = state.ultimos.map(item => {
      let className = 'signal-wait';
      let icon = '✋';
      
      if (item.includes('CALL')) { className = 'signal-call'; icon = '📈'; }
      else if (item.includes('PUT')) { className = 'signal-put'; icon = '📉'; }
      else if (item.includes('WIN')) { className = 'signal-win'; icon = '✅'; }
      else if (item.includes('LOSS')) { className = 'signal-loss'; icon = '❌'; }
      
      return `<li class="${className}">${icon} ${item}</li>`;
    }).join("");
  }
}

function atualizarTaxaAcerto() {
  const total = state.winCount + state.lossCount;
  const taxa = total > 0 ? Math.round((state.winCount / total) * 100) : 0;
  const successElement = document.getElementById("success-rate");
  if (successElement) {
    successElement.textContent = `${taxa}%`;
    successElement.style.color = taxa > 60 ? '#00b894' : 
                               taxa > 40 ? '#fdcb6e' : '#ff7675';
  }
}

function atualizarDadosTimeframe(analises) {
  ['m1', 'm5', 'm15'].forEach(tf => {
    const data = analises[tf];
    if (!data) return;
    
    const trendElement = document.getElementById(`${tf}-trend`);
    if (trendElement) {
      trendElement.textContent = data.tendencia;
      trendElement.className = data.tendencia.includes("ALTA") ? 
        'trend trend-up' : data.tendencia.includes("BAIXA") ? 
        'trend trend-down' : 'trend trend-neutral';
    }
    
    const rsiElement = document.getElementById(`${tf}-rsi`);
    if (rsiElement) {
      rsiElement.textContent = data.rsi.toFixed(1);
      rsiElement.style.color = data.rsi > 70 ? '#ff7675' : 
                              data.rsi < 30 ? '#00b894' : '';
    }
    
    const volElement = document.getElementById(`${tf}-volume`);
    if (volElement) {
      const volRatio = data.volume / data.volumeMedia;
      volElement.textContent = volRatio.toFixed(1) + 'x';
      volElement.style.color = volRatio > 2.0 ? '#00b894' : 
                             volRatio > 1.5 ? '#fdcb6e' : '';
    }
  });
}

// =============================================
// CONTROLE DE TEMPO
// =============================================
function sincronizarTimer() {
  clearInterval(state.intervaloAtual);
  state.timer = 59;
  
  const timerElement = document.getElementById("timer");
  if (timerElement) {
    timerElement.textContent = `00:${state.timer.toString().padStart(2, '0')}`;
    timerElement.style.color = '';
  }
  
  state.intervaloAtual = setInterval(() => {
    state.timer--;
    
    if (timerElement) {
      timerElement.textContent = `00:${state.timer.toString().padStart(2, '0')}`;
      if (state.timer <= 10) timerElement.style.color = '#ff7675';
    }
    
    if (state.timer <= 0) {
      clearInterval(state.intervaloAtual);
      analisarMercado();
      sincronizarTimer();
    }
  }, 1000);
}

// =============================================
// WEBSOCKET
// =============================================
function iniciarWebSocket() {
  if (state.websocket) state.websocket.close();
  
  state.websocket = new WebSocket(CONFIG.WS_ENDPOINT);
  
  state.websocket.onmessage = (event) => {
    const data = JSON.parse(event.data);
    if (data.k && data.k.x) analisarMercado();
  };
  
  state.websocket.onerror = (e) => console.error('Erro WS:', e);
  state.websocket.onclose = () => setTimeout(iniciarWebSocket, 5000);
}

// =============================================
// INICIALIZAÇÃO
// =============================================
function iniciarAplicativo() {
  state.ultimos = Array(5).fill("--:--:-- - AGUARDANDO");
  
  // Inicializar elementos
  if (!document.getElementById("comando")) return;
  
  atualizarInterface("AGUARDANDO", 0, null);
  
  setInterval(() => {
    const elementoHora = document.getElementById("hora");
    if (elementoHora) {
      const now = new Date();
      state.ultimaAtualizacao = now.toLocaleTimeString("pt-BR", {
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit'
      });
      elementoHora.textContent = state.ultimaAtualizacao;
    }
  }, 1000);
  
  sincronizarTimer();
  iniciarWebSocket();
  setTimeout(analisarMercado, 3000);
}

// Iniciar aplicativo
if (document.readyState === "complete") iniciarAplicativo();
else document.addEventListener("DOMContentLoaded", iniciarAplicativo);
