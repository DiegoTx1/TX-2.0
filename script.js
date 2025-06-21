
let win = 0, loss = 0, timer = 60;
let ultimos = [];

function atualizarHora() {
  const agora = new Date();
  document.getElementById("hora").textContent = agora.toLocaleTimeString("pt-BR");
}

function registrar(tipo) {
  if (tipo === 'WIN') win++;
  else loss++;
  document.getElementById("historico").textContent = `${win} WIN / ${loss} LOSS`;
}

async function leituraReal() {
  try {
    const r = await fetch("https://api.binance.com/api/v3/klines?symbol=BTCUSDT&interval=1m&limit=2");
    const dados = await r.json();
    const vela = dados[1];
    const open = parseFloat(vela[1]);
    const high = parseFloat(vela[2]);
    const low = parseFloat(vela[3]);
    const close = parseFloat(vela[4]);

    let score = 0;
    if (close > open) score++;
    if (close - open > 5) score++;
    if (high - low > 10) score++;
    if (close > (open + (high - low) / 2)) score++;
    if ((high - close) < 5 || (open - low) < 5) score++;

    let comando = "ESPERAR";
    if (score >= 4) comando = "CALL";
    else if (score <= 1) comando = "PUT";

    document.getElementById("comando").textContent = comando;
    document.getElementById("score").textContent = `${score * 20}%`;

    const criterios = [
      `RSI: ${score >= 1 ? "OK" : "Fraco"}`,
      `Engolfo: ${score >= 2 ? "Presente" : "Ausente"}`,
      `Tendência: ${close > open ? "Alta" : close < open ? "Baixa" : "Lateral"}`,
      `Bollinger: ${(high - low) > 15 ? "Expansão" : "Estável"}`,
      `Rejeição: ${(high - close) < 5 || (open - low) < 5 ? "Clara" : "Fraca"}`
    ];

    document.getElementById("criterios").innerHTML = criterios.map(c => `<li>${c}</li>`).join("");

    const horario = new Date().toLocaleTimeString("pt-BR");
    ultimos.unshift(`${horario} - ${comando} (${score * 20}%)`);
    if (ultimos.length > 5) ultimos.pop();
    document.getElementById("ultimos").innerHTML = ultimos.map(i => `<li>${i}</li>`).join("");

    if (comando === "CALL") document.getElementById("som-call").play();
    if (comando === "PUT") document.getElementById("som-put").play();

  } catch (e) {
    console.error("Erro na leitura:", e);
  }
}

setInterval(() => {
  timer--;
  document.getElementById("timer").textContent = timer;
  if (timer === 5) {
    leituraReal();
  }
  if (timer <= 0) {
    timer = 60;
  }
}, 1000);

setInterval(atualizarHora, 1000);
