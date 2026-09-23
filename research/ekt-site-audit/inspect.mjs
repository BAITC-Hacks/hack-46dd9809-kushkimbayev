import fs from 'node:fs';
import path from 'node:path';
const dir=path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/,'$1'));
const src=path.join(dir,'sources');
const decode=s=>s.replace(/&amp;/g,'&').replace(/&quot;/g,'"').replace(/&#39;/g,"'").replace(/&nbsp;|&#160;/g,' ').replace(/&lt;/g,'<').replace(/&gt;/g,'>');
const text=s=>decode(s.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi,'').replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi,'').replace(/<!--[\s\S]*?-->/g,'').replace(/<[^>]+>/g,' ').replace(/\s+/g,' ').trim());
const links=html=>[...html.matchAll(/<a\b([^>]*?)href\s*=\s*["']([^"']*)["']([^>]*)>([\s\S]*?)<\/a>/gi)].map(m=>({label:text(m[4])||decode((m[4].match(/alt=["']([^"']+)/)||[])[1]||''),url:(()=>{try{return new URL(decode(m[2]),'https://ekt.kz').href}catch{return m[2]}})()}));
const home=fs.readFileSync(path.join(src,'home.html'),'utf8');
const all=links(home);
const unique=[...new Map(all.map(a=>[a.url,a])).values()];
fs.writeFileSync(path.join(dir,'navigation-links.json'),JSON.stringify(unique,null,2));
const xml=fs.readFileSync(path.join(src,'sitemap.xml'),'utf8');
const sitemap=[...xml.matchAll(/<url>([\s\S]*?)<\/url>/g)].map(m=>({url:decode(m[1].match(/<loc>(.*?)<\/loc>/)?.[1]||''),lastmod:m[1].match(/<lastmod>(.*?)<\/lastmod>/)?.[1]||null}));
const counts={};for(const p of sitemap){const key=new URL(p.url).pathname.split('/')[1]||'home';counts[key]=(counts[key]||0)+1;}
fs.writeFileSync(path.join(dir,'sitemap-inventory.json'),JSON.stringify({checked_at:'2026-09-23',count:sitemap.length,counts,urls:sitemap},null,2));
const menu=home.slice(home.indexOf('id="category"'));
const cat=[...new Map(links(menu).filter(l=>l.url.startsWith('https://ekt.kz/catalog/')).map(l=>[l.url,l])).values()];
const catSet=new Set(cat.map(x=>x.url));
for(const c of cat){c.depth=new URL(c.url).pathname.split('/').filter(Boolean).length-1;let parts=c.url.replace(/\/$/,'').split('/');parts.pop();c.parent_url=catSet.has(parts.join('/')+'/')?parts.join('/')+'/':null;}
fs.writeFileSync(path.join(dir,'catalog-navigation.json'),JSON.stringify({checked_at:'2026-09-23',source:'https://ekt.kz/',scope:'Links in offcanvas catalog menu; not all products',count:cat.length,items:cat},null,2));
const excluded=/\/(catalog|news)\/.+|\/personal\/|\/compare\/|\/favorites\//;
const pages=unique.filter(l=>l.url.startsWith('https://ekt.kz/')&&!excluded.test(new URL(l.url).pathname)&&!new URL(l.url).search&&new URL(l.url).pathname!=='/'&&!l.url.match(/\.(png|jpg|jpeg|svg|pdf|zip)$/i));
pages.push(...cat.filter(c=>c.depth===1),{label:'EKT PRO',url:'https://pro.ekt.kz/'});
fs.writeFileSync(path.join(dir,'fetch-plan.json'),JSON.stringify([...new Map(pages.map(a=>[a.url,a])).values()].map((p,i)=>({...p,file:`page-${String(i+1).padStart(2,'0')}.html`})),null,2));
for(const f of fs.readdirSync(src).filter(f=>f.endsWith('.html'))){let html=fs.readFileSync(path.join(src,f),'utf8');let core=html.slice(html.search(/<h1\b/i));let end=core.search(/<footer\b|Подписаться на рассылку/i);if(end>=0)core=core.slice(0,end);fs.writeFileSync(path.join(src,f.replace('.html','.txt')),text(core));}
console.log(JSON.stringify({sitemap_count:sitemap.length,counts,menu_count:cat.length,top:cat.filter(c=>c.depth===1),fetch_count:pages.length},null,2));
