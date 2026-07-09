# TERMINOLOGY

## Experience
플레이어가 하루 동안 겪는 전체 경험. Reality Mission Engine이 만드는 최종 결과물.

## Flow
Experience의 리듬, 목표, 균형을 정의하는 구조. Story를 강제하지 않는다.

## Stage
Flow 안에서 현재 Experience가 수행해야 하는 구간적 역할. Stage는 Purpose를 가진다.

## Purpose
Stage가 존재하는 이유. 해당 구간에서 플레이어가 경험해야 하는 방향.

## Story Beat
Engine이 관리하는 내부 최소 진행 단위. 플레이어에게 직접 노출하지 않는다.

## Scene
Story Beat가 Renderer를 통해 플레이어에게 표현된 결과. 플레이어는 Scene을 경험한다.

## Mission
Scene 안에서 플레이어에게 전달되는 행동 지시. 게임의 목적이 아니다.

## Interaction Pattern
Mission이 요구하는 현실 상호작용 방식. 예: Move, Observe, Choose, Talk, Capture, Create, Collaborate, Wait.

## Play Rule
Story Beat를 어떻게 플레이할지 정의하는 규칙. 예: Visibility, Participation, Response Policy, Timeout, Completion Condition.

## Input
플레이어가 Mission 수행 후 제공하는 정보. 예: Choice, Text, Photo, Video, Voice, Reaction, Location.

## Result
Engine이 Input과 Play Rule을 바탕으로 생성하는 공식 출력. Story 진행과 Coverage 갱신의 입력이 된다.

## Event
Reality 또는 Bot이 Engine에 전달하는 객관적 사실. 해석을 포함하지 않는다.

## Rule Engine
결정이 필요 없는 규칙을 실행하는 시스템. 예: Majority, Timeout, Visibility, Completion.

## Resolution Engine
선택이 필요한 상황에서 다음 Stage, Story Beat, Callback, Rendering 필요 여부 등을 결정하는 시스템.

## Renderer
내부 모델을 플레이어가 볼 수 있는 Scene으로 표현하는 계층. Template, Discord, AI Renderer 등이 가능하다.

## Coverage
Flow가 목표로 하는 Experience 요소들이 얼마나 충족되었는지 나타내는 상태. 평가 점수가 아니라 충족 상태다.

## Story Memory
Engine 또는 Story Curator가 중요하다고 선정한 Memory. Callback과 Ending Narrative의 재료가 된다.

## Narrative
Story Memory를 연결하여 플레이 이후 해석된 이야기. AI가 주로 담당할 수 있다.
