/* SyncBridge: Peer-to-peer file and text transfer.
   Files/messages are not written to a database. PeerJS uses a public signaling
   service to establish the WebRTC connection; a working internet connection is required. */
(() => {
  const $ = id => document.getElementById(id);
  const state = { role: null, peer: null, conn: null, scanner: null, selected: [], incomingCount: 0, chunks: new Map(), outgoing: new Map() };
  const CHUNK_SIZE = 48 * 1024;
  let toastTimer;
  const toast = message => {
    const el = $('toast'); el.textContent = message; el.classList.add('show');
    clearTimeout(toastTimer); toastTimer = setTimeout(() => el.classList.remove('show'), 3000);
  };
  const setStatus = message => { $('headerStatus').textContent = message; };
  const show = (id, yes=true) => $(id).classList.toggle('hidden', !yes);
  const randomCode = () => Math.random().toString(36).slice(2, 10).toUpperCase();
  const formatSize = bytes => bytes < 1024 ? bytes + ' B' : bytes < 1048576 ? (bytes/1024).toFixed(1)+' KB' : (bytes/1048576).toFixed(1)+' MB';

  $('year').textContent = new Date().getFullYear();
  // Replace this URL with your own Facebook profile/page URL.
  $('facebookLink').href = 'https://www.facebook.com/';

  function choose(role) {
    state.role = role;
    $('pcChoice').classList.toggle('selected', role === 'pc');
    $('mobileChoice').classList.toggle('selected', role === 'mobile');
    $('pcChoice').setAttribute('aria-pressed', role === 'pc');
    $('mobileChoice').setAttribute('aria-pressed', role === 'mobile');
    $('nextBtn').disabled = false;
  }
  $('pcChoice').onclick = () => choose('pc');
  $('mobileChoice').onclick = () => choose('mobile');
  $('nextBtn').onclick = async () => {
    show('deviceSection', false); show('connectSection');
    if (state.role === 'pc') await setupPC(); else setupMobile();
  };
  $('backBtn').onclick = async () => { await cleanup(); show('connectSection', false); show('deviceSection'); };
  $('startScanBtn').onclick = startScanner;
  $('matchBtn').onclick = () => connectWithCode($('manualCode').value);
  $('manualCode').addEventListener('keydown', e => { if (e.key === 'Enter') connectWithCode($('manualCode').value); });
  $('disconnectBtn').onclick = async () => { await cleanup(); show('transferSection', false); show('deviceSection'); choose(null); setStatus('Ready to connect'); toast('সংযোগ বিচ্ছিন্ন হয়েছে।'); };
  $('sendTextBtn').onclick = () => {
    const text = $('messageInput').value.trim();
    if (!text) return toast('আগে কিছু টেক্সট লিখুন।');
    if (!send({type:'text', text})) return;
    $('messageInput').value = ''; toast('টেক্সট পাঠানো হয়েছে।');
  };
  $('fileInput').addEventListener('change', e => { sendFiles([...e.target.files]); e.target.value=''; });
  document.querySelectorAll('.tab').forEach(tab => tab.onclick = () => {
    document.querySelectorAll('.tab').forEach(t => t.classList.toggle('active', t === tab));
    show('filesTab', tab.dataset.tab === 'files'); show('textTab', tab.dataset.tab === 'text');
  });

  function makePeer(id) {
    return new Promise((resolve, reject) => {
      const peer = new Peer(id, {debug: 0});
      const timeout = setTimeout(() => { peer.destroy(); reject(new Error('সার্ভারের সঙ্গে সংযোগ হচ্ছে না। ইন্টারনেট পরীক্ষা করুন।')); }, 15000);
      peer.on('open', () => { clearTimeout(timeout); resolve(peer); });
      peer.on('error', err => { clearTimeout(timeout); reject(err); });
    });
  }
  async function setupPC() {
    $('connectTitle').textContent = 'PC সংযোগ প্রস্তুত';
    show('pcConnect'); show('mobileConnect', false);
    $('qrCode').innerHTML = '';
    $('pairCode').textContent = 'তৈরি হচ্ছে...';
    try {
      const code = randomCode();
      state.peer = await makePeer('syncbridge-' + code.toLowerCase());
      $('pairCode').textContent = code;
      const url = new URL(location.href); url.searchParams.set('join', code);
      new QRCode($('qrCode'), {text:url.toString(), width:168, height:168, colorDark:'#101b31', colorLight:'#ffffff', correctLevel:QRCode.CorrectLevel.M});
      state.peer.on('connection', conn => {
        if (state.conn && state.conn.open) { conn.close(); return; }
        acceptConnection(conn);
      });
      state.peer.on('error', err => toast('সংযোগ সমস্যা: ' + (err.type || err.message)));
    } catch (err) { toast(err.message || 'PC সংযোগ তৈরি করা যায়নি।'); }
  }
  function setupMobile() {
    $('connectTitle').textContent = 'মোবাইল সংযোগ';
    show('mobileConnect'); show('pcConnect', false);
    const params = new URLSearchParams(location.search);
    if (params.has('join')) { $('manualCode').value = params.get('join').toUpperCase(); toast('QR লিংক পাওয়া গেছে। Match চাপুন।'); }
  }
  async function startScanner() {
    if (!window.Html5Qrcode) return toast('QR Scanner লাইব্রেরি লোড হয়নি।');
    try {
      $('scannerPlaceholder').classList.add('hidden');
      state.scanner = new Html5Qrcode('reader');
      await state.scanner.start({ facingMode:'environment' }, { fps:10, qrbox:{width:210,height:210} }, async decoded => {
        try { await state.scanner.stop(); } catch(e) {}
        const url = new URL(decoded);
        const code = url.searchParams.get('join');
        if (code) { $('manualCode').value = code; connectWithCode(code); }
        else toast('এটি SyncBridge QR কোড নয়।');
      }, () => {});
      $('startScanBtn').textContent = 'স্ক্যানার চালু আছে';
    } catch (err) {
      $('scannerPlaceholder').classList.remove('hidden');
      toast('ক্যামেরা চালু হয়নি। ব্রাউজারে Camera permission দিন এবং HTTPS ব্যবহার করুন।');
    }
  }
  async function connectWithCode(value) {
    const code = (value || '').trim().toUpperCase().replace(/[^A-Z0-9]/g,'');
    if (code.length < 6) return toast('সঠিক কানেকশন কোড লিখুন।');
    try {
      $('matchBtn').disabled = true;
      const peerId = 'syncbridge-' + code.toLowerCase();
      state.peer = await makePeer();
      const conn = state.peer.connect(peerId, {reliable:true, serialization:'binary'});
      const timer = setTimeout(() => { if (!conn.open) toast('PC পাওয়া যায়নি। কোড ও ইন্টারনেট পরীক্ষা করুন।'); }, 12000);
      conn.on('open', () => { clearTimeout(timer); acceptConnection(conn); });
      conn.on('error', err => toast('কানেকশন ব্যর্থ: ' + err.message));
    } catch (err) { toast(err.message || 'কানেকশন করা যায়নি।'); }
    finally { $('matchBtn').disabled = false; }
  }
  function acceptConnection(conn) {
    state.conn = conn;
    conn.on('open', () => {
      setStatus('Device connected'); show('connectSection', false); show('transferSection');
      toast('ডিভাইস সফলভাবে সংযুক্ত হয়েছে।');
    });
    conn.on('data', handleData);
    conn.on('close', () => { if (state.conn === conn) { state.conn = null; show('transferSection', false); show('deviceSection'); setStatus('Connection closed'); toast('অপর ডিভাইস সংযোগ বিচ্ছিন্ন করেছে।'); } });
    conn.on('error', () => toast('ডেটা সংযোগে সমস্যা হয়েছে।'));
  }
  function send(data) {
    if (!state.conn || !state.conn.open) { toast('অপর ডিভাইস সংযুক্ত নেই।'); return false; }
    try { state.conn.send(data); return true; } catch(e) { toast('পাঠানো যায়নি।'); return false; }
  }
  async function sendFiles(files) {
    for (const file of files) {
      const id = 'f' + Date.now() + Math.random().toString(36).slice(2,6);
      const row = document.createElement('div'); row.className='file-row';
      row.innerHTML = `<div class="file-symbol">↗</div><div class="file-info"><strong></strong><small></small><div class="progress"><span></span></div></div><span class="file-state">প্রস্তুত</span>`;
      row.querySelector('strong').textContent=file.name; row.querySelector('small').textContent=formatSize(file.size);
      $('fileQueue').prepend(row);
      if (!send({type:'file-start', id, name:file.name, size:file.size, mime:file.type || 'application/octet-stream'})) { row.querySelector('.file-state').textContent='ব্যর্থ'; continue; }
      const progress = row.querySelector('.progress span'), status = row.querySelector('.file-state');
      let offset=0, index=0;
      while(offset < file.size) {
        const blob=file.slice(offset, offset+CHUNK_SIZE);
        const buffer=await blob.arrayBuffer();
        if (!send({type:'file-chunk', id, index, data:buffer})) { status.textContent='ব্যর্থ'; break; }
        offset += blob.size; index++;
        progress.style.width = Math.round(offset/file.size*100)+'%';
        status.textContent = Math.round(offset/file.size*100)+'%';
        // Small pause avoids flooding the browser's WebRTC send buffer.
        await new Promise(r=>setTimeout(r, 8));
      }
      if (offset >= file.size) { send({type:'file-end', id}); status.textContent='পাঠানো হয়েছে'; }
    }
  }
  function handleData(data) {
    if (!data || !data.type) return;
    if (data.type === 'text') { addIncomingText(data.text); return; }
    if (data.type === 'file-start') {
      state.chunks.set(data.id, {name:data.name,size:data.size,mime:data.mime,parts:[],received:0});
      toast('ফাইল আসছে: '+data.name); return;
    }
    if (data.type === 'file-chunk') {
      const f=state.chunks.get(data.id); if (f) { f.parts.push(data.data); f.received += data.data.byteLength || data.data.size || 0; }
      return;
    }
    if (data.type === 'file-end') {
      const f=state.chunks.get(data.id); if (!f) return;
      const blob=new Blob(f.parts,{type:f.mime}); state.chunks.delete(data.id); addIncomingFile(f.name,blob); return;
    }
  }
  function countIncoming() { state.incomingCount++; $('incomingCount').textContent=state.incomingCount+'টি'; }
  function clearEmpty() { const empty=$('incomingList').querySelector('.empty-state'); if(empty) empty.remove(); }
  function addIncomingText(text) {
    clearEmpty(); countIncoming();
    const row=document.createElement('div'); row.className='incoming-item';
    const content=document.createElement('div'); content.className='message-item'; content.textContent=text;
    const copy=document.createElement('button'); copy.className='copy-btn'; copy.textContent='Copy';
    copy.onclick=async()=>{try{await navigator.clipboard.writeText(text);toast('কপি হয়েছে।')}catch(e){toast('কপি করা যায়নি।')}};
    row.append(content,copy); $('incomingList').prepend(row);
  }
  function addIncomingFile(name,blob) {
    clearEmpty(); countIncoming();
    const url=URL.createObjectURL(blob);
    const row=document.createElement('div'); row.className='incoming-item';
    const symbol=document.createElement('div'); symbol.className='file-symbol'; symbol.textContent='↓';
    const info=document.createElement('div'); info.className='file-info';
    const strong=document.createElement('strong'); strong.textContent=name;
    const small=document.createElement('small'); small.textContent=formatSize(blob.size);
    info.append(strong,small);
    const button=document.createElement('a'); button.className='download-btn'; button.textContent='Download'; button.href=url; button.download=name;
    row.append(symbol,info,button); $('incomingList').prepend(row);
  }
  async function cleanup() {
    if (state.scanner) { try { await state.scanner.stop(); state.scanner.clear(); } catch(e){} state.scanner=null; }
    if (state.conn) { try { state.conn.close(); } catch(e){} state.conn=null; }
    if (state.peer) { try { state.peer.destroy(); } catch(e){} state.peer=null; }
    state.chunks.clear(); $('qrCode').innerHTML=''; $('fileQueue').innerHTML=''; $('incomingList').innerHTML='<p class="empty-state">এখনো কোনো ফাইল বা মেসেজ আসেনি।</p>'; state.incomingCount=0; $('incomingCount').textContent='0টি';
    $('scannerPlaceholder').classList.remove('hidden'); $('startScanBtn').textContent='ক্যামেরা চালু করুন';
  }
  // Auto-fill code when mobile opens a QR-generated URL.
  if (new URLSearchParams(location.search).has('join')) { choose('mobile'); }
})();