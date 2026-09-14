(() => {
  'use strict';

  const CONFIG = {
    maxPlayers: 8,
    serverUrlKey: 'spiritFarmingMultiplayerServer',
    // Existing Render WebSocket server.
    serverUrl: 'wss://spiritfarming.onrender.com/ws'
  };

  let socket = null;
  let roomCode = null;
  let myId = null;
  let connected = false;
  const remotePlayers = new Map();
  let lastSent = 0;

  const state = {
    nickname: () => (document.getElementById('nicknameInput')?.value.trim() || window.game?.player?.nickname || '플레이어').slice(0, 12)
  };

  function getServerUrl() {
    const saved = localStorage.getItem(CONFIG.serverUrlKey);
    if (saved) {
      const normalized = saved
        .replace(/^https?:\/\//i, '')
        .replace(/^wss?:\/\//i, '')
        .replace(/\/$/, '')
        .replace(/\/ws$/, '');
      return `wss://${normalized}/ws`;
    }

    // IMPORTANT: the game may be hosted on GitHub Pages,
    // so location.host is NOT the WebSocket server.
    return CONFIG.serverUrl;
  }

  function send(payload) {
    if (socket?.readyState === WebSocket.OPEN) socket.send(JSON.stringify(payload));
  }

  function currentLocation() {
    const visible = [...document.querySelectorAll('.location')].find(el => !el.classList.contains('hidden'));
    return visible?.id || 'farm';
  }

  function getLocalGamePlayer() {
    // index.html의 game은 let으로 선언되어 window.game에는 자동으로 올라가지 않는다.
    // 이전 코드는 이 차이 때문에 멀티플레이에서 항상 sleepy(꾼감자)를 전송했다.
    try {
      if (typeof game !== 'undefined' && game?.player) return game.player;
    } catch (_) {}
    if (window.game?.player) return window.game.player;

    // 게임 객체를 직접 읽을 수 없는 경우에도 저장된 프로필을 사용한다.
    try {
      const prefix = 'spirit_season_save_';
      for (let slot = 1; slot <= 3; slot++) {
        const raw = localStorage.getItem(prefix + slot);
        if (!raw) continue;
        const saved = JSON.parse(raw);
        if (saved?.player) return saved.player;
      }
    } catch (_) {}
    return {};
  }

  function currentGameState() {
    const playerEl = document.getElementById('player');
    const nicknameEl = document.getElementById('playerNickname');
    const localPlayer = getLocalGamePlayer();

    const x = parseFloat(playerEl?.style.left || String(localPlayer.x ?? 50));
    const y = parseFloat(playerEl?.style.top || String(localPlayer.y ?? 68));

    const nickname =
      String(localPlayer.nickname || nicknameEl?.textContent || state.nickname() || '플레이어')
        .trim()
        .slice(0, 12) || '플레이어';

    const validCharacters = ['sleepy', 'captain', 'poison', 'fool', 'violent'];
    const characterId = validCharacters.includes(String(localPlayer.characterId))
      ? String(localPlayer.characterId)
      : (validCharacters.includes(String(window.selectedCharacterId))
          ? String(window.selectedCharacterId)
          : 'sleepy');

    return {
      nickname,
      characterId,
      location: currentLocation(),
      x: Number.isFinite(x) ? x : 50,
      y: Number.isFinite(y) ? y : 68,
      direction: localPlayer.direction || 'down'
    };
  }

  function connectAnd(action) {
    const url = getServerUrl();
    if (!url) {
      alert('멀티플레이 서버 주소가 없습니다. Render에 서버를 배포한 뒤 서버 주소를 설정하세요.');
      return;
    }

    if (socket && socket.readyState === WebSocket.OPEN) {
      action();
      return;
    }

    socket = new WebSocket(url);
    socket.addEventListener('open', () => {
      connected = true;
      setStatus('서버 연결됨');
      action();
    });
    socket.addEventListener('message', e => {
      let msg;
      try { msg = JSON.parse(e.data); } catch { return; }
      handleMessage(msg);
    });
    socket.addEventListener('close', () => {
      connected = false;
      roomCode = null;
      setStatus('서버 연결 종료');
      clearRemotePlayers();
    });
    socket.addEventListener('error', () => setStatus('서버 연결 오류'));
  }

  function handleMessage(msg) {
    if (msg.type === 'connected') {
      myId = msg.id;
      // 서버 연결 직후에도 현재 선택한 닉네임/캐릭터를 명시적으로 보낸다.
      // 이렇게 해야 기존 방에 들어갈 때 기본 캐릭터로 덮어써지는 일을 막을 수 있다.
      return;
    }

    if (msg.type === 'room-created' || msg.type === 'room-joined') {
      roomCode = msg.code;
      showRoomPanel();
      setRoomText(roomCode);
      (msg.players || []).forEach(p => {
        if (p.id !== myId) renderRemotePlayer(p);
      });

      // 방에 들어간 직후 현재 프로필을 다시 전송한다.
      // 기존 서버/방 상태에 기본 캐릭터가 남아 있어도 즉시 선택 캐릭터로 갱신된다.
      sendState(true);

      setStatus(`방 ${roomCode} 접속 중`);
      return;
    }

    if (msg.type === 'player-joined') {
      renderRemotePlayer(msg.player);
      return;
    }

    if (msg.type === 'player-state') {
      renderRemotePlayer(msg.player);
      return;
    }

    if (msg.type === 'player-left') {
      removeRemotePlayer(msg.id);
      return;
    }

    if (msg.type === 'error') {
      alert(msg.message || '멀티플레이 오류');
      return;
    }

    if (msg.type === 'left-room') {
      roomCode = null;
      clearRemotePlayers();
      setStatus('방에서 나왔습니다.');
    }
  }

  function sendState(force = false) {
    if (!roomCode || !connected) return;
    const now = performance.now();
    if (!force && now - lastSent < 50) return;
    lastSent = now;
    const s = currentGameState();
    send({ type: 'state', ...s });
  }

  function createRoom() {
    if (!document.getElementById('player')) {
      if (typeof window.startNewGame === 'function') window.startNewGame(1);
    }
    const s = currentGameState();
    connectAnd(() => send({ type: 'create-room', ...s }));
  }

  function joinRoom(code) {
    if (!document.getElementById('player') && typeof window.startNewGame === 'function') window.startNewGame(1);
    const s = currentGameState();
    connectAnd(() => send({ type: 'join-room', code: code.trim().toUpperCase(), ...s }));
  }

  function renderRemotePlayer(p) {
    if (!p || p.id === myId) return;
    let el = remotePlayers.get(p.id);
    if (!el) {
      el = document.createElement('div');
      el.className = 'remotePlayer';
      el.innerHTML = `
        <div class="remoteNickname"></div>
        <img class="remoteCharacter" alt="" draggable="false">
      `;
      document.getElementById('screen')?.appendChild(el);
      remotePlayers.set(p.id, el);
    }

    el.dataset.location = p.location || 'farm';
    const remoteNickname = String(p.nickname || p.name || '플레이어').trim().slice(0, 12) || '플레이어';
    el.querySelector('.remoteNickname').textContent = remoteNickname;
    el.setAttribute('aria-label', remoteNickname);
    const remoteSprite = window.CHARACTER_SPRITES?.[p.characterId] || window.CHARACTER_SPRITES?.sleepy;
    const remoteImage = el.querySelector('.remoteCharacter');
    if(remoteImage && remoteSprite) remoteImage.src = remoteSprite;
    el.style.left = `${Number(p.x) || 50}%`;
    el.style.top = `${Number(p.y) || 68}%`;
    el.classList.toggle('hiddenRemote', p.location !== currentLocation());
  }

  function removeRemotePlayer(id) {
    const el = remotePlayers.get(id);
    if (el) el.remove();
    remotePlayers.delete(id);
  }

  function clearRemotePlayers() {
    for (const el of remotePlayers.values()) el.remove();
    remotePlayers.clear();
  }

  function refreshRemoteLocations() {
    const location = currentLocation();
    for (const el of remotePlayers.values()) {
      el.classList.toggle('hiddenRemote', el.dataset.location !== location);
    }
  }

  function injectStyles() {
    const style = document.createElement('style');
    style.textContent = `
      .multiplayerBtn{margin-top:10px;width:100%;padding:13px;border-radius:12px;background:#334b62;color:#fff;font-weight:900}
      .mpOverlay{position:fixed;inset:0;z-index:5000;display:flex;align-items:center;justify-content:center;background:rgba(0,0,0,.68);padding:20px}
      .mpPanel{width:min(92vw,430px);padding:24px;border-radius:18px;background:#17212c;color:#fff;border:1px solid rgba(255,255,255,.14);box-shadow:0 20px 60px rgba(0,0,0,.5)}
      .mpPanel h3{margin-bottom:6px}.mpStatus{font-size:12px;color:#aeb8c3;margin-bottom:16px}.mpInput{width:100%;padding:11px;border-radius:9px;border:1px solid #3d4d5e;background:#0e151d;color:#fff;margin-bottom:9px}.mpBtns{display:grid;gap:8px}.mpBtns button{padding:11px;border-radius:9px;background:#e5c36a;color:#292218;font-weight:900}.mpBtns .secondary{background:#35424f;color:#fff}.mpRoom{margin-top:14px;padding:12px;border-radius:10px;background:#0e151d;text-align:center;font-size:18px;font-weight:900;letter-spacing:3px}.mpClose{margin-top:10px;width:100%;padding:9px;background:transparent;color:#aeb8c3}
      .remotePlayer{position:absolute;width:100px;height:110px;z-index:49;transform:translate(-50%,-50%);pointer-events:none;filter:drop-shadow(0 2px 3px rgba(0,0,0,.3));overflow:visible}
      .remoteCharacter{position:absolute;left:50%;top:18px;width:70px;height:82px;transform:translateX(-50%);object-fit:contain;pointer-events:none;user-select:none;z-index:1}.remoteBody,.remoteHead,.remoteHair{display:none}.remotePlayer.hiddenRemote{display:none}.remoteBody{position:absolute;left:8px;bottom:0;width:32px;height:39px;border-radius:10px 10px 6px 6px;border:3px solid rgba(39,57,79,.9)}.remoteHead{position:absolute;left:9px;top:0;width:30px;height:30px;border-radius:50%;background:#efc39e;border:3px solid #6a483c}.remoteHair{position:absolute;left:7px;top:-3px;width:34px;height:17px;background:#4c342e;border-radius:18px 18px 7px 7px;z-index:2}.remoteHair.hair-long{left:5px;top:-3px;width:38px;height:29px;border-radius:18px 18px 11px 11px}.remoteHair.hair-bob{left:4px;top:-2px;width:40px;height:24px;border-radius:19px 19px 12px 12px}.remoteHair.hair-spiky{left:6px;top:-6px;width:36px;height:20px;border-radius:4px 14px 7px 7px;clip-path:polygon(0 45%,12% 8%,27% 32%,42% 0,55% 31%,72% 5%,83% 35%,100% 18%,91% 100%,8% 100%)}.remoteHair.hair-ponytail{left:7px;top:-3px;width:34px;height:18px;border-radius:18px 18px 7px 7px}.remoteHair.hair-ponytail::after{content:"";position:absolute;right:-8px;top:7px;width:14px;height:18px;background:#4c342e;border-radius:50% 60% 60% 40%}.remoteHair.hair-curly{left:4px;top:-5px;width:40px;height:21px;border-radius:50%;box-shadow:-4px 7px 0 #4c342e,4px 9px 0 #4c342e,12px 6px 0 #4c342e,20px 8px 0 #4c342e}.remoteNickname{position:absolute;left:50%;top:-2px;bottom:auto;transform:translateX(-50%);white-space:nowrap;z-index:10;padding:3px 7px;border-radius:7px;background:rgba(15,20,24,.88);color:#fff;font-size:11px;font-weight:900;line-height:1.15;text-shadow:0 1px 2px #000;box-shadow:0 1px 3px rgba(0,0,0,.25)}
      .mpHudBtn{padding:8px 11px;border-radius:10px;background:rgba(16,22,29,.82);color:#fff;border:1px solid rgba(255,255,255,.12);pointer-events:auto}
    `;
    document.head.appendChild(style);
  }

  function setStatus(text) {
    const el = document.querySelector('.mpStatus');
    if (el) el.textContent = text;
  }

  function setRoomText(code) {
    const el = document.querySelector('.mpRoom');
    if (el) el.textContent = code || '방 없음';
  }

  function showRoomPanel() {
    const panel = document.querySelector('.mpPanel');
    if (!panel) return;
    document.querySelector('.mpRoom').style.display = roomCode ? 'block' : 'none';
  }

  function openPanel() {
    let overlay = document.querySelector('.mpOverlay');
    if (overlay) return;
    overlay = document.createElement('div');
    overlay.className = 'mpOverlay';
    overlay.innerHTML = `
      <div class="mpPanel">
        <h3>온라인 멀티플레이</h3>
        <div class="mpStatus">서버에 연결되지 않았습니다.</div>
        <input class="mpInput mpServer" placeholder="서버 주소 (Render 주소, 선택)" value="${localStorage.getItem(CONFIG.serverUrlKey) || 'https://spiritfarming.onrender.com'}">
        <input class="mpInput mpCode" maxlength="6" placeholder="친구에게 받은 방 코드">
        <div class="mpBtns">
          <button class="mpCreate">방 만들기</button>
          <button class="mpJoin">방 참가</button>
          <button class="secondary mpLeave">방 나가기</button>
        </div>
        <div class="mpRoom" style="display:none">방 없음</div>
        <button class="mpClose">닫기</button>
      </div>
    `;
    document.body.appendChild(overlay);

    overlay.querySelector('.mpServer').addEventListener('change', e => {
      let value = e.target.value.trim();
      if (value) {
        value = value
          .replace(/^https?:\/\//i, '')
          .replace(/^wss?:\/\//i, '')
          .replace(/\/ws\/?$/, '')
          .replace(/\/$/, '');
        localStorage.setItem(CONFIG.serverUrlKey, value);
      } else {
        localStorage.removeItem(CONFIG.serverUrlKey);
      }
    });
    overlay.querySelector('.mpCreate').addEventListener('click', createRoom);
    overlay.querySelector('.mpJoin').addEventListener('click', () => joinRoom(overlay.querySelector('.mpCode').value));
    overlay.querySelector('.mpLeave').addEventListener('click', () => send({ type: 'leave-room' }));
    overlay.querySelector('.mpClose').addEventListener('click', () => overlay.remove());
    showRoomPanel();
  }

  function injectUI() {
    const startBox = document.querySelector('#startScreen .startBox');
    if (startBox && !document.querySelector('.multiplayerBtn')) {
      const btn = document.createElement('button');
      btn.className = 'multiplayerBtn';
      btn.textContent = '온라인 멀티플레이';
      btn.addEventListener('click', openPanel);
      startBox.appendChild(btn);
    }

    const hudRight = document.querySelector('.hudRight');
    if (hudRight && !document.querySelector('.mpHudBtn')) {
      const btn = document.createElement('button');
      btn.className = 'mpHudBtn';
      btn.textContent = '멀티';
      btn.addEventListener('click', openPanel);
      hudRight.appendChild(btn);
    }
  }

  function patchGame() {
    if (typeof window.updatePlayer === 'function' && !window.updatePlayer.__mpPatched) {
      const original = window.updatePlayer;
      function wrappedUpdatePlayer(...args) {
        const result = original.apply(this, args);
        sendState();
        refreshRemoteLocations();
        return result;
      }
      wrappedUpdatePlayer.__mpPatched = true;
      window.updatePlayer = wrappedUpdatePlayer;
    }

    if (typeof window.setLocation === 'function' && !window.setLocation.__mpPatched) {
      const original = window.setLocation;
      function wrappedSetLocation(...args) {
        const result = original.apply(this, args);
        setTimeout(() => { sendState(true); refreshRemoteLocations(); }, 30);
        return result;
      }
      wrappedSetLocation.__mpPatched = true;
      window.setLocation = wrappedSetLocation;
    }
  }

  function boot() {
    injectStyles();
    injectUI();
    patchGame();
    setInterval(() => {
      injectUI();
      patchGame();
      sendState();
      refreshRemoteLocations();
    }, 500);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
