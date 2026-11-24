// Bundle the sample into a single offline HTML page. All source paths are local.
import {readFile,writeFile,mkdir} from 'node:fs/promises';
const here=new URL('./',import.meta.url);
const read=(path,encoding)=>readFile(new URL(path,here),encoding);
let html=await read('index.html','utf8');
const css=await read('seat.css','utf8'),js=await read('seat.js','utf8');
html=html.replace('<link rel="stylesheet" href="seat.css">',()=>'<style>'+css+'</style>');
html=html.replace('<script src="seat.js"></script>',()=>'<script>'+js+'</script>');
const routeJs=await read('konoha.js','utf8');
html=html.replace('<script src="konoha.js"></script>',()=>'<script>'+routeJs+'</script>');
const media=[['approach.webp','image/webp'],['platform.webp','image/webp'],['counter.webp','image/webp'],['carriage.webp','image/webp'],['countryside.webp','image/webp'],['rail.mp3','audio/mpeg']];
for(const [filename,type] of media){
  const path='assets/'+filename;
  html=html.replace('src="'+path+'"','src="data:'+type+';base64,'+(await read(path)).toString('base64')+'"');
}
const credits=await read('credits.md','utf8');
html=html.replace('</html>',()=>'<!--\n'+credits.replaceAll('--','—')+'\n-->\n</html>');
await mkdir(new URL('../dist/',here),{recursive:true});
await writeFile(new URL('../dist/Window Seat.html',here),html);
