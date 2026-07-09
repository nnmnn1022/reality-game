# DOMAIN_MODEL

## Main Entities

### Experience
- id
- status
- flow_id
- participants
- current_stage_id
- current_story_beat_id
- coverage
- created_at
- ended_at

### Flow
- id
- name
- target
- coverage_definition
- stage_graph

### Stage
- id
- flow_id
- name
- purpose
- allowed_next_stage_ids

### StoryBeat
- id
- stage_id
- lifecycle
- mission
- play_rule
- trigger
- result

### Mission
- interaction_pattern
- constraint
- input_type
- prompt_hint

### PlayRule
- visibility
- participation
- response_policy
- timeout
- completion_condition

### Input
- id
- experience_id
- story_beat_id
- player_id
- type
- payload
- created_at

### Event
- id
- type
- source
- payload
- created_at

### Result
- id
- story_beat_id
- type
- payload
- created_at

### StoryMemory
- id
- source_event_ids
- source_scene_id
- summary
- tags
- callback_weight
