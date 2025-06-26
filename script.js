// =============================================
// CONFIGURAÇÕES GLOBAIS (REVISADAS)
// =============================================
const state = {
  ultimos: [],
  timer: 299,
  ultimaAtualizacao: "",
  leituraEmAndamento: false,
  intervaloAtual: null,
  tentativasErro: 0,
  ultimoSinal: null,
  ultimoScore: 0,
  websocket: null,
  marketOpen: true,
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
    BINANCE: "https://api.binance.com/api/v3"
  },
  WS_ENDPOINT: "wss://stream.binance.com:9443/ws/btcusdt@kline_5m",
  PARES: {
    CRYPTO_IDX: "BTCUSDT"
  },
  PERIODOS: {
    RSI: 14,
    EMA_CURTA: 13,
    EMA_MEDIA: 48,
    EMA_LONGA: 200,
    SMA_VOLUME: 20
  }
};

// =============================================
// SISTEMA DE TENDÊNCIA (CORRIGIDO)
// =============================================
function avaliarTendencia(closes, emaCurta, emaMedia, emaLonga, volume, volumeMedio) {
  if (!closes || closes.length < 10) return { tendencia: "NEUTRA", forca: 0 };
  
  const ultimoClose = closes[closes.length - 1];
  const tendenciaLongoPrazo = ultimoClose > emaLonga ? "ALTA" : "BAIXA";
  const tendenciaMedioPrazo = emaCurta > emaMedia ? "ALTA" : "BAIXA";
  
  const distanciaMedia = Math.abs(emaCurta - emaMedia);
  const forcaBase = Math.min(100, Math.round(distanciaMedia / ultimoClose * 1000));
  const forcaVolume = volume > volumeMedio * 1.5 ? 20 : 0;
  
  let forcaTotal = forcaBase + forcaVolume;
  if (tendenciaLongoPrazo === tendenciaMedioPrazo) forcaTotal += 30;
  
  if (forcaTotal > 80) {
    return { 
      tendencia: tendenciaMedioPrazo === "ALTA" ? "FORTE_ALTA" : "FORTE_BAIXA",
      forca: Math.min(100, forcaTotal)
    };
  } else if (forcaTotal > 50) {
    return { 
      tendencia: tendenciaMedioPrazo,
      forca: forcaTotal
    };
  } else {
    return { 
      tendencia: "NEUTRA", 
      forca: 0 
    };
  }
}

// =============================================
// GERADOR DE SINAIS (SIMPLIFICADO)
// =============================================
function gerarSinal(indicadores) {
  if (!indicadores || !indicadores.close) return "ESPERAR";
  
  const { rsi, close, emaCurta, emaMedia, volume, volumeMedia } = indicadores;
  
  // Filtro básico de volume
  if (volume < volumeMedia * 0.8) return "ESPERAR";
  
  // Sinal de compra básico
  if (close > emaCurta && close > emaMedia && rsi < 70) {
    return "CALL";
  }
  
  // Sinal de venda básico
  if (close < emaCurta && close < emaMedia && rsi > 30) {
    return "PUT";
  }
  
  return "ESPERAR";
}

// =============================================
// FUNÇÕES UTILITÁRIAS
// =============================================
function formatarTimer(segundos) {
  const min = Math.floor(segundos / 60);
  const seg = segundos % 60;
  return `${min}:${seg.toString().padStart(2, '0')}`;
}

function atualizarInterface(sinal, score, tendencia, forcaTendencia) {
  const comandoElement = document.getElementById("comando");
  if (comandoElement) {
    comandoElement.textContent = sinal;
    comandoElement.className = "signal-display " + sinal.toLowerCase();
  }
  
  const scoreElement = document.getElementById("score");
  if (scoreElement) {
    scoreElement.textContent = `Confiança: ${score}%`;
  }
}

// =============================================
// INDICADORES TÉCNICOS (REVISADOS)
// =============================================
function calcularMediaSimples(dados, periodo) {
  if (!dados || dados.length < periodo) return 0;
  const slice = dados.slice(-periodo);
  return slice.reduce((a, b) => a + b, 0) / periodo;
}

function calcularEMA(dados, periodo) {
  if (!dados || dados.length < periodo) return 0;
  
  const k = 2 / (periodo + 1);
  let ema = calcularMediaSimples(dados.slice(0, periodo), periodo);
  
  for (let i = periodo; i < dados.length; i++) {
    ema = dados[i] * k + ema * (1 - k);
  }
  
  return ema;
}

function calcularRSI(closes, periodo = 14) {
  if (!closes || closes.length < periodo + 1) return 50;
  
  let gains = 0, losses = 0;
  for (let i = 1; i <= periodo; i++) {
    const diff = closes[i] - closes[i - 1];
    if (diff > 0) gains += diff;
    else losses += Math.abs(diff);
  }

  const avgGain = gains / periodo;
  const avgLoss = losses / periodo || 0.0001;
  const rs = avgGain / avgLoss;
  return 100 - (100 / (1 + rs));
}

// =============================================
// CORE DO SISTEMA (REVISADO)
// =============================================
async function analisarMercado() {
  if (state.leituraEmAndamento) return;
  state.leituraEmAndamento = true;
  
  try {
    const dados = await obterDadosBinance();
    if (!dados || dados.length === 0) throw new Error("Sem dados");
    
    state.dadosHistoricos = dados;
    const velaAtual = dados[dados.length - 1];
    
    // Dados básicos
    const closes = dados.map(v => v.close);
    const volumes = dados.map(v => v.volume);
    
    // Indicadores básicos
    const ema13 = calcularEMA(closes, 13);
    const ema48 = calcularEMA(closes, 48);
    const ema200 = calcularEMA(closes, 200);
    const rsi = calcularRSI(closes);
    const volumeMedia = calcularMediaSimples(volumes, 20);
    
    // Tendência
    const tendencia = avaliarTendencia(
      closes, 
      ema13, 
      ema48, 
      ema200, 
      velaAtual.volume, 
      volumeMedia
    );
    
    const indicadores = {
      rsi,
      close: velaAtual.close,
      emaCurta: ema13,
      emaMedia: ema48,
      volume: velaAtual.volume,
      volumeMedia
    };

    // Gerar sinal
    const sinal = gerarSinal(indicadores);
    const score = 60; // Valor fixo inicial
    
    // Atualizar estado
    state.ultimoSinal = sinal;
    state.ultimoScore = score;
    state.ultimaAtualizacao = new Date().toLocaleTimeString("pt-BR");
    
    // Atualizar interface
    atualizarInterface(sinal, score, tendencia.tendencia, tendencia.forca);
    
    // Atualizar critérios técnicos
    const criteriosElement = document.getElementById("criterios");
    if (criteriosElement) {
      criteriosElement.innerHTML = `
        <li>Tendência: ${tendencia.tendencia} (${tendencia.forca}%)</li>
        <li>Preço: $${indicadores.close.toFixed(2)}</li>
        <li>RSI: ${rsi.toFixed(2)}</li>
        <li>Volume: ${(indicadores.volume/1000).toFixed(1)}K</li>
      `;
    }

    state.tentativasErro = 0;
  } catch (e) {
    console.error("Erro na análise:", e);
    atualizarInterface("ERRO", 0, "ERRO", 0);
  } finally {
    state.leituraEmAndamento = false;
  }
}

// =============================================
// FUNÇÕES DE DADOS (CORRIGIDAS)
// =============================================
async function obterDadosBinance() {
  try {
    const response = await fetch(
      `${CONFIG.API_ENDPOINTS.BINANCE}/klines?symbol=BTCUSDT&interval=5m&limit=50`
    );
    
    if (!response.ok) throw new Error("API error: " + response.status);
    
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
    console.error("Erro ao obter dados:", e);
    return [];
  }
}

// =============================================
// CONTROLE DE TEMPO (ESTÁVEL)
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
  }
  
  state.intervaloAtual = setInterval(() => {
    state.timer--;
    if (elementoTimer) elementoTimer.textContent = formatarTimer(state.timer);
    if (state.timer <= 0) {
      clearInterval(state.intervaloAtual);
      analisarMercado();
      sincronizarTimer();
    }
  }, 1000);
}

// =============================================
// INICIALIZAÇÃO DO SISTEMA (CONFIÁVEL)
// =============================================
function iniciarAplicativo() {
  // Verificar elementos mínimos
  const elementosRequeridos = ['comando', 'score', 'timer'];
  const elementosFaltantes = elementosRequeridos.filter(id => !document.getElementById(id));
  
  if (elementosFaltantes.length > 0) {
    console.error("Elementos faltando:", elementosFaltantes);
    return;
  }
  
  // Configurações iniciais
  setInterval(() => {
    const agora = new Date();
    document.getElementById("hora").textContent = agora.toLocaleTimeString("pt-BR");
  }, 1000);
  
  sincronizarTimer();
  
  // Primeira análise após 2 segundos
  setTimeout(analisarMercado, 2000);
  
  // Atualizar display do intervalo
  const intervaloElement = document.getElementById("intervalo-display");
  if (intervaloElement) intervaloElement.textContent = "5 Minuto";
}

// Iniciar quando o documento estiver pronto
if (document.readyState === "complete") {
  iniciarAplicativo();
} else {
  document.addEventListener("DOMContentLoaded", iniciarAplicativo);
}
