import assert from 'node:assert/strict';
import {build} from 'esbuild';

export const scope='/finrate-full-test/';
const {outputFiles:[bundle]}=await build({entryPoints:['tests/fixture.mjs'],bundle:true,format:'esm',write:false});
export function serveFixture(path,res) {
  if(path===scope+'test-fixture.html'){
    res.writeHead(200,{'Content-Type':'text/html; charset=utf-8'}).end(
      '<!doctype html><meta charset="utf-8"><body><script type="module" src="./test-fixture.js"></script>');
    return true;
  }
  if(path===scope+'test-fixture.js'){
    res.writeHead(200,{'Content-Type':'application/javascript'}).end(bundle.contents);
    return true;
  }
  return false;
}
export async function fixture(page,url,mode='inspect'){
  await page.goto(url+'test-fixture.html?mode='+mode);
  await page.locator('body[data-ready]').waitFor();
  const body=page.locator('body');
  const content=await body.textContent();
  assert.equal(await body.getAttribute('data-ready'),'yes',content);
  return JSON.parse(content);
}
