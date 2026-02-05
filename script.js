// ===== 1. 외부 서비스 설정 (Firebase, Last.fm) =====
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

const app      = initializeApp(firebaseConfig);
const auth     = getAuth(app);
const db       = getFirestore(app);
const provider = new GoogleAuthProvider();
const LASTFM_API_KEY = "7e0b8eb10fdc5cf81968b38fdd543cff";

// ===== 2. DOM 요소 캐싱 =====
const playerContainer = document.getElementById("player-container");
const searchInput = document.getElementById("searchInput");
const searchBtn   = document.getElementById("searchBtn");
const authStatus    = document.getElementById("authStatus");
const authToggleBtn = document.getElementById("authToggleBtn");
const myGrid = document.getElementById("myGrid");
const empty  = document.getElementById("empty");
const categoryBar   = document.getElementById("categoryBar");

const searchModal   = document.getElementById("searchModal");
const modalGrid     = document.getElementById("modalGrid");
const modalClose    = document.getElementById("modalClose");
const modalTitle    = document.getElementById("modalTitle");

const trackModal      = document.getElementById("trackModal");
const trackList       = document.getElementById("trackList");
const trackModalTitle = document.getElementById("trackModalTitle");
const trackModalClose = document.getElementById("trackModalClose");

const albumOptionModal       = document.getElementById("albumOptionModal");
const albumOptionTitle       = document.getElementById("albumOptionTitle");
const albumOptionClose       = document.getElementById("albumOptionClose");
const albumOptionCoverBtn    = document.getElementById("albumOptionCoverBtn");
const albumOptionDeleteBtn   = document.getElementById("albumOptionDeleteBtn");
const albumOptionCategoryBtn = document.getElementById("albumOptionCategoryBtn");

const categoryModal      = document.getElementById("categoryModal");
const categoryListEl     = document.getElementById("categoryList");
const categoryModalClose = document.getElementById("categoryModalClose");

const miniPlayer = document.getElementById("miniPlayer");
const miniCover  = document.getElementById("miniCover");
const miniTitle  = document.getElementById("miniTitle");
const miniArtist = document.getElementById("miniArtist");
const miniToggle = document.getElementById("miniToggle");
const miniSeek   = document.getElementById("miniSeek");
const miniCurrentTime = document.getElementById("miniCurrentTime");
const miniDuration    = document.getElementById("miniDuration");

const coverModal      = document.getElementById("coverModal");
const coverUrlInput   = document.getElementById("coverUrlInput");
const coverPreview    = document.getElementById("coverPreview");
const coverSaveBtn    = document.getElementById("coverSaveBtn");
const coverModalClose = document.getElementById("coverModalClose");

// ===== 3. 상태 (State) =====
let isPlaying    = false;
let myAlbums     = [];
let currentUser  = null;
let tracks       = [];  
let currentTrackId     = null;
let currentTrackAlbum  = null;
let playedAlbumKeys    = new Set();
let currentCategory    = "all";

let customCategories      = ["kpop", "pop", "ost", "etc"];
const LOCAL_KEY_ALBUMS    = "jootubemusic.myAlbums";
const LOCAL_KEY_CATEGORIES = "jootubemusic.categories";

let ytPlayer      = null;
let ytUpdateTimer = null;

// ===== 4. 유틸리티 & 데이터 관리 =====
function getAlbumKey(album) { return `${album.artist} - ${album.name}`; }

function pickAlbumImage(album) {
  const images = Array.isArray(album.image) ? album.image : [];
  let imgUrl = "";
  const preferSizes = ["extralarge", "large", "medium", "small"];
  for (const size of preferSizes) {
    const found = images.find(img => img.size === size && img["#text"]);
    if (found) { imgUrl = found["#text"]; break; }
  }
  return (imgUrl || "https://via.placeholder.com/300").replace("http://", "https://");
}

function formatTime(secs) {
  if (!Number.isFinite(secs) || secs < 0) return "00:00";
  const m = Math.floor(secs / 60);
  const s = Math.floor(secs % 60);
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

function extractVideoId(input) {
  const trimmed = (input || "").trim();
  if (/^[a-zA-Z0-9_-]{11}$/.test(trimmed)) return trimmed;
  try {
    const u = new URL(trimmed);
    if (u.hostname.includes("youtu.be")) return u.pathname.slice(1);
    return u.searchParams.get("v") || u.pathname.split("/").pop();
  } catch (e) { return ""; }
}

// Storage 함수들
const saveMyAlbumsToStorage = () => localStorage.setItem(LOCAL_KEY_ALBUMS, JSON.stringify(myAlbums));
const loadCategories = () => {
  const json = localStorage.getItem(LOCAL_KEY_CATEGORIES);
  if (json) customCategories = JSON.parse(json);
};// ===== 5. UI 렌더링 (그리드 & 카테고리) =====
function renderMyAlbums() {
  myGrid.innerHTML = "";
  const filtered = currentCategory === "all" ? myAlbums : myAlbums.filter(a => (a.category || "etc") === currentCategory);
  
  if (filtered.length === 0) {
    empty.style.display = "block";
    return;
  }
  empty.style.display = "none";

  filtered.forEach((album) => {
    const card = document.createElement("div");
    card.className = "card";
    const originalIndex = myAlbums.indexOf(album);
    
    card.innerHTML = `
      <div class="card-cover-wrap">
        <img src="${album.image}" alt="${album.name}">
        <button class="album-option-btn" data-index="${originalIndex}">⋮</button>
      </div>
      <div class="card-title"><span>${album.name}</span></div>
      <div class="card-artist">${album.artist}</div>
    `;

    card.querySelector(".album-option-btn").onclick = (e) => {
      e.stopPropagation();
      openAlbumOptionModal(album, originalIndex);
    };

    card.onclick = () => {
      album.hasCover ? openTrackModal(album) : openCoverModal(album);
    };
    myGrid.appendChild(card);
  });
}

// 앨범 옵션 모달
function openAlbumOptionModal(album, index) {
  albumOptionTitle.textContent = album.name;
  albumOptionModal.style.display = "flex";

  albumOptionDeleteBtn.onclick = async () => {
    if (confirm("정말 이 앨범을 삭제하시겠습니까?")) {
      myAlbums.splice(index, 1);
      if (currentUser) await deleteDoc(doc(db, "users", currentUser.uid, "albums", getAlbumKey(album)));
      saveMyAlbumsToStorage();
      renderMyAlbums();
      albumOptionModal.style.display = "none";
    }
  };

  albumOptionCategoryBtn.onclick = () => {
    albumOptionModal.style.display = "none";
    openCategoryModal(index);
  };
  
  albumOptionCoverBtn.onclick = () => {
    albumOptionModal.style.display = "none";
    openCoverModal(album);
  };
}

// 카테고리 설정 모달
function openCategoryModal(index) {
  const album = myAlbums[index];
  categoryListEl.innerHTML = "";
  customCategories.forEach(cat => {
    const btn = document.createElement("button");
    btn.className = `category-chip ${album.category === cat ? 'active' : ''}`;
    btn.textContent = cat;
    btn.onclick = async () => {
      album.category = cat;
      if (currentUser) await setDoc(doc(db, "users", currentUser.uid, "albums", getAlbumKey(album)), { category: cat }, { merge: true });
      saveMyAlbumsToStorage();
      renderMyAlbums();
      categoryModal.style.display = "none";
    };
    categoryListEl.appendChild(btn);
  });
  categoryModal.style.display = "flex";
}

// Last.fm 검색 및 결과
async function handleSearch() {
  const q = searchInput.value.trim();
  if (!q) return;
  modalTitle.textContent = `"${q}" 검색 결과`;
  modalGrid.innerHTML = "<div class='loading'>검색 중...</div>";
  searchModal.style.display = "flex";

  try {
    const url = `https://ws.audioscrobbler.com/2.0/?method=album.search&album=${encodeURIComponent(q)}&api_key=${LASTFM_API_KEY}&format=json&limit=30`;
    const res = await fetch(url);
    const data = await res.json();
    const results = data.results?.albummatches?.album || [];
    
    modalGrid.innerHTML = "";
    results.forEach(album => {
      const img = pickAlbumImage(album);
      const div = document.createElement("div");
      div.className = "card";
      div.innerHTML = `<img src="${img}"><div class="card-title"><span>${album.name}</span></div><div class="card-artist">${album.artist}</div>`;
      div.onclick = () => {
        const hasCover = img.includes("last.fm") || !img.includes("placeholder");
        myAlbums.unshift({
          name: album.name, artist: album.artist, image: img,
          hasCover: hasCover, category: "etc", createdAt: Date.now()
        });
        saveMyAlbumsToStorage();
        if (currentUser) syncMyAlbumsToFirestore();
        renderMyAlbums();
        searchModal.style.display = "none";
      };
      modalGrid.appendChild(div);
    });
  } catch (e) { modalGrid.innerHTML = "오류 발생"; }
}// ===== 6. 재생 엔진 (YouTube Player) =====
function playTrack(id) {
  const track = tracks.find(t => t.id === id);
  if (!track || !track.videoId) return alert("YouTube ID를 먼저 설정해주세요.");

  currentTrackId = id;
  miniTitle.textContent = track.title;
  miniArtist.textContent = track.artist;
  miniCover.src = track.coverUrl;
  miniPlayer.style.display = "flex";

  if (ytPlayer && ytPlayer.loadVideoById) {
    ytPlayer.loadVideoById(track.videoId);
    isPlaying = true;
    updateMiniToggleUI();
  }
}

function handleTrackEnded() {
  const idx = tracks.findIndex(t => t.id === currentTrackId);
  if (idx >= 0 && idx < tracks.length - 1) {
    playTrack(tracks[idx + 1].id);
  }
}

// YouTube API 초기화
window.onYouTubeIframeAPIReady = () => {
  ytPlayer = new YT.Player('ytPlayer', {
    height: '0', width: '0',
    playerVars: { 'autoplay': 0, 'controls': 0, 'playsinline': 1 },
    events: {
      'onStateChange': (e) => {
        if (e.data === YT.PlayerState.PLAYING) {
          isPlaying = true;
          startProgressLoop();
        } else if (e.data === YT.PlayerState.ENDED) {
          handleTrackEnded();
        } else { isPlaying = false; }
        updateMiniToggleUI();
      }
    }
  });
};

function startProgressLoop() {
  if (ytUpdateTimer) clearInterval(ytUpdateTimer);
  ytUpdateTimer = setInterval(() => {
    if (ytPlayer && ytPlayer.getCurrentTime) {
      const curr = ytPlayer.getCurrentTime();
      const dur = ytPlayer.getDuration();
      miniCurrentTime.textContent = formatTime(curr);
      miniDuration.textContent = formatTime(dur);
      miniSeek.value = (curr / dur) * 100 || 0;
    }
  }, 1000);
}

function updateMiniToggleUI() { miniToggle.textContent = isPlaying ? "⏸" : "▶"; }

miniToggle.onclick = () => {
  if (isPlaying) ytPlayer.pauseVideo();
  else ytPlayer.playVideo();
};

// ===== 7. Firebase Auth & 초기화 실행 =====
onAuthStateChanged(auth, async (user) => {
  currentUser = user;
  authStatus.textContent = user ? user.displayName : "로그인하지 않음";
  authToggleBtn.textContent = user ? "Logout" : "Login";
  if (user) {
    const snap = await getDocs(collection(db, "users", user.uid, "albums"));
    myAlbums = snap.docs.map(d => d.data()).sort((a,b) => b.createdAt - a.createdAt);
  } else {
    const json = localStorage.getItem(LOCAL_KEY_ALBUMS);
    if (json) myAlbums = JSON.parse(json);
  }
  renderMyAlbums();
});

authToggleBtn.onclick = async () => {
  currentUser ? await signOut(auth) : await signInWithPopup(auth, provider);
};

searchBtn.onclick = handleSearch;
searchInput.onkeypress = (e) => { if(e.key === 'Enter') handleSearch(); };

// 모달 닫기 이벤트들
[modalClose, trackModalClose, coverModalClose, albumOptionClose, categoryModalClose].forEach(btn => {
  if(btn) btn.onclick = () => {
    searchModal.style.display = "none";
    trackModal.style.display = "none";
    coverModal.style.display = "none";
    albumOptionModal.style.display = "none";
    categoryModal.style.display = "none";
  };
});

// 외부 스크립트 로드 (YouTube API)
const tag = document.createElement('script');
tag.src = "https://www.youtube.com/iframe_api";
document.head.appendChild(tag);

loadCategories();
