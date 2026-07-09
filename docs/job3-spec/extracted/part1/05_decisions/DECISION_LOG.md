# DECISION_LOG

## D010. Story Beat is Trigger-based
Story Beat는 고정 시간 간격이 아니라 Trigger에 의해 전환된다.

## D011. Story Beat Lifecycle
Prepared → Active → Resolved

## D012. Purpose belongs to Stage
Purpose는 Story Beat가 아니라 Stage의 책임이다.

## D013. Player provides Input, not Result
플레이어는 Input을 제공하고 Engine이 Result를 생성한다.

## D014. Mission uses Interaction Pattern
Mission은 Interaction Pattern, Constraint, Input의 조합으로 구성될 수 있다.

## D015. Experience has Flow
Experience는 하나의 Flow를 가진다.

## D016. Chapter removed; Flow and Stage adopted
Chapter 용어는 제거하고 Flow/Stage 구조를 사용한다.

## D017. Flow is Balancer, not Script
Flow는 Story를 강제하지 않고 Coverage 균형을 맞춘다.

## D018. Scene is player-facing rendering of Story Beat
Story Beat는 내부 단위, Scene은 플레이어-facing 표현이다.

## D019. Play Rule separates Mission content from multiplayer rules
Mission과 Play Rule을 분리한다.

## D020. Event-driven Engine
Engine은 Event를 소비하여 상태를 전환한다.

## D021. Rule Engine and Resolution Engine are separated
결정이 필요 없는 규칙과 선택이 필요한 해석을 분리한다.

## D022. Renderer replaces Director as output layer
Director/AI 중심 표현을 줄이고 Renderer를 공식 출력 계층으로 정의한다.

## D023. Discord MVP is valid
Discord의 Channel, Thread, DM, Reply, Button, Modal을 사용해 핵심 Experience를 검증할 수 있다.
