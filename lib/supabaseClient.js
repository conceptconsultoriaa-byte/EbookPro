// Cliente Supabase compartilhado por todas as páginas.
// Requer que config.js tenha sido carregado antes deste script.
if (!window.SUPABASE_URL || window.SUPABASE_URL.includes("SEU-PROJETO")) {
  console.warn("Configure config.js com a URL e a anon key do seu projeto Supabase.");
}
// storageKey próprio: como todos os apps da família ficam no MESMO domínio do GitHub
// Pages (github.io/EbookPro, github.io/LaudoPro, etc.) e usam o mesmo projeto Supabase,
// sem isso a sessão de um app pisa na sessão do outro no navegador (localStorage é por
// domínio, não por app), causando login/logout alternando sozinho.
const supabaseClient = window.supabase.createClient(window.SUPABASE_URL, window.SUPABASE_ANON_KEY, {
  auth: { storageKey: "sb-ebookpro-auth" }
});
