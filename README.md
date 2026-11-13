# 직관 월드 (친구와 같이 보기)

각자 합법적으로 경기를 보고, 이 월드에서는 **같이 모여서 응원**만 해요. 영상은 이 서비스를 거치지 않아요.

## 무료로 인터넷에 올리기 (Render)
1. github.com 에서 새 저장소(Repository)를 만들고, 이 폴더의 파일을 전부 올려요. (`Add file → Upload files`, `node_modules` 폴더는 올리지 않아도 돼요)
2. render.com 에 GitHub 계정으로 가입 → `New + → Web Service` → 방금 만든 저장소 선택
3. 설정: Runtime `Node`, Build Command `npm install`, Start Command `node server.js`, Instance Type `Free` → `Create Web Service`
4. 몇 분 뒤 `https://이름.onrender.com` 주소가 생겨요. 그 주소를 열면 월드가 나와요.
5. 월드에서 입장 후 위쪽 `친구 초대` 버튼을 누르면 초대 링크가 복사돼요. 친구에게 보내면 같은 방에 들어와요.

## 알아둘 것
- 무료 서버는 한동안 아무도 없으면 잠들어요. 첫 접속은 30~60초 걸릴 수 있어요.
- 음성은 https 주소에서만 되고, 이어폰을 쓰는 게 좋아요. 일부 회선(특정 통신사/공용 와이파이)에서는 음성 연결이 안 될 수 있어요.
- 첫 입장한 사람이 방장(★)이에요. 방장이 나가면 다음 사람에게 넘어가요. 경기 등록·점수 입력은 방장만 해요.

## 내 컴퓨터에서 시험하기
Node.js 설치 후 이 폴더에서 `npm install` → `npm start` → http://localhost:3000
