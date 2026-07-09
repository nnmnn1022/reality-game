# STATE_MACHINE

## Experience State

```text
Created
→ Configured
→ Ready
→ Playing
→ Resolving
→ Ended
```

## Created
Experience가 생성되었지만 설정이 완료되지 않은 상태.

## Configured
참가자, Flow, 기본 Play Rule이 설정된 상태.

## Ready
시작 가능한 상태. 프롤로그를 출력할 수 있다.

## Playing
Scene이 공개되고 플레이어들이 현실에서 행동 중인 상태.

## Resolving
Input 또는 Timeout 등의 Event를 바탕으로 Rule과 Resolution을 처리하는 상태.

## Ended
Experience가 종료된 상태. Ending Narrative를 생성할 수 있다.

## Main Loop

```text
Playing
→ Event
→ Resolving
→ Scene Rendered
→ Playing
```
