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
let currentCategory    = "all";
let customCategories   = ["kpop", "pop", "ost", "etc"];

const LOCAL_KEY_ALBUMS    = "jootubemusic.myAlbums";
const LOCAL_KEY_CATEGORIES = "jootubemusic.categories";

let ytPlayer      = null;
let ytUpdateTimer = null;

// ===== 4. 데이터 연동 (Firestore & Storage) =====
function getAlbumKey(album) { return `${album.artist} - ${album.name}`; }

async function syncMyAlbumsToFirestore() {
  if (!currentUser) return;
  const colRef = collection(db, "users", currentUser.uid, "albums");
  for (const album of myAlbums) {
    await setDoc(doc(colRef, getAlbumKey(album)), album, { merge: true });
  }
}

async function loadTracksForAlbumFromFirestore(album) {
  if (!currentUser) return null;
  const colRef = collection(db, "users", currentUser.uid, "albums", getAlbumKey(album), "tracks");
  const snap = await getDocs(colRef);
  if (snap.empty) return null;
  return snap.docs.map(d => d.data()).sort((a, b) => a.index - b.index);
}

async function saveTracksForAlbumToFirestore(album, trackListItems) {
  if (!currentUser) return;
  const colRef = collection(db, "users", currentUser.uid, "albums", getAlbumKey(album), "tracks");
  const snap = await getDocs(colRef);
  await Promise.all(snap.docs.map(d => deleteDoc(d.ref)));
  await Promise.all(trackListItems.map((t, idx) => setDoc(doc(colRef, t.id), { ...t, index: idx })));
}

function saveMyAlbumsToStorage() { localStorage.setItem(LOCAL_KEY_ALBUMS, JSON.stringify(myAlbums)); }// ===== 5. UI 및 모달 제어 =====
function renderMyAlbums() {
  myGrid.innerHTML = "";
  const filtered = currentCategory === "all" ? myAlbums : myAlbums.filter(a => (a.category || "etc") === currentCategory);
  
  if (filtered.length === 0) { empty.style.display = "block"; return; }
  empty.style.display = "none";

  filtered.forEach((album) => {
    const card = document.createElement("div");
    card.className = "card";
    const originalIndex = myAlbums.indexOf(album);
    card.innerHTML = `
      <div class="card-cover-wrap"><img src="${album.image}"><button class="album-option-btn">⋮</button></div>
      <div class="card-title"><span>${album.name}</span></div><div class="card-artist">${album.artist}</div>
    `;
    card.querySelector(".album-option-btn").onclick = (e) => { e.stopPropagation(); openAlbumOptionModal(album, originalIndex); };
    card.onclick = () => { album.hasCover ? openTrackModal(album) : openCoverModal(album); };
    myGrid.appendChild(card);
  });
}

async function openTrackModal(album) {
  currentTrackAlbum = album;
  trackModalTitle.textContent = getAlbumKey(album);
  trackList.innerHTML = "<li>로딩 중...</li>";
  trackModal.style.display = "flex";

  let loaded = await loadTracksForAlbumFromFirestore(album);
  if (!loaded) {
    const res = await fetch(`https://ws.audioscrobbler.com/2.0/?method=album.getinfo&api_key=${LASTFM_API_KEY}&artist=${encodeURIComponent(album.artist)}&album=${encodeURIComponent(album.name)}&format=json`);
    const data = await res.json();
    const raw = data.album?.tracks?.track || [];
    loaded = (Array.isArray(raw) ? raw : [raw]).map(t => ({
      id: crypto.randomUUID(), title: t.name, artist: album.artist, videoId: "", coverUrl: album.image
    }));
  }
  tracks = loaded;
  renderTrackList();
}

function renderTrackList() {
  trackList.innerHTML = "";
  tracks.forEach((t, idx) => {
    const li = document.createElement("li");
    li.className = `track-item ${currentTrackId === t.id ? 'selected-track' : ''}`;
    li.innerHTML = `<span>${idx+1}. ${t.title}</span> <button class="edit-btn">${t.videoId ? '✓' : '✎'}</button>`;
    li.onclick = (e) => { if(!e.target.classList.contains('edit-btn')) playTrack(t.id); };
    li.querySelector(".edit-btn").onclick = (e) => {
      e.stopPropagation();
      const input = prompt("YouTube 링크 또는 ID", t.videoId);
      if (input !== null) {
        t.videoId = extractVideoId(input);
        saveTracksForAlbumToFirestore(currentTrackAlbum, tracks);
        renderTrackList();
      }
    };
    trackList.appendChild(li);
  });
}

// ===== 6. 재생 엔진 및 YouTube API =====
function playTrack(id) {
  const track = tracks.find(t => t.id === id);
  if (!track || !track.videoId) return alert("YouTube ID를 먼저 설정해주세요.");
  currentTrackId = id;
  miniTitle.textContent = track.title;
  miniArtist.textContent = track.artist;
  miniCover.src = track.coverUrl;
  miniPlayer.style.display = "flex";
  ytPlayer.loadVideoById(track.videoId);
  renderTrackList();
}

window.onYouTubeIframeAPIReady = () => {
  ytPlayer = new YT.Player('ytPlayer', {
    height: '0', width: '0',
    events: {
      'onStateChange': (e) => {
        if (e.data === YT.PlayerState.PLAYING) { isPlaying = true; startTimer(); }
        else if (e.data === YT.PlayerState.ENDED) { handleTrackEnded(); }
        else { isPlaying = false; }
        miniToggle.textContent = isPlaying ? "⏸" : "▶";
      }
    }
  });
};

function startTimer() {
  if (ytUpdateTimer) clearInterval(ytUpdateTimer);
  ytUpdateTimer = setInterval(() => {
    const curr = ytPlayer.getCurrentTime();
    const dur = ytPlayer.getDuration();
    miniCurrentTime.textContent = formatTime(curr);
    miniDuration.textContent = formatTime(dur);
    miniSeek.value = (curr / dur) * 100 || 0;
  }, 1000);
}

miniSeek.oninput = () => { ytPlayer.seekTo((miniSeek.value / 100) * ytPlayer.getDuration()); };

// ===== 7. 초기화 및 이벤트 =====
function extractVideoId(i) { return i.includes("v=") ? i.split("v=")[1].split("&")[0] : i.split("/").pop(); }
function formatTime(s) { return `${Math.floor(s/60)}:${String(Math.floor(s%60)).padStart(2,'0')}`; }

onAuthStateChanged(auth, async (u) => {
  currentUser = u;
  if (u) {
    const snap = await getDocs(collection(db, "users", u.uid, "albums"));
    myAlbums = snap.docs.map(d => d.data());
  } else {
    myAlbums = JSON.parse(localStorage.getItem(LOCAL_KEY_ALBUMS) || "[]");
  }
  renderMyAlbums();
});

const tag = document.createElement('script'); tag.src = "https://www.youtube.com/iframe_api";
document.head.appendChild(tag);

// 모달 닫기
[modalClose, trackModalClose, coverModalClose, albumOptionClose, categoryModalClose].forEach(b => {
  if(b) b.onclick = () => { document.querySelectorAll('.modal').forEach(m => m.style.display='none'); };
});

searchBtn.onclick = async () => {
  const q = searchInput.value;
  modalGrid.innerHTML = "검색 중...";
  searchModal.style.display = "flex";
  const res = await fetch(`https://ws.audioscrobbler.com/2.0/?method=album.search&album=${q}&api_key=${LASTFM_API_KEY}&format=json`);
  const data = await res.json();
  modalGrid.innerHTML = "";
  data.results.albummatches.album.forEach(a => {
    const div = document.createElement("div"); div.className="card"; div.innerHTML=`<img src="${a.image[2]['#text']}"><p>${a.name}</p>`;
    div.onclick = () => {
      myAlbums.unshift({name:a.name, artist:a.artist, image:a.image[3]['#text'], hasCover:true, createdAt:Date.now()});
      saveMyAlbumsToStorage(); renderMyAlbums(); searchModal.style.display="none";
    };
    modalGrid.appendChild(div);
  });
};
