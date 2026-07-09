# Reality Mission Engine

디스코드에서 진행하는 현실 미션 게임 백엔드입니다.

## 최신 문서

현재 기준 최신 공식 문서는 `docs/job3-spec/extracted`에 압축 해제되어 있습니다. 루트에 있던 이전 설계 문서는 최신 상태가 아니므로 제거했습니다.

원본 압축 파일은 `docs/job3-spec/*.zip`에 보관되어 있고, 실제로 읽고 연결해야 하는 문서는 아래 압축 해제 폴더를 기준으로 봅니다.

- [Part 1](docs/job3-spec/extracted/part1/README.md): 핵심 제품 모델, 백엔드 구조, Discord MVP, AI 사용 정책, MVP 구현 계획
- [Part 2](docs/job3-spec/extracted/part2/README.md): 콘텐츠 작성, API 계약, 데이터베이스 개념, 예시 플로우, 테스트 전략
- [Part 3](docs/job3-spec/extracted/part3/README.md): 엔진 아키텍처, Discord 명령/버튼/모달, 서비스/저장소 계층, 콘텐츠 DSL
- [Part 4](docs/job3-spec/extracted/part4/README.md): OpenAPI 개요, JSON 스키마, 다이어그램, 예시, 저장소 구조

주요 문서 바로가기:

- 제품/UX: [Experience Model](docs/job3-spec/extracted/part1/01_product/EXPERIENCE_MODEL.md), [Flow System](docs/job3-spec/extracted/part1/01_product/FLOW_SYSTEM.md), [Player UX Model](docs/job3-spec/extracted/part1/01_product/PLAYER_UX_MODEL.md)
- 백엔드/엔진: [Backend Architecture](docs/job3-spec/extracted/part1/02_backend/BACKEND_ARCHITECTURE.md), [Domain Model](docs/job3-spec/extracted/part1/02_backend/DOMAIN_MODEL.md), [Engine Architecture](docs/job3-spec/extracted/part3/12_engine/ENGINE_ARCHITECTURE.md)
- Discord MVP: [Discord UX Spec](docs/job3-spec/extracted/part1/03_discord_mvp/DISCORD_UX_SPEC.md), [Command Spec](docs/job3-spec/extracted/part3/13_discord/COMMAND_SPEC.md), [Button Spec](docs/job3-spec/extracted/part3/13_discord/BUTTON_SPEC.md), [Modal Spec](docs/job3-spec/extracted/part3/13_discord/MODAL_SPEC.md)
- API/스키마: [API Spec](docs/job3-spec/extracted/part2/08_api/API_SPEC.md), [OpenAPI Outline](docs/job3-spec/extracted/part4/18_openapi/OPENAPI_OUTLINE.md), [Event Schema](docs/job3-spec/extracted/part4/19_schema/EVENT_SCHEMA.json), [Story Beat Schema](docs/job3-spec/extracted/part4/19_schema/STORY_BEAT_SCHEMA.json)
- 구현 계획/테스트: [MVP Implementation Plan](docs/job3-spec/extracted/part1/06_roadmap/MVP_IMPLEMENTATION_PLAN.md), [MVP Test Plan](docs/job3-spec/extracted/part2/11_testing/MVP_TEST_PLAN.md), [Repository Structure](docs/job3-spec/extracted/part4/23_repository/REPOSITORY_STRUCTURE.md)

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
