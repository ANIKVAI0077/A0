/* SyncBridge session-only peer-to-peer chat and file transfer. */
(() => {
  const $ = id => document.getElementById(id);
  const state = {role:null, peer:null, conn:null, scanner:null, chunks:new Map(), ackWaiters:new Map(), ackResolvers:new Map(), closing:false};
  const CHUNK_SIZE = 32 * 1024;
  let toastTimer;
  const toast = msg => { const el=$('toast'); el.textContent=msg; el.classList.add('show'); clearTimeout(toastTimer); toastTimer=setTimeout(()=>el.classList.remove('show'),3000); };
  const setStatus = msg => $('headerStatus').textContent=msg;
  const show = (id, yes=true) => $(id).classList.toggle('hidden',!yes);
  const randomCode = () => Math.random().toString(36).slice(2,10).toUpperCase();
  const formatSize = n => n<1024?n+' B':n<1048576?(n/1024).toFixed(1)+' KB':(n/1048576).toFixed(1)+' MB';
  const timeNow = () => new Date().toLocaleTimeString('bn-BD',{hour:'2-digit',minute:'2-digit'});
  $('year').textContent=new Date().getFullYear();
  // Add your Facebook profile URL here when ready.
  $('facebookLink').href='https://www.facebook.com/';

  function choose(role){
    state.role=role;
    $('pcChoice').classList.toggle('selected',role==='pc'); $('mobileChoice').classList.toggle('selected',role==='mobile');
    $('pcChoice').setAttribute('aria-pressed',role==='pc'); $('mobileChoice').setAttribute('aria-pressed',role==='mobile');
    $('nextBtn').disabled=!role;
  }
  $('pcChoice').onclick=()=>choose('pc'); $('mobileChoice').onclick=()=>choose('mobile');
  $('nextBtn').onclick=async()=>{show('deviceSection',false);show('connectSection');if(state.role==='pc')await setupPC();else setupMobile();};
  $('backBtn').onclick=async()=>{await cleanup();show('connectSection',false);show('deviceSection');};
  $('startScanBtn').onclick=startScanner; $('matchBtn').onclick=()=>connectWithCode($('manualCode').value);
  $('manualCode').addEventListener('keydown',e=>{if(e.key==='Enter')connectWithCode($('manualCode').value);});
  $('disconnectBtn').onclick=async()=>{await cleanup();show('transferSection',false);show('deviceSection');choose(null);setStatus('Ready to connect');toast('সেশন শেষ হয়েছে।');};
  $('sendTextBtn').onclick=sendText;
  $('messageInput').addEventListener('keydown',e=>{if(e.key==='Enter'&&!e.shiftKey){e.preventDefault();sendText();}});
  $('messageInput').addEventListener('input',e=>{e.target.style.height='auto';e.target.style.height=Math.min(e.target.scrollHeight,110)+'px';});
  $('fileInput').addEventListener('change',e=>{sendFiles([...e.target.files]);e.target.value='';});

  function makePeer(id){
    return new Promise((resolve,reject)=>{
      const peer=new Peer(id,{debug:0});
      const timer=setTimeout(()=>{peer.destroy();reject(new Error('ইন্টারনেট বা Peer সার্ভারে সংযোগ হচ্ছে না।'));},16000);
      peer.on('open',()=>{clearTimeout(timer);resolve(peer);});
      peer.on('error',err=>{clearTimeout(timer);reject(err);});
    });
  }
  async function setupPC(){
    $('connectTitle').textContent='PC সংযোগ প্রস্তুত';show('pcConnect');show('mobileConnect',false);$('qrCode').innerHTML='';$('pairCode').textContent='তৈরি হচ্ছে...';
    try{
      const code=randomCode();state.peer=await makePeer('syncbridge-'+code.toLowerCase());$('pairCode').textContent=code;
      const url=new URL(location.href);url.searchParams.set('join',code);
      new QRCode($('qrCode'),{text:url.toString(),width:168,height:168,colorDark:'#101b31',colorLight:'#ffffff',correctLevel:QRCode.CorrectLevel.M});
      state.peer.on('connection',conn=>{if(state.conn&&state.conn.open){conn.close();return;}acceptConnection(conn);});
    }catch(err){toast(err.message||'PC সংযোগ তৈরি করা যায়নি।');}
  }
  function setupMobile(){
    $('connectTitle').textContent='মোবাইল সংযোগ';show('mobileConnect');show('pcConnect',false);
    const code=new URLSearchParams(location.search).get('join');if(code){$('manualCode').value=code.toUpperCase();toast('QR কোড পাওয়া গেছে, সংযোগ হচ্ছে...');connectWithCode(code);}
  }
  async function startScanner(){
    if(!window.Html5Qrcode)return toast('QR Scanner লোড হয়নি।');
    try{
      $('scannerPlaceholder').classList.add('hidden');state.scanner=new Html5Qrcode('reader');
      await state.scanner.start({facingMode:'environment'},{fps:10,qrbox:{width:210,height:210}},async decoded=>{
        try{await state.scanner.stop();}catch(e){}
        let code='';try{code=new URL(decoded).searchParams.get('join')||'';}catch(e){}
        if(code){$('manualCode').value=code;connectWithCode(code);}else toast('এটি SyncBridge QR কোড নয়।');
      },()=>{});
      $('startScanBtn').textContent='স্ক্যানার চালু আছে';
    }catch(e){$('scannerPlaceholder').classList.remove('hidden');toast('ক্যামেরার অনুমতি দিন এবং HTTPS ওয়েবসাইট ব্যবহার করুন।');}
  }
  async function connectWithCode(value){
    const code=(value||'').trim().toUpperCase().replace(/[^A-Z0-9]/g,'');
    if(code.length!==8)return toast('৮ অক্ষরের সঠিক কানেকশন কোড লিখুন।');
    $('matchBtn').disabled=true;
    try{
      state.peer=await makePeer();const conn=state.peer.connect('syncbridge-'+code.toLowerCase(),{reliable:true,serialization:'binary'});
      const timer=setTimeout(()=>{if(!conn.open)toast('PC পাওয়া যায়নি। কোড ও ইন্টারনেট পরীক্ষা করুন।');},14000);
      conn.on('open',()=>{clearTimeout(timer);acceptConnection(conn);});
      conn.on('error',err=>toast('কানেকশন ব্যর্থ: '+err.message));
    }catch(err){toast(err.message||'সংযোগ করা যায়নি।');}
    finally{$('matchBtn').disabled=false;}
  }
  function acceptConnection(conn){
    state.conn=conn;
    conn.on('open',()=>{
      setStatus('Device connected');$('connectedDevice').textContent=state.role==='pc'?'মোবাইল সংযুক্ত':'PC সংযুক্ত';
      show('connectSection',false);show('transferSection');toast('দুই ডিভাইস সংযুক্ত হয়েছে। এখন চ্যাট করতে পারবেন।');
    });
    conn.on('data',handleData);
    conn.on('close',()=>{if(!state.closing){show('transferSection',false);show('deviceSection');setStatus('Connection closed');toast('অপর ডিভাইস সংযোগ বিচ্ছিন্ন করেছে।');}});
    conn.on('error',()=>toast('ডেটা সংযোগে সমস্যা হয়েছে।'));
  }
  function sendPacket(packet){
    if(!state.conn||!state.conn.open){toast('অপর ডিভাইস সংযুক্ত নেই।');return false;}
    try{state.conn.send(packet);return true;}catch(e){toast('পাঠানো যায়নি।');return false;}
  }
  function sendText(){
    const text=$('messageInput').value.trim();if(!text)return;
    if(sendPacket({type:'text',text})){addTextBubble(text,'outgoing');$('messageInput').value='';$('messageInput').style.height='auto';}
  }
  function addTextBubble(text,direction){
    clearEmpty();const row=document.createElement('div');row.className='chat-row '+direction;
    const bubble=document.createElement('div');bubble.className='bubble';
    const body=document.createElement('div');body.className='bubble-text';body.textContent=text;
    const meta=document.createElement('div');meta.className='bubble-meta';meta.textContent=(direction==='outgoing'?'আপনি':'অপর ডিভাইস')+' · '+timeNow();
    bubble.append(body,meta);row.append(bubble);$('chatHistory').append(row);scrollBottom();
  }
  function clearEmpty(){const empty=$('chatHistory').querySelector('.chat-empty');if(empty)empty.remove();}
  function scrollBottom(){$('chatHistory').scrollTop=$('chatHistory').scrollHeight;}
  function addFileBubble(name,size,direction,blob=null,progress=false){
    clearEmpty();const row=document.createElement('div');row.className='chat-row '+direction;
    const bubble=document.createElement('div');bubble.className='bubble';
    const card=document.createElement('div');card.className='file-bubble';
    const icon=document.createElement('div');icon.className='file-bubble-icon';icon.textContent='▤';
    const info=document.createElement('div');info.className='file-bubble-info';
    const title=document.createElement('strong');title.textContent=name;
    const sub=document.createElement('small');sub.textContent=formatSize(size);
    info.append(title,sub);card.append(icon,info);bubble.append(card);
    let progressBar=null;
    if(progress){const p=document.createElement('div');p.className='file-progress';progressBar=document.createElement('span');p.append(progressBar);bubble.append(p);}
    if(blob){const link=document.createElement('a');link.className='file-download';link.textContent='↓ Download';link.href=URL.createObjectURL(blob);link.download=name;link.addEventListener('click',()=>setTimeout(()=>URL.revokeObjectURL(link.href),60000));bubble.append(link);}
    const meta=document.createElement('div');meta.className='bubble-meta';meta.textContent=(direction==='outgoing'?'আপনি পাঠিয়েছেন':'ফাইল পেয়েছেন')+' · '+timeNow();bubble.append(meta);
    row.append(bubble);$('chatHistory').append(row);scrollBottom();
    return {row,progressBar,meta};
  }
  function waitAck(id,index){
    return new Promise((resolve,reject)=>{
      const timer=setTimeout(()=>{state.ackResolvers.delete(id+':'+index);reject(new Error('ফাইল পাঠানোর সময় সংযোগ ধীর হয়ে গেছে।'));},20000);
      state.ackResolvers.set(id+':'+index,()=>{clearTimeout(timer);resolve();});
    });
  }
  async function sendFiles(files){
    for(const file of files){
      const id='f'+Date.now()+Math.random().toString(36).slice(2,7);
      const ui=addFileBubble(file.name,file.size,'outgoing',null,true);
      if(!sendPacket({type:'file-start',id,name:file.name,size:file.size,mime:file.type||'application/octet-stream'})){ui.meta.textContent='পাঠানো যায়নি';continue;}
      let offset=0,index=0;
      try{
        while(offset<file.size){
          const buf=await file.slice(offset,offset+CHUNK_SIZE).arrayBuffer();
          if(!sendPacket({type:'file-chunk',id,index,data:buf}))throw new Error('সংযোগ বিচ্ছিন্ন');
          await waitAck(id,index);
          offset+=buf.byteLength;index++;
          if(ui.progressBar)ui.progressBar.style.width=Math.round(offset/file.size*100)+'%';
        }
        sendPacket({type:'file-end',id});ui.meta.textContent='পাঠানো হয়েছে · '+timeNow();
      }catch(err){ui.meta.textContent='পাঠানো সম্পূর্ণ হয়নি';toast(err.message);}
    }
  }
  function handleData(data){
    if(!data||!data.type)return;
    if(data.type==='text'){addTextBubble(data.text,'incoming');return;}
    if(data.type==='file-start'){
      const ui=addFileBubble(data.name,data.size,'incoming',null,true);
      state.chunks.set(data.id,{name:data.name,size:data.size,mime:data.mime,parts:[],ui,nextIndex:0});
      $('transferStatus').textContent='ফাইল গ্রহণ করা হচ্ছে...';return;
    }
    if(data.type==='file-chunk'){
      const f=state.chunks.get(data.id);if(!f)return;
      f.parts.push(data.data);f.nextIndex++;
      if(f.ui.progressBar)f.ui.progressBar.style.width=Math.min(100,Math.round(f.parts.reduce((n,p)=>n+p.byteLength,0)/f.size*100))+'%';
      sendPacket({type:'file-ack',id:data.id,index:data.index});return;
    }
    if(data.type==='file-ack'){
      const resolve=state.ackResolvers.get(data.id+':'+data.index);if(resolve){state.ackResolvers.delete(data.id+':'+data.index);resolve();}return;
    }
    if(data.type==='file-end'){
      const f=state.chunks.get(data.id);if(!f)return;
      const blob=new Blob(f.parts,{type:f.mime});state.chunks.delete(data.id);
      const link=document.createElement('a');link.className='file-download';link.textContent='↓ Download';link.href=URL.createObjectURL(blob);link.download=f.name;
      f.ui.row.querySelector('.bubble').append(link);f.ui.meta.textContent='ফাইল গ্রহণ সম্পন্ন · '+timeNow();
      if(f.ui.progressBar)f.ui.progressBar.style.width='100%';
      $('transferStatus').textContent='ফাইল গ্রহণ সম্পন্ন';return;
    }
  }
  async function cleanup(){
    state.closing=true;
    if(state.scanner){try{await state.scanner.stop();state.scanner.clear();}catch(e){}state.scanner=null;}
    if(state.conn){try{state.conn.close();}catch(e){}state.conn=null;}
    if(state.peer){try{state.peer.destroy();}catch(e){}state.peer=null;}
    state.chunks.clear();state.ackResolvers.forEach(resolve=>resolve());state.ackResolvers.clear();
    $('chatHistory').innerHTML='<div class="chat-empty"><div class="empty-chat-icon">✉</div><strong>কথোপকথন শুরু করুন</strong><span>আপনার পাঠানো ও পাওয়া মেসেজ এবং ফাইল এখানে দেখা যাবে।</span></div>';
    $('qrCode').innerHTML='';$('scannerPlaceholder').classList.remove('hidden');$('startScanBtn').textContent='ক্যামেরা চালু করুন';state.closing=false;
  }
  if(new URLSearchParams(location.search).has('join'))choose('mobile');
})();