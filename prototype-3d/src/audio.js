// Train ambience follows the speed; small effects are synthesised on the fly.
export function createAudio() {
  let ctx, master, rail, railGain, noise, enabled = true;

  async function start() {
    if (ctx) { if (ctx.state === 'suspended') await ctx.resume(); return; }
    ctx = new AudioContext();
    master = ctx.createGain(); master.gain.value = .9; master.connect(ctx.destination);
    noise = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
    const data = noise.getChannelData(0);
    let last = 0;
    for (let i = 0; i < data.length; i++) { last = (last + .1 * (Math.random() * 2 - 1)) / 1.1; data[i] = last * 3; }
    railGain = ctx.createGain(); railGain.gain.value = 0; railGain.connect(master);
    try {
      const response = await fetch('audio/rail.mp3');
      const buffer = await ctx.decodeAudioData(await response.arrayBuffer());
      rail = ctx.createBufferSource(); rail.buffer = buffer; rail.loop = true;
      rail.connect(railGain); rail.start();
    } catch (error) { console.warn('Rail ambience unavailable', error); }
  }

  function tone(freq, length, gain, delay = 0, type = 'sine') {
    if (!ctx || !enabled) return;
    const t = ctx.currentTime + delay, o = ctx.createOscillator(), g = ctx.createGain();
    o.type = type; o.frequency.value = freq;
    g.gain.setValueAtTime(.0001, t); g.gain.exponentialRampToValueAtTime(gain, t + .006);
    g.gain.exponentialRampToValueAtTime(.0001, t + length);
    o.connect(g).connect(master); o.start(t); o.stop(t + length + .02);
  }
  function hiss(freq, q, length, gain, delay = 0) {
    if (!ctx || !enabled) return;
    const t = ctx.currentTime + delay, s = ctx.createBufferSource(), f = ctx.createBiquadFilter(), g = ctx.createGain();
    s.buffer = noise; f.type = 'bandpass'; f.frequency.value = freq; f.Q.value = q;
    g.gain.setValueAtTime(.0001, t); g.gain.exponentialRampToValueAtTime(gain, t + length * .2);
    g.gain.exponentialRampToValueAtTime(.0001, t + length);
    s.connect(f).connect(g).connect(master); s.start(t, Math.random()); s.stop(t + length + .05);
  }

  return {
    start,
    setEnabled(on) { enabled = on; if (master) master.gain.setTargetAtTime(on ? .9 : 0, ctx.currentTime, .1); },
    get enabled() { return enabled; },
    speed(f) {
      if (!ctx) return;
      if (rail) rail.playbackRate.setTargetAtTime(.62 + .38 * f, ctx.currentTime, .3);
      railGain.gain.setTargetAtTime(f < .01 ? 0 : .12 + .5 * f, ctx.currentTime, .4);
    },
    // Two wheels of a bogie crossing a rail joint: "ta-tan".
    joint(f, gap) {
      const g = .05 + .12 * f;
      tone(70, .12, g, 0, 'triangle'); hiss(900, 1, .06, g * .5);
      tone(64, .12, g, gap, 'triangle'); hiss(800, 1, .06, g * .5, gap);
    },
    chime() { tone(784, 1.2, .1); tone(659, 1.4, .1, .42); tone(523, 1.9, .1, .84); },
    door() { hiss(500, .5, 1.3, .22); tone(60, .3, .2, 1.15, 'triangle'); },
    step(surface) {
      if (surface === 'wood') { tone(90, .1, .12, 0, 'triangle'); hiss(1600, 1.5, .05, .05); }
      else { tone(140, .06, .06, 0, 'triangle'); hiss(3200, 1.6, .05, .06); }
    },
    sit() { hiss(300, .7, .35, .12); },
  };
}
