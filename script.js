// =============================================
// CONFIGURAÇÕES GLOBAIS (ESTRATÉGIA OTIMIZADA)
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
    VOLUME_ALTO: 1.5,  // Reduzido para permitir mais sinais
    SCORE_MINIMO: 70,   // Reduzido de 80 para 70
    MAX_CONSECUTIVE_LOSSES: 3,
    MIN_RECOVERY_TIME: 15 * 60 * 1000  // Reduzido para 15 minutos
  }
};

// =============================================
// DETECÇÃO DE BANDA LATERAL (CORRIGIDA)
// =============================================
function detectarBandaLateral(closes, periodo = 15) {
  if (closes.length < periodo) return null;
  
  const ultimosPrecos = closes.slice(-periodo);
  const max = Math.max(...ultimosPrecos);
  const min = Math.min(...ultimosPrecos);
  const media = (max + min) / 2;
  const amplitude = max - min;
  const amplitudePercentual = (amplitude / media) * 100;
  
  return {
    min,
    max,
    amplitude,
    amplitudePercentual,
    isLateral: amplitudePercentual < 1.5  // Amplitude aumentada para 1.5%
  };
}

// =============================================
// SISTEMA DE TENDÊNCIA SIMPLIFICADO
// =============================================
function avaliarTendencia(closes) {
  if (closes.length < 21) return "NEUTRA";  // Requer menos dados
  
  // Usando EMAs mais rápidas para timeframe menor
  const ema9 = calcularEMA(closes, 9);
  const ema21 = calcularEMA(closes, 21);
  const ultimoClose = closes[closes.length-1];
  
  if (ultimoClose > ema9 && ema9 > ema21) return "FORTE_ALTA";
  if (ultimoClose < ema9 && ema9 < ema21) return "FORTE_BAIXA";
  if (ultimoClose > ema9 && ema9 > ema21) return "ALTA";
  if (ultimoClose < ema9 && ema9 < ema21) return "BAIXA";
  
  return "NEUTRA";
}

// =============================================
// GERADOR DE SINAIS CORRIGIDO
// =============================================
function gerarSinal(analises) {
  // Verificar bloqueio por losses consecutivos
  if (state.consecutiveLosses >= CONFIG.LIMIARES.MAX_CONSECUTIVE_LOSSES) {
    const tempoAtual = Date.now();
    if (!state.lastTradeTime || 
        (tempoAtual - state.lastTradeTime) < CONFIG.LIMIARES.MIN_RECOVERY_TIME) {
      console.log("Bloqueado: " + state.consecutiveLosses + " losses consecutivos");
      return "ESPERAR";
    } else {
      // Resetar contador após período de recuperação
      state.consecutiveLosses = 0;
    }
  }

  const {m1, m5, m15} = analises;
  
  // Verificar se temos dados suficientes
  if (!m1 || !m5 || !m15 || !m1.closes || m1.closes.length < 20) {
    console.log("Dados insuficientes para análise");
    return "ESPERAR";
  }
  
  // 1. Detecção de banda lateral (condição relaxada)
  const bandaM1 = detectarBandaLateral(m1.closes, CONFIG.PERIODOS.BANDA_LATERAL);
  if (!bandaM1 || !bandaM1.isLateral) {
    console.log("Mercado em tendência, sem banda lateral detectada");
    // Permitir operações mesmo sem banda lateral em tendências fortes
  }
  
  // 2. Filtro de volume (condição relaxada)
  const volumeMinimo = m1.volumeMedia * CONFIG.LIMIARES.VOLUME_ALTO;
  if (m1.volume < volumeMinimo) {
    console.log(`Volume insuficiente: ${m1.volume.toFixed(2)} < ${volumeMinimo.toFixed(2)}`);
    // Não bloquear totalmente, apenas reduzir confiança
  }
  
  // 3. Tendência principal (condição relaxada)
  const tendenciaM15 = m15.tendencia;
  const tendenciaM5 = m5.tendencia;
  
  // 4. Sinais de CALL (correção na lógica RSI)
  const ultimoClose = m1.close;
  const candleSize = Math.abs(ultimoClose - m1.open);
  const candleRange = m1.high - m1.low;
  const candleRatio = candleSize / candleRange;
  
  // Sinal CALL: Tendência de alta + RSI divergente positivo
  if ((tendenciaM15.includes("ALTA") || tendenciaM5.includes("ALTA")) {
    if (m1.rsi < 45 && m5.rsi > m1.rsi) {  // Corrigido: agora M5 > M1
      console.log("Sinal CALL: RSI divergente positivo");
      return "CALL";
    }
    
    // Sinal CALL: Rompimento de resistência com volume
    if (bandaM1 && ultimoClose > bandaM1.max && candleRatio > 0.6) {
      console.log("Sinal CALL: Rompimento de resistência");
      return "CALL";
    }
  }
  
  // Sinal PUT: Tendência de baixa + RSI divergente negativo
  if ((tendenciaM15.includes("BAIXA") || tendenciaM5.includes("BAIXA"))) {
    if (m1.rsi > 55 && m5.rsi < m1.rsi) {  // Corrigido: agora M5 < M1
      console.log("Sinal PUT: RSI divergente negativo");
      return "PUT";
    }
    
    // Sinal PUT: Rompimento de suporte com volume
    if (bandaM1 && ultimoClose < bandaM1.min && candleRatio > 0.6) {
      console.log("Sinal PUT: Rompimento de suporte");
      return "PUT";
    }
  }
  
  console.log("Nenhuma condição de entrada satisfeita");
  return "ESPERAR";
}

// =============================================
// CALCULADOR DE CONFIANÇA (AJUSTADO)
// =============================================
function calcularScore(sinal, analises) {
  if (sinal === "ESPERAR") return 0;
  
  const {m1, m5, m15} = analises;
  let score = 65; // Base aumentada
  
  // 1. Volume
  const volumeRatio = m1.volume / m1.volumeMedia;
  score += Math.min(15, (volumeRatio - 1) * 10);
  
  // 2. Tendência
  if (sinal === "CALL") {
    if (m15.tendencia.includes("ALTA")) score += 10;
    if (m5.tendencia.includes("ALTA")) score += 10;
  } else {
    if (m15.tendencia.includes("BAIXA")) score += 10;
    if (m5.tendencia.includes("BAIXA")) score += 10;
  }
  
  // 3. Força do movimento
  const candleSize = Math.abs(m1.close - m1.open);
  const candleRange = m1.high - m1.low;
  const bodyRatio = candleSize / candleRange;
  score += Math.min(10, bodyRatio * 15);
  
  return Math.min(100, Math.max(score, 40));
}

// =============================================
// INDICADORES TÉCNICOS
// =============================================
function calcularSMA(dados, periodo) {
  if (dados.length < periodo) return 0;
  const slice = dados.slice(-periodo);
  return slice.reduce((a, b) => a + b, 0) / periodo;
}

function calcularEMA(dados, periodo) {
  if (dados.length < periodo) return 0;
  
  const k = 2 / (periodo + 1);
  let ema = calcularSMA(dados.slice(0, periodo), periodo);
  
  for (let i = periodo; i < dados.length; i++) {
    ema = dados[i] * k + ema * (1 - k);
  }
  
  return ema;
}

function calcularRSI(closes, periodo = 14) {
  if (closes.length < periodo + 1) return 50;
  
  let gains = 0, losses = 0;
  for (let i = 1; i <= periodo; i++) {
    const diff = closes[closes.length - i] - closes[closes.length - i - 1];
    if (diff > 0) gains += diff;
    else losses -= diff;
  }

  const avgGain = gains / periodo;
  const avgLoss = losses / periodo || 0.0001;
  const rs = avgGain / avgLoss;
  return 100 - (100 / (1 + rs));
}

// =============================================
// OBTENÇÃO DE DADOS (COM FALBACK)
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
    console.error("Erro ao carregar múltiplos timeframes:", e);
    return { m1: [], m5: [], m15: [] };
  }
}

// =============================================
// CORE DO SISTEMA (COM MAIS LOGS)
// =============================================
async function analisarMercado() {
  if (state.leituraEmAndamento) {
    console.log("Análise já em andamento, pulando...");
    return;
  }
  
  state.leituraEmAndamento = true;
  console.log("Iniciando análise de mercado...");
  
  try {
    const dados = await carregarDadosMultiplosTimeframes();
    state.dadosHistoricos = dados;
    
    // Verificar dados mínimos
    const dadosSuficientes = dados.m1.length >= 30 && dados.m5.length >= 30 && dados.m15.length >= 30;
    
    if (!dadosSuficientes) {
      console.log(`Dados insuficientes: M1=${dados.m1.length}, M5=${dados.m5.length}, M15=${dados.m15.length}`);
      return;
    }
    
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
      
      console.log(`Sinal emitido: ${sinal} com ${score}% de confiança`);
    } else if (sinal !== "ESPERAR") {
      console.log(`Sinal ${sinal} rejeitado (score ${score} < ${CONFIG.LIMIARES.SCORE_MINIMO})`);
    }
    
    atualizarInterface(sinal, score, analises);
    state.tentativasErro = 0;
  } catch (e) {
    console.error("Erro na análise:", e);
    atualizarInterface("ERRO", 0, {});
    state.tentativasErro++;
    
    if (state.tentativasErro > 3) reiniciarSistema();
  } finally {
    state.leituraEmAndamento = false;
    console.log("Análise concluída");
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
    console.log("Registrado WIN");
  } else if (resultado === 'LOSS') {
    state.lossCount++;
    state.consecutiveLosses++;
    state.lastTradeTime = now;
    console.log(`Registrado LOSS (${state.consecutiveLosses} consecutivos)`);
  }
  
  // Atualizar elementos da UI
  const winElement = document.querySelector('.win-count');
  const lossElement = document.querySelector('.loss-count');
  
  if (winElement) winElement.textContent = state.winCount;
  if (lossElement) lossElement.textContent = state.lossCount;
  
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
  console.log("Sistema reiniciado após múltiplos erros");
}

// =============================================
// FUNÇÕES DE INTERFACE
// =============================================
function atualizarInterface(sinal, score, analises) {
  const comandoElement = document.getElementById("comando");
  const scoreElement = document.getElementById("score");
  
  if (comandoElement) {
    comandoElement.textContent = sinal;
    comandoElement.className = "signal-display " + sinal.toLowerCase();
    
    if (sinal === "CALL") comandoElement.innerHTML = "CALL 📈";
    else if (sinal === "PUT") comandoElement.innerHTML = "PUT 📉";
    else if (sinal === "ESPERAR") comandoElement.innerHTML = "ESPERAR ✋";
    else if (sinal === "ERRO") comandoElement.innerHTML = "ERRO ❗";
    
    // Remover destaque de bloqueio se não houver mais losses consecutivos
    if (state.consecutiveLosses < CONFIG.LIMIARES.MAX_CONSECUTIVE_LOSSES) {
      comandoElement.classList.remove("blocked");
    }
  }
  
  if (scoreElement) {
    scoreElement.textContent = `Confiança: ${score}%`;
    scoreElement.style.color = score > 85 ? '#00b894' : 
                             score > 70 ? '#fdcb6e' : 
                             score > 50 ? '#ff7675' : '#d63031';
  }
  
  atualizarListaHistorico();
  atualizarTaxaAcerto();
  
  if (analises) atualizarDadosTimeframe(analises);
}

function atualizarListaHistorico() {
  const ultimosElement = document.getElementById("ultimos");
  if (ultimosElement && state.ultimos.length > 0) {
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
      } else if (item.includes('ERRO')) { 
        className = 'signal-error'; 
        icon = '❗';
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
  ['m1', 'm5', 'm15'].forEach(tf => {
    const data = analises[tf];
    if (!data) return;
    
    const trendElement = document.getElementById(`${tf}-trend`);
    const rsiElement = document.getElementById(`${tf}-rsi`);
    const volElement = document.getElementById(`${tf}-volume`);
    
    if (trendElement) {
      trendElement.textContent = data.tendencia;
      trendElement.className = data.tendencia.includes("ALTA") ? 
        'trend trend-up' : data.tendencia.includes("BAIXA") ? 
        'trend trend-down' : 'trend trend-neutral';
    }
    
    if (rsiElement) {
      rsiElement.textContent = data.rsi.toFixed(1);
      rsiElement.style.color = data.rsi > 70 ? '#ff7675' : 
                              data.rsi < 30 ? '#00b894' : '#fdcb6e';
    }
    
    if (volElement) {
      const volRatio = data.volume / data.volumeMedia;
      volElement.textContent = volRatio.toFixed(1) + 'x';
      volElement.style.color = volRatio > 2.0 ? '#00b894' : 
                             volRatio > 1.5 ? '#fdcb6e' : '#ff7675';
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
    timerElement.style.color = '#00b894';
  }
  
  state.intervaloAtual = setInterval(() => {
    state.timer--;
    
    if (timerElement) {
      timerElement.textContent = `00:${state.timer.toString().padStart(2, '0')}`;
      
      if (state.timer <= 10) {
        timerElement.style.color = '#ff7675';
      } else if (state.timer <= 20) {
        timerElement.style.color = '#fdcb6e';
      }
    }
    
    if (state.timer <= 0) {
      clearInterval(state.intervaloAtual);
      analisarMercado();
      sincronizarTimer();
    }
  }, 1000);
}

// =============================================
// WEBSOCKET (RECONEXÃO MELHORADA)
// =============================================
function iniciarWebSocket() {
  if (state.websocket) {
    try {
      state.websocket.close();
    } catch (e) {
      console.log("Erro ao fechar WebSocket existente:", e);
    }
  }
  
  console.log("Conectando ao WebSocket...");
  state.websocket = new WebSocket(CONFIG.WS_ENDPOINT);
  
  state.websocket.onopen = () => {
    console.log('WebSocket conectado com sucesso');
  };
  
  state.websocket.onmessage = (event) => {
    try {
      const data = JSON.parse(event.data);
      if (data.k && data.k.x) { // Vela fechada
        console.log("Vela fechada detectada, acionando análise...");
        analisarMercado();
      }
    } catch (e) {
      console.error("Erro ao processar mensagem WebSocket:", e);
    }
  };
  
  state.websocket.onerror = (error) => {
    console.error('Erro no WebSocket:', error);
  };
  
  state.websocket.onclose = (event) => {
    console.log(`WebSocket fechado (código: ${event.code}, motivo: ${event.reason || 'desconhecido'})`);
    console.log("Tentando reconectar em 3 segundos...");
    setTimeout(iniciarWebSocket, 3000);
  };
}

// =============================================
// INICIALIZAÇÃO DO SISTEMA
// =============================================
function iniciarAplicativo() {
  console.log("Iniciando aplicativo...");
  
  // Inicializar histórico
  state.ultimos = Array(5).fill("--:--:-- - AGUARDANDO");
  
  // Inicializar elementos
  if (document.getElementById("comando")) {
    atualizarInterface("INICIANDO", 0, null);
  } else {
    console.error("Elemento 'comando' não encontrado!");
    return;
  }
  
  // Atualizar relógio a cada segundo
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
  
  // Iniciar componentes
  sincronizarTimer();
  iniciarWebSocket();
  
  // Primeira análise após 3 segundos
  setTimeout(() => {
    console.log("Executando primeira análise...");
    analisarMercado();
  }, 3000);
}

// Iniciar aplicativo quando o documento estiver pronto
if (document.readyState === "complete") {
  iniciarAplicativo();
} else {
  document.addEventListener("DOMContentLoaded", iniciarAplicativo);
}
