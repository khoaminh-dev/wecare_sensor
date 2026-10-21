const assert=require('node:assert/strict');
const {chromium}=require('playwright');

(async()=>{
  const browser=await chromium.launch({headless:true,args:['--no-sandbox']});
  const context=await browser.newContext({viewport:{width:390,height:844},permissions:['notifications'],acceptDownloads:true});
  const page=await context.newPage(),errors=[];
  page.on('pageerror',error=>errors.push(error.message));
  await page.goto('http://localhost:3000',{waitUntil:'networkidle'});
  await page.evaluate(()=>localStorage.clear());
  await page.reload({waitUntil:'networkidle'});
  await page.click('#begin');

  await page.click('.bottom-nav [data-page=tests]');
  assert.equal(await page.locator('.test-card').count(),6);
  await page.click('[data-test-id="tap"]');
  await page.click('#runnerStart');
  for(let index=0;index<20;index++)await page.click('#runnerTap');
  await page.evaluate(()=>{careActiveTest.started=Date.now()-16000;careTickTest()});
  await page.waitForSelector('#runnerDone');
  assert.match(await page.locator('.runner-score strong').innerText(),/^\d+$/);
  await page.click('#runnerCloseResult');
  assert.equal(await page.locator('#testProgressCount').innerText(),'1');

  for(const testId of ['rest','posture','alternate','stand','walk']){
    await page.click(`[data-test-id="${testId}"]`);
    if(await page.locator('#runnerDemo').count())await page.click('#runnerDemo');
    else await page.click('#runnerStart');
    if(['rest','posture','walk'].includes(testId))await page.waitForTimeout(1300);
    if(testId==='alternate')for(let index=0;index<16;index++)await page.click(index%2?'[data-side="right"]':'[data-side="left"]');
    if(testId==='stand')for(let index=0;index<8;index++)await page.click('#runnerTap');
    await page.evaluate(()=>{careActiveTest.started=Date.now()-(careActiveTest.test.duration+1)*1000;careTickTest()});
    await page.waitForSelector('#runnerDone');
    assert.match(await page.locator('.runner-score strong').innerText(),/^\d+$/);
    await page.click('#runnerCloseResult');
  }
  assert.equal(await page.locator('#testProgressCount').innerText(),'6');
  assert.equal(await page.evaluate(()=>JSON.parse(localStorage.getItem('wecare-motor-records')).length),6);

  await page.click('.bottom-nav [data-page=profile]');
  await page.fill('#authPhone','0901234567');
  await page.click('#requestCodeForm button[type=submit]');
  const code=(await page.locator('#demoOtp').innerText()).match(/\d{6}/)[0];
  await page.fill('#authCode',code);
  await page.click('#verifyCodeForm button[type=submit]');
  assert.equal(await page.locator('#profileStatus').innerText(),'ĐÃ XÁC THỰC');
  assert.equal(await page.locator('#profileTestTotal').innerText(),'6');
  const profileDownload=page.waitForEvent('download');
  await page.click('#exportProfile');
  const profileFile=await profileDownload;
  assert.match(profileFile.suggestedFilename(),/wecare-ho-so.*\.json/);

  await page.click('.bottom-nav [data-page=medication]');
  await page.click('#addMedication');
  await page.fill('#medicationName','Levodopa');
  await page.fill('#medicationDose','1 viên sau ăn');
  await page.fill('#medicationTime','08:00');
  await page.click('#medicationForm button[type=submit]');
  assert.equal(await page.locator('.med-item').count(),1);
  await page.click('[data-med-taken]');
  assert.match(await page.locator('[data-med-taken]').innerText(),/Đã uống/);
  await page.evaluate(()=>{const now=new Date();careMedications[0].time=`${String(now.getHours()).padStart(2,'0')}:${String(now.getMinutes()).padStart(2,'0')}`;careMedications[0].days=[now.getDay()];careMedications[0].lastNotified=null;careCheckMedicationReminders();});
  assert.match(await page.locator('#toast').innerText(),/Đến giờ uống thuốc/);
  await page.reload({waitUntil:'networkidle'});
  assert.equal(await page.locator('.med-item').count(),1);

  for(const width of [320,390,768,820,1024,1440,1920]){
    await page.setViewportSize({width,height:900});
    for(const section of ['tests','medication','profile']){
      await page.goto(`http://localhost:3000/#${section}`,{waitUntil:'networkidle'});
      const dimensions=await page.evaluate(()=>({scrollWidth:document.documentElement.scrollWidth,innerWidth}));
      assert.equal(dimensions.scrollWidth<=dimensions.innerWidth,true,`${section} overflows at ${width}px`);
    }
  }
  await page.setViewportSize({width:390,height:844});
  await page.goto('http://localhost:3000/#profile',{waitUntil:'networkidle'});
  await page.waitForTimeout(500);
  await page.screenshot({path:'test-results/profile-mobile.png',fullPage:true});
  await page.goto('http://localhost:3000/#tests',{waitUntil:'networkidle'});
  await page.waitForTimeout(500);
  await page.screenshot({path:'test-results/tests-mobile.png',fullPage:true});
  await page.setViewportSize({width:1440,height:950});
  await page.goto('http://localhost:3000/#medication',{waitUntil:'networkidle'});
  await page.waitForTimeout(500);
  await page.screenshot({path:'test-results/medication-desktop.png',fullPage:true});
  assert.deepEqual(errors,[]);
  console.log('PASS: six motor tests, saved profile, local verification code, medication schedule, taken state, responsive widths, no page errors.');
  await browser.close();
})().catch(error=>{console.error(error);process.exit(1)});
