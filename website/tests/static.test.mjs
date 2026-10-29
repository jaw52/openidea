import assert from "node:assert/strict";
import { mkdtemp, mkdir, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { checkStatic } from "../scripts/check-static.mjs";

async function fixture(t, body, css = ".x{cursor:zoom-in}") {
  const root = await mkdtemp(join(tmpdir(), "openidea-pages-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  await mkdir(join(root, "assets"));
  await writeFile(join(root, "assets/site.css"), css);
  await writeFile(
    join(root, "index.html"),
    `<!doctype html><html><head><title>OpenIDEA</title><link rel="stylesheet" href="/openidea/assets/site.css"></head><body>${body}</body></html>`,
  );
  return root;
}

const content = `<h1>The IDE you know,<br>rebuilt in Rust.</h1><h2>Keep your way of working.</h2><h2>Startup and memory.</h2><p>169 MB. Warm caches, median of 5 runs. IDEA analyses Python more deeply.</p><h2>Try OpenIDEA.</h2>`;

test("rejects a client-only shell instead of publishing an empty homepage", async (t) => {
  const root = await fixture(t, '<div id="root"></div>');
  await assert.rejects(checkStatic(root, "/openidea/"), /prerendered homepage/i);
});

test("rejects public media that escaped the GitHub Pages prefix", async (t) => {
  const root = await fixture(t, `${content}<img src="/media/debug.jpg" alt="IDE">`);
  await assert.rejects(checkStatic(root, "/openidea/"), /base path/i);
});

test("rejects missing deployment assets", async (t) => {
  const root = await fixture(t, `${content}<img src="/openidea/media/debug.jpg" alt="IDE">`);
  await assert.rejects(checkStatic(root, "/openidea/"), /missing asset/i);
});

test("checks a complete static page without needing a server", async (t) => {
  const root = await fixture(t, content);
  assert.equal((await checkStatic(root, "/openidea/")).assets, 1);
});
