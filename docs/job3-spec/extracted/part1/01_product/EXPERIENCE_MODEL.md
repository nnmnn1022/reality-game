# EXPERIENCE_MODEL

## Core Structure

```text
Experience
└── Flow
    ├── Target
    ├── Coverage Definition
    ├── Stage Graph
    └── Balancer
        └── Stage
            ├── Purpose
            └── Story Beat
                ├── Mission
                ├── Play Rule
                ├── Trigger
                ├── Input
                ├── Result
                └── Lifecycle
```

## Player-facing Structure

```text
Scene
↓
Reality Play
↓
Input
↓
Director Moment / Callback
↓
Next Scene
```

내부에서는 Story Beat가 진행되지만, 플레이어는 Scene만 본다.

## Experience Principle

Experience는 Story Beat들의 단순한 목록이 아니다.  
Experience는 Flow에 의해 균형 잡힌 현실 플레이의 흐름이다.

Engine은 플레이어를 시나리오에 끼워 맞추지 않는다.  
Engine은 Event와 Coverage를 보고 다음 Scene을 조율한다.

## Story Beat Lifecycle

```text
Prepared → Active → Resolved
```

### Prepared
Story Beat가 준비되었으나 아직 플레이어에게 노출되지 않은 상태.

### Active
Story Beat가 Scene으로 렌더링되어 플레이 중인 상태.

### Resolved
Trigger에 의해 Story Beat가 종료되고 Result가 확정된 상태.

성공, 실패, Timeout, Skip은 Story Beat 상태가 아니라 Result의 종류이다.
