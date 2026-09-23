(() => {
  if (document.getElementById('ekt-assistant-host')) return;
  const appURL = chrome.runtime.getURL('widget.html?embedded=1');
  const ownOrigin = chrome.runtime.getURL('').replace(/\/$/, '');
  const host = document.createElement('div'); host.id = 'ekt-assistant-host';
  const root = host.attachShadow({ mode: 'closed' });
  const style = document.createElement('style');
  style.textContent = `
    :host{all:initial;position:fixed!important;inset:0!important;pointer-events:none;z-index:2147483647!important;font-family:Arial,sans-serif}
    *{box-sizing:border-box}button{font-family:Arial,sans-serif;cursor:pointer}button:focus-visible{outline:3px solid #f7b600;outline-offset:-3px}
    .launcher{pointer-events:auto;position:absolute;bottom:24px;right:24px;display:flex;align-items:center;gap:12px;border:0;border-radius:30px;padding:14px 21px;background:#2c7393;color:white;font-size:14px;font-weight:600;box-shadow:0 6px 28px #06426035}
    .launcher-mark{display:grid;place-items:center;width:29px;height:29px;background:#ffffff20;border:1px solid #ffffff65;border-radius:9px;font-size:16px}
    .panel{pointer-events:auto;position:absolute;display:flex;flex-direction:column;background:white;border:1px solid #c7dbe5;border-radius:14px;overflow:hidden;box-shadow:0 16px 65px #06426040}.panel[hidden]{display:none}
    .bar{height:72px;flex-shrink:0;display:flex;align-items:center;background:#2c7393;color:white;padding:0 12px 0 8px;gap:3px}
    .drag{display:flex;align-items:center;gap:10px;min-width:0;flex:1;align-self:stretch;text-align:left;background:transparent;color:inherit;border:0;padding:10px;cursor:grab;touch-action:none;user-select:none}.drag:active{cursor:grabbing}.drag strong{display:block;font-size:15px}.drag small{display:block;font-size:11px;opacity:.85;margin-top:4px;font-weight:400}.grip{font-size:22px;opacity:.7}
    .control{display:grid;place-items:center;width:36px;height:36px;flex-shrink:0;background:#ffffff14;border:0;border-radius:7px;color:white;font-size:22px}.control:hover{background:#ffffff30}
    .expand{width:auto;padding:0 10px;font-size:12px}.bar{cursor:grab;touch-action:none;user-select:none}.bar:active{cursor:grabbing}
    .resize-row{display:flex;align-items:center;justify-content:space-between;padding-left:14px;height:28px;flex-shrink:0;border-top:1px solid #e2ebef;background:#f7fafc;color:#738590;font-size:10px;user-select:none}
    .resize-handle{display:grid;place-items:center;width:40px;height:28px;border:0;background:#eaf2f6;color:#2c7393;font-size:21px;cursor:nwse-resize;touch-action:none}
    .resize-handle:hover,.resize-handle:focus-visible{background:#f7b600;color:#23343e}.panel.is-interacting iframe{pointer-events:none}
    iframe{display:block;width:100%;flex:1;min-height:0;border:0;background:white}
    .launcher,.control{transition:background-color 180ms ease,color 180ms ease,box-shadow 180ms ease,transform 120ms ease}
    .launcher:focus-visible,.control:focus-visible{background:#f7b600;color:#23343e;box-shadow:0 0 0 2px #f7b600,0 6px 24px #06426025}
    @media(hover:hover){.launcher:hover,.control:hover{background:#f7b600;color:#23343e;box-shadow:0 0 0 2px #f7b600,0 6px 24px #06426025}.launcher:hover{transform:translateY(-2px)}}
    .launcher:active,.control:active{transform:scale(.98)}
    .launcher-mark{transition:background-color 180ms ease,border-color 180ms ease}
    .launcher:hover .launcher-mark{background:#ffffff60;border-color:#ffffff80}
    .drag{border-radius:8px;transition:background-color 180ms ease}.drag:hover{background:#ffffff0d}
    @media(prefers-reduced-motion:reduce){.launcher,.control,.launcher-mark,.drag{transition:none}.launcher:hover,.launcher:active,.control:active{transform:none}}
    @media(max-width:480px){.launcher{right:16px;bottom:16px}.drag strong{font-size:13px}.drag small{font-size:10px}.bar{padding-right:8px}.grip{display:none}}
  `;
  function el(tag, cls, text){const node=document.createElement(tag);if(cls)node.className=cls;if(text)node.textContent=text;if(tag==='button')node.type='button';return node;}
  const launcher=el('button','launcher');const mark=el('span','launcher-mark','E');mark.setAttribute('aria-hidden','true');const label=el('span','','Консультант EKT');launcher.append(mark,label);launcher.setAttribute('aria-expanded','false');
  const panel=el('section','panel');panel.hidden=true;panel.setAttribute('aria-label','Консультант EKT');
  const bar=el('div','bar');const drag=el('button','drag');drag.setAttribute('aria-label','Переместить окно консультанта. Перетаскивайте мышью или используйте стрелки клавиатуры.');
  const grip=el('span','grip','⠿');grip.setAttribute('aria-hidden','true');const title=el('span');title.append(el('strong','','ИИ-консультант EKT'),el('small','','Потяните за панель, чтобы переместить'));drag.append(grip,title);
  const expand=el('button','control expand','⤢ Развернуть');expand.setAttribute('aria-label','Развернуть окно');const close=el('button','control','−');close.setAttribute('aria-label','Свернуть консультанта');
  const frame=el('iframe');frame.src=appURL;frame.title='EKT — помощник по электротехнике';
  const resizeRow=el('div','resize-row');resizeRow.append(el('span','','Размер окна — потяните за угол справа'));
  const resize=el('button','resize-handle','◢');resize.setAttribute('aria-label','Изменить размер окна: тяните за угол или используйте стрелки');resizeRow.append(resize);
  bar.append(drag,expand,close);panel.append(bar,frame,resizeRow);
  let x=null,y=null,large=false,width=0,height=0,gesture=null,customSize=null,restoreBounds=null;
  function layout(){
    width=Math.min(customSize?.width??560,Math.max(0,innerWidth-16));
    height=Math.min(customSize?.height??780,Math.max(0,innerHeight-(customSize?16:108)));
    if(x===null)x=innerWidth-width-24;if(y===null)y=innerHeight-height-92;
    x=Math.max(8,Math.min(x,innerWidth-width-8));y=Math.max(8,Math.min(y,innerHeight-height-8));
    Object.assign(panel.style,{width:`${width}px`,height:`${height}px`,left:`${x}px`,top:`${y}px`});
  }
  function updateExpand(){expand.setAttribute('aria-label',large?'Вернуть размер окна':'Развернуть окно');expand.textContent=large?'⤡ Восстановить':'⤢ Развернуть';}
  let opened=false,visibilityAnimation=null;
  function setOpen(open){
    opened=open;
    launcher.setAttribute('aria-expanded',String(open));
    label.textContent=open?'Свернуть консультанта':'Консультант EKT';
    const wasHidden=panel.hidden;
    const computed=getComputedStyle(panel);
    const from={opacity:wasHidden?'0':computed.opacity,transform:wasHidden?'translateY(12px) scale(.985)':computed.transform};
    visibilityAnimation?.cancel();visibilityAnimation=null;
    panel.inert=!open;
    if(open){panel.hidden=false;layout();}
    if(matchMedia('(prefers-reduced-motion: reduce)').matches){panel.hidden=!open;return;}
    if(wasHidden&&!open)return;
    visibilityAnimation=panel.animate([from,{opacity:open?1:0,transform:open?'translateY(0) scale(1)':'translateY(10px) scale(.985)'}],{duration:open?220:160,easing:'cubic-bezier(.2,.8,.2,1)'});
    visibilityAnimation.onfinish=()=>{panel.hidden=!opened;visibilityAnimation=null;};
  }
  launcher.onclick=()=>setOpen(!opened);close.onclick=()=>{setOpen(false);launcher.focus();};
  expand.onclick=()=>{
    if(!large){restoreBounds={x,y,customSize};customSize={width:Math.min(1100,innerWidth-32),height:innerHeight-32};x=(innerWidth-customSize.width)/2;y=16;large=true;}
    else{({x,y,customSize}=restoreBounds);large=false;restoreBounds=null;}
    updateExpand();layout();
  };
  function begin(event,kind,target){
    if(event.button!==0)return;
    if(kind==='move'&&event.target.closest('.control'))return;
    event.preventDefault();visibilityAnimation?.cancel();visibilityAnimation=null;layout();
    gesture={id:event.pointerId,kind,target,startX:event.clientX,startY:event.clientY,x,y,width,height};
    panel.classList.add('is-interacting');target.setPointerCapture(event.pointerId);
  }
  function move(event){
    if(!gesture||event.pointerId!==gesture.id)return;
    const dx=event.clientX-gesture.startX,dy=event.clientY-gesture.startY;
    if(gesture.kind==='move'){x=gesture.x+dx;y=gesture.y+dy;}
    else{
      customSize={width:Math.max(Math.min(340,innerWidth-gesture.x-8),Math.min(gesture.width+dx,innerWidth-gesture.x-8)),height:Math.max(Math.min(360,innerHeight-gesture.y-8),Math.min(gesture.height+dy,innerHeight-gesture.y-8))};
      large=false;restoreBounds=null;updateExpand();
    }
    layout();
  }
  function end(event){if(gesture?.id!==event.pointerId)return;const target=gesture.target;gesture=null;panel.classList.remove('is-interacting');if(target.hasPointerCapture(event.pointerId))target.releasePointerCapture(event.pointerId);}
  for(const [target,kind]of [[bar,'move'],[resize,'resize']]){
    target.onpointerdown=e=>begin(e,kind,target);target.onpointermove=move;target.onpointerup=end;target.onpointercancel=end;
    target.onlostpointercapture=()=>{gesture=null;panel.classList.remove('is-interacting');};
  }
  drag.onkeydown=event=>{const delta={ArrowLeft:[-24,0],ArrowRight:[24,0],ArrowUp:[0,-24],ArrowDown:[0,24]}[event.key];if(!delta)return;event.preventDefault();x+=delta[0];y+=delta[1];layout();};
  resize.onkeydown=event=>{const delta={ArrowLeft:[-24,0],ArrowRight:[24,0],ArrowUp:[0,-24],ArrowDown:[0,24]}[event.key];if(!delta)return;event.preventDefault();customSize={width:Math.max(340,width+delta[0]),height:Math.max(360,height+delta[1])};large=false;restoreBounds=null;updateExpand();layout();};
  window.addEventListener('resize',layout);window.addEventListener('message',event=>{if(event.source===frame.contentWindow&&event.origin===ownOrigin&&event.data?.type==='ekt-assistant-close')setOpen(false);});
  chrome.runtime.onMessage.addListener((message,sender,respond)=>{if(sender.id===chrome.runtime.id&&message?.type==='ekt-assistant-open'){setOpen(true);respond({opened:true});}});
  root.append(style,panel,launcher);document.documentElement.append(host);
})();
