# 정령의 계절 온라인 멀티플레이

## 구조
- GitHub: 게임 소스 보관
- Render Web Service: Node.js + WebSocket 서버 실행
- 서버가 `index.html`을 제공할 때 `/multiplayer.js`를 자동으로 주입

## Render 배포
1. Render에서 New > Web Service를 선택합니다.
2. GitHub 저장소 `p8896w6f7t-maker/SpiritFarming`를 연결합니다.
3. Runtime은 Node로 둡니다.
4. Build Command: `npm install`
5. Start Command: `npm start`
6. 배포 후 `https://xxxxx.onrender.com` 주소를 확인합니다.

## 게임 접속
Render 주소로 접속하면 게임 화면의 `온라인 멀티플레이` 버튼에서 서버 주소를 따로 입력하지 않아도 같은 서버로 연결됩니다.

GitHub Pages 주소로 게임을 열 경우에는 멀티플레이 창의 서버 주소 칸에 Render 주소를 입력하면 됩니다.

방 만들기 → 6자리 방 코드 생성 → 친구가 같은 코드를 입력해 방 참가.

현재 동기화되는 값:
- 닉네임
- 선택한 캐릭터(꾼감자/대장감자/독감자/저능감자/폭력감자)
- 현재 위치(농장/마을/숲/바다/집 등)
- X/Y 위치
- 바라보는 방향

방은 서버 메모리에 유지되며 서버가 재시작되면 방이 사라집니다.


## 다음 단계: 영구 저장

이 버전은 PostgreSQL을 선택적으로 지원합니다.

- `DATABASE_URL`이 없으면 기존 메모리 방식으로 동작합니다.
- `DATABASE_URL`이 있으면 플레이어 프로필과 1~3번 세이브 슬롯을 PostgreSQL에 저장합니다.
- 서버 시작 시 필요한 테이블을 자동 생성합니다.
- Render에서는 Web Service와 PostgreSQL을 같은 리전에 두고 연결하는 것이 좋습니다.

### Render 설정

1. Render에서 PostgreSQL을 생성합니다.
2. Web Service의 Environment에 PostgreSQL의 `DATABASE_URL`을 추가합니다.
3. Build Command: `npm install`
4. Start Command: `npm start`
5. 재배포합니다.

Render의 Free PostgreSQL은 현재 생성 후 30일 뒤 만료되므로 장기 저장용으로는 유료/외부 PostgreSQL이 필요합니다.


## 기존 Render 서버 연결

현재 멀티플레이 클라이언트의 기본 WebSocket 주소는:

`wss://spiritfarming.onrender.com/ws`

입니다.

게임을 GitHub Pages에서 열어도 GitHub Pages가 아니라 기존 Render 서버로 연결합니다.
Render 서비스는 새로 만들 필요가 없습니다. 기존 `spiritfarming.onrender.com` Web Service가 `Live`이고 최근 배포가 `Deploy succeeded`라면 해당 서비스를 그대로 사용합니다.


### 캐릭터 선택
게임 시작 시 5종의 감자 캐릭터 중 하나를 선택합니다. 캐릭터 이미지는 `index.html` 안에 직접 포함되어 별도 이미지 파일이 필요하지 않습니다.
옷 색상과 머리카락 선택 UI는 사용하지 않습니다.

### 정령 모바일 상호작용
모바일에서는 정령을 직접 터치하면 게임 내 대화창이 열립니다. PC에서는 기존 E키 상호작용도 유지됩니다.
