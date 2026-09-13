/* ============================================================
   FIREBASE — used ONLY for the admin login gate now. No Firestore,
   no Storage. Loaded with a dynamic import wrapped in try/catch, so
   that if Firebase's CDN is ever slow or unreachable, only the admin
   login is affected — the rest of the site (content, appearance,
   contact) keeps working normally regardless.
   ============================================================ */
var firebaseConfig = {
  apiKey: "AIzaSyBrC4QBnENNEgE6MS_vWPbyvEwQ-rMf-BY",
  authDomain: "mrark-x-portfolio.firebaseapp.com",
  projectId: "mrark-x-portfolio",
  storageBucket: "mrark-x-portfolio.firebasestorage.app",
  messagingSenderId: "1072926437017",
  appId: "1:1072926437017:web:bc7316392eb06912cc1208"
};
var firebaseReady = (async function(){
  try {
    var appMod = await import("https://www.gstatic.com/firebasejs/12.18.0/firebase-app.js");
    var authMod = await import("https://www.gstatic.com/firebasejs/12.18.0/firebase-auth.js");
    var firebaseApp = appMod.initializeApp(firebaseConfig);
    var auth = authMod.getAuth(firebaseApp);
    return {
      auth: auth,
      signInWithEmailAndPassword: authMod.signInWithEmailAndPassword,
      signOut: authMod.signOut,
      onAuthStateChanged: authMod.onAuthStateChanged
    };
  } catch(e){
    console.error("Firebase failed to load — admin login unavailable:", e.message);
    return null;
  }
})();

function escapeHtml(s){
  return (s||"").replace(/[&<>"']/g, function(c){
    return {"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c];
  });
}
function makeId(){
  return Date.now().toString(36) + Math.random().toString(36).slice(2,8);
}

/* ============================================================
   GITHUB-AS-DATABASE
   Public reads: a plain fetch('./data.json') — the same file GitHub
   Pages serves alongside index.html, so this works for every visitor
   with zero login and zero API calls.
   Admin writes: the GitHub Contents API, authenticated with a
   personal access token the admin types in once per browser session.
   The token lives only in sessionStorage (cleared when the tab/
   browser closes) — it is NEVER written into any file in the repo,
   so it can't leak through the site itself.
   ============================================================ */
var siteData = null;

function loadPublicData(){
  return fetch("./data.json", { cache: "no-store" })
    .then(function(r){ if(!r.ok) throw new Error("data.json not found (status "+r.status+")"); return r.json(); })
    .then(function(json){ siteData = json; return json; })
    .catch(function(err){
      console.error("Could not load data.json:", err.message);
      siteData = { profile:{}, projects:[], certificates:[], journalPosts:[], siteSettings:{} };
      return siteData;
    });
}

function ghHeaders(){
  return {
    "Authorization": "Bearer " + sessionStorage.getItem("kelechi_gh_token"),
    "Accept": "application/vnd.github+json"
  };
}
function ghApiUrl(){
  var owner = localStorage.getItem("kelechi_gh_owner");
  var repo = localStorage.getItem("kelechi_gh_repo");
  return "https://api.github.com/repos/"+owner+"/"+repo+"/contents/data.json";
}
function isGhConnected(){
  return !!(localStorage.getItem("kelechi_gh_owner") && localStorage.getItem("kelechi_gh_repo") && sessionStorage.getItem("kelechi_gh_token"));
}

function ghGetFile(){
  return fetch(ghApiUrl(), { headers: ghHeaders() }).then(function(r){
    if(!r.ok) return r.json().then(function(e){ throw new Error(e.message || ("GitHub error "+r.status)); });
    return r.json();
  }).then(function(fileInfo){
    var decoded = decodeURIComponent(escape(atob(fileInfo.content.replace(/\n/g,""))));
    return { sha: fileInfo.sha, data: JSON.parse(decoded) };
  });
}

function ghSaveFile(mutate, commitMessage){
  return ghGetFile().then(function(current){
    var updated = mutate(current.data);
    var content = btoa(unescape(encodeURIComponent(JSON.stringify(updated, null, 2))));
    return fetch(ghApiUrl(), {
      method: "PUT",
      headers: Object.assign({ "Content-Type": "application/json" }, ghHeaders()),
      body: JSON.stringify({ message: commitMessage, content: content, sha: current.sha })
    }).then(function(r){
      if(!r.ok) return r.json().then(function(e){ throw new Error(e.message || ("GitHub error "+r.status)); });
      siteData = updated;
      return updated;
    });
  });
}

document.getElementById("ghConnectBtn").addEventListener("click", function(){
  var owner = document.getElementById("ghOwner").value.trim();
  var repo = document.getElementById("ghRepo").value.trim();
  var token = document.getElementById("ghToken").value.trim();
  var err = document.getElementById("ghError");
  var status = document.getElementById("ghStatus");
  if(!owner || !repo || !token){ err.classList.add("show"); return; }
  err.classList.remove("show");
  localStorage.setItem("kelechi_gh_owner", owner);
  localStorage.setItem("kelechi_gh_repo", repo);
  sessionStorage.setItem("kelechi_gh_token", token);
  status.textContent = "Checking connection…";
  ghGetFile().then(function(){
    status.textContent = "Connected to "+owner+"/"+repo+" — saves will work now.";
    document.getElementById("ghToken").value = "";
  }).catch(function(e){
    status.textContent = "";
    err.textContent = "Couldn't connect: "+e.message;
    err.classList.add("show");
    sessionStorage.removeItem("kelechi_gh_token");
  });
});
function refreshGhStatus(){
  var status = document.getElementById("ghStatus");
  if(isGhConnected()){
    status.textContent = "Connected to "+localStorage.getItem("kelechi_gh_owner")+"/"+localStorage.getItem("kelechi_gh_repo")+".";
    document.getElementById("ghOwner").value = localStorage.getItem("kelechi_gh_owner");
    document.getElementById("ghRepo").value = localStorage.getItem("kelechi_gh_repo");
  } else {
    status.textContent = "Not connected yet — enter your details above before saving.";
  }
}

/* ============================================================
   APPEARANCE — 22 presets available to visitors, a custom colour
   picker, and 8 transition styles. All visitor choices are
   local-only (localStorage). The ONE setting the admin still
   controls site-wide is the default transition style, stored in
   data.json's siteSettings.
   ============================================================ */
var THEMES = [
  { name:"Midnight amber", ink:"#12161c", ink2:"#181d25", paper:"#f4f1e9", paperDim:"#c9c4b4", signal:"#c98a3e" },
  { name:"Slate and sky",  ink:"#10151d", ink2:"#161c26", paper:"#eef2f7", paperDim:"#9fb0c2", signal:"#4a90d9" },
  { name:"Charcoal moss",  ink:"#151713", ink2:"#1c1f19", paper:"#eef1e8", paperDim:"#a9b09c", signal:"#7c8f6c" },
  { name:"Ink and gold",   ink:"#0f0f11", ink2:"#17171a", paper:"#f2ede0", paperDim:"#b8ae98", signal:"#d4a017" },
  { name:"Forest night",   ink:"#0f1712", ink2:"#16211a", paper:"#eef0e6", paperDim:"#a7b39c", signal:"#e0a339" },
  { name:"Ivory espresso", ink:"#f7f3ea", ink2:"#efe9da", paper:"#241c15", paperDim:"#6b5d4d", signal:"#8a5a34" },
  { name:"Arctic",         ink:"#f8f9fb", ink2:"#eef1f5", paper:"#1a1f26", paperDim:"#5c6773", signal:"#2f6fd1" },
  { name:"Sand and clay",  ink:"#f4ece0", ink2:"#ecdfcb", paper:"#2c2115", paperDim:"#75634a", signal:"#c1652f" },
  { name:"Paper and rose", ink:"#faf1f0", ink2:"#f2dfdd", paper:"#241417", paperDim:"#7a5a5c", signal:"#b0495b" },
  { name:"Graphite sage",  ink:"#f0f2ee", ink2:"#e2e6dd", paper:"#22261f", paperDim:"#626b58", signal:"#5f7a52" },
  { name:"Royal blue & white", ink:"#ffffff", ink2:"#eef1fa", paper:"#0b1638", paperDim:"#4c5a86", signal:"#1e3a8a" },
  { name:"Navy & ivory",       ink:"#f7f6f1", ink2:"#ece9de", paper:"#0e1b33", paperDim:"#556080", signal:"#12315e" },
  { name:"Onyx & gold",        ink:"#0b0b0d", ink2:"#151517", paper:"#f4ede1", paperDim:"#a79c88", signal:"#c9a03c" },
  { name:"Emerald & cream",    ink:"#f6f3ea", ink2:"#eae4d2", paper:"#12331f", paperDim:"#5c6f5e", signal:"#1f6f43" },
  { name:"Burgundy & ivory",   ink:"#faf6f1", ink2:"#f0e6dd", paper:"#3a0d17", paperDim:"#8a5a5f", signal:"#7a1626" },
  { name:"Slate blue & silver",ink:"#eef0f4", ink2:"#e1e5ec", paper:"#22293b", paperDim:"#5c6478", signal:"#3d5a99" },
  { name:"Terracotta & charcoal", ink:"#181614", ink2:"#211e1a", paper:"#f3e9df", paperDim:"#b8a795", signal:"#c2603c" },
  { name:"Deep teal & white",  ink:"#ffffff", ink2:"#eaf3f2", paper:"#0d2b2a", paperDim:"#4f7472", signal:"#0f6b64" },
  { name:"Plum & blush",       ink:"#faf2f2", ink2:"#f2e2e2", paper:"#3b0f2c", paperDim:"#8a6379", signal:"#7a2559" },
  { name:"Copper & graphite",  ink:"#17181a", ink2:"#202224", paper:"#f0e6da", paperDim:"#a99e90", signal:"#b5652f" },
  { name:"Classic black & white", ink:"#0a0a0a", ink2:"#161616", paper:"#ffffff", paperDim:"#a3a3a3", signal:"#ffffff" },
  { name:"Pure white & black",    ink:"#ffffff", ink2:"#f2f2f2", paper:"#0a0a0a", paperDim:"#5c5c5c", signal:"#0a0a0a" }
];

function hexToRgb(hex){
  hex = hex.replace("#","");
  var n = parseInt(hex,16);
  return { r:(n>>16)&255, g:(n>>8)&255, b:n&255 };
}
function paintTheme(t){
  var root = document.documentElement.style;
  var paperRgb = hexToRgb(t.paper);
  var signalRgb = hexToRgb(t.signal);
  root.setProperty("--ink", t.ink);
  root.setProperty("--ink-2", t.ink2);
  root.setProperty("--paper", t.paper);
  root.setProperty("--paper-dim", t.paperDim);
  root.setProperty("--signal", t.signal);
  root.setProperty("--line", "rgba("+paperRgb.r+","+paperRgb.g+","+paperRgb.b+",0.14)");
  root.setProperty("--line-strong", "rgba("+paperRgb.r+","+paperRgb.g+","+paperRgb.b+",0.28)");
  root.setProperty("--signal-dim", "rgba("+signalRgb.r+","+signalRgb.g+","+signalRgb.b+",0.16)");
}
function applyVisitorTheme(t){
  paintTheme(t);
  localStorage.setItem("kelechi_visitor_theme", JSON.stringify(t));
}
function renderVisitorSwatches(){
  var host = document.getElementById("visitorSwatchGrid");
  var savedRaw = localStorage.getItem("kelechi_visitor_theme");
  var savedName = savedRaw ? JSON.parse(savedRaw).name : null;
  host.innerHTML = "";
  THEMES.forEach(function(t){
    var el = document.createElement("div");
    el.className = "swatch" + (t.name===savedName ? " active" : "");
    el.style.background = t.ink;
    el.innerHTML = '<b style="color:'+t.paper+'">'+t.name+'</b>';
    el.addEventListener("click", function(){
      applyVisitorTheme(t);
      renderVisitorSwatches();
    });
    host.appendChild(el);
  });
}
document.getElementById("applyCustomColor").addEventListener("click", function(){
  var t = {
    name:"Custom",
    ink: document.getElementById("customBg").value,
    ink2: document.getElementById("customBg").value,
    paper: document.getElementById("customText").value,
    paperDim: document.getElementById("customText").value,
    signal: document.getElementById("customAccent").value
  };
  applyVisitorTheme(t);
  renderVisitorSwatches();
});

var ANIMS = [
  { key:"fadeup",      label:"Fade up" },
  { key:"slideleft",   label:"Slide from left" },
  { key:"slideright",  label:"Slide from right" },
  { key:"zoom",        label:"Zoom in" },
  { key:"flip",        label:"Tilt in" },
  { key:"rotate",      label:"Rotate in" },
  { key:"blur",        label:"Blur in" },
  { key:"none",        label:"No transition" }
];
function paintAnim(key){
  ANIMS.forEach(function(a){ document.body.classList.remove("anim-"+a.key); });
  document.body.classList.add("anim-"+key);
}
function applyVisitorAnim(key){
  paintAnim(key);
  localStorage.setItem("kelechi_visitor_anim", key);
}
function currentSiteDefaultAnim(){
  return (siteData && siteData.siteSettings && siteData.siteSettings.defaultAnimation) || "fadeup";
}
function renderVisitorAnimGrid(){
  var host = document.getElementById("visitorAnimGrid");
  var visitorChoice = localStorage.getItem("kelechi_visitor_anim");
  document.getElementById("siteDefaultAnimNote").textContent =
    "Site default: " + (ANIMS.find(function(a){ return a.key===currentSiteDefaultAnim(); }) || ANIMS[0]).label + " — unless you pick your own below.";
  host.innerHTML = "";
  ANIMS.forEach(function(a){
    var btn = document.createElement("button");
    btn.type = "button";
    btn.className = "anim-opt" + (a.key===visitorChoice ? " active" : "");
    btn.textContent = a.label;
    btn.addEventListener("click", function(){
      applyVisitorAnim(a.key);
      renderVisitorAnimGrid();
    });
    host.appendChild(btn);
  });
}
function renderAdminAnimGrid(){
  var host = document.getElementById("adminAnimGrid");
  var current = currentSiteDefaultAnim();
  host.innerHTML = "";
  ANIMS.forEach(function(a){
    var btn = document.createElement("button");
    btn.type = "button";
    btn.className = "anim-opt" + (a.key===current ? " active" : "");
    btn.textContent = a.label;
    btn.addEventListener("click", function(){
      if(!isGhConnected()){ alert("Connect to GitHub first (see the box at the top of this panel)."); return; }
      ghSaveFile(function(data){
        data.siteSettings = data.siteSettings || {};
        data.siteSettings.defaultAnimation = a.key;
        return data;
      }, "Set site-wide default transition to "+a.label).then(function(){
        renderAdminAnimGrid();
        if(!localStorage.getItem("kelechi_visitor_anim")) paintAnim(a.key);
      }).catch(function(e){ alert("Couldn't save: "+e.message); });
    });
    host.appendChild(btn);
  });
}

var visitorThemeOverlay = document.getElementById("visitorThemeOverlay");
document.getElementById("visitorThemeBtn").addEventListener("click", function(){
  renderVisitorSwatches();
  renderVisitorAnimGrid();
  visitorThemeOverlay.classList.add("open");
});
document.getElementById("visitorThemeClose").addEventListener("click", function(){ visitorThemeOverlay.classList.remove("open"); });
visitorThemeOverlay.addEventListener("click", function(e){ if(e.target===visitorThemeOverlay) visitorThemeOverlay.classList.remove("open"); });
document.getElementById("visitorThemeReset").addEventListener("click", function(){
  localStorage.removeItem("kelechi_visitor_theme");
  localStorage.removeItem("kelechi_visitor_anim");
  paintTheme(THEMES[0]);
  paintAnim(currentSiteDefaultAnim());
  renderVisitorSwatches();
  renderVisitorAnimGrid();
});

var revealObserver = new IntersectionObserver(function(entries){
  entries.forEach(function(entry){
    if(entry.isIntersecting){
      entry.target.classList.add("is-visible");
      revealObserver.unobserve(entry.target);
    }
  });
}, { threshold:0.15 });
function observeReveals(){
  document.querySelectorAll(".reveal").forEach(function(el){
    if(!el.classList.contains("is-visible")) revealObserver.observe(el);
  });
}

function renderProjects(){
  var host = document.getElementById("workScroll");
  var projects = (siteData && siteData.projects) || [];
  if(!projects.length){ host.innerHTML = '<p class="empty-note">No projects yet — check back soon.</p>'; return; }
  var grid = document.createElement("div");
  grid.className = "work-grid";
  projects.forEach(function(p, i){
    var card = document.createElement("div");
    card.className = "case reveal";
    var linkHtml = p.link ? '<a href="'+escapeHtml(p.link)+'" target="_blank" rel="noopener">View ↗</a>' : "";
    card.innerHTML =
      '<div class="case-top"><span class="case-no">Case '+String(i+1).padStart(2,"0")+'</span><span class="case-tag">'+escapeHtml(p.tag)+'</span></div>' +
      '<h3>'+escapeHtml(p.title)+'</h3>' +
      '<p>'+escapeHtml(p.description)+'</p>' +
      '<div class="case-foot"><span>Role · <b>'+escapeHtml(p.role)+'</b></span><span>Year · <b>'+escapeHtml(p.year)+'</b></span>'+linkHtml+'</div>';
    grid.appendChild(card);
  });
  host.innerHTML = "";
  host.appendChild(grid);
  observeReveals();
}
function renderAdminProjectList(){
  var host = document.getElementById("adminProjectList");
  if(!host) return;
  var projects = (siteData && siteData.projects) || [];
  host.innerHTML = "";
  if(!projects.length){ host.innerHTML = '<p class="sub">No projects yet.</p>'; return; }
  projects.forEach(function(p){
    var row = document.createElement("div");
    row.className = "admin-row";
    row.innerHTML =
      '<div class="info"><b>'+escapeHtml(p.title)+'</b>'+escapeHtml(p.tag)+' · '+escapeHtml(p.year)+'</div>' +
      '<button class="remove-btn" data-id="'+p.id+'" title="Remove project" type="button">x</button>';
    host.appendChild(row);
  });
  host.querySelectorAll(".remove-btn").forEach(function(btn){
    btn.addEventListener("click", function(){
      if(!isGhConnected()){ alert("Connect to GitHub first."); return; }
      var id = btn.getAttribute("data-id");
      ghSaveFile(function(data){
        data.projects = (data.projects||[]).filter(function(p){ return p.id !== id; });
        return data;
      }, "Remove project "+id).then(function(){ renderProjects(); renderAdminProjectList(); })
        .catch(function(e){ alert("Couldn't remove: "+e.message); });
    });
  });
}

function renderCerts(){
  var host = document.getElementById("certGrid");
  var certs = (siteData && siteData.certificates) || [];
  if(!certs.length){ host.innerHTML = '<p class="empty-note">No certificates yet — check back soon.</p>'; return; }
  host.innerHTML = "";
  certs.forEach(function(c){
    var card = document.createElement("div");
    card.className = "cert-card reveal";
    var badgeClass = c.status === "progress" ? "progress" : "done";
    var badgeLabel = c.status === "progress" ? "In progress" : "Completed";
    card.innerHTML =
      '<span class="cert-badge '+badgeClass+'">'+badgeLabel+'</span>' +
      '<h4>'+escapeHtml(c.title)+'</h4>' +
      '<p>'+escapeHtml(c.description)+'</p>' +
      '<a href="'+escapeHtml(c.link || "#")+'" target="_blank" rel="noopener">View ↗</a>';
    host.appendChild(card);
  });
  observeReveals();
}
function renderAdminCertList(){
  var host = document.getElementById("adminCertList");
  if(!host) return;
  var certs = (siteData && siteData.certificates) || [];
  host.innerHTML = "";
  if(!certs.length){ host.innerHTML = '<p class="sub">No certificates yet.</p>'; return; }
  certs.forEach(function(c){
    var row = document.createElement("div");
    row.className = "admin-row";
    var badgeLabel = c.status === "progress" ? "In progress" : "Completed";
    row.innerHTML =
      '<div class="info"><b>'+escapeHtml(c.title)+'</b>'+badgeLabel+'</div>' +
      '<button class="remove-btn" data-id="'+c.id+'" title="Remove certificate" type="button">x</button>';
    host.appendChild(row);
  });
  host.querySelectorAll(".remove-btn").forEach(function(btn){
    btn.addEventListener("click", function(){
      if(!isGhConnected()){ alert("Connect to GitHub first."); return; }
      var id = btn.getAttribute("data-id");
      ghSaveFile(function(data){
        data.certificates = (data.certificates||[]).filter(function(c){ return c.id !== id; });
        return data;
      }, "Remove certificate "+id).then(function(){ renderCerts(); renderAdminCertList(); })
        .catch(function(e){ alert("Couldn't remove: "+e.message); });
    });
  });
}

var journalPosts = [];
function renderJournal(){
  journalPosts = (siteData && siteData.journalPosts) || [];
  var host = document.getElementById("journalGrid");
  if(!journalPosts.length){ host.innerHTML = '<p class="empty-note">No journal posts yet — check back soon.</p>'; return; }
  host.innerHTML = "";
  journalPosts.forEach(function(post, i){
    var card = document.createElement("div");
    card.className = "post reveal";
    card.innerHTML =
      '<span class="post-date">'+escapeHtml(post.dateLabel)+'</span>' +
      '<h4>'+escapeHtml(post.title)+'</h4>' +
      '<p>'+escapeHtml(post.excerpt)+'</p>' +
      '<button class="readmore" data-i="'+i+'" type="button">Read more ↗</button>';
    host.appendChild(card);
  });
  host.querySelectorAll(".readmore").forEach(function(btn){
    btn.addEventListener("click", function(){ openPostModal(parseInt(btn.getAttribute("data-i"),10)); });
  });
  observeReveals();
}
function openPostModal(i){
  var post = journalPosts[i];
  if(!post) return;
  document.getElementById("pmDate").textContent = post.dateLabel || "";
  document.getElementById("pmTitle").textContent = post.title || "";
  document.getElementById("pmCompanyPhotoWrap").innerHTML = post.companyPhotoUrl
    ? '<img class="post-company-photo" src="'+post.companyPhotoUrl+'" alt="Company photo">'
    : '<div class="post-modal-empty-img">No company photo added yet</div>';
  document.getElementById("pmCompanyName").textContent = post.companyName || "";
  document.getElementById("pmDetails").textContent = post.details || "No project description added yet.";
  document.getElementById("pmTestimonialPhotoWrap").innerHTML =
    (post.testimonialPhotoUrl ? '<img class="testimonial-photo" src="'+post.testimonialPhotoUrl+'" alt="Testimonial photo">' : '<div class="no-photo">No photo</div>') +
    '<span class="who">'+escapeHtml(post.testimonialName || "")+'</span>';
  document.getElementById("pmTestimonialQuote").textContent = post.testimonialQuote
    ? ('\u201c'+post.testimonialQuote+'\u201d') : "No testimonial added yet.";
  document.getElementById("pmContact").textContent = post.contact ? ("Contact: "+post.contact) : "";
  postOverlay.classList.add("open");
}
function renderAdminJournalList(){
  var host = document.getElementById("adminJournalList");
  if(!host) return;
  host.innerHTML = "";
  if(!journalPosts.length){ host.innerHTML = '<p class="sub">No journal posts yet.</p>'; return; }
  journalPosts.forEach(function(post){
    var row = document.createElement("div");
    row.className = "admin-row";
    row.innerHTML =
      '<div class="info"><b>'+escapeHtml(post.title)+'</b>'+escapeHtml(post.dateLabel)+'</div>' +
      '<button class="remove-btn" data-id="'+post.id+'" title="Remove post" type="button">x</button>';
    host.appendChild(row);
  });
  host.querySelectorAll(".remove-btn").forEach(function(btn){
    btn.addEventListener("click", function(){
      if(!isGhConnected()){ alert("Connect to GitHub first."); return; }
      var id = btn.getAttribute("data-id");
      ghSaveFile(function(data){
        data.journalPosts = (data.journalPosts||[]).filter(function(p){ return p.id !== id; });
        return data;
      }, "Remove journal post "+id).then(function(){ renderJournal(); renderAdminJournalList(); })
        .catch(function(e){ alert("Couldn't remove: "+e.message); });
    });
  });
}
document.getElementById("journalSubmit").addEventListener("click", function(){
  var title = document.getElementById("jTitle").value.trim();
  var excerpt = document.getElementById("jExcerpt").value.trim();
  var err = document.getElementById("journalError");
  if(!title || !excerpt){ err.classList.add("show"); return; }
  if(!isGhConnected()){ err.textContent = "Connect to GitHub first (box at the top of this panel)."; err.classList.add("show"); return; }
  err.classList.remove("show");
  var newPost = {
    id: makeId(), title:title,
    dateLabel: document.getElementById("jDate").value.trim() || new Date().toLocaleDateString(),
    excerpt:excerpt,
    companyPhotoUrl: document.getElementById("jCompanyPhoto").value.trim(),
    companyName: document.getElementById("jCompanyName").value.trim(),
    contact: document.getElementById("jContact").value.trim(),
    details: document.getElementById("jDetails").value.trim(),
    testimonialPhotoUrl: document.getElementById("jTestimonialPhoto").value.trim(),
    testimonialQuote: document.getElementById("jTestimonialQuote").value.trim(),
    testimonialName: document.getElementById("jTestimonialName").value.trim()
  };
  ghSaveFile(function(data){
    data.journalPosts = data.journalPosts || [];
    data.journalPosts.unshift(newPost);
    return data;
  }, "Add journal post: "+title).then(function(){
    ["jTitle","jDate","jExcerpt","jCompanyPhoto","jCompanyName","jContact","jDetails","jTestimonialPhoto","jTestimonialQuote","jTestimonialName"]
      .forEach(function(id){ document.getElementById(id).value=""; });
    renderJournal();
    renderAdminJournalList();
  }).catch(function(e){
    err.textContent = "Couldn't save: "+e.message;
    err.classList.add("show");
  });
});

var postOverlay = document.getElementById("postOverlay");
document.getElementById("postClose").addEventListener("click", function(){ postOverlay.classList.remove("open"); });
postOverlay.addEventListener("click", function(e){ if(e.target===postOverlay) postOverlay.classList.remove("open"); });

function applyProfile(){
  var p = (siteData && siteData.profile) || {};
  var bio1 = p.bio1 || document.getElementById("bioP1").textContent;
  var bio2 = p.bio2 || document.getElementById("bioP2").textContent;
  document.getElementById("bioP1").textContent = bio1;
  document.getElementById("bioP2").textContent = bio2;
  var box = document.getElementById("avatarBox");
  box.innerHTML = p.photoUrl
    ? '<img src="'+p.photoUrl+'" alt="Profile photo">'
    : '<div class="initials">'+escapeHtml(p.initials || "AK")+'</div>';
  document.getElementById("bioName").value = p.initials || "AK";
  document.getElementById("bioText1").value = bio1;
  document.getElementById("bioText2").value = bio2;
  document.getElementById("avatarUrl").value = p.photoUrl || "";
  var preview = document.getElementById("avatarPreview");
  preview.innerHTML = p.photoUrl ? '<img src="'+p.photoUrl+'" alt="">' : '<span style="font-size:11px;color:var(--paper-dim)">No photo</span>';
}
document.getElementById("avatarUrl").addEventListener("input", function(){
  var preview = document.getElementById("avatarPreview");
  var url = this.value.trim();
  preview.innerHTML = url ? '<img src="'+url+'" alt="">' : '<span style="font-size:11px;color:var(--paper-dim)">No photo</span>';
});
document.getElementById("profileSave").addEventListener("click", function(){
  var err = document.getElementById("profileError");
  err.classList.remove("show");
  if(!isGhConnected()){ err.textContent = "Connect to GitHub first (box at the top of this panel)."; err.classList.add("show"); return; }
  var newProfile = {
    initials: document.getElementById("bioName").value.trim() || "AK",
    bio1: document.getElementById("bioText1").value.trim(),
    bio2: document.getElementById("bioText2").value.trim(),
    photoUrl: document.getElementById("avatarUrl").value.trim()
  };
  ghSaveFile(function(data){ data.profile = newProfile; return data; }, "Update profile")
    .then(function(){ applyProfile(); })
    .catch(function(e){ err.textContent = "Couldn't save: "+e.message; err.classList.add("show"); });
});

document.getElementById("projectSubmit").addEventListener("click", function(){
  var title = document.getElementById("pTitle").value.trim();
  var desc = document.getElementById("pDesc").value.trim();
  var err = document.getElementById("projectError");
  if(!title || !desc){ err.classList.add("show"); return; }
  if(!isGhConnected()){ err.textContent = "Connect to GitHub first."; err.classList.add("show"); return; }
  err.classList.remove("show");
  var newProject = {
    id: makeId(), title:title,
    tag: document.getElementById("pTag").value.trim() || "Project",
    role: document.getElementById("pRole").value.trim() || "Developer",
    year: document.getElementById("pYear").value.trim() || String(new Date().getFullYear()),
    description:desc,
    link: document.getElementById("pLink").value.trim()
  };
  ghSaveFile(function(data){
    data.projects = data.projects || [];
    data.projects.unshift(newProject);
    return data;
  }, "Add project: "+title).then(function(){
    ["pTitle","pTag","pDesc","pRole","pYear","pLink"].forEach(function(id){ document.getElementById(id).value=""; });
    renderProjects();
    renderAdminProjectList();
  }).catch(function(e){ err.textContent = "Couldn't save: "+e.message; err.classList.add("show"); });
});

document.getElementById("certSubmit").addEventListener("click", function(){
  var title = document.getElementById("cTitle").value.trim();
  var err = document.getElementById("certError");
  if(!title){ err.classList.add("show"); return; }
  if(!isGhConnected()){ err.textContent = "Connect to GitHub first."; err.classList.add("show"); return; }
  err.classList.remove("show");
  var newCert = {
    id: makeId(), title:title,
    description: document.getElementById("cDesc").value.trim(),
    link: document.getElementById("cLink").value.trim(),
    status: document.getElementById("cStatus").value
  };
  ghSaveFile(function(data){
    data.certificates = data.certificates || [];
    data.certificates.unshift(newCert);
    return data;
  }, "Add certificate: "+title).then(function(){
    ["cTitle","cDesc","cLink"].forEach(function(id){ document.getElementById(id).value=""; });
    renderCerts();
    renderAdminCertList();
  }).catch(function(e){ err.textContent = "Couldn't save: "+e.message; err.classList.add("show"); });
});

var WHATSAPP_NUMBER = "237677655706";
var EMAIL_ADDRESS = "anyimkelechi09@gmail.com";
document.getElementById("whatsappBtn").href = "https://wa.me/"+WHATSAPP_NUMBER;
document.getElementById("emailBtn").href = "mailto:"+EMAIL_ADDRESS;
document.getElementById("copyEmailBtn").addEventListener("click", function(){
  var stateEl = document.getElementById("copyState");
  navigator.clipboard.writeText(EMAIL_ADDRESS).then(function(){
    stateEl.textContent = "Copied";
    setTimeout(function(){ stateEl.textContent = "Copy"; }, 1800);
  });
});
document.getElementById("msgSend").addEventListener("click", function(){
  var name = document.getElementById("mName").value.trim();
  var from = document.getElementById("mFrom").value.trim();
  var message = document.getElementById("mMsg").value.trim();
  var err = document.getElementById("msgError");
  if(!name || !from || !message){ err.classList.add("show"); return; }
  err.classList.remove("show");
  var subject = encodeURIComponent("Message from "+name+" via portfolio site");
  var body = encodeURIComponent(message + "\n\nFrom: " + name + " (" + from + ")");
  window.location.href = "mailto:"+EMAIL_ADDRESS+"?subject="+subject+"&body="+body;
  ["mName","mFrom","mMsg"].forEach(function(id){ document.getElementById(id).value=""; });
});

var sections = document.querySelectorAll('section[id]');
window.addEventListener('scroll', function(){
  var pos = window.scrollY + 120;
  sections.forEach(function(s){
    if(pos >= s.offsetTop && pos < s.offsetTop + s.offsetHeight){
      document.querySelectorAll('.navlinks a').forEach(function(a){
        a.classList.toggle('active', a.getAttribute('href')==='#'+s.id);
      });
      document.querySelectorAll('.rail-item').forEach(function(a){
        a.classList.toggle('current', a.getAttribute('href')==='#'+s.id);
      });
    }
  });
});

var fullHeading = "Five years of shipping real work, across whatever the problem actually needs.";
var typewriterEl = document.getElementById("typewriterTarget");
var typed = false;
var typeObserver = new IntersectionObserver(function(entries){
  entries.forEach(function(entry){
    if(entry.isIntersecting && !typed){
      typed = true;
      var i = 0;
      var cursor = document.createElement("span");
      cursor.className = "type-cursor";
      function tick(){
        typewriterEl.textContent = fullHeading.slice(0, i);
        typewriterEl.appendChild(cursor);
        i++;
        if(i <= fullHeading.length){ setTimeout(tick, 22); }
        else{ setTimeout(function(){ cursor.remove(); }, 900); }
      }
      tick();
      typeObserver.unobserve(entry.target);
    }
  });
}, { threshold:0.4 });
typeObserver.observe(document.getElementById("about"));

var isAdmin = false;
var loginOverlay = document.getElementById("loginOverlay");
var adminOverlay = document.getElementById("adminOverlay");
var loginError = document.getElementById("loginError");

function openAdmin(){
  refreshGhStatus();
  renderAdminProjectList();
  renderAdminCertList();
  renderAdminJournalList();
  renderAdminAnimGrid();
  adminOverlay.classList.add("open");
}

document.getElementById("manageBtn").addEventListener("click", function(){
  if(isAdmin){ openAdmin(); }
  else{
    loginError.classList.remove("show");
    document.getElementById("loginUser").value = "";
    document.getElementById("loginPass").value = "";
    loginOverlay.classList.add("open");
  }
});
document.getElementById("loginClose").addEventListener("click", function(){ loginOverlay.classList.remove("open"); });
document.getElementById("adminClose").addEventListener("click", function(){ adminOverlay.classList.remove("open"); });
loginOverlay.addEventListener("click", function(e){ if(e.target===loginOverlay) loginOverlay.classList.remove("open"); });
adminOverlay.addEventListener("click", function(e){ if(e.target===adminOverlay){ adminOverlay.classList.remove("open"); } });

document.getElementById("loginSubmit").addEventListener("click", function(){
  var email = document.getElementById("loginUser").value.trim();
  var pass = document.getElementById("loginPass").value;
  loginError.classList.remove("show");
  firebaseReady.then(function(fb){
    if(!fb){
      loginError.textContent = "Couldn't reach the login service. Check your connection and try again.";
      loginError.classList.add("show");
      return;
    }
    fb.signInWithEmailAndPassword(fb.auth, email, pass).then(function(){
      loginOverlay.classList.remove("open");
      openAdmin();
    }).catch(function(){
      loginError.textContent = "That email or password isn't right. Try again.";
      loginError.classList.add("show");
    });
  });
});
document.getElementById("logoutBtn").addEventListener("click", function(){
  firebaseReady.then(function(fb){
    if(!fb){ adminOverlay.classList.remove("open"); return; }
    fb.signOut(fb.auth).then(function(){ adminOverlay.classList.remove("open"); });
  });
});

document.querySelectorAll(".admin-tab").forEach(function(tab){
  tab.addEventListener("click", function(){
    document.querySelectorAll(".admin-tab").forEach(function(t){ t.classList.remove("active"); });
    document.querySelectorAll(".admin-pane").forEach(function(p){ p.classList.remove("active"); });
    tab.classList.add("active");
    document.querySelector('.admin-pane[data-pane="'+tab.getAttribute("data-tab")+'"]').classList.add("active");
  });
});

firebaseReady.then(function(fb){
  if(!fb) return;
  fb.onAuthStateChanged(fb.auth, function(user){
    isAdmin = !!user;
  });
});

(function init(){
  var visitorRaw = localStorage.getItem("kelechi_visitor_theme");
  if(visitorRaw) paintTheme(JSON.parse(visitorRaw));
  loadPublicData().then(function(){
    var visitorAnim = localStorage.getItem("kelechi_visitor_anim");
    paintAnim(visitorAnim || currentSiteDefaultAnim());
    applyProfile();
    renderProjects();
    renderCerts();
    renderJournal();
    observeReveals();
  });
})();
