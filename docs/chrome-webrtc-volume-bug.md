# Chrome WebRTC Volume Amplification Bug

## Problem

We cannot amplify remote WebRTC audio above 100% in Chrome. The volume slider works for 0–100% via `HTMLAudioElement.volume`, but amplification beyond 100% (e.g., 200%) is not possible with any Web Audio API approach we've tried.

## What we want

Per-participant volume control from 10% to 200%, controlled locally via a slider in the participant list. Zone-based muting (different zones = silent) is also required.

## What works

- `<audio>` element with `element.volume` for 0–100% volume control
- `createMediaElementSource` piping audio through an AnalyserNode (speaking glow visualization)
- GainNode set to 0 for zone-based muting (different zones)

## Current implementation

```
<audio element>.srcObject = MediaStream([persistentTrack])
createMediaElementSource(element) → AnalyserNode → GainNode → ctx.destination
```

- `element.volume` handles 0–100% volume (reliable)
- `GainNode` handles zone muting (value 0 or 1)
- GainNode values above 1.0 have no audible effect (Chrome limitation)
- Slider UI goes to 200% but the effect plateaus at 100%

## Approaches tried

### 1. `createMediaStreamSource` → GainNode → `ctx.destination`

**Result:** Chrome kills all WebRTC audio. The AnalyserNode receives data (speaking glow works) but no sound reaches the speakers. This is a [documented Chrome bug](https://blog.twoseven.xyz/chrome-webrtc-remote-volume/) — routing a WebRTC `MediaStreamAudioSourceNode` to `ctx.destination` disrupts Chrome's internal audio pipeline.

### 2. `createMediaStreamSource` → GainNode → `createMediaStreamDestination` → `<audio>` element

**Result:** No audio output. Based on the [otalk/mediastream-gain](https://github.com/otalk/mediastream-gain) pattern — process audio through Web Audio and output to a new MediaStream played by an element. In practice, Chrome's WebRTC audio disruption still occurs even when routing to `createMediaStreamDestination` instead of `ctx.destination`.

### 3. `createMediaElementSource(element)` → GainNode → `ctx.destination`

**Result:** Audio plays, but GainNode amplification above 1.0 has no effect. Chrome appears to bypass Web Audio graph modifications when `createMediaElementSource` is used on an element whose `srcObject` is a MediaStream (as opposed to a `src` URL). The audio passes through the graph but the GainNode cannot amplify it. `element.volume` (0–1) still works because it's applied outside the Web Audio graph.

This is the approach we currently use. Volume boost extensions (VLC-style >100%) use `createMediaElementSource` on elements with `src` URLs (file playback), which does allow GainNode amplification — but that doesn't apply to WebRTC MediaStream sources.

## Unexplored approaches

### AudioWorklet processor

A custom `AudioWorkletNode` that multiplies samples directly. Might bypass whatever restriction prevents GainNode from working with MediaStream-backed elements. Unknown whether Chrome applies the same restrictions to worklet processing.

### Sender-side gain

The [TwoSeven blog](https://blog.twoseven.xyz/chrome-webrtc-remote-volume/) solved this by applying gain on the sender side — each sender adjusts their GainNode per receiver. This works but requires network coordination (receiver sends volume-change messages to sender) and doesn't support per-listener independent volume since it modifies the actual sent stream.

### Track cloning

Clone the `persistentTrack` via `track.clone()` before creating a `MediaStreamAudioSourceNode`. The clone might not trigger Chrome's WebRTC audio disruption since it's a separate track object. Untested.

### Firefox / Safari behavior

All testing was done in Chrome. Firefox and Safari may handle `createMediaStreamSource` differently and allow GainNode amplification. Could implement browser-specific code paths.

## References

- [Changing Volume on Remote WebRTC Streams in Chrome — TwoSeven Blog](https://blog.twoseven.xyz/chrome-webrtc-remote-volume/)
- [otalk/mediastream-gain (archived)](https://github.com/otalk/mediastream-gain)
- [GainNode — MDN](https://developer.mozilla.org/en-US/docs/Web/API/GainNode)
- [createMediaStreamDestination — MDN](https://developer.mozilla.org/en-US/docs/Web/API/AudioContext/createMediaStreamDestination)
- [HTML5 Getting More Volume from the Web Audio API](https://cwestblog.com/2017/08/17/html5-getting-more-volume-from-the-web-audio-api/)
