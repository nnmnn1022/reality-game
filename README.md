# Reality Mission Engine

디스코드에서 진행하는 현실 미션 게임 백엔드입니다.

## 실행

```bash
npm install
npm run dev
```

루트 페이지는 상태 확인용이며, 실제 플레이는 디스코드 인터랙션으로 진행됩니다.
개발 서버는 `http://localhost:5600`에서 동작합니다.

## 검증

```bash
npm run typecheck
npm run lint
npm run test
npm run build
```

## 환경 변수

`.env.example`을 참고해 디스코드 애플리케이션 키와 저장 경로를 설정합니다.
로컬 개발에서는 `DISCORD_SKIP_SIGNATURE_CHECK=true`를 사용하면 인터랙션 테스트가 쉽습니다.

## 동작 방식

디스코드 Interaction Endpoint는 `/api/discord/interactions` 입니다.
이 엔드포인트는 `PING`, 슬래시 명령, 버튼, 모달 제출을 처리합니다.

## 명령

- `start`
- `status`
- `complete`
- `checkpoint`
- `next`
- `emergency`
- `ending`
- `finish`
- `reset`

## 데이터

샘플 미션은 `data/missions.json`에 있습니다. 미션 수는 적게 두었고, 이후 직접 추가하면 됩니다.
