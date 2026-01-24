// 검색창 / 버튼
const searchInput = document.getElementById('searchInput');
const searchBtn   = document.getElementById('searchBtn');

// 로그인 UI
const authStatus = document.getElementById('authStatus');
const loginBtn   = document.getElementById('loginBtn');
const logoutBtn  = document.getElementById('logoutBtn');

// 내 앨범 그리드
const myGrid = document.getElementById('myGrid');
const empty  = document.getElementById('empty');

// 카테고리 바
const categoryBar = document.getElementById('categoryBar');

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
const trackCoverChangeBtn = document.getElementById('trackCoverChangeBtn');
const trackAddBtn     = document.getElementById('trackAddBtn');

// 커버 입력 모달
const coverModal      = document.getElementById('coverModal');
const coverBackdrop   = document.getElementById('coverBackdrop');
const coverModalClose = document.getElementById('coverModalClose');
const coverModalTitle = document.getElementById('coverModalTitle');
const coverInfo       = document.getElementById('coverInfo');
const coverUrlInput   = document.getElementById('coverUrlInput');
const coverPreview    = document.getElementById('coverPreview');
const coverSaveBtn    = document.getElementById('coverSaveBtn');

// 미니 플레이어
const miniPlayer  = document.getElementById('miniPlayer');
const miniCover   = document.getElementById('miniCover');
const miniTitle   = document.getElementById('miniTitle');
const miniArtist  = document.getElementById('miniArtist');
const miniToggle  = document.getElementById('miniToggle');
const miniHide    = document.getElementById('miniHide');
const miniSeek    = document.getElementById('miniSeek');
const miniCurrentTime = document.getElementById('miniCurrentTime');
const miniDuration    = document.getElementById('miniDuration');


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
      category: d.category || 'etc',
      tracks: Array.isArray(d.tracks) ? d.tracks : [],
    });
  });

  myAlbums = list;
  renderMyAlbums();
  saveMyAlbumsToStorage();
}

// myAlbums를 Firestore에 전체 업로드 (tracks 포함)
async function syncMyAlbumsToFirestore() {
  if (!currentUser) {
    console.log('[sync] no currentUser, skip Firestore');
    return;
  }
  console.log('[sync] start, myAlbums.length =', myAlbums.length);

  const uid = currentUser.uid;
  const colRef = userAlbumsColRef(uid);

  const ops = myAlbums.map((album) => {
    const albumId = `${album.artist} - ${album.name}`;
    const docRef = doc(colRef, albumId);
    return setDoc(
      docRef,
      {
        name: album.name,
        artist: album.artist,
        image: album.image,
        hasCover: album.hasCover ?? true,
        category: album.category || 'etc',
        tracks: Array.isArray(album.tracks) ? album.tracks : [],
        createdAt: Date.now(),
      },
      { merge: true }
    );
  });
  await Promise.all(ops);
  console.log('[sync] done');
}
/* ---------- 트랙 모달 ---------- */

function createTrackListItem(album, title, durationSeconds = 0, customVideoId = null) {
  const li = document.createElement('li');
  const seconds = Number(durationSeconds || 0);
  const mm = String(Math.floor(seconds / 60)).padStart(2, '0');
  const ss = String(seconds % 60).padStart(2, '0');

  li.innerHTML = `
    <span class="track-title">${title}</span>
    <div class="track-right">
      <button class="track-stream-edit">⋯</button>
      <span class="track-duration">${mm}:${ss}</span>
    </div>
  `;

  li.addEventListener('click', (e) => {
    if (e.target.classList.contains('track-stream-edit')) return;

    currentTrack = {
      title,
      artist: album.artist,
      cover: album.image,
      customVideoId:
        currentTrack &&
        currentTrack.title === title &&
        currentTrack.artist === album.artist
          ? currentTrack.customVideoId
          : customVideoId || null,
    };

    showMiniPlayer({
      title,
      artist: album.artist,
      cover: album.image,
    });
  });

  const editBtn = li.querySelector('.track-stream-edit');
  editBtn.addEventListener('click', (e) => {
    e.stopPropagation();

    if (!currentTrack || currentTrack.title !== title || currentTrack.artist !== album.artist) {
      currentTrack = {
        title,
        artist: album.artist,
        cover: album.image,
        customVideoId,
      };
    }

    const currentId = currentTrack.customVideoId || '';
    const input = prompt(
      '이 트랙에 사용할 YouTube 링크 또는 videoId를 입력해 주세요.\n(비워 두고 취소하면 자동 링크를 사용합니다.)',
      currentId
    );
    if (input === null) return;

    const trimmed = input.trim();
    if (!trimmed) {
      currentTrack.customVideoId = null;

      if (Array.isArray(album.tracks)) {
        const t = album.tracks.find((tr) => tr.title === title);
        if (t) t.customVideoId = null;
        saveMyAlbumsToStorage();
        if (currentUser) syncMyAlbumsToFirestore();
      }

      alert('이 트랙의 커스텀 스트리밍 주소를 제거했습니다 (자동 링크 사용).');
      return;
    }

    let videoId = trimmed;
    const vMatch = trimmed.match(/[?&]v=([^&]+)/);
    if (vMatch && vMatch[1]) {
      videoId = vMatch[1];
    }

    if (videoId.length < 8) {
      alert('올바른 YouTube videoId 또는 링크를 입력해 주세요.');
      return;
    }

    currentTrack.customVideoId = videoId;

    if (!Array.isArray(album.tracks)) album.tracks = [];
    const found = album.tracks.find((tr) => tr.title === title);
    if (found) {
      found.customVideoId = videoId;
    } else {
      album.tracks.push({
        title,
        duration: seconds,
        customVideoId: videoId,
      });
    }
    saveMyAlbumsToStorage();
    if (currentUser) syncMyAlbumsToFirestore();

    showMiniPlayer({
      title: currentTrack.title,
      artist: currentTrack.artist,
      cover: currentTrack.cover,
    });

    alert('이 트랙의 스트리밍 주소를 변경했습니다.');
  });

  return li;
}

let currentTrackAlbum = null;
let currentTrack = null;

function openTrackModal(album) {
  currentTrackAlbum = album;

  trackModalTitle.textContent = `${album.artist} - ${album.name}`;
  trackList.innerHTML = '<li class="empty-track-message">트랙 불러오는 중...</li>';
  trackModal.style.display = 'flex';

  // 1) 로컬 tracks가 있으면 그것으로 렌더
  if (Array.isArray(album.tracks) && album.tracks.length > 0) {
    trackList.innerHTML = '';
    album.tracks.forEach((t) => {
      const li = createTrackListItem(album, t.title, t.duration, t.customVideoId || null);
      trackList.appendChild(li);
    });
    return;
  }

  // 2) 없으면 Last.fm에서 가져오고 album.tracks에 저장
  fetchAlbumTracks(album.artist, album.name)
    .then((tracks) => {
      trackList.innerHTML = '';
      if (!tracks || (Array.isArray(tracks) && tracks.length === 0)) {
        trackList.innerHTML =
          '<li class="empty-track-message">트랙 정보를 찾을 수 없습니다.</li>';
        return;
      }

      const arr = Array.isArray(tracks) ? tracks : [tracks];
      album.tracks = [];

      arr.forEach((t) => {
        const title =
          typeof t.name === 'string' ? t.name : t.name?.[0] || '제목 없음';
        const seconds = Number(t.duration || 0);

        album.tracks.push({
          title,
          duration: seconds,
          customVideoId: null,
        });

        const li = createTrackListItem(album, title, seconds);
        trackList.appendChild(li);
      });

      saveMyAlbumsToStorage();
      if (currentUser) syncMyAlbumsToFirestore();
    })
    .catch((err) => {
      console.error(err);
      trackList.innerHTML =
        '<li class="empty-track-message">트랙 정보를 불러오는 중 오류가 발생했습니다.</li>';
    });
}

function closeTrackModal() {
  trackModal.style.display = 'none';
  trackList.innerHTML = '';
  currentTrackAlbum = null;
}
// 트랙 모달 내 커버 변경 버튼
if (trackCoverChangeBtn) {
  trackCoverChangeBtn.addEventListener('click', () => {
    if (!currentTrackAlbum) return;

    const url = prompt(
      '새 커버 이미지 URL을 입력해 주세요.',
      currentTrackAlbum.image || ''
    );
    if (!url) return;
    if (!url.startsWith('http://') && !url.startsWith('https://')) {
      alert('올바른 이미지 URL을 입력해 주세요.');
      return;
    }

    currentTrackAlbum.image = url;
    currentTrackAlbum.hasCover = true;

    renderMyAlbums();
    saveMyAlbumsToStorage();
    if (currentUser) syncMyAlbumsToFirestore();

    alert('커버 이미지가 변경되었습니다.');
  });
}

// 트랙 추가 버튼
if (trackAddBtn) {
  trackAddBtn.addEventListener('click', () => {
    if (!currentTrackAlbum) {
      alert('먼저 앨범을 선택해 주세요.');
      return;
    }

    const title = prompt('추가할 트랙 제목을 입력해 주세요.');
    if (!title || !title.trim()) {
      alert('트랙 제목은 필수입니다.');
      return;
    }

    // duration은 0으로, 나중에 스트리밍 길이로 채울 예정
    const durationSeconds = 0;

    if (!Array.isArray(currentTrackAlbum.tracks)) {
      currentTrackAlbum.tracks = [];
    }
    currentTrackAlbum.tracks.push({
      title: title.trim(),
      duration: durationSeconds,
      customVideoId: null,
    });

    const li = createTrackListItem(
      currentTrackAlbum,
      title.trim(),
      durationSeconds
    );
    trackList.appendChild(li);

    const firstLi = trackList.querySelector('li.empty-track-message');
    if (firstLi) {
      trackList.removeChild(firstLi);
    }

    saveMyAlbumsToStorage();
    if (currentUser) syncMyAlbumsToFirestore();
  });
}

// 검색 결과 카드 클릭 안에서 myAlbums.push(...) 부분만 교체

myAlbums.push({
  name: title,
  artist,
  image: imgUrl,
  hasCover: hasRealCover(album),
  category,
  tracks: [], // 트랙 리스트 초기화
});
renderMyAlbums();
saveMyAlbumsToStorage();
if (currentUser) syncMyAlbumsToFirestore();
