# RENDERER_MODEL

## Definition

Renderer는 내부 모델을 플레이어가 볼 수 있는 Scene으로 표현한다.

```text
Story Beat
  ↓
Renderer
  ↓
Scene
```

## Renderer Types

### Template Renderer
정해진 템플릿으로 빠르게 Scene 생성.

### AI Renderer
현재 Flow, Stage, Story Memory, Style을 반영해 자연스러운 Scene 생성.

### Discord Renderer
Scene을 Discord Embed, Button, Modal, Thread, DM 형식으로 변환.

## Scene Output

Scene은 다음을 포함할 수 있다.

- public_message
- private_messages
- buttons
- modal_schema
- thread_policy
- reply_target_scene_id
- attachments_policy

## Principle

AI는 Renderer의 구현체 중 하나일 뿐이다.  
Renderer라는 Product 개념을 AI에 종속시키지 않는다.
