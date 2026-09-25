/* ===========================================================
   EbookPro — login do leitor (link mágico, sem senha)
   =========================================================== */
document.getElementById("loginForm").addEventListener("submit", async (e) => {
  e.preventDefault();
  const email = document.getElementById("loginEmail").value.trim();
  const msg = document.getElementById("authMsg");
  const btn = document.getElementById("btnEnviarLink");
  if (!email) return;

  btn.disabled = true;
  msg.textContent = "Enviando link...";

  const redirectTo = window.location.href.replace(/login\.html.*$/, "index.html");
  const { error } = await supabaseClient.auth.signInWithOtp({
    email,
    options: { emailRedirectTo: redirectTo }
  });

  if (error) {
    msg.textContent = "Erro ao enviar o link: " + error.message;
    btn.disabled = false;
    return;
  }
  msg.textContent = `Pronto! Veja seu e-mail (${email}) e clique no link pra entrar na sua estante.`;
});

/* Se já tiver uma sessão válida (voltou pela segunda vez), manda direto pra estante. */
(async () => {
  const { data: { session } } = await supabaseClient.auth.getSession();
  if (session) window.location.href = "index.html";
})();
