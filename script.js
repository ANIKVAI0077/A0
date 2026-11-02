/* SyncBridge — session-only peer-to-peer chat.
   Signaling: PeerJS public cloud. Payloads: WebRTC data channel.
   No message/file database or persistent chat history. */
(() => {
  'use strict';
  const $ = id => document.getElementById(id);
  const required = ['year','facebookLink','pcChoice','mobileChoice','nextBtn','deviceSection','connectSection','connectTitle','pcConnect','mobileConnect','qrCode','pairCode','pcWaitingText','backBtn','startScanBtn','reader','scannerPlaceholder','manualCode','matchBtn','transferSection','disconnectBtn','sendTextBtn','messageInput','fileInput','fileQueue','incomingList','incomingCount','toast','headerStatus'];
  if (required.some(id => !$(id))) { console.error('SyncBridge: required page element missing'); return; }

  const state = { role:null, peer:null, conn:null, scanner:null, chunks:new Map(), ackWaiters:new Map(), closing:false, historyCount:0 };
  const CHUNK = 32 * 1024;
  let toastTimer;
  const toast = msg => { $('toast').textContent=msg; $('toast').classList.add('show'); clearTimeout(toastTimer); toastTimer=setTimeout(()=>$('toast').classList.remove('show'),3200); };
  const show = (id,on=true) => $(id).classList.toggle('hidden',!on);
  const status = msg => $('headerStatus').textContent=msg;
  const code8 = () => { const a=new Uint8Array(8); crypto.getRandomValues(a); return [...a].map(v=>(v%36).toString(36)).join('').toUpperCase(); };
  const fmt = n => n<1024?`${n} B`:n<1048576?`${(n/1024).toFixed(1)} KB`:`${(n/1048576).toFixed(1)} MB`;
  const clock = () => new Date().toLocaleTimeString('bn-BD',{hour:'2-digit',minute:'2-digit'});
  $('year').textContent=new Date().getFullYear();

  function choose(role) {
    state.role=role;
    $('pcChoice').classList.toggle('selected',role==='pc');
    $('mobileChoice').classList.toggle('selected',role==='mobile');
    $('pcChoice').setAttribute('aria-pressed',String(role==='pc'));
    $('mobileChoice').setAttribute('aria-pressed',String(role==='mobile'));
    $('nextBtn').disabled=!role;
  }
  $('pcChoice').addEventListener('click',()=>choose('pc'));
  $('mobileChoice').addEventListener('click',()=>choose('mobile'));
  $('nextBtn').addEventListener('click',async()=>{
    if(!state.role)return;
    show('deviceSection',false);show('connectSection',true);
    if(state.role==='pc')await setupPC();else setupMobile();
  });
  $('backBtn').addEventListener('click',async()=>{await cleanup();show('connectSection',false);show('deviceSection',true);});
  $('startScanBtn').addEventListener('click',startScanner);
  $('matchBtn').addEventListener('click',()=>connectWithCode($('manualCode').value));
  $('manualCode').addEventListener('keydown',e=>{if(e.key==='Enter')connectWithCode($('manualCode').value);});
  $('disconnectBtn').addEventListener('click',async()=>{await cleanup();show('transferSection',false);show('connectSection',false);show('deviceSection',true);choose(null);status('Ready to connect');toast('সেশন শেষ হয়েছে।');});
  $('sendTextBtn').addEventListener('click',sendText);
  $('messageInput').addEventListener('keydown',e=>{if(e.key==='Enter'&&!e.shiftKey){e.preventDefault();sendText();}});
  $('fileInput').addEventListener('change',e=>{sendFiles([...e.target.files]);e.target.value='';});
  $('facebookLink').href='https://www.facebook.com/'; // Replace with your profile URL.

  function makePeer(id) {
    return new Promise((resolve,reject)=>{
      if(!window.Peer)return reject(new Error('PeerJS লোড হয়নি। ইন্টারনেট সংযোগ পরীক্ষা করুন।'));
      const peer=new Peer(id||undefined,{debug:0});
      let settled=false;
      const timer=setTimeout(()=>{if(!settled){settled=true;peer.destroy();reject(new Error('Signaling সার্ভারে সংযোগ হচ্ছে না। কিছুক্ষণ পরে চেষ্টা করুন।'));}},20000);
      peer.once('open',()=>{if(settled)return;settled=true;clearTimeout(timer);resolve(peer);});
      peer.on('error',err=>{if(!settled){settled=true;clearTimeout(timer);reject(err);}});
    });
  }
  async function setupPC() {
    $('connectTitle').textContent='PC সংযোগ প্রস্তুত';
    show('pcConnect',true);show('mobileConnect',false);$('qrCode').replaceChildren();$('pairCode').textContent='তৈরি হচ্ছে...';
    try {
      const code=code8();
      state.peer=await makePeer('syncbridge-'+code.toLowerCase());
      $('pairCode').textContent=code;
      const url=new URL(location.href);url.searchParams.set('join',code);
      if(!window.QRCode)throw new Error('QR লাইব্রেরি লোড হয়নি। পেজটি আবার খুলুন।');
      new QRCode($('qrCode'),{text:url.toString(),width:176,height:176,colorDark:'#101b31',colorLight:'#ffffff',correctLevel:QRCode.CorrectLevel.M});
      $('pcWaitingText').textContent='মোবাইলের জন্য অপেক্ষা করা হচ্ছে...';
      state.peer.on('connection',conn=>{if(state.conn&&state.conn.open){conn.close();return;} bindConnection(conn);});
      state.peer.on('disconnected',()=>{if(state.peer&&!state.peer.destroyed)state.peer.reconnect();});
      state.peer.on('error',err=>toast('সংযোগ সমস্যা: '+(err.type||err.message)));
    } catch(err){toast(err.message||'PC সংযোগ তৈরি করা যায়নি।');}
  }
  function setupMobile() {
    $('connectTitle').textContent='মোবাইল সংযোগ';
    show('mobileConnect',true);show('pcConnect',false);
    const join=new URLSearchParams(location.search).get('join');
    if(join){$('manualCode').value=join.toUpperCase();toast('QR কোড পাওয়া গেছে। Match চাপুন অথবা স্ক্যান করুন।');}
  }
  async function startScanner() {
    if(!window.Html5Qrcode)return toast('QR Scanner লোড হয়নি।');
    try {
      $('scannerPlaceholder').classList.add('hidden');
      state.scanner=new Html5Qrcode('reader');
      await state.scanner.start({facingMode:'environment'},{fps:10,qrbox:{width:220,height:220}},async decoded=>{
        try{await state.scanner.stop();state.scanner.clear();}catch(e){}
        state.scanner=null;
        let code='';try{code=new URL(decoded).searchParams.get('join')||'';}catch(e){}
        if(!code)code=decoded.trim();
        $('manualCode').value=code.toUpperCase();
        await connectWithCode(code);
      },()=>{});
      $('startScanBtn').textContent='স্ক্যানার চালু আছে';
    } catch(err){$('scannerPlaceholder').classList.remove('hidden');toast('ক্যামেরা চালু হয়নি। HTTPS ও Camera permission পরীক্ষা করুন।');}
  }
  async function connectWithCode(raw) {
    const code=(raw||'').trim().toUpperCase().replace(/[^A-Z0-9]/g,'');
    if(code.length!==8)return toast('৮ অক্ষরের সঠিক কানেকশন কোড দিন।');
    if(state.conn&&state.conn.open)return toast('ইতিমধ্যে সংযুক্ত আছেন।');
    $('matchBtn').disabled=true;
    try {
      state.peer=await makePeer();
      const conn=state.peer.connect('syncbridge-'+code.toLowerCase(),{reliable:true,serialization:'binary'});
      bindConnection(conn);
      const timeout=setTimeout(()=>{if(!conn.open)toast('PC পাওয়া যায়নি। PC-এর QR/কোড ও ইন্টারনেট পরীক্ষা করুন।');},18000);
      conn.on('open',()=>clearTimeout(timeout));
      conn.on('close',()=>clearTimeout(timeout));
    } catch(err){toast(err.message||'সংযোগ করা যায়নি।');}
    finally{$('matchBtn').disabled=false;}
  }
  function bindConnection(conn) {
    state.conn=conn;
    let shown=false;
    const reveal=()=>{
      if(shown||state.conn!==conn||!conn.open)return;
      shown=true;
      show('deviceSection',false);show('connectSection',false);show('transferSection',true);
      status('Device connected');
      toast('দুই ডিভাইস সংযুক্ত। চ্যাট শুরু করুন।');
      $('messageInput').focus?.();
    };
    conn.on('data',handleData);
    conn.on('close',()=>{
      if(state.conn!==conn)return;
      state.conn=null;
      if(!state.closing){show('transferSection',false);show('deviceSection',true);status('Connection closed');toast('অপর ডিভাইস সংযোগ বিচ্ছিন্ন করেছে।');}
    });
    conn.on('error',()=>toast('ডেটা সংযোগে সমস্যা হয়েছে।'));
    // Critical: handle both event orders; on mobile open may have fired before binding.
    if(conn.open)reveal();else conn.on('open',reveal);
  }
  function send(packet) {
    if(!state.conn||!state.conn.open){toast('অপর ডিভাইস সংযুক্ত নেই।');return false;}
    try{state.conn.send(packet);return true;}catch(e){toast('পাঠানো যায়নি।');return false;}
  }
  function clearEmpty(){const el=$('incomingList').querySelector('.empty-state');if(el)el.remove();}
  function addHistory(kind,content,side='out') {
    clearEmpty();
    const row=document.createElement('div');row.className='incoming-item history-item '+(side==='out'?'history-out':'history-in');
    const badge=document.createElement('span');badge.className='history-side';badge.textContent=side==='out'?'আপনি':'অপর ডিভাইস';
    const body=document.createElement('div');body.className='message-item';
    if(kind==='text'){body.textContent=content;}
    else {
      const name=content.name,blob=content.blob;
      const title=document.createElement('strong');title.textContent='📎 '+name;
      const size=document.createElement('small');size.textContent=fmt(blob?blob.size:content.size);
      body.append(title,document.createElement('br'),size);
      if(blob){const link=document.createElement('a');link.className='download-btn';link.textContent='Download';link.href=URL.createObjectURL(blob);link.download=name;body.append(document.createElement('br'),link);}
    }
    const meta=document.createElement('small');meta.className='history-time';meta.textContent=clock();
    body.append(document.createElement('br'),meta);
    row.append(badge,body);$('incomingList').append(row);
    state.historyCount++;$('incomingCount').textContent=state.historyCount+'টি';
    $('incomingList').scrollTop=$('incomingList').scrollHeight;
  }
  function sendText(){
    const value=$('messageInput').value.trim();if(!value)return;
    if(send({type:'text',text:value})){addHistory('text',value,'out');$('messageInput').value='';}
  }
  function addFileQueue(file){
    const row=document.createElement('div');row.className='file-row';
    const symbol=document.createElement('div');symbol.className='file-symbol';symbol.textContent='↗';
    const info=document.createElement('div');info.className='file-info';
    const title=document.createElement('strong');title.textContent=file.name;
    const size=document.createElement('small');size.textContent=fmt(file.size);
    const progress=document.createElement('div');progress.className='progress';
    const bar=document.createElement('span');progress.append(bar);info.append(title,size,progress);
    const stateText=document.createElement('span');stateText.className='file-state';stateText.textContent='পাঠানো হচ্ছে';
    row.append(symbol,info,stateText);$('fileQueue').prepend(row);return {bar,stateText};
  }
  const waitAck=(id,index)=>new Promise((resolve,reject)=>{
    const timer=setTimeout(()=>{state.ackWaiters.delete(id+':'+index);reject(new Error('ফাইল পাঠাতে সময় বেশি লাগছে; সংযোগ পরীক্ষা করুন।'));},25000);
    state.ackWaiters.set(id+':'+index,()=>{clearTimeout(timer);resolve();});
  });
  async function sendFiles(files){
    for(const file of files){
      if(file.size>100*1024*1024){toast('একটি ফাইল সর্বোচ্চ ১০০ MB হতে পারবে।');continue;}
      const id='f'+Date.now()+Math.random().toString(36).slice(2,8),ui=addFileQueue(file);
      if(!send({type:'file-start',id,name:file.name,size:file.size,mime:file.type||'application/octet-stream'})){ui.stateText.textContent='ব্যর্থ';continue;}
      let offset=0,index=0;
      try{
        while(offset<file.size){
          const buf=await file.slice(offset,offset+CHUNK).arrayBuffer();
          if(!send({type:'file-chunk',id,index,data:buf}))throw new Error('সংযোগ বিচ্ছিন্ন');
          await waitAck(id,index);
          offset+=buf.byteLength;index++;
          ui.bar.style.width=Math.round(offset/file.size*100)+'%';
          ui.stateText.textContent=Math.round(offset/file.size*100)+'%';
        }
        send({type:'file-end',id});
        ui.stateText.textContent='পাঠানো হয়েছে';
        addHistory('file',{name:file.name,size:file.size},'out');
      }catch(err){ui.stateText.textContent='অসম্পূর্ণ';toast(err.message);}
    }
  }
  function handleData(packet){
    if(!packet||!packet.type)return;
    if(packet.type==='text'){addHistory('text',String(packet.text||''),'in');return;}
    if(packet.type==='file-start'){
      state.chunks.set(packet.id,{name:packet.name,size:packet.size,mime:packet.mime,parts:[],received:0,next:0});return;
    }
    if(packet.type==='file-chunk'){
      const f=state.chunks.get(packet.id);if(!f)return;
      if(packet.index!==f.next)return;
      f.parts.push(packet.data);f.received+=packet.data.byteLength||0;f.next++;
      send({type:'file-ack',id:packet.id,index:packet.index});return;
    }
    if(packet.type==='file-ack'){
      const resolve=state.ackWaiters.get(packet.id+':'+packet.index);
      if(resolve){state.ackWaiters.delete(packet.id+':'+packet.index);resolve();}return;
    }
    if(packet.type==='file-end'){
      const f=state.chunks.get(packet.id);if(!f)return;
      const blob=new Blob(f.parts,{type:f.mime||'application/octet-stream'});
      state.chunks.delete(packet.id);addHistory('file',{name:f.name,blob},'in');
    }
  }
  async function cleanup(){
    state.closing=true;
    if(state.scanner){try{await state.scanner.stop();state.scanner.clear();}catch(e){}state.scanner=null;}
    if(state.conn){try{state.conn.close();}catch(e){}state.conn=null;}
    if(state.peer){try{state.peer.destroy();}catch(e){}state.peer=null;}
    state.chunks.clear();state.ackWaiters.forEach(fn=>fn());state.ackWaiters.clear();
    $('qrCode').replaceChildren();$('fileQueue').replaceChildren();
    $('incomingList').innerHTML='<p class="empty-state">এখনো কোনো মেসেজ বা ফাইল নেই। কথোপকথন শুরু করুন।</p>';
    $('incomingCount').textContent='0টি';$('messageInput').value='';
    $('scannerPlaceholder').classList.remove('hidden');$('startScanBtn').textContent='ক্যামেরা চালু করুন';
    state.historyCount=0;state.closing=false;
  }
  // If QR is opened as a direct URL, select Mobile and show the code.
  const joinParam=new URLSearchParams(location.search).get('join');
  if(joinParam){choose('mobile');}
})();