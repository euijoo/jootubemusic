// ===== 1. Firebase / Last.fm 설정 =====

import { initializeApp } from "https://www.gstatic.com/firebasejs/12.8.0/firebase-app.js";
import {
  getAuth,
  GoogleAuthProvider,
  signInWithPopup,
  signOut,
  onAuthStateChanged,
} from "https://www.gstatic.com/firebasejs/12.8.0/firebase-auth.js";
import {
  getFirestore,
  collection,
  doc,
  getDocs,
  setDoc,
  deleteDoc,
} from "https://www.gstatic.com/firebasejs/12.8.0/firebase-firestore.js";

const firebaseConfig = {
  apiKey: "AIzaSyCfS2MkP2m6I669bIJ9UUrkaG5GvO7E_x4",
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


// ===== 2. DOM 캐싱 =====

// 검색
const searchInput = document.getElementById("searchInput");
const searchBtn = document.getElementById("searchBtn");

// 로그인
const authStatus = document.getElementById("authStatus");
const authToggleBtn = document.getElementById("authToggleBtn");

// 내 앨범
const myGrid = document.getElementById("myGrid");
const empty = document.getElementById("empty");

// 카테고리 바
const categoryBar = document.getElementById("categoryBar");
let currentCategory = "all";

// 검색 모달
const searchModal = document.getElementById("searchModal");
const modalGrid = document.getElementById("modalGrid");
const modalClose = document.getElementById("modalClose");
const modalBackdrop = document.getElementById("modalBackdrop");
const modalTitle = document.getElementById("modalTitle");

// 트랙 모달
const trackModal = document.getElementById("trackModal");
const trackBackdrop = document.getElementById("trackBackdrop");
const trackModalClose = document.getElementById("trackModalClose");
const trackModalTitle = document.getElementById("trackModalTitle");
const trackList = document.getElementById("trackList");
const trackAddBtn = document.getElementById("trackAddBtn");

// 앨범 옵션 모달
const albumOptionModal = document.getElementById("albumOptionModal");
const albumOptionTitle = document.getElementById("albumOptionTitle");
const albumOptionClose = document.getElementById("albumOptionClose");
const albumOptionCoverBtn = document.getElementById("albumOptionCoverBtn");
const albumOptionDeleteBtn = document.getElementById("albumOptionDeleteBtn");
const albumOptionCategoryBtn = document.getElementById("albumOptionCategoryBtn");
const albumOptionBackdrop = document.getElementById("albumOptionBackdrop");

// 카테고리 관리 모달
const categoryModal = document.getElementById("categoryModal");
const categoryBackdrop = document.getElementById("categoryBackdrop");
const categoryModalClose = document.getElementById("categoryModalClose");
const categoryListEl = document.getElementById("categoryList");
const categoryNewInput = document.getElementById("categoryNewInput");
const categoryAddBtn = document.getElementById("categoryAddBtn");

// 미니 플레이어
const miniPlayer = document.getElementById("miniPlayer");
const miniCover = document.getElementById("miniCover");
const miniTitle = document.getElementById("miniTitle");
const miniArtist = document.getElementById("miniArtist");
const miniToggle = document.getElementById("miniToggle");
const miniHide = document.getElementById("miniHide");
// 새로 추가: 이전/다음 버튼 캐싱
const miniPrev = document.getElementById("miniPrev");
const miniNext = document.getElementById("miniNext");

// 타임라인
const miniSeek = document.getElementById("miniSeek");
const miniCurrentTime = document.getElementById("miniCurrentTime");
const miniDuration = document.getElementById("miniDuration");

// 커버 입력 모달
const coverModal = document.getElementById("coverModal");
const coverBackdrop = document.getElementById("coverBackdrop");
const coverModalClose = document.getElementById("coverModalClose");
const coverModalTitle = document.getElementById("coverModalTitle");
const coverInfo = document.getElementById("coverInfo");
const coverUrlInput = document.getElementById("coverUrlInput");
const coverPreview = document.getElementById("coverPreview");
const coverSaveBtn = document.getElementById("coverSaveBtn");


// ===== 3. 상태 =====

let isPlaying = false;
let myAlbums = [];
let currentUser = null;

let tracks = [];
let currentTrackId = null;
let currentTrackAlbum = null;

let playedTrackIdsInAlbum = new Set();
let playedAlbumKeys = new Set();

function getAlbumKey(album) {
  return `${album.artist} - ${album.name}`;
}

let customCategories = ["kpop", "pop", "ost", "etc"];
const LOCAL_KEY_ALBUMS = "jootubemusic.myAlbums";
const LOCAL_KEY_CATEGORIES = "jootubemusic.categories";

let ytPlayer = null;
let ytUpdateTimer = null;

// ✅ 디버깅용 전역 노출 (개발 중에만)
window.DEBUG = {
  get currentTrackAlbum() { return currentTrackAlbum; },
  get currentTrackId() { return currentTrackId; },
  get tracks() { return tracks; },
  get myAlbums() { return myAlbums; },
  get currentUser() { return currentUser; },
};

// ===== 4. 공통 유틸 =====

function pickAlbumImage(album) {
  const images = Array.isArray(album.image) ? album.image : [];
  let imgUrl = "";

  if (images.length) {
    const preferSizes = ["extralarge", "large", "medium", "small"];
    for (const size of preferSizes) {
      const found = images.find((img) => img.size === size && img["#text"]);
      if (found && found["#text"]) {
        imgUrl = found["#text"];
        break;
      }
    }
  }

  if (!imgUrl) {
    imgUrl =
      "https://via.placeholder.com/300x300.png?text=%EC%9D%B4%EB%AF%B8%EC%A7%80+%EC%97%86%EC%9D%8C";
  }
  if (imgUrl.startsWith("http://")) {
    imgUrl = imgUrl.replace("http://", "https://");
  }
  return imgUrl;
}

function hasRealCover(album) {
  const images = Array.isArray(album.image) ? album.image : [];
  if (!images.length) return false;
  const preferSizes = ["extralarge", "large", "medium", "small"];
  return preferSizes.some((size) =>
    images.some((img) => img.size === size && img["#text"])
  );
}

function formatTime(secs) {
  if (!Number.isFinite(secs) || secs < 0) return "00:00";
  const m = Math.floor(secs / 60);
  const s = Math.floor(secs % 60);
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

function extractVideoId(input) {
  const trimmed = (input || "").trim();
  if (!trimmed) return "";

  if (/^[a-zA-Z0-9_-]{8,}$/.test(trimmed) && !trimmed.includes("http")) {
    return trimmed;
  }

  try {
    const u = new URL(trimmed);
    if (u.hostname.includes("youtu.be")) {
      return u.pathname.replace("/", "") || "";
    }
    const v = u.searchParams.get("v");
    if (v) return v;
    const parts = u.pathname.split("/");
    const last = parts.pop() || parts.pop();
    if (last && /^[a-zA-Z0-9_-]{8,}$/.test(last)) return last;
  } catch (e) {
    // ignore
  }

  return "";
}


// ===== 5. LocalStorage =====

function saveMyAlbumsToStorage() {
  try {
    localStorage.setItem(LOCAL_KEY_ALBUMS, JSON.stringify(myAlbums));
  } catch (e) {
    console.error("saveMyAlbumsToStorage error", e);
  }
}

function loadMyAlbumsFromStorage() {
  try {
    const json = localStorage.getItem(LOCAL_KEY_ALBUMS);
    if (!json) return;
    const arr = JSON.parse(json);
    if (Array.isArray(arr)) {
      // ✅ 정렬 추가
      myAlbums = arr.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
      renderMyAlbums();
    }
  } catch (e) {
    console.error('loadMyAlbumsFromStorage error', e);
  }
}


function loadCategoriesFromStorage() {
  try {
    const json = localStorage.getItem(LOCAL_KEY_CATEGORIES);
    if (!json) return;
    const arr = JSON.parse(json);
    if (Array.isArray(arr) && arr.length) {
      customCategories = arr;
    }
  } catch (e) {
    console.error("loadCategoriesFromStorage error", e);
  }
}

function saveCategoriesToStorage() {
  try {
    localStorage.setItem(
      LOCAL_KEY_CATEGORIES,
      JSON.stringify(customCategories)
    );
  } catch (e) {
    console.error("saveCategoriesToStorage error", e);
  }
}

loadCategoriesFromStorage();


// ===== 6. Firestore 유틸 =====

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
      name: album.name,
      artist: album.artist,
      image: album.image,
      hasCover: album.hasCover ?? true,
      category: album.category || 'etc',
      createdAt: album.createdAt || Date.now() // ✅ 기존 값 유지!
    }, { merge: true });
  });
  
  await Promise.all(ops);
}

async function loadMyAlbumsFromFirestore() {
  if (!currentUser) return;
  const uid    = currentUser.uid;
  const colRef = userAlbumsColRef(uid);

  const snap = await getDocs(colRef);
  const list = [];
  snap.forEach((docSnap) => {
    const d = docSnap.data();
    list.push({
      name: d.name,
      artist: d.artist,
      image: d.image,
      hasCover: d.hasCover,
      category: d.category || "etc",
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

  const snap = await getDocs(colRef);
  const deletions = [];
  snap.forEach((docSnap) => deletions.push(deleteDoc(docSnap.ref)));
  await Promise.all(deletions);

  const ops = tracks.map((t, index) => {
    const trackRef = doc(colRef, t.id);
    return setDoc(trackRef, {
      id: t.id,
      title: t.title,
      artist: t.artist,
      albumName: t.albumName,
      videoId: t.videoId || "",
      coverUrl: t.coverUrl || album.image || "",
      index,
    });
  });
  await Promise.all(ops);
}

async function loadTracksForAlbumFromFirestore(album) {
  if (!currentUser) return null;
  const uid    = currentUser.uid;
  const colRef = albumTracksColRef(uid, album);

  const snap = await getDocs(colRef);
  if (snap.empty) return null;

  const list = [];
  snap.forEach((docSnap) => {
    const d = docSnap.data();
    list.push({
      id: d.id,
      title: d.title,
      artist: d.artist,
      albumName: d.albumName,
      videoId: d.videoId || "",
      coverUrl: d.coverUrl || album.image || "",
      index: d.index ?? 0,
    });
  });

  list.sort((a, b) => (a.index ?? 0) - (b.index ?? 0));
  return list;
}


// ===== 7. Last.fm API =====

async function searchAlbums(query) {
  const url = new URL("https://ws.audioscrobbler.com/2.0/");
  url.searchParams.set("method", "album.search");
  url.searchParams.set("album", query);
  url.searchParams.set("api_key", LASTFM_API_KEY);
  url.searchParams.set("format", "json");
  url.searchParams.set("limit", "50");

  const res = await fetch(url.toString());
  if (!res.ok) throw new Error("Last.fm 요청 실패: " + res.status);
  const data = await res.json();
  return data.results?.albummatches?.album || [];
}

async function fetchAlbumTracks(artist, albumName) {
  const url = new URL("https://ws.audioscrobbler.com/2.0/");
  url.searchParams.set("method", "album.getinfo");
  url.searchParams.set("api_key", LASTFM_API_KEY);
  url.searchParams.set("artist", artist);
  url.searchParams.set("album", albumName);
  url.searchParams.set("format", "json");

  const res = await fetch(url.toString());
  if (!res.ok) throw new Error("album.getInfo 실패: " + res.status);
  const data = await res.json();
  return data.album?.tracks?.track || [];
}


// ===== 8. 검색 모달 =====

function openModal(query) {
  if (!searchModal) return;
  modalTitle.textContent     = `"${query}" 검색 결과`;
  searchModal.style.display  = "flex";
}

function closeModal() {
  if (!searchModal) return;
  searchModal.style.display = "none";
  if (modalGrid) modalGrid.innerHTML = "";
}

function renderSearchResults(albums) {
  if (!modalGrid) return;
  modalGrid.innerHTML = "";

  if (!albums.length) {
    const div = document.createElement("div");
    div.className   = "empty";
    div.textContent = "검색 결과가 없습니다.";
    modalGrid.appendChild(div);
    return;
  }

  albums.forEach((album) => {
    const card = document.createElement("div");
    card.className = "card";

    const title  = album.name || "제목 없음";
    const artist = album.artist || "아티스트 없음";
    const imgUrl = pickAlbumImage(album);

    card.innerHTML = `
      <img src="${imgUrl}" alt="${title}">
      <div class="card-title"><span>${title}</span></div>
      <div class="card-artist">${artist}</div>
    `;

    card.addEventListener('click', () => {
  const exists = myAlbums.some(a => a.name === title && a.artist === artist);
  
  if (!exists) {
    const newAlbum = {
      name: title,
      artist,
      image: imgUrl,
      hasCover: hasRealCover(album),
      category: 'etc',
      createdAt: Date.now() // ✅ 추가!
    };
    myAlbums.unshift(newAlbum);
    renderMyAlbums();
    saveMyAlbumsToStorage();
    
    if (currentUser) {
      syncMyAlbumsToFirestore();
    }
    closeModal();
    openCategoryModal(0);
    return;
      }

      const albumObj = myAlbums.find(
        (a) => a.name === title && a.artist === artist
      );
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
  if (modalGrid) {
    modalGrid.innerHTML = '<div class="empty">검색 중...</div>';
  }

  try {
    const albums = await searchAlbums(q);
    renderSearchResults(albums);
  } catch (err) {
    console.error(err);
    if (modalGrid) {
      modalGrid.innerHTML =
        '<div class="empty">검색 중 오류가 발생했습니다.</div>';
    }
  }
}


// ===== 9. 내 앨범 그리드 =====

async function deleteAlbumAtIndex(index) {
  const album = myAlbums[index];
  if (!album) return;

  myAlbums.splice(index, 1);
  renderMyAlbums();
  saveMyAlbumsToStorage();

  if (currentUser) {
    try {
      const uid     = currentUser.uid;
      const colRef  = userAlbumsColRef(uid);
      const albumId = `${album.artist} - ${album.name}`;
      const docRef  = doc(colRef, albumId);
      await deleteDoc(docRef);
    } catch (e) {
      console.error("delete album from Firestore error", e);
    }
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
      const uid     = currentUser.uid;
      const colRef  = userAlbumsColRef(uid);
      const albumId = `${album.artist} - ${album.name}`;
      const docRef  = doc(colRef, albumId);
      await setDoc(docRef, { category: newCategory }, { merge: true });
    } catch (e) {
      console.error("updateAlbumCategory Firestore error", e);
    }
  }
}

let categoryTargetIndex = null;

function openCategoryModal(index) {
  if (!categoryModal) return;
  categoryTargetIndex        = index;
  categoryModal.style.display = "flex";
  renderCategoryChips();
}

function closeCategoryModal() {
  if (!categoryModal) return;
  categoryModal.style.display = "none";
  categoryTargetIndex         = null;
}

function renderCategoryChips() {
  if (!categoryListEl) return;

  categoryListEl.innerHTML = "";
  const album = myAlbums[categoryTargetIndex];
  const currentCat = album ? album.category || "etc" : null;

  // select
  const select = document.createElement("select");
  select.className = "category-select";
  select.style.cssText =
    "width: 100%; padding: 10px; font-size: 16px; border-radius: 8px; border: 1px solid #ccc;";

  customCategories.forEach((cat) => {
    const option = document.createElement("option");
    option.value = cat;
    option.textContent = cat;
    if (cat === currentCat) option.selected = true;
    select.appendChild(option);
  });

  select.addEventListener("change", (e) => {
    const selectedCat = e.target.value;
    currentCategory   = selectedCat;

    if (categoryBar) {
      categoryBar.querySelectorAll(".category-btn").forEach((b) => {
        const c = b.dataset.category || "all";
        b.classList.toggle("active", c === selectedCat);
      });
    }

    updateAlbumCategory(categoryTargetIndex, selectedCat);
    closeCategoryModal();
  });

  categoryListEl.appendChild(select);

  // 버튼 칩
  const buttonContainer = document.createElement("div");
  buttonContainer.style.cssText =
    "display: flex; flex-wrap: wrap; gap: 10px; margin-top: 20px;";

  customCategories.forEach((cat) => {
    const btn = document.createElement("button");
    btn.textContent = cat;
    btn.style.cssText =
      "padding: 10px 20px; border-radius: 20px; border: 2px solid #ccc; background: white; cursor: pointer; font-size: 14px;";
    btn.dataset.category = cat;

    if (cat === currentCat) {
      btn.style.background  = "#007bff";
      btn.style.color       = "white";
      btn.style.borderColor = "#007bff";
    }

    btn.addEventListener("click", () => {
      updateAlbumCategory(categoryTargetIndex, cat);
      closeCategoryModal();
    });

    buttonContainer.appendChild(btn);
  });

  categoryListEl.appendChild(buttonContainer);
}

function renderMyAlbums() {
  if (!myGrid || !empty) return;
  myGrid.innerHTML = '';
  
  // ✅ createdAt 기준 정렬
  const sorted = [...myAlbums].sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
  
  const base = sorted.map((album) => {
    const originalIndex = myAlbums.indexOf(album);
    return { album, originalIndex };
  });
  
  const filtered = currentCategory === 'all' 
    ? base 
    : base.filter(({ album }) => (album.category || 'etc') === currentCategory);
  
  if (!filtered.length) {
    empty.style.display = 'block';
    return;
  }
  
  empty.style.display = 'none';
  
  filtered.forEach(({ album, originalIndex }) => {
    const card = document.createElement('div');
    card.className = 'card';
    
    card.innerHTML = `
      <div class="card-cover-wrap">
        <img src="${album.image}" alt="${album.name}" />
        <button class="album-option-btn" data-index="${originalIndex}">⋮</button>
      </div>
      <div class="card-title"><span>${album.name}</span></div>
      <div class="card-artist">${album.artist}</div>
    `;
    
    card.addEventListener('click', (e) => {
      if (e.target.closest('.album-option-btn')) return;
      
      if (!album.hasCover) {
        openCoverModal(album);
      } else {
        openTrackModal(album);
      }
    });
    
    const optionBtn = card.querySelector('.album-option-btn');
    if (optionBtn) {
      optionBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        const idx = Number(optionBtn.dataset.index);
        const target = myAlbums[idx];
        if (!target) return;
        openAlbumOptionModal(target, idx);
      });
    }
    
    myGrid.appendChild(card);
  });
}


// ===== 10. 커버 입력 모달 =====

let pendingCoverAlbum = null;

function openCoverModal(album) {
  if (!coverModal) return;
  pendingCoverAlbum         = album;
  coverModalTitle.textContent = `${album.artist} - ${album.name}`;
  coverInfo.textContent       =
    "이 앨범에는 공식 커버가 없어 보입니다. 사용할 커버 이미지 URL을 입력해 주세요.";
  coverUrlInput.value        = "";
  coverPreview.src           = album.image || "";
  coverModal.style.display   = "flex";
}

function closeCoverModal() {
  if (!coverModal) return;
  coverModal.style.display = "none";
  pendingCoverAlbum        = null;
}

if (coverUrlInput && coverPreview) {
  coverUrlInput.addEventListener("input", () => {
    const url = coverUrlInput.value.trim();
    if (url.startsWith("http://") || url.startsWith("https://")) {
      coverPreview.src = url;
    }
  });
}

if (coverSaveBtn) {
  coverSaveBtn.addEventListener("click", () => {
    if (!pendingCoverAlbum) return;

    const url = coverUrlInput.value.trim();
    if (!url.startsWith("http://") && !url.startsWith("https://")) {
      alert("올바른 이미지 URL을 입력해 주세요.");
      return;
    }

    pendingCoverAlbum.image   = url;
    pendingCoverAlbum.hasCover = true;

    renderMyAlbums();
    saveMyAlbumsToStorage();
    if (currentUser) syncMyAlbumsToFirestore();

    const album = pendingCoverAlbum;
    closeCoverModal();
    openTrackModal(album);
  });
}

if (coverModalClose) {
  coverModalClose.addEventListener("click", closeCoverModal);
}
if (coverBackdrop) {
  coverBackdrop.addEventListener("click", closeCoverModal);
}


// ===== 11. 트랙 모달 + YouTube Player =====

function getCurrentTrack() {
  return tracks.find((t) => t.id === currentTrackId) || null;
}

function getNextPlayableTrackInCurrentAlbum() {
  if (!currentTrackAlbum || !Array.isArray(tracks) || !tracks.length || !currentTrackId) {
    return null;
  }

  const currentIndex = tracks.findIndex((t) => t.id === currentTrackId);
  if (currentIndex === -1) return null;

  for (let i = currentIndex + 1; i < tracks.length; i += 1) {
    const t = tracks[i];
    if (t.videoId && t.videoId.trim()) {
      return t;
    }
  }

  return null;
}

function selectTrackOnly(id) {
  document
    .querySelectorAll("#trackModal #trackList li.selected-track")
    .forEach((item) => item.classList.remove("selected-track"));

  const li = trackList
    ? trackList.querySelector(`[data-track-id="${id}"]`)
    : null;
  if (li) li.classList.add("selected-track");

  currentTrackId = id;
}

function playTrack(id) {
  const track = tracks.find((t) => t.id === id);
  if (!track) return;

  // 1) 먼저 링크 있는지 확인
  if (!track.videoId || !track.videoId.trim()) {
    alert("먼저 이 트랙의 YouTube videoId 또는 링크를 입력해 주세요.");
    return; // 여기서 바로 종료 → 미니플레이어 / 선택 상태 건드리지 않음
  }

  // 2) 여기부터는 '재생 가능한 트랙'만 내려옴
  document
    .querySelectorAll("#trackModal #trackList li.selected-track")
    .forEach((item) => item.classList.remove("selected-track"));

  const li = trackList
    ? trackList.querySelector(`[data-track-id="${id}"]`)
    : null;
  if (li) li.classList.add("selected-track");

  currentTrackId = id;

  updateNowPlaying(track);
  if (miniPlayer) miniPlayer.style.display = "flex";

  playTrackOnYouTube(track);

  if (currentTrackAlbum) {
    playedTrackIdsInAlbum.add(id);
  }
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
      <button class="track-edit-btn">${trackData.videoId ? "✎✓" : "✎"}</button>
    </div>
  `;

  const line      = li.querySelector(".track-line");
  const editBtn   = li.querySelector(".track-edit-btn");
  const titleSpan = li.querySelector(".track-title-text");

  if (line) {
    line.addEventListener("click", (e) => {
      e.stopPropagation();
      playTrack(id);
    });
  }

  if (editBtn) {
    editBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      const t = tracks.find((t) => t.id === id);
      if (!t) return;

      const newTitle = prompt("트랙 제목을 입력해 주세요.", t.title || "");
      if (newTitle && newTitle.trim()) {
        t.title = newTitle.trim();
        if (titleSpan) titleSpan.textContent = t.title;

        const current = getCurrentTrack();
        if (current && current.id === id) {
          miniTitle.textContent = t.title;
        }
      }

      const rawUrl = prompt(
        "YouTube videoId 또는 링크를 입력해 주세요.",
        t.videoId || ""
      );
      if (rawUrl && rawUrl.trim()) {
        const videoId = extractVideoId(rawUrl);
        if (!videoId) {
          alert("올바른 YouTube videoId 또는 링크가 아닙니다.");
        } else {
          t.videoId = videoId;
        }
      }

      editBtn.textContent = t.videoId ? "✎✓" : "✎";

      if (currentUser && currentTrackAlbum) {
        saveTracksForAlbumToFirestore(currentTrackAlbum, tracks).catch(
          (err) =>
            console.error(
              "saveTracksForAlbumToFirestore (edit track) error",
              err
            )
        );
      }
    });
  }

  return li;
}

function openTrackModal(album) {
  if (!trackModal || !trackList) return;

  currentTrackAlbum           = album;
  trackModalTitle.textContent = `${album.artist} - ${album.name}`;
  trackList.innerHTML         = "<li>트랙 불러오는 중...</li>";
  trackModal.style.display    = "flex";

  (async () => {
    try {
      let loadedTracks = await loadTracksForAlbumFromFirestore(album);

      if (!loadedTracks || !loadedTracks.length) {
        const lfTracks = await fetchAlbumTracks(album.artist, album.name);
        if (!lfTracks || (Array.isArray(lfTracks) && lfTracks.length === 0)) {
          trackList.innerHTML =
            "<li>트랙 정보를 찾을 수 없습니다. add tracks 버튼으로 직접 추가해 주세요.</li>";
          tracks = [];
          return;
        }

        const arr = Array.isArray(lfTracks) ? lfTracks : [lfTracks];
        loadedTracks = arr.map((t) => {
          const title =
            typeof t.name === "string"
              ? t.name
              : t.name?.[0] || "제목 없음";

          return {
            id: crypto.randomUUID(),
            title,
            artist: album.artist,
            albumName: album.name,
            videoId: "",
            coverUrl: album.image,
          };
        });
      }

      tracks                = loadedTracks;
      playedTrackIdsInAlbum = new Set();

      trackList.innerHTML = "";
      tracks.forEach((t, idx) => {
        const li = createTrackListItem(album, t, idx);
        trackList.appendChild(li);
      });

      if (!currentTrackId || !tracks.some(t => t.id === currentTrackId)) {
  // 현재 트랙이 이 앨범 트랙 목록에 없을 때만 첫 곡으로 초기화
  if (tracks.length) {
    currentTrackId = tracks[0].id;
  }
}
    } catch (err) {
      console.error(err);
      trackList.innerHTML =
        "<li>트랙 정보를 불러오는 중 오류가 발생했습니다.</li>";
    }
  })();
}

async function autoPlayRandomTrackFromAlbum(album) {
  try {
    let loadedTracks = await loadTracksForAlbumFromFirestore(album);

    if (!loadedTracks || !loadedTracks.length) {
      const lfTracks = await fetchAlbumTracks(album.artist, album.name);
      if (!lfTracks || (Array.isArray(lfTracks) && lfTracks.length === 0)) {
        return;
      }

      const arr = Array.isArray(lfTracks) ? lfTracks : [lfTracks];
      loadedTracks = arr.map((t) => {
        const title =
          typeof t.name === "string" ? t.name : t.name?.[0] || "제목 없음";

        return {
          id: crypto.randomUUID(),
          title,
          artist: album.artist,
          albumName: album.name,
          videoId: "",
          coverUrl: album.image,
        };
      });
    }

    const playable = loadedTracks.filter((t) => t.videoId);
    if (!playable.length) return;

    currentTrackAlbum        = album;
    tracks                   = loadedTracks;
    playedTrackIdsInAlbum    = new Set();
    const next               = playable[Math.floor(Math.random() * playable.length)];
    playTrack(next.id);
  } catch (err) {
    console.error("autoPlayRandomTrackFromAlbum error", err);
  }
}

function closeTrackModal() {
  if (!trackModal || !trackList) return;
  trackModal.style.display = "none";
  trackList.innerHTML = "";
  // currentTrackAlbum과 tracks는 유지 (재생 계속되도록)
}




// ===== 12. YouTube IFrame API =====

(function injectYouTubeAPI() {
  if (document.getElementById("yt-iframe-api")) return;
  const tag = document.createElement("script");
  tag.id    = "yt-iframe-api";
  tag.src   = "https://www.youtube.com/iframe_api";
  document.head.appendChild(tag);
})();

window.onYouTubeIframeAPIReady = function () {
  ytPlayer = new YT.Player("ytPlayer", {
    height: "0",
    width: "0",
    videoId: "",
    playerVars: {
      autoplay: 0,
      controls: 0,
      modestbranding: 1,
      rel: 0,
      playsinline: 1,
      disablekb: 1, // ✅ 키보드 이벤트 비활성화
      fs: 0, // ✅ 전체화면 버튼 숨김
    },
    events: {
      onReady: onPlayerReady,
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
  miniToggle.textContent = isPlaying ? "II" : "▶";
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
  // 1) 같은 앨범의 다음 트랙(순서대로, videoId 있는 것만)으로 이동
  const nextTrack = getNextPlayableTrackInCurrentAlbum();
  if (nextTrack) {
    playTrack(nextTrack.id);
    return;
  }

  // 2) 현재 앨범의 마지막 곡이라면 → 다른 앨범에서 랜덤으로 재생
  const excludeKey = currentTrackAlbum ? getAlbumKey(currentTrackAlbum) : null;
  playRandomTrackFromAllAlbums(excludeKey);
}


// ===== 13. 랜덤 재생 (전체 앨범) =====

async function playRandomTrackFromAllAlbums(excludeAlbumKey = null) {
  if (!currentUser) return;

  const candidates = Array.isArray(myAlbums)
    ? myAlbums.filter((a) => getAlbumKey(a) !== excludeAlbumKey)
    : [];

  if (!candidates.length) return;

  const shuffled = [...candidates].sort(() => Math.random() - 0.5);

  for (const album of shuffled) {
    const loadedTracks = await loadTracksForAlbumFromFirestore(album);
    if (!Array.isArray(loadedTracks) || !loadedTracks.length) continue;

    const firstPlayableInOrder = loadedTracks.find(
      (t) => t.videoId && t.videoId.trim()
    );
    if (!firstPlayableInOrder) continue;

    currentTrackAlbum = album;
    tracks = loadedTracks;
    currentTrackId = firstPlayableInOrder.id;
    playedTrackIdsInAlbum = new Set([firstPlayableInOrder.id]);

    playTrack(firstPlayableInOrder.id);
    return;
  }
}

// ===== 14. 미니 플레이어 진행도 =====

function startYtProgressLoop() {
  if (ytUpdateTimer) return;
  ytUpdateTimer = setInterval(updateMiniPlayerProgress, 500);
}

function stopYtProgressLoop() {
  if (ytUpdateTimer) {
    clearInterval(ytUpdateTimer);
    ytUpdateTimer = null;
  }
}

function updateMiniPlayerProgress() {
  if (!ytPlayer || typeof ytPlayer.getDuration !== "function") {
    if (miniCurrentTime) miniCurrentTime.textContent = "00:00";
    if (miniDuration)    miniDuration.textContent    = "00:00";
    if (miniSeek)        miniSeek.value              = 0;
    return;
  }

  const duration = ytPlayer.getDuration() || 0;
  const current  = ytPlayer.getCurrentTime() || 0;

  if (!duration) {
    if (miniCurrentTime) miniCurrentTime.textContent = "00:00";
    if (miniDuration)    miniDuration.textContent    = "00:00";
    if (miniSeek)        miniSeek.value              = 0;
    return;
  }

  if (miniCurrentTime) miniCurrentTime.textContent = formatTime(current);
  if (miniDuration)    miniDuration.textContent    = formatTime(duration);
  if (miniSeek)        miniSeek.value              = (current / duration) * 100;
}

function updateNowPlaying(track) {
  if (!track) return;

  const coverUrl = track.coverUrl || "";

  if (miniTitle)  miniTitle.textContent  = track.title;
  if (miniArtist) miniArtist.textContent = track.artist || track.albumName || "";

  if (miniCover) {
    if (coverUrl) miniCover.src = coverUrl;
    else miniCover.removeAttribute("src");
  }

  if (miniSeek)        miniSeek.value              = 0;
  if (miniCurrentTime) miniCurrentTime.textContent = "00:00";
  if (miniDuration)    miniDuration.textContent    = "00:00";
  if (miniPlayer)      miniPlayer.style.display    = "flex";
}

function playTrackOnYouTube(track) {
  if (!track.videoId) {
    alert("먼저 이 트랙의 YouTube videoId 또는 링크를 입력해 주세요.");
    return;
  }
  if (!ytPlayer || typeof ytPlayer.loadVideoById !== "function") {
    alert("YouTube 플레이어가 아직 준비되지 않았습니다. 잠시 후 다시 시도해 주세요.");
    return;
  }

  ytPlayer.loadVideoById(track.videoId);
  ytPlayer.playVideo();
}


// ===== 15. 미니 플레이어 / 타임라인 이벤트 =====

// 재생 / 일시정지
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

// ✅ 다음곡 버튼: 기존 miniHide 로직 이동
if (miniNext) {
  miniNext.addEventListener("click", () => {
    const nextTrack = getNextPlayableTrackInCurrentAlbum();

    if (nextTrack) {
      playTrack(nextTrack.id); // 같은 앨범 다음 트랙
    } else {
      const excludeKey = currentTrackAlbum ? getAlbumKey(currentTrackAlbum) : null;
      playRandomTrackFromAllAlbums(excludeKey); // 다른 앨범 랜덤
    }
  });
}

// ✅ 이전곡 버튼: 현재 인덱스 기준으로 이전으로 이동
if (miniPrev) {
  miniPrev.addEventListener("click", () => {
    if (!currentTrackId || !Array.isArray(tracks) || !tracks.length) return;

    const idx = tracks.findIndex(t => t.id === currentTrackId);
    if (idx <= 0) return; // 첫 곡이면 아무 것도 안 함 (원하면 루프 처리도 가능)

    for (let i = idx - 1; i >= 0; i -= 1) {
      const t = tracks[i];
      if (t.videoId && t.videoId.trim()) {
        playTrack(t.id);
        break;
      }
    }
  });
}

if (miniHide) {
  miniHide.textContent = "✕";
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
    if (miniCurrentTime) {
      miniCurrentTime.textContent = formatTime(previewTime);
    }
  });

  miniSeek.addEventListener("change", () => {
    if (!ytPlayer) return;
    const duration = ytPlayer.getDuration() || 0;
    if (!duration) return;
    const pct    = Number(miniSeek.value) / 100;
    const newTime = duration * pct;
    ytPlayer.seekTo(newTime, true);
  });
}


// ===== 16. 카테고리 / 공통 버튼 =====

if (categoryBar) {
  categoryBar.addEventListener("click", (e) => {
    const btn = e.target.closest(".category-btn");
    if (!btn) return;

    const cat = btn.dataset.category || "all";
    currentCategory = cat;

    categoryBar.querySelectorAll(".category-btn").forEach((b) => {
      b.classList.toggle("active", b === btn);
    });

    renderMyAlbums();
  });
}

if (trackAddBtn) {
  trackAddBtn.addEventListener("click", () => {
    if (!currentTrackAlbum) return;

    const title = prompt("트랙 제목을 입력해 주세요.");
    if (!title || !title.trim()) return;

    const artist = prompt(
      "아티스트를 입력해 주세요.",
      currentTrackAlbum.artist || ""
    );
    if (!artist || !artist.trim()) return;

    const rawUrl = prompt("YouTube videoId 또는 링크를 입력해 주세요.");
    if (!rawUrl || !rawUrl.trim()) return;

    const videoId = extractVideoId(rawUrl);
    if (!videoId) {
      alert("올바른 YouTube videoId 또는 링크가 아닙니다.");
      return;
    }

    const newTrack = {
      id: crypto.randomUUID(),
      title: title.trim(),
      artist: artist.trim(),
      albumName: currentTrackAlbum.name,
      videoId,
      coverUrl: currentTrackAlbum.image,
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
      saveTracksForAlbumToFirestore(currentTrackAlbum, tracks).catch((err) =>
        console.error("saveTracksForAlbumToFirestore (add track) error", err)
      );
    }
  });
}


// ===== 17. 앨범 옵션 모달 =====

let albumOptionTargetIndex = null;
let albumOptionTargetAlbum = null;

function openAlbumOptionModal(album, index) {
  if (!albumOptionModal || !albumOptionTitle) return;
  albumOptionTargetAlbum = album;
  albumOptionTargetIndex = index;

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

if (albumOptionModal) {
  albumOptionModal.addEventListener("click", (e) => {
    if (e.target === albumOptionModal) {
      closeAlbumOptionModal();
    }
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
    if (albumOptionTargetIndex == null || !albumOptionTargetAlbum) return;

    const album = albumOptionTargetAlbum;
    const ok = confirm(
      `"${album.artist} - ${album.name}" 앨범을 삭제하시겠습니까?`
    );
    if (!ok) return;

    const idx = albumOptionTargetIndex;
    closeAlbumOptionModal();
    deleteAlbumAtIndex(idx);
  });
}

if (albumOptionCategoryBtn) {
  albumOptionCategoryBtn.addEventListener("click", () => {
    if (albumOptionTargetIndex == null || !albumOptionTargetAlbum) return;
    closeAlbumOptionModal();
    openCategoryModal(albumOptionTargetIndex);
  });
}

if (albumOptionBackdrop) {
  albumOptionBackdrop.addEventListener("click", (e) => {
    if (e.target === albumOptionBackdrop) {
      closeAlbumOptionModal();
    }
  });
}


// ===== 18. 검색 / 모달 공통 이벤트 =====

if (searchBtn) {
  searchBtn.addEventListener("click", handleSearch);
}
if (searchInput) {
  searchInput.addEventListener("keydown", (e) => {
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
  trackBackdrop.addEventListener("click", (e) => {
    if (e.target === trackBackdrop) {
      closeTrackModal();
    }
  });
}

if (categoryModalClose) {
  categoryModalClose.addEventListener("click", closeCategoryModal);
}
if (categoryBackdrop) {
  categoryBackdrop.addEventListener("click", (e) => {
    if (e.target === categoryBackdrop) closeCategoryModal();
  });
}

if (categoryAddBtn) {
  categoryAddBtn.addEventListener("click", () => {
    const name = (categoryNewInput.value || "").trim().toLowerCase();
    if (!name) return;
    if (customCategories.includes(name)) {
      alert("이미 존재하는 카테고리입니다.");
      return;
    }
    customCategories.push(name);
    saveCategoriesToStorage();
    categoryNewInput.value = "";
    renderCategoryChips();
  });
}

// ===== 21. Firebase Auth =====

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
      alert("로그인/로그아웃 중 오류: " + (e.code || e.message));
    }
  });
}

onAuthStateChanged(auth, async (user) => {
  currentUser = user || null;

  if (user) {
    if (authStatus) {
      authStatus.textContent = user.displayName || "사용자";
    }
    if (authToggleBtn) {
      authToggleBtn.textContent = "Logout";
    }

    try {
      await loadMyAlbumsFromFirestore();
    } catch (e) {
      console.error("loadMyAlbumsFromFirestore error", e);
    }
  } else {
    if (authStatus) authStatus.textContent = "";
    if (authToggleBtn) authToggleBtn.textContent = "Login";

    myAlbums = [];
    renderMyAlbums();
  }
});


// ===== 22. 초기 로드 =====

loadMyAlbumsFromStorage();

// ===== 모바일 검색 모달 =====
const mobileSearchBtn = document.querySelector('.mobile-search-btn');
const mobileSearchModal = document.getElementById('mobileSearchModal');
const mobileSearchInput = document.getElementById('mobileSearchInput');
const mobileSearchClose = document.getElementById('mobileSearchClose');

if (mobileSearchBtn) {
  mobileSearchBtn.addEventListener('click', () => {
    mobileSearchModal.style.display = 'block';
    mobileSearchInput.focus();
  });
}

if (mobileSearchClose) {
  mobileSearchClose.addEventListener('click', () => {
    mobileSearchModal.style.display = 'none';
    mobileSearchInput.value = '';
  });
}

if (mobileSearchInput) {
  mobileSearchInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') {
      const query = mobileSearchInput.value.trim();
      if (query) {
        document.getElementById('searchInput').value = query;
        document.getElementById('searchBtn').click();
        mobileSearchModal.style.display = 'none';
        mobileSearchInput.value = '';
      }
    }
  });
}

