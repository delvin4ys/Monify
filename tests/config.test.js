/**
 * Konfigurasi deployment. File JSON yang rusak atau pola rute yang salah baru
 * ketahuan saat build di Vercel — test ini menangkapnya lebih awal.
 */
const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.join(__dirname, "..");
const readJson = (name) => JSON.parse(fs.readFileSync(path.join(root, name), "utf8"));

test("vercel.json dan package.json adalah JSON yang valid", () => {
  assert.equal(readJson("vercel.json").version, 2);
  assert.ok(readJson("package.json").scripts.test);
});

test("rute Vercel: asset statis ke CDN, selebihnya ke server", () => {
  const { routes, builds } = readJson("vercel.json");
  // Vercel mencocokkan `src` terhadap seluruh path dan memakai rute pertama yang cocok.
  const resolve = (url) => {
    for (const r of routes) {
      const m = new RegExp("^" + r.src + "$").exec(url);
      if (m) return { dest: r.dest.replace(/\$(\d)/g, (_, i) => m[i]), cache: r.headers && r.headers["cache-control"] };
    }
    return null;
  };
  const v = "43a8a0ddb512";

  // Asset ber-hash: file statis dengan cache selamanya
  for (const file of ["css/app.css", "js/app/main.js", "js/app/pages/dashboard.js", "js/theme-init.js", "assets/fonts/geist-latin-wght-normal.woff2", "assets/logo/logo.png"]) {
    const r = resolve(`/assets/${v}/${file}`);
    assert.equal(r.dest, "/public/" + file, file);
    assert.match(r.cache, /immutable/);
    assert.ok(fs.existsSync(path.join(root, "public", file)), "file tidak ada: " + file);
  }
  // Asset tanpa hash (mis. favicon lama): statis dengan cache pendek
  assert.deepEqual(resolve("/assets/logo/logo.png"), { dest: "/public/assets/logo/logo.png", cache: "public, max-age=3600" });

  // Halaman, API, dan file HTML mentah selalu lewat server (yang memeriksa sesi)
  for (const url of ["/", "/login", "/dashboard", "/transactions", "/api/health", "/api/transactions", `/assets/${v}/app.html`, "/public/app.html", "/app.html"]) {
    assert.equal(resolve(url).dest, "server/index.js", url);
  }

  // Fungsi server membutuhkan isi public/ (halaman HTML dan hash asset)
  const node = builds.find((b) => b.use === "@vercel/node");
  assert.equal(node.src, "server/index.js");
  assert.ok(node.config.includeFiles.includes("public/**"));
  assert.ok(builds.some((b) => b.use === "@vercel/static" && b.src === "public/**"));
});

test("setiap asset yang dirujuk halaman HTML benar-benar ada", () => {
  for (const page of ["app.html", "auth.html"]) {
    const html = fs.readFileSync(path.join(root, "public", page), "utf8");
    const refs = [...html.matchAll(/\/assets\/\{\{V\}\}\/([^"'\s>]+)/g)].map((m) => m[1]);
    assert.ok(refs.length > 0, page);
    for (const ref of refs) assert.ok(fs.existsSync(path.join(root, "public", ref)), `${page} merujuk file yang tidak ada: ${ref}`);
  }
});
