// Runs the actual application BLE functions with a minimal transport/UI harness.
const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const source=fs.readFileSync('public/app.js','utf8');
const names=['fresh','parsePayload','ingest','cleanupBindings','disconnect','onDisconnected'];
const connectStart=source.indexOf('async function connectSensor(){'),connectEnd=source.indexOf("\ndocument.querySelectorAll('.connect-action')",connectStart);
const functions=names.map(name=>source.split('\n').find(line=>line.startsWith(`function ${name}(`))).join('\n')+'\n'+source.slice(connectStart,connectEnd);
const controls={};const context={Date,Math,Number,String,TextDecoder,Uint8Array,Event,EventTarget,console,setTimeout,clearTimeout};vm.createContext(context);
vm.runInContext(source.split('\n').slice(1,4).join('\n')+'\n'+`
const document={getElementById:id=>(controls[id]??={})};
const window={isSecureContext:true};const navigator={};const location={hash:''};const controls={};
function renderValues(){}function scheduleDraw(){}function log(){}function notice(message=''){controls.notice=message}function toast(){}function setMode(mode){state.mode=mode}function stopDemo(){}function resetData(){state.bpm=state.ir=state.accel=null;state.last={bpm:0,accel:0,ir:0};state.records=[];state.samples={bpm:[],accel:[],ir:[]};}
`+functions,context);
const run=code=>vm.runInContext(code,context);
(async()=>{
assert.equal(run("parsePayload('bpm','-1')"),null);
for(const s of ['', ' ', 'NaN', '12x', '301','1.1'])assert.equal(run(`parsePayload('bpm',${JSON.stringify(s)})`),undefined);
for(const s of [',1,2','1,,2','1,2','1,2,1000','ERR'])assert.equal(run(`parsePayload('accel',${JSON.stringify(s)})`),undefined);
run(`state.mode='connected';state.source='BLE';`);
assert.equal(run("ingest('bpm','78')"),true);
assert.equal(run("ingest('accel','0.12,-0.35,9.76')"),true);
assert.equal(run('state.accel[2]'),9.76);
run("ingest('ir','85432')");assert.equal(run('state.records.length'),3);
run("state.last.bpm=Date.now()-5000;ingest('ir','85500')");assert.equal(run('state.records.at(-1).bpm'),null);
run("ingest('accel','ERR')");assert.equal(run('state.accel'),null);
run(`const chars={};for(let i=1;i<=3;i++){const c=new EventTarget();c.startNotifications=async()=>c;c.readValue=async()=>new DataView(new TextEncoder().encode(i===1?'78':i===2?'0.12,-0.35,9.76':'85432').buffer);chars[UUID[['bpm','accel','ir'][i-1]]]=c;}
const d=new EventTarget();d.name='VieGrand-Sensor';const connectOk=async()=>{d.gatt.connected=true;return{getPrimaryService:async()=>({getCharacteristic:async id=>chars[id]})}};d.gatt={connected:false,connect:connectOk,disconnect:()=>{d.gatt.connected=false;d.dispatchEvent(new Event('gattserverdisconnected'));}};controls.connectOk=connectOk;
navigator.bluetooth={requestDevice:async options=>{controls.options=options;return d}};state.mode='offline';`);
// Provide host encoders used by the GATT double only.
context.TextEncoder=TextEncoder;context.DataView=DataView;
await run('connectSensor()');assert.equal(run('state.mode'),'connected');assert.equal(run('state.bpm'),78);assert.equal(run('state.bindings.length'),3);assert.equal(run('controls.options.optionalServices[0]'),'37af0000-39a2-4fce-9c60-01ee00000000');
run(`chars[UUID.bpm].value=new DataView(new TextEncoder().encode('-1').buffer);chars[UUID.bpm].dispatchEvent(new Event('characteristicvaluechanged'));`);assert.equal(run('state.bpm'),null);
run('d.gatt.disconnect()');assert.equal(run('state.mode'),'offline');assert.equal(run('state.bindings.length'),0);assert.equal(run("fresh('accel')"),false);
await run('connectSensor()');assert.equal(run('state.mode'),'connected');run('disconnect()');assert.equal(run('d.gatt.connected'),false);
run(`let transientAttempts=0;d.gatt.connect=async()=>{transientAttempts++;if(transientAttempts<3)throw Error('Connection attempt failed');return controls.connectOk()}`);await run('connectSensor()');assert.equal(run('state.mode'),'connected');assert.equal(run('transientAttempts'),3);run('disconnect()');run('d.gatt.connect=controls.connectOk');
run(`chars[UUID.accel].startNotifications=async()=>{throw Error('subscription failed')}`);await run('connectSensor()');assert.equal(run('state.mode'),'connected');assert.equal(run('d.gatt.connected'),true);assert.equal(run('state.bindings.length'),2);assert.match(run('controls.notice'),/gia tốc/);run('disconnect()');
run(`chars[UUID.bpm].startNotifications=chars[UUID.ir].startNotifications=async()=>{throw Error('subscription failed')}`);await run('connectSensor()');assert.equal(run('state.mode'),'offline');assert.equal(run('d.gatt.connected'),false);assert.equal(run('state.bindings.length'),0);assert.match(run('controls.notice'),/Không có kênh dữ liệu tương thích/);
console.log('PASS: BLE UUIDs; payload validation; BPM -1; fresh/stale CSV values; ERR IMU; reads; notifications; disconnect/reconnect; transient GATT retry; partial channel support; total subscription failure cleanup.');
})().catch(e=>{console.error(e);process.exit(1)});
