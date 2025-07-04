// =============================================
// CONFIGURAÇÕES ATUALIZADAS PARA IDX M1 (2025)
// =============================================
const CONFIG = {
  USE_PROXY: true, // Usar proxy para evitar CORS
  PAR: "BTCUSDT", // Bitcoin como proxy para o índice cripto
  INTERVALO: "1m", // Intervalo de 1 minuto
  PERIODOS: {
    EMA_RAPIDA: 3,
    EMA_MEDIA: 15,
    EMA_LONGA: 60,
    RSI: 9,
    VOLUME_LOOKBACK: 5
  },
  LIMITES: {
    RSI_ALTO: 75,
    RSI_BAIXO: 28,
    VOLUME_THRESHOLD: 2.2
  },
  PESOS: {
    TENDENCIA: 45,
    RSI: 30,
    VOLUME: 25
  }
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
  lastTimestamp: null
};

// Fila de execução para evitar race conditions
let analysisQueue = Promise.resolve();

// =============================================
// FUNÇÕES DE CÁLCULO TÉCNICO
// =============================================
function calcularMediaSimples(dados, periodo) {
  if (!dados || !dados.length || dados.length < periodo) return null;
  const slice = dados.slice(-periodo);
  return slice.reduce((a, b) => a + b, 0) / periodo;
}

function calcularEMA(dados, periodo) {
  if (!dados || dados.length < periodo) return null;
  
  let k = 2 / (periodo + 1);
  let ema = calcularMediaSimples(dados.slice(0, periodo), periodo);
  
  if (ema === null || isNaN(ema)) return null;
  
  for (let i = periodo; i < dados.length; i++) {
    ema = dados[i] * k + ema * (1 - k);
  }
  
  return ema;
}

function calcularRSI(closes, periodo = CONFIG.PERIODOS.RSI) {
  if (!closes || closes.length < periodo + 1) return 50;
  
  let gains = 0;
  let losses = 0;
  
  for (let i = closes.length - periodo; i < closes.length; i++) {
    const diff = closes[i] - closes[i - 1];
    if (diff > 0) gains += diff;
    else if (diff < 0) losses -= diff;
  }
  
  const avgGain = gains / periodo;
  const avgLoss = losses / periodo;
  
  if (avgLoss === 0) return avgGain > 0 ? 100 : 50;
  const rs = avgGain / avgLoss;
  return 100 - (100 / (1 + rs));
}

function calcularVolumeRelativo(volumes, lookback = CONFIG.PERIODOS.VOLUME_LOOKBACK) {
  if (!volumes || volumes.length < lookback + 1) return 1.0;
  
  const volumeAtual = volumes[volumes.length - 1];
  const volumesAnteriores = volumes.slice(-lookback - 1, -1);
  const somaVolumes = volumesAnteriores.reduce((sum, vol) => sum + vol, 0);
  
  if (somaVolumes <= 0) return 1.0;
  return volumeAtual / (somaVolumes / lookback);
}

// =============================================
// FUNÇÕES ESPECÍFICAS PARA CRIPTO (2025)
// =============================================
function detectarVolumeAnomalia(volumes) {
  if (volumes.length < 10) return false;
  
  const volumeAtual = volumes[volumes.length - 1];
  const ultimosVolumes = volumes.slice(-10, -1);
  const media = ultimosVolumes.reduce((a, b) => a + b, 0) / 9;
  
  return volumeAtual > media * 3;
}

function confirmarTendencia(rapida, media, longa) {
  return rapida > media && media > longa;
}

// =============================================
// GERADOR DE SINAIS ATUALIZADO
// =============================================
function gerarSinal() {
  const dados = state.dadosHistoricos;
  if (!dados || dados.length < 90) return { sinal: "ESPERAR", score: 0, criterios: ["Aguardando mais dados"] };
  
  const closes = dados.map(c => c.close);
  const volumes = dados.map(c => c.volume);
  const current = dados[dados.length - 1];
  
  const emaRapida = calcularEMA(closes, CONFIG.PERIODOS.EMA_RAPIDA);
  const emaMedia = calcularEMA(closes, CONFIG.PERIODOS.EMA_MEDIA);
  const emaLonga = calcularEMA(closes, CONFIG.PERIODOS.EMA_LONGA);
  const rsi = calcularRSI(closes);
  const volumeRel = calcularVolumeRelativo(volumes);
  
  // Validação reforçada
  if ([emaRapida, emaMedia, emaLonga, rsi].some(val => val === null || isNaN(val))) {
    return { sinal: "ERRO", score: 0, criterios: ["Erro no cálculo de indicadores"] };
  }

  const anomaliaVolume = detectarVolumeAnomalia(volumes);
  const tendenciaConfirmada = confirmarTendencia(emaRapida, emaMedia, emaLonga);

  let score = 0;
  const criterios = [];

  // Sistema de pontuação dinâmico
  if (tendenciaConfirmada) {
    score += CONFIG.PESOS.TENDENCIA;
    criterios.push(`✅ Tendência Confirmada (${CONFIG.PESOS.TENDENCIA}%)`);
  }
  
  if (emaRapida > emaMedia && current.close > emaRapida) {
    score += 15;
    criterios.push("✅ EMA3 > EMA15 & Price > EMA3");
  }

  if (rsi < CONFIG.LIMITES.RSI_ALTO && rsi > CONFIG.LIMITES.RSI_BAIXO) {
    score += CONFIG.PESOS.RSI;
    criterios.push(`✅ RSI Ideal (${CONFIG.PESOS.RSI}%)`);
  }

  if (anomaliaVolume) {
    score += CONFIG.PESOS.VOLUME;
    criterios.push(`🔥 Volume Anômalo (${CONFIG.PESOS.VOLUME}%)`);
  }

  // Geração de sinais com confirmação
  let sinal = "ESPERAR";
  
  if (score >= 75) {
    if (emaRapida > emaMedia && rsi < 65) {
      sinal = "CALL";
      criterios.push("🚀 Sinal de CALL ativado");
    } else if (emaRapida < emaMedia && rsi > 35) {
      sinal = "PUT";
      criterios.push("📉 Sinal de PUT ativado");
    }
  }

  return { sinal, score, criterios };
}

// =============================================
// FUNÇÕES DE INTERFACE
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
  
  // Reset completo de estado visual
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
  
  document.getElementById("score").textContent = `${score}%`;
  
  const criteriosHTML = criterios.length 
    ? criterios.map(c => `<li>${c}</li>`).join("") 
    : "<li>Sem dados suficientes para análise</li>";
  document.getElementById("criterios").innerHTML = criteriosHTML;
  
  // Atualizar estado global
  state.ultimoSinal = sinal;
  state.ultimoScore = score;
}

function registrar(resultado) {
  if (state.ultimoSinal === "CALL" || state.ultimoSinal === "PUT") {
    if (resultado === "WIN") state.historicoOperacoes.win++;
    else if (resultado === "LOSS") state.historicoOperacoes.loss++;
    
    document.getElementById("historico").textContent = 
      `${state.historicoOperacoes.win} WIN / ${state.historicoOperacoes.loss} LOSS`;
    
    // Adicionar ao histórico de sinais com resultado
    state.ultimos.unshift(`${state.ultimaAtualizacao} - ${state.ultimoSinal} (${resultado})`);
    if (state.ultimos.length > 8) state.ultimos.pop();
    
    const ultimosElement = document.getElementById("ultimos");
    if (ultimosElement) {
      ultimosElement.innerHTML = state.ultimos.map(i => `<li>${i}</li>`).join("");
    }
  }
}

// =============================================
// INTEGRAÇÃO COM BINANCE API (GRATUITA)
// =============================================
async function obterDadosMercado() {
  try {
    // Usamos BTC/USDT como proxy para o índice cripto
    const symbol = CONFIG.PAR;
    const interval = CONFIG.INTERVALO;
    const limit = 100; // Número de candles
    
    // URL da API Binance
    let url = `https://api.binance.com/api/v3/klines?symbol=${symbol}&interval=${interval}&limit=${limit}`;
    
    // Usar proxy CORS se necessário
    if (CONFIG.USE_PROXY) {
      url = `https://cors-anywhere.herokuapp.com/${url}`;
    }
    
    const response = await fetch(url);
    
    if (!response.ok) throw new Error(`Erro HTTP: ${response.status}`);
    
    const data = await response.json();
    
    if (!data || !data.length) {
      throw new Error("Resposta inválida da API");
    }
    
    // Converter dados para o formato padrão
    const newData = data.map(item => {
      return {
        time: item[0],
        open: parseFloat(item[1]),
        high: parseFloat(item[2]),
        low: parseFloat(item[3]),
        close: parseFloat(item[4]),
        volume: parseFloat(item[5])
      };
    });

    // Atualizar último timestamp
    if (newData.length > 0) {
      state.lastTimestamp = newData[newData.length - 1].time;
    }
    
    return newData;
  } catch (error) {
    console.error("Falha ao obter dados:", error);
    
    // Tentar fallback com dados estáticos se houver erro
    if (state.dadosHistoricos.length > 0) {
      console.log("Usando dados históricos como fallback");
      return [];
    }
    
    throw error;
  }
}

// =============================================
// CICLO PRINCIPAL
// =============================================
async function analisarMercado() {
  return analysisQueue = analysisQueue.then(async () => {
    state.leituraEmAndamento = true;
    
    try {
      // Atualização em tempo real
      atualizarRelogio();
      
      // Obter e processar dados
      const newData = await obterDadosMercado();
      
      // Atualizar dados históricos
      if (newData.length > 0) {
        state.dadosHistoricos = newData;
      } else if (state.dadosHistoricos.length > 0) {
        // Manter dados antigos se não houver novos
        console.log("Mantendo dados históricos");
      }
      
      // Gerar sinal com estratégia
      const { sinal, score, criterios } = gerarSinal();
      
      // Atualizar interface
      atualizarInterface(sinal, score, criterios);
      
      // Resetar contador de erros após sucesso
      state.consecutiveErrors = 0;
      
      // Registrar sinal importante
      if (sinal === "CALL" || sinal === "PUT") {
        state.ultimos.unshift(`${state.ultimaAtualizacao} - ${sinal} (${score}%)`);
        if (state.ultimos.length > 8) state.ultimos.pop();
        
        const ultimosElement = document.getElementById("ultimos");
        if (ultimosElement) {
          ultimosElement.innerHTML = state.ultimos.map(i => `<li>${i}</li>`).join("");
        }
      }
    } catch (error) {
      console.error("Erro na análise:", error);
      state.consecutiveErrors++;
      
      // Circuit breaker após 5 erros consecutivos
      if (state.consecutiveErrors > 5) {
        clearInterval(state.intervaloTimer);
        state.intervaloTimer = null;
        atualizarInterface("ERRO", 0, ["Sistema pausado por erros consecutivos"]);
      } else {
        atualizarInterface("ERRO", 0, [`Falha: ${error.message || error}`]);
      }
    } finally {
      state.leituraEmAndamento = false;
    }
  });
}

// =============================================
// CONTROLE DE TEMPO
// =============================================
function sincronizarTimer() {
  // Limpar timer existente
  if (state.intervaloTimer) {
    clearInterval(state.intervaloTimer);
    state.intervaloTimer = null;
  }
  
  // Sincronizar com relógio
  const agora = new Date();
  state.timer = 60 - agora.getSeconds();
  document.getElementById("timer").textContent = state.timer;
  
  // Atualização em tempo real
  state.intervaloTimer = setInterval(() => {
    state.timer = Math.max(0, state.timer - 1);
    document.getElementById("timer").textContent = state.timer;
    
    // Quando chegar a zero, disparar análise
    if (state.timer <= 0) {
      clearInterval(state.intervaloTimer);
      state.intervaloTimer = null;
      
      // Executar análise e depois reiniciar timer
      analisarMercado().finally(() => {
        if (state.consecutiveErrors <= 5) {
          sincronizarTimer(); // Reinicia APÓS a análise
        }
      });
    }
  }, 1000);
}

// =============================================
// INICIALIZAÇÃO
// =============================================
function iniciar() {
  // Sincronizar processos
  sincronizarTimer();
  
  // Atualizar relógio a cada segundo
  setInterval(atualizarRelogio, 1000);
  atualizarRelogio();
  
  // Primeira análise após estabilização
  setTimeout(() => {
    analisarMercado();
  }, 1000);
}

// Iniciar quando documento estiver pronto
document.addEventListener("DOMContentLoaded", iniciar);
