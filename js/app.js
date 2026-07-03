/* ==========================================================
   Vaultly — Main App Logic (Supabase version)
   Handles: auth guard, upload, download, delete, share,
   categories, search, sort, scan, and rendering.
   ========================================================== */

const ICONS = {
  id: '<rect x="2" y="5" width="20" height="14" rx="2.4"/><circle cx="8" cy="12" r="2.2"/><path d="M13 10.5h6M13 13.5h4"/>',
  passport: '<rect x="5" y="2.5" width="14" height="19" rx="2"/><circle cx="12" cy="9" r="2.6"/><path d="M9 15.5c0-1.8 1.4-2.6 3-2.6s3 .8 3 2.6M8.5 19h7"/>',
  academic: '<path d="M12 3 2 8l10 5 10-5-10-5Z"/><path d="M6 10.5V16c0 1.4 2.7 3 6 3s6-1.6 6-3v-5.5M22 8v6"/>',
  cv: '<path d="M7 2.5h7l4 4V21a1 1 0 0 1-1 1H7a1 1 0 0 1-1-1V3.5a1 1 0 0 1 1-1Z"/><path d="M14 2.5V7h4M9 12h6M9 15.5h6M9 8.5h2"/>',
  assignments: '<path d="M6 2.5h9.5L20 7v13.5a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V3.5a1 1 0 0 1 1-1Z"/><path d="M9 12.5l1.8 1.8L15 10"/>',
  quizzes: '<path d="M12 2.5a5.5 5.5 0 0 0-3 10.1c.5.35.8.9.8 1.5v.9h4.4v-.9c0-.6.3-1.15.8-1.5A5.5 5.5 0 0 0 12 2.5Z"/><path d="M10 18.5h4M10.5 21h3"/>',
  atm: '<rect x="2" y="5" width="20" height="14" rx="2.4"/><path d="M2 10h20"/><rect x="5" y="13" width="4" height="2.6" rx="0.6"/>',
  business: '<rect x="2.5" y="6" width="19" height="12" rx="2"/><circle cx="8.5" cy="12" r="2"/><path d="M13.5 10h5M13.5 14h5"/>',
  other: '<path d="M3 7.5a1.5 1.5 0 0 1 1.5-1.5H9l2 2h8.5A1.5 1.5 0 0 1 21 9.5v9A1.5 1.5 0 0 1 19.5 20h-15A1.5 1.5 0 0 1 3 18.5v-11Z"/>',
  cpp: '<path d="M8 4 3 12l5 8M16 4l5 8-5 8"/>',
  python: '<path d="M8 4 3 12l5 8M16 4l5 8-5 8"/>',
  java: '<path d="M8 4 3 12l5 8M16 4l5 8-5 8"/>',
  javascript: '<path d="M8 4 3 12l5 8M16 4l5 8-5 8"/>'
};

const CATEGORIES = [
  {id:'id', name:'ID Cards', color:'#6366F1'},
  {id:'passport', name:'Passport', color:'#059669'},
  {id:'academic', name:'Academic Results', color:'#D97706'},
  {id:'cv', name:'CV / Resume', color:'#2563EB'},
  {id:'assignments', name:'Assignments', color:'#E11D48'},
  {id:'quizzes', name:'Quizzes', color:'#9333EA'},
  {id:'atm', name:'ATM / Bank Cards', color:'#0891B2'},
  {id:'business', name:'Business Cards', color:'#EA580C'},
  {id:'cpp', name:'C++ Code', color:'#F34B7D'},
  {id:'python', name:'Python Code', color:'#3572A5'},
  {id:'java', name:'Java Code', color:'#B07219'},
  {id:'javascript', name:'JavaScript Code', color:'#C9A227'},
  {id:'other', name:'Other', color:'#64748B'},
];
const MAX_DOCS = 20;
const BUCKET = 'vault-files';

let currentUser = null;
let docs = [];
let activeCategory = null;
let pendingFile = null;

function iconSvg(catId, size=20){
  return `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">${ICONS[catId] || ICONS.other}</svg>`;
}
function catInfo(id){ return CATEGORIES.find(c=>c.id===id) || CATEGORIES[CATEGORIES.length-1]; }
function formatSize(bytes){
  if(!bytes) return '0 B';
  if(bytes < 1024) return bytes+' B';
  if(bytes < 1024*1024) return (bytes/1024).toFixed(1)+' KB';
  return (bytes/1024/1024).toFixed(1)+' MB';
}
function toast(msg){
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.classList.add('show');
  setTimeout(()=>t.classList.remove('show'), 2500);
}

/* ---------- Auth guard: redirect to login if not signed in ---------- */
(async function initAuth(){
  const { data: { session } } = await sb.auth.getSession();
  if(!session){
    window.location.href = 'login.html';
    return;
  }
  currentUser = session.user;
  loadDocs();
})();

sb.auth.onAuthStateChange((event)=>{
  if(event === 'SIGNED_OUT'){
    window.location.href = 'login.html';
  }
});

async function logout(){
  await sb.auth.signOut();
  window.location.href = 'login.html';
}

/* Generates a temporary, secure link to a file in the private bucket */
async function getSignedUrl(path, expiresInSeconds=3600){
  const { data, error } = await sb.storage.from(BUCKET).createSignedUrl(path, expiresInSeconds);
  if(error){ console.error(error); return null; }
  return data.signedUrl;
}

/* ---------- Load documents from Supabase ---------- */
async function loadDocs(){
  try{
    const { data, error } = await sb
      .from('vault_items')
      .select('*')
      .eq('user_id', currentUser.id)
      .order('created_at', { ascending: false });

    if(error) throw error;

    docs = await Promise.all((data || []).map(async row=>{
      const isImage = (row.mime_type || '').startsWith('image/');
      const previewUrl = (isImage && row.storage_path) ? await getSignedUrl(row.storage_path, 3600) : null;
      return {
        id: row.id,
        name: row.title,
        category: row.category,
        size: row.file_size,
        contentType: row.mime_type,
        storagePath: row.storage_path,
        addedAt: new Date(row.created_at).getTime(),
        previewUrl
      };
    }));
  }catch(e){
    console.error(e);
    docs = [];
    toast('Could not load your documents.');
  }
  render();
}

function renderCategories(){
  const grid = document.getElementById('catGrid');
  grid.innerHTML = CATEGORIES.map(c=>{
    const count = docs.filter(d=>d.category===c.id).length;
    const active = activeCategory===c.id ? 'active' : '';
    return `<button class="cat-card ${active}" style="--accent:${c.color}" onclick="setCategory('${c.id}')">
      <div class="cat-icon">${iconSvg(c.id, 19)}</div>
      <div class="cat-name">${c.name}</div>
      <div class="cat-count">${count} file${count!==1?'s':''}</div>
    </button>`;
  }).join('');
}

function setCategory(id){
  activeCategory = (activeCategory === id) ? null : id;
  document.getElementById('clearFilterBtn').hidden = !activeCategory;
  render();
  const target = document.getElementById('listTitle');
  if(target) target.scrollIntoView({ behavior:'smooth', block:'start' });
}

function renderDocs(){
  const wrap = document.getElementById('docListWrap');
  const search = document.getElementById('searchInput').value.trim().toLowerCase();
  const sortBy = document.getElementById('sortSelect').value;
  let filtered = docs.slice();
  if(activeCategory) filtered = filtered.filter(d=>d.category===activeCategory);
  if(search) filtered = filtered.filter(d=>d.name.toLowerCase().includes(search));

  if(sortBy==='newest') filtered.sort((a,b)=>b.addedAt-a.addedAt);
  else if(sortBy==='oldest') filtered.sort((a,b)=>a.addedAt-b.addedAt);
  else if(sortBy==='name') filtered.sort((a,b)=>a.name.localeCompare(b.name));

  document.getElementById('listTitle').textContent = activeCategory ? catInfo(activeCategory).name : 'All Documents';

  if(filtered.length===0){
    wrap.innerHTML = `<div class="empty-state">
      <div class="big">${iconSvg('other', 40)}</div>
      <p>${docs.length===0 ? 'Your vault is empty — add your first document to get started.' : 'No documents match this filter.'}</p>
      ${docs.length===0 ? '<button class="add-btn" style="margin:0 auto;" onclick="openUploadModal()">+ Add Document</button>' : ''}
    </div>`;
    return;
  }

  wrap.innerHTML = `<div class="doc-list">` + filtered.map(d=>{
    const c = catInfo(d.category);
    const date = new Date(d.addedAt).toLocaleDateString('en-GB', {day:'2-digit', month:'short', year:'numeric'});
    const iconHtml = d.previewUrl ? `<img src="${d.previewUrl}" alt="">` : iconSvg(d.category, 20);
    return `<div class="doc-card" style="--accent:${c.color}">
      <div class="doc-icon">${iconHtml}</div>
      <div class="doc-meta">
        <div class="doc-name">${d.name}</div>
        <div class="doc-sub mono">${c.name} · ${formatSize(d.size)} · ${date}</div>
      </div>
      <div class="doc-actions">
        <button class="btn-download" title="Download" onclick="downloadDoc('${d.id}')">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 3v12m0 0-4-4m4 4 4-4M4 21h16"/></svg>
        </button>
        <button class="btn-share" title="Share" onclick="shareDoc('${d.id}')">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><path d="m8.6 10.5 6.8-3.9M8.6 13.5l6.8 3.9"/></svg>
        </button>
        <button class="btn-delete" title="Delete" onclick="deleteDoc('${d.id}')">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 6h18M8 6V4h8v2m-9 0 1 14h8l1-14"/></svg>
        </button>
      </div>
    </div>`;
  }).join('') + `</div>`;
}

function renderDial(){
  const count = docs.length;
  document.getElementById('dialCount').textContent = count;
  const circumference = 389.6;
  const offset = circumference - (count/MAX_DOCS)*circumference;
  const fill = document.getElementById('dialFill');
  requestAnimationFrame(()=>{ fill.style.strokeDashoffset = offset; });
}

function render(){
  renderCategories();
  renderDocs();
  renderDial();
}

document.getElementById('searchInput').addEventListener('input', renderDocs);

/* ---------- Upload modal ---------- */
function openUploadModal(){
  if(docs.length >= MAX_DOCS){
    toast('Vault is full — you have reached the 20 document limit. Delete something first.');
    return;
  }
  const sel = document.getElementById('uploadCategory');
  sel.innerHTML = CATEGORIES.map(c=>`<option value="${c.id}">${c.name}</option>`).join('');
  document.getElementById('uploadName').value = '';
  document.getElementById('dropzone').textContent = 'Tap to choose a file';
  document.getElementById('dropzone').classList.remove('filled');
  document.querySelector('.scan-btn').classList.remove('filled');
  document.getElementById('enhanceRow').style.display = 'none';
  document.getElementById('enhanceCheck').checked = true;
  document.getElementById('saveBtn').disabled = true;
  pendingFile = null;
  document.getElementById('uploadOverlay').classList.add('show');
}
function closeUploadModal(){ document.getElementById('uploadOverlay').classList.remove('show'); }

document.getElementById('fileInput').addEventListener('change', (e)=>{
  const file = e.target.files[0];
  if(!file) return;
  if(file.size > 10*1024*1024){
    toast('Please choose a file smaller than 10MB.');
    return;
  }
  document.getElementById('enhanceRow').style.display = 'none';
  document.querySelector('.scan-btn').classList.remove('filled');
  document.getElementById('dropzone').textContent = '✓ ' + file.name;
  document.getElementById('dropzone').classList.add('filled');
  acceptFile(file);
});

/* ---------- Scan with Camera ---------- */
document.getElementById('cameraInput').addEventListener('change', async (e)=>{
  const file = e.target.files[0];
  if(!file) return;
  document.getElementById('dropzone').textContent = 'Tap to choose a file';
  document.getElementById('dropzone').classList.remove('filled');
  document.getElementById('enhanceRow').style.display = 'flex';
  document.querySelector('.scan-btn').classList.add('filled');

  const shouldEnhance = document.getElementById('enhanceCheck').checked;
  const finalFile = shouldEnhance ? await enhanceImage(file) : file;
  acceptFile(finalFile, 'Scanned Document');
});

function acceptFile(file, defaultName){
  pendingFile = file;
  document.getElementById('saveBtn').disabled = false;
  if(!document.getElementById('uploadName').value){
    document.getElementById('uploadName').value = defaultName || file.name.replace(/\.[^/.]+$/,'');
  }
}

/* Lightly sharpens/cleans up a camera photo so it looks more like a scan */
function enhanceImage(file){
  return new Promise((resolve)=>{
    const img = new Image();
    img.onload = ()=>{
      const canvas = document.createElement('canvas');
      canvas.width = img.width;
      canvas.height = img.height;
      const ctx = canvas.getContext('2d');
      ctx.filter = 'contrast(1.35) brightness(1.08) saturate(0.85)';
      ctx.drawImage(img, 0, 0);
      canvas.toBlob((blob)=>{
        const enhancedFile = new File([blob], file.name, { type: 'image/jpeg' });
        resolve(enhancedFile);
      }, 'image/jpeg', 0.92);
    };
    img.onerror = ()=> resolve(file);
    img.src = URL.createObjectURL(file);
  });
}

/* ---------- Save (upload file + insert row) ---------- */
async function saveDocument(){
  if(!pendingFile || !currentUser) return;
  const btn = document.getElementById('saveBtn');
  btn.disabled = true; btn.textContent = 'Uploading...';

  try{
    const id = crypto.randomUUID();
    const storagePath = `${currentUser.id}/${id}-${pendingFile.name}`;

    const { error: uploadError } = await sb.storage.from(BUCKET).upload(storagePath, pendingFile, { upsert:false });
    if(uploadError) throw uploadError;

    const { error: insertError } = await sb.from('vault_items').insert({
      id,
      user_id: currentUser.id,
      title: document.getElementById('uploadName').value || pendingFile.name,
      category: document.getElementById('uploadCategory').value,
      file_name: pendingFile.name,
      storage_path: storagePath,
      file_size: pendingFile.size,
      mime_type: pendingFile.type
    });
    if(insertError) throw insertError;

    await loadDocs();
    closeUploadModal();
    toast('Document added successfully');
  }catch(e){
    console.error(e);
    toast('Upload failed: ' + (e.message || 'please try again.'));
  }
  btn.disabled = false; btn.textContent = 'Save';
}

/* ---------- Download ---------- */
async function downloadDoc(id){
  const d = docs.find(x=>x.id===id);
  if(!d) return;
  try{
    const url = await getSignedUrl(d.storagePath, 120);
    if(!url) throw new Error('no url');
    const response = await fetch(url);
    const blob = await response.blob();
    const objUrl = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = objUrl;
    a.download = d.name;
    a.click();
    URL.revokeObjectURL(objUrl);
    toast('Download started');
  }catch(e){
    console.error(e);
    toast('Could not download file');
  }
}

/* ---------- Delete ---------- */
async function deleteDoc(id){
  const d = docs.find(x=>x.id===id);
  if(!d) return;
  if(!confirm(`Delete "${d.name}"? This cannot be undone.`)) return;
  try{
    await sb.storage.from(BUCKET).remove([d.storagePath]);
    const { error } = await sb.from('vault_items').delete().eq('id', id);
    if(error) throw error;
    await loadDocs();
    toast('Document deleted');
  }catch(e){
    console.error(e);
    toast('Could not delete document');
  }
}

/* ---------- Share (temporary secure link, valid 7 days) ---------- */
async function shareDoc(id){
  const d = docs.find(x=>x.id===id);
  if(!d) return;
  document.getElementById('shareLinkText').textContent = 'Generating link...';
  document.getElementById('shareOverlay').classList.add('show');
  const url = await getSignedUrl(d.storagePath, 60*60*24*7);
  document.getElementById('shareLinkText').textContent = url || 'Could not generate link';
}
function closeShareModal(){ document.getElementById('shareOverlay').classList.remove('show'); }
function copyShareLink(){
  const text = document.getElementById('shareLinkText').textContent;
  navigator.clipboard.writeText(text).then(()=>toast('Link copied to clipboard'));
}

/* close modals on overlay click */
document.querySelectorAll('.overlay').forEach(ov=>{
  ov.addEventListener('click', (e)=>{ if(e.target===ov) ov.classList.remove('show'); });
});
    
