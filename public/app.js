'use strict';
const UUID={service:'37af0000-39a2-4fce-9c60-01ee00000000',bpm:'37af0001-39a2-4fce-9c60-01ee00000000',accel:'37af0002-39a2-4fce-9c60-01ee00000000',ir:'37af0003-39a2-4fce-9c60-01ee00000000'};
const $=id=>document.getElementById(id),decoder=new TextDecoder();
const state={mode:'offline',source:null,device:null,bindings:[],epoch:0,timer:null,started:0,bpm:null,accel:null,ir:null,last:{bpm:0,accel:0,ir:0},samples:{bpm:[],accel:[],ir:[]},records:[],chart:'bpm',drawPending:false,wake:null,install:null,origin:null};
const navigation=[['home','home','Tổng quan'],['trends','chart','Biểu đồ'],['device','device','Thiết bị'],['origin','origin','Đặt gốc'],['settings','settings','Cài đặt']];
for(const nav of document.querySelectorAll('.side-nav,.bottom-nav'))nav.innerHTML=navigation.map(([id,icon,title])=>`<a class="nav-item" href="#${id}" data-page="${id}"><svg><use href="#i-${icon}"/></svg><span>${title}</span></a>`).join('');
const motionSettingsTemplate=$('motionSettingsTemplate');$('settings').insertBefore(motionSettingsTemplate.content.cloneNode(true),$('settings').querySelector('.privacy'));
const axisSettingsTemplate=$('axisSettingsTemplate');$('settings').insertBefore(axisSettingsTemplate.content.cloneNode(true),$('settings').querySelector('.motion-settings'));
function storageGet(key){try{return localStorage.getItem(key)}catch{return null}}
function storageSet(key,val){try{localStorage.setItem(key,val)}catch{}}
function storageRemove(key){try{localStorage.removeItem(key)}catch{}}
try{const saved=JSON.parse(storageGet('wecare-origin'));if(Array.isArray(saved?.accel)&&saved.accel.length===3&&saved.accel.every(Number.isFinite)&&Number.isFinite(saved.pitch)&&Number.isFinite(saved.roll))state.origin=saved;}catch{}
let axisMap=['x','y','z'];try{const saved=JSON.parse(storageGet('wecare-axis-map'));if(validAxisMap(saved))axisMap=saved;}catch{}
const motionConfig={enabled:false,impactThreshold:4,vibrationThreshold:.45},motionRuntime={samples:[],previous:null,lastImpact:0,lastVibration:0};let motionEvents=[];
try{const saved=JSON.parse(storageGet('wecare-motion-settings'));if(typeof saved?.enabled==='boolean')motionConfig.enabled=saved.enabled;if(Number.isFinite(saved?.impactThreshold))motionConfig.impactThreshold=Math.max(1,Math.min(12,saved.impactThreshold));if(Number.isFinite(saved?.vibrationThreshold))motionConfig.vibrationThreshold=Math.max(.1,Math.min(2,saved.vibrationThreshold));}catch{}
try{const saved=JSON.parse(storageGet('wecare-motion-events'));if(Array.isArray(saved))motionEvents=saved.filter(event=>event&&['impact','vibration'].includes(event.type)&&Number.isFinite(event.ts)&&Number.isFinite(event.value)).slice(0,100);}catch{}
function openApp(){ $('welcome').hidden=true;$('app').hidden=false;storageSet('wecare-welcome','seen');route(); }
function route(){let page=location.hash.slice(1);if(!navigation.some(n=>n[0]===page))page='home';document.querySelectorAll('.page').forEach(el=>{el.hidden=el.id!==page;el.classList.toggle('active',el.id===page)});document.querySelectorAll('a.nav-item').forEach(el=>{let active=el.dataset.page===page;el.classList.toggle('active',active);if(active)el.setAttribute('aria-current','page');else el.removeAttribute('aria-current')});scheduleDraw();window.scrollTo({top:0,behavior:'instant'});}
window.addEventListener('hashchange',route);
document.querySelectorAll('button[data-page]').forEach(el=>el.onclick=()=>{location.hash=el.dataset.page});
$('begin').onclick=$('skip').onclick=openApp;
if(storageGet('wecare-welcome')==='seen')openApp();
$('today').textContent=new Intl.DateTimeFormat('vi-VN',{weekday:'long',day:'numeric',month:'long'}).format(new Date()).toLocaleUpperCase('vi-VN');
function log(message){const row=document.createElement('div'),time=document.createElement('time');time.textContent=new Date().toLocaleTimeString('vi-VN');row.append(time,document.createTextNode(message));$('logs').prepend(row);while($('logs').children.length>35)$('logs').lastChild.remove();}
let toastTimeout;
function toast(message,variant=''){$('toast').textContent=message;$('toast').className='toast'+(variant?' '+variant:'');$('toast').hidden=false;clearTimeout(toastTimeout);toastTimeout=setTimeout(()=>$('toast').hidden=true,4200);}
function notice(message=''){ $('notice').textContent=message;$('notice').hidden=!message; }
function showDialog(html){$('dialogContent').innerHTML=html;$('dialog').showModal();}
document.querySelectorAll('.dialog-close').forEach(b=>b.onclick=()=>$('dialog').close());
$('dialog').addEventListener('click',e=>{if(e.target===$('dialog')){const r=$('dialog').getBoundingClientRect();if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)$('dialog').close();}});
function setMode(mode){state.mode=mode;const text={offline:'Chưa kết nối',connecting:'Đang kết nối',connected:'Đã kết nối',demo:'Chế độ demo'}[mode];$('statusBadge').innerHTML='<i></i>'+text;$('statusBadge').className='badge '+(mode==='connected'?'online':mode==='demo'?'demo':'');$('deviceBadge').textContent=text;$('deviceBadge').className=$('statusBadge').className;$('demoBanner').hidden=mode!=='demo';for(const button of document.querySelectorAll('.connect-action')){button.disabled=mode==='connecting';button.querySelector('span').textContent=mode==='connected'?'Ngắt kết nối':mode==='connecting'?'Đang kết nối…':'Kết nối thiết bị';}$('heroText').innerHTML=mode==='connected'?'Cảm biến đã sẵn sàng.<br>Cùng lắng nghe cơ thể bạn.':mode==='demo'?'Bạn đang khám phá bản demo.<br>Tất cả số đo đều được mô phỏng.':'Kết nối cảm biến để bắt đầu<br>lắng nghe nhịp điệu của bạn.';$('demoHome').hidden=mode==='connected'||mode==='connecting'||mode==='demo';$('demoDevice').hidden=mode==='connected'||mode==='connecting';syncWake();renderValues();}
function resetData(){state.bpm=state.accel=state.ir=null;state.last={bpm:0,accel:0,ir:0};state.samples={bpm:[],accel:[],ir:[]};state.records=[];motionRuntime.samples=[];motionRuntime.previous=null;$('sensor3d').style.transform='rotateX(0deg) rotateY(0deg) rotateZ(0deg)';renderValues();scheduleDraw();}
function fresh(type,now=Date.now()){return (state.mode==='demo'||state.mode==='connected'||state.mode==='connecting')&&!!state.last[type]&&now-state.last[type]<3500;}
function fmt(n,digits=2){return Number.isFinite(n)?n.toFixed(digits):'--';}
function renderValues(){const validB=fresh('bpm'),validA=fresh('accel'),validI=fresh('ir');$('bpm').textContent=validB&&state.bpm!==null?state.bpm:'--';$('bpmNote').textContent=validB&&state.bpm!==null?'Đã nhận số đo':'Chưa có số đo';$('heartHint').textContent=state.last.bpm&&!validB?'Tín hiệu gián đoạn':validB&&state.bpm!==null?'Nhịp tim từ cảm biến':'Đặt ngón tay nhẹ lên cảm biến';const acc=validA?state.accel:null;['ax','ay','az'].forEach((id,i)=>$(id).textContent=fmt(acc?.[i]));const mag=acc?Math.hypot(...acc):null;$('magnitude').textContent=fmt(mag);$('gravity').textContent=fmt(mag===null?null:mag/9.80665)+' g';if(acc){const [x,y,z]=acc,pitch=Math.atan2(x,Math.hypot(y,z))*180/Math.PI,roll=Math.atan2(-y,z)*180/Math.PI;$('pitch').textContent=fmt(pitch,1)+'°';$('roll').textContent=fmt(roll,1)+'°';$('sensor3d').style.transform=`rotateX(${40+Math.max(-60,Math.min(60,roll))*.55}deg) rotateY(${pitch*.6}deg) rotateZ(-30deg)`;}else{$('pitch').textContent=$('roll').textContent='--°';}$('sensor3d').classList.toggle('stale',!validA);$('ir').textContent=validI&&state.ir!==null?state.ir.toLocaleString('vi-VN'):'--';$('irHint').textContent=state.last.ir&&!validI?'Tín hiệu gián đoạn':validI?'Cường độ ánh sáng phản xạ · IR raw':'Tín hiệu quang học từ MAX30102';const recent=state.samples.accel.slice(-12).filter(p=>p.v!==null).map(p=>Math.hypot(...p.v));$('motionHint').textContent=!validA?'Đang chờ cảm biến':recent.length>1&&Math.max(...recent)-Math.min(...recent)>2?'Gia tốc đang biến thiên':'Gia tốc biến thiên thấp';const last=Math.max(...Object.values(state.last));$('updated').textContent=last&&Date.now()-last<3500&&(state.mode==='demo'||state.mode==='connected')?(state.mode==='demo'?'Mô phỏng · ':'')+'Vừa cập nhật':state.mode==='connected'?'Đang chờ tín hiệu':'Chờ kết nối';$('recordCount').textContent=state.records.length.toLocaleString('vi-VN');$('sourceLabel').textContent=state.source==='SIMULATED'?'DEMO · Dữ liệu mô phỏng':state.source==='BLE'?'Bluetooth · Cảm biến thật':'Chưa có dữ liệu';}
function orientation(accel){const [x,y,z]=accel;return{pitch:Math.atan2(x,Math.hypot(y,z))*180/Math.PI,roll:Math.atan2(-y,z)*180/Math.PI}}
function relativeMotion(accel,origin){if(!accel||!origin)return null;const angle=orientation(accel),clean=(value,deadband)=>Math.abs(value)<deadband?0:value,wrap=value=>((value+180)%360+360)%360-180;return{accel:accel.map((value,index)=>clean(value-origin.accel[index],.03)),pitch:clean(wrap(angle.pitch-origin.pitch),.3),roll:clean(wrap(angle.roll-origin.roll),.3)}}
function sensorTransform(pitch,roll){return`rotateX(${Math.max(-180,Math.min(180,roll))}deg) rotateY(${Math.max(-90,Math.min(90,pitch))}deg) rotateZ(0deg)`}
function renderOrigin(){
const live=fresh('accel')?state.accel:null,relative=relativeMotion(live,state.origin),angle=live?orientation(live):null;
$('motionChartMode').textContent=state.origin?'Độ lệch gia tốc từ mốc đã lưu':'Gia tốc theo trục đã ánh xạ';$('originChartMode').textContent=$('motionChartMode').textContent;
['relativeX','relativeY','relativeZ'].forEach((id,index)=>$(id).textContent=relative?fmt(relative.accel[index]):'--');
$('relativePitch').textContent=relative?fmt(relative.pitch,1)+'°':'--°';$('relativeRoll').textContent=relative?fmt(relative.roll,1)+'°':'--°';
$('originStatus').textContent=state.origin?'MỐC ĐÃ LƯU':'CHƯA CÓ MỐC';$('originStatus').className='origin-status '+(state.origin?'ready':'');
$('originSaved').textContent=state.origin?.savedAt?`Đã ghi ${new Date(state.origin.savedAt).toLocaleString('vi-VN')}`:'Tọa độ tương đối đang chờ mốc chuẩn.';
$('setOrigin').disabled=state.mode!=='connected'||!live;$('clearOrigin').hidden=!state.origin;
const shown=relative||angle,transform=shown?sensorTransform(shown.pitch,shown.roll):'rotateX(0deg) rotateY(0deg) rotateZ(0deg)';
$('originSensor3d').style.transform=transform;$('originSensor3d').classList.toggle('stale',!live);
if(shown)$('sensor3d').style.transform=transform;if(relative){$('pitch').textContent=fmt(relative.pitch,1)+'°';$('roll').textContent=fmt(relative.roll,1)+'°';}
}
const renderSensorValues=renderValues;renderValues=function(){renderSensorValues();renderOrigin();};
function captureOrigin(){
if(state.mode!=='connected'||!fresh('accel')){toast('Kết nối cảm biến và chờ dữ liệu gia tốc trước khi ghi mốc.');return;}
const cutoff=Date.now()-1200,points=state.samples.accel.filter(point=>point.ts>=cutoff&&Array.isArray(point.v));
const source=points.length?points.map(point=>point.v):[state.accel],accel=[0,1,2].map(index=>source.reduce((sum,value)=>sum+value[index],0)/source.length),angle=orientation(accel);
state.origin={accel,pitch:angle.pitch,roll:angle.roll,savedAt:Date.now()};storageSet('wecare-origin',JSON.stringify(state.origin));renderValues();toast('Đã ghi tư thế hiện tại làm gốc 0, 0, 0.');log('Đã cập nhật mốc tọa độ chuyển động.');
}
function clearOrigin(){state.origin=null;storageRemove('wecare-origin');renderValues();toast('Đã xóa mốc tọa độ.');log('Đã xóa mốc tọa độ chuyển động.');}
function validAxisMap(map){return Array.isArray(map)&&map.length===3&&map.every(value=>/^-?[xyz]$/.test(value))&&new Set(map.map(value=>value.replace('-',''))).size===3;}
function applyAxisMap(accel,map=axisMap){const source={x:accel[0],y:accel[1],z:accel[2]};return map.map(axis=>(axis.startsWith('-')?-1:1)*source[axis.replace('-','')]);}
function renderAxisSettings(){['axisX','axisY','axisZ'].forEach((id,index)=>$(id).value=axisMap[index]);const current=axisMap.join(',');document.querySelectorAll('[data-axis-preset]').forEach(button=>{const selected=button.dataset.axisPreset===current;button.classList.toggle('selected',selected);button.setAttribute('aria-pressed',String(selected));});}
function setAxisMap(next){if(!validAxisMap(next)||next.every((axis,index)=>axis===axisMap[index]))return;axisMap=[...next];storageSet('wecare-axis-map',JSON.stringify(axisMap));state.origin=null;storageRemove('wecare-origin');state.accel=null;state.last.accel=0;state.samples.accel=[];motionRuntime.samples=[];motionRuntime.previous=null;renderAxisSettings();renderValues();scheduleDraw();toast('Đã đổi hướng cảm biến. Hãy ghi lại tọa độ gốc.');log(`Ánh xạ trục mô hình: ${axisMap.join(', ').toUpperCase()}.`);}
function changeAxis(index,value){const next=[...axisMap],old=next[index],source=value.replace('-',''),conflict=next.findIndex((axis,other)=>other!==index&&axis.replace('-','')===source);next[index]=value;if(conflict>=0)next[conflict]=old;setAxisMap(next);}
function repeatedVibration(samples,threshold){if(samples.length<12)return null;const duration=(samples.at(-1).ts-samples[0].ts)/1000;if(duration<1.5)return null;let best=null;for(let axis=0;axis<3;axis++){const values=samples.map(sample=>sample.v[axis]),mean=values.reduce((sum,value)=>sum+value,0)/values.length,centered=values.map(value=>value-mean),rms=Math.sqrt(centered.reduce((sum,value)=>sum+value*value,0)/centered.length);let crossings=0,lastSign=0;for(const value of centered){const sign=Math.abs(value)<threshold*.2?0:Math.sign(value);if(sign&&lastSign&&sign!==lastSign)crossings++;if(sign)lastSign=sign;}if(!best||rms>best.rms)best={axis,rms,crossings,duration};}return best.rms>=threshold&&best.crossings>=5?best:null;}
function renderMotionEvents(){
const host=$('motionEvents');host.replaceChildren();
if(!motionEvents.length){const empty=document.createElement('p');empty.className='motion-empty';empty.textContent='Chưa ghi nhận sự kiện chuyển động.';host.append(empty);return;}
for(const event of motionEvents.slice(0,20)){const row=document.createElement('div'),icon=document.createElement('i'),body=document.createElement('div'),title=document.createElement('b'),detail=document.createElement('small'),time=document.createElement('time');row.className='motion-event '+event.type;title.textContent=event.type==='impact'?'Chuyển động mạnh':'Rung lặp lại';detail.textContent=event.type==='impact'?`Độ thay đổi ${event.value.toFixed(2)} m/s²`:`RMS ${event.value.toFixed(2)} m/s² · ${event.crossings} lần đảo chiều`;time.textContent=new Date(event.ts).toLocaleString('vi-VN');body.append(title,detail);row.append(icon,body,time);host.append(row);}
}
function notifyMotion(event){const message=event.type==='impact'?'Phát hiện chuyển động mạnh bất thường.':'Phát hiện rung lặp lại ở tay đeo. Hãy nghỉ tay và theo dõi thêm.';toast(message,'alert');log(message);if(navigator.vibrate)navigator.vibrate(event.type==='impact'?[250,120,250]:[120,80,120,80,120]);if('Notification'in window&&Notification.permission==='granted')navigator.serviceWorker?.ready.then(registration=>registration.showNotification('WeCare · Cảnh báo chuyển động',{body:message,icon:'/icon-192.png',tag:`wecare-${event.type}`})).catch(()=>{});}
function recordMotionEvent(type,value,ts,extra={}){const event={type,value,ts,...extra};motionEvents.unshift(event);if(motionEvents.length>100)motionEvents.length=100;storageSet('wecare-motion-events',JSON.stringify(motionEvents));renderMotionEvents();notifyMotion(event);}
function analyzeMotion(value,ts){
if(state.source!=='BLE'){motionRuntime.previous=value;return;}
const previous=motionRuntime.previous;motionRuntime.previous=value;motionRuntime.samples.push({ts,v:[...value]});while(motionRuntime.samples.length&&motionRuntime.samples[0].ts<ts-2500)motionRuntime.samples.shift();
if(!motionConfig.enabled||!previous)return;
const delta=Math.hypot(value[0]-previous[0],value[1]-previous[1],value[2]-previous[2]);
if(delta>=motionConfig.impactThreshold&&ts-motionRuntime.lastImpact>5000){motionRuntime.lastImpact=ts;recordMotionEvent('impact',delta,ts);}
if(ts-motionRuntime.lastVibration>30000){const vibration=repeatedVibration(motionRuntime.samples,motionConfig.vibrationThreshold);if(vibration){motionRuntime.lastVibration=ts;recordMotionEvent('vibration',vibration.rms,ts,{crossings:vibration.crossings});}}
}
function saveMotionConfig(){storageSet('wecare-motion-settings',JSON.stringify(motionConfig));}
function renderMotionSettings(){$('motionAlerts').checked=motionConfig.enabled;$('impactThreshold').value=motionConfig.impactThreshold;$('impactThresholdValue').textContent=motionConfig.impactThreshold.toFixed(1)+' m/s²';$('vibrationThreshold').value=motionConfig.vibrationThreshold;$('vibrationThresholdValue').textContent=motionConfig.vibrationThreshold.toFixed(1)+' m/s²';renderMotionEvents();}
function parsePayload(type,text){const s=text.trim();if(type==='accel'){const a=s.split(',');if(a.length!==3||a.some(x=>!/^[-+]?(?:\d+\.?\d*|\.\d+)$/.test(x.trim())))return undefined;const v=a.map(Number);return v.every(x=>Number.isFinite(x)&&Math.abs(x)<=100)?v:undefined;}if(!/^[-+]?\d+$/.test(s))return undefined;const n=Number(s);if(!Number.isSafeInteger(n))return undefined;if(type==='bpm')return n===-1?null:(n>=0&&n<=300?n:undefined);return n>=0&&n<=10000000?n:undefined;}
function ingest(type,text,ts=Date.now()){const parsed=parsePayload(type,text);if(parsed===undefined){if(type==='accel'&&text.trim()==='ERR'){state.accel=null;state.last.accel=0;renderValues();}return false;}const value=type==='accel'?applyAxisMap(parsed):parsed;state[type]=value;state.last[type]=ts;const arr=state.samples[type];arr.push({ts,v:value});while(arr.length&&arr[0].ts<ts-65000)arr.shift();if(arr.length>1200)arr.shift();if(type==='accel')analyzeMotion(value,ts);const row={ts,source:state.source,type,bpm:fresh('bpm',ts)?state.bpm:null,ir:fresh('ir',ts)?state.ir:null,accel:fresh('accel',ts)?state.accel:null};state.records.push(row);if(state.records.length>50000)state.records.shift();renderValues();scheduleDraw();return true;}
function cleanupBindings(){for(const [char,handler] of state.bindings)char.removeEventListener('characteristicvaluechanged',handler);state.bindings=[];}
function disconnect(){state.epoch++;cleanupBindings();const d=state.device;state.device=null;if(d){d.removeEventListener('gattserverdisconnected',onDisconnected);if(d.gatt.connected)d.gatt.disconnect();}setMode('offline');log('Đã ngắt Bluetooth. Phiên đo vẫn có thể xuất CSV.');}
function onDisconnected(){state.epoch++;cleanupBindings();if(state.device)state.device.removeEventListener('gattserverdisconnected',onDisconnected);state.device=null;setMode('offline');notice('Mất kết nối cảm biến. Nhấn Kết nối thiết bị để kết nối lại.');log('Bluetooth đã ngắt kết nối.');}
async function connectSensor(){
if(state.mode==='connecting')return;
if(state.mode==='connected'){disconnect();return;}
if(!window.isSecureContext||!navigator.bluetooth){notice('Bluetooth chưa được hỗ trợ ở trình duyệt này. Dùng Chrome trên Android hoặc Chrome/Edge trên máy tính, mở trang qua HTTPS.');location.hash='device';return;}
if(state.timer)stopDemo();
notice();resetData();state.source='BLE';state.started=Date.now();setMode('connecting');
const attempt=++state.epoch,labels={bpm:'nhịp tim',accel:'gia tốc',ir:'hồng ngoại'};
let chosen=null,stage='chọn thiết bị';
try{
chosen=await navigator.bluetooth.requestDevice({filters:[{namePrefix:'VieGrand'},{namePrefix:'wecare'},{namePrefix:'WeCare'}],optionalServices:[UUID.service]});
if(attempt!==state.epoch)return;
state.device=chosen;chosen.addEventListener('gattserverdisconnected',onDisconnected);
stage='kết nối Bluetooth';
let server=null,lastConnectError=null;
for(let retry=1;retry<=3&&!server;retry++){
try{server=chosen.gatt.connected?chosen.gatt:await chosen.gatt.connect();}
catch(error){
lastConnectError=error;
log(`Kết nối Bluetooth lần ${retry}/3 thất bại: ${error.message||'lỗi không xác định'}.`);
if(attempt!==state.epoch)throw new Error('Kết nối đã bị gián đoạn.');
if(retry<3)await new Promise(resolve=>setTimeout(resolve,retry*600));
}
}
if(!server)throw new Error(`${lastConnectError?.message||'Thiết bị không phản hồi'}. Hãy đóng tab hoặc ứng dụng khác đang dùng cảm biến, khởi động lại mạch rồi thử lại.`);
log('Bluetooth đã kết nối. Đang kiểm tra dịch vụ cảm biến...');
stage='tìm dịch vụ cảm biến';
const service=await server.getPrimaryService(UUID.service),failures=[];
for(const type of ['bpm','accel','ir']){
if(attempt!==state.epoch)throw new Error('Kết nối đã bị gián đoạn.');
let char=null,handler=null;
try{
stage=`bật kênh ${labels[type]}`;
char=await service.getCharacteristic(UUID[type]);
handler=event=>{if(attempt!==state.epoch)return;const v=event.target.value;if(v)ingest(type,decoder.decode(new Uint8Array(v.buffer,v.byteOffset,v.byteLength)));};
char.addEventListener('characteristicvaluechanged',handler);
await char.startNotifications();
state.bindings.push([char,handler]);
try{const v=await char.readValue();if(attempt===state.epoch)ingest(type,decoder.decode(new Uint8Array(v.buffer,v.byteOffset,v.byteLength)));}catch{/* Notifications remain available without initial read. */}
log(`Đã bật kênh ${labels[type]}.`);
}catch(error){
if(char&&handler)char.removeEventListener('characteristicvaluechanged',handler);
failures.push(`${labels[type]} (${error.message||'không hỗ trợ Notify'})`);
log(`Không bật được kênh ${labels[type]}: ${error.message||'lỗi không xác định'}.`);
}
}
if(attempt!==state.epoch)throw new Error('Kết nối đã bị gián đoạn.');
if(!state.bindings.length)throw new Error(`Không có kênh dữ liệu tương thích. ${failures.join('; ')}`);
$('deviceName').textContent=chosen.name||'Cảm biến WeCare';setMode('connected');
if(failures.length)notice(`Đã kết nối, nhưng chưa nhận được ${failures.join('; ')}. Kiểm tra UUID và thuộc tính Notify trong firmware.`);else notice();
toast(failures.length?'Đã kết nối một phần':'Đã kết nối cảm biến');
log(`Kết nối sẵn sàng với ${state.bindings.length}/3 kênh dữ liệu.`);
}catch(error){
cleanupBindings();
if(chosen){chosen.removeEventListener('gattserverdisconnected',onDisconnected);if(chosen.gatt.connected)chosen.gatt.disconnect();}
state.device=null;state.epoch++;setMode('offline');
const msg=error.name==='NotFoundError'?'Bạn chưa chọn thiết bị. Nhấn Kết nối khi muốn thử lại.':`Không thể kết nối tại bước ${stage}: ${error.message||'kiểm tra nguồn và thử lại.'}`;
notice(msg);location.hash='device';log(msg);
}}
document.querySelectorAll('.connect-action').forEach(b=>b.onclick=connectSensor);
$('setOrigin').onclick=captureOrigin;$('clearOrigin').onclick=clearOrigin;
function startDemo(){if(state.mode==='connected'||state.mode==='connecting'){toast('Hãy ngắt cảm biến trước khi thử demo.');return;}if(state.timer)return;notice();resetData();state.source='SIMULATED';state.started=Date.now();setMode('demo');let step=0;const tick=()=>{step++;const t=step/10;ingest('accel',`${(Math.sin(t)*.9).toFixed(2)},${(Math.cos(t*.8)*.5).toFixed(2)},${(9.78+Math.sin(t*1.6)*.22).toFixed(2)}`);if(step===1||step%5===0){ingest('bpm',String(Math.round(76+Math.sin(t*.3)*4)));ingest('ir',String(Math.round(85320+Math.sin(t*1.4)*2300)));}};tick();state.timer=setInterval(tick,100);log('Bắt đầu DEMO. Số đo được mô phỏng, không phải dữ liệu thật.');}
function stopDemo(){clearInterval(state.timer);state.timer=null;setMode('offline');toast('Đã dừng demo. Dữ liệu vẫn có thể xuất CSV.');log('Dừng DEMO.');}
$('demoHome').onclick=$('demoDevice').onclick=startDemo;$('stopDemo').onclick=stopDemo;
function exportCSV(){if(!state.records.length){toast('Chưa có dữ liệu. Hãy kết nối cảm biến hoặc mở demo.');return;}const rows=state.records.map(r=>[new Date(r.ts).toISOString(),r.source,r.type,r.bpm??'',r.ir??'',...(r.accel||['','','']),r.accel?Math.hypot(...r.accel).toFixed(4):''].join(','));const blob=new Blob(['\uFEFFtimestamp_iso,source,event,bpm,ir_raw,ax_mps2,ay_mps2,az_mps2,magnitude_mps2\r\n',rows.join('\r\n')],{type:'text/csv;charset=utf-8'});const url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=`wecare_${state.source==='SIMULATED'?'DEMO_':''}${new Date().toISOString().replace(/[:.]/g,'-')}.csv`;a.click();setTimeout(()=>URL.revokeObjectURL(url),3000);toast('Đã xuất dữ liệu phiên đo.');}
document.querySelectorAll('.export-action').forEach(b=>b.onclick=exportCSV);
function drawChart(id,type,mini=false){const canvas=$(id);if(!canvas.offsetWidth)return;const r=canvas.getBoundingClientRect(),dpr=Math.min(devicePixelRatio||1,2),w=r.width,h=r.height;canvas.width=Math.round(w*dpr);canvas.height=Math.round(h*dpr);const ctx=canvas.getContext('2d');ctx.scale(dpr,dpr);const end=Date.now(),start=end-60000,points=state.samples[type].filter(p=>p.ts>=start);const values=points.filter(p=>p.v!==null).flatMap(p=>Array.isArray(p.v)?p.v:[p.v]);let min=values.length?Math.min(...values):0,max=values.length?Math.max(...values):100;const pad=Math.max((max-min)*.2,type==='bpm'?3:type==='ir'?100:.4);min-=pad;max+=pad;const l=mini?1:40,rr=w-(mini?1:10),t=mini?4:14,b=h-(mini?3:26);ctx.lineWidth=1;if(!mini){ctx.font='9px sans-serif';ctx.fillStyle='#96a58c';for(let i=0;i<4;i++){const y=t+(b-t)*i/3;ctx.strokeStyle='#edf1e8';ctx.beginPath();ctx.moveTo(l,y);ctx.lineTo(rr,y);ctx.stroke();ctx.textAlign='right';const n=max-(max-min)*i/3;ctx.fillText(type==='ir'?(n/1000).toFixed(1)+'k':n.toFixed(type==='bpm'?0:1),l-7,y+3);}ctx.textAlign='center';for(let i=0;i<5;i++)ctx.fillText(i===4?'Bây giờ':`−${60-i*15}s`,l+(rr-l)*i/4,b+20);}
if(!points.length){ctx.fillStyle='#aeb9a2';ctx.font=(mini?'8':'11')+'px sans-serif';ctx.textAlign='center';ctx.fillText(mini?'Chờ dữ liệu':'Kết nối cảm biến để xem biểu đồ',w/2,(t+b)/2);return;}const colors=type==='accel'?['#599a72','#c4a36e','#9b8ab7']:[type==='bpm'?'#7baf82':'#bbac75'];colors.forEach((color,axis)=>{ctx.beginPath();let prev=null;points.forEach(p=>{if(p.v===null){prev=null;return;}const v=Array.isArray(p.v)?p.v[axis]:p.v,x=l+(p.ts-start)/60000*(rr-l),y=b-(v-min)/(max-min)*(b-t);if(!prev||p.ts-prev.ts>1500)ctx.moveTo(x,y);else ctx.lineTo(x,y);prev=p;});ctx.lineWidth=mini?1.7:2;ctx.strokeStyle=color;ctx.lineJoin='round';ctx.lineCap='round';ctx.stroke();const last=points[points.length-1];if(last.v!==null&&fresh(type)){const v=Array.isArray(last.v)?last.v[axis]:last.v;ctx.beginPath();ctx.arc(l+(last.ts-start)/60000*(rr-l),b-(v-min)/(max-min)*(b-t),mini?2:3,0,Math.PI*2);ctx.fillStyle=color;ctx.fill();}});}
function drawAxisChart(id,mini=false){const canvas=$(id);if(!canvas.offsetWidth)return;const box=canvas.getBoundingClientRect(),dpr=Math.min(devicePixelRatio||1,2),w=box.width,h=box.height;canvas.width=Math.round(w*dpr);canvas.height=Math.round(h*dpr);const ctx=canvas.getContext('2d');ctx.scale(dpr,dpr);const end=Date.now(),start=end-60000,points=state.samples.accel.filter(point=>point.ts>=start).map(point=>({ts:point.ts,v:state.origin?point.v.map((value,index)=>value-state.origin.accel[index]):point.v})),values=points.flatMap(point=>point.v);let min=values.length?Math.min(0,...values):-1,max=values.length?Math.max(0,...values):1;if(max-min<1){min-=.5;max+=.5;}const pad=Math.max((max-min)*.12,.2);min-=pad;max+=pad;const left=mini?2:38,right=w-(mini?2:10),top=mini?5:16,bottom=h-(mini?5:25);ctx.lineWidth=1;if(!mini){ctx.font='9px sans-serif';ctx.fillStyle='#96a58c';for(let i=0;i<4;i++){const y=top+(bottom-top)*i/3;ctx.strokeStyle='#edf1e8';ctx.beginPath();ctx.moveTo(left,y);ctx.lineTo(right,y);ctx.stroke();ctx.textAlign='right';ctx.fillText((max-(max-min)*i/3).toFixed(1),left-6,y+3);}}const zeroY=bottom-(0-min)/(max-min)*(bottom-top);ctx.strokeStyle='#cbd7ce';ctx.beginPath();ctx.moveTo(left,zeroY);ctx.lineTo(right,zeroY);ctx.stroke();if(!points.length){ctx.fillStyle='#aeb9a2';ctx.font=(mini?'8':'11')+'px sans-serif';ctx.textAlign='center';ctx.fillText('Chờ dữ liệu gia tốc',w/2,(top+bottom)/2);return;}['#599a72','#c4a36e','#9b8ab7'].forEach((color,axis)=>{ctx.beginPath();let previous=null;for(const point of points){const x=left+(point.ts-start)/60000*(right-left),y=bottom-(point.v[axis]-min)/(max-min)*(bottom-top);if(!previous||point.ts-previous.ts>1500)ctx.moveTo(x,y);else ctx.lineTo(x,y);previous=point;}ctx.lineWidth=mini?1.7:2;ctx.strokeStyle=color;ctx.lineJoin='round';ctx.lineCap='round';ctx.stroke();const latest=points.at(-1),x=left+(latest.ts-start)/60000*(right-left),y=bottom-(latest.v[axis]-min)/(max-min)*(bottom-top);ctx.beginPath();ctx.arc(x,y,mini?2:3,0,Math.PI*2);ctx.fillStyle=color;ctx.fill();});}
function renderStats(){const arr=state.samples[state.chart].filter(p=>p.ts>=Date.now()-60000&&p.v!==null).map(p=>Array.isArray(p.v)?Math.hypot(...p.v):p.v);const digits=state.chart==='accel'?2:0;$('statMin').textContent=arr.length?fmt(Math.min(...arr),digits):'--';$('statMax').textContent=arr.length?fmt(Math.max(...arr),digits):'--';$('statAvg').textContent=arr.length?fmt(arr.reduce((a,b)=>a+b,0)/arr.length,digits):'--';$('statLabel').textContent='Thống kê 60 giây gần nhất · '+{bpm:'BPM',accel:'Độ lớn gia tốc (m/s²)',ir:'IR raw'}[state.chart];}
function scheduleDraw(){if(state.drawPending)return;state.drawPending=true;requestAnimationFrame(()=>{state.drawPending=false;drawChart('bpmMini','bpm',true);drawChart('irMini','ir',true);drawChart('detailChart',state.chart);drawAxisChart('motionAxisChart',true);drawAxisChart('relativeAxisChart');renderStats();});}
window.addEventListener('resize',scheduleDraw);
document.querySelectorAll('[data-chart]').forEach(b=>b.onclick=()=>{state.chart=b.dataset.chart;document.querySelectorAll('[data-chart]').forEach(btn=>{const selected=btn===b;btn.classList.toggle('selected',selected);btn.setAttribute('aria-pressed',String(selected));});$('chartTitle').textContent={bpm:'Nhịp tim · BPM',accel:'Gia tốc · m/s²',ir:'Hồng ngoại · IR raw'}[state.chart];$('chartLegend').innerHTML=state.chart==='accel'?'<span class="axis-x">● Trục X</span><span class="axis-y">● Trục Y</span><span class="axis-z">● Trục Z</span>':state.chart==='bpm'?'Nhịp tim (BPM)':'Tín hiệu hồng ngoại (IR raw)';scheduleDraw();});
async function fullscreen(){try{if(document.fullscreenElement)await document.exitFullscreen();else if(document.documentElement.requestFullscreen)await document.documentElement.requestFullscreen();else showDialog('<h2>Mở như ứng dụng</h2><p>Trình duyệt này chưa hỗ trợ nút toàn màn hình. Chọn Chia sẻ → Thêm vào màn hình chính, sau đó mở wecare từ biểu tượng vừa thêm.</p>');}catch{toast('Hãy thêm wecare vào màn hình chính để mở như ứng dụng.');}}
$('fullscreen').onclick=$('fullscreenSettings').onclick=fullscreen;
window.addEventListener('beforeinstallprompt',e=>{e.preventDefault();state.install=e;});
$('install').onclick=async()=>{if(state.install){const prompt=state.install;state.install=null;await prompt.prompt();const result=await prompt.userChoice;if(result.outcome==='accepted')toast('Đã thêm wecare vào màn hình chính.');}else{showDialog('<h2>Mang wecare theo bạn</h2><p><b>Android · Chrome</b><br>Mở menu ⋮ → Thêm vào màn hình chính → Cài đặt.</p><p><b>iPhone · Safari</b><br>Chọn Chia sẻ → Thêm vào màn hình chính. Giao diện và demo hoạt động; kết nối BLE trực tiếp cần trình duyệt hỗ trợ.</p><p>Nếu ứng dụng đã được cài, hãy mở từ biểu tượng wecare.</p>');}};
window.addEventListener('appinstalled',()=>{state.install=null;toast('wecare đã sẵn sàng trên màn hình chính.');});
async function syncWake(){if(!$('wakeToggle').checked||document.hidden||!['demo','connected'].includes(state.mode)){if(state.wake){await state.wake.release().catch(()=>{});state.wake=null;}return;}if(!navigator.wakeLock){$('wakeToggle').checked=false;$('wakeHint').textContent='Trình duyệt chưa hỗ trợ';return;}if(!state.wake){try{state.wake=await navigator.wakeLock.request('screen');state.wake.addEventListener('release',()=>{state.wake=null;});$('wakeHint').textContent='Đang giữ màn hình sáng';}catch{$('wakeHint').textContent='Không thể giữ sáng trong môi trường này';}}}
$('wakeToggle').onchange=syncWake;document.addEventListener('visibilitychange',()=>{syncWake();renderValues();scheduleDraw();});
$('showWelcome').onclick=()=>{$('app').hidden=true;$('welcome').hidden=false;window.scrollTo(0,0);};
$('clearData').onclick=()=>{showDialog('<h2>Xóa dữ liệu phiên?</h2><p>Các mẫu đo chưa xuất CSV sẽ bị xóa. Nếu cảm biến đang kết nối, dữ liệu mới vẫn tiếp tục được nhận.</p><button class="button primary" id="confirmClear">Xóa dữ liệu</button>');$('confirmClear').onclick=()=>{resetData();$('dialog').close();toast('Đã xóa dữ liệu phiên.');};};
$('motionAlerts').onchange=async event=>{motionConfig.enabled=event.target.checked;motionRuntime.samples=[];motionRuntime.previous=null;saveMotionConfig();if(motionConfig.enabled&&'Notification'in window&&Notification.permission==='default')await Notification.requestPermission().catch(()=>{});toast(motionConfig.enabled?'Đã bật cảnh báo chuyển động.':'Đã tắt cảnh báo chuyển động.');};
$('impactThreshold').oninput=event=>{motionConfig.impactThreshold=Number(event.target.value);$('impactThresholdValue').textContent=motionConfig.impactThreshold.toFixed(1)+' m/s²';saveMotionConfig();};
$('vibrationThreshold').oninput=event=>{motionConfig.vibrationThreshold=Number(event.target.value);$('vibrationThresholdValue').textContent=motionConfig.vibrationThreshold.toFixed(1)+' m/s²';saveMotionConfig();};
$('clearMotionEvents').onclick=()=>{motionEvents=[];storageRemove('wecare-motion-events');renderMotionEvents();toast('Đã xóa nhật ký chuyển động.');};
$('axisX').onchange=event=>changeAxis(0,event.target.value);$('axisY').onchange=event=>changeAxis(1,event.target.value);$('axisZ').onchange=event=>changeAxis(2,event.target.value);
document.querySelectorAll('[data-axis-preset]').forEach(button=>button.onclick=()=>setAxisMap(button.dataset.axisPreset.split(',')));
$('resetAxisMap').onclick=()=>setAxisMap(['x','y','z']);
$('compatibility').textContent=navigator.bluetooth&&window.isSecureContext?'Trình duyệt có Web Bluetooth. Giữ trang đang mở để nhận dữ liệu liên tục; hệ điều hành có thể tạm dừng khi khóa màn hình.':'Trình duyệt này chưa hỗ trợ Web Bluetooth. Hãy dùng Chrome trên Android hoặc Chrome/Edge trên máy tính. Bạn vẫn có thể trải nghiệm bản demo.';
if('serviceWorker' in navigator)window.addEventListener('load',()=>navigator.serviceWorker.register('/sw.js').catch(()=>log('Chưa thể lưu giao diện ngoại tuyến.')));
window.addEventListener('pagehide',()=>{if(state.device?.gatt.connected)state.device.gatt.disconnect();});
setInterval(()=>{renderValues();scheduleDraw();},1000);renderAxisSettings();renderMotionSettings();setMode('offline');log('Sẵn sàng kết nối cảm biến.');scheduleDraw();
