# STAGE_AND_STORY_BEAT

## Stage

Stage는 Flow 안의 경험 구간이다.  
Stage는 Purpose를 가진다.

예:

```yaml
stage: Exploration
purpose: 낯선 장소와 친해진다.
```

## Story Beat

Story Beat는 Stage의 Purpose를 실현하기 위해 선택되는 내부 진행 단위이다.

Story Beat는 플레이어에게 직접 노출되지 않는다.  
Renderer를 통해 Scene으로 변환된다.

## Story Beat Components

```yaml
story_beat:
  mission:
    interaction: Talk
    constraint: First Stranger
    input: Text
  play_rule:
    visibility: Everyone
    participation: Any
    response_policy: First
    timeout: Optional
  trigger:
    type: InputReceived
  result:
    type: BranchOrMemoryCandidate
```

## Mission

Mission은 행동 지시다.  
Mission은 목적이 아니다.

Mission은 다음 요소의 조합으로 구성될 수 있다.

- Interaction Pattern
- Constraint
- Input Type

## Interaction Pattern

- Move: 장소 이동
- Observe: 주변 관찰
- Choose: 선택
- Talk: 사람과 대화
- Capture: 사진/영상/음성 기록
- Create: 무언가 만들기
- Collaborate: 팀원과 협력
- Wait: 시간 또는 조건 대기
