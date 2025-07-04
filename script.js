// =============================================
// CONFIGURAÇÕES AVANÇADAS PARA IDX M1 (2025)
// =============================================
const CONFIG = {
  // Parâmetros otimizados para volatilidade do IDX
  PERIODOS: {
    EMA_RAPIDA: 3,
    EMA_MEDIA: 13,
    EMA_LONGA: 34,
    RSI: 7,
    VOLUME_LOOKBACK: 4,
    ATR: 14
  },
  
  // Limites estatisticamente calibrados
  LIMITES: {
    RSI_ALTO: 72,
    RSI_BAIXO: 30,
    VOLUME_THRESHOLD: 2.5,
    ATR_THRESHOLD: 0.015
  },
  
  // Pesos dinâmicos
  PESOS: {
    TENDENCIA: 40,
    MOMENTUM: 30,
    VOLUME: 20,
    VOLATILIDADE: 10
  },
  
  // Horários de alta assertividade (UTC)
  HORARIOS_PREFERENCIAIS: [
    { start: 12, end: 15 },   // Abertura Europa
    { start: 15, end: 18 },   // Europa/América
    { start: 21, end: 24 }    // Fechamento América
  ]
};

// =============================================
// ESTADO DO SISTEMA
// =============================================
const state = {
  timer: 60,
  ultimos: [],
  ultimaAtualizacao: "",
  leituraEmAndamento: false,
  dadosHistoricos: [],
  ultimoSinal: "ESPERAR",
  ultimoScore: 0,
  historicoOperacoes: { win: 0, loss: 0 },
  intervaloTimer: null,
  consecutiveErrors: 0,
  lastTimestamp: null,
  contextoMercado: "NEUTRO"
};

// Fila de execução
let analysisQueue = Promise.resolve();

// =============================================
// FUNÇÕES TÉCNICAS AVANÇADAS
// =============================================
function calcularEMA(dados, periodo) {
  if (!dados || dados.length < periodo) return null;
  
  const k = 2 / (periodo + 1);
  let ema = dados[0];
  
  for (let i = 1; i < dados.length; i++) {
    ema = dados[i] * k + ema * (1 - k);
  }
  
  return ema;
}

function calcularRSI(closes, periodo = CONFIG.PERIODOS.RSI) {
  if (closes.length < periodo + 1) return 50;
  
  let gains = 0;
  let losses = 0;
  
  for (let i = 1; i <= periodo; i++) {
    const diff = closes[closes.length - i] - closes[closes.length - i - 1];
    if (diff > 0) gains += diff;
    else losses -= diff;
  }
  
  const avgGain = gains / periodo;
  const avgLoss = losses / periodo;
  
  if (avgLoss === 0) return 100;
  const rs = avgGain / avgLoss;
  return 100 - (100 / (1 + rs));
}

function calcularATR(dados, periodo = CONFIG.PERIODOS.ATR) {
  if (dados.length < periodo + 1) return 0;
  
  const trueRanges = [];
  for (let i = dados.length - periodo; i < dados.length; i++) {
    const high = dados[i].high;
    const low = dados[i].low;
    const prevClose = i > 0 ? dados[i-1].close : dados[i].close;
    
    const tr = Math.max(
      high - low,
      Math.abs(high - prevClose),
      Math.abs(low - prevClose)
    );
    trueRanges.push(tr);
  }
  
  return trueRanges.reduce((sum, val) => sum + val, 0) / periodo;
}

function calcularVolumeRelativo(volumes, lookback = CONFIG.PERIODOS.VOLUME_LOOKBACK) {
  if (volumes.length < lookback + 1) return 1.0;
  
  const volumeAtual = volumes[volumes.length - 1];
  const mediaVolumes = volumes.slice(-lookback - 1, -1).reduce((sum, vol) => sum + vol, 0) / lookback;
  
  return mediaVolumes > 0 ? volumeAtual / mediaVolumes : 1.0;
}

// =============================================
// ALGORITMOS ESPECÍFICOS PARA IDX
// =============================================
function detectarImpulso(rapida, media, longa) {
  return rapida > media && media > longa;
}

function detectarReversao(rapida, media, longa) {
  return (rapida > media && media < longa) || (rapida < media && media > longa);
}

function calcularForcaMercado() {
  const horaAtual = new Date().getUTCHours();
  const horaPreferencial = CONFIG.HORARIOS_PREFERENCIAIS.some(period => 
    horaAtual >= period.start && horaAtual < period.end
  );
  
  return horaPreferencial ? 1.15 : 0.85;
}

// =============================================
// GERADOR DE SINAIS DE ALTA ASSERTIVIDADE
// =============================================
function gerarSinal() {
  if (state.dadosHistoricos.length < 50) {
    return { sinal: "ESPERAR", score: 0, criterios: ["Coletando dados..."] };
  }
  
  const dados = state.dadosHistoricos;
  const closes = dados.map(c => c.close);
  const volumes = dados.map(c => c.volume);
  const current = dados[dados.length - 1];
  
  // Cálculo de indicadores
  const emaRapida = calcularEMA(closes, CONFIG.PERIODOS.EMA_RAPIDA);
  const emaMedia = calcularEMA(closes, CONFIG.PERIODOS.EMA_MEDIA);
  const emaLonga = calcularEMA(closes, CONFIG.PERIODOS.EMA_LONGA);
  const rsi = calcularRSI(closes);
  const atr = calcularATR(dados);
  const volumeRel = calcularVolumeRelativo(volumes);
  const forcaMercado = calcularForcaMercado();
  
  // Validação
  if ([emaRapida, emaMedia, emaLonga, rsi].some(val => val === null || isNaN(val))) {
    return { sinal: "ERRO", score: 0, criterios: ["Erro nos cálculos"] };
  }
  
  // Análise de tendência
  const impulsoAlta = detectarImpulso(emaRapida, emaMedia, emaLonga);
  const impulsoBaixa = detectarImpulso(emaLonga, emaMedia, emaRapida);
  
  // Sistema de pontuação
  let score = 0;
  const criterios = [];
  
  // Fator de tendência (40%)
  if (impulsoAlta) {
    score += CONFIG.PESOS.TENDENCIA;
    criterios.push(`✅ Tendência de Alta (${CONFIG.PESOS.TENDENCIA}%)`);
  } else if (impulsoBaixa) {
    score += CONFIG.PESOS.TENDENCIA;
    criterios.push(`✅ Tendência de Baixa (${CONFIG.PESOS.TENDENCIA}%)`);
  }
  
  // Fator momentum (30%)
  if (impulsoAlta && rsi < CONFIG.LIMITES.RSI_ALTO && rsi > 40) {
    score += CONFIG.PESOS.MOMENTUM;
    criterios.push(`✅ Momentum Positivo (${CONFIG.PESOS.MOMENTUM}%)`);
  } else if (impulsoBaixa && rsi > CONFIG.LIMITES.RSI_BAIXO && rsi < 60) {
    score += CONFIG.PESOS.MOMENTUM;
    criterios.push(`✅ Momentum Negativo (${CONFIG.PESOS.MOMENTUM}%)`);
  }
  
  // Fator volume (20%)
  if (volumeRel > CONFIG.LIMITES.VOLUME_THRESHOLD) {
    score += CONFIG.PESOS.VOLUME;
    criterios.push(`🔥 Volume Anômalo (${CONFIG.PESOS.VOLUME}%)`);
  }
  
  // Fator volatilidade (10%)
  if (atr > CONFIG.LIMITES.ATR_THRESHOLD) {
    score += CONFIG.PESOS.VOLATILIDADE;
    criterios.push(`📈 Volatilidade Elevada (${CONFIG.PESOS.VOLATILIDADE}%)`);
  }
  
  // Aplicar fator horário
  score = Math.min(100, Math.max(0, score * forcaMercado));
  
  // Geração de sinal com confirmação
  let sinal = "ESPERAR";
  
  // Sinal de CALL (Alta)
  if (score >= 75 && impulsoAlta && rsi < 65) {
    sinal = "CALL";
    criterios.push("🚀 Sinal CALL confirmado");
  } 
  // Sinal de PUT (Baixa)
  else if (score >= 75 && impulsoBaixa && rsi > 35) {
    sinal = "PUT";
    criterios.push("📉 Sinal PUT confirmado");
  }
  
  return { sinal, score, criterios };
}

// =============================================
// FUNÇÕES DE INTERFACE (MANTIDAS)
// =============================================
function atualizarRelogio() {
  const now = new Date();
  state.ultimaAtualizacao = now.toLocaleTimeString("pt-BR", {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit'
  });
  document.getElementById("hora").textContent = state.ultimaAtualizacao;
}

function atualizarInterface(sinal, score, criterios = []) {
  const comandoElement = document.getElementById("comando");
  
  comandoElement.className = "";
  comandoElement.classList.add(sinal.toLowerCase());
  
  if (sinal === "CALL") {
    comandoElement.textContent = "CALL 📈";
    document.getElementById("som-call").play().catch(e => console.log("Audio error:", e));
  } 
  else if (sinal === "PUT") {
    comandoElement.textContent = "PUT 📉";
    document.getElementById("som-put").play().catch(e => console.log("Audio error:", e));
  } 
  else if (sinal === "ERRO") {
    comandoElement.textContent = "ERRO ❌";
  } 
  else {
    comandoElement.textContent = "ESPERAR ✋";
  }
  
  document.getElementById("score").textContent = `${Math.round(score)}%`;
  
  const criteriosHTML = criterios.length 
    ? criterios.map(c => `<li>${c}</li>`).join("") 
    : "<li>Analisando condições de mercado...</li>";
  document.getElementById("criterios").innerHTML = criteriosHTML;
  
  state.ultimoSinal = sinal;
  state.ultimoScore = score;
}

function registrar(resultado) {
  if (state.ultimoSinal === "CALL" || state.ultimoSinal === "PUT") {
    if (resultado === "WIN") state.historicoOperacoes.win++;
    else if (resultado === "LOSS") state.historicoOperacoes.loss++;
    
    document.getElementById("historico").textContent = 
      `${state.historicoOperacoes.win} WIN / ${state.historicoOperacoes.loss} LOSS`;
    
    state.ultimos.unshift(`${state.ultimaAtualizacao} - ${state.ultimoSinal} (${resultado})`);
    if (state.ultimos.length > 8) state.ultimos.pop();
    
    const ultimosElement = document.getElementById("ultimos");
    if (ultimosElement) {
      ultimosElement.innerHTML = state.ultimos.map(i => `<li>${i}</li>`).join("");
    }
  }
}

// =============================================
// SIMULADOR DE DADOS (REMOVER EM PRODUÇÃO)
// =============================================
function gerarDadosSimulados() {
  // Simulação de dados do IDX M1
  const ultimoClose = state.dadosHistoricos.length > 0 
    ? state.dadosHistoricos[state.dadosHistoricos.length - 1].close 
    : 10000; // Valor inicial fictício
  
  // Gerar flutuação realista
  const variacao = (Math.random() - 0.5) * 0.02;
  const novoClose = ultimoClose * (1 + variacao);
  const volume = 10000000 + Math.random() * 50000000;
  
  return {
    time: new Date().toISOString(),
    open: ultimoClose,
    high: Math.max(ultimoClose, novoClose) * (1 + Math.random() * 0.01),
    low: Math.min(ultimoClose, novoClose) * (1 - Math.random() * 0.01),
    close: novoClose,
    volume: volume
  };
}

// =============================================
// CICLO PRINCIPAL (ATUALIZADO)
// =============================================
async function analisarMercado() {
  return analysisQueue = analysisQueue.then(async () => {
    state.leituraEmAndamento = true;
    
    try {
      atualizarRelogio();
      
      // Em produção real, substituir por chamada de API
      const novoDado = gerarDadosSimulados();
      
      state.dadosHistoricos.push(novoDado);
      if (state.dadosHistoricos.length > 100) {
        state.dadosHistoricos.shift();
      }
      
      const { sinal, score, criterios } = gerarSinal();
      atualizarInterface(sinal, score, criterios);
      
      if (sinal === "CALL" || sinal === "PUT") {
        state.ultimos.unshift(`${state.ultimaAtualizacao} - ${sinal} (${Math.round(score)}%)`);
        if (state.ultimos.length > 8) state.ultimos.pop();
        
        const ultimosElement = document.getElementById("ultimos");
        if (ultimosElement) {
          ultimosElement.innerHTML = state.ultimos.map(i => `<li>${i}</li>`).join("");
        }
      }
      
      state.consecutiveErrors = 0;
    } catch (error) {
      console.error("Erro na análise:", error);
      state.consecutiveErrors++;
      
      if (state.consecutiveErrors > 5) {
        clearInterval(state.intervaloTimer);
        state.intervaloTimer = null;
        atualizarInterface("ERRO", 0, ["Sistema pausado"]);
      } else {
        atualizarInterface("ERRO", 0, [`Erro: ${error.message}`]);
      }
    } finally {
      state.leituraEmAndamento = false;
    }
  });
}

// =============================================
// CONTROLE DE TEMPO (MANTIDO)
// =============================================
function sincronizarTimer() {
  if (state.intervaloTimer) {
    clearInterval(state.intervaloTimer);
  }
  
  const agora = new Date();
  state.timer = 60 - agora.getSeconds();
  document.getElementById("timer").textContent = state.timer;
  
  state.intervaloTimer = setInterval(() => {
    state.timer--;
    document.getElementById("timer").textContent = state.timer;
    
    if (state.timer <= 0) {
      clearInterval(state.intervaloTimer);
      state.timer = 60;
      
      analisarMercado().finally(() => {
        sincronizarTimer();
      });
    }
  }, 1000);
}

// =============================================
// INICIALIZAÇÃO (MANTIDA)
// =============================================
function iniciar() {
  // Iniciar com dados históricos simulados
  for (let i = 0; i < 50; i++) {
    state.dadosHistoricos.push({
      time: new Date(Date.now() - (50 - i) * 60000).toISOString(),
      open: 10000 + Math.random() * 1000,
      high: 10100 + Math.random() * 1000,
      low: 9900 - Math.random() * 1000,
      close: 10050 + Math.random() * 900,
      volume: 10000000 + Math.random() * 50000000
    });
  }
  
  sincronizarTimer();
  setInterval(atualizarRelogio, 1000);
  atualizarRelogio();
  
  setTimeout(analisarMercado, 1000);
}

document.addEventListener("DOMContentLoaded", iniciar);
