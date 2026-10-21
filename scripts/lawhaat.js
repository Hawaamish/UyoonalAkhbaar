// Extracted from lawhaat.html. Existing section comments describe the page's behavior.

/* ============ Sample fallback data (used only if the CSV can't be fetched) ============ */


const CSV_TABLE = "Lawhatdata";
const FAV_KEY = "lawhaat_favorites";
const ALL_PAGES_LABEL = "كل الصفحات";
// How long a given "fresh" version of the Drive images is considered good for.
// Raised from 2 minutes to 5: still picks up edits quickly, but stops hammering
// Drive (and re-downloading every image) every couple of minutes.
const DRIVE_REFRESH_MS = 300000;
const DRIVE_CB_KEY = "lawhaat_drive_cb";
// Cloudinary uploads here overwrite the same public ID (URL never changes),
// so live revalidation is only needed while images are still being replaced.
// Once all lawhaat images are final, flip this to false: it stops the
// background refresh timer and lets every image cache permanently instead of
// re-fetching on every render.
const CONSTRUCTION_MODE = true;
const IMAGE_REVALIDATE_MS = CONSTRUCTION_MODE ? DRIVE_REFRESH_MS : Infinity;
// Grid thumbnails only ever render at ~200px wide, so there is no need to pull
// the full w2000 image for every card. The modal (with its zoom/pan viewer)
// still gets a large version.
const GRID_THUMB_SIZE = "w480";
const MODAL_THUMB_SIZE = "w200";
const MODAL_IMG_SIZE = "w1600";

let allData = [];
let activeCategory = "الكل";
let showFavoritesOnly = false;
let searchTerm = "";
let activePage = ALL_PAGES_LABEL;
let sidebarExpanded = false;
let currentModalSrno = null;
let currentModalItems = [];
// Reuse the same cache-buster across reloads as long as it is still "fresh"
// (see DRIVE_REFRESH_MS). This lets the browser's normal HTTP image cache do
// its job instead of forcing a brand-new download of every image on every
// single page load/refresh.
let driveCacheBuster = (function(){
  try{
    const stored = Number(localStorage.getItem(DRIVE_CB_KEY));
    if(stored && (Date.now() - stored) < DRIVE_REFRESH_MS) return stored;
  } catch(e){ /* localStorage unavailable */ }
  const fresh = Date.now();
  try{ localStorage.setItem(DRIVE_CB_KEY, String(fresh)); } catch(e){}
  return fresh;
})();
let driveRefreshTimer = null;

function isNarrowScreen(){
  return window.matchMedia("(max-width:720px)").matches;
}

/* ============ Google Drive link resolver ============ */
function extractDriveFileId(url){
  if(!url) return "";
  const normalizedUrl = String(url).trim();
  let id = null;
  let m = normalizedUrl.match(/\/file\/d\/([^\/?#]+)/);
  if(m) id = m[1];
  if(!id){
    m = normalizedUrl.match(/[?&]id=([^&#]+)/);
    if(m) id = m[1];
  }
  if(!id){
    // already a bare file id
    if(/^[a-zA-Z0-9_-]{20,}$/.test(normalizedUrl)) id = normalizedUrl;
  }
  return id || "";
}

function getDriveImageCandidates(url, size){
  const normalizedUrl = String(url || "").trim();
  if(!normalizedUrl) return [];
  const id = extractDriveFileId(normalizedUrl);
  const sz = size || GRID_THUMB_SIZE;
  if(!id) return [normalizedUrl];
  return [
    // Thumbnail endpoint sized to what's actually needed on screen — far
    // less data to download/decode than always requesting w2000.
    `https://drive.google.com/thumbnail?id=${id}&sz=${sz}&cb=${driveCacheBuster}`,
    `https://lh3.googleusercontent.com/d/${id}=${sz}`,
    `https://drive.google.com/uc?export=view&id=${id}&cb=${driveCacheBuster}`,
    `https://drive.google.com/uc?id=${id}&export=view&cb=${driveCacheBuster}`
  ];
}

/* ============ Cloudinary helpers ============ */
const CLOUDINARY_CLOUD = "k07tyh2a";
const CLOUDINARY_BASE = `https://res.cloudinary.com/${CLOUDINARY_CLOUD}/image/upload`;

function isCloudinaryUrl(url){
  return String(url || "").includes("res.cloudinary.com");
}

// Returns the public_id (path after /upload/ with no transformation prefix).
function extractCloudinaryPublicId(url){
  const m = String(url || "").match(/\/upload\/(?:[^/]+\/)*?([^/?#]+)$/);
  return m ? m[1] : "";
}

// Maps Drive-style size string ("w480") → Cloudinary transformation string.
function sizeToCloudinaryTransform(sz){
  const n = String(sz || GRID_THUMB_SIZE).replace(/^w/, "");
  return `w_${n},c_limit,q_auto,f_auto`;
}

function getCloudinaryImageCandidates(url, size){
  // Strip any existing transformation already in the stored URL.
  const cleanUrl = String(url || "").replace(/\/upload\/[^/]*,.*?\//, "/upload/");
  const m = cleanUrl.match(/\/upload\/(.+)$/);
  if(!m) return [url];
  const publicId = m[1];
  const t = sizeToCloudinaryTransform(size);
  return [
    `${CLOUDINARY_BASE}/${t}/${publicId}`,
    `${CLOUDINARY_BASE}/${publicId}`
  ];
}

// Routes to Cloudinary or Drive candidates based on URL type.
function getImageCandidates(url, size){
  if(isCloudinaryUrl(url)) return getCloudinaryImageCandidates(url, size);
  return getDriveImageCandidates(url, size);
}

/* ============ IndexedDB image cache ============ */
const IMG_DB_NAME = "lawhaat_img_cache";
let imgDb = null;

function openImgDb(){
  return new Promise((res, rej)=>{
    const req = indexedDB.open(IMG_DB_NAME, 1);
    req.onupgradeneeded = e => e.target.result.createObjectStore("blobs");
    req.onsuccess = e => { imgDb = e.target.result; res(); };
    req.onerror = () => rej(req.error);
  });
}
function dbGet(key){
  return new Promise(res=>{
    if(!imgDb){ res(null); return; }
    const req = imgDb.transaction("blobs","readonly").objectStore("blobs").get(key);
    req.onsuccess = () => res(req.result ?? null);
    req.onerror = () => res(null);
  });
}
function dbPut(key, blob){
  if(!imgDb) return;
  try{ imgDb.transaction("blobs","readwrite").objectStore("blobs").put({blob, ts:Date.now()}, key); } catch(e){}
}

let _fetchSlots = 4; // max concurrent image fetches
async function _acquireSlot(){ while(_fetchSlots<=0) await new Promise(r=>setTimeout(r,80)); _fetchSlots--; }
function _releaseSlot(){ _fetchSlots++; }

// Fetch latest image, update element and save to IndexedDB cache.
async function fetchAndCache(imgEl, candidates, cacheKey){
  await _acquireSlot();
  try{
    // Cloudinary has proper Cache-Control/ETag; no-cache validates cheaply (304 if unchanged).
    const cacheMode = candidates[0].includes("cloudinary") ? "no-cache" : "reload";
    for(const url of candidates){
      try{
        const resp = await fetch(url, {cache:cacheMode});
        if(!resp.ok) continue;
        const blob = await resp.blob();
        if(!blob.type.startsWith("image/")) continue;
        if(imgEl._blobUrl) URL.revokeObjectURL(imgEl._blobUrl);
        imgEl._blobUrl = URL.createObjectURL(blob);
        imgEl.onerror = null;
        imgEl.src = imgEl._blobUrl;
        if(cacheKey) dbPut(cacheKey, blob);
        return;
      } catch(e){ /* try next candidate */ }
    }
  } finally{ _releaseSlot(); }
  if(!imgEl._blobUrl){
    let fi = 0;
    imgEl.onerror = ()=>{ if(++fi < candidates.length) imgEl.src = candidates[fi]; else imgEl.onerror = null; };
    imgEl.src = candidates[0];
  }
}

// Stale-while-revalidate: show cached blob instantly, refresh from CDN in background.
async function setImageSourceWithFallback(imgEl, rawUrl, size){
  const candidates = getImageCandidates(rawUrl, size);
  if(!candidates.length){ imgEl.removeAttribute("src"); return; }
  imgEl.decoding = "async";
  const cacheId = isCloudinaryUrl(rawUrl)
    ? extractCloudinaryPublicId(rawUrl)
    : extractDriveFileId(rawUrl);
  const cacheKey = cacheId ? `${cacheId}_${size || GRID_THUMB_SIZE}` : null;
  if(cacheKey){
    const entry = await dbGet(cacheKey);
    if(entry){
      // handle both new {blob,ts} format and legacy raw Blob entries
      const blob = (entry.blob instanceof Blob) ? entry.blob : entry;
      const ts   = entry.ts || 0;
      if(blob instanceof Blob){
        if(imgEl._blobUrl) URL.revokeObjectURL(imgEl._blobUrl);
        imgEl._blobUrl = URL.createObjectURL(blob);
        imgEl.src = imgEl._blobUrl;
        // Skip network while the cached copy is still within the revalidate window
        // (applies to Cloudinary too, otherwise every render() re-fetches everything).
        if(Date.now() - ts < IMAGE_REVALIDATE_MS) return;
      }
    }
  }
  fetchAndCache(imgEl, candidates, cacheKey);
}

function refreshDriveImages(){
  if(document.hidden) return;
  driveCacheBuster = Date.now();
  try{ localStorage.setItem(DRIVE_CB_KEY, String(driveCacheBuster)); } catch(e){}
  render();
  if(currentModalSrno){
    const active = getFilteredItems().find(item => item.srno === currentModalSrno);
    if(active){
      setImageSourceWithFallback(document.getElementById("modalImg"), active.linktoimg, MODAL_IMG_SIZE);
      renderModalThumbnails();
    }
  }
}

function startDriveAutoRefresh(){
  if(driveRefreshTimer) clearInterval(driveRefreshTimer);
  driveRefreshTimer = setInterval(refreshDriveImages, DRIVE_REFRESH_MS);
}

/* ============ Favorites ============ */
function getFavorites(){
  try{ return JSON.parse(localStorage.getItem(FAV_KEY) || "[]"); }
  catch(e){ return []; }
}
function toggleFavorite(srno){
  let favs = getFavorites();
  const i = favs.indexOf(srno);
  if(i>-1) favs.splice(i,1); else favs.push(srno);
  localStorage.setItem(FAV_KEY, JSON.stringify(favs));
  return favs;
}

function normalizeRow(row){
  const normalized = {};
  Object.entries(row || {}).forEach(([key, value])=>{
    const cleanKey = String(key || "").trim().toLowerCase();
    normalized[cleanKey] = typeof value === "string" ? value.trim() : value;
  });
  return normalized;
}

function parseCsvText(csvText){
  const res = Papa.parse(csvText, {
    header:true,
    skipEmptyLines:true
  });
  if(!(res.data && res.data.length)) return false;
  const rows = res.data.map(normalizeRow).filter(r=>r.srno);
  if(!rows.length) return false;
  allData = rows;
  init();
  return true;
}

function scoreCsvText(csvText){
  const sample = csvText.slice(0, 8000);
  const arabicCount = (sample.match(/[\u0600-\u06FF]/g) || []).length;
  const replacementCount = (sample.match(/�/g) || []).length;
  return arabicCount - (replacementCount * 20);
}

function decodeCsvBuffer(buffer){
  const encodings = ["utf-8", "windows-1256"];
  let bestText = "";
  let bestScore = Number.NEGATIVE_INFINITY;
  for(const encoding of encodings){
    try{
      const csvText = new TextDecoder(encoding).decode(buffer);
      const score = scoreCsvText(csvText);
      if(score > bestScore){
        bestScore = score;
        bestText = csvText;
      }
    } catch(e){}
  }
  return bestText ? parseCsvText(bestText) : false;
}

/* ============ Load CSV ============ */
async function loadData(){
  try{
    const csvText = await fetchTableAsCsv(CSV_TABLE);
    if(!parseCsvText(csvText)) useFallback();
  } catch(e){
    useFallback();
  }
}
function useFallback(){
  allData = SAMPLE_DATA;
  document.getElementById("dataNotice").classList.add("show");
  init();
}

/* ============ Init UI ============ */
function init(){
  const cats = ["الكل", ...new Set(allData.map(r=>r.category).filter(Boolean))];
  buildToolbar(cats);
  buildPageSidebar();
  render();
}

function getPageValue(row){
  const value = String(row?.page ?? "").trim();
  return value || "-";
}

function comparePageValues(a, b){
  const aNum = Number.parseFloat(a);
  const bNum = Number.parseFloat(b);
  const aIsNum = !Number.isNaN(aNum);
  const bIsNum = !Number.isNaN(bNum);
  if(aIsNum && bIsNum) return aNum - bNum;
  if(aIsNum) return -1;
  if(bIsNum) return 1;
  return a.localeCompare(b, "ar");
}

function buildPageSidebar(){
  const pageList = document.getElementById("pageList");
  const sidebar = document.getElementById("pageSidebar");
  const toggleBtn = document.getElementById("sidebarToggle");
  const main = document.getElementById("contentMain");
  const pageValues = [...new Set(allData.map(getPageValue))].sort(comparePageValues);
  const availableValues = [ALL_PAGES_LABEL, ...pageValues];

  if(!availableValues.includes(activePage)){
    activePage = ALL_PAGES_LABEL;
  }

  pageList.innerHTML = "";
  availableValues.forEach(value=>{
    const btn = document.createElement("button");
    btn.className = "page-btn" + (value===activePage ? " active" : "");
    btn.textContent = value;
    btn.onclick = ()=>{
      activePage = value;
      buildPageSidebar();
      render();
    };
    pageList.appendChild(btn);
  });

  sidebar.classList.toggle("collapsed", !sidebarExpanded);
  main.classList.toggle("sidebar-collapsed", !sidebarExpanded);
  toggleBtn.setAttribute("aria-expanded", sidebarExpanded ? "true" : "false");
}

function buildToolbar(cats){
  const desktop = document.getElementById("toolbarDesktop");
  const sheet = document.getElementById("catSheet");
  desktop.innerHTML = "";
  sheet.innerHTML = "";

  cats.forEach(cat=>{
    const p1 = document.createElement("div");
    p1.className = "pill" + (cat===activeCategory ? " active" : "");
    p1.textContent = cat;
    p1.onclick = ()=>setCategory(cat);
    desktop.appendChild(p1);

    const p2 = p1.cloneNode(true);
    p2.onclick = ()=>{ setCategory(cat); document.getElementById("catSheet").classList.remove("open"); };
    sheet.appendChild(p2);
  });

  const favPill = document.createElement("div");
  favPill.className = "pill fav-pill" + (showFavoritesOnly ? " active" : "");
  favPill.innerHTML = `<svg viewBox="0 0 24 24" fill="${showFavoritesOnly ? 'currentColor' : 'none'}" stroke="currentColor" stroke-width="2"><path d="M12 21s-7-4.6-9.5-9C.8 8.4 2.6 5 6 5c2 0 3.3 1 4.5 2.5C11.7 6 13 5 15 5c3.4 0 5.2 3.4 3.5 7-2.5 4.4-9.5 9-9.5 9z"/></svg> المفضلة`;
  favPill.onclick = ()=>{ showFavoritesOnly = !showFavoritesOnly; buildToolbar(cats); render(); };
  desktop.appendChild(favPill);
  sheet.appendChild(favPill.cloneNode(true)).onclick = ()=>{ showFavoritesOnly = !showFavoritesOnly; buildToolbar(cats); render(); document.getElementById("catSheet").classList.remove("open"); };

  document.getElementById("currentCatLabel").textContent = activeCategory + (showFavoritesOnly ? " · المفضلة" : "");
}

function setCategory(cat){
  activeCategory = cat;
  const cats = ["الكل", ...new Set(allData.map(r=>r.category).filter(Boolean))];
  buildToolbar(cats);
  render();
}

document.getElementById("dotsBtn").addEventListener("click", ()=>{
  document.getElementById("catSheet").classList.toggle("open");
});

document.getElementById("searchInput").addEventListener("input", (e)=>{
  searchTerm = e.target.value.trim();
  render();
});
document.getElementById("sidebarToggle").addEventListener("click", ()=>{
  sidebarExpanded = !sidebarExpanded;
  buildPageSidebar();
});

/* ============ Render grid ============ */
function render(){
  const items = getFilteredItems();
  const favs = getFavorites();

  const grid = document.getElementById("grid");
  const empty = document.getElementById("emptyState");
  grid.innerHTML = "";

  if(items.length===0){
    empty.style.display = "block";
    return;
  }
  empty.style.display = "none";

  items.forEach(r=>{
    const card = document.createElement("div");
    card.className = "card";

    const isFav = favs.includes(r.srno);
    const favBtn = document.createElement("button");
    favBtn.className = "fav-btn" + (isFav ? " active" : "");
    favBtn.setAttribute("aria-label","أضف للمفضلة");
    favBtn.innerHTML = `<svg viewBox="0 0 24 24"><path d="M12 21s-7-4.6-9.5-9C.8 8.4 2.6 5 6 5c2 0 3.3 1 4.5 2.5C11.7 6 13 5 15 5c3.4 0 5.2 3.4 3.5 7-2.5 4.4-9.5 9-9.5 9z"/></svg>`;
    favBtn.onclick = (ev)=>{
      ev.stopPropagation();
      toggleFavorite(r.srno);
      render();
    };

    const thumbWrap = document.createElement("div");
    thumbWrap.className = "thumb-wrap";
    const img = document.createElement("img");
    setImageSourceWithFallback(img, r.linktoimg, GRID_THUMB_SIZE);
    img.alt = r.lawhatname || "";
    img.loading = "lazy";
    thumbWrap.appendChild(img);

    const name = document.createElement("div");
    name.className = "name";
    name.textContent = r.lawhatname || "";

    card.appendChild(favBtn);
    card.appendChild(thumbWrap);
    card.appendChild(name);
    card.onclick = ()=>openModalBySrno(r.srno);

    grid.appendChild(card);
  });
}

/* ============ Modal ============ */
let currentZoom = 100;
let wheelZoomHandler = null;
let panMode = false;
let panX = 0;
let panY = 0;
let panState = null;
let lastTapTime = 0;
let lastTapX = 0;
let lastTapY = 0;
let touchTapHandler = null;
let pinchState = null;

function resetImageView(){
  currentZoom = 100;
  panX = 0;
  panY = 0;
  applyImageZoom();
}

function applyImageZoom(){
  const img = document.getElementById("modalImg");
  img.style.transform = `translate(${panX}px, ${panY}px) scale(${currentZoom / 100})`;
}

function updatePanMode(){
  const scrollArea = document.getElementById("imgScroll");
  const handBtn = document.getElementById("handTool");
  scrollArea.classList.toggle("pan-active", panMode);
  handBtn?.classList.toggle("active", panMode);
}

function setZoom(nextZoom){
  currentZoom = Math.max(50, Math.min(nextZoom, 300));
  applyImageZoom();
}

function setPan(nextX, nextY){
  panX = nextX;
  panY = nextY;
  applyImageZoom();
}

function endPan(){
  const scrollArea = document.getElementById("imgScroll");
  if(panState){
    scrollArea.removeEventListener("pointermove", panState.move);
    scrollArea.removeEventListener("pointerup", panState.up);
    scrollArea.removeEventListener("pointercancel", panState.up);
    panState = null;
  }
  scrollArea.classList.remove("dragging");
}

function isMobileFullscreenImage(){
  const imageSide = document.querySelector(".modal-image-side");
  return isNarrowScreen() && document.fullscreenElement === imageSide;
}

function escapeHtml(value){
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function applyInlineMarkdown(text){
  let content = text;
  content = content.replace(/\^([^\^\n]+)\^/g, "<sup>$1</sup>");
  content = content.replace(/&lt;sup&gt;([\s\S]*?)&lt;\/sup&gt;/g, "<sup>$1</sup>");
  content = content.replace(/`([^`]+)`/g, "<code>$1</code>");
  content = content.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
  content = content.replace(/__([^_]+)__/g, "<strong>$1</strong>");
  content = content.replace(/\*([^*]+)\*/g, "<em>$1</em>");
  content = content.replace(/_([^_]+)_/g, "<em>$1</em>");
  content = content.replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g, '<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>');
  return content;
}

function renderMarkdown(markdown){
  const raw = String(markdown ?? "").replace(/\r\n?/g, "\n");
  const lines = raw.split("\n");
  const html = [];
  let inList = null;
  let inQuote = false;
  let inCodeBlock = false;
  const closeOpenBlocks = ()=>{
    if(inQuote){ html.push("</blockquote>"); inQuote = false; }
    if(inList){ html.push(`</${inList}>`); inList = null; }
  };

  for(const line of lines){
    const trimmed = line.trim();

    if(trimmed.startsWith("```")){
      closeOpenBlocks();
      if(!inCodeBlock){
        html.push("<pre><code>");
        inCodeBlock = true;
      } else {
        html.push("</code></pre>");
        inCodeBlock = false;
      }
      continue;
    }

    if(inCodeBlock){
      html.push(`${escapeHtml(line)}\n`);
      continue;
    }

    if(trimmed === ""){
      closeOpenBlocks();
      continue;
    }

    const heading = trimmed.match(/^(#{1,6})\s+(.*)$/);
    if(heading){
      closeOpenBlocks();
      const level = heading[1].length;
      const text = applyInlineMarkdown(escapeHtml(heading[2]));
      if(level === 2){
        html.push('<hr class="md-h2-divider">');
      }
      html.push(`<h${level}>${text}</h${level}>`);
      continue;
    }

    if(trimmed.startsWith(">")){
      if(inList){ html.push(`</${inList}>`); inList = null; }
      if(!inQuote){ html.push("<blockquote>"); inQuote = true; }
      const quoteText = applyInlineMarkdown(escapeHtml(trimmed.replace(/^>\s?/, "")));
      html.push(`<p>${quoteText}</p>`);
      continue;
    }

    if(inQuote){ html.push("</blockquote>"); inQuote = false; }

    const ulMatch = trimmed.match(/^[-*]\s+(.*)$/);
    if(ulMatch){
      if(inList !== "ul"){
        if(inList){ html.push(`</${inList}>`); }
        html.push("<ul>");
        inList = "ul";
      }
      html.push(`<li>${applyInlineMarkdown(escapeHtml(ulMatch[1]))}</li>`);
      continue;
    }

    const olMatch = trimmed.match(/^(\d+)\.\s+(.*)$/);
    if(olMatch){
      if(inList !== "ol"){
        if(inList){ html.push(`</${inList}>`); }
        html.push("<ol>");
        inList = "ol";
      }
      html.push(`<li>${applyInlineMarkdown(escapeHtml(olMatch[2]))}</li>`);
      continue;
    }

    if(inList){
      html.push(`</${inList}>`);
      inList = null;
    }

    html.push(`<p>${applyInlineMarkdown(escapeHtml(trimmed))}</p>`);
  }

  closeOpenBlocks();
  if(inCodeBlock){
    html.push("</code></pre>");
  }
  return html.join("");
}

function getFilteredItems(){
  const favs = getFavorites();
  return allData.filter(r=>{
    const matchesCat = activeCategory==="الكل" || r.category===activeCategory;
    const matchesSearch = !searchTerm || (r.lawhatname||"").includes(searchTerm);
    const matchesFav = !showFavoritesOnly || favs.includes(r.srno);
    const matchesPage = activePage===ALL_PAGES_LABEL || getPageValue(r)===activePage;
    return matchesCat && matchesSearch && matchesFav && matchesPage;
  }).sort((a, b)=>{
    const aNum = Number.parseInt(a.srno, 10);
    const bNum = Number.parseInt(b.srno, 10);
    if(Number.isNaN(aNum) && Number.isNaN(bNum)) return 0;
    if(Number.isNaN(aNum)) return 1;
    if(Number.isNaN(bNum)) return -1;
    return aNum - bNum;
  });
}

function openModalBySrno(srno){
  const items = getFilteredItems();
  const index = items.findIndex(item=>item.srno===srno);
  if(index >= 0){
    openModal(items[index], 0);
  }
}

function navigateModal(step){
  const items = getFilteredItems();
  if(!items.length || !currentModalSrno) return;
  const index = items.findIndex(item=>item.srno===currentModalSrno);
  if(index < 0) return;
  const nextIndex = (index + step + items.length) % items.length;
  openModal(items[nextIndex], step);
}

function openModal(r, direction = 0){
  currentModalSrno = r.srno;
  currentModalItems = getFilteredItems();
  document.getElementById("modalTitle").textContent = r.lawhatname || "";
  document.getElementById("modalIbarat").innerHTML = renderMarkdown(r.ibarat || "");
  document.getElementById("modalPage").textContent = r.page || "-";
  document.getElementById("modalLine").textContent = r.line || "-";
  const img = document.getElementById("modalImg");
  const frame = document.getElementById("modalImgFrame");
  if(direction !== 0){
    frame.classList.remove("slide-in", "slide-left", "slide-right");
    void frame.offsetWidth;
    frame.classList.add(direction > 0 ? "slide-right" : "slide-left");
  }
  setImageSourceWithFallback(img, r.linktoimg, MODAL_IMG_SIZE);
  resetImageView();
  panMode = false;
  updatePanMode();
  img.onclick = ()=>{
    if(isNarrowScreen() && !document.fullscreenElement){
      document.querySelector(".modal-image-side")?.requestFullscreen?.();
    }
  };
  const scrollArea = document.getElementById("imgScroll");
  if(wheelZoomHandler){
    scrollArea.removeEventListener("wheel", wheelZoomHandler);
  }
  wheelZoomHandler = (event)=>{
    event.preventDefault();
    const delta = event.deltaY > 0 ? -10 : 10;
    setZoom(currentZoom + delta);
  };
  scrollArea.addEventListener("wheel", wheelZoomHandler, { passive:false });
  scrollArea.addEventListener("pointerenter", ()=>{
    panMode = true;
    updatePanMode();
  });
  scrollArea.addEventListener("pointerleave", ()=>{
    if(!panState){
      panMode = false;
      updatePanMode();
    }
  });
  if(touchTapHandler){
    scrollArea.removeEventListener("touchend", touchTapHandler);
  }
  touchTapHandler = (event)=>{
    if(!isMobileFullscreenImage()) return;
    const touch = event.changedTouches && event.changedTouches[0];
    if(!touch) return;
    const now = Date.now();
    const isDoubleTap = (now - lastTapTime) < 300 && Math.abs(touch.clientX - lastTapX) < 24 && Math.abs(touch.clientY - lastTapY) < 24;
    if(isDoubleTap){
      event.preventDefault();
      resetImageView();
      lastTapTime = 0;
      return;
    }
    lastTapTime = now;
    lastTapX = touch.clientX;
    lastTapY = touch.clientY;
  };
  scrollArea.addEventListener("touchend", touchTapHandler, { passive:false });
  scrollArea.addEventListener("click", handleImageClickReset);
  scrollArea.addEventListener("dblclick", handleImageClickReset);
  scrollArea.addEventListener("touchstart", (event)=>{
    if(!isMobileFullscreenImage()) return;
    if(event.touches.length !== 2) return;
    const [first, second] = event.touches;
    const startDistance = Math.hypot(second.clientX - first.clientX, second.clientY - first.clientY);
    pinchState = { startDistance, startZoom: currentZoom };
  }, { passive:false });
  scrollArea.addEventListener("touchmove", (event)=>{
    if(!isMobileFullscreenImage()) return;
    if(!pinchState || event.touches.length !== 2) return;
    event.preventDefault();
    const [first, second] = event.touches;
    const distance = Math.hypot(second.clientX - first.clientX, second.clientY - first.clientY);
    const scale = distance / pinchState.startDistance;
    setZoom(pinchState.startZoom * scale);
  }, { passive:false });
  scrollArea.addEventListener("touchend", (event)=>{
    if(event.touches && event.touches.length < 2){
      pinchState = null;
    }
  });
  scrollArea.onpointerdown = (event)=>{
    event.preventDefault();
    const isTouch = event.pointerType === "touch";
    if(isTouch && !isMobileFullscreenImage()) return;
    if(isTouch){
      const now = Date.now();
      const isDoubleTap = (now - lastTapTime) < 300 && Math.abs(event.clientX - lastTapX) < 24 && Math.abs(event.clientY - lastTapY) < 24;
      lastTapTime = now;
      lastTapX = event.clientX;
      lastTapY = event.clientY;
      if(isDoubleTap){
        resetImageView();
        return;
      }
    }
    if(!panMode) return;
    scrollArea.setPointerCapture(event.pointerId);
    const startX = event.clientX;
    const startY = event.clientY;
    const originX = panX;
    const originY = panY;
    scrollArea.classList.add("dragging");
    const move = (moveEvent)=>{
      const deltaX = moveEvent.clientX - startX;
      const deltaY = moveEvent.clientY - startY;
      setPan(originX + deltaX, originY + deltaY);
    };
    const up = ()=>{
      endPan();
    };
    panState = { move, up };
    scrollArea.addEventListener("pointermove", move);
    scrollArea.addEventListener("pointerup", up, { once:true });
    scrollArea.addEventListener("pointercancel", up, { once:true });
  };
  scrollArea.ondragstart = ()=>false;
  updatePanMode();
  renderModalThumbnails();
  document.getElementById("overlay").classList.add("open");
  requestAnimationFrame(()=>{
    frame.classList.remove("slide-left", "slide-right");
    frame.classList.add("slide-in");
  });
}
let modalThumbStripKey = null;
function renderModalThumbnails(){
  const strip = document.getElementById("modalThumbStrip");
  if(!strip) return;
  // Only rebuild the thumb buttons (and re-run image loads) when the item set actually
  // changes; otherwise just move the "active" highlight so its CSS transition can play.
  const key = currentModalItems.map(item=>item.srno).join(",");
  if(key !== modalThumbStripKey){
    modalThumbStripKey = key;
    strip.innerHTML = "";
    currentModalItems.forEach(item=>{
      const btn = document.createElement("button");
      btn.className = "modal-thumb-btn";
      btn.type = "button";
      btn.dataset.srno = item.srno;
      btn.setAttribute("aria-label", item.lawhatname || "");
      btn.title = item.lawhatname || "";
      const thumb = document.createElement("img");
      thumb.loading = "lazy";
      setImageSourceWithFallback(thumb, item.linktoimg, MODAL_THUMB_SIZE);
      thumb.alt = item.lawhatname || "";
      btn.appendChild(thumb);
      btn.onclick = ()=>openModalBySrno(item.srno);
      strip.appendChild(btn);
    });
  }
  strip.querySelectorAll(".modal-thumb-btn.active").forEach(b=>b.classList.remove("active"));
  const activeBtn = strip.querySelector(`.modal-thumb-btn[data-srno="${CSS.escape(currentModalSrno)}"]`);
  if(activeBtn){
    activeBtn.classList.add("active");
    activeBtn.scrollIntoView({behavior:"smooth", inline:"center", block:"nearest"});
  }
}
document.getElementById("modalClose").onclick = closeModal;
document.getElementById("modalPrev").onclick = ()=>navigateModal(1);
document.getElementById("modalNext").onclick = ()=>navigateModal(-1);
document.getElementById("overlay").addEventListener("click", (e)=>{
  if(e.target.id==="overlay") closeModal();
});
function closeModal(){
  if(document.fullscreenElement){
    document.exitFullscreen?.();
  }
  document.getElementById("overlay").classList.remove("open");
  const scrollArea = document.getElementById("imgScroll");
  if(wheelZoomHandler){
    scrollArea.removeEventListener("wheel", wheelZoomHandler);
    wheelZoomHandler = null;
  }
  scrollArea.onpointerdown = null;
  document.getElementById("modalImg").onclick = null;
  if(touchTapHandler){
    scrollArea.removeEventListener("touchend", touchTapHandler);
    touchTapHandler = null;
  }
  scrollArea.removeEventListener("click", handleImageClickReset);
  scrollArea.removeEventListener("dblclick", handleImageClickReset);
  pinchState = null;
  endPan();
  lastTapTime = 0;
  lastTapX = 0;
  lastTapY = 0;
  currentModalSrno = null;
  currentModalItems = [];
  modalThumbStripKey = null;
}
document.getElementById("zoomIn").onclick = ()=>{
  setZoom(currentZoom + 10);
};
document.getElementById("zoomOut").onclick = ()=>{
  setZoom(currentZoom - 10);
};
document.getElementById("modalImg").ondblclick = ()=>{
  resetImageView();
};
document.getElementById("handTool").onclick = ()=>{
  panMode = !panMode;
  updatePanMode();
};
document.getElementById("fullscreenToggle").onclick = async ()=>{
  const imageSide = document.querySelector(".modal-image-side");
  if(!document.fullscreenElement){
    await imageSide.requestFullscreen?.();
    panMode = isNarrowScreen();
    updatePanMode();
  } else {
    await document.exitFullscreen?.();
    panMode = false;
    updatePanMode();
  }
};
document.addEventListener("keydown",(e)=>{
  if(e.key==="Escape") closeModal();
});

function handleImageClickReset(event){
  if(event.detail === 2){
    event.preventDefault();
    resetImageView();
  }
}

document.addEventListener("fullscreenchange", ()=>{
  if(!isMobileFullscreenImage()){
    panMode = false;
    updatePanMode();
    pinchState = null;
  } else if(isNarrowScreen()){
    panMode = true;
    updatePanMode();
  }
});

document.getElementById("modalImg").addEventListener("load", ()=>{
  const frame = document.getElementById("modalImgFrame");
  frame.classList.remove("slide-left", "slide-right");
  frame.classList.add("slide-in");
});

openImgDb().catch(()=>{}); // open IndexedDB early so cache is ready before images render
// No point polling for changes once the images are locked down (see CONSTRUCTION_MODE above).
if(CONSTRUCTION_MODE) startDriveAutoRefresh();
loadData();
