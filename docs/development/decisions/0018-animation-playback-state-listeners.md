# Decision 0018: Animation playback state listeners

## Context

Animated GLB/GLTF objects are updated by the Presenter's render loop. Applications such as timeline controls need the effective clip time every frame so that a slider can follow playback without maintaining a second clock or polling the Presenter.

Three.js stores pingpong actions using wrapped local action time and an internal loop counter. The public newHOP state must expose the effective clip time: `0` is the first frame of the clip and `duration` is the last frame, including while the action is returning during the pingpong half-cycle.

## Decision

Expose `Presenter.onObjectAnimationUpdate(id, listener)`, returning an unsubscribe function. The callback receives an `ObjectAnimationState` snapshot containing the selected clip, effective time, duration, playing state, and loop mode.

Listeners are notified:

- immediately when subscribed;
- after each render-loop mixer update;
- immediately after play, pause, resume, stop, and time-scrubbing operations.

Listeners are owned by the object manager and removed when the object is removed. The API does not expose `THREE.AnimationMixer` or `THREE.AnimationAction` instances.

Pingpong time is normalized at the manager boundary. During the reverse half-cycle, effective time is `duration - action.time`; scrubbing applies the inverse mapping so the public slider remains left-to-right from the closed/start pose to the opened/end pose.

## Consequences

Applications can synchronize controls with the actual rendered animation without polling or maintaining a competing timer. Per-frame callback work is incurred only for objects with registered listeners. The listener API is intentionally object-level; synchronized timelines across multiple objects remain a future concern.
