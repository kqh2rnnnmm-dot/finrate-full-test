import {build} from 'esbuild';
import {readFile, writeFile, mkdir, readdir, unlink} from 'node:fs/promises';
import {join} from 'node:path';
import {createHash} from 'node:crypto';

const outdir = process.env.FINRATE_BUILD_DIR || 'site';
const {version: release} = JSON.parse(await readFile('package.json','utf8'));
const digest = bytes => createHash('sha256').update(bytes).digest('hex');
const {outputFiles:[bundle]} = await build({
  entryPoints:['src/app.mjs'],bundle:true,minify:true,legalComments:'eof',
  charset:'utf8',target:'safari16',write:false
});
const worker = await readFile('src/sw.js','utf8');
const shell = await readFile('src/index.html','utf8');
const styles = await readFile('src/styles.css');
const fixed = ['manifest.webmanifest','icon-192.png','icon-512.png','apple-touch-icon.png'];
const files = new Map(await Promise.all(fixed.map(async name=>[name,await readFile('src/'+name)])));
const inputs = [release,worker,shell,styles,bundle.contents,...files.values()];
const id = digest(inputs.map(digest).join('')).slice(0,16);
const metadata = {release,id};
files.set(`app-${id}.js`,bundle.contents);
files.set(`styles-${id}.css`,styles);
files.set('index.html',shell.replaceAll('__BUILD_ID__',id).replaceAll('__RELEASE__',release));
const assets = Object.fromEntries([...files].map(([name,bytes])=>[name,digest(bytes)]));

await mkdir(outdir,{recursive:true});
for(const name of await readdir(outdir)){
  if(/^(app(?:-[a-f0-9]{16})?\.js|styles(?:-[a-f0-9]{16})?\.css)$/.test(name) && !files.has(name)){
    await unlink(join(outdir,name));
  }
}
for(const [name,bytes] of files)await writeFile(join(outdir,name),bytes);
await writeFile(join(outdir,'sw.js'),worker
  .replace('__BUILD_METADATA__',JSON.stringify(metadata))
  .replace('__ASSET_DIGESTS__',JSON.stringify(assets)));
await writeFile(join(outdir,'.nojekyll'),'');
console.log('FinRate Full',release,id);
