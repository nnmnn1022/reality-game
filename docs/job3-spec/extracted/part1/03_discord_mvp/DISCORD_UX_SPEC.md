# DISCORD_UX_SPEC

## Channels

### Public Channel
예: #오늘의-이야기

모든 플레이어가 보는 메인 무대.  
Bot은 이곳에 Scene을 출력한다.

### Scene Thread
각 Scene마다 Thread를 생성할 수 있다.  
사진, 텍스트, 음성, 리액션은 Thread에 모인다.

### DM
Secret Scene, 개인 힌트, 비밀 입력 요청에 사용한다.

## Scene Message Example

```text
🎬 다음 장면

낯선 장소는
가끔 낯선 사람을 통해 열린다.

오늘 처음 대화하게 되는 사람에게
이 동네에서 가장 추천하는 장소를 물어보세요.

[기록하기] [사진 올리기] [어려워요]
```

## Callback with Reply

과거 Scene 또는 Input 메시지에 Reply하여 Callback을 만든다.

```text
↪ Scene 02

그때의 추천이
생각보다 오래 따라오고 있습니다.
```

## UX Rules

- Bot은 너무 많이 말하지 않는다.
- Playing 중에는 현실 플레이를 방해하지 않는다.
- Director Moment는 드물수록 강하다.
- 완료/실패보다 기록/전환/장면을 강조한다.
