import {createServer} from 'node:http';
import {readFile} from 'node:fs/promises';
import {spawn} from 'node:child_process';
const scope='/finrate-full-test/';

const mime={html:'text/html; charset=utf-8',js:'application/javascript',css:'text/css',png:'image/png',webmanifest:'application/manifest+json'};
const server=createServer(async(req,res)=>{
  if(!req.url.startsWith(scope))return res.writeHead(404).end();
  const name=req.url.slice(scope.length)||'index.html';
  if(!/^[a-z0-9-]+\.(html|js|css|png|webmanifest)$/.test(name))return res.writeHead(404).end();
  try {
    const data=await readFile('site/'+name);
    res.writeHead(200,{'Content-Type':mime[name.split('.').at(-1)],'Cache-Control':'no-store'}).end(data);
  } catch {res.writeHead(404).end();}
});
await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(0,'127.0.0.1',resolve);});
const url='http://127.0.0.1:'+server.address().port+scope;
try {
  for(const suite of ['first-use','first-use-extended','first-use-motion']){
    const child=spawn(process.execPath,['tests/'+suite+'.mjs',url],{stdio:'inherit'});
    await new Promise((resolve,reject)=>{
      child.once('error',reject);
      child.once('exit',code=>code===0?resolve():reject(new Error(suite+' exit '+code)));
    });
  }
} finally {server.close();}
