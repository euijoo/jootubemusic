// 🔑 Last.fm API 키
const LASTFM_API_KEY = '7e0b8eb10fdc5cf81968b38fdd543cff';

// 검색창 / 버튼
const searchInput = document.getElementById('searchInput');
const searchBtn   = document.getElementById('searchBtn');

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
  }
  showMiniPlayer({
    title,
    artist,
    cover: imgUrl,
  });
  // 필요하면 자동으로 닫을 수 있음
  // closeModal();
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

/* ---------- 내 앨범 그리드 ---------- */

function renderMyAlbums() {
  myGrid.innerHTML = '';

  if (!myAlbums.length) {
    empty.style.display = 'block';
    return;
  }
  empty.style.display = 'none';

  myAlbums.forEach((album) => {
    const card = document.createElement('div');
    card.className = 'card';
    card.innerHTML = `
      <img src="${album.image}" alt="${album.name}">
      <div class="card-title"><span>${album.name}</span></div>
      <div class="card-artist">${album.artist}</div>
    `;
    card.addEventListener('click', () => {
  if (!album.hasCover) {
    openCoverModal(album);   // 커버 없으면 커버 입력 모달
  } else {
    openTrackModal(album);   // 이미 커버 있으면 바로 트랙 모달
  }
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
  closeCoverModal();
  openTrackModal(pendingCoverAlbum);  // 커버 저장 후 바로 트랙 모달
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
          // TODO: 나중에 YouTube 검색/재생 연결
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

/* ---------- 미니 플레이어 ---------- */

function showMiniPlayer(track) {
  miniCover.src = track.cover;
  miniTitle.textContent = track.title;
  miniArtist.textContent = track.artist;
  isPlaying = true;
  miniToggle.textContent = '⏸';
  miniPlayer.style.display = 'flex';
}

miniToggle.addEventListener('click', () => {
  isPlaying = !isPlaying;
  miniToggle.textContent = isPlaying ? '⏸' : '▶';
});

miniHide.addEventListener('click', () => {
  miniPlayer.style.display = 'none';
  isPlaying = false;
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

// 초기 상태 렌더
renderMyAlbums();
