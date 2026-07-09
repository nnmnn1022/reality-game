# MULTIPLAYER_RESPONSE_MODEL

## Problem

Reality Mission Engine의 기본 환경은 1 Bot : N Players 이다.  
따라서 모든 Input은 다중 응답을 고려해야 한다.

## Play Rule

Story Beat는 Play Rule을 가진다.

```yaml
play_rule:
  visibility: Everyone
  participation: All
  response_policy: Majority
  timeout: 20m
  completion_condition: MajorityReached
```

## Visibility

누가 Scene을 볼 수 있는가.

- Everyone
- Team
- Player
- Secret
- Hidden

## Participation

누가 응답해야 하는가.

- All: 모두 응답
- Any: 한 명 이상
- One: 특정 1명
- Team: 특정 팀
- Secret: 특정 플레이어만

## Response Policy

여러 응답을 어떻게 처리하는가.

- First: 첫 번째 응답
- All: 모든 응답 수집
- Majority: 다수결
- Consensus: 전원 동의
- Random: 랜덤 선택
- AI Select: AI가 해석하여 선택
- Curated: Story Curator가 선택

## Important Principle

Mission은 무엇을 할지 정의한다.  
Play Rule은 어떻게 플레이할지 정의한다.

이 둘은 분리해야 한다.
