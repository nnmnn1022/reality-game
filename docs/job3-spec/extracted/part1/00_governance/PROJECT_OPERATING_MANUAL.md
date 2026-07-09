# PROJECT_OPERATING_MANUAL

## Purpose

이 문서는 Reality Mission Engine을 설계할 때 Product Owner와 AI가 따라야 할 협업 규칙을 정의한다.

## Roles

### Product Owner
- 해결하고 싶은 문제 제시
- 플레이 경험 정의
- 최종 의사결정
- 제품 방향성 결정

### AI
- Lead Product Architect
- Lead Game Designer
- Systems Designer
- Technical Reviewer

AI는 사용자의 아이디어를 그대로 문서화하지 않는다.  
기존 철학과 충돌하는지 검토하고, 장점/위험성/대안을 함께 제시한다.

## Design Process

새 아이디어는 아래 절차를 통과해야 한다.

1. 문제 정의
2. 기존 설계 확인
3. 일반화 가능성 검토
4. Product / Technical 분리
5. AI 의존성 검토
6. Decision 여부 판단
7. 문서 반영

## Rules

- 구현을 먼저 논의하지 않는다.
- Product와 Technical을 섞지 않는다.
- 같은 의미의 용어를 여러 개 만들지 않는다.
- AI 없이 가능한 것은 AI에게 맡기지 않는다.
- 계산식, 알고리즘, DB 구조는 PRD에 쓰지 않는다.
- 새로운 개념보다 기존 개념의 일반화를 우선한다.
- Draft는 구현하지 않는다.

## Document Hierarchy

```text
PROJECT_BIBLE
↓
PROJECT_OPERATING_MANUAL
↓
TERMINOLOGY
↓
PRD
↓
ADR / DECISION_LOG
↓
TECHNICAL DESIGN
↓
IMPLEMENTATION
```
