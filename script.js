// 1. Firebase & Last.fm
import { initializeApp } from "https://www.gstatic.com/firebasejs/12.8.0/firebase-app.js";
import {
  getAuth, GoogleAuthProvider, signInWithPopup, signOut, onAuthStateChanged,
} from "https://www.gstatic.com/firebasejs/12.8.0/firebase-auth.js";
import {
  getFirestore, collection, doc, getDocs, setDoc, deleteDoc,
} from "https://www.gstatic.com/firebasejs/12.8.0/firebase-firestore.js";

const firebaseConfig = {
  apiKey: "AIzaSyCfS2MkP2m6I669bIJ9UUrkaG5GvO7Ex4",
  authDomain: "jootubemusic-b7157.firebaseapp.com",
  projectId: "jootubemusic-b7157",
  storageBucket: "jootubemusic-b7157.firebasestorage.app",
  messagingSenderId: "1090987417503",
  appId: "1:1090987417503:web:ff95ac7181a2c0e1eda7aa",
  measurementId: "G-VQHP01ZXKM",
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
const provider = new GoogleAuthProvider();
const LASTFM_API_KEY = "7e0b8eb10fdc5cf81968b38fdd543cff";
// 2. DOM
const searchInput  = document.getElementById("searchInput");
const searchBtn    = document.getElementById("searchBtn");
const authStatus   = document.getElementById("authStatus");
const authToggleBtn = document.getElementById("authToggleBtn");
const myGrid       = document.getElementById("myGrid");
const empty        = document.getElementById("empty");
const addAlbumBtn  = document.getElementById("addAlbumBtn");
const categoryBar  = document.getElementById("categoryBar");
let currentCategory = "all";

const searchModal  = document.getElementById("searchModal");
const modalGrid    = document.getElementById("modalGrid");
const modalClose   = document.getElementById("modalClose");
const modalBackdrop = document.getElementById("modalBackdrop");
const modalTitle   = document.getElementById("modalTitle");

const trackModal      = document.getElementById("trackModal");
const trackBackdrop   = document.getElementById("trackBackdrop");
const trackModalClose = document.getElementById("trackModalClose");
const trackModalTitle = document.getElementById("trackModalTitle");
const trackList       = document.getElementById("trackList");
const trackAddBtn     = document.getElementById("trackAddBtn");

const albumOptionModal    = document.getElementById("albumOptionModal");
const albumOptionTitle    = document.getElementById("albumOptionTitle");
const albumOptionClose    = document.getElementById("albumOptionClose");
const albumOptionCoverBtn = document.getElementById("albumOptionCoverBtn");
const albumOptionDeleteBtn= document.getElementById("albumOptionDeleteBtn");
const albumOptionCategoryBtn = document.getElementById("albumOptionCategoryBtn");
const albumOptionBackdrop = document.getElementById("albumOptionBackdrop");

const categoryModal      = document.getElementById("categoryModal");
const categoryBackdrop   = document.getElementById("categoryBackdrop");
const categoryModalClose = document.getElementById("categoryModalClose");
const categoryListEl     = document.getElementById("categoryList");
const categoryNewInput   = document.getElementById("categoryNewInput");
const categoryAddBtn     = document.getElementById("categoryAddBtn");

const miniPlayer      = document.getElementById("miniPlayer");
const miniCover       = document.getElementById("miniCover");
const miniTitle       = document.getElementById("miniTitle");
const miniArtist      = document.getElementById("miniArtist");
const miniToggle      = document.getElementById("miniToggle");
const miniHide        = document.getElementById("miniHide");
const miniPrev        = document.getElementById("miniPrev");
const miniNext        = document.getElementById("miniNext");
const miniSeek        = document.getElementById("miniSeek");
const miniCurrentTime = document.getElementById("miniCurrentTime");
const miniDuration    = document.getElementById("miniDuration");

const coverModal      = document.getElementById("coverModal");
const coverBackdrop   = document.getElementById("coverBackdrop");
const coverModalClose = document.getElementById("coverModalClose");
const coverModalTitle = document.getElementById("coverModalTitle");
const coverInfo       = document.getElementById("coverInfo");
const coverUrlInput   = document.getElementById("coverUrlInput");
const coverPreview    = document.getElementById("coverPreview");
const coverSaveBtn    = document.getElementById("coverSaveBtn");

if (miniCover) miniCover.addEventListener("click", openTrackModalForCurrentAlbum);
// 3. 상태 변수
let isPlaying       = false;
let myAlbums        = [];
let currentUser     = null;
let tracks          = [];
let currentTrackId  = null;
let currentTrackAlbum = null;
let playedTrackIdsInAlbum = new Set();
let playedAlbumKeys = new Set();

function getAlbumKey(album) {
  return `${album.artist} - ${album.name}`;
}

let customCategories = ["kpop", "indie", "pop", "jazz", "classic", "ost", "etc"];
const LOCAL_KEY_ALBUMS      = "jootubemusic.myAlbums";
const LOCAL_KEY_CATEGORIES  = "jootubemusic.categories";

let ytPlayer       = null;
let ytUpdateTimer  = null;

// ── 새 앨범 만들기 흐름 상태 ──────────────────────────────
let categorySelectMode = null; // 'create' | 'edit'
let pendingAlbum       = null; // 생성 중인 앨범 임시 데이터

window.DEBUG = {
  get currentTrackAlbum() { return currentTrackAlbum; },
  get currentTrackId()    { return currentTrackId; },
  get tracks()            { return tracks; },
  get myAlbums()          { return myAlbums; },
  get currentUser()       { return currentUser; },
};
// 4. 유틸리티
function pickAlbumImage(album) {
  const images = Array.isArray(album.image) ? album.image : [];
  let imgUrl = "";
  if (images.length) {
    const preferSizes = ["extralarge", "large", "medium", "small"];
    for (const size of preferSizes) {
      const found = images.find(img => img.size === size && img["#text"]);
      if (found) { imgUrl = found["#text"]; break; }
    }
  }
  if (!imgUrl) imgUrl = "./assets/cover-placeholder.png";
  if (imgUrl.startsWith("http://")) imgUrl = imgUrl.replace("http://", "https://");
  return imgUrl;
}

function hasRealCover(album) {
  const images = Array.isArray(album.image) ? album.image : [];
  if (!images.length) return false;
  const preferSizes = ["extralarge", "large", "medium", "small"];
  return preferSizes.some(size => images.some(img => img.size === size && img["#text"]));
}

function formatTime(secs) {
  if (!Number.isFinite(secs)) secs = 0;
  const m = Math.floor(secs / 60);
  const s = Math.floor(secs % 60);
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

function extractVideoId(input) {
  const trimmed = (input || "").trim();
  if (!trimmed) return "";
  if (/^[a-zA-Z0-9_\-]{8,}$/.test(trimmed) && !trimmed.includes("http")) return trimmed;
  try {
    const u = new URL(trimmed);
    if (u.hostname.includes("youtu.be")) return u.pathname.replace("/", "");
    const v = u.searchParams.get("v");
    if (v) return v;
    const parts = u.pathname.split("/");
    const last = parts.pop() || parts.pop();
    if (last && /^[a-zA-Z0-9_\-]{8,}$/.test(last)) return last;
  } catch (e) { /* ignore */ }
  return "";
}
// 5. LocalStorage
function saveMyAlbumsToStorage() {
  try { localStorage.setItem(LOCAL_KEY_ALBUMS, JSON.stringify(myAlbums)); }
  catch (e) { console.error("saveMyAlbumsToStorage error", e); }
}

function loadMyAlbumsFromStorage() {
  try {
    const json = localStorage.getItem(LOCAL_KEY_ALBUMS);
    if (!json) return;
    const arr = JSON.parse(json);
    if (Array.isArray(arr)) {
      myAlbums = arr.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
      renderMyAlbums();
    }
  } catch (e) { console.error("loadMyAlbumsFromStorage error", e); }
}

function loadCategoriesFromStorage() {
  try {
    const json = localStorage.getItem(LOCAL_KEY_CATEGORIES);
    if (!json) return;
    const arr = JSON.parse(json);
    if (Array.isArray(arr) && arr.length) customCategories = arr;
  } catch (e) { console.error("loadCategoriesFromStorage error", e); }
}

function saveCategoriesToStorage() {
  try { localStorage.setItem(LOCAL_KEY_CATEGORIES, JSON.stringify(customCategories)); }
  catch (e) { console.error("saveCategoriesToStorage error", e); }
}

loadCategoriesFromStorage();
// 6. Firestore
function userAlbumsColRef(uid) {
  return collection(db, "users", uid, "albums");
}

async function syncMyAlbumsToFirestore() {
  if (!currentUser) return;
  const uid = currentUser.uid;
  const colRef = userAlbumsColRef(uid);
  const ops = myAlbums.map(album => {
    const albumId = `${album.artist} - ${album.name}`;
    const docRef = doc(colRef, albumId);
    return setDoc(docRef, {
      name:      album.name,
      artist:    album.artist,
      image:     album.image,
      hasCover:  album.hasCover ?? true,
      category:  album.category || "etc",
      createdAt: album.createdAt || Date.now(),
    }, { merge: true });
  });
  await Promise.all(ops);
}

async function loadMyAlbumsFromFirestore() {
  if (!currentUser) return;
  const uid    = currentUser.uid;
  const colRef = userAlbumsColRef(uid);
  const snap   = await getDocs(colRef);
  const list   = [];
  snap.forEach(docSnap => {
    const d = docSnap.data();
    list.push({
      name:      d.name,
      artist:    d.artist,
      image:     d.image,
      hasCover:  d.hasCover,
      category:  d.category || "etc",
      createdAt: d.createdAt || 0,
    });
  });
  list.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
  myAlbums = list;
  renderMyAlbums();
  saveMyAlbumsToStorage();
}

function albumDocRef(uid, album) {
  const albumId = `${album.artist} - ${album.name}`;
  return doc(userAlbumsColRef(uid), albumId);
}

function albumTracksColRef(uid, album) {
  return collection(albumDocRef(uid, album), "tracks");
}

async function saveTracksForAlbumToFirestore(album, tracks) {
  if (!currentUser) return;
  const uid    = currentUser.uid;
  const colRef = albumTracksColRef(uid, album);
  const snap   = await getDocs(colRef);
  const deletions = [];
  snap.forEach(docSnap => deletions.push(deleteDoc(docSnap.ref)));
  await Promise.all(deletions);
  const ops = tracks.map((t, index) => {
    const trackRef = doc(colRef, t.id);
    return setDoc(trackRef, {
      id:        t.id,
      title:     t.title,
      artist:    t.artist,
      albumName: t.albumName,
      videoId:   t.videoId || "",
      coverUrl:  t.coverUrl || album.image || "",
      index,
    });
  });
  await Promise.all(ops);
}

async function loadTracksForAlbumFromFirestore(album) {
  if (!currentUser) return null;
  const uid    = currentUser.uid;
  const colRef = albumTracksColRef(uid, album);
  const snap   = await getDocs(colRef);
  if (snap.empty) return null;
  const list = [];
  snap.forEach(docSnap => {
    const d = docSnap.data();
    list.push({
      id:        d.id,
      title:     d.title,
      artist:    d.artist,
      albumName: d.albumName,
      videoId:   d.videoId || "",
      coverUrl:  d.coverUrl || album.image || "",
      index:     d.index ?? 0,
    });
  });
  list.sort((a, b) => (a.index ?? 0) - (b.index ?? 0));
  return list;
}
// 7. Last.fm API
async function searchAlbums(query) {
  const url = new URL("https://ws.audioscrobbler.com/2.0/");
  url.searchParams.set("method",  "album.search");
  url.searchParams.set("album",   query);
  url.searchParams.set("api_key", LASTFM_API_KEY);
  url.searchParams.set("format",  "json");
  url.searchParams.set("limit",   "50");
  const res = await fetch(url.toString());
  if (!res.ok) throw new Error(`Last.fm ${res.status}`);
  const data = await res.json();
  return data.results?.albummatches?.album;
}

async function fetchAlbumTracks(artist, albumName) {
  const url = new URL("https://ws.audioscrobbler.com/2.0/");
  url.searchParams.set("method",  "album.getinfo");
  url.searchParams.set("api_key", LASTFM_API_KEY);
  url.searchParams.set("artist",  artist);
  url.searchParams.set("album",   albumName);
  url.searchParams.set("format",  "json");
  const res = await fetch(url.toString());
  if (!res.ok) throw new Error(`album.getInfo ${res.status}`);
  const data = await res.json();
  return data.album?.tracks?.track;
}
// 8. 검색 모달
function openModal(query) {
  if (!searchModal) return;
  modalTitle.textContent = query;
  searchModal.style.display = "flex";
}

function closeModal() {
  if (!searchModal) return;
  searchModal.style.display = "none";
  if (modalGrid) modalGrid.innerHTML = "";
}

function renderSearchResults(albums) {
  if (!modalGrid) return;
  modalGrid.innerHTML = "";
  if (!albums || !albums.length) {
    const div = document.createElement("div");
    div.className = "empty";
    div.textContent = "검색 결과가 없습니다.";
    modalGrid.appendChild(div);
    return;
  }
  albums.forEach(album => {
    const card   = document.createElement("div");
    card.className = "card";
    const title  = album.name;
    const artist = album.artist;
    const imgUrl = pickAlbumImage(album);
    card.innerHTML = `
      <img src="${imgUrl}" alt="${title}" />
      <div class="card-title"><span>${title}</span></div>
      <div class="card-artist">${artist}</div>
    `;
    card.addEventListener("click", () => {
      const exists = myAlbums.some(a => a.name === title && a.artist === artist);
      if (!exists) {
        const newAlbum = {
          name:      title,
          artist,
          image:     imgUrl,
          hasCover:  hasRealCover(album),
          category:  "etc",
          createdAt: Date.now(),
        };
        myAlbums.unshift(newAlbum);
        renderMyAlbums();
        saveMyAlbumsToStorage();
        if (currentUser) syncMyAlbumsToFirestore().catch(err =>
          console.error("syncMyAlbumsToFirestore error", err)
        );
        closeModal();
        // 검색으로 추가된 앨범은 카테고리 선택 → 트랙 모달 순서로
        const idx = myAlbums.indexOf(newAlbum);
        categorySelectMode = "edit";
        openCategoryModal(idx);
        return;
      }
      const albumObj = myAlbums.find(a => a.name === title && a.artist === artist);
      if (!albumObj) return;
      if (!albumObj.hasCover) {
        closeModal();
        openCoverModal(albumObj);
      } else {
        closeModal();
        openTrackModal(albumObj);
      }
    });
    modalGrid.appendChild(card);
  });
}

async function handleSearch() {
  if (!searchInput) return;
  const q = searchInput.value.trim();
  if (!q) return;
  openModal(q);
  if (modalGrid) modalGrid.innerHTML = `<div class="empty">검색 중...</div>`;
  try {
    const albums = await searchAlbums(q);
    renderSearchResults(albums);
  } catch (err) {
    console.error(err);
    if (modalGrid) modalGrid.innerHTML = `<div class="empty">검색 실패.</div>`;
  }
}
// 9. 앨범 CRUD
async function deleteAlbumAtIndex(index) {
  const album = myAlbums[index];
  if (!album) return;
  myAlbums.splice(index, 1);
  renderMyAlbums();
  saveMyAlbumsToStorage();
  if (currentUser) {
    try {
      const uid    = currentUser.uid;
      const colRef = userAlbumsColRef(uid);
      const albumId = `${album.artist} - ${album.name}`;
      const docRef  = doc(colRef, albumId);
      await deleteDoc(docRef);
    } catch (e) { console.error("delete album from Firestore error", e); }
  }
}

async function updateAlbumCategory(index, newCategory) {
  const album = myAlbums[index];
  if (!album) return;
  album.category = newCategory;
  renderMyAlbums();
  saveMyAlbumsToStorage();
  if (currentUser) {
    try {
      const uid    = currentUser.uid;
      const colRef = userAlbumsColRef(uid);
      const albumId = `${album.artist} - ${album.name}`;
      const docRef  = doc(colRef, albumId);
      await setDoc(docRef, { category: newCategory }, { merge: true });
    } catch (e) { console.error("updateAlbumCategory Firestore error", e); }
  }
}

// ── 카테고리 모달 ──────────────────────────────────────────
let categoryTargetIndex = null;

function openCategoryModal(index) {
  if (!categoryModal) return;
  categoryTargetIndex = index;
  categoryModal.style.display = "flex";
  renderCategoryChips();
}

function closeCategoryModal() {
  if (!categoryModal) return;
  categoryModal.style.display = "none";
  categoryTargetIndex = null;
}

function renderCategoryChips() {
  if (!categoryListEl) return;
  categoryListEl.innerHTML = "";

  const album      = myAlbums[categoryTargetIndex];
  const currentCat = album ? (album.category || "etc") : null;

  const buttonContainer = document.createElement("div");
  buttonContainer.style.cssText =
    "display:flex; flex-wrap:wrap; gap:10px; margin-top:8px;";

  customCategories.forEach(cat => {
    const btn = document.createElement("button");
    btn.textContent = cat;
    btn.style.cssText =
      "padding:10px 20px; border-radius:20px; border:2px solid #ccc;" +
      "background:white; cursor:pointer; font-size:14px;";
    btn.dataset.category = cat;

    if (cat === currentCat) {
      btn.style.background   = "#007bff";
      btn.style.color        = "white";
      btn.style.borderColor  = "#007bff";
    }

    btn.addEventListener("click", () => {
      const selectedCat = cat;

      if (categorySelectMode === "create") {
        // ── STEP 2 완료: 카테고리 저장 → coverModal로 이동 ──
        pendingAlbum.category = selectedCat;
        closeCategoryModal();
        openNewAlbumInfoModal();

      } else {
        // ── 기존 카테고리 변경 ──
        currentCategory = selectedCat;
        if (categoryBar) {
          categoryBar.querySelectorAll(".category-btn").forEach(b => {
            b.classList.toggle("active", b.dataset.category === selectedCat);
          });
        }
        updateAlbumCategory(categoryTargetIndex, selectedCat);
        closeCategoryModal();
        categorySelectMode = null;
      }
    });

    buttonContainer.appendChild(btn);
  });

  categoryListEl.appendChild(buttonContainer);
}

// ── 새 앨범 만들기 — STEP 1 ───────────────────────────────
if (addAlbumBtn) {
  addAlbumBtn.addEventListener("click", () => {
    categorySelectMode = "create";
    pendingAlbum = {};
    // 카테고리 모달 헤더 타이틀 변경
    const catModalSpan = categoryModal?.querySelector(".modal-header span");
    if (catModalSpan) catModalSpan.textContent = "카테고리 선택";
    openCategoryModal(null); // index null = 신규
  });
}

// ── 새 앨범 만들기 — STEP 2: 앨범 정보 입력 (coverModal 재활용) ──
function openNewAlbumInfoModal() {
  if (!coverModal) return;

  coverModalTitle.textContent = "새 앨범 정보 입력";
  coverInfo.textContent       = "앨범 이름과 커버 이미지 URL을 입력하세요.";
  coverUrlInput.value         = "";
  coverPreview.src            = "";

  // 앨범 이름 input 동적 삽입 (없으면 생성)
  let nameInput = document.getElementById("newAlbumNameInput");
  if (!nameInput) {
    nameInput           = document.createElement("input");
    nameInput.id        = "newAlbumNameInput";
    nameInput.className = "cover-input";
    nameInput.type      = "text";
    nameInput.placeholder = "앨범 이름을 입력하세요";
    coverUrlInput.parentNode.insertBefore(nameInput, coverUrlInput);
  }
  nameInput.value        = "";
  nameInput.style.display = "block";

  coverModal.style.display = "flex";
}

// ── 새 앨범 만들기 — STEP 3: 저장 버튼 (coverSaveBtn 분기) ──
// → 단락 10에서 coverSaveBtn 이벤트로 처리

// ── renderMyAlbums ────────────────────────────────────────
function renderMyAlbums() {
  if (!myGrid || !empty) return;
  myGrid.innerHTML = "";

  const sorted = [...myAlbums].sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
  const base   = sorted.map(album => {
    const originalIndex = myAlbums.indexOf(album);
    return { album, originalIndex };
  });
  const filtered = currentCategory === "all"
    ? base
    : base.filter(({ album }) => (album.category || "etc") === currentCategory);

  if (!filtered.length) {
    empty.style.display = "block";
    return;
  }
  empty.style.display = "none";

  filtered.forEach(({ album, originalIndex }) => {
    const card = document.createElement("div");
    card.className = "card";
    card.innerHTML = `
      <div class="card-cover-wrap">
        <img src="${album.image}" alt="${album.name}" />
        <button class="album-option-btn" data-index="${originalIndex}"></button>
      </div>
      <div class="card-title"><span>${album.name}</span></div>
      <div class="card-artist">${album.artist}</div>
    `;
    card.addEventListener("click", e => {
      if (e.target.closest(".album-option-btn")) return;
      if (!album.hasCover) openCoverModal(album);
      else openTrackModal(album);
    });
    const optionBtn = card.querySelector(".album-option-btn");
    if (optionBtn) {
      optionBtn.addEventListener("click", e => {
        e.stopPropagation();
        const idx    = Number(optionBtn.dataset.index);
        const target = myAlbums[idx];
        if (!target) return;
        openAlbumOptionModal(target, idx);
      });
    }
    myGrid.appendChild(card);
  });
}
// 10. 커버 모달
let pendingCoverAlbum = null;

function openCoverModal(album) {
  if (!coverModal) return;
  pendingCoverAlbum = album;
  coverModalTitle.textContent = `${album.artist} - ${album.name}`;
  coverInfo.textContent = "앨범 커버 이미지 URL을 입력하세요.";
  coverUrlInput.value = "";
  coverPreview.src = album.image || "";

  const nameInput = document.getElementById("newAlbumNameInput");
  if (nameInput) nameInput.style.display = "none";

  coverModal.style.display = "flex";
}

function closeCoverModal() {
  if (!coverModal) return;
  coverModal.style.display = "none";
  pendingCoverAlbum = null;
  categorySelectMode = null;
  pendingAlbum = null;

  coverModalTitle.textContent = "커버 이미지 수정";
  coverInfo.textContent = "앨범 커버 이미지 URL을 입력하세요.";
  const nameInput = document.getElementById("newAlbumNameInput");
  if (nameInput) {
    nameInput.style.display = "none";
    nameInput.value = "";
  }
  coverUrlInput.value = "";
  coverPreview.src = "";
}

if (coverUrlInput) {
  coverUrlInput.addEventListener("input", () => {
    const url = coverUrlInput.value.trim();
    if (url.startsWith("http://") || url.startsWith("https://")) {
      coverPreview.src = url;
    }
  });
}

if (coverSaveBtn) {
  coverSaveBtn.addEventListener("click", () => {

    // ── 새 앨범 만들기 STEP 3 ──────────────────────────
    if (categorySelectMode === "create") {
      const nameInput = document.getElementById("newAlbumNameInput");
      const name = nameInput?.value.trim();
      const coverUrl = coverUrlInput.value.trim();

      if (!name) {
        alert("앨범 이름을 입력하세요.");
        return;
      }

      const newAlbum = {
        name:      name,
        artist:    name,
        image:     coverUrl || "./assets/cover-placeholder.png",
        hasCover:  !!coverUrl,
        category:  pendingAlbum.category || "etc",
        createdAt: Date.now(),
      };

      const exists = myAlbums.some(
        a => a.name === newAlbum.name && a.artist === newAlbum.artist
      );
      if (exists) {
        alert("동일한 이름의 앨범이 이미 있습니다.");
        return;
      }

      myAlbums.unshift(newAlbum);
      renderMyAlbums();
      saveMyAlbumsToStorage();
      if (currentUser) {
        syncMyAlbumsToFirestore().catch(err =>
          console.error("syncMyAlbumsToFirestore error", err)
        );
      }

      const created = newAlbum;
      closeCoverModal();
      openTrackModal(created);
      return;
    }

    // ── 기존 앨범 커버 수정 ────────────────────────────
    if (!pendingCoverAlbum) return;
    const url = coverUrlInput.value.trim();
    if (!url.startsWith("http://") && !url.startsWith("https://")) {
      alert("올바른 이미지 URL을 입력하세요.");
      return;
    }
    pendingCoverAlbum.image = url;
    pendingCoverAlbum.hasCover = true;
    renderMyAlbums();
    saveMyAlbumsToStorage();
    if (currentUser) syncMyAlbumsToFirestore();
    const album = pendingCoverAlbum;
    closeCoverModal();
    openTrackModal(album);
  });
}

if (coverModalClose) coverModalClose.addEventListener("click", closeCoverModal);
if (coverBackdrop)   coverBackdrop.addEventListener("click", closeCoverModal);
// 11. 트랙 모달
function getCurrentTrack() {
  return tracks.find(t => t.id === currentTrackId) || null;
}

function getNextPlayableTrackInCurrentAlbum() {
  if (!currentTrackAlbum || !Array.isArray(tracks) || !tracks.length || !currentTrackId)
    return null;
  const currentIndex = tracks.findIndex(t => t.id === currentTrackId);
  if (currentIndex === -1) return null;
  for (let i = currentIndex + 1; i < tracks.length; i++) {
    const t = tracks[i];
    if (t.videoId && t.videoId.trim()) return t;
  }
  return null;
}

function selectTrackOnly(id) {
  document
    .querySelectorAll("#trackModal #trackList li.selected-track")
    .forEach(item => item.classList.remove("selected-track"));
  const li = trackList
    ? trackList.querySelector(`[data-track-id="${id}"]`)
    : null;
  if (li) li.classList.add("selected-track");
  currentTrackId = id;
}

function playTrack(id) {
  const track = tracks.find(t => t.id === id);
  if (!track) return;
  if (!track.videoId || !track.videoId.trim()) {
    alert("YouTube videoId가 없습니다.");
    return;
  }
  document
    .querySelectorAll("#trackModal #trackList li.selected-track")
    .forEach(item => item.classList.remove("selected-track"));
  const li = trackList
    ? trackList.querySelector(`[data-track-id="${id}"]`)
    : null;
  if (li) li.classList.add("selected-track");
  currentTrackId = id;
  updateNowPlaying(track);
  if (miniPlayer) miniPlayer.style.display = "flex";
  playTrackOnYouTube(track);
  if (currentTrackAlbum) playedTrackIdsInAlbum.add(id);
}

function createTrackListItem(album, trackData, index) {
  const id = trackData.id;
  const li = document.createElement("li");
  li.dataset.trackId = id;
  li.innerHTML = `
    <span class="track-index">${index + 1}</span>
    <div class="track-line">
      <span class="track-title-text">${trackData.title}</span>
      <span class="track-dots"></span>
      <button class="track-edit-btn">${trackData.videoId ? "✎" : "＋"}</button>
      <button class="track-delete-btn">✕</button>
    </div>
  `;

  const line      = li.querySelector(".track-line");
  const editBtn   = li.querySelector(".track-edit-btn");
  const titleSpan = li.querySelector(".track-title-text");
  const deleteBtn = li.querySelector(".track-delete-btn");

  if (deleteBtn) {
    deleteBtn.addEventListener("click", () => {
      const idx = tracks.findIndex(t => t.id === id);
      if (idx === -1) return;
      const ok = confirm("트랙을 삭제할까요?");
      if (!ok) return;
      tracks.splice(idx, 1);
      renderTrackList();
      if (currentUser && currentTrackAlbum) {
        saveTracksForAlbumToFirestore(currentTrackAlbum, tracks).catch(err =>
          console.error("saveTracksForAlbumToFirestore delete track error", err)
        );
      }
      if (currentTrackId === id) currentTrackId = tracks[0]?.id || null;
    });
  }

  if (line) {
    line.addEventListener("click", e => {
      e.stopPropagation();
      playTrack(id);
    });
  }

  if (editBtn) {
    editBtn.addEventListener("click", e => {
      e.stopPropagation();
      const t = tracks.find(t => t.id === id);
      if (!t) return;
      const newTitle = prompt("트랙 제목 수정:", t.title);
      if (newTitle && newTitle.trim()) {
        t.title = newTitle.trim();
        if (titleSpan) titleSpan.textContent = t.title;
        const current = getCurrentTrack();
        if (current && current.id === id) miniTitle.textContent = t.title;
      }
      const rawUrl = prompt("YouTube videoId 또는 URL 입력:", t.videoId);
      if (rawUrl && rawUrl.trim()) {
        const videoId = extractVideoId(rawUrl);
        if (!videoId) {
          alert("올바른 YouTube videoId가 아닙니다.");
        } else {
          t.videoId = videoId;
          editBtn.textContent = t.videoId ? "✎" : "＋";
        }
      }
      if (currentUser && currentTrackAlbum) {
        saveTracksForAlbumToFirestore(currentTrackAlbum, tracks).catch(err =>
          console.error("saveTracksForAlbumToFirestore edit track error", err)
        );
      }
    });
  }

  return li;
}

function renderTrackList() {
  if (!trackList || !currentTrackAlbum) return;
  if (tracks === null || tracks === undefined) tracks = [];
  trackList.innerHTML = "";
  if (!tracks.length) {
    const li = document.createElement("li");
    li.className = "track-empty";
    li.textContent = "트랙이 없습니다.";
    trackList.appendChild(li);
    return;
  }
  tracks.forEach((t, idx) => {
    const li = createTrackListItem(currentTrackAlbum, t, idx);
    trackList.appendChild(li);
  });
}

async function openTrackModal(album) {
  if (!trackModal || !trackList) return;
  currentTrackAlbum = album;
  trackModalTitle.textContent = `${album.artist} - ${album.name}`;
  trackList.innerHTML = "";
  trackModal.style.display = "flex";
  try {
    let loadedTracks = await loadTracksForAlbumFromFirestore(album);
    if (!loadedTracks || !loadedTracks.length) {
      const lfTracks = await fetchAlbumTracks(album.artist, album.name);
      const arr = Array.isArray(lfTracks) ? lfTracks : (lfTracks ? [lfTracks] : []);
      loadedTracks = arr.map(t => {
        const nameRaw = typeof t === "object" ? t.name : t;
        const title = typeof nameRaw === "string" ? nameRaw : (nameRaw?.["#text"] || "");
        return {
          id:        crypto.randomUUID(),
          title,
          artist:    album.artist,
          albumName: album.name,
          videoId:   "",
          coverUrl:  album.image || "",
        };
      });
    }
    tracks = Array.isArray(loadedTracks) ? loadedTracks : [];
    playedTrackIdsInAlbum = new Set();
    renderTrackList();
    if (!currentTrackId || !tracks.some(t => t.id === currentTrackId)) {
      if (tracks.length) currentTrackId = tracks[0].id;
    }
  } catch (err) {
    console.error(err);
    trackList.innerHTML = `<li class="track-error"><span>트랙 로드 실패.</span></li>`;
  }
}

async function openTrackModalForCurrentAlbum() {
  if (!currentTrackAlbum) return;
  trackModalTitle.textContent = `${currentTrackAlbum.artist} - ${currentTrackAlbum.name}`;
  const loaded = await loadTracksForAlbumFromFirestore(currentTrackAlbum);
  tracks = loaded || tracks;
  renderTrackList();
  if (currentTrackId) selectTrackOnly(currentTrackId);
  trackModal.style.display = "flex";
}

async function autoPlayRandomTrackFromAlbum(album) {
  try {
    let loadedTracks = await loadTracksForAlbumFromFirestore(album);
    if (!loadedTracks || !loadedTracks.length) {
      const lfTracks = await fetchAlbumTracks(album.artist, album.name);
      if (!lfTracks || !Array.isArray(lfTracks) || lfTracks.length === 0) return;
      loadedTracks = lfTracks.map(t => {
        const title = typeof t.name === "string" ? t.name : (t.name?.["#text"] || "");
        return {
          id:        crypto.randomUUID(),
          title,
          artist:    album.artist,
          albumName: album.name,
          videoId:   "",
          coverUrl:  album.image || "",
        };
      });
    }
    const playable = loadedTracks.filter(t => t.videoId);
    if (!playable.length) return;
    currentTrackAlbum = album;
    tracks = loadedTracks;
    playedTrackIdsInAlbum = new Set();
    const next = playable[Math.floor(Math.random() * playable.length)];
    playTrack(next.id);
  } catch (err) {
    console.error("autoPlayRandomTrackFromAlbum error", err);
  }
}

function closeTrackModal() {
  if (!trackModal || !trackList) return;
  trackModal.style.display = "none";
  trackList.innerHTML = "";
}
// 12. YouTube IFrame API
function injectYouTubeAPI() {
  if (document.getElementById("yt-iframe-api")) return;
  const tag = document.createElement("script");
  tag.id  = "yt-iframe-api";
  tag.src = "https://www.youtube.com/iframe_api";
  document.head.appendChild(tag);
}

window.onYouTubeIframeAPIReady = function () {
  ytPlayer = new YT.Player("ytPlayer", {
    height: "0",
    width:  "0",
    videoId: "",
    playerVars: {
      autoplay:       0,
      controls:       0,
      modestbranding: 1,
      rel:            0,
      playsinline:    1,
      disablekb:      1,
      fs:             0,
    },
    events: {
      onReady:       onPlayerReady,
      onStateChange: onPlayerStateChange,
    },
  });
};

function onPlayerReady() {
  isPlaying = false;
  updatePlayButtonUI();
  updateMiniPlayerProgress();
}

function updatePlayButtonUI() {
  if (!miniToggle) return;
  miniToggle.textContent = isPlaying ? "⏸" : "▶";
}

function onPlayerStateChange(event) {
  if (!window.YT) return;
  const state = event.data;
  if (state === YT.PlayerState.PLAYING) {
    isPlaying = true;
    updatePlayButtonUI();
    startYtProgressLoop();
  } else if (
    state === YT.PlayerState.PAUSED ||
    state === YT.PlayerState.ENDED
  ) {
    isPlaying = false;
    updatePlayButtonUI();
    if (state === YT.PlayerState.ENDED) {
      stopYtProgressLoop();
      handleTrackEnded();
    }
  }
}

function handleTrackEnded() {
  const nextTrack = getNextPlayableTrackInCurrentAlbum();
  if (nextTrack) {
    playTrack(nextTrack.id);
    return;
  }
  const excludeKey = currentTrackAlbum ? getAlbumKey(currentTrackAlbum) : null;
  playRandomTrackFromAllAlbums(excludeKey);
}
// 13. 랜덤 재생
async function playRandomTrackFromAllAlbums(excludeAlbumKey = null) {
  if (!currentUser) return;
  const candidates = Array.isArray(myAlbums)
    ? myAlbums.filter(a => getAlbumKey(a) !== excludeAlbumKey)
    : [];
  if (!candidates.length) return;

  const shuffled = [...candidates].sort(() => Math.random() - 0.5);

  for (const album of shuffled) {
    const loadedTracks = await loadTracksForAlbumFromFirestore(album);
    if (!Array.isArray(loadedTracks) || !loadedTracks.length) continue;
    const firstPlayable = loadedTracks.find(
      t => t.videoId && t.videoId.trim()
    );
    if (!firstPlayable) continue;
    currentTrackAlbum = album;
    tracks = loadedTracks;
    currentTrackId = firstPlayable.id;
    playedTrackIdsInAlbum = new Set([firstPlayable.id]);
    playTrack(firstPlayable.id);
    return;
  }
}
// 14. 프로그레스 & 미니플레이어 UI
function startYtProgressLoop() {
  if (ytUpdateTimer) return;
  ytUpdateTimer = setInterval(updateMiniPlayerProgress, 500);
}

function stopYtProgressLoop() {
  if (ytUpdateTimer) clearInterval(ytUpdateTimer);
  ytUpdateTimer = null;
}

function updateMiniPlayerProgress() {
  if (!ytPlayer || typeof ytPlayer.getDuration !== "function") {
    if (miniCurrentTime) miniCurrentTime.textContent = "0:00";
    if (miniDuration)    miniDuration.textContent    = "0:00";
    if (miniSeek)        miniSeek.value              = 0;
    return;
  }
  const duration = ytPlayer.getDuration() || 0;
  const current  = ytPlayer.getCurrentTime() || 0;
  if (!duration) {
    if (miniCurrentTime) miniCurrentTime.textContent = "0:00";
    if (miniDuration)    miniDuration.textContent    = "0:00";
    if (miniSeek)        miniSeek.value              = 0;
    return;
  }
  if (miniCurrentTime) miniCurrentTime.textContent = formatTime(current);
  if (miniDuration)    miniDuration.textContent    = formatTime(duration);
  if (miniSeek)        miniSeek.value              = (current / duration) * 100;
}

function applyMiniTitleMarquee() {
  if (!miniTitle) return;
  const wrapper = miniTitle.parentElement;
  if (!wrapper) return;
  wrapper.classList.remove("marquee-active");
  requestAnimationFrame(() => {
    if (miniTitle.scrollWidth > wrapper.clientWidth) {
      wrapper.classList.add("marquee-active");
    }
  });
}

function updateNowPlaying(track) {
  if (!track) return;
  const coverUrl = track.coverUrl || "";
  if (miniTitle)  miniTitle.textContent  = track.title;
  if (miniArtist) miniArtist.textContent = `${track.artist} — ${track.albumName}`;
  if (miniCover) {
    if (coverUrl) miniCover.src = coverUrl;
    else miniCover.removeAttribute("src");
  }
  if (miniSeek)        miniSeek.value              = 0;
  if (miniCurrentTime) miniCurrentTime.textContent = "0:00";
  if (miniDuration)    miniDuration.textContent    = "0:00";
  if (miniPlayer)      miniPlayer.style.display    = "flex";
  applyMiniTitleMarquee();
}

function playTrackOnYouTube(track) {
  if (!track.videoId) {
    alert("YouTube videoId가 없습니다.");
    return;
  }
  if (!ytPlayer || typeof ytPlayer.loadVideoById !== "function") {
    alert("YouTube 플레이어가 준비되지 않았습니다.");
    return;
  }
  ytPlayer.loadVideoById(track.videoId);
  ytPlayer.playVideo();
}
// 15. 미니플레이어 이벤트
if (miniToggle) {
  miniToggle.addEventListener("click", () => {
    if (!ytPlayer) return;
    const state = ytPlayer.getPlayerState();
    if (state === YT.PlayerState.PLAYING) {
      ytPlayer.pauseVideo();
    } else {
      ytPlayer.playVideo();
    }
  });
}

if (miniNext) {
  miniNext.addEventListener("click", () => {
    const nextTrack = getNextPlayableTrackInCurrentAlbum();
    if (nextTrack) {
      playTrack(nextTrack.id);
    } else {
      const excludeKey = currentTrackAlbum
        ? getAlbumKey(currentTrackAlbum)
        : null;
      playRandomTrackFromAllAlbums(excludeKey);
    }
  });
}

if (miniPrev) {
  miniPrev.addEventListener("click", () => {
    if (!currentTrackId || !Array.isArray(tracks) || !tracks.length) return;
    const idx = tracks.findIndex(t => t.id === currentTrackId);
    if (idx <= 0) return;
    for (let i = idx - 1; i >= 0; i--) {
      const t = tracks[i];
      if (t.videoId && t.videoId.trim()) {
        playTrack(t.id);
        break;
      }
    }
  });
}

if (miniHide) {
  miniHide.addEventListener("click", () => {
    if (miniPlayer) miniPlayer.style.display = "none";
  });
}

if (miniSeek) {
  miniSeek.addEventListener("input", () => {
    if (!ytPlayer) return;
    const duration = ytPlayer.getDuration() || 0;
    if (!duration) return;
    const pct         = Number(miniSeek.value) / 100;
    const previewTime = duration * pct;
    if (miniCurrentTime) miniCurrentTime.textContent = formatTime(previewTime);
  });

  miniSeek.addEventListener("change", () => {
    if (!ytPlayer) return;
    const duration = ytPlayer.getDuration() || 0;
    if (!duration) return;
    const pct     = Number(miniSeek.value) / 100;
    const newTime = duration * pct;
    ytPlayer.seekTo(newTime, true);
  });
}
// 16. 사이드바 & 카테고리바 & 트랙 추가
document.querySelectorAll(".sidebar-link[data-category]").forEach(btn => {
  btn.addEventListener("click", () => {
    const cat = btn.dataset.category || "all";
    currentCategory = cat;

    document.querySelectorAll(".sidebar-link[data-category]").forEach(b => {
      b.classList.toggle("sidebar-link-active", b === btn);
    });

    if (categoryBar) {
      categoryBar.querySelectorAll(".category-btn").forEach(b => {
        b.classList.toggle("active", b.dataset.category === cat);
      });
    }
    renderMyAlbums();
  });
});

if (categoryBar) {
  categoryBar.querySelectorAll(".category-btn").forEach(btn => {
    btn.addEventListener("click", () => {
      const cat = btn.dataset.category || "all";
      currentCategory = cat;
      categoryBar.querySelectorAll(".category-btn").forEach(b => {
        b.classList.toggle("active", b === btn);
      });
      renderMyAlbums();
    });
  });
}

if (trackAddBtn) {
  trackAddBtn.addEventListener("click", () => {
    if (!currentTrackAlbum) return;
    const title = prompt("트랙 제목을 입력하세요:");
    if (!title || !title.trim()) return;
    const artist = prompt("아티스트 이름:", currentTrackAlbum.artist);
    if (!artist || !artist.trim()) return;
    const rawUrl = prompt("YouTube videoId 또는 URL 입력:");
    if (!rawUrl || !rawUrl.trim()) return;
    const videoId = extractVideoId(rawUrl);
    if (!videoId) {
      alert("올바른 YouTube videoId가 아닙니다.");
      return;
    }
    const newTrack = {
      id:        crypto.randomUUID(),
      title:     title.trim(),
      artist:    artist.trim(),
      albumName: currentTrackAlbum.name,
      videoId,
      coverUrl:  currentTrackAlbum.image || "",
    };
    tracks.push(newTrack);
    if (trackList) {
      const li = createTrackListItem(
        currentTrackAlbum,
        newTrack,
        tracks.length - 1
      );
      trackList.appendChild(li);
    }
    if (currentUser && currentTrackAlbum) {
      saveTracksForAlbumToFirestore(currentTrackAlbum, tracks).catch(err =>
        console.error("saveTracksForAlbumToFirestore add track error", err)
      );
    }
  });
}
// 17. 앨범 옵션 모달
let albumOptionTargetIndex = null;
let albumOptionTargetAlbum = null;

function openAlbumOptionModal(album, index) {
  if (!albumOptionModal || !albumOptionTitle) return;
  albumOptionTargetAlbum  = album;
  albumOptionTargetIndex  = index;
  albumOptionTitle.textContent = `${album.artist} - ${album.name}`;
  albumOptionModal.style.display = "flex";
}

function closeAlbumOptionModal() {
  if (!albumOptionModal) return;
  albumOptionModal.style.display = "none";
  albumOptionTargetAlbum = null;
  albumOptionTargetIndex = null;
}

if (albumOptionClose) {
  albumOptionClose.addEventListener("click", closeAlbumOptionModal);
}

if (albumOptionBackdrop) {
  albumOptionBackdrop.addEventListener("click", e => {
    if (e.target === albumOptionBackdrop) closeAlbumOptionModal();
  });
}

if (albumOptionCoverBtn) {
  albumOptionCoverBtn.addEventListener("click", () => {
    if (!albumOptionTargetAlbum) return;
    const target = albumOptionTargetAlbum;
    closeAlbumOptionModal();
    openCoverModal(target);
  });
}

if (albumOptionDeleteBtn) {
  albumOptionDeleteBtn.addEventListener("click", () => {
    if (albumOptionTargetIndex === null || !albumOptionTargetAlbum) return;
    const album = albumOptionTargetAlbum;
    const ok = confirm(
      `"${album.artist} - ${album.name}" 앨범을 삭제할까요?`
    );
    if (!ok) return;
    const idx = albumOptionTargetIndex;
    closeAlbumOptionModal();
    deleteAlbumAtIndex(idx);
  });
}

if (albumOptionCategoryBtn) {
  albumOptionCategoryBtn.addEventListener("click", () => {
    if (albumOptionTargetIndex === null || !albumOptionTargetAlbum) return;
    const idx = albumOptionTargetIndex;
    closeAlbumOptionModal();
    categorySelectMode = "edit";
    openCategoryModal(idx);
  });
}
// 18. 검색 & 모달 닫기 이벤트
if (searchBtn) {
  searchBtn.addEventListener("click", handleSearch);
}
if (searchInput) {
  searchInput.addEventListener("keydown", e => {
    if (e.key === "Enter") handleSearch();
  });
}
if (modalClose) {
  modalClose.addEventListener("click", closeModal);
}
if (modalBackdrop) {
  modalBackdrop.addEventListener("click", closeModal);
}
if (trackModalClose) {
  trackModalClose.addEventListener("click", closeTrackModal);
}
if (trackBackdrop) {
  trackBackdrop.addEventListener("click", e => {
    if (e.target === trackBackdrop) closeTrackModal();
  });
}
if (categoryModalClose) {
  categoryModalClose.addEventListener("click", () => {
    closeCategoryModal();
    categorySelectMode = null;
    pendingAlbum = null;
  });
}
if (categoryBackdrop) {
  categoryBackdrop.addEventListener("click", e => {
    if (e.target === categoryBackdrop) {
      closeCategoryModal();
      categorySelectMode = null;
      pendingAlbum = null;
    }
  });
}
// 19. Firebase Auth
if (authToggleBtn) {
  authToggleBtn.addEventListener("click", async () => {
    try {
      if (currentUser) {
        await signOut(auth);
      } else {
        await signInWithPopup(auth, provider);
      }
    } catch (e) {
      console.error("auth toggle error", e);
      alert(`${e.code}: ${e.message}`);
    }
  });
}

onAuthStateChanged(auth, async user => {
  currentUser = user || null;
  if (user) {
    if (authStatus)    authStatus.textContent    = user.displayName;
    if (authToggleBtn) authToggleBtn.textContent = "Logout";
    try {
      await loadMyAlbumsFromFirestore();
    } catch (e) {
      console.error("loadMyAlbumsFromFirestore error", e);
    }
  } else {
    if (authStatus)    authStatus.textContent    = "";
    if (authToggleBtn) authToggleBtn.textContent = "Sign In";
    myAlbums = [];
    renderMyAlbums();
  }
});
// 20. 모바일 검색 & 초기화
loadMyAlbumsFromStorage();

const mobileSearchBtn   = document.querySelector(".mobile-search-btn");
const mobileSearchModal = document.getElementById("mobileSearchModal");
const mobileSearchInput = document.getElementById("mobileSearchInput");
const mobileSearchClose = document.getElementById("mobileSearchClose");

if (mobileSearchBtn) {
  mobileSearchBtn.addEventListener("click", () => {
    if (mobileSearchModal) mobileSearchModal.style.display = "block";
    if (mobileSearchInput) mobileSearchInput.focus();
  });
}

if (mobileSearchClose) {
  mobileSearchClose.addEventListener("click", () => {
    if (mobileSearchModal) mobileSearchModal.style.display = "none";
    if (mobileSearchInput) mobileSearchInput.value = "";
  });
}

if (mobileSearchInput) {
  mobileSearchInput.addEventListener("keypress", e => {
    if (e.key === "Enter") {
      const query = mobileSearchInput.value.trim();
      if (query) {
        const desktopInput = document.getElementById("searchInput");
        const desktopBtn   = document.getElementById("searchBtn");
        if (desktopInput) desktopInput.value = query;
        if (desktopBtn)   desktopBtn.click();
        if (mobileSearchModal) mobileSearchModal.style.display = "none";
        if (mobileSearchInput) mobileSearchInput.value = "";
      }
    }
  });
}

// 네비게이션 아이콘 버튼 (home / albums / library)
document.querySelectorAll(".icon-nav-btn[data-view]").forEach(btn => {
  btn.addEventListener("click", () => {
    document.querySelectorAll(".icon-nav-btn[data-view]").forEach(b => {
      b.classList.remove("icon-nav-active");
    });
    btn.classList.add("icon-nav-active");
    const view = btn.dataset.view;
    if (view === "albums") {
      // albums 아이콘 = 새 앨범 만들기 흐름 트리거
      categorySelectMode = "create";
      pendingAlbum = {};
      openCategoryModal(null);
    }
  });
});

// YouTube API 주입
injectYouTubeAPI();
