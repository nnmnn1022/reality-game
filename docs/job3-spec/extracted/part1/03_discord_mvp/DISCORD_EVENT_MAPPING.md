# DISCORD_EVENT_MAPPING

## Slash Commands

### /start-experience
Creates ExperienceCreated event.

### /join
Creates PlayerJoined event.

### /choose-flow
Creates FlowSelected event.

### /begin
Creates ExperienceStarted event.

## Buttons

### 기록하기
Opens modal. Creates PlayerSubmittedText event.

### 사진 올리기
Requests upload in thread. Creates PlayerUploadedPhoto event.

### 선택 버튼
Creates PlayerSelectedChoice event.

### 어려워요
Creates PlayerDifficultyReported event.

## Threads

Thread message creates SceneThreadMessageCreated event.

## Reactions

Reaction creates PlayerReacted event.

## DM

DM reply creates SecretInputReceived event.
