# STORY_MEMORY_MODEL

## Definition

Story Memory는 중요한 Memory이다.  
Story Memory는 Ending Narrative뿐 아니라 UX에도 사용된다.

## Story Memory as UX Data

Discord에서는 Story Memory를 다음 방식으로 재사용할 수 있다.

- Reply
- Thread reference
- Pin
- DM callback
- Scene callback

## Callback

Callback은 AI가 과거를 설명하는 것이 아니라, 플레이어가 실제 과거 Scene을 다시 마주하게 만드는 것이다.

예:

```text
↪ Scene 02의 사진에 Reply

그때는 그냥 웃겼는데,
이제 보니 오늘의 방향을 정한 순간이었습니다.
```

## Principle

Foreshadow를 저장하지 않는다.  
Story Memory를 저장한다.

AI는 Story Memory를 이용해 Narrative를 구성한다.
Renderer는 Story Memory를 이용해 Callback을 표현한다.
