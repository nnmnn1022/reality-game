# Reality Mission Engine

디스코드 봇으로만 동작하는 현실 미션 게임 엔진입니다.

Next.js 웹앱 구조는 제거했고, 현재 런타임은 `bot.js`에서 시작하는 `discord.js` gateway 봇입니다. 별도 HTTP API나 웹 페이지는 운영하지 않습니다.

## 최신 문서

현재 기준 최신 공식 문서는 `docs/job3-spec/extracted`에 압축 해제되어 있습니다.
작업 중인 보조 명세는 `docs/job4/spec.md`를 참고합니다.

- [Part 1](docs/job3-spec/extracted/part1/README.md)
- [Part 2](docs/job3-spec/extracted/part2/README.md)
- [Part 3](docs/job3-spec/extracted/part3/README.md)
- [Part 4](docs/job3-spec/extracted/part4/README.md)
- [Lobby Flow Spec](docs/job4/spec.md)

주요 문서 바로가기:

- 제품/UX: [Experience Model](docs/job3-spec/extracted/part1/01_product/EXPERIENCE_MODEL.md), [Flow System](docs/job3-spec/extracted/part1/01_product/FLOW_SYSTEM.md), [Player UX Model](docs/job3-spec/extracted/part1/01_product/PLAYER_UX_MODEL.md)
- 백엔드/엔진: [Backend Architecture](docs/job3-spec/extracted/part1/02_backend/BACKEND_ARCHITECTURE.md), [Domain Model](docs/job3-spec/extracted/part1/02_backend/DOMAIN_MODEL.md), [Engine Architecture](docs/job3-spec/extracted/part3/12_engine/ENGINE_ARCHITECTURE.md)
- Discord MVP: [Discord UX Spec](docs/job3-spec/extracted/part1/03_discord_mvp/DISCORD_UX_SPEC.md), [Command Spec](docs/job3-spec/extracted/part3/13_discord/COMMAND_SPEC.md), [Button Spec](docs/job3-spec/extracted/part3/13_discord/BUTTON_SPEC.md), [Modal Spec](docs/job3-spec/extracted/part3/13_discord/MODAL_SPEC.md)
- API/스키마: [API Spec](docs/job3-spec/extracted/part2/08_api/API_SPEC.md), [OpenAPI Outline](docs/job3-spec/extracted/part4/18_openapi/OPENAPI_OUTLINE.md), [Event Schema](docs/job3-spec/extracted/part4/19_schema/EVENT_SCHEMA.json), [Story Beat Schema](docs/job3-spec/extracted/part4/19_schema/STORY_BEAT_SCHEMA.json)
- 구현 계획/테스트: [MVP Implementation Plan](docs/job3-spec/extracted/part1/06_roadmap/MVP_IMPLEMENTATION_PLAN.md), [MVP Test Plan](docs/job3-spec/extracted/part2/11_testing/MVP_TEST_PLAN.md), [Repository Structure](docs/job3-spec/extracted/part4/23_repository/REPOSITORY_STRUCTURE.md)

## 실행

```bash
npm install
npm run bot
```

`npm run dev`, `npm run start`, `npm run bot`은 모두 `node bot.js`를 실행합니다.

PM2 운영 예시:

```bash
pm2 start bot.js --name reality-game-bot
pm2 save
pm2 logs reality-game-bot
pm2 restart reality-game-bot
```

## 환경 변수

`.env.example`을 참고해 디스코드 토큰과 저장 경로를 설정합니다.

```bash
DISCORD_TOKEN=봇 토큰
DISCORD_CLIENT_ID=애플리케이션 클라이언트 ID
DISCORD_GUILD_ID=테스트 서버 ID
DISCORD_STORAGE_PATH=./data/discord-sessions.json
AI_MODEL=렌더러 모델 ID
AI_API_KEY=AI 제공자 API 키
```

`DISCORD_GUILD_ID`를 넣으면 해당 서버에만 슬래시 명령어를 등록합니다. 생략하면 전역 명령어로 등록합니다.
`AI_MODEL`과 `AI_API_KEY`는 Scene renderer 연결용이며, 값이 없으면 로컬 렌더러로 자동 폴백합니다.

## 로비 흐름

`/begin`은 메인 메뉴를 엽니다.

- `새 Experience` -> Lobby 생성
- `참가하기` -> 현재 Lobby 참가
- `준비 완료` -> Experience 시작 후 첫 Scene 표시

Lobby는 하나의 메시지를 계속 edit 합니다. Experience가 시작되면 Scene 화면으로 전환되고, Lobby 버튼은 사라집니다.
Scene의 입력 버튼은 Mission의 `inputType`과 선택지 정의를 따라 동적으로 생성됩니다.

## 검증

```bash
npm run lint
npm run test
npm run qa:missions
```

`npm run qa:missions:fix`는 Mission 정의를 자동 보정한 뒤 `data/mission-qa-report.md`를 갱신합니다.
`data/mission-qa-report.md`는 최신 Mission QA 결과 문서입니다.

## 동작 방식

봇은 `discord.js` gateway 클라이언트로 동작합니다.

- 진입점: `bot.js`
- 게임 로직: `src/lib/game.js`
- 경험/장면 로직: `src/lib/experience.js`
- Discord 인터랙션 핸들러: `src/lib/discord-interactions.js`
- 세션 저장소: `src/lib/session-store.js`
- 슬래시 명령어: `start`, `status`, `complete`, `checkpoint`, `next`, `emergency`, `ending`, `finish`, `reset`, `start-experience`, `join`, `leave`, `choose-flow`, `begin`, `continue`, `end`
- 버튼과 모달: `src/lib/discord-interactions.js`의 공용 핸들러가 처리합니다.
- 세션 저장: `data/discord-sessions.json`

## 전환 이력

이 프로젝트는 기존 Next.js 웹앱 잔재를 제거하고 봇 전용 구조로 정리했습니다.

- 제거됨: `next`, `react`, `react-dom`, `lucide-react`, Next.js app router/API route, TypeScript 전용 설정
- 추가됨: `discord.js`, `dotenv`, `bot.js`
- 검증 기준: `npm run lint`, `npm run test`

## 데이터

샘플 미션은 `data/missions.json`에 있습니다.
Mission QA 결과는 `data/mission-qa-report.md`에 있습니다.
