// =============================================
// ESTADO E CONFIGURAÇÕES GLOBAIS
// =============================================
const state = {
  connected: false,
  ultimos: [],
  timer: 59,
  ultimaAtualizacao: "",
  leituraEmAndamento: false,
  intervaloAtual: null,
  tentativasErro: 0,
  ultimoSinal: null,
  ultimoScore: 0,
  websocket: null,
  dadosHistoricos: {m1: []},
  winCount: 0,
  lossCount: 0,
  consecutiveLosses: 0,
  lastTradeTime: null,
  accountEmail: "",
  volatility: 0,
  exposure: 0,
  sessionToken: null
};

const CONFIG = {
  API_ENDPOINTS: {
    STOCKITY_LOGIN: "https://stockity.id/auth",
    STOCKITY_DATA: "https://api.stockity.id/v1/market",
    CRYPTO_IDX: "https://api.stockity.id/v1/indices/crypto-idx"
  },
  WS_ENDPOINT: "wss://stream.stockity.id/ws/crypto-idx@realtime",
  PARES: {
    CRYPTO_IDX: "CRYPTO_IDX"
  },
  PERIODOS: {
    RSI: 14,
    EMA_CURTA: 9,
    EMA_MEDIA: 21,
    SMA_VOLUME: 20,
    BANDA_LATERAL: 15
  },
  LIMIARES: {
    VOLUME_ALTO: 1.5,
    SCORE_MINIMO: 70,
    MAX_CONSECUTIVE_LOSSES: 3,
    MIN_RECOVERY_TIME: 15 * 60 * 1000
  }
};

// =============================================
// POLYFILLS PARA BROWSERS ANTIGOS
// =============================================
if (!window.btoa) {
  window.btoa = (str) => Buffer.from(str).toString('base64');
}
if (!window.atob) {
  window.atob = (b64Encoded) => Buffer.from(b64Encoded, 'base64').toString();
}

// =============================================
// SISTEMA DE AUTENTICAÇÃO ATUALIZADO
// =============================================
function encryptData(data) {
  return btoa(unescape(encodeURIComponent(JSON.stringify(data)));
}

function decryptData(encrypted) {
  try {
    return JSON.parse(decodeURIComponent(escape(atob(encrypted)));
  } catch (e) {
    console.error("Erro ao descriptografar:", e);
    return null;
  }
}

async function fazerLoginStockity(email, senha) {
  try {
    console.log("Iniciando autenticação...");
    const response = await fetch(CONFIG.API_ENDPOINTS.STOCKITY_LOGIN, {
      method: 'POST',
      headers: { 
        'Content-Type': 'application/json',
        'X-Requested-With': 'XMLHttpRequest'
      },
      body: JSON.stringify({
        email: email,
        password: senha,
        remember: true
      })
    });

    console.log("Status da resposta:", response.status);
    
    const data = await response.json();
    console.log("Resposta completa:", data);
    
    if (response.status === 200 && data.token) {
      return {
        success: true,
        token: data.token,
        user: data.user
      };
    } else {
      return {
        success: false,
        message: data.message || `Erro HTTP ${response.status}`
      };
    }
  } catch (error) {
    console.error("Erro fatal:", error);
    return {
      success: false,
      message: `Falha na conexão: ${error.message}`
    };
  }
}

// =============================================
// GERENCIAMENTO DE LOGIN ATUALIZADO
// =============================================
document.getElementById('login-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  
  const email = document.getElementById('stockity-email').value;
  const senha = document.getElementById('stockity-password').value;
  const statusElement = document.getElementById('login-status');
  const connectBtn = document.getElementById('connect-btn');
  
  connectBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> CONECTANDO';
  connectBtn.disabled = true;
  statusElement.textContent = "Autenticando na Stockity...";
  statusElement.style.color = "#FF9800";
  
  try {
    const loginResult = await fazerLoginStockity(email, senha);
    
    if (loginResult.success) {
      // Armazenar token de sessão
      state.sessionToken = loginResult.token;
      
      // Salvar credenciais criptografadas
      const credenciaisCripto = encryptData({ 
        email, 
        token: loginResult.token 
      });
      localStorage.setItem('stockity_creds', credenciaisCripto);
      
      statusElement.textContent = "✅ Login realizado com sucesso!";
      statusElement.style.color = "#4CAF50";
      
      state.accountEmail = email;
      state.connected = true;
      document.getElementById("account-email").textContent = email;
      
      setTimeout(showMainPanel, 1500);
    } else {
      statusElement.textContent = `❌ Falha no login: ${loginResult.message}`;
      statusElement.style.color = "#F44336";
    }
  } catch (error) {
    statusElement.textContent = "⚠️ Erro na conexão: " + error.message;
    statusElement.style.color = "#FF9800";
  } finally {
    connectBtn.innerHTML = '<i class="fa-solid fa-plug"></i> CONECTAR';
    connectBtn.disabled = false;
  }
});

// Botão de login alternativo
document.getElementById('debug-login-btn').addEventListener('click', async () => {
  const email = document.getElementById('stockity-email').value;
  const senha = document.getElementById('stockity-password').value;
  
  if (!email || !senha) {
    alert("Preencha email e senha!");
    return;
  }

  const statusElement = document.getElementById('login-status');
  statusElement.textContent = "Tentando conexão alternativa...";
  statusElement.style.color = "#FF9800";
  
  const result = await fazerLoginStockity(email, senha);
  
  if (result.success) {
    statusElement.textContent = "✅ Login realizado com sucesso (alternativo)!";
    statusElement.style.color = "#4CAF50";
    
    // Armazenar token de sessão
    state.sessionToken = result.token;
    localStorage.setItem('stockity_creds', encryptData({ email, token: result.token }));
    
    state.accountEmail = email;
    state.connected = true;
    document.getElementById("account-email").textContent = email;
    
    setTimeout(showMainPanel, 1500);
  } else {
    statusElement.textContent = `❌ Falha no login: ${result.message}`;
    statusElement.style.color = "#F44336";
  }
});

document.getElementById('logout-btn').addEventListener('click', () => {
  localStorage.removeItem('stockity_creds');
  state.sessionToken = null;
  state.connected = false;
  location.reload();
});

// =============================================
// FUNÇÕES DE DADOS DO CRYPTO IDX
// =============================================
async function carregarDadosCryptoIdx() {
  if (!state.sessionToken) {
    throw new Error("Não autenticado");
  }

  try {
    const [dadosResponse, metadadosResponse] = await Promise.all([
      fetch(`${CONFIG.API_ENDPOINTS.STOCKITY_DATA}/klines?symbol=${CONFIG.PARES.CRYPTO_IDX}&interval=1m&limit=100`, {
        headers: {
          'Authorization': `Bearer ${state.sessionToken}`
        }
      }),
      fetch(CONFIG.API_ENDPOINTS.CRYPTO_IDX, {
        headers: {
          'Authorization': `Bearer ${state.sessionToken}`
        }
      })
    ]);
    
    // Verificar se a resposta é válida
    if (dadosResponse.status === 401) {
      throw new Error("Sessão expirada");
    }
    
    if (!dadosResponse.ok || !metadadosResponse.ok) {
      throw new Error(`Erro na resposta da API: ${dadosResponse.status} / ${metadadosResponse.status}`);
    }
    
    const dados = await dadosResponse.json();
    const metadados = await metadadosResponse.json();
    
    atualizarComposicao(metadados.composition);
    atualizarRebalanceamento(metadados.next_rebalancing);
    
    return {
      time: new Date(dados[0][0]).toISOString(),
      open: parseFloat(dados[0][1]),
      high: parseFloat(dados[0][2]),
      low: parseFloat(dados[0][3]),
      close: parseFloat(dados[0][4]),
      volume: parseFloat(dados[0][5]),
      momentum: parseFloat(dados[0][6] || 0),
      spread: parseFloat(dados[0][7] || 0)
    };
  } catch (e) {
    console.error("Erro ao obter dados do Crypto IDX:", e);
    throw e;
  }
}

function atualizarComposicao(composicao) {
  const lista = document.getElementById("composicao");
  if (!lista) return;
  
  lista.innerHTML = composicao.map(ativo => `
    <li>
      <span>${ativo.symbol}</span>
      <span>${(ativo.weight * 100).toFixed(1)}%</span>
    </li>
  `).join("");
}

function atualizarRebalanceamento(data) {
  const elemento = document.getElementById("rebalanceamento");
  if (!elemento) return;
  
  const agora = new Date();
  const rebalanceamento = new Date(data);
  const diffHoras = (rebalanceamento - agora) / (1000 * 60 * 60);
  
  elemento.textContent = diffHoras > 0 
    ? `${rebalanceamento.toLocaleDateString()} (em ${Math.ceil(diffHoras)} horas)` 
    : "Em andamento";
}

// =============================================
// GERADOR DE SINAIS PARA CRYPTO IDX (SIMULAÇÃO)
// =============================================
function gerarSinal(analises) {
  const rebalanceamentoElement = document.getElementById("rebalanceamento");
  if (rebalanceamentoElement && 
      (rebalanceamentoElement.textContent.includes("Em andamento") || 
       rebalanceamentoElement.textContent.includes("em 6 horas"))) {
    console.log("Não operar próximo a rebalanceamento");
    return "ESPERAR";
  }
  
  if (state.consecutiveLosses >= CONFIG.LIMIARES.MAX_CONSECUTIVE_LOSSES) {
    const tempoAtual = Date.now();
    if (!state.lastTradeTime || 
        (tempoAtual - state.lastTradeTime) < CONFIG.LIMIARES.MIN_RECOVERY_TIME) {
      console.log("Bloqueado: " + state.consecutiveLosses + " losses consecutivos");
      return "ESPERAR";
    } else {
      state.consecutiveLosses = 0;
    }
  }

  const {m1} = analises;
  
  if (!m1 || !m1.closes || m1.closes.length < 20) {
    console.log("Dados insuficientes para análise");
    return "ESPERAR";
  }
  
  // Simulação de geração de sinal
  const randomSignal = Math.random();
  if (randomSignal > 0.6) {
    return "CALL";
  } else if (randomSignal < 0.4) {
    return "PUT";
  } else {
    return "ESPERAR";
  }
}

// =============================================
// GESTÃO DE RISCO PARA ÍNDICE
// =============================================
function calcularVolatilidade(dados) {
  if (dados.length < 2) return 0;
  
  let somaRetornos = 0;
  for (let i = 1; i < dados.length; i++) {
    const retorno = Math.log(dados[i].close / dados[i-1].close);
    somaRetornos += Math.pow(retorno, 2);
  }
  
  const variancia = somaRetornos / (dados.length - 1);
  return Math.sqrt(variancia) * Math.sqrt(365);
}

function calcularExposicao(score, volatilidade) {
  const riscoBase = 0.02;
  const fatorVol = Math.min(1, 0.5 / (volatilidade/100)); // volatilidade em decimal
  const fatorScore = score / 100;
  
  return (riscoBase * fatorVol * fatorScore * 100).toFixed(2);
}

// =============================================
// FUNÇÕES AUXILIARES
// =============================================
function calcularSMA(dados, periodo) {
  if (dados.length < periodo) return 0;
  const slice = dados.slice(-periodo);
  return slice.reduce((a, b) => a + b, 0) / periodo;
}

function calcularRSI(closes, periodo = 14) {
  if (closes.length < periodo + 1) return 50;
  
  let gains = 0;
  let losses = 0;
  
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

function avaliarTendencia(closes) {
  if (closes.length < 21) return "NEUTRA";
  
  const ema9 = calcularSMA(closes.slice(-9), 9);
  const ema21 = calcularSMA(closes.slice(-21), 21);
  const ultimoClose = closes[closes.length-1];
  
  if (ultimoClose > ema9 && ema9 > ema21) return "FORTE_ALTA";
  if (ultimoClose < ema9 && ema9 < ema21) return "FORTE_BAIXA";
  if (ultimoClose > ema9) return "ALTA";
  if (ultimoClose < ema9) return "BAIXA";
  
  return "NEUTRA";
}

// =============================================
// CORE DO SISTEMA
// =============================================
async function analisarMercado() {
  if (!state.connected || state.leituraEmAndamento) return;
  
  state.leituraEmAndamento = true;
  console.log("Iniciando análise de mercado...");
  
  try {
    const dados = await carregarDadosCryptoIdx();
    
    state.dadosHistoricos.m1.push(dados);
    if (state.dadosHistoricos.m1.length > 100) {
      state.dadosHistoricos.m1.shift();
    }
    
    state.volatility = calcularVolatilidade(state.dadosHistoricos.m1);
    document.getElementById("volatilidade").textContent = `${state.volatility.toFixed(2)}%`;
    
    const analises = {
      m1: {
        time: dados.time,
        open: dados.open,
        high: dados.high,
        low: dados.low,
        close: dados.close,
        volume: dados.volume,
        closes: state.dadosHistoricos.m1.map(v => v.close),
        volumeMedia: calcularSMA(state.dadosHistoricos.m1.map(v => v.volume), CONFIG.PERIODOS.SMA_VOLUME),
        tendencia: avaliarTendencia(state.dadosHistoricos.m1.map(v => v.close)),
        rsi: calcularRSI(state.dadosHistoricos.m1.map(v => v.close)),
        momentum: dados.momentum,
        spread: dados.spread
      }
    };
    
    const sinal = gerarSinal(analises);
    const score = Math.floor(Math.random() * 30) + 70; // Simulação de score
    
    state.exposure = calcularExposicao(score, state.volatility);
    document.getElementById("exposicao").textContent = `${state.exposure}%`;
    
    state.ultimoSinal = sinal;
    state.ultimoScore = score;
    state.ultimaAtualizacao = new Date().toLocaleTimeString("pt-BR");
    
    if (score >= CONFIG.LIMIARES.SCORE_MINIMO && sinal !== "ESPERAR") {
      const entrada = `${state.ultimaAtualizacao} - ${sinal} (${score}%)`;
      state.ultimos.unshift(entrada);
      if (state.ultimos.length > 5) state.ultimos.pop();
      
      console.log(`Sinal emitido: ${sinal} com ${score}% de confiança`);
      
      // Tocar som apenas se não for erro
      if (sinal === "CALL") {
        document.getElementById("som-call").play().catch(e => console.log("Erro ao tocar som:", e));
      } else if (sinal === "PUT") {
        document.getElementById("som-put").play().catch(e => console.log("Erro ao tocar som:", e));
      }
    }
    
    atualizarInterface(sinal, score, analises);
    state.tentativasErro = 0;
  } catch (e) {
    console.error("Erro na análise:", e);
    if (e.message === "Sessão expirada") {
      handleSessionExpired();
    }
    atualizarInterface("ERRO", 0, {});
    state.tentativasErro++;
  } finally {
    state.leituraEmAndamento = false;
    console.log("Análise concluída");
  }
}

function handleSessionExpired() {
  const statusElement = document.getElementById('login-status');
  if (statusElement) {
    statusElement.textContent = "❌ Sessão expirada. Por favor, faça login novamente.";
    statusElement.style.color = "#F44336";
  }
  
  // Voltar para tela de login
  document.getElementById("login-section").classList.remove("hidden");
  document.getElementById("main-panel").classList.add("hidden");
  
  // Limpar credenciais
  localStorage.removeItem('stockity_creds');
  state.sessionToken = null;
  state.connected = false;
}

// =============================================
// FUNÇÕES DE INTERFACE
// =============================================
function atualizarInterface(sinal, score, analises) {
  const comandoElement = document.getElementById("comando");
  const scoreElement = document.getElementById("score");
  
  if (comandoElement) {
    comandoElement.textContent = sinal === "CALL" ? "CALL 📈" : 
                               sinal === "PUT" ? "PUT 📉" : 
                               sinal === "ERRO" ? "ERRO ❗" : "ESPERAR ✋";
    comandoElement.className = "signal-display " + sinal.toLowerCase();
  }
  
  if (scoreElement) {
    scoreElement.textContent = `CONFIANÇA: ${score}%`;
    scoreElement.style.color = score > 85 ? '#00b894' : 
                             score > 70 ? '#fdcb6e' : 
                             score > 50 ? '#ff7675' : '#d63031';
  }
  
  if (analises && analises.m1) {
    document.getElementById("m1-trend").textContent = analises.m1.tendencia;
    document.getElementById("m1-rsi").textContent = analises.m1.rsi.toFixed(1);
    
    const volRatio = analises.m1.volume / analises.m1.volumeMedia;
    document.getElementById("m1-volume").textContent = volRatio.toFixed(1) + 'x';
  }
  
  atualizarListaHistorico();
  atualizarTaxaAcerto();
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
  
  document.getElementById("win-count").textContent = state.winCount;
  document.getElementById("loss-count").textContent = state.lossCount;
  
  const hora = new Date().toLocaleTimeString("pt-BR");
  const entradaManual = `${hora} - ${resultado} (${state.ultimoScore}%)`;
  state.ultimos.unshift(entradaManual);
  if (state.ultimos.length > 5) state.ultimos.pop();
  
  atualizarListaHistorico();
  atualizarTaxaAcerto();
}

function sincronizarTimer() {
  clearInterval(state.intervaloAtual);
  state.timer = 59;
  
  const timerElement = document.getElementById("timer");
  if (timerElement) {
    timerElement.textContent = state.timer;
  }
  
  state.intervaloAtual = setInterval(() => {
    state.timer--;
    
    if (state.timer <= 0) {
      clearInterval(state.intervaloAtual);
      analisarMercado();
      sincronizarTimer();
    }
  }, 1000);
}

// =============================================
// WEBSOCKET (SIMULADO)
// =============================================
function iniciarWebSocket() {
  // Simulação: a cada minuto dispara uma análise
  setInterval(() => {
    if (state.connected) {
      analisarMercado();
    }
  }, 60000);
}

// =============================================
// INICIALIZAÇÃO DO SISTEMA
// =============================================
function showMainPanel() {
  document.getElementById("login-section").classList.add("hidden");
  document.getElementById("main-panel").classList.remove("hidden");
  iniciarAplicativo();
}

function iniciarAplicativo() {
  console.log("Iniciando aplicativo...");
  
  state.ultimos = Array(5).fill("--:--:-- - AGUARDANDO");
  
  // Atualizar relógio em tempo real
  const updateClock = () => {
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
  };
  
  setInterval(updateClock, 1000);
  updateClock();
  
  sincronizarTimer();
  iniciarWebSocket();
  
  // Primeira análise após 3 segundos
  setTimeout(() => {
    analisarMercado();
  }, 3000);
}

// =============================================
// CONTROLES MANUAIS
// =============================================
document.getElementById('manual-call').addEventListener('click', () => registrar('WIN'));
document.getElementById('manual-put').addEventListener('click', () => registrar('LOSS'));
document.getElementById('reset-stats').addEventListener('click', () => {
  state.winCount = 0;
  state.lossCount = 0;
  state.consecutiveLosses = 0;
  state.lastTradeTime = null;
  
  document.getElementById("win-count").textContent = "0";
  document.getElementById("loss-count").textContent = "0";
  atualizarTaxaAcerto();
});

// =============================================
// VERIFICAÇÃO DE LOGIN AO CARREGAR
// =============================================
window.addEventListener('DOMContentLoaded', () => {
  const credsCripto = localStorage.getItem('stockity_creds');
  
  if (credsCripto) {
    const creds = decryptData(credsCripto);
    
    if (creds && creds.email && creds.token) {
      // Preencher formulário e tentar reconectar
      document.getElementById("stockity-email").value = creds.email;
      const statusElement = document.getElementById('login-status');
      statusElement.textContent = "✅ Sessão recuperada. Reconectando...";
      statusElement.style.color = "#4CAF50";
      
      // Tentar usar o token armazenado
      state.sessionToken = creds.token;
      state.accountEmail = creds.email;
      
      // Verificar se o token ainda é válido
      setTimeout(() => {
        analisarMercado()
          .then(() => {
            state.connected = true;
            document.getElementById("account-email").textContent = creds.email;
            showMainPanel();
          })
          .catch((error) => {
            console.error("Falha na reconexão automática:", error);
            if (error.message === "Sessão expirada") {
              statusElement.textContent = "❌ Sessão expirada. Faça login novamente.";
              statusElement.style.color = "#F44336";
            } else {
              statusElement.textContent = "⚠️ Erro na reconexão: " + error.message;
              statusElement.style.color = "#FF9800";
            }
          });
      }, 1500);
    }
  }
});
