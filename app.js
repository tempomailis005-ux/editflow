// ===== Config =====
const DB_KEY = 'editflow_data';
const ADMIN_CODE = 'QBD16*';

// ===== State =====
let data = loadData();
let currentUser = null; // { role: 'admin' } or { role: 'client', clientId: number }

function loadData() {
    const raw = localStorage.getItem(DB_KEY);
    if (raw) return JSON.parse(raw);
    return { clients: [], projects: [], history: [], nextClientId: 1, nextProjectId: 1 };
}
function saveData(d) { localStorage.setItem(DB_KEY, JSON.stringify(d)); }

// Try loading shared data.json (used on hosted site for clients)
async function loadRemoteData() {
    try {
        const res = await fetch('data.json?t=' + Date.now());
        if (!res.ok) return null;
        const d = await res.json();
        if (d && d.clients && d.clients.length > 0) return d;
    } catch(e) {}
    return null;
}

// ===== Helpers =====
function fmt(n) { return '₹' + Number(n).toLocaleString('en-IN'); }
function fmtDate(s) { return s ? new Date(s).toLocaleDateString('en-IN',{day:'numeric',month:'short',year:'numeric'}) : '—'; }
function getClient(id) { return data.clients.find(c=>c.id===id); }
function esc(s) { const d=document.createElement('div'); d.textContent=s||''; return d.innerHTML; }

function getClientBalance(cid) {
    const c = getClient(cid); if(!c) return 0;
    const spent = data.projects.filter(p=>p.clientId===cid && p.status==='completed').reduce((s,p)=>s+Number(p.charge),0);
    return Number(c.advance) - spent;
}
function getClientSpent(cid) {
    return data.projects.filter(p=>p.clientId===cid && p.status==='completed').reduce((s,p)=>s+Number(p.charge),0);
}

function toast(msg,type='success') {
    const c=document.getElementById('toast-container'), t=document.createElement('div');
    t.className=`toast ${type}`; t.innerHTML=`<span>${msg}</span>`;
    c.appendChild(t); setTimeout(()=>{t.style.opacity='0';setTimeout(()=>t.remove(),300);},2500);
}

function genCode() { return Math.random().toString(36).slice(2,8); }

function isAdmin() { return currentUser && currentUser.role === 'admin'; }

function getVisibleProjects() {
    if (isAdmin()) return data.projects;
    if (currentUser && currentUser.role === 'client') return data.projects.filter(p=>p.clientId===currentUser.clientId);
    return [];
}

// ===== Auth =====
document.getElementById('login-form').addEventListener('submit', e => {
    e.preventDefault();
    const code = document.getElementById('access-code').value.trim();
    const err = document.getElementById('login-error');
    if (code === ADMIN_CODE) {
        currentUser = { role: 'admin' };
        enterApp();
    } else {
        const client = data.clients.find(c => c.accessCode === code);
        if (client) {
            currentUser = { role: 'client', clientId: client.id };
            enterApp();
        } else {
            err.textContent = 'Invalid access code. Try again.';
        }
    }
});

function enterApp(saveSession = true) {
    document.getElementById('login-screen').classList.add('hidden');
    document.getElementById('login-error').textContent = '';
    document.getElementById('access-code').value = '';
    if (saveSession) localStorage.setItem('editflow_session', JSON.stringify(currentUser));
    if (isAdmin()) {
        document.body.classList.remove('client-mode');
        document.getElementById('logged-in-label').textContent = '🔑 Admin';
    } else {
        document.body.classList.add('client-mode');
        const c = getClient(currentUser.clientId);
        document.getElementById('logged-in-label').textContent = c ? c.name : 'Client';
    }
    switchView('dashboard');
    renderAll();
}

document.getElementById('btn-logout').addEventListener('click', () => {
    currentUser = null;
    localStorage.removeItem('editflow_session');
    document.body.classList.remove('client-mode');
    document.getElementById('login-screen').classList.remove('hidden');
});

// ===== Navigation =====
const navButtons = document.querySelectorAll('.nav-item');
const views = document.querySelectorAll('.view');

function switchView(v) {
    views.forEach(x=>x.classList.remove('active'));
    navButtons.forEach(b=>b.classList.remove('active'));
    document.getElementById(`view-${v}`).classList.add('active');
    document.querySelector(`.nav-item[data-view="${v}"]`).classList.add('active');
    document.getElementById('sidebar').classList.remove('open');
}
navButtons.forEach(b=>b.addEventListener('click',()=>switchView(b.dataset.view)));
document.getElementById('menu-toggle').addEventListener('click',()=>document.getElementById('sidebar').classList.toggle('open'));

// ===== Render =====
function renderAll() { renderStats(); renderKanban(); renderClients(); renderProjects(); renderHistory(); renderSidebarStats(); }

function renderSidebarStats() {
    document.getElementById('sidebar-active-clients').textContent = data.clients.length;
    document.getElementById('sidebar-total-balance').textContent = fmt(data.clients.reduce((s,c)=>s+getClientBalance(c.id),0));
}

function renderStats() {
    const vp = getVisibleProjects();
    const bal = isAdmin() ? data.clients.reduce((s,c)=>s+getClientBalance(c.id),0) : (currentUser ? getClientBalance(currentUser.clientId) : 0);
    document.getElementById('stat-total-balance').textContent = fmt(bal);
    document.getElementById('stat-upcoming').textContent = vp.filter(p=>p.status==='upcoming').length;
    document.getElementById('stat-inprogress').textContent = vp.filter(p=>p.status==='inprogress').length;
    document.getElementById('stat-completed').textContent = vp.filter(p=>p.status==='completed').length;
}

function renderKanban() {
    ['upcoming','inprogress','completed'].forEach(status => {
        const container = document.getElementById(`kanban-${status}-cards`);
        const countEl = document.getElementById(`kanban-${status}-count`);
        const projects = getVisibleProjects().filter(p=>p.status===status).sort((a,b)=>new Date(a.deadline)-new Date(b.deadline));
        countEl.textContent = projects.length;
        if (!projects.length) { container.innerHTML=`<div class="empty-state"><p>No ${status==='inprogress'?'in progress':status} projects</p></div>`; return; }
        container.innerHTML = projects.map(p => {
            const c = getClient(p.clientId), color = c?c.color:'#6C5CE7';
            const onclick = isAdmin() ? `onclick="openEditProject(${p.id})"` : '';
            return `<div class="kanban-card" ${onclick}>
                <div class="kanban-card-accent" style="background:${color}"></div>
                <div class="kanban-card-client" style="color:${color}">${c?c.name:'Unknown'}</div>
                <div class="kanban-card-title">${esc(p.title)}</div>
                <div class="kanban-card-meta"><span class="kanban-card-date">${fmtDate(p.deadline)}</span><span class="kanban-card-charge">${p.charge ? fmt(p.charge) : 'Pending'}</span></div>
            </div>`;
        }).join('');
    });
}

function renderClients() {
    const grid = document.getElementById('clients-grid');
    if (!data.clients.length) { grid.innerHTML=`<div class="empty-state" style="grid-column:1/-1"><p>No clients yet. Add your first client!</p></div>`; return; }
    grid.innerHTML = data.clients.map(c => {
        const bal=getClientBalance(c.id), spent=getClientSpent(c.id), adv=Number(c.advance);
        const pct=adv>0?Math.min((spent/adv)*100,100):0;
        const balCls=bal>0?'positive':bal<0?'negative':'zero';
        const ini=c.name.split(' ').map(w=>w[0]).join('').toUpperCase().slice(0,2);
        const cnt=data.projects.filter(p=>p.clientId===c.id).length;
        return `<div class="client-card">
            <div class="client-card-accent" style="background:${c.color}"></div>
            <div class="client-avatar" style="background:${c.color}">${ini}</div>
            <div class="client-name">${esc(c.name)}</div>
            <div class="client-contact">${c.email?esc(c.email):'No contact'} • ${cnt} project${cnt!==1?'s':''} • Code: <strong>${c.accessCode||'—'}</strong></div>
            <div class="client-balance-section">
                <div class="client-balance-row"><span class="client-balance-label">Remaining Balance</span><span class="client-balance-value ${balCls}">${fmt(bal)}</span></div>
                <div class="client-balance-row"><span class="client-spent">Advance: ${fmt(adv)} | Spent: ${fmt(spent)}</span></div>
                <div class="client-progress-bar"><div class="client-progress-fill" style="width:${pct}%;background:${pct>=90?'var(--red)':pct>=60?'var(--orange)':c.color}"></div></div>
            </div>
            <div class="client-actions">
                <button class="btn btn-sm btn-ghost" onclick="openAddMoney(${c.id})">+ Add Payment</button>
                <button class="btn btn-sm btn-ghost" onclick="openEditClient(${c.id})">Edit</button>
                <button class="btn btn-sm btn-icon" onclick="confirmDeleteClient(${c.id})" title="Delete">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
                </button>
            </div>
        </div>`;
    }).join('');
}

function renderProjects(filter='all') {
    const list = document.getElementById('projects-list');
    let projects = getVisibleProjects().sort((a,b)=>new Date(a.deadline)-new Date(b.deadline));
    if (filter!=='all') projects = projects.filter(p=>p.status===filter);
    if (!projects.length) { list.innerHTML=`<div class="empty-state"><p>No projects found.</p></div>`; return; }
    list.innerHTML = projects.map(p => {
        const c=getClient(p.clientId), color=c?c.color:'#6C5CE7';
        const sc=p.status==='upcoming'?'var(--blue)':p.status==='inprogress'?'var(--orange)':'var(--green)';
        return `<div class="project-row">
            <div class="project-status-dot" style="background:${sc}"></div>
            <div class="project-info"><div class="project-info-title">${esc(p.title)}</div><div class="project-info-client" style="color:${color}">${c?c.name:'Unknown'} <span class="status-badge ${p.status}">${p.status==='inprogress'?'In Progress':p.status}</span></div></div>
            <div class="project-dates"><div class="project-date-label">Deadline</div><div class="project-date-value">${fmtDate(p.deadline)}</div></div>
            <div class="project-charge-col">${p.charge ? fmt(p.charge) : '<span style="color:var(--text-muted)">Pending</span>'}</div>
            <div class="project-actions-col">
                <button class="btn btn-sm btn-icon" onclick="openEditProject(${p.id})" title="Edit"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg></button>
                <button class="btn btn-sm btn-icon" onclick="confirmDeleteProject(${p.id})" title="Delete"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg></button>
            </div>
        </div>`;
    }).join('');
}

function renderHistory() {
    const list = document.getElementById('history-list');
    let hist = [...data.history].sort((a,b)=>new Date(b.date)-new Date(a.date));
    if (!isAdmin() && currentUser) hist = hist.filter(h=>h.clientId===currentUser.clientId);
    if (!hist.length) { list.innerHTML=`<div class="empty-state"><p>No transactions yet.</p></div>`; return; }
    list.innerHTML = hist.map(h => {
        const ic = h.type==='credit';
        return `<div class="history-item">
            <div class="history-icon ${ic?'credit':'debit'}"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">${ic?'<line x1="12" y1="19" x2="12" y2="5"/><polyline points="5 12 12 5 19 12"/>':'<line x1="12" y1="5" x2="12" y2="19"/><polyline points="19 12 12 19 5 12"/>'}</svg></div>
            <div class="history-info"><div class="history-title">${esc(h.title)}</div><div class="history-sub">${esc(h.client)}</div></div>
            <div class="history-amount ${ic?'credit':'debit'}">${ic?'+':'-'}${fmt(h.amount)}</div>
            <div class="history-date">${fmtDate(h.date)}</div>
        </div>`;
    }).join('');
}

// ===== Modals =====
function openModal(id) { document.getElementById(id).classList.add('open'); }
function closeModal(id) { document.getElementById(id).classList.remove('open'); }
document.querySelectorAll('.modal-overlay').forEach(o=>o.addEventListener('click',e=>{if(e.target===o)o.classList.remove('open');}));

// ===== Client CRUD =====
document.getElementById('btn-add-client').addEventListener('click',()=>{
    document.getElementById('modal-client-title').textContent='Add New Client';
    document.getElementById('form-client').reset();
    document.getElementById('client-id').value='';
    document.getElementById('client-access-code').value=genCode();
    document.querySelectorAll('.color-swatch').forEach(s=>s.classList.remove('active'));
    document.querySelector('.color-swatch[data-color="#6C5CE7"]').classList.add('active');
    openModal('modal-client');
});

document.getElementById('modal-client-close').addEventListener('click',()=>closeModal('modal-client'));
document.getElementById('btn-cancel-client').addEventListener('click',()=>closeModal('modal-client'));
document.getElementById('btn-generate-code').addEventListener('click',()=>{document.getElementById('client-access-code').value=genCode();});

document.querySelectorAll('.color-swatch').forEach(s=>s.addEventListener('click',()=>{
    document.querySelectorAll('.color-swatch').forEach(x=>x.classList.remove('active')); s.classList.add('active');
}));

function openEditClient(id) {
    const c=getClient(id); if(!c) return;
    document.getElementById('modal-client-title').textContent='Edit Client';
    document.getElementById('client-id').value=c.id;
    document.getElementById('client-name').value=c.name;
    document.getElementById('client-email').value=c.email||'';
    document.getElementById('client-advance').value=c.advance;
    document.getElementById('client-access-code').value=c.accessCode||'';
    document.querySelectorAll('.color-swatch').forEach(s=>s.classList.toggle('active',s.dataset.color===c.color));
    openModal('modal-client');
}

document.getElementById('form-client').addEventListener('submit',e=>{
    e.preventDefault();
    const id=document.getElementById('client-id').value;
    const name=document.getElementById('client-name').value.trim();
    const email=document.getElementById('client-email').value.trim();
    const advance=Number(document.getElementById('client-advance').value);
    const accessCode=document.getElementById('client-access-code').value.trim();
    const color=document.querySelector('.color-swatch.active')?.dataset.color||'#6C5CE7';

    // Check duplicate access code
    const dup = data.clients.find(c => c.accessCode === accessCode && c.id !== Number(id));
    if (dup) { toast('Access code already used by '+dup.name,'error'); return; }
    if (accessCode === ADMIN_CODE) { toast('Cannot use the admin code as client code','error'); return; }

    if (id) {
        const c=getClient(Number(id));
        if(c){ const old=Number(c.advance); c.name=name; c.email=email; c.advance=advance; c.color=color; c.accessCode=accessCode;
            if(advance!==old) data.history.push({type:'credit',title:advance>old?'Advance updated (increased)':'Advance updated (decreased)',client:name,clientId:c.id,amount:Math.abs(advance-old),date:new Date().toISOString()});
            toast('Client updated!');
        }
    } else {
        const nc={id:data.nextClientId++,name,email,advance,color,accessCode};
        data.clients.push(nc);
        data.history.push({type:'credit',title:'Advance payment received',client:name,clientId:nc.id,amount:advance,date:new Date().toISOString()});
        toast('Client added!');
    }
    saveData(data); closeModal('modal-client'); renderAll(); populateClientSelect();
});

// ===== Add Money =====
function openAddMoney(cid) {
    document.getElementById('add-money-client-id').value=cid;
    document.getElementById('form-add-money').reset();
    document.getElementById('add-money-client-id').value=cid;
    openModal('modal-add-money');
}
document.getElementById('modal-add-money-close').addEventListener('click',()=>closeModal('modal-add-money'));
document.getElementById('btn-cancel-add-money').addEventListener('click',()=>closeModal('modal-add-money'));

document.getElementById('form-add-money').addEventListener('submit',e=>{
    e.preventDefault();
    const cid=Number(document.getElementById('add-money-client-id').value);
    const amt=Number(document.getElementById('add-money-amount').value);
    const note=document.getElementById('add-money-note').value.trim();
    const c=getClient(cid); if(!c) return;
    c.advance=Number(c.advance)+amt;
    data.history.push({type:'credit',title:note||'Additional payment received',client:c.name,clientId:c.id,amount:amt,date:new Date().toISOString()});
    saveData(data); closeModal('modal-add-money'); renderAll();
    toast(`${fmt(amt)} added to ${c.name}'s balance!`);
});

// ===== Project CRUD =====
function populateClientSelect() {
    const s=document.getElementById('project-client');
    s.innerHTML='<option value="">Select client...</option>'+data.clients.map(c=>`<option value="${c.id}">${esc(c.name)}</option>`).join('');
}

function openNewProjectModal() {
    document.getElementById('modal-project-title').textContent='Add New Project';
    document.getElementById('form-project').reset();
    document.getElementById('project-id').value='';
    document.getElementById('project-received-date').value=new Date().toISOString().split('T')[0];
    populateClientSelect();
    openModal('modal-project');
}
document.getElementById('btn-add-project').addEventListener('click',openNewProjectModal);
document.getElementById('btn-quick-add-project').addEventListener('click',openNewProjectModal);
document.getElementById('modal-project-close').addEventListener('click',()=>closeModal('modal-project'));
document.getElementById('btn-cancel-project').addEventListener('click',()=>closeModal('modal-project'));

function openEditProject(id) {
    if(!isAdmin()) return;
    const p=data.projects.find(x=>x.id===id); if(!p) return;
    document.getElementById('modal-project-title').textContent='Edit Project';
    populateClientSelect();
    document.getElementById('project-id').value=p.id;
    document.getElementById('project-client').value=p.clientId;
    document.getElementById('project-title').value=p.title;
    document.getElementById('project-description').value=p.description||'';
    document.getElementById('project-received-date').value=p.receivedDate||'';
    document.getElementById('project-deadline').value=p.deadline||'';
    document.getElementById('project-charge').value=p.charge;
    document.getElementById('project-status').value=p.status;
    openModal('modal-project');
}

document.getElementById('form-project').addEventListener('submit',e=>{
    e.preventDefault();
    const id=document.getElementById('project-id').value;
    const clientId=Number(document.getElementById('project-client').value);
    const title=document.getElementById('project-title').value.trim();
    const description=document.getElementById('project-description').value.trim();
    const receivedDate=document.getElementById('project-received-date').value;
    const deadline=document.getElementById('project-deadline').value;
    const chargeVal=document.getElementById('project-charge').value;
    const charge=chargeVal ? Number(chargeVal) : 0;
    const status=document.getElementById('project-status').value;
    const client=getClient(clientId);

    if (status === 'completed' && !chargeVal) { toast('Please enter the charge before marking as completed','error'); return; }

    if(id){
        const p=data.projects.find(x=>x.id===Number(id));
        if(p){
            const was=p.status==='completed', now=status==='completed';
            p.clientId=clientId; p.title=title; p.description=description;
            p.receivedDate=receivedDate; p.deadline=deadline; p.charge=charge; p.status=status;
            if(!was&&now&&client) data.history.push({type:'debit',title:`Completed: ${title}`,client:client.name,clientId,amount:charge,date:new Date().toISOString()});
            if(was&&!now){ const idx=data.history.findIndex(h=>h.type==='debit'&&h.title===`Completed: ${title}`&&h.clientId===clientId); if(idx!==-1) data.history.splice(idx,1); }
            toast('Project updated!');
        }
    } else {
        const np={id:data.nextProjectId++,clientId,title,description,receivedDate,deadline,charge,status,createdAt:new Date().toISOString()};
        data.projects.push(np);
        if(status==='completed'&&client) data.history.push({type:'debit',title:`Completed: ${title}`,client:client.name,clientId,amount:charge,date:new Date().toISOString()});
        toast('Project added!');
    }
    saveData(data); closeModal('modal-project'); renderAll();
});

// ===== Delete =====
let pendingDelete=null;
function showConfirm(t,m,fn){ document.getElementById('confirm-title').textContent=t; document.getElementById('confirm-message').textContent=m; pendingDelete=fn; openModal('modal-confirm'); }
document.getElementById('modal-confirm-close').addEventListener('click',()=>closeModal('modal-confirm'));
document.getElementById('btn-confirm-cancel').addEventListener('click',()=>closeModal('modal-confirm'));
document.getElementById('btn-confirm-ok').addEventListener('click',()=>{if(pendingDelete)pendingDelete(); closeModal('modal-confirm'); pendingDelete=null;});

function confirmDeleteClient(id){ const c=getClient(id); showConfirm('Delete Client',`Delete "${c?.name}" and all their projects?`,()=>{
    data.projects=data.projects.filter(p=>p.clientId!==id); data.clients=data.clients.filter(c=>c.id!==id);
    saveData(data); renderAll(); populateClientSelect(); toast('Client deleted.');
});}
function confirmDeleteProject(id){ const p=data.projects.find(x=>x.id===id); showConfirm('Delete Project',`Delete "${p?.title}"?`,()=>{
    data.projects=data.projects.filter(x=>x.id!==id); saveData(data); renderAll(); toast('Project deleted.');
});}

// ===== Filter Tabs =====
document.querySelectorAll('.filter-tab').forEach(t=>t.addEventListener('click',()=>{
    document.querySelectorAll('.filter-tab').forEach(x=>x.classList.remove('active')); t.classList.add('active');
    renderProjects(t.dataset.filter);
}));

// ===== Export & Push (Admin) =====
document.getElementById('btn-export-data').addEventListener('click', async () => {
    const btn = document.getElementById('btn-export-data');
    btn.disabled = true;
    btn.innerHTML = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="spin"><circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/></svg> Pushing...';

    try {
        const res = await fetch('http://localhost:4444/sync', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(data)
        });
        const result = await res.json();
        if (result.success) {
            toast(result.message);
        } else {
            toast(result.message, 'error');
        }
    } catch(e) {
        // Sync server not running — fallback to download
        const json = JSON.stringify(data, null, 2);
        const blob = new Blob([json], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url; a.download = 'data.json'; a.click();
        URL.revokeObjectURL(url);
        toast('Sync server not running. File downloaded instead. Run: node sync-server.js', 'error');
    }

    btn.disabled = false;
    btn.innerHTML = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg> Export';
});

// ===== Init: load remote data for clients, auto-login =====
async function initApp() {
    const savedSession = localStorage.getItem('editflow_session');
    let session = null;
    if (savedSession) {
        try { session = JSON.parse(savedSession); } catch(e) {}
    }

    // If client mode, load remote data.json instead of localStorage
    if (session && session.role === 'client') {
        const remote = await loadRemoteData();
        if (remote) {
            data = remote;
            // Don't save remote data to localStorage
        }
    }

    // If admin, always use localStorage (local working copy)
    // If no session, still try remote data so login can validate client codes
    if (!session || session.role !== 'client') {
        const localData = loadData();
        if (localData.clients.length > 0) {
            data = localData;
        } else {
            // No local data — try remote (fresh admin on hosted site)
            const remote = await loadRemoteData();
            if (remote) {
                data = remote;
                saveData(data);
            }
        }
    }

    populateClientSelect();

    if (session) {
        currentUser = session;
        if (currentUser.role === 'admin' || (currentUser.role === 'client' && getClient(currentUser.clientId))) {
            enterApp(false);
        } else {
            currentUser = null;
            localStorage.removeItem('editflow_session');
        }
    }
}

initApp();
