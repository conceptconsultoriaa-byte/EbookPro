// Cliente Supabase EXCLUSIVO do painel do produtor (admin).
// Requer que ../../config.js tenha sido carregado antes deste script.
if (!window.SUPABASE_URL || window.SUPABASE_URL.includes("SEU-PROJETO")) {
  console.warn("Configure config.js com a URL e a anon key do seu projeto Supabase.");
}
// storageKey diferente do usado pelo app do comprador (sb-ebookpro-auth) — de propósito:
// sem isso, se o produtor e um leitor usarem o mesmo e-mail (ex: você mesmo testando),
// a sessão de admin "vaza" pro app do comprador (e vice-versa) e pula a tela de login,
// entrando com a conta errada sem avisar ninguém.
const supabaseClient = window.supabase.createClient(window.SUPABASE_URL, window.SUPABASE_ANON_KEY, {
  auth: { storageKey: "sb-ebookpro-admin-auth" }
});
