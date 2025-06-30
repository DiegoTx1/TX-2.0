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
  marketOpen: true,
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
  PARES: {
    CRYPTO_IDX: "BTCUSDT"
  },
  PERIODOS: {
    RSI: 14,
    EMA_CURTA: 9,
    EMA_MEDIA: 21,
    SMA_VOLUME: 20,
    BANDA_LATERAL: 15
  },
  LIMIARES: {
    VOLUME_ALTO: 2.0,
    CONFIRMACAO_TIMEFRAME: 2,
    SCORE_MINIMO: 80,
    MAX_CONSECUTIVE_LOSSES: 2,
    MIN_RECOVERY_TIME: 30 * 60 * 1000 // 30 minutos
  }
};

// =============================================
// DETECÇÃO DE BANDA LATERAL (KEY FEATURE)
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
    isLateral: amplitudePercentual < 1.0 // Menos de 1% de amplitude
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
      console.log("Bloqueado: 2 losses consecutivos");
      return "ESPERAR";
    }
  }

  const {m1, m5, m15} = analises;
  
  // 1. Filtro de tendência principal (M15)
  const tendenciaM15 = m15.tendencia;
  if (!tendenciaM15.includes("ALTA") && !tendenciaM15.includes("BAIXA")) {
    console.log("Sem tendência clara no M15");
    return "ESPERAR";
  }
  
  // 2. Detecção de banda lateral
  const bandaM1 = detectarBandaLateral(m1.closes, CONFIG.PERIODOS.BANDA_LATERAL);
  if (!bandaM1 || !bandaM1.isLateral) {
    console.log("Sem banda lateral detectada");
    return "ESPERAR";
  }
  
  // 3. Filtro de volume
  if (m1.volume < m1.volumeMedia * CONFIG.LIMIARES.VOLUME_ALTO) {
    console.log("Volume insuficiente");
    return "ESPERAR";
  }
  
  // 4. Confirmação de rompimento com candle de força
  const ultimoClose = m1.closes[m1.closes.length-1];
  const penultimoClose = m1.closes[m1.closes.length-2];
  const candleSize = Math.abs(ultimoClose - m1.open);
  const candleRange = m1.high - m1.low;
  
  // Rompimento de resistência com candle significativo
  if (ultimoClose > bandaM1.max && 
      ultimoClose > penultimoClose &&
      candleSize > (candleRange * 0.7)) {
      
    // Confirmação de divergência positiva
    if (m1.rsi > m5.rsi && m5.rsi < 45) {
      console.log("Sinal CALL: Rompimento + Divergência Positiva");
      return "CALL";
    }
  }
  
  // Rompimento de suporte com candle significativo
  if (ultimoClose < bandaM1.min && 
      ultimoClose < penultimoClose &&
      candleSize > (candleRange * 0.7)) {
      
    // Confirmação de divergência negativa
    if (m1.rsi < m5.rsi && m5.rsi > 55) {
      console.log("Sinal PUT: Rompimento + Divergência Negativa");
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
  let score = 60; // Base
  
  // 1. Força do rompimento
  const banda = detectarBandaLateral(m1.closes);
  const distanciaRompimento = sinal === "CALL" 
    ? (m1.close - banda.max) / banda.max * 10000
    : (banda.min - m1.close) / banda.min * 10000;
  
  score += Math.min(20, distanciaRompimento * 2);
  
  // 2. Volume
  score += Math.min(15, ((m1.volume / m1.volumeMedia) - 1) * 10);
  
  // 3. Tendência M15
  if (sinal === "CALL" && m15.tendencia.includes("ALTA")) score += 15;
  else if (sinal === "PUT" && m15.tendencia.includes("BAIXA")) score += 15;
  
  // 4. Tamanho do candle
  const candleRange = m1.high - m1.low;
  const bodySize = Math.abs(m1.close - m1.open);
  const bodyRatio = bodySize / candleRange;
  score += Math.min(10, bodyRatio * 20);
  
  return Math.min(100, Math.max(0, score));
}

// =============================================
// INDICADORES TÉCNICOS (OTIMIZADOS)
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
// OBTENÇÃO DE DADOS (COM CACHE)
// =============================================
async function obterDadosBinance(timeframe = "1m", limit = 100) {
  try {
    const response = await fetch(
      `${CONFIG.API_ENDPOINTS.BINANCE}/klines?symbol=BTCUSDT&interval=${timeframe}&limit=${limit}`
    );
    
    if (!response.ok) throw new Error("Erro API: " + response.status);
    
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

// =============================================
// CORE DO SISTEMA (ATUALIZADO)
// =============================================
async function analisarMercado() {
  if (state.leituraEmAndamento) return;
  state.leituraEmAndamento = true;
  
  try {
    // Carregar dados
    const dados = await carregarDadosMultiplosTimeframes();
    state.dadosHistoricos = dados;
    
    // Verificar se temos dados suficientes
    if (dados.m1.length < 50 || dados.m5.length < 50 || dados.m15.length < 50) {
      console.log("Dados insuficientes para análise");
      return;
    }
    
    const analises = {};
    const timeframes = ['m1', 'm5', 'm15'];
    
    // Processar cada timeframe
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
    
    // Gerar sinal
    const sinal = gerarSinal(analises);
    
    // Calcular confiança
    const score = calcularScore(sinal, analises);
    
    // Atualizar estado
    state.ultimoSinal = sinal;
    state.ultimoScore = score;
    state.ultimaAtualizacao = new Date().toLocaleTimeString("pt-BR");
    
    // Atualizar histórico se atender confiança mínima
    if (score >= CONFIG.LIMIARES.SCORE_MINIMO) {
      const entrada = `${state.ultimaAtualizacao} - ${sinal} (${score}%)`;
      state.ultimos.unshift(entrada);
      if (state.ultimos.length > 5) state.ultimos.pop();
    }
    
    // Atualizar interface
    atualizarInterface(sinal, score, analises);
    
    state.tentativasErro = 0;
  } catch (e) {
    console.error("Erro na análise:", e);
    atualizarInterface("ERRO", 0, {});
    state.tentativasErro++;
    
    if (state.tentativasErro > 3) {
      console.error("Muitos erros consecutivos, reiniciando...");
      reiniciarSistema();
    }
  } finally {
    state.leituraEmAndamento = false;
  }
}

// =============================================
// GESTÃO DE RISCO AUTOMÁTICO
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
  
  // Atualizar UI
  document.querySelector('.win-count').textContent = state.winCount;
  document.querySelector('.loss-count').textContent = state.lossCount;
  
  // Atualizar histórico
  const hora = new Date().toLocaleTimeString("pt-BR");
  const entradaManual = `${hora} - ${resultado} (${state.ultimoScore}%)`;
  state.ultimos.unshift(entradaManual);
  if (state.ultimos.length > 5) state.ultimos.pop();
  
  atualizarListaHistorico();
  
  // Atualizar taxa de acerto
  atualizarTaxaAcerto();
}

function reiniciarSistema() {
  state.consecutiveLosses = 0;
  state.lastTradeTime = null;
  state.tentativasErro = 0;
  console.log("Sistema reiniciado após erro");
}

// =============================================
// FUNÇÕES DE INTERFACE
// =============================================
function atualizarInterface(sinal, score, analises) {
  // Atualizar sinal principal
  const comandoElement = document.getElementById("comando");
  if (comandoElement) {
    comandoElement.textContent = sinal;
    comandoElement.className = "signal-display " + sinal.toLowerCase();
    
    if (sinal === "CALL") comandoElement.innerHTML = "CALL 📈";
    else if (sinal === "PUT") comandoElement.innerHTML = "PUT 📉";
    else if (sinal === "ESPERAR") comandoElement.innerHTML = "ESPERAR ✋";
    
    // Destacar quando bloqueado por losses
    if (state.consecutiveLosses >= CONFIG.LIMIARES.MAX_CONSECUTIVE_LOSSES) {
      comandoElement.innerHTML += "<br> (2 Losses)";
      comandoElement.classList.add("blocked");
    }
  }
  
  // Atualizar score
  const scoreElement = document.getElementById("score");
  if (scoreElement) {
    scoreElement.textContent = `Confiança: ${score}%`;
    scoreElement.style.color = score > 85 ? '#00b894' : 
                             score > 75 ? '#fdcb6e' : '#ff7675';
  }
  
  // Atualizar histórico
  atualizarListaHistorico();
  
  // Atualizar taxas
  atualizarTaxaAcerto();
  
  // Atualizar dados de timeframe
  atualizarDadosTimeframe(analises);
}

function atualizarListaHistorico() {
  const ultimosElement = document.getElementById("ultimos");
  if (ultimosElement) {
    ultimosElement.innerHTML = state.ultimos.map(item => {
      let className = 'signal-wait';
      let icon = '✋';
      
      if (item.includes('CALL')) {
        className = 'signal-call';
        icon = '📈';
      } else if (item.includes('PUT')) {
        className = 'signal-put';
        icon = '📉';
      } else if (item.includes('WIN')) {
        className = 'signal-win';
        icon = '✅';
      } else if (item.includes('LOSS')) {
        className = 'signal-loss';
        icon = '❌';
      }
      
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
  if (!analises) return;
  
  ['m1', 'm5', 'm15'].forEach(tf => {
    const data = analises[tf];
    if (!data) return;
    
    // Atualizar tendência
    const trendElement = document.getElementById(`${tf}-trend`);
    if (trendElement) {
      trendElement.textContent = data.tendencia;
      trendElement.className = data.tendencia.includes("ALTA") ? 
        'trend trend-up' : data.tendencia.includes("BAIXA") ? 
        'trend trend-down' : 'trend trend-neutral';
    }
    
    // Atualizar RSI
    const rsiElement = document.getElementById(`${tf}-rsi`);
    if (rsiElement) {
      rsiElement.textContent = data.rsi.toFixed(1);
      rsiElement.style.color = data.rsi > 70 ? '#ff7675' : 
                              data.rsi < 30 ? '#00b894' : '';
    }
    
    // Atualizar volume
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
// INICIALIZAÇÃO DO SISTEMA
// =============================================
function iniciarAplicativo() {
  // Configurar elementos UI
  const elementosRequeridos = ['comando', 'score', 'hora', 'timer', 'ultimos'];
  
  // Inicializar histórico
  state.ultimos = Array(5).fill("--:--:-- - AGUARDANDO");
  
  // Atualizar interface inicial
  atualizarInterface("AGUARDANDO", 0, {});
  
  // Configurar atualizações
  setInterval(atualizarRelogio, 1000);
  sincronizarTimer();
  iniciarWebSocket();
  
  // Primeira análise
  setTimeout(analisarMercado, 3000);
}

function atualizarRelogio() {
  const elementoHora = document.getElementById("hora");
  if (elementoHora) {
    state.ultimaAtualizacao = new Date().toLocaleTimeString("pt-BR");
    elementoHora.textContent = state.ultimaAtualizacao;
  }
}

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

function iniciarWebSocket() {
  if (state.websocket) state.websocket.close();
  
  state.websocket = new WebSocket(CONFIG.WS_ENDPOINT);
  
  state.websocket.onopen = () => console.log('WS Conectado');
  state.websocket.onerror = (e) => console.error('Erro WS:', e);
  state.websocket.onclose = () => setTimeout(iniciarWebSocket, 5000);
  
  state.websocket.onmessage = (event) => {
    const data = JSON.parse(event.data);
    if (data.k && data.k.x) { // Vela fechada
      analisarMercado();
    }
  };
}

// Iniciar quando documento estiver pronto
if (document.readyState === "complete") iniciarAplicativo();
else document.addEventListener("DOMContentLoaded", iniciarAplicativo);
