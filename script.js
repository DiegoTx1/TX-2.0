// =============================================
// CONFIGURAÇÕES GLOBAIS (OTIMIZADAS PARA M1)
// =============================================
const state = {
  ultimos: [],
  timer: 59, // Timer regressivo de 59 segundos para M1
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
  tendenciaCache: {m1: null, m5: null, m15: null},
  rsiCache: {m1: null, m5: null, m15: null} // Novo cache para valores anteriores de RSI
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
    EMA_CURTA: 9,  // Reduzido para melhor resposta em M1
    EMA_MEDIA: 21, // Ajustado para melhor captura de tendências
    EMA_LONGA: 50, // Reduzido para timeframe menor
    SMA_VOLUME: 20
  },
  LIMIARES: {
    RSI_OVERBOUGHT: 70,
    RSI_OVERSOLD: 30,
    VOLUME_ALTO: 1.8,
    CONFIRMACAO_TIMEFRAME: 2,
    SCORE_MINIMO: 65 // Confiança mínima para emitir sinal
  }
};

// =============================================
// SISTEMA DE TENDÊNCIA (OTIMIZADO PARA MULTI-TIMEFRAME)
// =============================================
function avaliarTendencia(closes, emaCurta, emaMedia, emaLonga, volume, volumeMedio) {
  if (!closes || closes.length < 10) return { tendencia: "NEUTRA", forca: 0 };
  
  const ultimoClose = closes[closes.length - 1];
  const penultimoClose = closes[closes.length - 2];
  const direcao = ultimoClose > penultimoClose ? 1 : -1;
  
  const tendenciaLongoPrazo = ultimoClose > emaLonga ? "ALTA" : "BAIXA";
  const tendenciaMedioPrazo = emaCurta > emaMedia ? "ALTA" : "BAIXA";
  
  const distanciaMedia = Math.abs(emaCurta - emaMedia);
  const forcaBase = Math.min(100, Math.round(distanciaMedia / ultimoClose * 1500));
  const forcaVolume = volume > volumeMedio * 1.5 ? 25 : 0;
  const forcaDirecao = direcao * 10;
  
  let forcaTotal = forcaBase + forcaVolume + forcaDirecao;
  
  if (tendenciaLongoPrazo === tendenciaMedioPrazo) forcaTotal += 35;
  
  // Condição para tendência forte
  if (forcaTotal > 75) {
    return { 
      tendencia: tendenciaMedioPrazo === "ALTA" ? "FORTE_ALTA" : "FORTE_BAIXA",
      forca: Math.min(100, forcaTotal)
    };
  } else if (forcaTotal > 45) {
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
// GERADOR DE SINAIS COM CONFIRMAÇÃO EM MÚLTIPLOS TIMEFRAMES
// =============================================
function gerarSinal(analises) {
  const {m1, m5, m15} = analises;
  
  // 1. Filtro de volume mínimo
  if (m1.volume < m1.volumeMedia * 0.7) {
    console.log("Volume M1 abaixo do mínimo: " + m1.volume + " < " + (m1.volumeMedia * 0.7));
    return "ESPERAR";
  }

  // 2. Tendência consistente em múltiplos timeframes
  const tendenciasAlta = [
    m1.tendencia.tendencia.includes("ALTA"),
    m5.tendencia.tendencia.includes("ALTA"),
    m15.tendencia.tendencia.includes("ALTA")
  ].filter(Boolean).length;
  
  const tendenciasBaixa = [
    m1.tendencia.tendencia.includes("BAIXA"),
    m5.tendencia.tendencia.includes("BAIXA"),
    m15.tendencia.tendencia.includes("BAIXA")
  ].filter(Boolean).length;

  // 3. Sinais de alta com confirmação
  if (tendenciasAlta >= CONFIG.LIMIARES.CONFIRMACAO_TIMEFRAME) {
    // Confirmação de rompimento
    const resistenciaM1 = Math.max(...m1.dadosHistoricos.slice(-15).map(v => v.high));
    if (m1.close > resistenciaM1 && m5.close > resistenciaM1) {
      console.log("Sinal CALL por rompimento com tendência alinhada");
      return "CALL";
    }
    
    // Pullback em EMA com volume
    if (m1.close > m1.emaCurta && 
        m1.close > m1.emaMedia &&
        m1.volume > m1.volumeMedia * 1.5) {
      console.log("Sinal CALL por pullback com volume");
      return "CALL";
    }
  }

  // 4. Sinais de baixa com confirmação
  if (tendenciasBaixa >= CONFIG.LIMIARES.CONFIRMACAO_TIMEFRAME) {
    // Confirmação de rompimento
    const suporteM1 = Math.min(...m1.dadosHistoricos.slice(-15).map(v => v.low));
    if (m1.close < suporteM1 && m5.close < suporteM1) {
      console.log("Sinal PUT por rompimento com tendência alinhada");
      return "PUT";
    }
    
    // Pullback em EMA com volume
    if (m1.close < m1.emaCurta && 
        m1.close < m1.emaMedia &&
        m1.volume > m1.volumeMedia * 1.5) {
      console.log("Sinal PUT por pullback com volume");
      return "PUT";
    }
  }

  // 5. Estratégia RSI divergente
  if (m1.rsi < 35 && 
      m5.rsi > state.rsiCache.m5 && 
      m1.close > m1.emaMedia) {
    console.log("Sinal CALL por divergência de RSI");
    return "CALL";
  }
  
  if (m1.rsi > 65 && 
      m5.rsi < state.rsiCache.m5 && 
      m1.close < m1.emaMedia) {
    console.log("Sinal PUT por divergência de RSI");
    return "PUT";
  }

  // 6. Estratégia de convergência de EMAs
  if (m1.emaCurta > m1.emaMedia && 
      m5.emaCurta > m5.emaMedia && 
      m1.close > m1.emaCurta) {
    console.log("Sinal CALL por convergência de EMAs");
    return "CALL";
  }
  
  if (m1.emaCurta < m1.emaMedia && 
      m5.emaCurta < m5.emaMedia && 
      m1.close < m1.emaCurta) {
    console.log("Sinal PUT por convergência de EMAs");
    return "PUT";
  }

  return "ESPERAR";
}

// =============================================
// CALCULADOR DE CONFIANÇA COM MULTI-TIMEFRAME
// =============================================
function calcularScore(sinal, analises) {
  const {m1, m5, m15} = analises;
  let score = 50; // Base mais conservadora
  
  // 1. Força da tendência principal (M15)
  score += Math.min(20, Math.floor(m15.tendencia.forca / 5));
  
  // 2. Volume relativo
  const volumeScore = Math.min(15, 
    (m1.volume / m1.volumeMedia) * 5
  );
  score += volumeScore;
  
  // 3. Alinhamento de EMAs
  if (sinal === "CALL") {
    if (m1.emaCurta > m1.emaMedia) score += 10;
    if (m1.emaMedia > m1.emaLonga) score += 5;
  } else {
    if (m1.emaCurta < m1.emaMedia) score += 10;
    if (m1.emaMedia < m1.emaLonga) score += 5;
  }
  
  // 4. Posição do preço em relação às EMAs
  if (sinal === "CALL" && m1.close > m1.emaCurta) score += 8;
  if (sinal === "PUT" && m1.close < m1.emaCurta) score += 8;
  
  // 5. Confirmação de timeframe
  if ((sinal === "CALL" && m5.tendencia.tendencia.includes("ALTA")) ||
      (sinal === "PUT" && m5.tendencia.tendencia.includes("BAIXA"))) {
    score += 12;
  }
  
  return Math.min(100, Math.max(0, score));
}

// =============================================
// FUNÇÕES UTILITÁRIAS
// =============================================
function formatarTimer(segundos) {
  return `00:${segundos.toString().padStart(2, '0')}`;
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
  }
}

function atualizarInterface(sinal, score, analises) {
  const comandoElement = document.getElementById("comando");
  if (comandoElement) {
    comandoElement.textContent = sinal;
    comandoElement.className = "signal-display " + sinal.toLowerCase();
    
    if (sinal === "CALL") comandoElement.textContent += " 📈";
    else if (sinal === "PUT") comandoElement.textContent += " 📉";
    else if (sinal === "ESPERAR") comandoElement.textContent += " ✋";
  }
  
  const scoreElement = document.getElementById("score");
  if (scoreElement) {
    scoreElement.textContent = `Confiança: ${score}%`;
    scoreElement.style.color = score > 75 ? '#00b894' : score > 60 ? '#fdcb6e' : '#ff7675';
  }
  
  // Atualizar histórico de sinais
  const ultimosElement = document.getElementById("ultimos");
  if (ultimosElement && state.ultimos.length > 0) {
    ultimosElement.innerHTML = state.ultimos.map(item => {
      let className = 'signal-wait';
      if (item.includes('CALL')) className = 'signal-call';
      else if (item.includes('PUT')) className = 'signal-put';
      return `<li class="${className}">${item}</li>`;
    }).join("");
  }
  
  // Atualizar análise de múltiplos timeframes
  const timeframes = ['m1', 'm5', 'm15'];
  timeframes.forEach(tf => {
    const trendElement = document.getElementById(`${tf}-trend`);
    const strengthElement = document.getElementById(`${tf}-strength`);
    const rsiElement = document.getElementById(`${tf}-rsi`);
    const volumeElement = document.getElementById(`${tf}-volume`);
    
    if (state.tendenciaCache[tf]) {
      const { tendencia, forca } = state.tendenciaCache[tf];
      if (trendElement) {
        trendElement.textContent = tendencia;
        trendElement.className = tendencia.includes("ALTA") ? 'trend trend-up' : 
                               tendencia.includes("BAIXA") ? 'trend trend-down' : 'trend trend-neutral';
      }
      if (strengthElement) strengthElement.textContent = `${forca}%`;
    }
    
    if (analises[tf]) {
      if (rsiElement) rsiElement.textContent = analises[tf].rsi.toFixed(2);
      if (volumeElement) {
        const vol = analises[tf].volume;
        volumeElement.textContent = vol > 1000000 
          ? `${(vol/1000000).toFixed(2)}M` 
          : `${(vol/1000).toFixed(1)}K`;
      }
    }
  });
  
  // Atualizar barra de progresso
  const progressBar = document.querySelector('.progress');
  if (progressBar) {
    progressBar.style.width = `${score}%`;
    progressBar.style.backgroundColor = score > 75 ? '#00b894' : score > 60 ? '#fdcb6e' : '#ff7675';
  }
}

// =============================================
// INDICADORES TÉCNICOS (ATUALIZADOS)
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
  for (let i = closes.length - periodo; i < closes.length - 1; i++) {
    const diff = closes[i + 1] - closes[i];
    if (diff > 0) gains += diff;
    else losses -= diff; // Usar valor absoluto
  }

  const avgGain = gains / periodo;
  const avgLoss = losses / periodo || 0.0001;
  const rs = avgGain / avgLoss;
  return 100 - (100 / (1 + rs));
}

// =============================================
// OBTENÇÃO DE DADOS PARA MÚLTIPLOS TIMEFRAMES
// =============================================
async function obterDadosBinance(timeframe = "1m", limit = 50) {
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
// CORE DO SISTEMA (ATUALIZADO)
// =============================================
async function analisarMercado() {
  if (state.leituraEmAndamento) return;
  state.leituraEmAndamento = true;
  
  try {
    // Carregar dados para múltiplos timeframes
    const dados = await carregarDadosMultiplosTimeframes();
    state.dadosHistoricos = dados;
    
    const analises = {};
    
    // Analisar cada timeframe
    for (const timeframe of ['m1', 'm5', 'm15']) {
      const tfDados = dados[timeframe];
      if (!tfDados || tfDados.length === 0) continue;
      
      const velaAtual = tfDados[tfDados.length - 1];
      const closes = tfDados.map(v => v.close);
      const volumes = tfDados.map(v => v.volume);
      
      // Calculando indicadores
      const emaCurta = calcularEMA(closes, CONFIG.PERIODOS.EMA_CURTA);
      const emaMedia = calcularEMA(closes, CONFIG.PERIODOS.EMA_MEDIA);
      const emaLonga = calcularEMA(closes, CONFIG.PERIODOS.EMA_LONGA);
      const rsi = calcularRSI(closes);
      const volumeMedia = calcularMediaSimples(volumes, CONFIG.PERIODOS.SMA_VOLUME);
      
      // Atualizar cache RSI para divergência
      if (timeframe === 'm5') state.rsiCache.m5 = rsi;
      
      // Avaliando tendência
      const tendencia = avaliarTendencia(
        closes, 
        emaCurta, 
        emaMedia, 
        emaLonga, 
        velaAtual.volume, 
        volumeMedia
      );
      
      // Armazenar análise
      analises[timeframe] = {
        rsi,
        close: velaAtual.close,
        emaCurta,
        emaMedia,
        emaLonga,
        volume: velaAtual.volume,
        volumeMedia,
        tendencia,
        dadosHistoricos: tfDados
      };
      
      // Cache para atualização da interface
      state.tendenciaCache[timeframe] = tendencia;
    }
    
    // Gerar sinal baseado na análise de múltiplos timeframes
    const sinal = gerarSinal(analises);
    
    // Calcular confiança do sinal
    const score = calcularScore(sinal, analises);
    
    // Atualizar estado
    state.ultimoSinal = sinal;
    state.ultimoScore = score;
    state.ultimaAtualizacao = new Date().toLocaleTimeString("pt-BR");
    
    // Atualizar histórico apenas se atender confiança mínima
    if (score >= CONFIG.LIMIARES.SCORE_MINIMO || sinal === "ESPERAR") {
      const entrada = `${state.ultimaAtualizacao} - ${sinal} (${score}%)`;
      state.ultimos.unshift(entrada);
      if (state.ultimos.length > 8) state.ultimos.pop();
    }
    
    // Atualizar interface
    atualizarInterface(sinal, score, analises);
    
    // Atualizar taxa de sucesso
    const totalOps = state.winCount + state.lossCount;
    const successRate = totalOps > 0 ? Math.round((state.winCount / totalOps) * 100) : 0;
    const successElement = document.getElementById("success-rate");
    if (successElement) successElement.textContent = `${successRate}%`;
    
    state.tentativasErro = 0;
  } catch (e) {
    console.error("Erro na análise:", e);
    atualizarInterface("ERRO", 0, {});
    
    // Adicionar erro ao histórico
    const erroEntry = `${new Date().toLocaleTimeString("pt-BR")} - ERRO (0%)`;
    state.ultimos.unshift(erroEntry);
    if (state.ultimos.length > 8) state.ultimos.pop();
  } finally {
    state.leituraEmAndamento = false;
  }
}

// =============================================
// CONTROLE DE TEMPO (AJUSTADO PARA M1)
// =============================================
function sincronizarTimer() {
  clearInterval(state.intervaloAtual);
  
  // Timer regressivo de 59 segundos para M1
  state.timer = 59;
  
  const elementoTimer = document.getElementById("timer");
  if (elementoTimer) {
    elementoTimer.textContent = formatarTimer(state.timer);
    elementoTimer.style.color = state.timer <= 10 ? '#ff7675' : '';
  }
  
  state.intervaloAtual = setInterval(() => {
    state.timer--;
    
    if (elementoTimer) {
      elementoTimer.textContent = formatarTimer(state.timer);
      elementoTimer.style.color = state.timer <= 10 ? '#ff7675' : '';
    }
    
    if (state.timer <= 0) {
      clearInterval(state.intervaloAtual);
      analisarMercado();
      sincronizarTimer();
    }
  }, 1000);
}

// =============================================
// WEBSOCKET (MANTIDO PARA M1)
// =============================================
function iniciarWebSocket() {
  if (state.websocket) state.websocket.close();

  state.websocket = new WebSocket(CONFIG.WS_ENDPOINT);

  state.websocket.onopen = () => console.log('WebSocket conectado');
  
  state.websocket.onmessage = (event) => {
    const data = JSON.parse(event.data);
    if (data.k && data.k.x) { // Vela fechada
      analisarMercado();
    }
  };
  
  state.websocket.onerror = (error) => console.error('Erro WebSocket:', error);
  
  state.websocket.onclose = () => {
    console.log('WebSocket fechado. Reconectando...');
    setTimeout(iniciarWebSocket, 5000);
  };
}

// =============================================
// REGISTRO MANUAL DE OPERAÇÕES
// =============================================
function registrar(resultado) {
  if (resultado === 'WIN') state.winCount++;
  else if (resultado === 'LOSS') state.lossCount++;
  
  document.querySelector('.win-count').textContent = state.winCount;
  document.querySelector('.loss-count').textContent = state.lossCount;
  
  const hora = new Date().toLocaleTimeString("pt-BR");
  const entradaManual = `${hora} - ${resultado} (Manual)`;
  
  state.ultimos.unshift(entradaManual);
  if (state.ultimos.length > 8) state.ultimos.pop();
  
  // Atualizar histórico
  const ultimosElement = document.getElementById("ultimos");
  if (ultimosElement) {
    ultimosElement.innerHTML = state.ultimos.map(item => {
      let className = 'signal-wait';
      if (item.includes('WIN')) className = 'signal-call';
      else if (item.includes('LOSS')) className = 'signal-put';
      return `<li class="${className}">${item}</li>`;
    }).join("");
  }
  
  // Atualizar taxa de sucesso
  const totalOps = state.winCount + state.lossCount;
  const successRate = totalOps > 0 ? Math.round((state.winCount / totalOps) * 100) : 0;
  const successElement = document.getElementById("success-rate");
  if (successElement) successElement.textContent = `${successRate}%`;
}

// =============================================
// INICIALIZAÇÃO DO SISTEMA
// =============================================
function iniciarAplicativo() {
  // Elementos essenciais
  const elementosRequeridos = ['comando', 'score', 'hora', 'timer', 'ultimos'];
  const elementosFaltantes = elementosRequeridos.filter(id => !document.getElementById(id));
  
  if (elementosFaltantes.length > 0) {
    console.error("Elementos faltando:", elementosFaltantes);
    return;
  }
  
  // Inicializar histórico
  state.ultimos = [
    "--:--:-- - ESPERAR (--%)",
    "--:--:-- - ESPERAR (--%)",
    "--:--:-- - ESPERAR (--%)",
    "--:--:-- - ESPERAR (--%)",
    "--:--:-- - ESPERAR (--%)",
    "--:--:-- - ESPERAR (--%)"
  ];
  
  // Atualizar interface inicial
  atualizarInterface("AGUARDANDO", 0, {});
  
  // Configurar atualizações
  setInterval(atualizarRelogio, 1000);
  sincronizarTimer();
  iniciarWebSocket();
  
  // Primeira análise
  setTimeout(analisarMercado, 2000);
  
  // Atualizar display do intervalo
  const intervaloElement = document.getElementById("intervalo-display");
  if (intervaloElement) intervaloElement.textContent = "1 Minuto";
}

// Iniciar quando o documento estiver pronto
if (document.readyState === "complete") {
  iniciarAplicativo();
} else {
  document.addEventListener("DOMContentLoaded", iniciarAplicativo);
}
