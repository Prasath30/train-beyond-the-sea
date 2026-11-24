// Package the local railway as one file that also runs from a file:// URL.
import {readFile, writeFile, mkdir} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {join} from 'node:path';
const root = fileURLToPath(new URL('.',import.meta.url));
const read = name => readFile(join(root,name),'utf8');
let html = await read('index.html');
const css=await read('style.css');
const license=await read('src/vendor/LICENSE');
const scripts=[];
for(const tag of html.matchAll(/<script defer src="([^"]+)"><\/script>/g)){
  const source = await read(tag[1]);
  scripts.push('<script>\n'+source.replaceAll('</script','<\\/script')+'\n</script>');
}
html = html.replace(/<script defer src="[^"]+"><\/script>/g,'')
  .replace('<link rel="stylesheet" href="style.css">',()=>'<style>\n'+css+'\n</style>');
function insertScripts(){
  return '\n<!-- Three.js\n'+license+'\n-->\n'+scripts.join('\n')+'\n</body>';
}
html=html.replace('</body>',insertScripts);
await mkdir(join(root,'dist'),{recursive:true});
await writeFile(join(root,'dist','The Train Beyond the Sea.html'),html);
