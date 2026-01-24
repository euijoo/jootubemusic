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
const app       = initializeApp(firebaseConfig);
const auth      = getAuth(app);
const db        = getFirestore(app);
const provider  = new GoogleAuthProvider();



// 🔑 Last.fm API 키
const LASTFM_API_KEY = '7e0b8eb10fdc5cf81968b38fdd543cff';
// YouTube Data API 키
const YOUTUBE_API_KEY = 'AIzaSyBysIkRsY2eIwHAqv2oSA8uh6XLiBvXtQ4';

// 검색창 / 버튼
const searchInput = document.getElementById('searchInput');
const searchBtn   = document.getElementById('searchBtn');

// 로그인 UI
const authStatus = document.getElementById('authStatus');
const loginBtn   = document.getElementById('loginBtn');
const logoutBtn  = document.getElementById('logoutBtn');


// 내 앨범 그리드
const myGrid      = document.getElementById('myGrid');
const empty       = document.getElementById('empty');

// 검색 결과 모달
const searchModal   = document.getElementById('searchModal');
const modalGrid     = document.getElementById('modalGrid');
const modalClose    = document.getElementById('modalClose');
const modalBackdrop = document.getElementById('modalBackdrop');
const modalTitle    = document.getElementById('modalTitle');

// 트랙 모달
const trackModal      = document.getElementById('trackModal');
const trackBackdrop   = document.getElementById('trackBackdrop');
const trackModalClose = document.getElementById('trackModalClose');
const trackModalTitle = document.getElementById('trackModalTitle');
const trackList       = document.getElementById('trackList');

// 미니 플레이어
const miniPlayer  = document.getElementById('miniPlayer');
const miniCover   = document.getElementById('miniCover');
const miniTitle   = document.getElementById('miniTitle');
const miniArtist  = document.getElementById('miniArtist');
const miniToggle  = document.getElementById('miniToggle');
const miniHide    = document.getElementById('miniHide');

// 오디오 타임라인 UI (YouTube 시간과 동기화)
const miniSeek        = document.getElementById('miniSeek');
const miniCurrentTime = document.getElementById('miniCurrentTime');
const miniDuration    = document.getElementById('miniDuration');

// 커버 입력 모달
const coverModal      = document.getElementById('coverModal');
const coverBackdrop   = document.getElementById('coverBackdrop');
const coverModalClose = document.getElementById('coverModalClose');
const coverModalTitle = document.getElementById('coverModalTitle');
const coverInfo       = document.getElementById('coverInfo');
const coverUrlInput   = document.getElementById('coverUrlInput');
const coverPreview    = document.getElementById('coverPreview');
const coverSaveBtn    = document.getElementById('coverSaveBtn');

let isPlaying = false;
let myAlbums = []; // 내가 선택한 앨범 목록

// YouTube IFrame Player & 진행 상태
let ytPlayer = null;
let ytUpdateTimer = null;
/* ---------- 공통 유틸 ---------- */

function pickAlbumImage(album) {
  const images = Array.isArray(album.image) ? album.image : [];
  let imgUrl = '';

  if (images.length) {
    const preferSizes = ['extralarge', 'large', 'medium', 'small'];
    for (const size of preferSizes) {
      const found = images.find((img) => img.size === size && img['#text']);
      if (found && found['#text']) {
        imgUrl = found['#text'];
        break;
      }
    }
  }
  if (!imgUrl) {
    imgUrl = 'https://via.placeholder.com/300x300.png?text=%EC%9D%B4%EB%AF%B8%EC%A7%80+%EC%97%86%EC%9D%8C';
  }
  if (imgUrl.startsWith('http://')) {
    imgUrl = imgUrl.replace('http://', 'https://');
  }
  return imgUrl;
}

function hasRealCover(album) {
  const images = Array.isArray(album.image) ? album.image : [];
  if (!images.length) return false;
  const preferSizes = ['extralarge', 'large', 'medium', 'small'];
  return preferSizes.some(size =>
    images.some(img => img.size === size && img['#text'])
  );
}

function formatTime(secs) {
  if (!Number.isFinite(secs) || secs < 0) return '00:00';
  const m = Math.floor(secs / 60);
  const s = Math.floor(secs % 60);
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

// 로컬 저장 키
const LOCAL_KEY_ALBUMS = 'jootubemusic.myAlbums';

// 현재 로그인한 Firebase 유저
let currentUser = null;

/* ---------- LocalStorage 유틸 ---------- */

function saveMyAlbumsToStorage() {
  try {
    const json = JSON.stringify(myAlbums);
    localStorage.setItem(LOCAL_KEY_ALBUMS, json);
  } catch (e) {
    console.error('saveMyAlbumsToStorage error', e);
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
    console.error('loadMyAlbumsFromStorage error', e);
  }
}

/* ---------- Firestore 유틸 ---------- */

// 유저별 albums 컬렉션 참조
function userAlbumsColRef(uid) {
  return collection(db, 'users', uid, 'albums');
}

// myAlbums를 Firestore에 전체 업로드 (최초 동기화용)
async function syncMyAlbumsToFirestore() {
  if (!currentUser) return;
  const uid = currentUser.uid;
  const colRef = userAlbumsColRef(uid);

  // 간단하게: myAlbums 기준으로 setDoc (덮어쓰기)
  const ops = myAlbums.map((album) => {
    const albumId = `${album.artist} - ${album.name}`;
    const docRef = doc(colRef, albumId);
    return setDoc(docRef, {
      name: album.name,
      artist: album.artist,
      image: album.image,
      hasCover: album.hasCover ?? true,
      createdAt: Date.now(),
    }, { merge: true });
  });
  await Promise.all(ops);
}

// Firestore에서 유저 앨범 모두 불러오기
async function loadMyAlbumsFromFirestore() {
  if (!currentUser) return;
  const uid = currentUser.uid;
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
    });
  });

  myAlbums = list;
  renderMyAlbums();
  saveMyAlbumsToStorage(); // 캐시도 함께 업데이트
}





/* ---------- Last.fm API ---------- */

async function searchAlbums(query) {
  const url = new URL('https://ws.audioscrobbler.com/2.0/');
  url.searchParams.set('method', 'album.search');
  url.searchParams.set('album', query);
  url.searchParams.set('api_key', LASTFM_API_KEY);
  url.searchParams.set('format', 'json');
  url.searchParams.set('limit', '50');

  const res = await fetch(url.toString());
  if (!res.ok) throw new Error('Last.fm 요청 실패: ' + res.status);
  const data = await res.json();
  return data.results?.albummatches?.album || [];
}

async function fetchAlbumTracks(artist, albumName) {
  const url = new URL('https://ws.audioscrobbler.com/2.0/');
  url.searchParams.set('method', 'album.getinfo');
  url.searchParams.set('api_key', LASTFM_API_KEY);
  url.searchParams.set('artist', artist);
  url.searchParams.set('album', albumName);
  url.searchParams.set('format', 'json');

  const res = await fetch(url.toString());
  if (!res.ok) throw new Error('album.getInfo 실패: ' + res.status);
  const data = await res.json();
  return data.album?.tracks?.track || [];
}

/* ---------- YouTube 검색 유틸 ---------- */

// (아티스트 + 곡명)으로 검색 쿼리 생성
function buildYoutubeQuery(title, artist) {
  return `${artist} ${title} official audio`;
}

// YouTube Data API v3 search.list로 videoId 하나 가져오기
async function fetchYoutubeVideoId(title, artist) {
  if (!YOUTUBE_API_KEY) {
    console.error('YouTube API key not set');
    return null;
  }

  const query = encodeURIComponent(buildYoutubeQuery(title, artist));
  const url =
    `https://www.googleapis.com/youtube/v3/search` +
    `?part=snippet` +
    `&type=video` +
    `&maxResults=1` +
    `&q=${query}` +
    `&key=${YOUTUBE_API_KEY}`;

  try {
    const res = await fetch(url);
    if (!res.ok) {
      console.error('YouTube API error', res.status, await res.text());
      return null;
    }

    const data = await res.json();
    const items = data.items || [];
    if (!items.length) return null;

    const videoId = items[0].id.videoId;
    return videoId || null;
  } catch (err) {
    console.error('YouTube API fetch failed', err);
    return null;
  }
}
/* ---------- 검색 모달 ---------- */

function openModal(query) {
  modalTitle.textContent = `"${query}" 검색 결과`;
  searchModal.style.display = 'flex';
}

function closeModal() {
  searchModal.style.display = 'none';
  modalGrid.innerHTML = '';
}

function renderSearchResults(albums) {
  modalGrid.innerHTML = '';

  if (!albums.length) {
    const div = document.createElement('div');
    div.className = 'empty';
    div.textContent = '검색 결과가 없습니다.';
    modalGrid.appendChild(div);
    return;
  }

  albums.forEach((album) => {
    const card = document.createElement('div');
    card.className = 'card';

    const title = album.name || '제목 없음';
    const artist = album.artist || '아티스트 없음';
    const imgUrl = pickAlbumImage(album);

    card.innerHTML = `
      <img src="${imgUrl}" alt="${title}">
      <div class="card-title"><span>${title}</span></div>
      <div class="card-artist">${artist}</div>
    `;

    card.addEventListener('click', () => {
  const exists = myAlbums.some(
    (a) => a.name === title && a.artist === artist
  );
  if (!exists) {
    myAlbums.push({
      name: title,
      artist,
      image: imgUrl,
      hasCover: hasRealCover(album),
    });
    renderMyAlbums();
    saveMyAlbumsToStorage();
    if (currentUser) syncMyAlbumsToFirestore();
  }
  showMiniPlayer({
    title,
    artist,
    cover: imgUrl,
  });
});


    modalGrid.appendChild(card);
  });
}

async function handleSearch() {
  const q = searchInput.value.trim();
  if (!q) return;

  console.log('[jootubemusic] search:', q);
  openModal(q);
  modalGrid.innerHTML = '<div class="empty">검색 중...</div>';

  try {
    const albums = await searchAlbums(q);
    console.log('Last.fm albums:', albums);
    renderSearchResults(albums);
  } catch (err) {
    console.error(err);
    modalGrid.innerHTML = '<div class="empty">검색 중 오류가 발생했습니다.</div>';
  }
}


async function deleteAlbumAtIndex(index) {
  const album = myAlbums[index];
  if (!album) return;

  // 1) myAlbums에서 제거
  myAlbums.splice(index, 1);

  // 2) 화면 갱신 + localStorage 저장
  renderMyAlbums();
  saveMyAlbumsToStorage();

  // 3) 로그인 상태면 Firestore에서도 삭제
  if (currentUser) {
    try {
      const uid = currentUser.uid;
      const colRef = userAlbumsColRef(uid);
      const albumId = `${album.artist} - ${album.name}`;
      const docRef = doc(colRef, albumId);
      await deleteDoc(docRef); // 문서 삭제[web:213][web:251]
    } catch (e) {
      console.error('delete album from Firestore error', e);
    }
  }
}



/* ---------- 내 앨범 그리드 ---------- */

function renderMyAlbums() {
  myGrid.innerHTML = '';

  if (!myAlbums.length) {
    empty.style.display = 'block';
    return;
  }
  empty.style.display = 'none';

  myAlbums.forEach((album, index) => {
    const card = document.createElement('div');
    card.className = 'card';
    card.innerHTML = `
      <img src="${album.image}" alt="${album.name}">
      <div class="card-title"><span>${album.name}</span></div>
      <div class="card-artist">${album.artist}</div>
      <button class="album-delete-btn" data-index="${index}">삭제</button>
    `;

    // 카드 클릭 → 트랙/커버 모달
    card.addEventListener('click', (e) => {
      // 삭제 버튼 클릭은 무시
      if (e.target.matches('.album-delete-btn')) return;

      if (!album.hasCover) {
        openCoverModal(album);
      } else {
        openTrackModal(album);
      }
    });

    // 삭제 버튼 클릭 핸들러
    const deleteBtn = card.querySelector('.album-delete-btn');
    deleteBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      const idx = Number(deleteBtn.dataset.index);
      deleteAlbumAtIndex(idx);
    });

    myGrid.appendChild(card);
  });
}


/* ---------- 커버 입력 모달 ---------- */

let pendingCoverAlbum = null;

function openCoverModal(album) {
  pendingCoverAlbum = album;
  coverModalTitle.textContent = `${album.artist} - ${album.name}`;
  coverInfo.textContent = '이 앨범에는 공식 커버가 없어 보입니다. 사용할 커버 이미지 URL을 입력해 주세요.';
  coverUrlInput.value = '';
  coverPreview.src = album.image || '';
  coverModal.style.display = 'flex';
}

function closeCoverModal() {
  coverModal.style.display = 'none';
  pendingCoverAlbum = null;
}

coverUrlInput.addEventListener('input', () => {
  const url = coverUrlInput.value.trim();
  coverPreview.src = url || '';
});

coverSaveBtn.addEventListener('click', () => {
  if (!pendingCoverAlbum) return;
  const url = coverUrlInput.value.trim();
  if (!url.startsWith('http://') && !url.startsWith('https://')) {
    alert('올바른 이미지 URL을 입력해 주세요.');
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


coverModalClose.addEventListener('click', closeCoverModal);
coverBackdrop.addEventListener('click', closeCoverModal);

/* ---------- 트랙 모달 ---------- */

function openTrackModal(album) {
  trackModalTitle.textContent = `${album.artist} - ${album.name}`;
  trackList.innerHTML = '<li>트랙 불러오는 중...</li>';
  trackModal.style.display = 'flex';

  fetchAlbumTracks(album.artist, album.name)
    .then((tracks) => {
      trackList.innerHTML = '';
      if (!tracks || (Array.isArray(tracks) && tracks.length === 0)) {
        trackList.innerHTML = '<li>트랙 정보를 찾을 수 없습니다.</li>';
        return;
      }

      const arr = Array.isArray(tracks) ? tracks : [tracks];

      arr.forEach((t) => {
        const li = document.createElement('li');
        const title = typeof t.name === 'string' ? t.name : (t.name?.[0] || '제목 없음');
        const seconds = Number(t.duration || 0);
        const mm = String(Math.floor(seconds / 60)).padStart(2, '0');
        const ss = String(seconds % 60).padStart(2, '0');

        li.innerHTML = `
          <span class="track-title">${title}</span>
          <span class="track-duration">${mm}:${ss}</span>
        `;

        li.addEventListener('click', () => {
          showMiniPlayer({
            title,
            artist: album.artist,
            cover: album.image,
          });
        });

        trackList.appendChild(li);
      });
    })
    .catch((err) => {
      console.error(err);
      trackList.innerHTML = '<li>트랙 정보를 불러오는 중 오류가 발생했습니다.</li>';
    });
}

function closeTrackModal() {
  trackModal.style.display = 'none';
  trackList.innerHTML = '';
}
/* ---------- YouTube IFrame Player 설정 ---------- */

function onYouTubeIframeAPIReady() {
  ytPlayer = new YT.Player('ytPlayer', {
    height: '0',
    width: '0',
    videoId: '',
    playerVars: {
      autoplay: 0,
      controls: 0,
      modestbranding: 1,
      rel: 0,
      playsinline: 1,
    },
    events: {
      onReady: onPlayerReady,
      onStateChange: onPlayerStateChange,
    },
  });
}

function onPlayerReady(event) {
  console.log('[jootubemusic] YouTube player ready');
}

function onPlayerStateChange(event) {
  const state = event.data;
  if (state === YT.PlayerState.PLAYING) {
    isPlaying = true;
    miniToggle.textContent = '⏸';
    startYtProgressLoop();
  }
  if (state === YT.PlayerState.PAUSED || state === YT.PlayerState.ENDED) {
    isPlaying = false;
    miniToggle.textContent = '▶';
    if (state === YT.PlayerState.ENDED) {
      stopYtProgressLoop();
      miniSeek.value = 0;
      miniCurrentTime.textContent = '00:00';
    }
  }
}

function startYtProgressLoop() {
  if (ytUpdateTimer) return;
  ytUpdateTimer = setInterval(() => {
    if (!ytPlayer || typeof ytPlayer.getDuration !== 'function') return;

    const duration = ytPlayer.getDuration() || 0;
    const current  = ytPlayer.getCurrentTime() || 0;

    if (duration > 0) {
      const pct = (current / duration) * 100;
      miniSeek.value = pct;
      miniCurrentTime.textContent = formatTime(current);
      miniDuration.textContent    = formatTime(duration);
    }
  }, 500);
}

function stopYtProgressLoop() {
  if (ytUpdateTimer) {
    clearInterval(ytUpdateTimer);
    ytUpdateTimer = null;
  }
}

/* ---------- 미니 플레이어 ---------- */

// track: { title, artist, cover }
async function showMiniPlayer(track) {
  miniCover.src = track.cover;
  miniTitle.textContent = track.title;
  miniArtist.textContent = track.artist;

  miniSeek.value = 0;
  miniCurrentTime.textContent = '00:00';
  miniDuration.textContent    = '00:00';
  miniPlayer.style.display = 'flex';

  if (!ytPlayer) {
    console.warn('YouTube player not ready yet');
    return;
  }

  const videoId = await fetchYoutubeVideoId(track.title, track.artist);
  if (!videoId) {
    console.warn('No YouTube video found for track', track.title, track.artist);
    return;
  }

  ytPlayer.loadVideoById(videoId);
}

miniToggle.addEventListener('click', () => {
  if (!ytPlayer) return;
  const state = ytPlayer.getPlayerState();
  if (state === YT.PlayerState.PLAYING) {
    ytPlayer.pauseVideo();
  } else {
    ytPlayer.playVideo();
  }
});

miniHide.addEventListener('click', () => {
  miniPlayer.style.display = 'none';
  if (ytPlayer) ytPlayer.pauseVideo();
  isPlaying = false;
  stopYtProgressLoop();
});

// 타임라인 드래그
miniSeek.addEventListener('input', () => {
  if (!ytPlayer) return;
  const duration = ytPlayer.getDuration() || 0;
  if (!duration) return;
  const pct = miniSeek.value / 100;
  const previewTime = duration * pct;
  miniCurrentTime.textContent = formatTime(previewTime);
});

miniSeek.addEventListener('change', () => {
  if (!ytPlayer) return;
  const duration = ytPlayer.getDuration() || 0;
  if (!duration) return;
  const pct = miniSeek.value / 100;
  const newTime = duration * pct;
  ytPlayer.seekTo(newTime, true);
});

// 로그인 / 로그아웃
loginBtn.addEventListener('click', async () => {
  try {
    await signInWithPopup(auth, provider);
  } catch (e) {
    console.error('Google login error', e);
    alert('로그인 중 오류가 발생했습니다.');
  }
});

logoutBtn.addEventListener('click', async () => {
  try {
    await signOut(auth);
  } catch (e) {
    console.error('Logout error', e);
    alert('로그아웃 중 오류가 발생했습니다.');
  }
});



/* ---------- 이벤트 바인딩 ---------- */

searchBtn.addEventListener('click', handleSearch);
searchInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') handleSearch();
});

modalClose.addEventListener('click', closeModal);
modalBackdrop.addEventListener('click', closeModal);

trackModalClose.addEventListener('click', closeTrackModal);
trackBackdrop.addEventListener('click', closeTrackModal);

window.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') {
    closeModal();
    closeTrackModal();
    closeCoverModal();
  }
});

// 초기: localStorage에서 먼저 로드
loadMyAlbumsFromStorage();

// Firebase Auth 상태 감시
onAuthStateChanged(auth, async (user) => {
  currentUser = user;

  if (user) {
    authStatus.textContent = `${user.displayName || '사용자'} 님이 로그인했습니다.`;
    loginBtn.style.display  = 'inline-block';
    logoutBtn.style.display = 'inline-block';

    try {
      // Firestore에서 유저 앨범 가져와서 myAlbums 교체
      await loadMyAlbumsFromFirestore();
    } catch (e) {
      console.error('loadMyAlbumsFromFirestore error', e);
    }
  } else {
    authStatus.textContent = '로그인하지 않은 상태입니다.';
    loginBtn.style.display  = 'inline-block';
    logoutBtn.style.display = 'none';

    // 로그아웃 후에는 localStorage 기준으로 다시 로드
    myAlbums = [];
    loadMyAlbumsFromStorage();
  }
});
