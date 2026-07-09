# RESOLUTION_ENGINE

## Purpose

Resolution Engine은 선택이 필요한 상황을 처리한다.

Rule Engine이 답할 수 없는 질문에 답한다.

## Responsibilities

- 다음 Stage 선택
- 다음 Story Beat 선택
- Coverage 균형 조정
- Callback 필요 여부 판단
- Renderer 선택
- Story Memory 후보 승격 요청
- Experience 종료 여부 판단

## Inputs

- Current Experience State
- Flow Target
- Coverage
- Stage Graph
- Recent Events
- Results
- Story Memory

## Outputs

- NextStageSelected
- StoryBeatPrepared
- RendererRequested
- CallbackRequested
- ExperienceEndRequested
