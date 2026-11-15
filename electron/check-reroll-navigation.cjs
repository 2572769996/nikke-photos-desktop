const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const delay=ms=>new Promise(r=>setTimeout(r,ms));
module.exports=async({window:win,frame,cacheRoot})=>{
 const web=win.webContents,js=s=>frame.executeJavaScript(s);
 win.show();win.focus();web.focus();
 assert.equal(await js("!!document.querySelector('.expectation-outline')"),false);
 for(const width of [null,650,390]) {
  await web.executeJavaScript(`document.querySelector('#panel-equipment-reroll iframe').style.width=${JSON.stringify(width?width+'px':'100%')}`);await delay(120);
  const layout=await js("(()=>{const header=document.querySelector('.topbar').getBoundingClientRect(),body=document.querySelector('#app').getBoundingClientRect();return {gutter:getComputedStyle(document.querySelector('#calculator-panel')).paddingLeft,overflow:document.documentElement.scrollWidth>innerWidth,aligned:Math.abs(header.left-body.left)<2&&Math.abs(header.right-body.right)<2}})()");
  assert.deepEqual(layout,{gutter:'0px',overflow:false,aligned:true});
  fs.writeFileSync(path.join(cacheRoot,`calculator-card-${width||'wide'}.png`),(await web.capturePage()).toPNG());
 }
 await web.executeJavaScript("document.querySelector('#panel-equipment-reroll iframe').style.width='100%'");
 return {removedFloatingOutline:true,noLeftGutter:true,headerBodyAligned:true,wideAndNarrowNoOverflow:true};
};
