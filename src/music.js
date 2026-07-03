// Focus-music controller — streams Creative-Commons / artist-licensed tracks
// from the Audius API (free, no key; app_name identifies the client). Music is
// driven entirely by task state via setActive(); it never plays on its own.
(function () {
  const APP = "TaskPlayer";
  const BASE = "https://api.audius.co"; // official gateway → discovery nodes
  const GENRES = {
    lofi:       { label: "🎧 Lo-Fi",      genre: "Lo-Fi" },
    ambient:    { label: "🌌 Ambient",    genre: "Ambient" },
    classical:  { label: "🎻 Classical",  genre: "Classical" },
    jazz:       { label: "🎷 Jazz",       genre: "Jazz" },
    electronic: { label: "🎹 Electronic", genre: "Electronic" },
  };

  const audio = document.getElementById("audio");
  let tracks = [], idx = 0, loading = false;
  let genre = localStorage.getItem("tp.genre");
  if (!GENRES[genre]) genre = "lofi";
  const st = {
    genre,
    volume: parseFloat(localStorage.getItem("tp.vol") || "0.5"),
    enabled: false, // mirrors "a task is playing"; set by setActive()
  };
  audio.volume = st.volume;
  let onChange = () => {};

  const shuffle = (a) => { for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
  const streamUrl = (t) => `${BASE}/v1/tracks/${t.id}/stream?app_name=${APP}`;

  async function fetchTracks(genreKey) {
    const g = GENRES[genreKey] || GENRES.lofi;
    const map = (arr) => (arr || [])
      .filter((t) => t.is_streamable !== false && !t.is_delete && !t.is_stream_gated && t.duration > 30)
      .map((t) => ({ id: t.id, title: t.title, artist: (t.user && t.user.name) || "Audius" }));
    try {
      let r = await fetch(`${BASE}/v1/tracks/trending?genre=${encodeURIComponent(g.genre)}&app_name=${APP}`);
      let list = r.ok ? map((await r.json()).data) : [];
      if (!list.length) { // fall back to a keyword search if trending is empty
        r = await fetch(`${BASE}/v1/tracks/search?query=${encodeURIComponent(g.genre)}&app_name=${APP}`);
        list = r.ok ? map((await r.json()).data) : [];
      }
      return shuffle(list).slice(0, 50);
    } catch (e) {
      return [];
    }
  }

  function snapshot() {
    const t = tracks[idx];
    return {
      playing: !audio.paused,
      loading,
      genre: st.genre,
      volume: st.volume,
      name: loading ? "finding tracks…" : (t ? `${t.title} — ${t.artist}` : "Focus music"),
    };
  }
  function emit() { onChange(snapshot()); }

  function start() {
    if (!tracks.length) { emit(); return; }
    audio.src = streamUrl(tracks[idx]);
    audio.volume = st.volume;
    audio.play().then(emit).catch(() => { if (idx < tracks.length - 1) { idx++; start(); } else emit(); });
    emit();
  }
  async function ensure() {
    if (tracks.length) return;
    loading = true; emit();
    tracks = await fetchTracks(st.genre); idx = 0; loading = false; emit();
  }

  audio.addEventListener("ended", () => next());
  audio.addEventListener("error", () => { if (tracks.length && idx < tracks.length - 1) { idx++; start(); } });
  function next() { if (!tracks.length) return; idx = (idx + 1) % tracks.length; if (st.enabled) start(); else emit(); }

  window.Music = {
    GENRES, snapshot,
    setOnChange(fn) { onChange = fn; emit(); },
    // Driven by task state: setActive(true) when a task enters work, false on break/stop.
    async setActive(on) {
      st.enabled = on;
      if (on) { await ensure(); if (audio.paused) start(); else emit(); }
      else { if (!audio.paused) audio.pause(); emit(); }
    },
    async play() { await ensure(); if (audio.paused) start(); else emit(); },
    pause() { if (!audio.paused) audio.pause(); emit(); },
    next,
    async setGenre(g) { st.genre = g; localStorage.setItem("tp.genre", g); tracks = []; idx = 0; if (st.enabled) await this.play(); else emit(); },
    // NOTE: no emit() here — re-rendering the widget mid-drag would replace the
    // slider DOM and break dragging. The slider already reflects its own value.
    setVolume(v) { v = parseFloat(v); st.volume = v; localStorage.setItem("tp.vol", String(v)); audio.volume = v; },
  };
})();
