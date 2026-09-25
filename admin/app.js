/* ===========================================================
   EbookPro Admin — painel do produtor
   =========================================================== */
const BACKEND_URL = "https://agendapro-backend-1n92.onrender.com";

let CURRENT_USER = null;
let PRODUTOR = null;
let EBOOKS = [];
let LEITORES = [];
let ACESSOS = [];
let editingEbookId = null;

async function boot() {
  const { data: { session } } = await supabaseClient.auth.getSession();
  if (!session) { window.location.href = "login.html"; return; }
  CURRENT_USER = session.user;

  const { data: produtor } = await supabaseClient.from("eb_produtores").select("*").eq("owner_id", CURRENT_USER.id).maybeSingle();
  if (!produtor) { window.location.href = "login.html"; return; }
  PRODUTOR = produtor;

  document.getElementById("webhookUrl").textContent = `${BACKEND_URL}/api/hotmart/webhook`;

  await carregarTudo();
}

async function carregarTudo() {
  const [{ data: ebooks }, { data: leitores }, { data: acessos }] = await Promise.all([
    supabaseClient.from("eb_produtos").select("*").eq("produtor_id", PRODUTOR.id).order("ordem"),
    supabaseClient.from("eb_leitores").select("*").eq("produtor_id", PRODUTOR.id).order("created_at", { ascending: false }),
    supabaseClient.from("eb_acessos").select("*, eb_leitores!inner(produtor_id)").eq("eb_leitores.produtor_id", PRODUTOR.id),
  ]);
  EBOOKS = ebooks || [];
  LEITORES = leitores || [];
  ACESSOS = acessos || [];

  renderPainel();
  renderEbooksList();
  renderLeitoresList();
}

function renderPainel() {
  document.getElementById("statEbooks").textContent = EBOOKS.length;
  document.getElementById("statLeitores").textContent = LEITORES.length;
  document.getElementById("statAcessos").textContent = ACESSOS.length;
  document.getElementById("statConcluidos").textContent = ACESSOS.filter(a => a.concluido).length;
}

/* ---------------- TABS ---------------- */
document.querySelectorAll(".tab-btn[data-tab]").forEach(btn => {
  btn.addEventListener("click", () => {
    document.querySelectorAll(".tab-btn[data-tab]").forEach(b => b.classList.remove("active"));
    document.querySelectorAll(".tab-panel").forEach(p => p.classList.remove("active"));
    btn.classList.add("active");
    document.getElementById("tab-" + btn.dataset.tab).classList.add("active");
  });
});

/* ---------------- EBOOKS ---------------- */
document.getElementById("ebookForm").addEventListener("submit", async (e) => {
  e.preventDefault();
  const payload = {
    nome: document.getElementById("ebNome").value.trim(),
    ordem: Number(document.getElementById("ebOrdem").value) || 0,
    capa_url: document.getElementById("ebCapa").value.trim() || null,
    arquivo_url: document.getElementById("ebArquivo").value.trim() || null,
    link_compra: document.getElementById("ebLinkCompra").value.trim() || null,
    hotmart_product_id: document.getElementById("ebHotmartId").value.trim() || null,
    preco_exclusivo: document.getElementById("ebPrecoExclusivo").value ? Number(document.getElementById("ebPrecoExclusivo").value) : null,
    bonus_descricao: document.getElementById("ebBonusDescricao").value.trim() || null,
    bonus_url: document.getElementById("ebBonusUrl").value.trim() || null,
    descricao: document.getElementById("ebDescricao").value.trim() || null,
  };
  if (!payload.nome) return;

  let error;
  if (editingEbookId) {
    ({ error } = await supabaseClient.from("eb_produtos").update(payload).eq("id", editingEbookId));
  } else {
    ({ error } = await supabaseClient.from("eb_produtos").insert({ produtor_id: PRODUTOR.id, ...payload }));
  }
  if (error) { alert("Erro ao salvar ebook: " + error.message); return; }
  cancelarEdicaoEbook();
  await carregarTudo();
});

function editarEbook(eb) {
  editingEbookId = eb.id;
  document.getElementById("ebNome").value = eb.nome || "";
  document.getElementById("ebOrdem").value = eb.ordem || 1;
  document.getElementById("ebCapa").value = eb.capa_url || "";
  document.getElementById("ebArquivo").value = eb.arquivo_url || "";
  document.getElementById("ebLinkCompra").value = eb.link_compra || "";
  document.getElementById("ebHotmartId").value = eb.hotmart_product_id || "";
  document.getElementById("ebPrecoExclusivo").value = eb.preco_exclusivo || "";
  document.getElementById("ebBonusDescricao").value = eb.bonus_descricao || "";
  document.getElementById("ebBonusUrl").value = eb.bonus_url || "";
  document.getElementById("ebDescricao").value = eb.descricao || "";
  const titulo = document.getElementById("ebookFormTitle");
  titulo.textContent = "Editando: " + eb.nome;
  titulo.style.display = "block";
  document.getElementById("ebookFormSubmitBtn").textContent = "Salvar alterações";
  document.getElementById("ebookFormCancelBtn").style.display = "inline-block";
  document.getElementById("ebookForm").scrollIntoView({ behavior: "smooth", block: "start" });
}
function cancelarEdicaoEbook() {
  editingEbookId = null;
  document.getElementById("ebookForm").reset();
  document.getElementById("ebOrdem").value = 1;
  document.getElementById("ebookFormTitle").style.display = "none";
  document.getElementById("ebookFormSubmitBtn").textContent = "Cadastrar ebook";
  document.getElementById("ebookFormCancelBtn").style.display = "none";
}
document.getElementById("ebookFormCancelBtn").addEventListener("click", cancelarEdicaoEbook);

function renderEbooksList() {
  const el = document.getElementById("ebooksList");
  el.innerHTML = "";
  if (EBOOKS.length === 0) { el.innerHTML = "<p class='hint'>Nenhum ebook cadastrado ainda.</p>"; return; }
  EBOOKS.forEach(eb => {
    const qtdLeitores = ACESSOS.filter(a => a.produto_id === eb.id).length;
    const div = document.createElement("div");
    div.className = "list-item";
    div.innerHTML = `
      <span>${eb.capa_url ? `<img src="../${eb.capa_url}" style="height:44px;width:34px;object-fit:cover;border-radius:4px;vertical-align:middle;margin-right:10px;">` : ""}
      <strong>${eb.nome}</strong> — ${qtdLeitores} leitor(es) ${eb.hotmart_product_id ? "" : `<span class="status-badge status-pendente">sem ID da Hotmart</span>`}</span>
      <span style="display:flex; gap:8px;">
        <button class="btn-secondary btn-editar">Editar</button>
        <button class="btn-danger btn-excluir">Excluir</button>
      </span>`;
    div.querySelector(".btn-editar").addEventListener("click", () => editarEbook(eb));
    div.querySelector(".btn-excluir").addEventListener("click", async () => {
      if (!confirm(`Excluir "${eb.nome}"? Os leitores perdem o acesso a ele.`)) return;
      await supabaseClient.from("eb_produtos").delete().eq("id", eb.id);
      await carregarTudo();
    });
    el.appendChild(div);
  });
}

/* ---------------- LEITORES ---------------- */
function renderLeitoresList() {
  const el = document.getElementById("leitoresList");
  const filtro = (document.getElementById("filtroLeitor").value || "").toLowerCase();
  const lista = LEITORES.filter(l => !filtro || (l.nome || "").toLowerCase().includes(filtro) || l.email.toLowerCase().includes(filtro));
  el.innerHTML = "";
  if (lista.length === 0) { el.innerHTML = "<p class='hint'>Nenhum leitor encontrado.</p>"; return; }
  lista.forEach(l => {
    const meusAcessos = ACESSOS.filter(a => a.leitor_id === l.id);
    const div = document.createElement("div");
    div.className = "list-item";
    div.style.display = "block";
    div.innerHTML = `<div style="display:flex; justify-content:space-between; flex-wrap:wrap; gap:8px;">
        <span><strong>${l.nome || "(sem nome)"}</strong> — ${l.email}${l.telefone ? " · " + l.telefone : ""}</span>
        <span class="status-badge status-pago">${meusAcessos.length} ebook(s)</span>
      </div>`;
    el.appendChild(div);
  });
}
document.getElementById("filtroLeitor").addEventListener("input", renderLeitoresList);

/* ---------------- IMPORTAR BASE ANTIGA ---------------- */
document.getElementById("btnImportar").addEventListener("click", async () => {
  const texto = document.getElementById("importarTexto").value.trim();
  const resultadoEl = document.getElementById("importarResultado");
  if (!texto) return;
  const linhas = texto.split("\n").map(l => l.trim()).filter(Boolean);
  let ok = 0, semEbook = 0, comErro = 0;

  for (const linha of linhas) {
    const partes = linha.split(",").map(p => p.trim());
    const [email, nome, telefone, nomeEbook] = partes;
    if (!email) { comErro++; continue; }

    const ebook = EBOOKS.find(e => (e.nome || "").toLowerCase() === (nomeEbook || "").toLowerCase());
    if (!ebook) { semEbook++; continue; }

    let { data: leitor } = await supabaseClient.from("eb_leitores").select("*").eq("produtor_id", PRODUTOR.id).eq("email", email.toLowerCase()).maybeSingle();
    if (!leitor) {
      const { data: novo, error } = await supabaseClient.from("eb_leitores").insert({
        produtor_id: PRODUTOR.id, email: email.toLowerCase(), nome: nome || null, telefone: telefone || null, origem: "importado"
      }).select().single();
      if (error) { comErro++; continue; }
      leitor = novo;
    }

    const { error: errAcesso } = await supabaseClient.from("eb_acessos").upsert({
      leitor_id: leitor.id, produto_id: ebook.id, origem: "importado"
    }, { onConflict: "leitor_id,produto_id" });
    if (errAcesso) { comErro++; continue; }
    ok++;
  }

  resultadoEl.textContent = `Importação concluída: ${ok} liberado(s), ${semEbook} com nome de ebook não encontrado, ${comErro} com erro.`;
  document.getElementById("importarTexto").value = "";
  await carregarTudo();
});

/* ---------------- WEBHOOK ---------------- */
document.getElementById("btnCopiarWebhook").addEventListener("click", () => {
  navigator.clipboard.writeText(document.getElementById("webhookUrl").textContent);
  alert("Link copiado!");
});

document.getElementById("logoutBtn").addEventListener("click", async () => {
  await supabaseClient.auth.signOut();
  window.location.href = "login.html";
});

boot();
