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
const authStatus = document.getElementById("authStatus");
const loginBtn   = document.getElementById("loginBtn");
const logoutBtn  = document.getElementById("logoutBtn");

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
const trackModal          = document.getElementById("trackModal");
const trackBackdrop       = document.getElementById("trackBackdrop");
const trackModalClose     = document.getElementById("trackModalClose");
const trackModalTitle     = document.getElementById("trackModalTitle");
const trackList           = document.getElementById("trackList");
const trackCoverChangeBtn = document.getElementById("trackCoverChangeBtn");
const trackAddBtn         = document.getElementById("trackAddBtn");

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

let isPlaying        = false; // 재생 중 여부
let myAlbums         = [];    // 내 앨범 목록
let currentUser      = null;  // Firebase 현재 유저

// 트랙 목록 + 현재 트랙 (YouTube videoId 기반)
let tracks           = [];    // { id, title, artist, albumName, videoId, coverUrl }
let currentTrackId   = null;
let currentTrackAlbum = null;

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
      category: d.category || "etc"
    });
  });

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

        myAlbums.push({
          name: title,
          artist,
          image: imgUrl,
          hasCover: hasRealCover(album),
          category
        });
        renderMyAlbums();
        saveMyAlbumsToStorage();
        if (currentUser) syncMyAlbumsToFirestore();
      }

      // 앨범 선택 시: 바로 트랙 모달 열기
      const albumObj =
        myAlbums.find((a) => a.name === title && a.artist === artist) || {
          name: title,
          artist,
          image: imgUrl,
          hasCover: hasRealCover(album),
          category
        };

       if (!albumObj.hasCover) {
    closeModal();          // ← 추가
    openCoverModal(albumObj);
  } else {
    closeModal();          // ← 추가
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
      <img src="${album.image}" alt="${album.name}">
      <div class="card-title"><span>${album.name}</span></div>
      <div class="card-artist">${album.artist}</div>
      <button class="album-delete-btn" data-index="${index}">삭제</button>
    `;

    card.addEventListener("click", (e) => {
      if (e.target.matches(".album-delete-btn")) return;

      if (!album.hasCover) {
        openCoverModal(album);
      } else {
        openTrackModal(album);
      }
    });

    const deleteBtn = card.querySelector(".album-delete-btn");
    deleteBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      const idx = Number(deleteBtn.dataset.index);
      deleteAlbumAtIndex(idx);
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
  coverPreview.src    = album.image || "";
  coverModal.style.display = "flex";
}

function closeCoverModal() {
  coverModal.style.display = "none";
  pendingCoverAlbum = null;
}

coverUrlInput.addEventListener("input", () => {
  const url = coverUrlInput.value.trim();
  coverPreview.src = url || "";
});

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

  closeCoverModal();
  openTrackModal(pendingCoverAlbum);
});

coverModalClose.addEventListener("click", closeCoverModal);
coverBackdrop.addEventListener("click", closeCoverModal);


// ===== 10. 트랙 모달 + YouTube Player =====

function getCurrentTrack() {
  return tracks.find((t) => t.id === currentTrackId) || null;
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
  updateNowPlaying(track);
  playTrackOnYouTube(track);
}

function createTrackListItem(album, trackData, index) {
  const id = trackData.id;
  const li = document.createElement("li");
  li.dataset.trackId = id;

  li.innerHTML = `
    <span class="track-index">${index + 1}</span>
    <input
      class="track-title-input"
      type="text"
      value="${trackData.title}"
      placeholder="트랙 제목"
    />
    <input
      class="track-stream-input"
      type="text"
      value="${trackData.videoId || ""}"
      placeholder="YouTube videoId 또는 URL"
    />
    <button class="track-play-btn">▶</button>
  `;

  const titleInput  = li.querySelector(".track-title-input");
  const streamInput = li.querySelector(".track-stream-input");
  const playBtn     = li.querySelector(".track-play-btn");

  titleInput.addEventListener("input", (e) => {
    const t = tracks.find((t) => t.id === id);
    if (t) t.title = e.target.value;
    const current = getCurrentTrack();
    if (current && current.id === id) {
      miniTitle.textContent = t.title;
    }
  });

  streamInput.addEventListener("change", (e) => {
    const raw     = e.target.value;
    const videoId = extractVideoId(raw);
    const t       = tracks.find((t) => t.id === id);
    if (!t) return;

    if (!videoId) {
      alert("올바른 YouTube videoId 또는 링크를 입력해 주세요.");
      e.target.value = t.videoId || "";
      return;
    }

    t.videoId     = videoId;
    e.target.value = videoId; // 정규화해서 표시

    if (currentUser && currentTrackAlbum) {
    saveTracksForAlbumToFirestore(currentTrackAlbum, tracks)
     .catch((err) =>
       console.error("saveTracksForAlbumToFirestore (update videoId) error", err)
      );
    }
    
  });

  playBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    playTrack(id);
  });

  return li;
}

function openTrackModal(album) {
  currentTrackAlbum = album;
  trackModalTitle.textContent = `${album.artist} - ${album.name}`;
  trackList.innerHTML = "<li>트랙 불러오는 중...</li>";
  trackModal.style.display = "flex";

  // 1) 내 계정에 저장된 트랙이 있으면 그걸 먼저 사용
  (async () => {
    try {
      let loadedTracks = await loadTracksForAlbumFromFirestore(album);

      if (!loadedTracks || !loadedTracks.length) {
        // 2) 없으면 Last.fm에서 기본 트랙 리스트 가져오기
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
            coverUrl: album.image
          };
        });
      }

      tracks = loadedTracks;

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
  miniToggle.textContent = "▶";
  updateMiniPlayerProgress();
}

function onPlayerStateChange(event) {
  if (!window.YT) return;
  const state = event.data;

  if (state === YT.PlayerState.PLAYING) {
    isPlaying = true;
    miniToggle.textContent = "⏸";
    startYtProgressLoop();
  } else if (
    state === YT.PlayerState.PAUSED ||
    state === YT.PlayerState.ENDED
  ) {
    isPlaying = false;
    miniToggle.textContent = "▶";
    if (state === YT.PlayerState.ENDED) {
      stopYtProgressLoop();
    }
  }
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

miniHide.addEventListener("click", () => {
  miniPlayer.style.display = "none";
  if (ytPlayer) ytPlayer.pauseVideo();
  isPlaying = false;
  stopYtProgressLoop();
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


// ===== 11. 로그인 / 카테고리 / 공통 이벤트 =====

loginBtn.addEventListener("click", async () => {
  try {
    await signInWithPopup(auth, provider);
  } catch (e) {
    console.error("Google login error", e);
    alert("로그인 중 오류가 발생했습니다.");
  }
});

logoutBtn.addEventListener("click", async () => {
  try {
    await signOut(auth);
  } catch (e) {
    console.error("Logout error", e);
    alert("로그아웃 중 오류가 발생했습니다.");
  }
});

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
    if (!currentTrackAlbum) {
      alert("먼저 앨범을 선택해 주세요.");
      return;
    }

    const title = prompt("추가할 트랙 제목을 입력해 주세요.");
    if (!title || !title.trim()) {
      alert("트랙 제목은 필수입니다.");
      return;
    }

    const newTrack = {
      id: crypto.randomUUID(),
      title: title.trim(),
      artist: currentTrackAlbum.artist,
      albumName: currentTrackAlbum.name,
      videoId: "", // 나중에 입력
      coverUrl: currentTrackAlbum.image
    };

    tracks.push(newTrack);

const li = createTrackListItem(currentTrackAlbum, newTrack, tracks.length - 1);
trackList.appendChild(li);

// Firestore에 트랙 전체 저장
if (currentUser) {
  saveTracksForAlbumToFirestore(currentTrackAlbum, tracks)
    .catch((e) => console.error("saveTracksForAlbumToFirestore error", e));
}
  });
}

// 모달/검색 이벤트
searchBtn.addEventListener("click", handleSearch);
searchInput.addEventListener("keydown", (e) => {
  if (e.key === "Enter") handleSearch();
});

modalClose.addEventListener("click", closeModal);
modalBackdrop.addEventListener("click", closeModal);

trackModalClose.addEventListener("click", closeTrackModal);
trackBackdrop.addEventListener("click", closeTrackModal);

trackCoverChangeBtn.addEventListener("click", () => {
  if (!currentTrackAlbum) return;

  const url = prompt(
    "새 커버 이미지 URL을 입력해 주세요.",
    currentTrackAlbum.image || ""
  );
  if (!url) return;
  if (!url.startsWith("http://") && !url.startsWith("https://")) {
    alert("올바른 이미지 URL을 입력해 주세요.");
    return;
  }

  currentTrackAlbum.image   = url;
  currentTrackAlbum.hasCover = true;

  renderMyAlbums();
  saveMyAlbumsToStorage();
  if (currentUser) syncMyAlbumsToFirestore();

  alert("커버 이미지가 변경되었습니다.");
});

window.addEventListener("keydown", (e) => {
  if (e.key === "Escape") {
    closeModal();
    closeTrackModal();
    closeCoverModal();
  }
});


// ===== 12. 초기 로드 & Auth 상태 =====

// 초기: localStorage에서 먼저 로드
loadMyAlbumsFromStorage();

// Firebase Auth 상태 감시
onAuthStateChanged(auth, async (user) => {
  currentUser = user;

  if (user) {
    authStatus.textContent = `${
      user.displayName || "사용자"
    } 님이 로그인했습니다.`;
    loginBtn.style.display  = "inline-block";
    logoutBtn.style.display = "inline-block";

    try {
      await loadMyAlbumsFromFirestore();
    } catch (e) {
      console.error("loadMyAlbumsFromFirestore error", e);
    }
  } else {
    authStatus.textContent = "로그인하지 않은 상태입니다.";
    loginBtn.style.display  = "inline-block";
    logoutBtn.style.display = "none";

    myAlbums = [];
    loadMyAlbumsFromStorage();
  }
});
