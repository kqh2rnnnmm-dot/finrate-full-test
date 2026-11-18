import {build} from 'esbuild';
import {readFile,writeFile,copyFile,mkdir} from 'node:fs/promises';
import {createHash} from 'node:crypto';

await mkdir('site',{recursive:true});
await build({
  entryPoints:['src/app.mjs'],bundle:true,minify:true,legalComments:'eof',
  charset:'utf8',target:'safari16',outfile:'site/app.js'
});
const files=['index.html','styles.css','manifest.webmanifest','icon-192.png','icon-512.png','apple-touch-icon.png'];
for(const name of files)await copyFile('src/'+name,'site/'+name);
const assets=[...files,'app.js'];
const hash=createHash('sha256');
for(const name of assets)hash.update(await readFile('site/'+name));
const version=hash.digest('hex').slice(0,16);
await writeFile('site/sw.js',(await readFile('src/sw.js','utf8'))
  .replace('__BUILD__',version).replace('__ASSETS__',JSON.stringify(assets)));
await writeFile('site/.nojekyll','');
console.log('FinRate Full',version);
