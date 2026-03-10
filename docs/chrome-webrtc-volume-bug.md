# Chrome WebRTC Volume Amplification Bug

## Problem

We cannot amplify remote WebRTC audio above 100% in Chrome. The volume slider works for 0–100% via `HTMLAudioElement.volume`, but amplification beyond 100% is not possible with any approach we've found.

## Decision

We capped the volume slider at 10–100%. The 0–100% range via `element.volume` is reliable across all browsers. Amplification above 100% is not achievable in Chrome for WebRTC MediaStream sources without significant trade-offs. See "Approaches investigated" below for the full analysis.

## Current implementation

```
<audio element>.srcObject = MediaStream([persistentTrack])
createMediaElementSource(element) → AnalyserNode → ctx.destination
```

- `element.volume` handles everything audible: volume control (10–100%) AND zone muting (set to 0)
- `AnalyserNode` powers speaking-glow visualization (pass-through)

**Why the graph exists at all:** The AnalyserNode only processes data when it's part of a chain that terminates at a destination. The graph doesn't produce audible output (Chrome bypasses it for MediaStream-backed elements), but it must exist for speaking glow to work. No GainNode is needed — Chrome ignores the entire Web Audio graph for output when `createMediaElementSource` is used with a MediaStream `srcObject`.

## Approaches investigated

### 1. `createMediaStreamSource` → GainNode → `ctx.destination`

**Result: No audio.** Chrome kills all WebRTC audio when routing a `MediaStreamAudioSourceNode` to `ctx.destination`. The AnalyserNode still receives data (speaking glow works) but no sound reaches the speakers. This is a [documented Chrome bug](https://blog.twoseven.xyz/chrome-webrtc-remote-volume/) — routing WebRTC streams through the Web Audio graph disrupts Chrome's internal audio pipeline.

### 2. `createMediaStreamSource` → GainNode → `createMediaStreamDestination` → `<audio>`

**Result: No audio.** Based on the [otalk/mediastream-gain](https://github.com/otalk/mediastream-gain) pattern. Chrome's WebRTC audio disruption still occurs even when routing to `createMediaStreamDestination` instead of `ctx.destination`.

### 3. `createMediaElementSource(element)` → GainNode → `ctx.destination` (current)

**Result: Audio plays, but GainNode amplification above 1.0 has no effect.** Chrome bypasses Web Audio graph gain when `createMediaElementSource` is used on an element whose `srcObject` is a MediaStream (as opposed to a `src` URL). The audio passes through the graph, so the AnalyserNode and zone-muting GainNode (0/1) work, but amplification above 1.0 is silently ignored. `element.volume` (0–1) still works because it's applied outside the Web Audio graph.

Volume boost browser extensions use `createMediaElementSource` on elements with `src` URLs (file/streaming playback), which does allow GainNode amplification — but that doesn't apply to WebRTC MediaStream sources.

### 4. Insertable Streams (`MediaStreamTrackProcessor`)

**Result: Broken for inbound WebRTC audio in Chrome.** `MediaStreamTrackProcessor` can process outbound audio (e.g., mic → filter → send), but for inbound WebRTC tracks the transform callback never executes and no audio plays. This is filed as [Chromium bug #1264539](https://issues.chromium.org/issues/40184923) and a [WebRTC samples issue](https://github.com/webrtc/samples/issues/1488), with no fix as of March 2026.

### 5. Sender-side gain (TwoSeven's solution)

**Result: Works, but incompatible with SFU architecture.** [TwoSeven](https://blog.twoseven.xyz/chrome-webrtc-remote-volume/) solved this by applying gain on the sender side — the receiver requests a volume level, and the sender adjusts their GainNode per peer connection. This works because TwoSeven uses mesh (peer-to-peer) topology where each sender has a separate `RTCPeerConnection` per receiver.

Daily.co uses an SFU (Selective Forwarding Unit): each sender sends **one** audio track to the server, which forwards it to all receivers. There's no way to apply different gain per receiver. If User A wants User B louder and User C wants User B quieter, the SFU can't satisfy both.

### 6. Uniform sender-side pre-amplification

**Result: Feasible but trade-offs outweigh benefit.** Each sender would process their mic through a GainNode (e.g., 1.5x) before sending via `updateInputSettings({ audio: { customTrack } })`. Receivers use `element.volume` (0–1.0) to scale 0% to ~150%.

Problems:
- **AGC interference:** Chrome's WebRTC Automatic Gain Control may normalize the boosted signal back down, defeating the purpose. Disabling AGC (`autoGainControl: false`) means losing automatic level normalization for all users.
- **Clipping on loud peaks:** Typical speech peaks at -12 to -6 dBFS after AGC. A 2x boost (+6 dB) pushes peaks to -6 to 0 dBFS — borderline clipping. Shouting or plosives would clip, and that distortion is baked into the Opus-encoded stream (can't be undone by the receiver).
- **Noise floor doubled:** Background noise (fans, typing, hiss) is amplified equally.
- **No per-listener independence:** Everyone hears the same boosted signal.

### 7. AudioWorklet processor

**Not tested.** A custom `AudioWorkletNode` that multiplies samples directly. Might bypass Chrome's restriction since it processes raw PCM data. However, the AudioWorklet would need to receive audio via `createMediaStreamSource` or `createMediaElementSource` — the same entry points that have the Chrome limitations documented above. Likely subject to the same restrictions.

### 8. Multiple `<audio>` elements (same stream)

**Not tested, probably won't work.** Playing the same MediaStream through two `<audio>` elements to get 2x volume via browser audio mixing. No documentation exists confirming this works. Chrome's internal WebRTC audio mixer handles all tracks as a single stream, so duplicate elements may not produce independent audio outputs. Phase alignment issues could cause constructive/destructive interference rather than clean amplification.

### 9. Firefox / Safari behavior

**Not tested.** Firefox and Safari may handle `createMediaStreamSource` differently and allow GainNode amplification. Could implement browser-specific code paths, but adds complexity and testing burden.

## References

- [Changing Volume on Remote WebRTC Streams in Chrome — TwoSeven Blog](https://blog.twoseven.xyz/chrome-webrtc-remote-volume/)
- [Insertable Streams broken for inbound WebRTC audio — GitHub Issue #1488](https://github.com/webrtc/samples/issues/1488)
- [Chromium Issue #121673 — Hook up Web Audio API with WebRTC](https://issues.chromium.org/issues/40184923)
- [otalk/mediastream-gain (archived)](https://github.com/otalk/mediastream-gain)
- [GainNode — MDN](https://developer.mozilla.org/en-US/docs/Web/API/GainNode)
- [createMediaStreamDestination — MDN](https://developer.mozilla.org/en-US/docs/Web/API/AudioContext/createMediaStreamDestination)
- [HTML5 Getting More Volume from the Web Audio API](https://cwestblog.com/2017/08/17/html5-getting-more-volume-from-the-web-audio-api/)
- [Daily.co updateInputSettings() docs](https://docs.daily.co/reference/daily-js/instance-methods/update-input-settings)
- [Boost YouTube Volume Beyond 100% — DEV Community](https://dev.to/dabalyan/boost-youtube-s-volume-beyond-100-without-an-extension-1mf0)
