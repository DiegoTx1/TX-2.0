 // =============================================
        // CONFIGURAÇÕES AVANÇADAS
        // =============================================
        const CONFIG = {
          PERIODOS: {
            EMA_RAPIDA: 3,
            EMA_MEDIA: 13,
            EMA_LONGA: 34,
            RSI: 7,
            VOLUME_LOOKBACK: 4,
            ATR: 14
          },
          LIMITES: {
            RSI_ALTO: 72,
            RSI_BAIXO: 30,
            VOLUME_THRESHOLD: 2.5,
            ATR_THRESHOLD: 0.015
          },
          PESOS: {
            TENDENCIA: 40,
            MOMENTUM: 30,
            VOLUME: 20,
            VOLATILIDADE: 10
          },
          HORARIOS_PREFERENCIAIS: [
            { start: 12, end: 15 },
            { start: 15, end: 18 },
            { start: 21, end: 24 }
          ],
          SYMBOL: "IDXUSDT",
          API_URL: "https://api.binance.com/api/v3"
        };

        // =============================================
        // ESTADO DO SISTEMA
        // =============================================
        const state = {
          timer: 60,
          ultimosSinais: [],
          ultimaAtualizacao: "",
          dadosHistoricos: [],
          ultimoSinal: "ESPERAR",
          ultimoScore: 0,
          historicoOperacoes: { win: 0, loss: 0 },
          intervaloTimer: null,
          precoAtual: 0,
          volumeAtual: 0,
          botAtivo: true,
          chart: null
        };

        // =============================================
        // CONEXÃO COM MERCADO REAL (BINANCE API)
        // =============================================
        async function obterDadosBinance() {
          try {
            // Obter dados históricos
            const response = await fetch(`${CONFIG.API_URL}/klines?symbol=${CONFIG.SYMBOL}&interval=1m&limit=100`);
            
            if (!response.ok) throw new Error("Erro na API");
            
            const klines = await response.json();
            
            // Processar dados
            state.dadosHistoricos = klines.map(k => ({
              time: k[0],
              open: parseFloat(k[1]),
              high: parseFloat(k[2]),
              low: parseFloat(k[3]),
              close: parseFloat(k[4]),
              volume: parseFloat(k[5])
            }));
            
            // Atualizar preço atual
            const last = state.dadosHistoricos[state.dadosHistoricos.length - 1];
            state.precoAtual = last.close;
            state.volumeAtual = last.volume;
            
            // Atualizar UI
            document.querySelector('.price-display').textContent = state.precoAtual.toFixed(4);
            document.querySelector('.price-change').textContent = 
              `${((state.precoAtual - state.dadosHistoricos[0].open) / state.dadosHistoricos[0].open * 100).toFixed(2)}%`;
            
            return true;
          } catch (error) {
            console.error("Erro ao obter dados:", error);
            return false;
          }
        }

        // =============================================
        // FUNÇÕES TÉCNICAS
        // =============================================
        function calcularEMA(dados, periodo) {
          if (!dados || dados.length < periodo) return null;
          
          const closes = dados.map(d => d.close);
          let sma = 0;
          for (let i = 0; i < periodo; i++) {
            sma += closes[i];
          }
          sma /= periodo;
          
          const k = 2 / (periodo + 1);
          let ema = sma;
          
          for (let i = periodo; i < closes.length; i++) {
            ema = closes[i] * k + ema * (1 - k);
          }
          
          return ema;
        }

        function calcularRSI(dados, periodo = CONFIG.PERIODOS.RSI) {
          if (dados.length < periodo + 1) return 50;
          
          const closes = dados.map(d => d.close);
          let gains = 0;
          let losses = 0;
          
          for (let i = closes.length - periodo; i < closes.length - 1; i++) {
            const diff = closes[i + 1] - closes[i];
            if (diff >= 0) gains += diff;
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

        function calcularVolumeRelativo(dados, lookback = CONFIG.PERIODOS.VOLUME_LOOKBACK) {
          if (dados.length < lookback) return 1.0;
          
          const volumes = dados.map(d => d.volume);
          const volumeAtual = volumes[volumes.length - 1];
          const volumesAnteriores = volumes.slice(-lookback - 1, -1);
          const mediaVolumes = volumesAnteriores.reduce((s, v) => s + v, 0) / lookback;
          
          return mediaVolumes > 0 ? volumeAtual / mediaVolumes : 1.0;
        }

        function detectarImpulso(rapida, media, longa) {
          return rapida > media && media > longa;
        }

        function calcularForcaMercado() {
          const horaAtual = new Date().getUTCHours();
          const horaPreferencial = CONFIG.HORARIOS_PREFERENCIAIS.some(period => 
            horaAtual >= period.start && horaAtual < period.end
          );
          
          return horaPreferencial ? 1.15 : 0.85;
        }

        // =============================================
        // GERADOR DE SINAIS
        // =============================================
        function gerarSinal() {
          if (state.dadosHistoricos.length < 50) {
            return { sinal: "ESPERAR", score: 0, criterios: ["Coletando dados..."] };
          }
          
          const emaRapida = calcularEMA(state.dadosHistoricos, CONFIG.PERIODOS.EMA_RAPIDA);
          const emaMedia = calcularEMA(state.dadosHistoricos, CONFIG.PERIODOS.EMA_MEDIA);
          const emaLonga = calcularEMA(state.dadosHistoricos, CONFIG.PERIODOS.EMA_LONGA);
          const rsi = calcularRSI(state.dadosHistoricos);
          const atr = calcularATR(state.dadosHistoricos);
          const volumeRel = calcularVolumeRelativo(state.dadosHistoricos);
          const forcaMercado = calcularForcaMercado();
          
          if ([emaRapida, emaMedia, emaLonga, rsi].some(val => val === null || isNaN(val))) {
            return { sinal: "ERRO", score: 0, criterios: ["Erro nos cálculos"] };
          }
          
          const impulsoAlta = detectarImpulso(emaRapida, emaMedia, emaLonga);
          const impulsoBaixa = detectarImpulso(emaLonga, emaMedia, emaRapida);
          
          let score = 0;
          const criterios = [];
          
          if (impulsoAlta) {
            score += CONFIG.PESOS.TENDENCIA;
            criterios.push(`✅ Tendência de Alta (${CONFIG.PESOS.TENDENCIA}%)`);
          } else if (impulsoBaixa) {
            score += CONFIG.PESOS.TENDENCIA;
            criterios.push(`✅ Tendência de Baixa (${CONFIG.PESOS.TENDENCIA}%)`);
          }
          
          if (impulsoAlta && rsi < CONFIG.LIMITES.RSI_ALTO && rsi > 40) {
            score += CONFIG.PESOS.MOMENTUM;
            criterios.push(`✅ Momentum Positivo (${CONFIG.PESOS.MOMENTUM}%)`);
          } else if (impulsoBaixa && rsi > CONFIG.LIMITES.RSI_BAIXO && rsi < 60) {
            score += CONFIG.PESOS.MOMENTUM;
            criterios.push(`✅ Momentum Negativo (${CONFIG.PESOS.MOMENTUM}%)`);
          }
          
          if (volumeRel > CONFIG.LIMITES.VOLUME_THRESHOLD) {
            score += CONFIG.PESOS.VOLUME;
            criterios.push(`🔥 Volume Anômalo (${CONFIG.PESOS.VOLUME}%)`);
          }
          
          if (atr > CONFIG.LIMITES.ATR_THRESHOLD) {
            score += CONFIG.PESOS.VOLATILIDADE;
            criterios.push(`📈 Volatilidade Elevada (${CONFIG.PESOS.VOLATILIDADE}%)`);
          }
          
          score = Math.min(100, Math.max(0, score * forcaMercado));
          
          let sinal = "ESPERAR";
          
          if (score >= 75 && impulsoAlta && rsi < 65) {
            sinal = "CALL";
            criterios.push("🚀 Sinal CALL confirmado");
          } 
          else if (score >= 75 && impulsoBaixa && rsi > 35) {
            sinal = "PUT";
            criterios.push("📉 Sinal PUT confirmado");
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
          const barraProgresso = document.getElementById("barra-progresso");
          
          comandoElement.className = "signal";
          comandoElement.classList.add(sinal.toLowerCase());
          
          if (sinal === "CALL") {
            comandoElement.textContent = "CALL 📈";
            try {
              document.getElementById("som-call").play();
            } catch (e) {
              console.log("Erro ao tocar som:", e);
            }
          } 
          else if (sinal === "PUT") {
            comandoElement.textContent = "PUT 📉";
            try {
              document.getElementById("som-put").play();
            } catch (e) {
              console.log("Erro ao tocar som:", e);
            }
          } 
          else if (sinal === "ERRO") {
            comandoElement.textContent = "ERRO ❌";
          } 
          else {
            comandoElement.textContent = "AGUARDANDO SINAL";
          }
          
          document.getElementById("score").textContent = `${Math.round(score)}%`;
          barraProgresso.style.width = `${score}%`;
          
          if (score >= 75) barraProgresso.style.background = "linear-gradient(90deg, #00e676, #00b248)";
          else if (score >= 50) barraProgresso.style.background = "linear-gradient(90deg, #ffc107, #ff9800)";
          else barraProgresso.style.background = "linear-gradient(90deg, #f44336, #d32f2f)";
          
          const criteriosHTML = criterios.length 
            ? criterios.map(c => `<li><i class="fas fa-check-circle"></i> ${c}</li>`).join("") 
            : "<li><i class="fas fa-circle-notch fa-spin"></i> Analisando condições de mercado...</li>";
          document.getElementById("criterios").innerHTML = criteriosHTML;
          
          state.ultimoSinal = sinal;
          state.ultimoScore = score;
          
          document.getElementById("wins").textContent = state.historicoOperacoes.win;
          document.getElementById("losses").textContent = state.historicoOperacoes.loss;
        }

        function atualizarHistorico() {
          const historyList = document.getElementById("ultimos");
          historyList.innerHTML = "";
          
          if (state.ultimosSinais.length === 0) {
            historyList.innerHTML = "<li class='wait'>Nenhum sinal registrado</li>";
            return;
          }
          
          state.ultimosSinais.forEach(sinal => {
            const li = document.createElement("li");
            li.className = sinal.direction.toLowerCase();
            
            li.innerHTML = `
              <div class="trade-info">
                <div>${sinal.time}</div>
                <div>${sinal.direction} • ${sinal.score}%</div>
              </div>
              <div class="trade-status ${sinal.resultado ? (sinal.resultado === 'WIN' ? 'status-success' : 'status-danger') : 'status-warning'}">
                ${sinal.resultado || 'PENDENTE'}
              </div>
            `;
            
            historyList.appendChild(li);
          });
        }

        function registrarResultado(resultado) {
          if (state.ultimoSinal === "CALL" || state.ultimoSinal === "PUT") {
            const ultimoSinalIndex = state.ultimosSinais.findIndex(s => 
              (s.direction === state.ultimoSinal) && !s.resultado
            );
            
            if (ultimoSinalIndex !== -1) {
              state.ultimosSinais[ultimoSinalIndex].resultado = resultado;
              
              if (resultado === "WIN") {
                state.historicoOperacoes.win++;
              } else {
                state.historicoOperacoes.loss++;
              }
              
              atualizarHistorico();
            }
          }
        }

        function atualizarGrafico() {
          const ctx = document.getElementById('price-chart').getContext('2d');
          
          if (state.chart) {
            state.chart.destroy();
          }
          
          const labels = state.dadosHistoricos.map(d => {
            const date = new Date(d.time);
            return `${date.getHours()}:${date.getMinutes().toString().padStart(2, '0')}`;
          });
          
          const data = state.dadosHistoricos.map(d => d.close);
          
          state.chart = new Chart(ctx, {
            type: 'line',
            data: {
              labels: labels,
              datasets: [{
                label: 'Preço IDX',
                data: data,
                borderColor: '#6366f1',
                backgroundColor: 'rgba(99, 102, 241, 0.1)',
                borderWidth: 2,
                pointRadius: 0,
                tension: 0.4,
                fill: true
              }]
            },
            options: {
              responsive: true,
              maintainAspectRatio: false,
              plugins: {
                legend: { display: false }
              },
              scales: {
                x: {
                  display: false
                },
                y: {
                  display: false
                }
              }
            }
          });
        }

        // =============================================
        // CICLO PRINCIPAL DE TRADING
        // =============================================
        async function analisarMercado() {
          if (!state.botAtivo) return;
          
          // Obter dados reais
          const sucesso = await obterDadosBinance();
          
          if (!sucesso) {
            atualizarInterface("ERRO", 0, ["Falha na conexão com o mercado"]);
            return;
          }
          
          // Atualizar gráfico
          atualizarGrafico();
          
          // Gerar sinal
          const { sinal, score, criterios } = gerarSinal();
          
          // Atualizar interface
          atualizarInterface(sinal, score, criterios);
          
          // Registrar sinal
          if (sinal === "CALL" || sinal === "PUT") {
            state.ultimosSinais.unshift({
              time: state.ultimaAtualizacao,
              direction: sinal,
              score: Math.round(score),
              resultado: null
            });
            
            if (state.ultimosSinais.length > 8) state.ultimosSinais.pop();
            
            atualizarHistorico();
          }
        }

        // =============================================
        // CONTROLE DE TEMPO
        // =============================================
        function sincronizarTimer() {
          const agora = new Date();
          state.timer = 60 - agora.getSeconds();
          document.getElementById("timer").textContent = `${state.timer}s`;
          
          if (state.intervaloTimer) {
            clearInterval(state.intervaloTimer);
          }
          
          state.intervaloTimer = setInterval(() => {
            state.timer--;
            document.getElementById("timer").textContent = `${state.timer}s`;
            
            if (state.timer <= 0) {
              analisarMercado();
              state.timer = 60;
            }
          }, 1000);
        }

        // =============================================
        // INICIALIZAÇÃO DO SISTEMA
        // =============================================
        async function iniciar() {
          // Obter dados iniciais
          await obterDadosBinance();
          
          // Iniciar processos
          sincronizarTimer();
          setInterval(atualizarRelogio, 1000);
          atualizarRelogio();
          
          // Primeira análise
          analisarMercado();
          
          // Inicializar interface
          atualizarInterface("ESPERAR", 0, ["Analisando mercado..."]);
          
          // Atualizar gráfico
          atualizarGrafico();
          
          // Configurar botões
          document.getElementById("btn-win").addEventListener("click", () => registrarResultado("WIN"));
          document.getElementById("btn-loss").addEventListener("click", () => registrarResultado("LOSS"));
          document.getElementById("btn-refresh").addEventListener("click", analisarMercado);
        }

        document.addEventListener("DOMContentLoaded", iniciar)
