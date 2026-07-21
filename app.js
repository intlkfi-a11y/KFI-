/* ===================== 한국소방산업기술원 해외지원사업 ===================== */

/* -----------------------------------------------------------------------
   ⚠️ 설정 필요: 아래 firebaseConfig 값을 Firebase 콘솔에서 발급받은 값으로 교체하세요.
   프로젝트 설정 > 일반 > 내 앱 > SDK 설정 및 구성 에서 복사할 수 있습니다.
------------------------------------------------------------------------ */
const firebaseConfig = {
  apiKey: "AIzaSyD5TDQUrp2aXSyxVU-7Hvmbi3PqjHj0I7w",
  authDomain: "kfi-support.firebaseapp.com",
  projectId: "kfi-support",
  storageBucket: "kfi-support.firebasestorage.app",
  messagingSenderId: "368030011847",
  appId: "1:368030011847:web:fb09ccca7d459acd8cc9e2",
  measurementId: "G-YV403GXTKB"
};

const STATUS_COLOR = {
  "접수예정": "#2C4A7C", "접수중": "#E8A33D", "마감": "#94A1B5", "선정완료": "#1B8A6B",
  "예정": "#2C4A7C", "준비중": "#E8A33D", "진행중": "#2C4A7C", "종료": "#94A1B5"
};

let state = { programs: [], expos: [], resources: [], calendarEvents: [], calendarMeta: null };
let currentUser = null;
let db = null;
let firebaseReady = false;
let programStatFilter = null; // null | '접수예정' | '접수중' | 'closingSoon'
let expoStatFilter = null; // null | 'upcoming'
let calendarViewDate = new Date();
let selectedCalDate = null;

/* ---------- Firebase init ---------- */
function initFirebase(){
  if (firebaseConfig.apiKey === "YOUR_API_KEY"){
    document.getElementById("connBanner").classList.add("show");
    firebaseReady = false;
    return;
  }
  firebase.initializeApp(firebaseConfig);
  db = firebase.firestore();
  firebaseReady = true;

  db.collection("programs").orderBy("updatedAt","desc").onSnapshot(snap=>{
    state.programs = snap.docs.map(d=>({id:d.id, ...d.data()}));
    rerenderCurrentPage();
  }, err=>{ console.error(err); toast("지원사업 데이터를 불러오지 못했습니다"); });

  db.collection("expos").orderBy("updatedAt","desc").onSnapshot(snap=>{
    state.expos = snap.docs.map(d=>({id:d.id, ...d.data()}));
    rerenderCurrentPage();
  }, err=>{ console.error(err); toast("전시회 데이터를 불러오지 못했습니다"); });

  db.collection("resources").orderBy("updatedAt","desc").onSnapshot(snap=>{
    state.resources = snap.docs.map(d=>({id:d.id, ...d.data()}));
    rerenderCurrentPage();
  }, err=>{ console.error(err); toast("자료실 데이터를 불러오지 못했습니다"); });

  db.collection("calendarData").doc("main").onSnapshot(doc=>{
    state.calendarEvents = doc.exists ? (doc.data().events||[]) : [];
    state.calendarMeta = doc.exists ? {fileName:doc.data().fileName, updatedAt:doc.data().updatedAt} : null;
    rerenderCurrentPage();
  }, err=>{ console.error(err); toast("캘린더 데이터를 불러오지 못했습니다"); });

  firebase.auth().onAuthStateChanged(user=>{
    currentUser = user;
    applyAdminUI();
  });
}

function rerenderCurrentPage(){
  const current = document.querySelector(".page.active")?.id.replace("page-","") || "dashboard";
  renderDashboard();
  if(current==="programs") renderPrograms();
  if(current==="expos") renderExpos();
  if(current==="library") renderLibrary();
  if(current==="calendar") renderCalendarPage();
  if(current==="admin") renderAdmin();
}

/* ---------- Tabs ---------- */
function showPage(name){
  document.querySelectorAll(".page").forEach(p=>p.classList.remove("active"));
  document.querySelectorAll(".tab-btn").forEach(b=>b.classList.remove("active"));
  document.getElementById("page-"+name).classList.add("active");
  document.querySelector(`.tab-btn[data-page="${name}"]`).classList.add("active");
  if(name==="dashboard") renderDashboard();
  if(name==="programs") renderPrograms();
  if(name==="expos") renderExpos();
  if(name==="library") renderLibrary();
  if(name==="calendar") renderCalendarPage();
  if(name==="admin") renderAdmin();
}
function goToProgramsFilter(type){
  programStatFilter = type;
  showPage("programs");
}
function goToExposFilter(type){
  expoStatFilter = type;
  showPage("expos");
}

/* ---------- Admin auth ---------- */
function isAdmin(){ return !!currentUser; }
function toggleAdmin(){
  if(!firebaseReady){ toast("Firebase 설정이 필요합니다"); return; }
  if(isAdmin()){
    firebase.auth().signOut();
    toast("로그아웃되었습니다");
  } else {
    openLoginModal();
  }
}
function openLoginModal(){ document.getElementById("loginModalBackdrop").classList.add("show"); }
function closeLoginModal(){ document.getElementById("loginModalBackdrop").classList.remove("show"); }
function doLogin(ev){
  ev.preventDefault();
  const email = document.getElementById("loginEmail").value.trim();
  const pw = document.getElementById("loginPassword").value;
  firebase.auth().signInWithEmailAndPassword(email, pw)
    .then(()=>{ closeLoginModal(); toast("관리자로 로그인되었습니다"); document.getElementById("loginPassword").value=""; })
    .catch(err=>{
      console.error("[로그인 오류]", err.code, err.message);
      const msg = (err.code==="auth/invalid-credential"||err.code==="auth/wrong-password"||err.code==="auth/user-not-found")
        ? "이메일 또는 비밀번호가 올바르지 않습니다" : "로그인에 실패했습니다: "+err.message;
      toast(msg);
    });
}
function applyAdminUI(){
  const on = isAdmin();
  document.getElementById("adminToggleBtn").classList.toggle("on", on);
  document.getElementById("adminToggleBtn").textContent = on ? `🔓 ${currentUser.email}` : "🔒 관리자 로그인";
  document.getElementById("progAddBtn").style.display = on ? "inline-flex" : "none";
  document.getElementById("expoAddBtn").style.display = on ? "inline-flex" : "none";
  document.getElementById("libAddBtn").style.display = on ? "inline-flex" : "none";
  document.getElementById("calAdminBox").style.display = on ? "block" : "none";
  rerenderCurrentPage();
}

/* ---------- Utils ---------- */
function fmtDate(d){ return d ? d.replace(/-/g,".") : "-"; }
function daysUntil(dateStr){
  if(!dateStr) return null;
  const target = new Date(dateStr+"T00:00:00");
  const today = new Date(); today.setHours(0,0,0,0);
  return Math.round((target-today)/86400000);
}
function ddayLabel(n){ if(n===0) return "D-DAY"; return n>0 ? "D-"+n : "D+"+Math.abs(n); }
function ddayColor(n){ if(n<=7) return "var(--ember)"; if(n<=30) return "var(--amber)"; return "var(--steel)"; }
function toast(msg){
  const t = document.getElementById("toast");
  t.textContent = msg;
  t.classList.add("show");
  clearTimeout(window.__toastTimer);
  window.__toastTimer = setTimeout(()=>t.classList.remove("show"), 2400);
}
function badge(status){ return `<span class="badge st-${status.replace(/\s/g,"")}">${status}</span>`; }
function getEffectiveStatus(p){
  if(p.status === "선정완료") return "선정완료";
  if(!p.applyStart || !p.applyEnd) return p.status || "접수예정";
  const today = new Date(); today.setHours(0,0,0,0);
  const start = new Date(p.applyStart+"T00:00:00");
  const end = new Date(p.applyEnd+"T00:00:00");
  if(today < start) return "접수예정";
  if(today > end) return "마감";
  return "접수중";
}
function normalizeUrl(url){
  if(!url) return "";
  url = url.trim(); if(!url) return "";
  if(!/^https?:\/\//i.test(url)) url = "https://"+url;
  return url;
}
function toDriveDownloadUrl(url){
  if(!url) return url;
  // https://drive.google.com/file/d/FILE_ID/view?usp=... 형태
  let m = url.match(/drive\.google\.com\/file\/d\/([a-zA-Z0-9_-]+)/);
  if(m) return `https://drive.google.com/uc?export=download&id=${m[1]}`;
  // https://drive.google.com/open?id=FILE_ID 또는 ?id=FILE_ID 형태
  if(url.includes("drive.google.com")){
    m = url.match(/[?&]id=([a-zA-Z0-9_-]+)/);
    if(m) return `https://drive.google.com/uc?export=download&id=${m[1]}`;
  }
  return url;
}
function esc(str){ return (str||"").replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;"); }

/* ===================== DASHBOARD ===================== */
function renderDashboard(){
  document.getElementById("dashDate").textContent = new Date().toLocaleDateString("ko-KR",{year:"numeric",month:"long",day:"numeric",weekday:"long"});

  const programs = state.programs, expos = state.expos;
  const applying = programs.filter(p=>getEffectiveStatus(p)==="접수중").length;
  const closingSoon = programs.filter(p=>{ const d=daysUntil(p.applyEnd); return getEffectiveStatus(p)==="접수중" && d!==null && d>=0 && d<=7; }).length;
  const upcoming = programs.filter(p=>getEffectiveStatus(p)==="접수예정").length;
  const upcomingExpo = expos.filter(e=>e.status==="예정"||e.status==="준비중").length;

  const stats = [
    {label:"전체 지원사업", value:programs.length, unit:"건", accent:"var(--steel)", onclick:"goToProgramsFilter(null)"},
    {label:"접수중", value:applying, unit:"건", accent:"var(--amber)", onclick:"goToProgramsFilter('접수중')"},
    {label:"접수마감 D-7 이내", value:closingSoon, unit:"건", accent:"var(--ember)", onclick:"goToProgramsFilter('closingSoon')"},
    {label:"접수예정", value:upcoming, unit:"건", accent:"var(--steel)", onclick:"goToProgramsFilter('접수예정')"},
    {label:"예정 해외일정", value:upcomingExpo, unit:"건", accent:"var(--teal)", onclick:"goToExposFilter('upcoming')"}
  ];
  document.getElementById("statGrid").innerHTML = stats.map(s=>`
    <div class="stat-card clickable" style="--accent:${s.accent}" onclick="${s.onclick}">
      <div class="stat-label">${s.label}</div>
      <div class="stat-value">${s.value}<small>${s.unit}</small></div>
    </div>`).join("");

  const order = ["접수예정","접수중","마감","선정완료"];
  const counts = order.map(st=>programs.filter(p=>getEffectiveStatus(p)===st).length);
  const total = programs.length || 1;
  document.getElementById("distTotal").textContent = `총 ${programs.length}건`;
  document.getElementById("distBar").innerHTML = order.map((st,i)=>{
    const pct = (counts[i]/total*100).toFixed(1);
    return counts[i]>0 ? `<div class="dist-seg" style="width:${pct}%; background:${STATUS_COLOR[st]}" title="${st} ${counts[i]}건"></div>` : "";
  }).join("");
  document.getElementById("distLegend").innerHTML = order.map((st,i)=>`<span><i style="background:${STATUS_COLOR[st]}"></i>${st} ${counts[i]}</span>`).join("");

  const items = [];
  programs.forEach(p=>{ if(p.applyEnd){ const d=daysUntil(p.applyEnd); if(d!==null && d>=-3 && d<=90) items.push({d, title:p.name, meta:`접수 마감 · ${p.location||"-"}`, date:p.applyEnd}); }});
  expos.forEach(e=>{ if(e.start){ const d=daysUntil(e.start); if(d!==null && d>=-3 && d<=90) items.push({d, title:e.name, meta:`${e.category||"전시회"} 시작 · ${e.location||"-"}`, date:e.start}); }});
  items.sort((a,b)=>a.d-b.d);
  const tl = document.getElementById("ddayTimeline");
  tl.innerHTML = items.length ? items.map(it=>`
    <div class="tl-item">
      <div class="tl-dday" style="background:rgba(255,255,255,0.08); color:${ddayColor(it.d)}">${ddayLabel(it.d)}</div>
      <div class="tl-body"><div class="tl-title">${esc(it.title)}</div><div class="tl-meta">${esc(it.meta)} · ${fmtDate(it.date)}</div></div>
    </div>`).join("") : `<div class="tl-empty">90일 이내 예정된 일정이 없습니다.</div>`;

  const all = [
    ...programs.map(p=>({...p, status:getEffectiveStatus(p), __type:"지원사업", __label:p.name, __sub:`${p.location||"-"} · ${getEffectiveStatus(p)}`})),
    ...expos.map(e=>({...e, __type:e.category||"해외일정", __label:e.name, __sub:`${e.location||"-"} · ${e.status}`}))
  ].slice(0,5); // 이미 updatedAt desc 정렬된 상태에서 병합
  document.getElementById("recentList").innerHTML = all.length ? all.map(it=>`
    <div class="item-card" style="cursor:default;">
      <div class="item-main">
        <div class="item-title-row"><span class="item-title">${esc(it.__label)}</span>${badge(it.status)}</div>
        <div class="item-meta"><span>${it.__type}</span><span>${esc(it.__sub)}</span></div>
      </div>
    </div>`).join("") : `<div class="empty-state">등록된 데이터가 없습니다.</div>`;
}

/* ===================== PROGRAMS (지원사업) ===================== */
function getFilteredPrograms(){
  const q = document.getElementById("progSearch").value.trim().toLowerCase();
  return state.programs.filter(p=>{
    if(programStatFilter){
      if(programStatFilter==="closingSoon"){
        const d = daysUntil(p.applyEnd);
        if(!(getEffectiveStatus(p)==="접수중" && d!==null && d>=0 && d<=7)) return false;
      } else if(getEffectiveStatus(p)!==programStatFilter) return false;
    }
    if(q && !(p.name.toLowerCase().includes(q) || (p.location||"").toLowerCase().includes(q))) return false;
    return true;
  }).sort((a,b)=> (a.applyEnd||"9999").localeCompare(b.applyEnd||"9999"));
}
function toggleProgramFilter(type){
  programStatFilter = (programStatFilter===type) ? null : type;
  renderPrograms();
}
function clearProgramFilter(){
  programStatFilter = null;
  renderPrograms();
}
function renderProgramTopStats(){
  const programs = state.programs;
  const pendingCount = programs.filter(p=>getEffectiveStatus(p)==="접수예정").length;
  const activeCount = programs.filter(p=>getEffectiveStatus(p)==="접수중").length;
  const cards = [
    {key:null, label:"전체", value:programs.length, accent:"var(--steel)"},
    {key:"접수예정", label:"접수예정", value:pendingCount, accent:"var(--steel)"},
    {key:"접수중", label:"접수중", value:activeCount, accent:"var(--amber)"}
  ];
  document.getElementById("progStatGrid").innerHTML = cards.map(c=>{
    const active = programStatFilter===c.key;
    return `<div class="stat-card clickable ${active?'active-filter':''}" style="--accent:${c.accent}" onclick="toggleProgramFilter(${c.key?`'${c.key}'`:'null'})">
      <div class="stat-label">${c.label}</div>
      <div class="stat-value">${c.value}<small>건</small></div>
    </div>`;
  }).join("");
}
function renderProgramFilterChip(){
  const wrap = document.getElementById("progFilterChipWrap");
  if(!programStatFilter){ wrap.innerHTML=""; return; }
  const label = programStatFilter==="closingSoon" ? "접수마감 D-7 이내" : programStatFilter;
  wrap.innerHTML = `<div class="filter-chip" onclick="clearProgramFilter()">🔎 "${label}" 필터 적용됨 · 해제 ✕</div>`;
}

function renderPrograms(){
  renderProgramTopStats();
  renderProgramFilterChip();
  const list = getFilteredPrograms();
  const admin = isAdmin();
  document.getElementById("progList").innerHTML = list.length ? list.map(p=>{
    const eff = getEffectiveStatus(p);
    const d = daysUntil(p.applyEnd);
    const ddayTag = (eff==="접수중"||eff==="접수예정") && d!==null ? `<span class="badge" style="background:#EEF1F6;color:${ddayColor(d)}">${ddayLabel(d)}</span>` : "";
    return `
    <div class="item-card" onclick="openProgramDetail('${p.id}')">
      <div class="item-main">
        <div class="item-title-row"><span class="item-title">${esc(p.name)}</span>${badge(eff)}${ddayTag}</div>
        <div class="item-meta">
          <span>진행장소 <b>${esc(p.location)||"-"}</b></span>
          <span>진행일정 <b>${fmtDate(p.eventStart)} ~ ${fmtDate(p.eventEnd)}</b></span>
          <span>접수기간 <b>${fmtDate(p.applyStart)} ~ ${fmtDate(p.applyEnd)}</b></span>
        </div>
      </div>
      <div class="item-actions" onclick="event.stopPropagation()">
        ${p.url?`<button class="btn btn-link btn-sm" onclick="window.open('${normalizeUrl(p.url)}','_blank')">🔗 공고문</button>`:""}
        ${admin?`<button class="btn btn-ghost btn-sm" onclick="openProgramModal('${p.id}')">수정</button>
        <button class="btn btn-ghost btn-sm" onclick="deleteProgram('${p.id}')">삭제</button>`:""}
      </div>
    </div>`;
  }).join("") : `<div class="empty-state">조건에 맞는 지원사업이 없습니다.</div>`;
}

function openProgramDetail(id){
  const p = state.programs.find(x=>x.id===id);
  if(!p) return;
  document.getElementById("progDetailTitle").textContent = p.name;
  const eff = getEffectiveStatus(p);
  const d = daysUntil(p.applyEnd);
  document.getElementById("progDetailBody").innerHTML = `
    <div class="item-title-row" style="margin-bottom:16px;">${badge(eff)}${(eff==="접수중"||eff==="접수예정") && d!==null ? `<span class="badge" style="background:#EEF1F6;color:${ddayColor(d)}">접수마감 ${ddayLabel(d)}</span>` : ""}</div>
    <div class="detail-grid">
      <div class="detail-row"><div class="dlabel">진행 일정</div><div class="dval">${fmtDate(p.eventStart)} ~ ${fmtDate(p.eventEnd)}</div></div>
      <div class="detail-row"><div class="dlabel">진행 장소</div><div class="dval">${esc(p.location)||"-"}</div></div>
      <div class="detail-row"><div class="dlabel">접수 기간</div><div class="dval">${fmtDate(p.applyStart)} ~ ${fmtDate(p.applyEnd)}</div></div>
      <div class="detail-row"><div class="dlabel">공고문</div><div class="dval">${p.url?`<button class="btn btn-link btn-sm" onclick="window.open('${normalizeUrl(p.url)}','_blank')">🔗 공고문 홈페이지 바로가기</button>`:"등록된 링크 없음"}</div></div>
    </div>
    <div class="detail-row"><div class="dlabel">문의처</div><div class="dval">${[p.contactPhone?`☎ ${esc(p.contactPhone)}`:"", p.contactEmail?`✉ ${esc(p.contactEmail)}`:""].filter(Boolean).join("&nbsp;&nbsp;&nbsp;")||"-"}</div></div>
    <div class="detail-row"><div class="dlabel">자격조건</div><div class="dval">${esc(p.qualification)||"-"}</div></div>
    <div class="detail-row"><div class="dlabel">지원내용</div><div class="dval">${esc(p.content)||"-"}</div></div>
    ${p.memo?`<div class="detail-row"><div class="dlabel">메모</div><div class="dval">${esc(p.memo)}</div></div>`:""}
    ${isAdmin()?`<div class="form-actions" style="padding:0;"><button class="btn btn-ghost" onclick="closeProgramDetail(); openProgramModal('${p.id}')">수정하기</button></div>`:""}
  `;
  document.getElementById("progDetailBackdrop").classList.add("show");
}
function closeProgramDetail(){ document.getElementById("progDetailBackdrop").classList.remove("show"); }

function openProgramModal(id){
  if(!isAdmin()){ toast("관리자 로그인이 필요합니다"); return; }
  document.getElementById("progModalTitle").textContent = id ? "지원사업 정보 수정" : "지원사업 등록";
  document.getElementById("progId").value = id || "";
  const p = id ? state.programs.find(x=>x.id===id) : null;
  document.getElementById("progName").value = p?.name || "";
  document.getElementById("progStatus").value = p?.status || "접수예정";
  document.getElementById("progLocation").value = p?.location || "";
  document.getElementById("progEventStart").value = p?.eventStart || "";
  document.getElementById("progEventEnd").value = p?.eventEnd || "";
  document.getElementById("progApplyStart").value = p?.applyStart || "";
  document.getElementById("progApplyEnd").value = p?.applyEnd || "";
  document.getElementById("progUrl").value = p?.url || "";
  document.getElementById("progContactPhone").value = p?.contactPhone || "";
  document.getElementById("progContactEmail").value = p?.contactEmail || "";
  document.getElementById("progQualification").value = p?.qualification || "";
  document.getElementById("progContent").value = p?.content || "";
  document.getElementById("progMemo").value = p?.memo || "";
  document.getElementById("progModalBackdrop").classList.add("show");
}
function closeProgramModal(){ document.getElementById("progModalBackdrop").classList.remove("show"); }
function saveProgram(ev){
  ev.preventDefault();
  if(!isAdmin()){ toast("관리자 로그인이 필요합니다"); return; }
  const id = document.getElementById("progId").value;
  const data = {
    name: document.getElementById("progName").value.trim(),
    status: document.getElementById("progStatus").value,
    location: document.getElementById("progLocation").value.trim(),
    eventStart: document.getElementById("progEventStart").value,
    eventEnd: document.getElementById("progEventEnd").value,
    applyStart: document.getElementById("progApplyStart").value,
    applyEnd: document.getElementById("progApplyEnd").value,
    url: document.getElementById("progUrl").value.trim(),
    contactPhone: document.getElementById("progContactPhone").value.trim(),
    contactEmail: document.getElementById("progContactEmail").value.trim(),
    qualification: document.getElementById("progQualification").value.trim(),
    content: document.getElementById("progContent").value.trim(),
    memo: document.getElementById("progMemo").value.trim(),
    updatedAt: firebase.firestore.FieldValue.serverTimestamp()
  };
  const ref = id ? db.collection("programs").doc(id) : db.collection("programs").doc();
  ref.set(data, {merge:true})
    .then(()=>{ closeProgramModal(); toast("저장되었습니다"); })
    .catch(err=>toast("저장 실패: "+err.message));
}
function deleteProgram(id){
  if(!isAdmin()){ toast("관리자 로그인이 필요합니다"); return; }
  if(!confirm("이 지원사업 정보를 삭제할까요?")) return;
  db.collection("programs").doc(id).delete()
    .then(()=>toast("삭제되었습니다"))
    .catch(err=>toast("삭제 실패: "+err.message));
}

/* ===================== EXPOS ===================== */
const EXPO_CATEGORIES = ["전시회","시장개척단","설명회","간담회","기타"];
let expoCategoryFilter = null; // null | one of EXPO_CATEGORIES

function getFilteredExpos(){
  const q = document.getElementById("expoSearch").value.trim().toLowerCase();
  return state.expos.filter(e=>{
    if(expoStatFilter==="upcoming" && !(e.status==="예정"||e.status==="준비중")) return false;
    if(expoCategoryFilter && (e.category||"전시회")!==expoCategoryFilter) return false;
    if(q && !(e.name.toLowerCase().includes(q) || (e.location||"").toLowerCase().includes(q))) return false;
    return true;
  }).sort((a,b)=> (a.start||"9999").localeCompare(b.start||"9999"));
}
function toggleExpoCategoryFilter(cat){
  expoCategoryFilter = (expoCategoryFilter===cat) ? null : cat;
  renderExpos();
}
function clearExpoFilter(){
  expoStatFilter = null;
  expoCategoryFilter = null;
  renderExpos();
}
function renderExpoTopStats(){
  const expos = state.expos;
  const cards = [
    {key:null, label:"전체", value:expos.length, accent:"var(--steel)"},
    ...EXPO_CATEGORIES.map(cat=>({key:cat, label:cat, value:expos.filter(e=>(e.category||"전시회")===cat).length, accent:categoryColor(cat)}))
  ];
  document.getElementById("expoStatGrid").innerHTML = cards.map(c=>{
    const active = expoCategoryFilter===c.key;
    return `<div class="stat-card clickable ${active?'active-filter':''}" style="--accent:${c.accent}" onclick="toggleExpoCategoryFilter(${c.key?`'${c.key}'`:'null'})">
      <div class="stat-label">${c.label}</div>
      <div class="stat-value">${c.value}<small>건</small></div>
    </div>`;
  }).join("");
}
function renderExpoFilterChip(){
  const wrap = document.getElementById("expoFilterChipWrap");
  const labels = [];
  if(expoStatFilter==="upcoming") labels.push("예정 해외일정");
  if(expoCategoryFilter) labels.push(expoCategoryFilter);
  if(!labels.length){ wrap.innerHTML=""; return; }
  wrap.innerHTML = `<div class="filter-chip" onclick="clearExpoFilter()">🔎 "${labels.join(", ")}" 필터 적용됨 · 해제 ✕</div>`;
}
function renderExpos(){
  renderExpoTopStats();
  renderExpoFilterChip();
  const list = getFilteredExpos();
  const admin = isAdmin();
  document.getElementById("expoList").innerHTML = list.length ? list.map(e=>`
    <div class="item-card" style="cursor:default;">
      <div class="item-main">
        <div class="item-title-row"><span class="item-title">${esc(e.name)}</span>${badge(e.status)}<span class="badge" style="background:#EEF1F6;color:var(--slate)">${esc(e.category)||"전시회"}</span></div>
        <div class="item-meta">
          <span>장소 <b>${esc(e.location)||"-"}</b></span>
          <span>기간 <b>${fmtDate(e.start)} ~ ${fmtDate(e.end)}</b></span>
          <span>참가기업 <b>${e.participants||0}개사</b></span>
          ${e.memo?`<span>${esc(e.memo)}</span>`:""}
        </div>
      </div>
      ${admin?`<div class="item-actions">
        <button class="btn btn-ghost btn-sm" onclick="openExpoModal('${e.id}')">수정</button>
        <button class="btn btn-ghost btn-sm" onclick="deleteExpo('${e.id}')">삭제</button>
      </div>`:""}
    </div>`).join("") : `<div class="empty-state">조건에 맞는 일정이 없습니다.</div>`;
}
function openExpoModal(id){
  if(!isAdmin()){ toast("관리자 로그인이 필요합니다"); return; }
  document.getElementById("expoModalTitle").textContent = id ? "일정 정보 수정" : "일정 등록";
  document.getElementById("expoId").value = id || "";
  const e = id ? state.expos.find(x=>x.id===id) : null;
  document.getElementById("expoName").value = e?.name || "";
  document.getElementById("expoCategory").value = e?.category || "전시회";
  document.getElementById("expoLocation").value = e?.location || "";
  document.getElementById("expoStatus").value = e?.status || "예정";
  document.getElementById("expoStart").value = e?.start || "";
  document.getElementById("expoEnd").value = e?.end || "";
  document.getElementById("expoParticipants").value = e?.participants || "";
  document.getElementById("expoMemo").value = e?.memo || "";
  document.getElementById("expoModalBackdrop").classList.add("show");
}
function closeExpoModal(){ document.getElementById("expoModalBackdrop").classList.remove("show"); }
function saveExpo(ev){
  ev.preventDefault();
  if(!isAdmin()){ toast("관리자 로그인이 필요합니다"); return; }
  const id = document.getElementById("expoId").value;
  const data = {
    name: document.getElementById("expoName").value.trim(),
    category: document.getElementById("expoCategory").value,
    location: document.getElementById("expoLocation").value.trim(),
    status: document.getElementById("expoStatus").value,
    start: document.getElementById("expoStart").value,
    end: document.getElementById("expoEnd").value,
    participants: Number(document.getElementById("expoParticipants").value)||0,
    memo: document.getElementById("expoMemo").value.trim(),
    updatedAt: firebase.firestore.FieldValue.serverTimestamp()
  };
  const ref = id ? db.collection("expos").doc(id) : db.collection("expos").doc();
  ref.set(data, {merge:true})
    .then(()=>{ closeExpoModal(); toast("저장되었습니다"); })
    .catch(err=>toast("저장 실패: "+err.message));
}
function deleteExpo(id){
  if(!isAdmin()){ toast("관리자 로그인이 필요합니다"); return; }
  if(!confirm("이 전시회 정보를 삭제할까요?")) return;
  db.collection("expos").doc(id).delete()
    .then(()=>toast("삭제되었습니다"))
    .catch(err=>toast("삭제 실패: "+err.message));
}

/* ===================== LIBRARY (자료실) ===================== */
const LIB_CATEGORIES = ["해외 수출정보","지원사업 정보"];
let libCategoryFilter = null;

function getFilteredLibrary(){
  const q = document.getElementById("libSearch").value.trim().toLowerCase();
  return state.resources.filter(r=>{
    if(libCategoryFilter && r.category!==libCategoryFilter) return false;
    if(q && !(r.title.toLowerCase().includes(q) || (r.description||"").toLowerCase().includes(q))) return false;
    return true;
  });
}
function toggleLibraryFilter(cat){
  libCategoryFilter = (libCategoryFilter===cat) ? null : cat;
  renderLibrary();
}
function clearLibraryFilter(){
  libCategoryFilter = null;
  renderLibrary();
}
function renderLibraryTopStats(){
  const resources = state.resources;
  const cards = [
    {key:null, label:"전체", value:resources.length, accent:"var(--steel)"},
    ...LIB_CATEGORIES.map(cat=>({key:cat, label:cat, value:resources.filter(r=>r.category===cat).length, accent:categoryColor(cat)}))
  ];
  document.getElementById("libStatGrid").innerHTML = cards.map(c=>{
    const active = libCategoryFilter===c.key;
    return `<div class="stat-card clickable ${active?'active-filter':''}" style="--accent:${c.accent}" onclick="toggleLibraryFilter(${c.key?`'${c.key}'`:'null'})">
      <div class="stat-label">${c.label}</div>
      <div class="stat-value">${c.value}<small>건</small></div>
    </div>`;
  }).join("");
}
function renderLibraryFilterChip(){
  const wrap = document.getElementById("libFilterChipWrap");
  if(!libCategoryFilter){ wrap.innerHTML=""; return; }
  wrap.innerHTML = `<div class="filter-chip" onclick="clearLibraryFilter()">🔎 "${libCategoryFilter}" 필터 적용됨 · 해제 ✕</div>`;
}
function renderLibrary(){
  renderLibraryTopStats();
  renderLibraryFilterChip();
  const list = getFilteredLibrary();
  const admin = isAdmin();
  document.getElementById("libList").innerHTML = list.length ? list.map(r=>{
    const dlUrl = toDriveDownloadUrl(normalizeUrl(r.url));
    return `
    <div class="item-card" ${r.url?`onclick="window.open('${dlUrl}','_blank')"`:'style="cursor:default;"'}>
      <div class="item-main">
        <div class="item-title-row"><span class="item-title">${esc(r.title)}</span><span class="badge" style="background:#EEF1F6;color:var(--slate)">${esc(r.category)}</span></div>
        ${r.description?`<div class="item-meta"><span>${esc(r.description)}</span></div>`:""}
      </div>
      <div class="item-actions" onclick="event.stopPropagation()">
        ${r.url?`<button class="btn btn-link btn-sm" onclick="window.open('${dlUrl}','_blank')">⬇ 다운로드</button>`:""}
        ${admin?`<button class="btn btn-ghost btn-sm" onclick="openResourceModal('${r.id}')">수정</button>
        <button class="btn btn-ghost btn-sm" onclick="deleteResource('${r.id}')">삭제</button>`:""}
      </div>
    </div>`;
  }).join("") : `<div class="empty-state">등록된 자료가 없습니다.</div>`;
}
function openResourceModal(id){
  if(!isAdmin()){ toast("관리자 로그인이 필요합니다"); return; }
  document.getElementById("libModalTitle").textContent = id ? "자료 수정" : "자료 등록";
  document.getElementById("libId").value = id || "";
  const r = id ? state.resources.find(x=>x.id===id) : null;
  document.getElementById("libTitle").value = r?.title || "";
  document.getElementById("libCategory").value = r?.category || "해외 수출정보";
  document.getElementById("libUrl").value = r?.url || "";
  document.getElementById("libDescription").value = r?.description || "";
  document.getElementById("libModalBackdrop").classList.add("show");
}
function closeResourceModal(){ document.getElementById("libModalBackdrop").classList.remove("show"); }
function saveResource(ev){
  ev.preventDefault();
  if(!isAdmin()){ toast("관리자 로그인이 필요합니다"); return; }
  const id = document.getElementById("libId").value;
  const data = {
    title: document.getElementById("libTitle").value.trim(),
    category: document.getElementById("libCategory").value,
    url: document.getElementById("libUrl").value.trim(),
    description: document.getElementById("libDescription").value.trim(),
    updatedAt: firebase.firestore.FieldValue.serverTimestamp()
  };
  const ref = id ? db.collection("resources").doc(id) : db.collection("resources").doc();
  ref.set(data, {merge:true})
    .then(()=>{ closeResourceModal(); toast("저장되었습니다"); })
    .catch(err=>toast("저장 실패: "+err.message));
}
function deleteResource(id){
  if(!isAdmin()){ toast("관리자 로그인이 필요합니다"); return; }
  if(!confirm("이 자료를 삭제할까요?")) return;
  db.collection("resources").doc(id).delete()
    .then(()=>toast("삭제되었습니다"))
    .catch(err=>toast("삭제 실패: "+err.message));
}

/* ===================== CALENDAR (캘린더) ===================== */
const CAL_PALETTE = ["#2C4A7C","#1B8A6B","#E8A33D","#C4432B","#7C5CBF","#0F8B8D"];
function categoryColor(cat){
  if(!cat) return "var(--slate)";
  let hash = 0;
  for(let i=0;i<cat.length;i++) hash = cat.charCodeAt(i) + ((hash<<5)-hash);
  return CAL_PALETTE[Math.abs(hash) % CAL_PALETTE.length];
}
function eventsOnDate(dateStr){
  return state.calendarEvents.filter(e=>{
    const s = e.startDate || e.date; // e.date는 이전 버전 호환용
    const en = e.endDate || s;
    return s && en && s<=dateStr && dateStr<=en;
  });
}
function renderCalendarPage(){
  const info = document.getElementById("calUpdatedInfo");
  if(state.calendarMeta){
    const dt = state.calendarMeta.updatedAt?.toDate ? state.calendarMeta.updatedAt.toDate() : null;
    const dtStr = dt ? dt.toLocaleDateString("ko-KR",{year:"numeric",month:"long",day:"numeric"}) : "";
    info.textContent = `${state.calendarMeta.fileName||"업로드된 파일"} · 마지막 업데이트 ${dtStr} · 총 ${state.calendarEvents.length}건`;
  } else {
    info.textContent = "지원사업 · 해외 주요 일정 통합 캘린더 (업로드된 데이터 없음)";
  }
  renderCalendarGrid();
  renderCalDayEvents();
}
function changeCalendarMonth(delta){
  calendarViewDate.setMonth(calendarViewDate.getMonth()+delta);
  selectedCalDate = null;
  renderCalendarGrid();
  renderCalDayEvents();
}
function selectCalDay(dateStr){
  selectedCalDate = (selectedCalDate===dateStr) ? null : dateStr;
  renderCalendarGrid();
  renderCalDayEvents();
}
function pad2(n){ return String(n).padStart(2,"0"); }
function renderCalendarGrid(){
  const y = calendarViewDate.getFullYear(), m = calendarViewDate.getMonth();
  document.getElementById("calMonthLabel").textContent = `${y}년 ${m+1}월`;
  const firstDow = new Date(y, m, 1).getDay();
  const daysInMonth = new Date(y, m+1, 0).getDate();
  const todayStr = (()=>{ const t=new Date(); return `${t.getFullYear()}-${pad2(t.getMonth()+1)}-${pad2(t.getDate())}`; })();

  const dows = ["일","월","화","수","목","금","토"];
  let html = dows.map(d=>`<div class="cal-dow">${d}</div>`).join("");
  for(let i=0;i<firstDow;i++) html += `<div class="cal-cell empty"></div>`;
  for(let d=1; d<=daysInMonth; d++){
    const dateStr = `${y}-${pad2(m+1)}-${pad2(d)}`;
    const evs = eventsOnDate(dateStr);
    const isToday = dateStr===todayStr;
    const isSelected = dateStr===selectedCalDate;
    const isSun = (firstDow + d - 1) % 7 === 0;
    const pills = evs.slice(0,3).map(e=>`<div class="cal-event-pill" style="background:${categoryColor(e.category)}" title="${esc(e.title)}">${esc(e.title)}</div>`).join("");
    const more = evs.length>3 ? `<div class="cal-more">+${evs.length-3}건 더보기</div>` : "";
    html += `<div class="cal-cell ${isToday?'today':''} ${isSelected?'selected':''} ${isSun?'sun':''}" onclick="selectCalDay('${dateStr}')">
      <div class="cal-daynum">${d}</div>
      ${evs.length?`<div class="cal-events">${pills}</div>${more}`:""}
    </div>`;
  }
  document.getElementById("calGrid").innerHTML = html;
}
function renderCalDayEvents(){
  const box = document.getElementById("calDayEvents");
  if(!selectedCalDate){ box.innerHTML = ""; return; }
  const evs = eventsOnDate(selectedCalDate);
  const label = selectedCalDate.replace(/-/g,".");
  box.innerHTML = `
    <div class="cal-day-events-head">${label} 일정 ${evs.length}건</div>
    <div class="card-list">
      ${evs.length ? evs.map(e=>`
        <div class="item-card" style="cursor:default;">
          <div class="item-main">
            <div class="item-title-row"><span class="item-title">${esc(e.title)}</span>${e.category?`<span class="badge" style="background:#EEF1F6;color:${categoryColor(e.category)}">${esc(e.category)}</span>`:""}</div>
            <div class="item-meta">${e.location?`<span>장소 <b>${esc(e.location)}</b></span>`:""}${e.memo?`<span>${esc(e.memo)}</span>`:""}</div>
          </div>
        </div>`).join("") : `<div class="empty-state">이 날짜에 등록된 일정이 없습니다.</div>`}
    </div>`;
}
function excelCellToISODate(v){
  if(v instanceof Date && !isNaN(v)) return `${v.getFullYear()}-${pad2(v.getMonth()+1)}-${pad2(v.getDate())}`;
  if(typeof v === "number"){
    const d = XLSX.SSF.parse_date_code(v);
    if(d) return `${d.y}-${pad2(d.m)}-${pad2(d.d)}`;
  }
  if(typeof v === "string"){
    const s = v.trim().replace(/[.\/]/g,"-").replace(/-$/,"");
    const m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
    if(m) return `${m[1]}-${pad2(+m[2])}-${pad2(+m[3])}`;
  }
  return null;
}
function saveCalendarExcel(){
  if(!isAdmin()){ toast("관리자 로그인이 필요합니다"); return; }
  const input = document.getElementById("calFileInput");
  const file = input.files[0];
  if(!file){ toast("업로드할 엑셀 파일을 선택해주세요"); return; }
  const reader = new FileReader();
  reader.onload = e=>{
    try{
      const wb = XLSX.read(e.target.result, {type:"array", cellDates:true});
      const ws = wb.Sheets[wb.SheetNames[0]];
      const rows = XLSX.utils.sheet_to_json(ws, {defval:""});
      const events = [];
      rows.forEach(row=>{
        const title = String(row["제목"]||"").trim();
        const startRaw = row["시작일"] !== undefined && row["시작일"] !== "" ? row["시작일"] : row["날짜"];
        const endRaw = row["종료일"];
        const startDate = excelCellToISODate(startRaw);
        let endDate = excelCellToISODate(endRaw);
        if(!startDate || !title) return;
        if(!endDate || endDate < startDate) endDate = startDate;
        events.push({
          startDate, endDate, title,
          category: String(row["구분"]||"").trim(),
          location: String(row["장소"]||"").trim(),
          memo: String(row["메모"]||"").trim()
        });
      });
      if(!events.length){ alert("인식 가능한 일정이 없습니다. '시작일'과 '제목' 컬럼을 확인해주세요."); return; }
      const jsonSize = new Blob([JSON.stringify(events)]).size;
      if(jsonSize > 900000){ alert("데이터 용량이 너무 큽니다. 행 수를 줄여 다시 시도해주세요."); return; }
      db.collection("calendarData").doc("main").set({
        events, fileName: file.name, updatedAt: firebase.firestore.FieldValue.serverTimestamp()
      }).then(()=>{ toast(`${events.length}건의 일정이 적용되었습니다`); input.value=""; })
        .catch(err=>toast("업로드 실패: "+err.message));
    }catch(err){
      alert("엑셀 파일을 읽는 중 오류가 발생했습니다: "+err.message);
    }
  };
  reader.readAsArrayBuffer(file);
}
function deleteCalendarData(){
  if(!isAdmin()){ toast("관리자 로그인이 필요합니다"); return; }
  if(!confirm("캘린더에 적용된 전체 일정을 삭제할까요?")) return;
  db.collection("calendarData").doc("main").delete()
    .then(()=>toast("삭제되었습니다"))
    .catch(err=>toast("삭제 실패: "+err.message));
}

/* ===================== ADMIN PANEL ===================== */
function renderAdmin(){
  const admin = isAdmin();
  document.getElementById("adminLocked").style.display = admin ? "none" : "block";
  document.getElementById("adminPanel").style.display = admin ? "block" : "none";
  if(!admin) return;

  document.getElementById("adminProgList").innerHTML = state.programs.length ? state.programs.map(p=>`
    <div class="item-card" style="cursor:default;">
      <div class="item-main">
        <div class="item-title-row"><span class="item-title">${esc(p.name)}</span>${badge(getEffectiveStatus(p))}</div>
        <div class="item-meta"><span>${esc(p.location)||"-"}</span><span>접수 ${fmtDate(p.applyStart)}~${fmtDate(p.applyEnd)}</span></div>
      </div>
      <div class="item-actions">
        <button class="btn btn-ghost btn-sm" onclick="openProgramModal('${p.id}')">수정</button>
        <button class="btn btn-ghost btn-sm" onclick="deleteProgram('${p.id}')">삭제</button>
      </div>
    </div>`).join("") : `<div class="empty-state">등록된 지원사업이 없습니다. 상단 "지원사업" 탭에서 추가하세요.</div>`;

  document.getElementById("adminExpoList").innerHTML = state.expos.length ? state.expos.map(e=>`
    <div class="item-card" style="cursor:default;">
      <div class="item-main">
        <div class="item-title-row"><span class="item-title">${esc(e.name)}</span>${badge(e.status)}<span class="badge" style="background:#EEF1F6;color:var(--slate)">${esc(e.category)||"전시회"}</span></div>
        <div class="item-meta"><span>${esc(e.location)||"-"}</span><span>${fmtDate(e.start)} ~ ${fmtDate(e.end)}</span></div>
      </div>
      <div class="item-actions">
        <button class="btn btn-ghost btn-sm" onclick="openExpoModal('${e.id}')">수정</button>
        <button class="btn btn-ghost btn-sm" onclick="deleteExpo('${e.id}')">삭제</button>
      </div>
    </div>`).join("") : `<div class="empty-state">등록된 일정이 없습니다. 상단 "해외 주요 일정" 탭에서 추가하세요.</div>`;
}

/* ===================== EXPORT / IMPORT ===================== */
function exportJSON(){
  const blob = new Blob([JSON.stringify(state, null, 2)], {type:"application/json"});
  downloadBlob(blob, `kfi_data_${todayStr()}.json`);
  toast("JSON 백업 파일이 다운로드되었습니다");
}
function importJSON(ev){
  if(!isAdmin()){ toast("관리자 로그인이 필요합니다"); ev.target.value=""; return; }
  const file = ev.target.files[0];
  if(!file) return;
  const reader = new FileReader();
  reader.onload = async e=>{
    try{
      const data = JSON.parse(e.target.result);
      if(!Array.isArray(data.programs) || !Array.isArray(data.expos)) throw new Error("형식 오류");
      if(!confirm(`지원사업 ${data.programs.length}건, 전시회 ${data.expos.length}건을 Firestore에 추가합니다. 계속할까요?`)) return;
      const batch = db.batch();
      data.programs.forEach(p=>{
        const {id, ...rest} = p;
        const ref = db.collection("programs").doc();
        batch.set(ref, {...rest, updatedAt: firebase.firestore.FieldValue.serverTimestamp()});
      });
      data.expos.forEach(x=>{
        const {id, ...rest} = x;
        const ref = db.collection("expos").doc();
        batch.set(ref, {...rest, updatedAt: firebase.firestore.FieldValue.serverTimestamp()});
      });
      await batch.commit();
      toast("데이터를 가져왔습니다");
    }catch(err){
      alert("가져오기에 실패했습니다: "+err.message);
    }
  };
  reader.readAsText(file);
  ev.target.value = "";
}
function exportExcel(){
  const wb = XLSX.utils.book_new();
  const progSheet = XLSX.utils.json_to_sheet(state.programs.map(p=>({
    사업명:p.name, 상태:getEffectiveStatus(p), 진행장소:p.location,
    진행일정시작:p.eventStart, 진행일정종료:p.eventEnd,
    접수시작:p.applyStart, 접수마감:p.applyEnd,
    공고문URL:p.url, 문의연락처:p.contactPhone, 문의이메일:p.contactEmail,
    자격조건:p.qualification, 지원내용:p.content, 메모:p.memo
  })));
  const expoSheet = XLSX.utils.json_to_sheet(state.expos.map(e=>({
    전시회명:e.name, 구분:e.category||"전시회", 장소:e.location, 상태:e.status, 시작일:e.start, 종료일:e.end,
    참가기업수:e.participants, 메모:e.memo
  })));
  const libSheet = XLSX.utils.json_to_sheet(state.resources.map(r=>({
    제목:r.title, 구분:r.category, 링크:r.url, 설명:r.description
  })));
  XLSX.utils.book_append_sheet(wb, progSheet, "지원사업");
  XLSX.utils.book_append_sheet(wb, expoSheet, "해외일정");
  XLSX.utils.book_append_sheet(wb, libSheet, "자료실");
  XLSX.writeFile(wb, `KFI_해외지원사업_데이터_${todayStr()}.xlsx`);
  toast("Excel 파일이 다운로드되었습니다");
}
function downloadBlob(blob, filename){
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = filename;
  document.body.appendChild(a); a.click(); document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
function todayStr(){ return new Date().toISOString().slice(0,10).replace(/-/g,""); }

/* ===================== INIT ===================== */
window.addEventListener("DOMContentLoaded", ()=>{
  initFirebase();
  renderDashboard();
  applyAdminUI();
  if("serviceWorker" in navigator){
    navigator.serviceWorker.register("sw.js").catch(err=>console.error("SW 등록 실패", err));
  }
});
