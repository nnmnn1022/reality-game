# BACKEND_ARCHITECTURE

## Core Pipeline

```text
Discord / Reality Input
  ↓
Bot Gateway
  ↓
Event
  ↓
Rule Engine
  ↓
Resolution Engine
  ↓
Story Beat Selection
  ↓
Renderer
  ↓
Scene
  ↓
Bot Gateway
  ↓
Discord
```

## Responsibility Separation

### Bot Gateway
- Discord 이벤트 수신
- 버튼, 모달, 메시지, 첨부파일 수집
- Event로 변환
- Scene을 Discord 메시지로 전송

### Rule Engine
- Play Rule 실행
- Participation 판단
- Response Policy 처리
- Trigger 판단
- Timeout 처리

### Resolution Engine
- 다음 Stage 선택
- Coverage 균형 판단
- Story Beat 선택
- Callback 여부 판단
- Renderer 선택

### Renderer
- Story Beat를 Scene으로 변환
- Discord 메시지 형태로 렌더링
- AI 또는 Template 사용 가능

### Story Curator
- Event/Memory 분석
- Story Memory 후보 생성
- Callback 가능한 Memory 선정
