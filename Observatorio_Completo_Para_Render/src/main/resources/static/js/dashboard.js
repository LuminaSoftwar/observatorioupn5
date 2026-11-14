(() => {
'use strict';
const $=id=>document.getElementById(id);
const meses=['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic'];
const tipos=['Robos','Hurtos','Extorsión','Homicidios','Otros delitos'];
const fmt=n=>Math.round(n).toLocaleString('es-PE');
const config=window.OBS_SUPABASE||{};
const charts={};let filas=[],vista='mensual',catalogo=[];
const normalizar=s=>String(s||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').trim().toUpperCase();
const CATALOGO_BASE='https://cdn.jsdelivr.net/gh/RitchieRD/ubigeos-peru-data@main/json/';
async function cargarCatalogo(){
 const [deps,provs,dists]=await Promise.all(['1_ubigeo_departamentos.json','2_ubigeo_provincias.json','3_ubigeo_distritos.json'].map(async f=>{const r=await fetch(CATALOGO_BASE+f);if(!r.ok)throw new Error('No se pudo cargar '+f);const j=await r.json();return Array.isArray(j)?j:Object.values(j); }));
 const depMap=new Map(deps.map(d=>[String(d.id),String(d.departamento).trim()]));
 const provMap=new Map(provs.map(p=>[String(p.id),{departamento:depMap.get(String(p.departamento_id)),provincia:String(p.provincia).trim()}]));
 const listado=dists.map(d=>{const p=provMap.get(String(d.provincia_id));return p?{departamento:p.departamento,provincia:p.provincia,distrito:String(d.distrito).trim()}:null;}).filter(x=>x&&x.departamento);
 if(listado.length<1000)throw new Error('Catálogo territorial incompleto');return listado;
}

function aviso(s){const el=$('estado-catalogo-dashboard');if(el)el.textContent=s;}
function unique(a){return [...new Set(a)].sort((x,y)=>x.localeCompare(y,'es'));}
function poblar(sel,items,placeholder,preferred='Todos'){
 sel.replaceChildren(new Option(placeholder,'Todos'));
 for(const v of items)sel.add(new Option(v,v));
 sel.value=items.includes(preferred)?preferred:'Todos';
}
function options(){return {responsive:true,maintainAspectRatio:false,plugins:{legend:{position:'bottom'}},scales:{y:{beginAtZero:true}}};}
function graf(id,type,labels,values,label){if(!window.Chart)return;if(charts[id])charts[id].destroy();charts[id]=new Chart($(id),{type,data:{labels,datasets:[{label,data:values,backgroundColor:type==='doughnut'?['#164b78','#47866b','#d18b24','#a94f4f','#8064a2']:'rgba(22,75,120,.65)',borderColor:'#164b78',tension:.25,fill:type==='line'}]},options:type==='doughnut'?{responsive:true,maintainAspectRatio:false,plugins:{legend:{position:'bottom'}}}:options()});}
// MODELO SINTETICO REPRODUCIBLE. NO representa la estacionalidad observada.
// El reparto es variable por territorio, tipo y año. La suma de los 12 meses es exactamente el total anual.
function hash(s){let h=2166136261;for(let i=0;i<s.length;i++){h=Math.imul(h^s.charCodeAt(i),16777619);}return h>>>0;}
const pesosBase=[0.91,0.95,1.06,0.99,1.11,0.92,1.04,1.14,0.96,1.08,0.88,0.96];
function estimate(total,seed='general'){
 total=Math.max(0,Math.trunc(Number(total)||0));if(!total)return Array(12).fill(0);
 const pesos=pesosBase.map((p,i)=>{
  const h=hash(`${seed}|${i}`);return p*(0.78+(h%4500)/10000);
 });
 const sum=pesos.reduce((a,b)=>a+b,0);
 const raw=pesos.map(w=>total*w/sum),out=raw.map(Math.floor);
 let resto=total-out.reduce((a,b)=>a+b,0);
 const orden=raw.map((v,i)=>({i,frac:v-out[i]})).sort((a,b)=>b.frac-a.frac||a.i-b.i);
 for(let j=0;j<resto;j++)out[orden[j].i]++;
 return out;
}
function seed(r){return [r.anio,r.departamento,r.provincia,r.distrito,r.ubigeo||'',r.tipo_delito].join('|');}
function mensual(r,mes){return estimate(r.cantidad,seed(r))[mes];}
function filtroGeo(r){const dep=$('filtro-departamento').value,prov=$('filtro-provincia').value,dist=$('filtro-distrito-visible').value;return (dep==='Todos'||normalizar(r.departamento)===normalizar(dep))&&(prov==='Todos'||normalizar(r.provincia)===normalizar(prov))&&(dist==='Todos'||normalizar(r.distrito)===normalizar(dist));}
function suma(year,tipo='Todos',mes=null){let total=0;for(const r of filas)if(r.anio===year&&(tipo==='Todos'||r.tipo_delito===tipo)&&filtroGeo(r))total+=mes===null?r.cantidad:mensual(r,mes);return total;}
function actualizaGeo(nivel){
 const depEl=$('filtro-departamento'),provEl=$('filtro-provincia'),distEl=$('filtro-distrito-visible');
 const dep=depEl.value,prov=provEl.value,dist=distEl.value;
 const base=catalogo.length?catalogo:filas;
 if(nivel===0)poblar(depEl,unique(base.map(r=>r.departamento)),'Todos los departamentos',dep);
 const d=depEl.value;
 if(nivel<=1)poblar(provEl,unique(base.filter(r=>d==='Todos'||normalizar(r.departamento)===normalizar(d)).map(r=>r.provincia)),'Todas las provincias',nivel===0?prov:'Todos');
 const p=provEl.value;
 poblar(distEl,unique(base.filter(r=>(d==='Todos'||normalizar(r.departamento)===normalizar(d))&&(p==='Todos'||normalizar(r.provincia)===normalizar(p))).map(r=>r.distrito)),'Todos los distritos',nivel<=1?'Todos':dist);
 provEl.disabled=false;distEl.disabled=false;actualizar();
}

function actualizar(){
 if(!filas.length)return;
 const anio=+$('filtro-periodo').value,comp=+$('filtro-comparacion').value;
 const total=suma(anio),prev=suma(comp),vals=Object.fromEntries(tipos.map(t=>[t,suma(anio,t)]));
 [['kpi-hechos',total],['kpi-extorsion',vals['Extorsión']],['kpi-homicidios',vals.Homicidios],['kpi-robos',vals.Robos],['kpi-hurtos',vals.Hurtos]].forEach(([id,n])=>$(id).textContent=fmt(n));
 $('kpi-variacion').textContent=prev?`${((total-prev)/prev*100).toFixed(1)} %`:'Sin datos';
 $('kpi-hechos-periodo').textContent=`Denuncias en CSV · ${anio}`;
 $('kpi-variacion-detalle').textContent=`Comparado con ${comp}`;
 $('estado-filtros').textContent=`Fuente: CSV anuales 2022–2025 (sedes fiscales). El catálogo de ubicaciones no implica disponibilidad de denuncias por cada distrito. Los meses son estimaciones sintéticas, NO datos mensuales observados.${total===0?' Sin registros para la selección actual.':''}`;
 graf('chart-tipos','doughnut',tipos,tipos.map(t=>vals[t]),'Denuncias');
 $('alt-tipos').textContent=`Total anual: ${fmt(total)} denuncias; distribución por cinco categorías.`;
 const tipo=$('evolucion-tipo').value,desde=+$('anio-desde').value,hasta=+$('anio-hasta').value;
 if(vista==='mensual'){
  const serie=meses.map((_,m)=>suma(anio,tipo,m));
  $('titulo-evolucion').textContent='1. Evolución mensual estimada';
  $('descripcion-evolucion').textContent=`Distribución mensual sintética variable de ${tipo==='Todos'?'todos los delitos':tipo} en ${anio}. NO corresponde a registros mensuales observados.`;
  $('rango-anios').hidden=true;
  graf('chart-evolucion','line',meses,serie,'Estimación mensual (no observada)');
  $('alt-evolucion').textContent=`Estimación mensual sintética, con valores variables. Suma de los 12 meses: ${fmt(serie.reduce((a,b)=>a+b,0))}, igual al total anual.`;
 }else{
  const years=Array.from({length:Math.max(0,hasta-desde+1)},(_,i)=>desde+i);
  $('titulo-evolucion').textContent='1. Comparación anual';$('descripcion-evolucion').textContent='Datos anuales procedentes de los CSV.';$('rango-anios').hidden=false;
  graf('chart-evolucion','bar',years,years.map(y=>suma(y,tipo)),'Denuncias anuales');$('alt-evolucion').textContent=`Comparación anual entre ${desde} y ${hasta}.`;
 }
 const ay=+$('distritos-anio').value,mes=$('distritos-mes').value,dt=$('distritos-tipo').value;
 const porDistrito=new Map();
 for(const r of filas){if(r.anio!==ay||(dt!=='Todos'&&r.tipo_delito!==dt)||!filtroGeo(r))continue;
  const k=`${r.distrito} · ${r.provincia} · ${r.departamento}`;
  porDistrito.set(k,(porDistrito.get(k)||0)+(mes==='Todos'?r.cantidad:mensual(r,+mes-1)));
 }
 const top=[...porDistrito].sort((a,b)=>b[1]-a[1]).slice(0,10);
 graf('chart-distritos','bar',top.map(x=>x[0]),top.map(x=>x[1]),mes==='Todos'?'Denuncias anuales':'Estimación mensual (no observada)');
 $('alt-distritos').textContent=mes==='Todos'?'Comparación anual de distritos del CSV.':'Comparación mensual sintética estimada; no son observaciones mensuales.';
}
async function cargar(){
 if(!config.url||!config.anonKey||config.url.includes('REEMPLAZAR')){aviso('Configura la URL y clave pública en supabase-config.js');return;}
 aviso('Cargando todas las ubicaciones y estadísticas de Supabase…');
 try{
  let arr=[],offset=0;
  while(true){
   const url=`${config.url.replace(/\/$/,'')}/rest/v1/obs_delitos_anuales?select=anio,departamento,provincia,distrito,ubigeo,tipo_delito,cantidad&order=anio.asc&limit=1000&offset=${offset}`;
   const headers={apikey:config.anonKey};if(config.anonKey.startsWith('eyJ'))headers.Authorization=`Bearer ${config.anonKey}`;
   const resp=await fetch(url,{headers});if(!resp.ok)throw new Error(`HTTP ${resp.status}: ${await resp.text()}`);
   const page=await resp.json();arr.push(...page);if(page.length<1000)break;offset+=page.length;
   if(offset>200000)throw new Error('Se superó el límite de seguridad de paginación');
  }
  filas=arr.map(r=>({...r,anio:Number(r.anio),cantidad:Number(r.cantidad)}));
  const deps=unique(filas.map(r=>r.departamento)).length;
  const provs=new Set(filas.map(r=>r.departamento+'|'+r.provincia)).size;
  const dists=new Set(filas.map(r=>r.departamento+'|'+r.provincia+'|'+r.distrito+'|'+r.ubigeo)).size;
  aviso(`${fmt(filas.length)} filas de Supabase · ${deps} departamentos, ${provs} provincias y ${dists} distritos presentes en los CSV. Meses: estimación sintética.`);
  try{catalogo=await cargarCatalogo();aviso(`${fmt(filas.length)} filas estadísticas de Supabase. Catálogo nacional de ${fmt(catalogo.length)} distritos disponible. Los territorios sin registros muestran 0, no datos inventados.`);}catch(err){console.warn(err);aviso(`${fmt(filas.length)} filas estadísticas de Supabase. No se pudo cargar el catálogo nacional; mostrando únicamente ubicaciones con registros. ${err.message}`);}
  actualizaGeo(0);
 }catch(e){aviso(`Error al consultar Supabase: ${e.message}`);console.error(e);}
}
document.addEventListener('DOMContentLoaded',()=>{
 if(!$('filtro-periodo'))return;
 for(const id of ['evolucion-tipo','distritos-tipo'])poblar($(id),tipos,'Todos');
 for(const id of ['filtro-periodo','filtro-comparacion','evolucion-tipo','distritos-anio','distritos-mes','distritos-tipo','anio-desde','anio-hasta'])$(id).addEventListener('change',actualizar);
 $('filtro-departamento').addEventListener('change',()=>actualizaGeo(1));
 $('filtro-provincia').addEventListener('change',()=>actualizaGeo(2));
 $('filtro-distrito-visible').addEventListener('change',actualizar);
 $('vista-mensual').addEventListener('click',()=>{vista='mensual';$('vista-mensual').classList.add('activo');$('vista-anual').classList.remove('activo');actualizar();});
 $('vista-anual').addEventListener('click',()=>{vista='anual';$('vista-anual').classList.add('activo');$('vista-mensual').classList.remove('activo');actualizar();});
 $('restablecer-filtros').addEventListener('click',()=>{$('filtro-periodo').value='2025';$('filtro-comparacion').value='2024';$('distritos-anio').value='2025';$('distritos-mes').value='Todos';$('evolucion-tipo').value='Todos';$('distritos-tipo').value='Todos';$('filtro-departamento').value='Todos';actualizaGeo(1);});
 cargar();
});
})();
