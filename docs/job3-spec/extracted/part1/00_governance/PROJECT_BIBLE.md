# PROJECT_BIBLE

## 1. Why

Reality Mission Engine은 현실에서 플레이하는 협동형 Experience Engine이다.

우리는 게임 하나를 만드는 것이 아니다.  
우리는 다양한 현실 상황에서 사용할 수 있는 Experience Engine을 만든다.

Travel Mode는 첫 번째 Game Mode일 뿐이다.

## 2. Vision

사람들이

> 오늘 뭐 하지?

를 고민하는 대신

> 오늘은 어떤 이야기가 만들어질까?

를 기대하게 만든다.

## 3. Priority

항상 아래 우선순위를 따른다.

1. 안전
2. 재미
3. 스토리
4. 참여
5. 효율

이 순서는 어떤 상황에서도 바뀌지 않는다.

## 4. Core Philosophy

우리는 미션을 만드는 것이 아니다.  
우리는 스토리를 쓰는 것도 아니다.  
우리는 사람이 기억할 Experience를 설계한다.

Story는 플레이어가 만든다.  
AI는 Story를 쓰지 않는다.  
플레이어의 행동이 Story를 만든다.  
Engine과 Renderer는 그것을 발견하고 표현한다.

## 5. Engine Philosophy

Engine은 Story를 진행시키지 않는다.  
Engine은 Experience를 조율한다.

Engine은 Event를 해석하여 Rule을 적용하고, 필요하면 Resolution을 만든다.  
그 결과 선택된 Story Beat는 Renderer를 통해 Scene으로 표현된다.

## 6. AI Philosophy

AI는 마지막 선택이다.

가능하면 다음 순서로 해결한다.

1. Rule
2. Engine
3. Template
4. AI

AI는 플레이 중에는 Scene Rendering을 보조할 수 있다.  
AI는 플레이 후에는 Story Memory를 연결하여 Narrative를 생성할 수 있다.

그러나 AI가 플레이어의 Story를 대신 쓰면 안 된다.

## 7. Product Philosophy

Reality Mission Engine은 승패를 만드는 게임이 아니다.  
기억을 만드는 엔진이다.

실패는 Game Over가 아니다.  
실패는 Story Branch이다.

Mission은 목적이 아니다.  
Mission은 Scene을 플레이하기 위한 행동 지시이다.

Story Beat가 내부 최소 진행 단위이며, Scene은 Story Beat의 플레이어-facing 표현이다.

## 8. Core Loop

```text
Reality
  ↓
Event
  ↓
Rule Engine
  ↓
Resolution Engine
  ↓
Story Beat
  ↓
Renderer
  ↓
Scene
  ↓
Reality
```

플레이어는 Engine을 보지 않는다.  
플레이어는 Scene만 경험한다.
