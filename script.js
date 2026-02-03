// ===== 1. 외부 서비스 설정 (Firebase, Last.fm) =====

// Firebase SDK imports (v9+ modular)
import { initializeApp } from "https://www.gstatic.com/firebasejs/12.8.0/firebase-app.js";
import { getAuth, GoogleAuthProvider, signInWithPopup, signOut, onAuthStateChanged }
  from "https://www.gstatic.com/firebasejs/12.8.0/firebase-auth.js";
import {
  getFirestore,
  collection,
  doc,
  getDocs,
  setDoc,
  deleteDoc
} from "https://www.gstatic.com/firebasejs/12.8.0/firebase-firestore.js";

// Firebase config
const firebaseConfig = {
  apiKey: "AIzaSyCfS2MkP2m6I669bIJ9UUrkaG5GvO7E_x4",
  authDomain: "jootubemusic-b7157.firebaseapp.com",
  projectId: "jootubemusic-b7157",
  storageBucket: "jootubemusic-b7157.firebasestorage.app",
  messagingSenderId: "1090987417503",
  appId: "1:1090987417503:web:ff95ac7181a2c0e1eda7aa",
  measurementId: "G-VQHP01ZXKM"
};

// Initialize Firebase
const app      = initializeApp(firebaseConfig);
const auth     = getAuth(app);
const db       = getFirestore(app);
const provider = new GoogleAuthProvider();

// 🔑 Last.fm API 키
const LASTFM_API_KEY = "7e0b8eb10fdc5cf81968b38fdd543cff";


// ===== 2. DOM 요소 캐싱 =====

// 검색창 / 버튼
const searchInput = document.getElementById("searchInput");
const searchBtn   = document.getElementById("searchBtn");

// 로그인 UI
const authStatus    = document.getElementById('authStatus');
const authToggleBtn = document.getElementById('authToggleBtn');

// 내 앨범 그리드
const myGrid = document.getElementById("myGrid");
const empty  = document.getElementById("empty");

// 카테고리 바
const categoryBar     = document.getElementById("categoryBar");
let currentCategory   = "all";

// 검색 결과 모달
const searchModal   = document.getElementById("searchModal");
const modalGrid     = document.getElementById("modalGrid");
const modalClose    = document.getElementById("modalClose");
const modalBackdrop = document.getElementById("modalBackdrop");
const modalTitle    = document.getElementById("modalTitle");

// 트랙 모달
const trackModal = document.getElementById("trackModal");
const trackBackdrop = document.getElementById("trackBackdrop");
const trackModalClose = document.getElementById("trackModalClose");
const trackModalTitle     = document.getElementById("trackModalTitle");
const trackList           = document.getElementById("trackList");
const trackAddBtn         = document.getElementById("trackAddBtn");

// 앨범 옵션 모달 (새로 추가)
const albumOptionModal     = document.getElementById('albumOptionModal');
const albumOptionTitle     = document.getElementById('albumOptionTitle');
const albumOptionClose     = document.getElementById('albumOptionClose');
const albumOptionCoverBtn  = document.getElementById('albumOptionCoverBtn');
const albumOptionDeleteBtn = document.getElementById('albumOptionDeleteBtn');
const albumOptionCategoryBtn = document.getElementById('albumOptionCategoryBtn');


let albumOptionTargetIndex = null;
let albumOptionTargetAlbum = null;

// 미니 플레이어
const miniPlayer = document.getElementById("miniPlayer");
const miniCover  = document.getElementById("miniCover");
const miniTitle  = document.getElementById("miniTitle");
const miniArtist = document.getElementById("miniArtist");
const miniToggle = document.getElementById("miniToggle");
const miniHide   = document.getElementById("miniHide");

// 타임라인 UI (YouTube 시간과 동기화)
const miniSeek        = document.getElementById("miniSeek");
const miniCurrentTime = document.getElementById("miniCurrentTime");
const miniDuration    = document.getElementById("miniDuration");

// ✅ 볼륨 모달
const volumeModal      = document.getElementById("volumeModal");
const volumeBackdrop   = document.getElementById("volumeBackdrop");
const volumeModalClose = document.getElementById("volumeModalClose");
const volumeSlider     = document.getElementById("volumeSlider");


// 커버 입력 모달
const coverModal      = document.getElementById("coverModal");
const coverBackdrop   = document.getElementById("coverBackdrop");
const coverModalClose = document.getElementById("coverModalClose");
const coverModalTitle = document.getElementById("coverModalTitle");
const coverInfo       = document.getElementById("coverInfo");
const coverUrlInput   = document.getElementById("coverUrlInput");
const coverPreview    = document.getElementById("coverPreview");
const coverSaveBtn    = document.getElementById("coverSaveBtn");


// ===== 3. 상태 (State) =====

let isPlaying         = false;
let myAlbums          = [];
let currentUser       = null;

// 트랙 목록 + 현재 트랙 (YouTube videoId 기반)
let tracks            = []; // { id, title, artist, albumName, videoId, coverUrl }
let currentTrackId    = null;
let currentTrackAlbum = null;

// 자동 재생 상태
let playedTrackIdsInAlbum = new Set(); // 현재 앨범에서 재생한 트랙 id
let playedAlbumKeys       = new Set(); // 이번 세션에서 모두 소진한 앨범 키

function getAlbumKey(album) {
  return `${album.artist} - ${album.name}`;
}

// YouTube IFrame Player
let ytPlayer      = null;
let ytUpdateTimer = null;

// 로컬 저장 키
const LOCAL_KEY_ALBUMS = "jootubemusic.myAlbums";


// ===== 4. 공통 유틸 (이미지, 시간, videoId) =====

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

// YouTube URL에서 videoId만 뽑아내는 유틸
function extractVideoId(input) {
  const trimmed = (input || "").trim();
  if (!trimmed) return "";

  // 순수 videoId로 보이는 경우
  if (/^[a-zA-Z0-9_-]{8,}$/.test(trimmed) && !trimmed.includes("http")) {
    return trimmed;
  }

  try {
    const u = new URL(trimmed);
    // youtu.be 단축 주소
    if (u.hostname.includes("youtu.be")) {
      return u.pathname.replace("/", "") || "";
    }
    // 일반 watch 주소
    const v = u.searchParams.get("v");
    if (v) return v;
    // /embed/VIDEOID 형태
    const parts = u.pathname.split("/");
    const last = parts.pop() || parts.pop();
    if (last && /^[a-zA-Z0-9_-]{8,}$/.test(last)) return last;
  } catch (e) {
    // URL 파싱 실패 시에는 위의 regex로 이미 걸렀으므로 그냥 무시
  }

  return "";
}


// ===== 5. LocalStorage & Firestore =====

function saveMyAlbumsToStorage() {
  try {
    const json = JSON.stringify(myAlbums);
    localStorage.setItem(LOCAL_KEY_ALBUMS, json);
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
      myAlbums = arr;
      renderMyAlbums();
    }
  } catch (e) {
    console.error("loadMyAlbumsFromStorage error", e);
  }
}

// Firestore 유틸

function userAlbumsColRef(uid) {
  return collection(db, "users", uid, "albums");
}

async function syncMyAlbumsToFirestore() {
  if (!currentUser) {
    console.log("[sync] no currentUser, skip Firestore");
    return;
  }
  console.log("[sync] start, myAlbums.length =", myAlbums.length);

  const uid    = currentUser.uid;
  const colRef = userAlbumsColRef(uid);

  const ops = myAlbums.map((album) => {
    const albumId = `${album.artist} - ${album.name}`;
    const docRef  = doc(colRef, albumId);
    return setDoc(
      docRef,
      {
        name: album.name,
        artist: album.artist,
        image: album.image,
        hasCover: album.hasCover ?? true,
        category: album.category || "etc",
        createdAt: Date.now()
      },
      { merge: true }
    );
  });

  await Promise.all(ops);
  console.log("[sync] done");
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

// createdAt 내림차순으로 정렬 (최근 것이 위로)
list.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));

myAlbums = list;
renderMyAlbums();
saveMyAlbumsToStorage();
}

// ===== 트랙 Firestore 유틸 (users/{uid}/albums/{albumId}/tracks) =====

function albumDocRef(uid, album) {
  const albumId = `${album.artist} - ${album.name}`;
  return doc(userAlbumsColRef(uid), albumId);
}

function albumTracksColRef(uid, album) {
  return collection(albumDocRef(uid, album), "tracks");
}

async function saveTracksForAlbumToFirestore(album, tracks) {
  if (!currentUser) return;
  const uid      = currentUser.uid;
  const colRef   = albumTracksColRef(uid, album);

  // 단순화를 위해: 기존 트랙 전부 삭제 후 재작성
  const snap = await getDocs(colRef);
  const deletions = [];
  snap.forEach((docSnap) => {
    deletions.push(deleteDoc(docSnap.ref));
  });
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
      index
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
      coverUrl: d.coverUrl || album.image || ""
    });
  });

  // index 순서대로 정렬
  list.sort((a, b) => (a.index ?? 0) - (b.index ?? 0));
  return list;
}



// ===== 6. Last.fm API =====

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


// ===== 7. 검색 모달 =====

function openModal(query) {
  modalTitle.textContent = `"${query}" 검색 결과`;
  searchModal.style.display = "flex";
}

function closeModal() {
  searchModal.style.display = "none";
  modalGrid.innerHTML = "";
}

function askCategoryAndReturnValue() {
  const category = prompt(
    "카테고리를 입력하세요 (kpop / pop / ost / etc 중 하나):",
    "kpop"
  );
  if (!category) return null;

  const normalized = category.trim().toLowerCase();
  const allowed    = ["kpop", "pop", "ost", "etc"];
  if (!allowed.includes(normalized)) {
    alert("kpop / pop / ost / etc 중 하나만 입력할 수 있습니다.");
    return null;
  }
  return normalized;
}

function renderSearchResults(albums) {
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

    card.addEventListener("click", () => {
  const exists = myAlbums.some(
    (a) => a.name === title && a.artist === artist
  );

  let category = "kpop";

  if (!exists) {
    const selected = askCategoryAndReturnValue();
    if (!selected) return;
    category = selected;

    const newAlbum = {
      name: title,
      artist,
      image: imgUrl,
      hasCover: hasRealCover(album),
      category,
    };

    // 기존: myAlbums.push(newAlbum);
    // 변경: 항상 맨 앞에 추가
    myAlbums.unshift(newAlbum);

    renderMyAlbums();
    saveMyAlbumsToStorage();
    if (currentUser) syncMyAlbumsToFirestore();
  }

  const albumObj =
    myAlbums.find((a) => a.name === title && a.artist === artist) || {
      name: title,
      artist,
      image: imgUrl,
      hasCover: hasRealCover(album),
      category,
    };

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
  const q = searchInput.value.trim();
  if (!q) return;

  openModal(q);
  modalGrid.innerHTML = '<div class="empty">검색 중...</div>';

  try {
    const albums = await searchAlbums(q);
    renderSearchResults(albums);
  } catch (err) {
    console.error(err);
    modalGrid.innerHTML =
      '<div class="empty">검색 중 오류가 발생했습니다.</div>';
  }
}


// ===== 8. 내 앨범 그리드 =====

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
      const uid    = currentUser.uid;
      const colRef = userAlbumsColRef(uid);
      const albumId = `${album.artist} - ${album.name}`;
      const docRef  = doc(colRef, albumId);
      await setDoc(docRef, { category: newCategory }, { merge: true });
      console.log("category updated:", albumId, "->", newCategory);
    } catch (e) {
      console.error("updateAlbumCategory Firestore error", e);
    }
  }
}

function renderMyAlbums() {
  myGrid.innerHTML = "";

  const filtered =
    currentCategory === "all"
      ? myAlbums
      : myAlbums.filter((a) => (a.category || "etc") === currentCategory);

  if (!filtered.length) {
    empty.style.display = "block";
    return;
  }
  empty.style.display = "none";

  filtered.forEach((album, index) => {
    const card = document.createElement("div");
    card.className = "card";
    card.innerHTML = `
  <div class="card-cover-wrap">
    <img src="${album.image}" alt="${album.name}">
    <button class="album-option-btn" data-index="${index}">⋮</button>
  </div>
  <div class="card-title"><span>${album.name}</span></div>
  <div class="card-artist">${album.artist}</div>
`;

card.addEventListener("click", (e) => {
  // 옵션 버튼 누른 경우에는 카드 기본 동작(모달 열기)을 막기
  if (e.target.closest(".album-option-btn")) {
    return;
  }

  if (!album.hasCover) {
    openCoverModal(album);
  } else {
    openTrackModal(album);
  }
});

const optionBtn = card.querySelector(".album-option-btn");
optionBtn.addEventListener("click", (e) => {
  e.stopPropagation();
  const idx = Number(optionBtn.dataset.index);
  const target = filtered[idx];
  if (!target) return;

  openAlbumOptionModal(target, idx);
});


    myGrid.appendChild(card);
  });
}


// ===== 9. 커버 입력 모달 =====
let pendingCoverAlbum = null;

function openCoverModal(album) {
  pendingCoverAlbum = album;
  coverModalTitle.textContent = `${album.artist} - ${album.name}`;
  coverInfo.textContent =
    "이 앨범에는 공식 커버가 없어 보입니다. 사용할 커버 이미지 URL을 입력해 주세요.";
  coverUrlInput.value = "";
  coverPreview.src = album.image || "";
  coverModal.style.display = "flex";
}

function closeCoverModal() {
  coverModal.style.display = "none";
  pendingCoverAlbum = null;
}

coverSaveBtn.addEventListener("click", () => {
  if (!pendingCoverAlbum) return;

  const url = coverUrlInput.value.trim();
  if (!url.startsWith("http://") && !url.startsWith("https://")) {
    alert("올바른 이미지 URL을 입력해 주세요.");
    return;
  }

  pendingCoverAlbum.image = url;
  pendingCoverAlbum.hasCover = true;

  renderMyAlbums();
  saveMyAlbumsToStorage();
  if (currentUser) syncMyAlbumsToFirestore();

  closeCoverModal();
  openTrackModal(pendingCoverAlbum);
});

coverModalClose.addEventListener("click", closeCoverModal);
coverBackdrop.addEventListener("click", closeCoverModal);

// ===== 10. 트랙 모달 + YouTube Player =====
function getCurrentTrack() {
  return tracks.find((t) => t.id === currentTrackId) || null;
}

// ✅ 선택만 하는 함수 추가
function selectTrackOnly(id) {
  document
    .querySelectorAll("#trackModal #trackList li.selected-track")
    .forEach((item) => item.classList.remove("selected-track"));

  const li = trackList.querySelector(`[data-track-id="${id}"]`);
  if (li) li.classList.add("selected-track");

  currentTrackId = id;
}

function playTrack(id) {
  const track = tracks.find((t) => t.id === id);
  if (!track) return;

  // 리스트 선택 표시
  document
    .querySelectorAll("#trackModal #trackList li.selected-track")
    .forEach((item) => item.classList.remove("selected-track"));
  const li = trackList.querySelector(`[data-track-id="${id}"]`);
  if (li) li.classList.add("selected-track");

  currentTrackId = id;

  // 미니 플레이어 정보 업데이트 + 표시
  updateNowPlaying(track);      // 여기서 miniCover/miniTitle/miniArtist 설정
  miniPlayer.style.display = "flex";

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

  // ✅ 제목 + 언더바 라인 전체를 '재생 버튼'처럼 사용 (한 번 탭 = 재생)
  line.addEventListener("click", (e) => {
    e.stopPropagation();
    playTrack(id);
  });

  // 편집 버튼 클릭 로직 (기존 코드 유지)
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
      saveTracksForAlbumToFirestore(currentTrackAlbum, tracks).catch((err) =>
        console.error(
          "saveTracksForAlbumToFirestore (edit track) error",
          err
        )
      );
    }
  });

  return li;
}




function openTrackModal(album) {
  currentTrackAlbum = album;
  trackModalTitle.textContent = `${album.artist} - ${album.name}`;
  trackList.innerHTML = "<li>트랙 불러오는 중...</li>";
  trackModal.style.display = "flex";

  (async () => {
    try {
      // 1) Firestore에서 먼저 시도
      let loadedTracks = await loadTracksForAlbumFromFirestore(album);

      // 2) 없으면 Last.fm에서 기본 트랙 리스트
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

      tracks = loadedTracks;
      playedTrackIdsInAlbum = new Set(); // 새로 열면 현재 앨범 재생 기록 초기화

      trackList.innerHTML = "";
      tracks.forEach((t, idx) => {
        const li = createTrackListItem(album, t, idx);
        trackList.appendChild(li);
      });

      if (tracks.length && !currentTrackId) {
        currentTrackId = tracks[0].id;
      }
    } catch (err) {
      console.error(err);
      trackList.innerHTML =
        "<li>트랙 정보를 불러오는 중 오류가 발생했습니다.</li>";
    }
  })();
}

// === 자동으로 다른 앨범에서 랜덤 곡 재생 ===
async function autoPlayRandomTrackFromAlbum(album) {
  try {
    // 트랙 로드: 먼저 Firestore, 없으면 Last.fm
    let loadedTracks = await loadTracksForAlbumFromFirestore(album);

    if (!loadedTracks || !loadedTracks.length) {
      const lfTracks = await fetchAlbumTracks(album.artist, album.name);
      if (!lfTracks || (Array.isArray(lfTracks) && lfTracks.length === 0)) {
        return; // 이 앨범은 트랙 없음
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

    // videoId가 있는 트랙만 대상으로 랜덤 선택
    const playable = loadedTracks.filter((t) => t.videoId);
    if (!playable.length) return;

    // 전역 상태 업데이트
    currentTrackAlbum = album;
    tracks = loadedTracks;
    playedTrackIdsInAlbum = new Set(); // 새 앨범 시작

    const next = playable[Math.floor(Math.random() * playable.length)];
    playTrack(next.id);
  } catch (err) {
    console.error("autoPlayRandomTrackFromAlbum error", err);
  }
}

function closeTrackModal() {
  trackModal.style.display = "none";
  trackList.innerHTML      = "";
  currentTrackAlbum        = null;
}


/* --- YouTube IFrame Player & 미니 플레이어 --- */

// IFrame API 스크립트 동적 로드
(function injectYouTubeAPI() {
  if (document.getElementById("yt-iframe-api")) return;
  const tag = document.createElement("script");
  tag.id  = "yt-iframe-api";
  tag.src = "https://www.youtube.com/iframe_api";
  document.head.appendChild(tag);
})();

// 전역 콜백
window.onYouTubeIframeAPIReady = function () {
  // ytPlayer를 DOM 어딘가에 만들어 둔 <div id="ytPlayer">에 붙임
  ytPlayer = new YT.Player("ytPlayer", {
    height: "0",
    width: "0",
    videoId: "",
    playerVars: {
      autoplay: 0,
      controls: 0,
      modestbranding: 1,
      rel: 0,
      playsinline: 1
    },
    events: {
      onReady: onPlayerReady,
      onStateChange: onPlayerStateChange
    }
  });
};

function onPlayerReady() {
  isPlaying = false;
  updatePlayButtonUI();      // 클래스만 설정
  updateMiniPlayerProgress();
}

function updatePlayButtonUI() {
  if (isPlaying) {
    miniToggle.textContent = "II";   // 일시정지
  } else {
    miniToggle.textContent = "▶";    // 재생
  }
}



function onPlayerStateChange(event) {
  if (!window.YT) return;
  const state = event.data;

  if (state === YT.PlayerState.PLAYING) {
    isPlaying = true;
  miniToggle.textContent = "II";   // 일시정지
    startYtProgressLoop();
  } else if (
    state === YT.PlayerState.PAUSED ||
    state === YT.PlayerState.ENDED
  ) {
    isPlaying = false;
  miniToggle.textContent = "▶";    // 재생
    if (state === YT.PlayerState.ENDED) {
      stopYtProgressLoop();
      handleTrackEnded(); // ← 자동 재생 트리거
    }
  }
}

function playNextTrackInCurrentAlbum() {
  // 기본 검증
  if (!currentTrackAlbum || !Array.isArray(tracks) || !tracks.length || !currentTrackId) {
    return;
  }

  // 현재 인덱스
  const curIdx = tracks.findIndex(t => t.id === currentTrackId);
  if (curIdx === -1) return; // 안전장치

  // 아직 안 들은 곡 목록 (현재 곡 제외)
  const notPlayed = tracks.filter(
    (t) => !playedTrackIdsInAlbum.has(t.id) && t.id !== currentTrackId
  );

  let next;
  if (notPlayed.length) {
    // 안 들은 곡 중에서 랜덤 선택
    next = notPlayed[Math.floor(Math.random() * notPlayed.length)];
  } else {
    // 전부 들었으면, 단순히 다음 인덱스로 순환
    const nextIdx = (curIdx + 1) % tracks.length;
    next = tracks[nextIdx];
    // 새 라운드 시작이므로 재생 기록 초기화
    playedTrackIdsInAlbum = new Set();
  }

  if (!next) return;

  playTrack(next.id);
}


function handleTrackEnded() {
  // 1) 현재 앨범에서 아직 안 재생한 트랙 찾기
  if (currentTrackAlbum && Array.isArray(tracks) && tracks.length) {
    const notPlayed = tracks.filter((t) => !playedTrackIdsInAlbum.has(t.id));

    if (notPlayed.length) {
      // 아직 안 들은 곡 중 랜덤 선택
      const next = notPlayed[Math.floor(Math.random() * notPlayed.length)];
      playTrack(next.id);
      return;
    }

    // 이 앨범은 모두 재생 완료
    const currentAlbumKey = getAlbumKey(currentTrackAlbum);
    playedAlbumKeys.add(currentAlbumKey);
  }

  // 2) 남아 있는 다른 앨범 중 하나 선택
  const remainingAlbums = myAlbums.filter((album) => {
    const key = getAlbumKey(album);
    return !playedAlbumKeys.has(key);
  });

  if (!remainingAlbums.length) {
    // 모든 앨범 순환 완료 → 상태 초기화만
    playedTrackIdsInAlbum.clear();
    playedAlbumKeys.clear();
    return;
  }

  const nextAlbum =
    remainingAlbums[Math.floor(Math.random() * remainingAlbums.length)];
  autoPlayRandomTrackFromAlbum(nextAlbum);
}

// 내 모든 앨범에서 videoId가 있는 트랙 중 랜덤 하나 재생
async function playRandomTrackFromAllAlbums() {
  if (!currentUser) return;              // 로그인 안 되어 있으면 Firestore 접근 X

  const uid = currentUser.uid;

  // 1) Firestore에서 모든 앨범 불러오기
  const albumsSnap = await getDocs(userAlbumsColRef(uid));
  const allPlayableTracks = [];

  for (const albumDoc of albumsSnap.docs) {
    const albumData = albumDoc.data();
    const album = {
      name: albumData.name,
      artist: albumData.artist,
      image: albumData.image,
      hasCover: albumData.hasCover,
      category: albumData.category || "etc",
    };

    const tracksSnap = await getDocs(albumTracksColRef(uid, album));
    tracksSnap.forEach((docSnap) => {
      const d = docSnap.data();
      if (d.videoId) {
        allPlayableTracks.push({
          id: d.id,
          title: d.title,
          artist: d.artist,
          albumName: d.albumName,
          videoId: d.videoId,
          coverUrl: d.coverUrl || album.image,
          _album: album,        // 어떤 앨범인지 같이 들고가기
        });
      }
    });
  }

  if (!allPlayableTracks.length) return;

  // 2) 전체에서 랜덤 하나
  const random = allPlayableTracks[Math.floor(Math.random() * allPlayableTracks.length)];

  // 3) 전역 상태를 해당 앨범/트랙으로 세팅 후 재생
  currentTrackAlbum = random._album;
  tracks = allPlayableTracks.filter(t => t.albumName === random.albumName); // 최소한 같은 앨범 트랙들로 채우기
  currentTrackId = random.id;
  playedTrackIdsInAlbum = new Set([random.id]);

  playTrack(random.id);
}



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
    miniCurrentTime.textContent = "00:00";
    miniDuration.textContent    = "00:00";
    miniSeek.value              = 0;
    return;
  }

  const duration = ytPlayer.getDuration() || 0;
  const current  = ytPlayer.getCurrentTime() || 0;

  if (!duration) {
    miniCurrentTime.textContent = "00:00";
    miniDuration.textContent    = "00:00";
    miniSeek.value              = 0;
    return;
  }

  miniCurrentTime.textContent = formatTime(current);
  miniDuration.textContent    = formatTime(duration);
  miniSeek.value              = (current / duration) * 100;
}

function updateNowPlaying(track) {
  const coverUrl = track.coverUrl || "";

  miniTitle.textContent  = track.title;
  miniArtist.textContent = track.artist || track.albumName || "";

  if (miniCover) {
    if (coverUrl) miniCover.src = coverUrl;
    else miniCover.removeAttribute("src");
  }

  miniSeek.value              = 0;
  miniCurrentTime.textContent = "00:00";
  miniDuration.textContent    = "00:00";
  miniPlayer.style.display    = "flex";
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

// 미니 플레이어 버튼들
miniToggle.addEventListener("click", () => {
  if (!ytPlayer) return;
  const state = ytPlayer.getPlayerState();
  if (state === YT.PlayerState.PLAYING) {
    ytPlayer.pauseVideo();
  } else {
    ytPlayer.playVideo();
  }
});

// ⏭ 버튼: 모든 앰범에서 랜덤 재생
miniHide.textContent = '⏭';
miniHide.addEventListener("click", () => {
  playRandomTrackFromAllAlbums();
});



// 타임라인 드래그
miniSeek.addEventListener("input", () => {
  if (!ytPlayer) return;
  const duration = ytPlayer.getDuration() || 0;
  if (!duration) return;
  const pct         = Number(miniSeek.value) / 100;
  const previewTime = duration * pct;
  miniCurrentTime.textContent = formatTime(previewTime);
});

miniSeek.addEventListener("change", () => {
  if (!ytPlayer) return;
  const duration = ytPlayer.getDuration() || 0;
  if (!duration) return;
  const pct    = Number(miniSeek.value) / 100;
  const newTime = duration * pct;
  ytPlayer.seekTo(newTime, true);
});


// ===== 11. / 카테고리 / 공통 이벤트 =====


if (categoryBar) {
  categoryBar.addEventListener("click", (e) => {
    const btn = e.target.closest(".category-btn");
    if (!btn) return;

    const cat       = btn.dataset.category || "all";
    currentCategory = cat;

    categoryBar.querySelectorAll(".category-btn").forEach((b) => {
      b.classList.toggle("active", b === btn);
    });

    renderMyAlbums();
  });
}

// 추가 트랙 버튼 (수동 추가)
if (trackAddBtn) {
  trackAddBtn.addEventListener("click", () => {
  if (!currentTrackAlbum) return;

  const title = prompt("트랙 제목을 입력해 주세요.");
  if (!title || !title.trim()) return;

  const artist = prompt("아티스트를 입력해 주세요.", currentTrackAlbum.artist || "");
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

  const li = createTrackListItem(currentTrackAlbum, newTrack, tracks.length - 1);
  trackList.appendChild(li);

  if (currentUser && currentTrackAlbum) {
    saveTracksForAlbumToFirestore(currentTrackAlbum, tracks)
      .catch((err) =>
        console.error("saveTracksForAlbumToFirestore (add track) error", err)
      );
  }
});

}

function openAlbumOptionModal(album, index) {
  albumOptionTargetAlbum = album;
  albumOptionTargetIndex = index;

  albumOptionTitle.textContent = `${album.artist} - ${album.name}`;
  albumOptionModal.style.display = 'flex';
}

function closeAlbumOptionModal() {
  albumOptionModal.style.display = 'none';
  albumOptionTargetAlbum = null;
  albumOptionTargetIndex = null;
}

albumOptionClose.addEventListener("click", closeAlbumOptionModal);

albumOptionModal.addEventListener("click", (e) => {
  if (e.target === albumOptionModal) {
    closeAlbumOptionModal();
  }
});

albumOptionCoverBtn.addEventListener("click", () => {
  if (!albumOptionTargetAlbum) return;
  const target = albumOptionTargetAlbum;
  closeAlbumOptionModal();

  // 기존 커버 모달 열기 함수
  openCoverModal(target);
});

albumOptionDeleteBtn.addEventListener("click", () => {
  if (albumOptionTargetIndex == null || !albumOptionTargetAlbum) return;

  const album = albumOptionTargetAlbum;
  const ok = confirm(`"${album.artist} - ${album.name}" 앨범을 삭제하시겠습니까?`);
  if (!ok) return;

  const idx = albumOptionTargetIndex;
  closeAlbumOptionModal();
  deleteAlbumAtIndex(idx);
});

albumOptionDeleteBtn.addEventListener("click", () => {
  if (albumOptionTargetIndex == null || !albumOptionTargetAlbum) return;

  const album = albumOptionTargetAlbum;
  const ok = confirm(`"${album.artist} - ${album.name}" 앨범을 삭제하시겠습니까?`);
  if (!ok) return;

  const idx = albumOptionTargetIndex;
  closeAlbumOptionModal();
  deleteAlbumAtIndex(idx);
});

// ✅ 카테고리 변경 버튼 핸들러 (여기 추가)
albumOptionCategoryBtn.addEventListener("click", () => {
  if (albumOptionTargetIndex == null || !albumOptionTargetAlbum) return;

  const current = albumOptionTargetAlbum.category || "etc";
  const input = prompt(
    "카테고리를 입력하세요 (kpop / pop / ost / etc 중 하나):",
    current
  );
  if (!input) return;

  const normalized = input.trim().toLowerCase();
  const allowed    = ["kpop", "pop", "ost", "etc"];
  if (!allowed.includes(normalized)) {
    alert("kpop / pop / ost / etc 중 하나만 입력할 수 있습니다.");
    return;
  }

  const idx = albumOptionTargetIndex;
  closeAlbumOptionModal();
  updateAlbumCategory(idx, normalized);
});


// 모달/검색 이벤트
searchBtn.addEventListener("click", handleSearch);


// 모달/검색 이벤트
searchBtn.addEventListener("click", handleSearch);
searchInput.addEventListener("keydown", (e) => {
  if (e.key === "Enter") handleSearch();
});
modalClose.addEventListener("click", closeModal);
modalBackdrop.addEventListener("click", closeModal);

trackModalClose.addEventListener("click", closeTrackModal);
trackBackdrop.addEventListener("click", (e) => {
  if (e.target === trackBackdrop) {
    closeTrackModal();
  }
});

// ===== 볼륨 모달 (모바일 완전 호환) =====
function openVolumeModal() {
  if (!ytPlayer || typeof ytPlayer.getVolume !== "function") {
    volumeSlider.value = 100;
  } else {
    const v = ytPlayer.getVolume();
    volumeSlider.value = Number.isFinite(v) ? v : 100;
  }
  volumeModal.style.display = "flex";
  volumeModal.style.zIndex = "9999";
}

function closeVolumeModal() {
  volumeModal.style.display = "none";
}

// 미니 커버 터치/클릭
['click', 'touchend'].forEach(evt => {
  miniCover.addEventListener(evt, (e) => {
    e.preventDefault();
    e.stopPropagation();
    openVolumeModal();
  });
});

// 모달 닫기 터치
['click', 'touchend'].forEach(evt => {
  volumeModalClose.addEventListener(evt, (e) => {
    e.preventDefault();
    closeVolumeModal();
  });
  volumeBackdrop.addEventListener(evt, (e) => {
    if (e.target === volumeBackdrop) {
      e.preventDefault();
      closeVolumeModal();
    }
  });
});

// 슬라이더 실시간 터치
['input', 'change', 'touchend'].forEach(evt => {
  volumeSlider.addEventListener(evt, () => {
    const v = Math.max(0, Math.min(100, Number(volumeSlider.value)));
    if (ytPlayer && typeof ytPlayer.setVolume === "function") {
      ytPlayer.setVolume(v);
    }
  });
});




window.addEventListener("keydown", (e) => {
  if (e.key === "Escape") {
    closeModal();
    closeTrackModal();
    closeCoverModal();
  }
});

authToggleBtn.addEventListener("click", async () => {
  try {
    if (currentUser) {
      await signOut(auth);
    } else {
      await signInWithPopup(auth, provider);
    }
  } catch (e) {
    console.error("auth toggle error", e);
    alert("로그인/로그아웃 중 오류가 발생했습니다.");
  }
});


// Firebase Auth 상태 감시
onAuthStateChanged(auth, async (user) => {
  currentUser = user || null;

  if (user) {
    authStatus.textContent = `${
      user.displayName || "사용자"
    }`;
    authToggleBtn.textContent = "Logout";

    try {
      await loadMyAlbumsFromFirestore();
    } catch (e) {
      console.error("loadMyAlbumsFromFirestore error", e);
    }
  } else {
    authStatus.textContent = "";
    authToggleBtn.textContent = "Login";

    myAlbums = [];
    renderMyAlbums();
  }
});

// ===== 스페이스바 재생/일시정지 (미니플레이어 전역 컨트롤) =====
window.addEventListener("keydown", (e) => {
  // 스페이스바가 아니면 패스
  if (e.code !== 'Space') return;

  // 검색/입력 중이면 스페이스 허용 (타이핑 방해 안 함)
  const active = document.activeElement;
  const isInput = 
    active.tagName === 'INPUT' || 
    active.tagName === 'TEXTAREA' || 
    active.isContentEditable;
  if (isInput) return;

  // 미니플레이어가 안 보이면 동작 안 함
  if (miniPlayer.style.display === 'none' || !miniPlayer.offsetParent) return;

  // 페이지 스크롤 방지 (핵심!)
  e.preventDefault();

  // ytPlayer가 준비됐는지 확인
  if (!ytPlayer) return;

  const state = ytPlayer.getPlayerState?.();
  if (state === YT.PlayerState.PLAYING) {
    ytPlayer.pauseVideo();
  } else {
    ytPlayer.playVideo();
  }
});


