# RULE_ENGINE

## Purpose

Rule Engine은 결정이 필요 없는 규칙을 실행한다.

## Responsibilities

- Visibility 적용
- Participation 상태 계산
- Response Policy 실행
- Completion Condition 판단
- Trigger 발생 여부 판단
- Timeout 처리

## Not Responsible For

- 다음 Stage 선택
- Story 의미 해석
- Narrative 생성
- Callback 문장 생성
- AI 호출 여부의 복잡한 판단

## Rule Examples

### Majority

```yaml
participation: All
response_policy: Majority
completion_condition: MajorityReached
```

### Any First

```yaml
participation: Any
response_policy: First
completion_condition: FirstInputReceived
```

### Secret

```yaml
visibility: Player:C
participation: One
response_policy: First
```
