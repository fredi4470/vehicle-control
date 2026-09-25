import {setupScanner} from './scanner.js?v=20260925-camera2';
import {AREAS,searchVehicles} from './data.js';
import {SupabaseVehicleRepository} from './repository.js';
const repo=new SupabaseVehicleRepository();
const $=id=>document.getElementById(id);
const escape=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const areaLabel=id=>id===null?'Ohne Zuordnung':`Parkareal ${String(id).padStart(2,'0')}`;
const date=at=>at?new Intl.DateTimeFormat('de-DE',{day:'2-digit',month:'2-digit',hour:'2-digit',minute:'2-digit'}).format(new Date(at)):'Noch nicht geändert';
let vehicles=[],selected=null,target=null,toastTimer,detailRequest=0;
$('area').insertAdjacentHTML('beforeend',AREAS.map(a=>`<option value="${a.id}">${a.name}</option>`).join(''));
function toast(message){$('toast').textContent=message;$('toast').classList.add('visible');clearTimeout(toastTimer);toastTimer=setTimeout(()=>$('toast').classList.remove('visible'),4500);}
function render(){const matches=searchVehicles(vehicles,$('search').value,$('area').value);$('total').textContent=vehicles.length;$('located').textContent=vehicles.filter(v=>v.areaId!==null).length;$('unlocated').textContent=vehicles.filter(v=>v.areaId===null).length;$('count').textContent=matches.length;$('list').innerHTML=matches.length?matches.map(v=>`<button class="vehicle" data-id="${escape(v.id)}" aria-label="${escape(v.brand+' '+v.model)}, FIN ${v.vin.slice(-4)}, ${areaLabel(v.areaId)}"><span><strong>${escape(v.brand)} ${escape(v.model)}</strong><small>${escape(v.condition)}</small></span><span class="vin-end">${v.vin.slice(-4)}</span><span><span class="area-pill ${v.areaId===null?'none':''}">${areaLabel(v.areaId)}</span></span><span class="date">${date(v.updatedAt)}</span><span class="chevron" aria-hidden="true">›</span></button>`).join(''):'<div class="empty"><strong>Kein Fahrzeug gefunden</strong>Suchbegriff oder Parkareal-Filter anpassen.</div>';}
async function refresh(){try{vehicles=await repo.list();$('error').hidden=true;render();return true;}catch(e){vehicles=[];render();$('error').textContent=e.message;$('error').hidden=false;if(!repo.isSignedIn())updateAuthUI();return false;}}
async function openVehicle(id){const requestId=++detailRequest;try{const history=await repo.history(id);if(requestId!==detailRequest)return;const found=vehicles.find(v=>v.id===id);if(found)found.history=history;}catch(e){toast(e.message);return;}selected=vehicles.find(v=>v.id===id);if(!selected){toast('Fahrzeug nicht gefunden.');return;}target=selected.areaId;const v=selected;$('detail-content').innerHTML=`<h2 id="detail-title" class="detail-name">${escape(v.brand)} ${escape(v.model)}</h2><p class="muted">${escape(v.condition)}</p><p class="detail-vin">FIN ${escape(v.vin)}</p><div class="detail-summary"><span>Zuletzt gespeicherter Standort</span><strong>${areaLabel(v.areaId)}</strong><small>${date(v.updatedAt)}</small></div><label>Neues Parkareal auswählen</label><div class="area-grid" role="group" aria-label="Neues Parkareal">${AREAS.map(a=>`<button data-area="${a.id}" aria-label="${a.name}" aria-pressed="${a.id===target}">${String(a.id).padStart(2,'0')}</button>`).join('')}</div><p id="move-error" class="error" role="alert"></p><button id="save" class="primary full" ${target===v.areaId?'disabled':''}>Standort speichern</button><div class="history"><h3>Standortverlauf</h3><p>Die letzten 100 Änderungen</p>${v.history.length?v.history.map(h=>`<div class="history-item">${areaLabel(h.from)} → ${areaLabel(h.to)}<small>${date(h.at)}</small></div>`).join(''):'<p>Noch keine Standortänderungen.</p>'}<p>QR-ID: <span class="detail-vin">${escape(v.qrId)}</span></p></div>`;if(!$('detail').open)$('detail').showModal();$('save').onclick=saveMove;}
async function saveMove(){if(!selected||target===null)return;const btn=$('save');btn.disabled=true;btn.textContent='Wird gespeichert …';try{await repo.move(selected.id,target,selected.version);const refreshed=await refresh();$('detail').close();toast(refreshed?`Standort gespeichert: ${areaLabel(target)}`:'Standort gespeichert, aber Liste konnte nicht neu geladen werden.');}catch(e){$('move-error').textContent=e.message;btn.disabled=false;btn.textContent='Standort speichern';}}
$('list').onclick=e=>{const b=e.target.closest('[data-id]');if(b)openVehicle(b.dataset.id);};
$('detail-content').onclick=e=>{const b=e.target.closest('[data-area]');if(!b)return;target=Number(b.dataset.area);document.querySelectorAll('[data-area]').forEach(el=>el.setAttribute('aria-pressed',String(Number(el.dataset.area)===target)));$('save').disabled=target===selected.areaId;};
$('search').oninput=render;$('area').onchange=render;
document.querySelectorAll('[data-close]').forEach(b=>b.onclick=()=>$(b.dataset.close).close());
$('scan').onclick=()=>{cameraControls.reset();$('scan-help').open=false;$('qr-input').value='';$('scanner').showModal();};
function resolveQR(value){let code=value.trim();try{const u=new URL(code);code=u.searchParams.get('qr')||u.pathname.split('/').filter(Boolean).pop()||code;}catch{}return vehicles.find(v=>v.qrId===code||v.id===code);}
function showQR(value){const v=resolveQR(value);if(!v){$('scan-error').textContent='Der Code wurde gelesen, passt aber zu keinem Fahrzeug im geladenen Bestand. Bitte den Fahrzeug-QR-Code verwenden oder den Bestand aktualisieren.';return false;}$('scanner').close();openVehicle(v.id);return true;}
$('qr-form').onsubmit=e=>{e.preventDefault();showQR($('qr-input').value);};
const cameraControls=setupScanner({dialog:$('scanner'),video:$('video'),start:$('camera'),stop:$('camera-stop'),photo:$('qr-photo'),message:$('scan-message'),error:$('scan-error'),onResult:showQR});
document.addEventListener('keydown',e=>{if(e.key==='/'&&!['INPUT','TEXTAREA','SELECT'].includes(document.activeElement.tagName)&&!$('detail').open&&!$('scanner').open){e.preventDefault();$('search').focus();}});
function updateAuthUI(){
  const signedIn=repo.isSignedIn();
  $('login-panel').hidden=signedIn;
  $('app-panel').hidden=!signedIn;
  $('logout').hidden=!signedIn;
  $('scan').disabled=!signedIn;
  if(!signedIn){vehicles=[];selected=null;detailRequest++;render();$('detail').close();$('scanner').close();}
}
$('login-form').onsubmit=async e=>{
  e.preventDefault();$('login-error').textContent='';$('login-button').disabled=true;
  try{
    await repo.signIn($('email').value.trim(),$('password').value);
    $('password').value='';updateAuthUI();
    if(await refresh()){const qr=new URL(location.href).searchParams.get('qr');if(qr)showQR(qr);}
  }catch(error){$('password').value='';$('login-error').textContent=error.message;}
  finally{$('login-button').disabled=false;}
};
$('logout').onclick=async()=>{
  try{await repo.signOut();}catch{toast('Lokal abgemeldet. Server-Abmeldung konnte nicht bestätigt werden.');}
  finally{updateAuthUI();}
};
$('refresh').onclick=async()=>{
  $('refresh').disabled=true;
  try{if(await refresh())toast('Fahrzeugbestand aktualisiert.');}
  finally{$('refresh').disabled=false;}
};
updateAuthUI();
if(repo.isSignedIn()){
  if(await refresh()){const qr=new URL(location.href).searchParams.get('qr');if(qr)showQR(qr);}
}
