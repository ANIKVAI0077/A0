/* SyncBridge — temporary peer-to-peer chat and file transfer.
   Files/messages stay in memory for the current session only. */
(() => {
  'use strict';
  const $ = id => document.getElementById(id);
  const required = ['year','facebookLink','pcChoice','mobileChoice','nextBtn','deviceSection','connectSection','connectTitle','pcConnect','mobileConnect','qrCode','pairCode','pcWaitingText','backBtn','startScanBtn','reader','scannerPlaceholder','manualCode','matchBtn','transferSection','disconnectBtn','sendTextBtn','messageInput','fileInput','fileQueue','incomingList','incomingCount','toast','headerStatus'];
  if (required.some(id => !$(id))) { console.error('SyncBridge: required page element missing'); return; }

  const state = { role:null, peer:null, conn:null, scanner:null, chunks:new Map(), ackWaiters:new Map(), closing:false, historyCount:0 };
  const CHUNK = 16 * 1024;
  const MAX_FILE = 100 * 1024 * 1024;
  let toastTimer;
  const toast = msg => { $('toast').textContent=msg; $('toast').classList.add('show'); clearTimeout(toastTimer); toastTimer=setTimeout(()=>$('toast').classList.remove('show'),3500); };
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
  $('facebookLink').href='https://www.facebook.com/'; // নিজের Facebook profile link বসান।

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
      state.peer.on('connection',conn=>{if(state.conn&&state.conn.open){conn.close();return;}bindConnection(conn);});
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
      failAllAcks(new Error('সংযোগ বিচ্ছিন্ন হয়েছে'));
      if(!state.closing){show('transferSection',false);show('deviceSection',true);status('Connection closed');toast('অপর ডিভাইস সংযোগ বিচ্ছিন্ন করেছে।');}
    });
    conn.on('error',()=>{failAllAcks(new Error('ডেটা সংযোগে সমস্যা'));toast('ডেটা সংযোগে সমস্যা হয়েছে।');});
    if(conn.open)reveal();else conn.on('open',reveal);
  }
  function send(packet) {
    if(!state.conn||!state.conn.open){toast('অপর ডিভাইস সংযুক্ত নেই।');return false;}
    try{state.conn.send(packet);return true;}catch(e){return false;}
  }
  function failAllAcks(err){for(const entry of state.ackWaiters.values()){clearTimeout(entry.timer);entry.reject(err);}state.ackWaiters.clear();}
  function waitAck(key,timeoutMs=30000){
    return new Promise((resolve,reject)=>{
      const timer=setTimeout(()=>{state.ackWaiters.delete(key);reject(new Error('ফাইল পাঠানোর উত্তর পাওয়া যায়নি। সংযোগ পরীক্ষা করে আবার চেষ্টা করুন।'));},timeoutMs);
      state.ackWaiters.set(key,{resolve:()=>{clearTimeout(timer);resolve();},reject});
    });
  }
  async function sendAndWait(packet,key){
    const ack=waitAck(key); // ACK listener must exist BEFORE sending: prevents fast-ACK race.
    if(!send(packet)){const entry=state.ackWaiters.get(key);if(entry){clearTimeout(entry.timer);state.ackWaiters.delete(key);}throw new Error('ডেটা পাঠানো যায়নি। সংযোগ পরীক্ষা করুন।');}
    await ack;
  }
  function clearEmpty(){const el=$('incomingList').querySelector('.empty-state');if(el)el.remove();}
  function addHistory(kind,content,side='out') {
    clearEmpty();
    const row=document.createElement('div');row.className='incoming-item history-item '+(side==='out'?'history-out':'history-in');
    const body=document.createElement('div');body.className='message-item';
    if(kind==='text'){body.textContent=content;}
    else {
      const name=content.name,blob=content.blob;
      const title=document.createElement('strong');title.textContent='📎 '+name;
      const size=document.createElement('small');size.textContent=fmt(blob?blob.size:content.size);
      body.append(title,document.createElement('br'),size);
      if(blob){
        const link=document.createElement('a');link.className='download-btn';link.textContent='ডাউনলোড';link.href=URL.createObjectURL(blob);link.download=name;
        body.append(document.createElement('br'),link);
      }
    }
    const meta=document.createElement('small');meta.className='history-time';meta.textContent=clock();
    body.append(document.createElement('br'),meta);
    row.append(body);$('incomingList').append(row);
    state.historyCount++;$('incomingCount').textContent=state.historyCount+'টি';
    $('incomingList').scrollTop=$('incomingList').scrollHeight;
  }
  function sendText(){
    const value=$('messageInput').value.trim();if(!value)return;
    if(send({type:'text',text:value})){addHistory('text',value,'out');$('messageInput').value='';}
    else toast('মেসেজ পাঠানো যায়নি। সংযোগ পরীক্ষা করুন।');
  }
  function addFileQueue(file){
    const row=document.createElement('div');row.className='file-row';
    const symbol=document.createElement('div');symbol.className='file-symbol';symbol.textContent='📎';
    const info=document.createElement('div');info.className='file-info';
    const title=document.createElement('strong');title.textContent=file.name;
    const size=document.createElement('small');size.textContent=fmt(file.size);
    const progress=document.createElement('div');progress.className='progress';
    const bar=document.createElement('span');progress.append(bar);info.append(title,size,progress);
    const stateText=document.createElement('span');stateText.className='file-state';stateText.textContent='প্রস্তুত হচ্ছে';
    row.append(symbol,info,stateText);$('fileQueue').prepend(row);return {bar,stateText};
  }
  async function sendFiles(files){
    if(!state.conn||!state.conn.open){toast('আগে অপর ডিভাইসের সঙ্গে সংযোগ করুন।');return;}
    for(const file of files){
      if(file.size>MAX_FILE){toast(`${file.name}: সর্বোচ্চ ১০০ MB ফাইল পাঠানো যাবে।`);continue;}
      const id='f'+Date.now()+Math.random().toString(36).slice(2,8),ui=addFileQueue(file);
      const startKey=id+':start',endKey=id+':end';
      try{
        ui.stateText.textContent='পাঠানো হচ্ছে';
        await sendAndWait({type:'file-start',id,name:file.name,size:file.size,mime:file.type||'application/octet-stream'},startKey);
        let offset=0,index=0;
        while(offset<file.size){
          const buf=await file.slice(offset,Math.min(offset+CHUNK,file.size)).arrayBuffer();
          await sendAndWait({type:'file-chunk',id,index,data:buf},id+':'+index);
          offset+=buf.byteLength;index++;
          const pct=Math.round(offset/file.size*100);
          ui.bar.style.width=pct+'%';ui.stateText.textContent=pct+'%';
        }
        await sendAndWait({type:'file-end',id},endKey);
        ui.bar.style.width='100%';ui.stateText.textContent='সম্পন্ন ✓';
        addHistory('file',{name:file.name,size:file.size},'out');
      }catch(err){
        ui.stateText.textContent='ব্যর্থ';
        toast(`${file.name}: ${err.message||'পাঠানো যায়নি'}`);
      }
    }
  }
  function handleData(packet){
    if(!packet||!packet.type)return;
    if(packet.type==='text'){addHistory('text',String(packet.text||''),'in');return;}
    if(packet.type==='file-start'){
      if(!packet.id||!Number.isFinite(packet.size)||packet.size<0||packet.size>MAX_FILE){send({type:'file-reject',id:packet.id,reason:'ফাইলের আকার গ্রহণযোগ্য নয়'});return;}
      state.chunks.set(packet.id,{name:String(packet.name||'file'),size:packet.size,mime:packet.mime,parts:[],received:0,next:0});
      send({type:'file-ack',id:packet.id,key:'start'});return;
    }
    if(packet.type==='file-chunk'){
      const f=state.chunks.get(packet.id);if(!f)return;
      if(packet.index!==f.next||!(packet.data instanceof ArrayBuffer)){send({type:'file-reject',id:packet.id,reason:'ফাইলের ডেটা সঠিক নয়'});return;}
      f.parts.push(packet.data);f.received+=packet.data.byteLength;f.next++;
      send({type:'file-ack',id:packet.id,key:String(packet.index)});return;
    }
    if(packet.type==='file-ack'){
      const key=packet.id+':'+packet.key,entry=state.ackWaiters.get(key);
      if(entry){state.ackWaiters.delete(key);entry.resolve();}return;
    }
    if(packet.type==='file-reject'){
      const id=packet.id;
      for(const [key,entry] of state.ackWaiters){if(key.startsWith(id+':')){clearTimeout(entry.timer);state.ackWaiters.delete(key);entry.reject(new Error(packet.reason||'ফাইল গ্রহণ করা হয়নি'));}}
      return;
    }
    if(packet.type==='file-end'){
      const f=state.chunks.get(packet.id);if(!f)return;
      if(f.received!==f.size){send({type:'file-reject',id:packet.id,reason:'ফাইল অসম্পূর্ণ এসেছে'});state.chunks.delete(packet.id);return;}
      const blob=new Blob(f.parts,{type:f.mime||'application/octet-stream'});
      state.chunks.delete(packet.id);addHistory('file',{name:f.name,blob},'in');
      send({type:'file-ack',id:packet.id,key:'end'});
    }
  }
  async function cleanup(){
    state.closing=true;
    if(state.scanner){try{await state.scanner.stop();state.scanner.clear();}catch(e){}state.scanner=null;}
    if(state.conn){try{state.conn.close();}catch(e){}state.conn=null;}
    if(state.peer){try{state.peer.destroy();}catch(e){}state.peer=null;}
    failAllAcks(new Error('সেশন শেষ হয়েছে'));
    state.chunks.clear();
    $('qrCode').replaceChildren();$('fileQueue').replaceChildren();
    $('incomingList').innerHTML='<p class="empty-state">এখনো কোনো মেসেজ বা ফাইল নেই। কথোপকথন শুরু করুন।</p>';
    $('incomingCount').textContent='0টি';$('messageInput').value='';
    $('scannerPlaceholder').classList.remove('hidden');$('startScanBtn').textContent='ক্যামেরা চালু করুন';
    state.historyCount=0;state.closing=false;
  }
  const joinParam=new URLSearchParams(location.search).get('join');
  if(joinParam){choose('mobile');}
})();