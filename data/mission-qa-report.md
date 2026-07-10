# Mission QA Report

- Total: 7
- Valid: 7
- Invalid: 0

## mission-color-hunt

- Title: 오늘의 색 찾기
- Prompt: 주변에서 오늘 팀 분위기와 가장 닮은 색을 찾고 사진이나 말로 기록하세요.
- Input: TEXT+PHOTO
- Expected: TEXT+PHOTO
- Result: PASS
- Placeholder: 예) 까만색

## mission-receipt-prophecy

- Title: 영수증 예언
- Prompt: 가장 최근 영수증이나 숫자 하나를 골라 오늘의 예언처럼 해석해 보세요.
- Input: TEXT
- Expected: TEXT
- Result: PASS
- Placeholder: 예) 135는 오늘의 순서

## mission-tiny-ceremony

- Title: 작은 의식 만들기
- Prompt: 아래 옵션 중 하나를 골라 팀만 알아볼 수 있는 작은 손동작이나 구호를 만들고 다음 미션 전까지 한 번 사용하세요.
- Input: CHOICE
- Expected: CHOICE
- Result: PASS
- Choice Options: 손동작, 구호, 악수
- Placeholder: 답변을 입력하세요.

## mission-kind-object

- Title: 친절한 물건
- Prompt: 주변 물건을 사진으로 찍고, 오늘 팀을 도와주는 조연이라고 이름 붙이세요.
- Input: PHOTO
- Expected: PHOTO
- Result: PASS
- Placeholder: 예) 우산은 오늘의 보호막

## mission-postcard-future

- Title: 미래에서 온 한 줄
- Prompt: 오늘 끝난 뒤의 우리가 지금의 우리에게 보내는 한 줄 메시지를 남기세요.
- Input: TEXT
- Expected: TEXT
- Result: PASS
- Placeholder: 예) 오늘의 용기 잊지 말자

## mission-breathing-checkpoint

- Title: 숨 고르기 체크포인트
- Prompt: 각자 지금 피로도를 1부터 5까지 선택하고, 가장 낮은 사람의 속도에 맞춰 5분 쉬세요.
- Input: CHOICE
- Expected: CHOICE
- Result: PASS
- Choice Options: 1, 2, 3, 4, 5
- Placeholder: 답변을 입력하세요.

## mission-emergency-safe-story

- Title: 안전한 이야기 회수
- Prompt: 지금 자리에서 오늘 기억나는 단어 3개를 적고, 그중 하나를 다음 장면의 암호로 고르세요.
- Input: TEXT+CHOICE
- Expected: TEXT+CHOICE
- Result: PASS
- Choice Options: 단어 1, 단어 2, 단어 3
- Placeholder: 예) 버스, 파란간판, 웃음

