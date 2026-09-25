const msgEl = document.getElementById("authMsg");

async function loadOrCreateProdutor(userId) {
  let { data: produtor } = await supabaseClient.from("eb_produtores").select("*").eq("owner_id", userId).maybeSingle();
  if (!produtor) {
    const { data: novo } = await supabaseClient.from("eb_produtores").insert({ owner_id: userId }).select().single();
    produtor = novo;
  }
  return produtor;
}

(async function redirectIfLogged() {
  const { data: { session } } = await supabaseClient.auth.getSession();
  if (session) window.location.href = "index.html";
})();

document.getElementById("loginForm").addEventListener("submit", async (e) => {
  e.preventDefault();
  msgEl.textContent = "Entrando...";
  const email = document.getElementById("loginEmail").value.trim();
  const senha = document.getElementById("loginSenha").value;
  const { error } = await supabaseClient.auth.signInWithPassword({ email, password: senha });
  if (error) { msgEl.textContent = "Erro ao entrar: " + error.message; return; }
  window.location.href = "index.html";
});

document.getElementById("signupForm").addEventListener("submit", async (e) => {
  e.preventDefault();
  msgEl.textContent = "Criando conta...";
  const email = document.getElementById("signupEmail").value.trim();
  const senha = document.getElementById("signupSenha").value;
  const { data, error } = await supabaseClient.auth.signUp({ email, password: senha });
  if (error) { msgEl.textContent = "Erro ao criar conta: " + error.message; return; }
  if (data.session) {
    await loadOrCreateProdutor(data.session.user.id);
    window.location.href = "index.html";
  } else {
    msgEl.textContent = "Conta criada! Verifique seu e-mail para confirmar antes de entrar.";
  }
});
