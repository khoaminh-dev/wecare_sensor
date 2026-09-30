'use strict';
const UUID={service:'37af0000-39a2-4fce-9c60-01ee00000000',bpm:'37af0001-39a2-4fce-9c60-01ee00000000',accel:'37af0002-39a2-4fce-9c60-01ee00000000',ir:'37af0003-39a2-4fce-9c60-01ee00000000'};
const $=id=>document.getElementById(id),decoder=new TextDecoder();
const state={mode:'offline',source:null,device:null,bindings:[],epoch:0,timer:null,started:0,bpm:null,accel:null,ir:null,last:{bpm:0,accel:0,ir:0},samples:{bpm:[],accel:[],ir:[]},records:[],chart:'bpm',drawPending:false,wake:null,install:null};
const navigation=[['home','home','Tổng quan'],['trends','chart','Biểu đồ'],['device','device','Thiết bị'],['settings','settings','Cài đặt']];
for(const nav of document.querySelectorAll('.side-nav,.bottom-nav'))nav.innerHTML=navigation.map(([id,icon,title])=>`<a class="nav-item" href="#${id}" data-page="${id}"><svg><use href="#i-${icon}"/></svg><span>${title}</span></a>`).join('');
function storageGet(key){try{return localStorage.getItem(key)}catch{return null}}
function storageSet(key,val){try{localStorage.setItem(key,val)}catch{}}
function openApp(){ $('welcome').hidden=true;$('app').hidden=false;storageSet('wecare-welcome','seen');route(); }
function route(){let page=location.hash.slice(1);if(!navigation.some(n=>n[0]===page))page='home';document.querySelectorAll('.page').forEach(el=>{el.hidden=el.id!==page;el.classList.toggle('active',el.id===page)});document.querySelectorAll('a.nav-item').forEach(el=>{let active=el.dataset.page===page;el.classList.toggle('active',active);if(active)el.setAttribute('aria-current','page');else el.removeAttribute('aria-current')});scheduleDraw();window.scrollTo({top:0,behavior:'instant'});}
window.addEventListener('hashchange',route);
document.querySelectorAll('button[data-page]').forEach(el=>el.onclick=()=>{location.hash=el.dataset.page});
$('begin').onclick=$('skip').onclick=openApp;
if(storageGet('wecare-welcome')==='seen')openApp();
$('today').textContent=new Intl.DateTimeFormat('vi-VN',{weekday:'long',day:'numeric',month:'long'}).format(new Date()).toLocaleUpperCase('vi-VN');
function log(message){const row=document.createElement('div'),time=document.createElement('time');time.textContent=new Date().toLocaleTimeString('vi-VN');row.append(time,document.createTextNode(message));$('logs').prepend(row);while($('logs').children.length>35)$('logs').lastChild.remove();}
let toastTimeout;
function toast(message){$('toast').textContent=message;$('toast').hidden=false;clearTimeout(toastTimeout);toastTimeout=setTimeout(()=>$('toast').hidden=true,4200);}
function notice(message=''){ $('notice').textContent=message;$('notice').hidden=!message; }
function showDialog(html){$('dialogContent').innerHTML=html;$('dialog').showModal();}
document.querySelectorAll('.dialog-close').forEach(b=>b.onclick=()=>$('dialog').close());
$('dialog').addEventListener('click',e=>{if(e.target===$('dialog')){const r=$('dialog').getBoundingClientRect();if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)$('dialog').close();}});
function setMode(mode){state.mode=mode;const text={offline:'Chưa kết nối',connecting:'Đang kết nối',connected:'Đã kết nối',demo:'Chế độ demo'}[mode];$('statusBadge').innerHTML='<i></i>'+text;$('statusBadge').className='badge '+(mode==='connected'?'online':mode==='demo'?'demo':'');$('deviceBadge').textContent=text;$('deviceBadge').className=$('statusBadge').className;$('demoBanner').hidden=mode!=='demo';for(const button of document.querySelectorAll('.connect-action')){button.disabled=mode==='connecting';button.querySelector('span').textContent=mode==='connected'?'Ngắt kết nối':mode==='connecting'?'Đang kết nối…':'Kết nối thiết bị';}$('heroText').innerHTML=mode==='connected'?'Cảm biến đã sẵn sàng.<br>Cùng lắng nghe cơ thể bạn.':mode==='demo'?'Bạn đang khám phá bản demo.<br>Tất cả số đo đều được mô phỏng.':'Kết nối cảm biến để bắt đầu<br>lắng nghe nhịp điệu của bạn.';$('demoHome').hidden=mode==='connected'||mode==='connecting'||mode==='demo';$('demoDevice').hidden=mode==='connected'||mode==='connecting';syncWake();renderValues();}
function resetData(){state.bpm=state.accel=state.ir=null;state.last={bpm:0,accel:0,ir:0};state.samples={bpm:[],accel:[],ir:[]};state.records=[];$('sensor3d').style.transform='rotateX(40deg) rotateZ(-30deg)';renderValues();scheduleDraw();}
function fresh(type,now=Date.now()){return (state.mode==='demo'||state.mode==='connected'||state.mode==='connecting')&&!!state.last[type]&&now-state.last[type]<3500;}
function fmt(n,digits=2){return Number.isFinite(n)?n.toFixed(digits):'--';}
function renderValues(){const validB=fresh('bpm'),validA=fresh('accel'),validI=fresh('ir');$('bpm').textContent=validB&&state.bpm!==null?state.bpm:'--';$('bpmNote').textContent=validB&&state.bpm!==null?'Đã nhận số đo':'Chưa có số đo';$('heartHint').textContent=state.last.bpm&&!validB?'Tín hiệu gián đoạn':validB&&state.bpm!==null?'Nhịp tim từ cảm biến':'Đặt ngón tay nhẹ lên cảm biến';const acc=validA?state.accel:null;['ax','ay','az'].forEach((id,i)=>$(id).textContent=fmt(acc?.[i]));const mag=acc?Math.hypot(...acc):null;$('magnitude').textContent=fmt(mag);$('gravity').textContent=fmt(mag===null?null:mag/9.80665)+' g';if(acc){const [x,y,z]=acc,pitch=Math.atan2(x,Math.hypot(y,z))*180/Math.PI,roll=Math.atan2(-y,z)*180/Math.PI;$('pitch').textContent=fmt(pitch,1)+'°';$('roll').textContent=fmt(roll,1)+'°';$('sensor3d').style.transform=`rotateX(${40+Math.max(-60,Math.min(60,roll))*.55}deg) rotateY(${pitch*.6}deg) rotateZ(-30deg)`;}else{$('pitch').textContent=$('roll').textContent='--°';}$('sensor3d').classList.toggle('stale',!validA);$('ir').textContent=validI&&state.ir!==null?state.ir.toLocaleString('vi-VN'):'--';$('irHint').textContent=state.last.ir&&!validI?'Tín hiệu gián đoạn':validI?'Cường độ ánh sáng phản xạ · IR raw':'Tín hiệu quang học từ MAX30102';const recent=state.samples.accel.slice(-12).filter(p=>p.v!==null).map(p=>Math.hypot(...p.v));$('motionHint').textContent=!validA?'Đang chờ cảm biến':recent.length>1&&Math.max(...recent)-Math.min(...recent)>2?'Gia tốc đang biến thiên':'Gia tốc biến thiên thấp';const last=Math.max(...Object.values(state.last));$('updated').textContent=last&&Date.now()-last<3500&&(state.mode==='demo'||state.mode==='connected')?(state.mode==='demo'?'Mô phỏng · ':'')+'Vừa cập nhật':state.mode==='connected'?'Đang chờ tín hiệu':'Chờ kết nối';$('recordCount').textContent=state.records.length.toLocaleString('vi-VN');$('sourceLabel').textContent=state.source==='SIMULATED'?'DEMO · Dữ liệu mô phỏng':state.source==='BLE'?'Bluetooth · Cảm biến thật':'Chưa có dữ liệu';}
function parsePayload(type,text){const s=text.trim();if(type==='accel'){const a=s.split(',');if(a.length!==3||a.some(x=>!/^[-+]?(?:\d+\.?\d*|\.\d+)$/.test(x.trim())))return undefined;const v=a.map(Number);return v.every(x=>Number.isFinite(x)&&Math.abs(x)<=100)?v:undefined;}if(!/^[-+]?\d+$/.test(s))return undefined;const n=Number(s);if(!Number.isSafeInteger(n))return undefined;if(type==='bpm')return n===-1?null:(n>=0&&n<=300?n:undefined);return n>=0&&n<=10000000?n:undefined;}
function ingest(type,text,ts=Date.now()){const value=parsePayload(type,text);if(value===undefined){if(type==='accel'&&text.trim()==='ERR'){state.accel=null;state.last.accel=0;renderValues();}return false;}state[type]=value;state.last[type]=ts;const arr=state.samples[type];arr.push({ts,v:value});while(arr.length&&arr[0].ts<ts-65000)arr.shift();if(arr.length>1200)arr.shift();const row={ts,source:state.source,type,bpm:fresh('bpm',ts)?state.bpm:null,ir:fresh('ir',ts)?state.ir:null,accel:fresh('accel',ts)?state.accel:null};state.records.push(row);if(state.records.length>50000)state.records.shift();renderValues();scheduleDraw();return true;}
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
const server=await chosen.gatt.connect();
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
function startDemo(){if(state.mode==='connected'||state.mode==='connecting'){toast('Hãy ngắt cảm biến trước khi thử demo.');return;}if(state.timer)return;notice();resetData();state.source='SIMULATED';state.started=Date.now();setMode('demo');let step=0;const tick=()=>{step++;const t=step/10;ingest('accel',`${(Math.sin(t)*.9).toFixed(2)},${(Math.cos(t*.8)*.5).toFixed(2)},${(9.78+Math.sin(t*1.6)*.22).toFixed(2)}`);if(step===1||step%5===0){ingest('bpm',String(Math.round(76+Math.sin(t*.3)*4)));ingest('ir',String(Math.round(85320+Math.sin(t*1.4)*2300)));}};tick();state.timer=setInterval(tick,100);log('Bắt đầu DEMO. Số đo được mô phỏng, không phải dữ liệu thật.');}
function stopDemo(){clearInterval(state.timer);state.timer=null;setMode('offline');toast('Đã dừng demo. Dữ liệu vẫn có thể xuất CSV.');log('Dừng DEMO.');}
$('demoHome').onclick=$('demoDevice').onclick=startDemo;$('stopDemo').onclick=stopDemo;
function exportCSV(){if(!state.records.length){toast('Chưa có dữ liệu. Hãy kết nối cảm biến hoặc mở demo.');return;}const rows=state.records.map(r=>[new Date(r.ts).toISOString(),r.source,r.type,r.bpm??'',r.ir??'',...(r.accel||['','','']),r.accel?Math.hypot(...r.accel).toFixed(4):''].join(','));const blob=new Blob(['\uFEFFtimestamp_iso,source,event,bpm,ir_raw,ax_mps2,ay_mps2,az_mps2,magnitude_mps2\r\n',rows.join('\r\n')],{type:'text/csv;charset=utf-8'});const url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=`wecare_${state.source==='SIMULATED'?'DEMO_':''}${new Date().toISOString().replace(/[:.]/g,'-')}.csv`;a.click();setTimeout(()=>URL.revokeObjectURL(url),3000);toast('Đã xuất dữ liệu phiên đo.');}
document.querySelectorAll('.export-action').forEach(b=>b.onclick=exportCSV);
function drawChart(id,type,mini=false){const canvas=$(id);if(!canvas.offsetWidth)return;const r=canvas.getBoundingClientRect(),dpr=Math.min(devicePixelRatio||1,2),w=r.width,h=r.height;canvas.width=Math.round(w*dpr);canvas.height=Math.round(h*dpr);const ctx=canvas.getContext('2d');ctx.scale(dpr,dpr);const end=Date.now(),start=end-60000,points=state.samples[type].filter(p=>p.ts>=start);const values=points.filter(p=>p.v!==null).flatMap(p=>Array.isArray(p.v)?p.v:[p.v]);let min=values.length?Math.min(...values):0,max=values.length?Math.max(...values):100;const pad=Math.max((max-min)*.2,type==='bpm'?3:type==='ir'?100:.4);min-=pad;max+=pad;const l=mini?1:40,rr=w-(mini?1:10),t=mini?4:14,b=h-(mini?3:26);ctx.lineWidth=1;if(!mini){ctx.font='9px sans-serif';ctx.fillStyle='#96a58c';for(let i=0;i<4;i++){const y=t+(b-t)*i/3;ctx.strokeStyle='#edf1e8';ctx.beginPath();ctx.moveTo(l,y);ctx.lineTo(rr,y);ctx.stroke();ctx.textAlign='right';const n=max-(max-min)*i/3;ctx.fillText(type==='ir'?(n/1000).toFixed(1)+'k':n.toFixed(type==='bpm'?0:1),l-7,y+3);}ctx.textAlign='center';for(let i=0;i<5;i++)ctx.fillText(i===4?'Bây giờ':`−${60-i*15}s`,l+(rr-l)*i/4,b+20);}
if(!points.length){ctx.fillStyle='#aeb9a2';ctx.font=(mini?'8':'11')+'px sans-serif';ctx.textAlign='center';ctx.fillText(mini?'Chờ dữ liệu':'Kết nối cảm biến để xem biểu đồ',w/2,(t+b)/2);return;}const colors=type==='accel'?['#599a72','#c4a36e','#9b8ab7']:[type==='bpm'?'#7baf82':'#bbac75'];colors.forEach((color,axis)=>{ctx.beginPath();let prev=null;points.forEach(p=>{if(p.v===null){prev=null;return;}const v=Array.isArray(p.v)?p.v[axis]:p.v,x=l+(p.ts-start)/60000*(rr-l),y=b-(v-min)/(max-min)*(b-t);if(!prev||p.ts-prev.ts>1500)ctx.moveTo(x,y);else ctx.lineTo(x,y);prev=p;});ctx.lineWidth=mini?1.7:2;ctx.strokeStyle=color;ctx.lineJoin='round';ctx.lineCap='round';ctx.stroke();const last=points[points.length-1];if(last.v!==null&&fresh(type)){const v=Array.isArray(last.v)?last.v[axis]:last.v;ctx.beginPath();ctx.arc(l+(last.ts-start)/60000*(rr-l),b-(v-min)/(max-min)*(b-t),mini?2:3,0,Math.PI*2);ctx.fillStyle=color;ctx.fill();}});}
function renderStats(){const arr=state.samples[state.chart].filter(p=>p.ts>=Date.now()-60000&&p.v!==null).map(p=>Array.isArray(p.v)?Math.hypot(...p.v):p.v);const digits=state.chart==='accel'?2:0;$('statMin').textContent=arr.length?fmt(Math.min(...arr),digits):'--';$('statMax').textContent=arr.length?fmt(Math.max(...arr),digits):'--';$('statAvg').textContent=arr.length?fmt(arr.reduce((a,b)=>a+b,0)/arr.length,digits):'--';$('statLabel').textContent='Thống kê 60 giây gần nhất · '+{bpm:'BPM',accel:'Độ lớn gia tốc (m/s²)',ir:'IR raw'}[state.chart];}
function scheduleDraw(){if(state.drawPending)return;state.drawPending=true;requestAnimationFrame(()=>{state.drawPending=false;drawChart('bpmMini','bpm',true);drawChart('irMini','ir',true);drawChart('detailChart',state.chart);renderStats();});}
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
$('compatibility').textContent=navigator.bluetooth&&window.isSecureContext?'Trình duyệt có Web Bluetooth. Giữ trang đang mở để nhận dữ liệu liên tục; hệ điều hành có thể tạm dừng khi khóa màn hình.':'Trình duyệt này chưa hỗ trợ Web Bluetooth. Hãy dùng Chrome trên Android hoặc Chrome/Edge trên máy tính. Bạn vẫn có thể trải nghiệm bản demo.';
if('serviceWorker' in navigator)window.addEventListener('load',()=>navigator.serviceWorker.register('/sw.js').catch(()=>log('Chưa thể lưu giao diện ngoại tuyến.')));
window.addEventListener('pagehide',()=>{if(state.device?.gatt.connected)state.device.gatt.disconnect();});
setInterval(()=>{renderValues();scheduleDraw();},1000);setMode('offline');log('Sẵn sàng kết nối cảm biến.');scheduleDraw();
