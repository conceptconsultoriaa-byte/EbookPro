/* ===========================================================
   EbookPro — estante do leitor
   =========================================================== */
const BACKEND_URL = "https://agendapro-backend-1n92.onrender.com";
let LEITOR = null;
let ACESSOS = [];   // [{ ...eb_acessos, eb_produtos: {...} }]
let VITRINE = [];   // eb_vitrine (catálogo público, sem arquivo_url)
let ACESSO_ATUAL = null;

async function boot() {
  const { data: { session } } = await supabaseClient.auth.getSession();
  if (!session) { window.location.href = "login.html"; return; }

  // Liga essa conta (auth.uid()) ao cadastro de leitor pré-criado pelo webhook da Hotmart.
  await supabaseClient.rpc("eb_vincular_por_email");

  const { data: leitor } = await supabaseClient.from("eb_leitores").select("*").maybeSingle();
  if (!leitor) {
    document.querySelector(".content").innerHTML = `
      <h1>Ainda não encontramos sua compra</h1>
      <p class="hint">Não achamos nenhum ebook vinculado a este e-mail. Se você acabou de comprar, aguarde alguns minutos — às vezes a liberação demora um pouco. Se o problema continuar, fale com o suporte.</p>`;
    return;
  }
  LEITOR = leitor;

  await carregarTudo();
}

async function carregarTudo() {
  // Repara: arquivo_url NUNCA é pedido aqui de propósito — o link real do ebook não
  // deve chegar no navegador. A leitura passa pelo backend (ver abrirLeitor), que
  // confere a compra antes de liberar, pra dificultar vazar o link e qualquer um
  // acessar sem ter pago.
  const { data: acessos } = await supabaseClient
    .from("eb_acessos")
    .select("*, eb_produtos(id, nome, capa_url, bonus_url, bonus_descricao, ordem)")
    .eq("leitor_id", LEITOR.id);
  ACESSOS = acessos || [];

  const { data: vitrine } = await supabaseClient.from("eb_vitrine").select("*").order("ordem");
  VITRINE = vitrine || [];

  renderColecao();
  renderMeusLivros();
  renderOutrosLivros();
}

function renderColecao() {
  const total = VITRINE.length;
  const concluidos = ACESSOS.filter(a => a.concluido).length;
  document.getElementById("colecaoNum").textContent = `${concluidos}/${total}`;
  document.getElementById("colecaoTexto").textContent =
    concluidos === 0 ? "Você ainda não concluiu nenhum ebook — comece agora!" :
    concluidos === total ? "Parabéns! Você concluiu a coleção completa! 🎉" :
    `Sua coleção: ${concluidos} de ${total} completos.`;
}

function renderMeusLivros() {
  const el = document.getElementById("meusLivros");
  if (ACESSOS.length === 0) { el.innerHTML = "<p class='hint'>Nenhum ebook liberado ainda.</p>"; return; }
  el.innerHTML = "";
  ACESSOS.forEach(a => {
    const p = a.eb_produtos;
    if (!p) return;
    const div = document.createElement("div");
    div.className = "livro";
    div.innerHTML = `
      <div class="livro-capa">
        <img src="${p.capa_url || ''}" alt="${p.nome}">
        ${a.concluido ? `<span class="livro-selo">Concluído</span>` : ""}
      </div>
      <div class="livro-body">
        <span class="livro-nome">${p.nome}</span>
        <div class="livro-progresso"><div class="livro-progresso-fill" style="width:${a.progresso_percentual || 0}%"></div></div>
        <button class="btn-primary" style="margin-top:4px;">${a.progresso_percentual > 0 ? "Continuar lendo" : "Começar a ler"}</button>
      </div>`;
    div.querySelector("button").addEventListener("click", () => abrirLeitor(a, p));
    el.appendChild(div);
  });
}

function renderOutrosLivros() {
  const el = document.getElementById("outrosLivros");
  const idsQueTenho = new Set(ACESSOS.map(a => a.produto_id));
  const faltam = VITRINE.filter(p => !idsQueTenho.has(p.id));
  if (faltam.length === 0) { el.innerHTML = "<p class='hint'>Você já tem todos os ebooks disponíveis!</p>"; return; }
  el.innerHTML = "";
  faltam.forEach(p => {
    const div = document.createElement("div");
    div.className = "livro";
    div.innerHTML = `
      <div class="livro-capa bloqueado">
        <img src="${p.capa_url || ''}" alt="${p.nome}">
        <div class="livro-cadeado">🔒</div>
      </div>
      <div class="livro-body">
        <span class="livro-nome">${p.nome}</span>
        ${p.preco_exclusivo ? `<span class="livro-preco">R$ ${Number(p.preco_exclusivo).toFixed(2).replace(".", ",")}</span>` : ""}
        <a class="btn-secondary" style="text-align:center;" href="${p.link_compra || '#'}" target="_blank" rel="noopener">Comprar agora</a>
      </div>`;
    el.appendChild(div);
  });
}

async function abrirLeitor(acesso, produto) {
  ACESSO_ATUAL = acesso;
  document.getElementById("leitorTitulo").textContent = produto.nome;

  // O iframe aponta pro NOSSO backend, não pro link real do arquivo — o backend confere
  // a compra (via token de sessão) antes de redirecionar pro conteúdo de verdade.
  const { data: { session } } = await supabaseClient.auth.getSession();
  document.getElementById("leitorIframe").src =
    `${BACKEND_URL}/api/ebookpro/conteudo?produto_id=${produto.id}&token=${encodeURIComponent(session.access_token)}`;

  const bonusBox = document.getElementById("bonusBox");
  if (acesso.concluido && produto.bonus_url) {
    bonusBox.style.display = "block";
    bonusBox.innerHTML = `🎁 <strong>Bônus liberado:</strong> ${produto.bonus_descricao || "conteúdo extra"} — <a href="${produto.bonus_url}" target="_blank" rel="noopener" style="color:var(--lime); font-weight:700;">acessar</a>`;
  } else {
    bonusBox.style.display = "none";
  }
  document.getElementById("leitorModal").classList.add("aberto");

  if (Number(acesso.progresso_percentual) === 0) {
    await supabaseClient.from("eb_acessos")
      .update({ progresso_percentual: 50, ultimo_acesso: new Date().toISOString() })
      .eq("id", acesso.id);
    acesso.progresso_percentual = 50;
    renderMeusLivros();
  } else {
    await supabaseClient.from("eb_acessos").update({ ultimo_acesso: new Date().toISOString() }).eq("id", acesso.id);
  }
}

document.getElementById("btnFecharLeitor").addEventListener("click", () => {
  document.getElementById("leitorModal").classList.remove("aberto");
  document.getElementById("leitorIframe").src = "";
});

document.getElementById("btnMarcarConcluido").addEventListener("click", async () => {
  if (!ACESSO_ATUAL) return;
  await supabaseClient.from("eb_acessos").update({
    concluido: true, concluido_em: new Date().toISOString(), progresso_percentual: 100
  }).eq("id", ACESSO_ATUAL.id);
  document.getElementById("leitorModal").classList.remove("aberto");
  document.getElementById("leitorIframe").src = "";
  await carregarTudo();
});

document.getElementById("logoutBtn").addEventListener("click", async () => {
  await supabaseClient.auth.signOut();
  window.location.href = "login.html";
});

boot();
