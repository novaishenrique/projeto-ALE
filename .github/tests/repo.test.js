// Testes automáticos do repositório: README, os dois sites e a documentação.
// Rodam no GitHub Actions a cada push. Localmente: node --test .github/tests/
const test = require("node:test");
const assert = require("node:assert");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const raiz = path.resolve(__dirname, "..", "..");
const ler = (arquivo) => fs.readFileSync(path.join(raiz, arquivo), "utf8");
const existe = (arquivo) => fs.existsSync(path.join(raiz, arquivo));

// Mesmo algoritmo que o GitHub usa para criar a âncora de um título
const ancora = (titulo) =>
  titulo.trim().toLowerCase().replace(/[^\p{L}\p{M}\p{N}\p{Pc} -]/gu, "").replace(/ /g, "-");

// Scripts escritos dentro do HTML (sem src)
const scriptsInternos = (html) =>
  [...html.matchAll(/<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/g)].map((m) => m[1]);

test("README: links, imagens e âncoras apontam para o que existe", () => {
  const readme = ler("README.md").replace(/```[\s\S]*?```/g, "");
  const ancoras = new Set([...readme.matchAll(/^#{1,6} (.+)$/gm)].map((m) => ancora(m[1])));
  const links = [
    ...[...readme.matchAll(/\]\(([^)\s]+)\)/g)].map((m) => m[1]),
    ...[...readme.matchAll(/<img [^>]*src="([^"]+)"/g)].map((m) => m[1]),
  ].filter((link) => !/^(https?:|mailto:)/.test(link));
  for (const link of links) {
    const [alvo, fragmento] = decodeURI(link).split("#");
    if (alvo) assert.ok(existe(alvo), "link quebrado: " + link);
    else assert.ok(ancoras.has(fragmento), "âncora inexistente: #" + fragmento);
  }
});

test("a documentação e a capa estão no repositório", () => {
  for (const arquivo of ["docs/Documentacao_ALE_Scrum.pdf", ".github/capa.jpg"]) {
    assert.ok(existe(arquivo), "faltando: " + arquivo);
  }
  assert.strictEqual(fs.readFileSync(path.join(raiz, "docs/Documentacao_ALE_Scrum.pdf")).subarray(0, 5).toString(), "%PDF-");
});

test("ALE Aprender: página em português, com CSS, JavaScript e título", () => {
  const html = ler("sites/ale-aprender/index.html");
  assert.match(html, /<html lang="pt-BR"/);
  assert.match(html, /<title>[^<]*ALE Aprender[^<]*<\/title>/);
  assert.match(html, /href="style\.css"/);
  assert.match(html, /src="script\.js"/);
  assert.ok(existe("sites/ale-aprender/style.css") && existe("sites/ale-aprender/script.js"));
});

test("ALE Aprender: o script.js não tem erro de sintaxe", () => {
  assert.doesNotThrow(() => new vm.Script(ler("sites/ale-aprender/script.js"), { filename: "script.js" }));
});

test("ALE Aprender: todo botão chama uma função que existe no script.js", () => {
  const html = ler("sites/ale-aprender/index.html");
  const js = ler("sites/ale-aprender/script.js");
  const chamadas = [...html.matchAll(/on(?:click|submit|change)="\s*([A-Za-z_]\w*)\(/g)].map((m) => m[1]);
  const nativas = new Set(["alert", "event"]);
  const faltando = [...new Set(chamadas)].filter(
    (nome) => !nativas.has(nome) && !new RegExp(`function\\s+${nome}\\s*\\(`).test(js)
  );
  assert.deepStrictEqual(faltando, []);
});

test("ALE Aprender: recursos de acessibilidade presentes", () => {
  const html = ler("sites/ale-aprender/index.html");
  for (const funcao of ["toggleTheme", "toggleHighContrast", "changeFontSize", "toggleTextToSpeech"]) {
    assert.match(html, new RegExp(funcao), "faltou " + funcao);
  }
  assert.match(html, /vlibras-plugin\.js/);
});

test("ALE: página em português, scripts sem erro de sintaxe e VLibras", () => {
  const html = ler("sites/ale/index.html");
  assert.match(html, /<html lang="pt-BR"/);
  assert.match(html, /<title>[^<]+<\/title>/);
  const scripts = scriptsInternos(html);
  assert.ok(scripts.length >= 1, "nenhum script encontrado");
  scripts.forEach((codigo, i) =>
    assert.doesNotThrow(() => new vm.Script(codigo, { filename: `script-${i + 1}` }), `script ${i + 1} com erro`)
  );
  assert.match(html, /vlibras-plugin\.js/);
});

test("ALE: manifesto, ícones e service worker funcionam juntos", () => {
  const manifesto = JSON.parse(ler("sites/ale/manifest.webmanifest"));
  assert.strictEqual(manifesto.lang, "pt-BR");
  for (const icone of manifesto.icons) assert.ok(existe("sites/ale/" + icone.src), "ícone faltando: " + icone.src);
  const sw = ler("sites/ale/sw.js");
  assert.doesNotThrow(() => new vm.Script(sw, { filename: "sw.js" }));
  const lista = sw.match(/ARQUIVOS\s*=\s*\[([^\]]*)\]/);
  assert.ok(lista, "lista de arquivos do cache não encontrada");
  for (const [, arquivo] of lista[1].matchAll(/'\.\/([^']*)'/g)) {
    if (arquivo) assert.ok(existe("sites/ale/" + arquivo), "o service worker guarda um arquivo que não existe: " + arquivo);
  }
});
