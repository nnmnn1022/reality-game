# PLAYER_UX_MODEL

## Principle

플레이어는 Engine을 보면 안 된다.  
플레이어는 Scene을 경험해야 한다.

## Internal vs Player Terms

| Internal | Player-facing |
|---|---|
| Experience | 오늘의 이야기 / 오늘의 여행 |
| Flow | 분위기 / 테마 / 오늘의 흐름 |
| Stage | 숨김 또는 장면 흐름 |
| Story Beat | Scene |
| Mission | 해야 할 일 / 이번 장면 |
| Input | 기록하기 / 남기기 / 이야기하기 |
| Result | 숨김 |
| Coverage | 숨김 |
| Story Memory | 숨김 또는 Callback |
| Renderer | 숨김 |

## Scene Format

```text
🎬 다음 장면

짧은 Narrative

해야 할 일

입력 버튼 / 기록 방식
```

## Avoid

- 진행률 60%
- Mission Complete
- 성공/실패 강조
- 체크리스트처럼 보이는 UI
- Engine 용어 노출

## Prefer

- "이야기는 계속된다"
- "조금 전 선택이 다시 떠오른다"
- "기록하기"
- "무슨 일이 있었나요?"
- "다음 장면"
