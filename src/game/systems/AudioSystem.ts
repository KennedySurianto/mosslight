export class AudioSystem {
  enabled = true;
  private context?: AudioContext;
  celebrate() {
    if (!this.enabled) return;
    try {
      this.context ??= new AudioContext();
      const c = this.context;
      if (c.state === "suspended") void c.resume();
      [523.25, 659.25, 783.99, 1046.5].forEach((frequency, i) => {
        const start = c.currentTime + i * 0.14,
          oscillator = c.createOscillator(),
          gain = c.createGain();
        oscillator.type = "sine";
        oscillator.frequency.setValueAtTime(frequency, start);
        gain.gain.setValueAtTime(0.0001, start);
        gain.gain.exponentialRampToValueAtTime(0.045, start + 0.015);
        gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.5);
        oscillator.connect(gain);
        gain.connect(c.destination);
        oscillator.onended = () => {
          oscillator.disconnect();
          gain.disconnect();
        };
        oscillator.start(start);
        oscillator.stop(start + 0.52);
      });
    } catch {
      /* The visual celebration still works if audio is unavailable. */
    }
  }
  play(
    kind:
      "jump" | "hit" | "break" | "pickup" | "gem" | "plant" | "harvest" | "ui",
  ) {
    if (!this.enabled) return;
    try {
      this.context ??= new AudioContext();
      const c = this.context;
      if (c.state === "suspended") void c.resume();
      const notes = {
        jump: [260, 520],
        hit: [130, 70],
        break: [180, 45],
        pickup: [600, 850],
        gem: [900, 1500],
        plant: [320, 640],
        harvest: [420, 1000],
        ui: [420, 500],
      }[kind];
      const o = c.createOscillator(),
        g = c.createGain();
      o.type = kind === "hit" || kind === "break" ? "triangle" : "sine";
      o.frequency.setValueAtTime(notes[0], c.currentTime);
      o.frequency.exponentialRampToValueAtTime(notes[1], c.currentTime + 0.12);
      g.gain.setValueAtTime(0.0001, c.currentTime);
      g.gain.exponentialRampToValueAtTime(0.045, c.currentTime + 0.008);
      g.gain.exponentialRampToValueAtTime(0.0001, c.currentTime + 0.16);
      o.connect(g);
      g.connect(c.destination);
      o.start();
      o.stop(c.currentTime + 0.17);
    } catch {
      /* Audio is optional when browser autoplay rules disallow it. */
    }
  }
}
