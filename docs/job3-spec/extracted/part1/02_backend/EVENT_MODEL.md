# EVENT_MODEL

## Event Principle

Event는 객관적 사실이다.  
Event는 해석을 포함하지 않는다.

## Event Examples

### Experience Events
- ExperienceCreated
- ExperienceConfigured
- ExperienceStarted
- ExperienceEnded

### Scene Events
- SceneRendered
- SceneDelivered
- SceneThreadCreated
- SceneExpired

### Input Events
- PlayerSubmittedText
- PlayerUploadedPhoto
- PlayerSelectedChoice
- PlayerReacted
- PlayerSubmittedVoice
- PlayerSkipped

### Rule Events
- ParticipationCompleted
- MajorityReached
- ConsensusReached
- TimeoutReached
- SecretInputReceived

### Memory Events
- MemoryCandidateCreated
- StoryMemoryCreated
- CallbackTriggered

## Event Payload Rule

Event payload should include facts only.

Good:
```json
{
  "player_id": "A",
  "choice": "market",
  "submitted_at": "..."
}
```

Bad:
```json
{
  "meaning": "A wanted adventure"
}
```
