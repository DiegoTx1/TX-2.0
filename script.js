  // =============================================
        // CONFIGURAÇÕES GLOBAIS (ATUALIZADAS PARA CRYPTO IDX)
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
            marketOpen: true,
            tendenciaDetectada: "NEUTRA",
            forcaTendencia: 0,
            dadosHistoricos: [],
            resistenciaKey: 0,
            suporteKey: 0,
            rsiCache: { avgGain: 0, avgLoss: 0, initialized: false },
            emaCache: {
                ema5: null,
                ema13: null,
                ema200: null
            },
            macdCache: {
                emaRapida: null,
                emaLenta: null,
                macdLine: [],
                signalLine: []
            },
            superTrendCache: [],
            atrGlobal: 0,
            rsiHistory: [],
            cooldown: 0,
            velaAnterior: null
        };

        const CONFIG = {
            API_ENDPOINTS: {
                TWELVE_DATA: "https://api.twelvedata.com"
            },
            PARES: {
                CRYPTO_IDX: "BTC/USD"
            },
            PERIODOS: {
                RSI: 9,
                STOCH_K: 14,
                STOCH_D: 3,
                EMA_CURTA: 5,
                EMA_MEDIA: 13,
                EMA_LONGA: 200,
                MACD_RAPIDA: 6,
                MACD_LENTA: 13,
                MACD_SINAL: 9,
                VELAS_CONFIRMACAO: 3,
                ANALISE_LATERAL: 20,
                ATR: 14,
                SUPERTREND: 7,
                DIVERGENCIA_LOOKBACK: 8,
                EXTREME_LOOKBACK: 2
            },
            LIMIARES: {
                SCORE_ALTO: 85,
                SCORE_MEDIO: 70,
                RSI_OVERBOUGHT: 78,
                RSI_OVERSOLD: 22,
                STOCH_OVERBOUGHT: 88,
                STOCH_OVERSOLD: 12,
                VARIACAO_LATERAL: 0.005,
                ATR_LIMIAR: 0.015,
                LATERALIDADE_LIMIAR: 0.005,
                MOMENTUM_MINIMO: 0.4
            },
            PESOS: {
                RSI: 1.5,
                MACD: 2.0,
                TENDENCIA: 3.2,
                STOCH: 0.8,
                SUPERTREND: 2.3,
                DIVERGENCIA: 1.5,
                VOLUME: 2.5
            }
        };

        // =============================================
        // GERENCIADOR DE CHAVES API
        // =============================================
        const API_KEYS = [
            "9cf795b2a4f14d43a049ca935d174ebb",
            "0105e6681b894e0185704171c53f5075"
        ];
        let currentKeyIndex = 0;
        let errorCount = 0;

        // =============================================
        // SISTEMA DE TENDÊNCIA MULTI TIMEFRAME
        // =============================================
        function avaliarTendenciaMultiTimeframe(dados) {
            if (dados.length < 20) return { tendencia: "NEUTRA", forca: 0 };
            
            const closes = dados.map(d => d.close);
            const timeframe4x = Math.max(3, Math.floor(dados.length / 4));
            
            const ema5Curto = calcularEMA(closes, CONFIG.PERIODOS.EMA_CURTA);
            const ema13Curto = calcularEMA(closes, CONFIG.PERIODOS.EMA_MEDIA);
            const emaLongo = calcularEMA(closes, timeframe4x);
            
            const diffCurto = ema5Curto - ema13Curto;
            const diffLongo = ema5Curto - emaLongo;
            
            const forcaCurto = Math.min(100, Math.abs(diffCurto * 10000));
            const forcaLongo = Math.min(100, Math.abs(diffLongo * 5000));
            
            if (diffCurto > 0 && diffLongo > 0 && forcaCurto > 60 && forcaLongo > 40) {
                return { tendencia: "FORTE_ALTA", forca: (forcaCurto + forcaLongo) / 2 };
            }
            
            if (diffCurto < 0 && diffLongo < 0 && forcaCurto > 60 && forcaLongo > 40) {
                return { tendencia: "FORTE_BAIXA", forca: (forcaCurto + forcaLongo) / 2 };
            }
            
            return { tendencia: "NEUTRA", forca: 0 };
        }

        // =============================================
        // DETECÇÃO DE LATERALIDADE (AJUSTADO PARA CRIPTO)
        // =============================================
        function detectarLateralidade(closes, periodo = CONFIG.PERIODOS.ANALISE_LATERAL, limiar = CONFIG.LIMIARES.LATERALIDADE_LIMIAR) {
            const variacoes = [];
            for (let i = 1; i < periodo; i++) {
                if (closes.length - i - 1 < 0) break;
                variacoes.push(Math.abs(closes[closes.length - i] - closes[closes.length - i - 1]));
            }
            if (variacoes.length < periodo - 1) return false;
            const mediaVariacao = calcularMedia.simples(variacoes, periodo-1);
            return mediaVariacao < limiar;
        }

        // =============================================
        // CÁLCULO DE SUPORTE/RESISTÊNCIA PARA CRIPTO
        // =============================================
        function calcularZonasPreco(dados, periodo = 50) {
            if (dados.length < periodo) periodo = dados.length;
            const slice = dados.slice(-periodo);
            const highs = slice.map(v => v.high);
            const lows = slice.map(v => v.low);
            return {
                resistencia: Math.max(...highs),
                suporte: Math.min(...lows),
                pivot: (Math.max(...highs) + Math.min(...lows) + dados[dados.length-1].close) / 3
            };
        }

        // =============================================
        // CONFIRMAÇÃO DE BREAKOUT
        // =============================================
        function confirmarBreakout(velaAtual, velaAnterior, volumeMedio) {
            if (!velaAnterior) return false;
            
            const tamanhoCorpo = Math.abs(velaAtual.close - velaAtual.open);
            const tamanhoMinimo = state.atrGlobal * 0.7;
            
            if (tamanhoCorpo < tamanhoMinimo) return false;
            
            if (velaAtual.volume < volumeMedio * 1.8) return false;
            
            const sombraSuperior = velaAtual.high - Math.max(velaAtual.open, velaAtual.close);
            const sombraInferior = Math.min(velaAtual.open, velaAtual.close) - velaAtual.low;
            
            if (sombraSuperior > tamanhoCorpo * 2 || sombraInferior > tamanhoCorpo * 2) {
                return false;
            }
            
            return true;
        }

        // =============================================
        // VALIDAÇÃO DE DIVERGÊNCIAS
        // =============================================
        function validarDivergencia(divergencia, close, emaMedia) {
            if (!divergencia.divergenciaRSI) return false;
            
            if (divergencia.tipoDivergencia === "ALTA" && close < emaMedia) {
                return false;
            }
            
            if (divergencia.tipoDivergencia === "BAIXA" && close > emaMedia) {
                return false;
            }
            
            return true;
        }

        // =============================================
        // CÁLCULO DE MOMENTUM
        // =============================================
        function calcularMomentum(closes, periodo = 5) {
            if (closes.length < periodo + 1) return 0;
            const variacao = closes[closes.length - 1] - closes[closes.length - periodo - 1];
            return variacao / closes[closes.length - periodo - 1];
        }

        // =============================================
        // GERADOR DE SINAIS OTIMIZADO PARA CRIPTO
        // =============================================
        function gerarSinal(indicadores, divergencias, lateral) {
            const { rsi, stoch, macd, close, emaCurta, emaMedia, superTrend, tendencia, atr } = indicadores;
            const volumeMedio = calcularMedia.simples(state.dadosHistoricos.slice(-20).map(d => d.volume), 20);
            const momentum = calcularMomentum(state.dadosHistoricos.map(d => d.close));
            
            // Filtro de volatilidade e momentum
            if (atr / close < 0.005 || Math.abs(momentum) < CONFIG.LIMIARES.MOMENTUM_MINIMO) {
                return "ESPERAR";
            }
            
            // Tendência forte com confirmação
            if (tendencia.forca > 75) {
                const confVolume = indicadores.volume > volumeMedio * 1.5;
                
                if (tendencia.tendencia === "FORTE_ALTA") {
                    const confPreco = close > emaCurta && close > state.resistenciaKey;
                    if (confPreco && confVolume && macd.histograma > 0) {
                        return "CALL";
                    }
                }
                
                if (tendencia.tendencia === "FORTE_BAIXA") {
                    const confPreco = close < emaCurta && close < state.suporteKey;
                    if (confPreco && confVolume && macd.histograma < 0) {
                        return "PUT";
                    }
                }
            }

            // Breakouts com confirmação
            const variacao = state.resistenciaKey - state.suporteKey;
            const limiteBreakout = variacao * 0.04;
            const velaAtual = state.dadosHistoricos[state.dadosHistoricos.length - 1];
            const velaAnterior = state.dadosHistoricos[state.dadosHistoricos.length - 2];
            
            if (close > (state.resistenciaKey + limiteBreakout)) {
                if (confirmarBreakout(velaAtual, velaAnterior, volumeMedio)) {
                    return "CALL";
                }
            }
            
            if (close < (state.suporteKey - limiteBreakout)) {
                if (confirmarBreakout(velaAtual, velaAnterior, volumeMedio)) {
                    return "PUT";
                }
            }
            
            // Divergências validadas
            if (validarDivergencia(divergencias, close, emaMedia)) {
                if (divergencias.tipoDivergencia === "ALTA" && macd.histograma > 0) {
                    return "CALL";
                }
                
                if (divergencias.tipoDivergencia === "BAIXA" && macd.histograma < 0) {
                    return "PUT";
                }
            }
            
            // Condições extremas com volume
            if (rsi < CONFIG.LIMIARES.RSI_OVERSOLD && close > emaMedia && indicadores.volume > volumeMedio * 2) {
                return "CALL";
            }
            
            if (rsi > CONFIG.LIMIARES.RSI_OVERBOUGHT && close < emaMedia && indicadores.volume > volumeMedio * 2) {
                return "PUT";
            }
            
            return "ESPERAR";
        }

        // =============================================
        // CALCULADOR DE CONFIANÇA PARA CRIPTO
        // =============================================
        function calcularScore(sinal, indicadores, divergencias) {
            let score = 60;
            const volumeMedio = calcularMedia.simples(state.dadosHistoricos.slice(-20).map(d => d.volume), 20);
            const momentum = calcularMomentum(state.dadosHistoricos.map(d => d.close));

            const fatores = {
                tendencia: indicadores.tendencia.forca > 75 ? 30 : 0,
                volume: indicadores.volume > volumeMedio * 1.8 ? 20 : 0,
                superTrend: sinal === "CALL" && indicadores.close > indicadores.superTrend.valor ? 15 :
                            sinal === "PUT" && indicadores.close < indicadores.superTrend.valor ? 15 : 0,
                divergencia: validarDivergencia(divergencias, indicadores.close, indicadores.emaMedia) ? 15 : 0,
                momentum: Math.abs(momentum) > 0.5 ? 10 : 0
            };
            
            const penalidades = {
                volatilidade: indicadores.atr / indicadores.close < 0.003 ? -20 : 0,
                lateralidade: detectarLateralidade(state.dadosHistoricos.map(d => d.close)) ? -15 : 0
            };
            
            score += Object.values(fatores).reduce((sum, val) => sum + val, 0);
            score += Object.values(penalidades).reduce((sum, val) => sum + val, 0);
            
            return Math.min(99, Math.max(10, score));
        }

        // =============================================
        // FUNÇÕES UTILITÁRIAS
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
                document.getElementById("ultima-atualizacao").textContent = state.ultimaAtualizacao;
            }
        }

        function atualizarInterface(sinal, score, tendencia, forcaTendencia) {
            if (!state.marketOpen) return;
            
            const comandoElement = document.getElementById("comando");
            if (comandoElement) {
                comandoElement.textContent = sinal;
                comandoElement.className = `sinal-box ${sinal.toLowerCase()}`;
            }
            
            const scoreElement = document.getElementById("score");
            if (scoreElement) {
                scoreElement.textContent = `${score}%`;
                if (score >= CONFIG.LIMIARES.SCORE_ALTO) {
                    scoreElement.className = "positivo";
                } else if (score >= CONFIG.LIMIARES.SCORE_MEDIO) {
                    scoreElement.className = "medio";
                } else {
                    scoreElement.className = "baixo";
                }
            }
            
            const tendenciaElement = document.getElementById("tendencia");
            const forcaElement = document.getElementById("forca-tendencia");
            if (tendenciaElement && forcaElement) {
                tendenciaElement.textContent = tendencia;
                forcaElement.textContent = `${forcaTendencia}%`;
            }
        }

        // =============================================
        // INDICADORES TÉCNICOS (OTIMIZADOS PARA CRIPTO)
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
            if (closes.length < periodo + 1) return 50;
            
            if (!state.rsiCache.initialized) {
                let gains = 0, losses = 0;
                for (let i = 1; i <= periodo; i++) {
                    const diff = closes[i] - closes[i - 1];
                    if (diff > 0) gains += diff;
                    else losses -= diff;
                }
                
                state.rsiCache.avgGain = gains / periodo;
                state.rsiCache.avgLoss = losses / periodo;
                state.rsiCache.initialized = true;
                
                const rs = state.rsiCache.avgLoss === 0 ? Infinity : state.rsiCache.avgGain / state.rsiCache.avgLoss;
                return 100 - (100 / (1 + rs));
            }
            
            const diff = closes[closes.length - 1] - closes[closes.length - 2];
            
            if (diff > 0) {
                state.rsiCache.avgGain = ((state.rsiCache.avgGain * (periodo - 1)) + diff) / periodo;
                state.rsiCache.avgLoss = (state.rsiCache.avgLoss * (periodo - 1)) / periodo;
            } else {
                state.rsiCache.avgGain = (state.rsiCache.avgGain * (periodo - 1)) / periodo;
                state.rsiCache.avgLoss = ((state.rsiCache.avgLoss * (periodo - 1)) - diff) / periodo;
            }
            
            const rs = state.rsiCache.avgLoss === 0 ? Infinity : state.rsiCache.avgGain / state.rsiCache.avgLoss;
            return 100 - (100 / (1 + rs));
        }

        function calcularStochastic(highs, lows, closes, 
                                  periodoK = CONFIG.PERIODOS.STOCH_K, 
                                  periodoD = CONFIG.PERIODOS.STOCH_D) {
            try {
                if (closes.length < periodoK) return { k: 50, d: 50 };
                
                const kValues = [];
                for (let i = periodoK - 1; i < closes.length; i++) {
                    const startIndex = Math.max(0, i - periodoK + 1);
                    const sliceHigh = highs.slice(startIndex, i + 1);
                    const sliceLow = lows.slice(startIndex, i + 1);
                    
                    if (sliceHigh.length === 0 || sliceLow.length === 0) {
                        kValues.push(50);
                        continue;
                    }
                    
                    const highestHigh = Math.max(...sliceHigh);
                    const lowestLow = Math.min(...sliceLow);
                    const range = highestHigh - lowestLow;
                    const k = range !== 0 ? ((closes[i] - lowestLow) / range) * 100 : 50;
                    kValues.push(k);
                }
                
                const kSuavizado = [];
                for (let i = periodoD - 1; i < kValues.length; i++) {
                    const startIndex = Math.max(0, i - periodoD + 1);
                    const slice = kValues.slice(startIndex, i + 1);
                    const mediaK = calcularMedia.simples(slice, periodoD) || 50;
                    kSuavizado.push(mediaK);
                }
                
                const dValues = [];
                for (let i = periodoD - 1; i < kSuavizado.length; i++) {
                    const startIndex = Math.max(0, i - periodoD + 1);
                    const slice = kSuavizado.slice(startIndex, i + 1);
                    dValues.push(calcularMedia.simples(slice, periodoD) || 50);
                }
                
                return {
                    k: kSuavizado[kSuavizado.length - 1] || 50,
                    d: dValues[dValues.length - 1] || 50
                };
            } catch (e) {
                console.error("Erro no cálculo Stochastic:", e);
                return { k: 50, d: 50 };
            }
        }

        function calcularMACD(closes, rapida = CONFIG.PERIODOS.MACD_RAPIDA, 
                            lenta = CONFIG.PERIODOS.MACD_LENTA, 
                            sinal = CONFIG.PERIODOS.MACD_SINAL) {
            try {
                if (state.macdCache.emaRapida === null || state.macdCache.emaLenta === null) {
                    const emaRapida = calcularMedia.exponencial(closes, rapida);
                    const emaLenta = calcularMedia.exponencial(closes, lenta);
                    
                    const startIdx = Math.max(0, lenta - rapida);
                    const macdLinha = emaRapida.slice(startIdx).map((val, idx) => val - emaLenta[idx]);
                    const sinalLinha = calcularMedia.exponencial(macdLinha, sinal);
                    
                    const ultimoMACD = macdLinha[macdLinha.length - 1] || 0;
                    const ultimoSinal = sinalLinha[sinalLinha.length - 1] || 0;
                    
                    state.macdCache = {
                        emaRapida: emaRapida[emaRapida.length - 1],
                        emaLenta: emaLenta[emaLenta.length - 1],
                        macdLine: macdLinha,
                        signalLine: sinalLinha
                    };
                    
                    return {
                        histograma: ultimoMACD - ultimoSinal,
                        macdLinha: ultimoMACD,
                        sinalLinha: ultimoSinal
                    };
                }
                
                const kRapida = 2 / (rapida + 1);
                const kLenta = 2 / (lenta + 1);
                const kSinal = 2 / (sinal + 1);
                
                const novoValor = closes[closes.length - 1];
                
                state.macdCache.emaRapida = novoValor * kRapida + state.macdCache.emaRapida * (1 - kRapida);
                state.macdCache.emaLenta = novoValor * kLenta + state.macdCache.emaLenta * (1 - kLenta);
                
                const novaMacdLinha = state.macdCache.emaRapida - state.macdCache.emaLenta;
                state.macdCache.macdLine.push(novaMacdLinha);
                
                if (state.macdCache.signalLine.length === 0) {
                    state.macdCache.signalLine.push(novaMacdLinha);
                } else {
                    const ultimoSinal = state.macdCache.signalLine[state.macdCache.signalLine.length - 1];
                    const novoSignal = novaMacdLinha * kSinal + ultimoSinal * (1 - kSinal);
                    state.macdCache.signalLine.push(novoSignal);
                }
                
                const ultimoMACD = novaMacdLinha;
                const ultimoSinal = state.macdCache.signalLine[state.macdCache.signalLine.length - 1];
                
                return {
                    histograma: ultimoMACD - ultimoSinal,
                    macdLinha: ultimoMACD,
                    sinalLinha: ultimoSinal
                };
            } catch (e) {
                console.error("Erro no cálculo MACD:", e);
                return { histograma: 0, macdLinha: 0, sinalLinha: 0 };
            }
        }

        function calcularATR(dados, periodo = CONFIG.PERIODOS.ATR) {
            try {
                if (!Array.isArray(dados) || dados.length < periodo + 1) return 0;
                
                const trValues = [];
                for (let i = 1; i < dados.length; i++) {
                    const tr = Math.max(
                        dados[i].high - dados[i].low,
                        Math.abs(dados[i].high - dados[i-1].close),
                        Math.abs(dados[i].low - dados[i-1].close)
                    );
                    trValues.push(tr);
                }
                
                return calcularMedia.simples(trValues.slice(-periodo), periodo);
            } catch (e) {
                console.error("Erro no cálculo ATR:", e);
                return 0;
            }
        }

        function calcularSuperTrend(dados, periodo = CONFIG.PERIODOS.SUPERTREND, multiplicador = 3) {
            try {
                if (dados.length < periodo) return { direcao: 0, valor: 0 };
                
                if (state.atrGlobal === 0) {
                    state.atrGlobal = calcularATR(dados, periodo);
                }
                
                const current = dados[dados.length - 1];
                const hl2 = (current.high + current.low) / 2;
                const atr = state.atrGlobal;
                
                const upperBand = hl2 + (multiplicador * atr);
                const lowerBand = hl2 - (multiplicador * atr);
                
                let superTrend;
                let direcao;
                
                if (state.superTrendCache.length === 0) {
                    superTrend = upperBand;
                    direcao = 1;
                } else {
                    const prev = dados[dados.length - 2];
                    const prevSuperTrend = state.superTrendCache[state.superTrendCache.length - 1];
                    
                    if (prev.close > prevSuperTrend.valor) {
                        direcao = 1;
                        superTrend = Math.max(lowerBand, prevSuperTrend.valor);
                    } else {
                        direcao = -1;
                        superTrend = Math.min(upperBand, prevSuperTrend.valor);
                    }
                }
                
                state.superTrendCache.push({ direcao, valor: superTrend });
                return { direcao, valor: superTrend };
                
            } catch (e) {
                console.error("Erro no cálculo SuperTrend:", e);
                return { direcao: 0, valor: 0 };
            }
        }

        function detectarDivergencias(closes, rsis, highs, lows) {
            try {
                const lookback = CONFIG.PERIODOS.DIVERGENCIA_LOOKBACK;
                const extremeLookback = CONFIG.PERIODOS.EXTREME_LOOKBACK;
                
                if (closes.length < lookback || rsis.length < lookback) {
                    return { divergenciaRSI: false, tipoDivergencia: "NENHUMA" };
                }
                
                const findExtremes = (data, isHigh = true) => {
                    const extremes = [];
                    for (let i = extremeLookback; i < data.length - extremeLookback; i++) {
                        let isExtreme = true;
                        
                        for (let j = 1; j <= extremeLookback; j++) {
                            if (isHigh) {
                                if (data[i] <= data[i-j] || data[i] <= data[i+j]) {
                                    isExtreme = false;
                                    break;
                                }
                            } else {
                                if (data[i] >= data[i-j] || data[i] >= data[i+j]) {
                                    isExtreme = false;
                                    break;
                                }
                            }
                        }
                        
                        if (isExtreme) {
                            extremes.push({ index: i, value: data[i] });
                        }
                    }
                    return extremes;
                };
                
                const priceHighs = findExtremes(highs, true);
                const priceLows = findExtremes(lows, false);
                const rsiHighs = findExtremes(rsis, true);
                const rsiLows = findExtremes(rsis, false);
                
                let divergenciaRegularAlta = false;
                let divergenciaRegularBaixa = false;
                
                if (priceHighs.length >= 2 && rsiHighs.length >= 2) {
                    const lastPriceHigh = priceHighs[priceHighs.length - 1];
                    const prevPriceHigh = priceHighs[priceHighs.length - 2];
                    const lastRsiHigh = rsiHighs[rsiHighs.length - 1];
                    const prevRsiHigh = rsiHighs[rsiHighs.length - 2];
                    
                    if (lastPriceHigh.value > prevPriceHigh.value && 
                        lastRsiHigh.value < prevRsiHigh.value) {
                        divergenciaRegularBaixa = true;
                    }
                }
                
                if (priceLows.length >= 2 && rsiLows.length >= 2) {
                    const lastPriceLow = priceLows[priceLows.length - 1];
                    const prevPriceLow = priceLows[priceLows.length - 2];
                    const lastRsiLow = rsiLows[rsiLows.length - 1];
                    const prevRsiLow = rsiLows[rsiLows.length - 2];
                    
                    if (lastPriceLow.value < prevPriceLow.value && 
                        lastRsiLow.value > prevRsiLow.value) {
                        divergenciaRegularAlta = true;
                    }
                }
                
                return {
                    divergenciaRSI: divergenciaRegularAlta || divergenciaRegularBaixa,
                    tipoDivergencia: divergenciaRegularAlta ? "ALTA" : 
                                    divergenciaRegularBaixa ? "BAIXA" : "NENHUMA"
                };
            } catch (e) {
                console.error("Erro na detecção de divergências:", e);
                return { divergenciaRSI: false, tipoDivergencia: "NENHUMA" };
            }
        }

        // =============================================
        // CORE DO SISTEMA (ATUALIZADO PARA CRYPTO IDX)
        // =============================================
        async function analisarMercado() {
            if (state.leituraEmAndamento) return;
            state.leituraEmAndamento = true;
            
            try {
                const dados = await obterDadosTwelveData();
                state.dadosHistoricos = dados;
                
                if (dados.length < 20) {
                    throw new Error(`Dados insuficientes (${dados.length} velas)`);
                }
                
                const velaAtual = dados[dados.length - 1];
                state.velaAnterior = dados.length >= 2 ? dados[dados.length - 2] : null;
                const closes = dados.map(v => v.close);
                const highs = dados.map(v => v.high);
                const lows = dados.map(v => v.low);

                // Calcular EMAs
                const calcularEMA = (dados, periodo) => {
                    const emaArray = calcularMedia.exponencial(dados, periodo);
                    return emaArray[emaArray.length - 1];
                };

                const ema5 = calcularEMA(closes, CONFIG.PERIODOS.EMA_CURTA);
                const ema13 = calcularEMA(closes, CONFIG.PERIODOS.EMA_MEDIA);

                const superTrend = calcularSuperTrend(dados);
                const rsi = calcularRSI(closes);
                const stoch = calcularStochastic(highs, lows, closes);
                const macd = calcularMACD(closes);
                const atr = calcularATR(dados);
                
                // Preencher histórico de RSI
                state.rsiHistory = [];
                for (let i = CONFIG.PERIODOS.RSI; i < closes.length; i++) {
                    state.rsiHistory.push(calcularRSI(closes.slice(0, i+1)));
                }
                
                const divergencias = detectarDivergencias(closes, state.rsiHistory, highs, lows);
                const tendencia = avaliarTendenciaMultiTimeframe(dados);
                const lateral = detectarLateralidade(closes);

                state.tendenciaDetectada = tendencia.tendencia;
                state.forcaTendencia = Math.round(tendencia.forca);

                const indicadores = {
                    rsi,
                    stoch,
                    macd,
                    emaCurta: ema5,
                    emaMedia: ema13,
                    close: velaAtual.close,
                    superTrend,
                    tendencia,
                    atr,
                    volume: velaAtual.volume
                };

                let sinal = gerarSinal(indicadores, divergencias, lateral);
                
                // Aplicar cooldown
                if (sinal !== "ESPERAR" && state.cooldown <= 0) {
                    state.cooldown = 3;
                } else if (state.cooldown > 0) {
                    state.cooldown--;
                    sinal = "ESPERAR";
                }

                const score = Math.round(calcularScore(sinal, indicadores, divergencias));

                state.ultimoSinal = sinal;
                state.ultimoScore = score;
                state.ultimaAtualizacao = new Date().toLocaleTimeString("pt-BR");

                atualizarInterface(sinal, score, state.tendenciaDetectada, state.forcaTendencia);

                const criteriosElement = document.getElementById("criterios");
                if (criteriosElement) {
                    criteriosElement.innerHTML = `
                        <li>📊 Tendência: ${state.tendenciaDetectada} (${state.forcaTendencia}%)</li>
                        <li>💰 Preço: ${indicadores.close.toFixed(2)}</li>
                        <li>📉 RSI: ${rsi.toFixed(2)} ${rsi < CONFIG.LIMIARES.RSI_OVERSOLD ? '🔻' : rsi > CONFIG.LIMIARES.RSI_OVERBOUGHT ? '🔺' : ''}</li>
                        <li>📊 MACD: ${macd.histograma > 0 ? '+' : ''}${macd.histograma.toFixed(4)} ${macd.histograma > 0 ? '🟢' : '🔴'}</li>
                        <li>📈 Stochastic: ${stoch.k.toFixed(2)}/${stoch.d.toFixed(2)}</li>
                        <li>📌 Médias: EMA5 ${ema5.toFixed(2)} | EMA13 ${ema13.toFixed(2)}</li>
                        <li>📊 Suporte: ${state.suporteKey.toFixed(2)} | Resistência: ${state.resistenciaKey.toFixed(2)}</li>
                        <li>⚠️ Divergência: ${divergencias.tipoDivergencia}</li>
                        <li>🚦 SuperTrend: ${superTrend.direcao > 0 ? 'ALTA' : 'BAIXA'} (${superTrend.valor.toFixed(2)})</li>
                        <li>⚡ Volatilidade (ATR): ${atr.toFixed(4)}</li>
                        <li>📈 Volume: ${(indicadores.volume/1000).toFixed(1)}K (${(indicadores.volume > calcularMedia.simples(dados.slice(-20).map(d=>d.volume),20) * 1.5 ? '🔺' : '🔻'})</li>
                        <li>🔄 Lateral: ${lateral ? 'SIM' : 'NÃO'}</li>
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
                
                const criteriosElement = document.getElementById("criterios");
                if (criteriosElement) {
                    criteriosElement.innerHTML = `<li>ERRO: ${e.message}</li>`;
                }
                
                if (++state.tentativasErro > 3) setTimeout(() => location.reload(), 10000);
            } finally {
                state.leituraEmAndamento = false;
            }
        }

        // =============================================
        // FUNÇÕES DE DADOS (TWELVE DATA API)
        // =============================================
        async function obterDadosTwelveData() {
            try {
                const apiKey = API_KEYS[currentKeyIndex];
                const url = `${CONFIG.API_ENDPOINTS.TWELVE_DATA}/time_series?symbol=${CONFIG.PARES.CRYPTO_IDX}&interval=1min&outputsize=100&apikey=${apiKey}`;
                
                const response = await fetch(url);
                
                if (!response.ok) {
                    throw new Error(`Falha na API: ${response.status}`);
                }
                
                const data = await response.json();
                
                if (data.status === 'error') {
                    throw new Error(data.message || `Erro Twelve Data: ${data.code}`);
                }
                
                const valores = data.values ? data.values.reverse() : [];
                
                return valores.map(item => ({
                    time: item.datetime,
                    open: parseFloat(item.open),
                    high: parseFloat(item.high),
                    low: parseFloat(item.low),
                    close: parseFloat(item.close),
                    volume: parseFloat(item.volume) || 1
                }));
            } catch (e) {
                console.error("Erro ao obter dados:", e);
                
                errorCount++;
                if (errorCount >= 2) {
                    currentKeyIndex = (currentKeyIndex + 1) % API_KEYS.length;
                    errorCount = 0;
                }
                
                throw e;
            }
        }

        // =============================================
        // CONTROLE DE TEMPO
        // =============================================
        function sincronizarTimer() {
            clearInterval(state.intervaloAtual);
            const agora = new Date();
            const segundos = agora.getSeconds();
            state.timer = 60 - segundos;
            
            const elementoTimer = document.getElementById("timer");
            if (elementoTimer) {
                elementoTimer.textContent = formatarTimer(state.timer);
            }
            
            state.intervaloAtual = setInterval(() => {
                state.timer--;
                
                if (elementoTimer) {
                    elementoTimer.textContent = formatarTimer(state.timer);
                }
                
                if (state.timer <= 0) {
                    clearInterval(state.intervaloAtual);
                    analisarMercado();
                    sincronizarTimer();
                }
            }, 1000);
        }

        // =============================================
        // INICIALIZAÇÃO
        // =============================================
        function iniciarAplicativo() {
            // Iniciar processos
            setInterval(atualizarRelogio, 1000);
            sincronizarTimer();
            setTimeout(analisarMercado, 1000);
        }

        // Iniciar quando o documento estiver pronto
        if (document.readyState === "complete") iniciarAplicativo();
        else document.addEventListener("DOMContentLoaded", iniciarAplicativo);
    
