// SongForge frontend. Talks only to our own Netlify Functions (/api/*),
// which hold the Suno API key server-side.

const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

const STORE_KEY = "songforge.jobs.v1";
const PW_KEY = "songforge.pw";
const POLL_MS = 5000;
const MAX_POLL_MINUTES = 10;

const IDEAS = [
  "An upbeat summer pop song about road trips with friends",
  "A melancholic indie ballad about leaving home",
  "Epic orchestral trailer music with a heroic build",
  "A funky disco track about dancing until sunrise",
  "A cozy acoustic love song for a rainy day",
];
const STYLES = ["pop", "lo-fi hip hop", "rock", "EDM", "jazz", "R&B", "country", "cinematic", "acoustic", "synthwave"];
const VARIETY = ["Off", "Normal", "High", "Extra", "Max"];

// Accent colours per genre. Order matters: more specific genres come first.
const GENRES = [
  { key: "synthwave", name: "Synthwave", match: /synth ?wave|retro ?wave|outrun|vaporwave|80s/, c: ["#c026d3", "#0891b2"] },
  { key: "lofi", name: "Lo-fi / Chill", match: /lo-?fi|chill|study|downtempo/, c: ["#7c6cf0", "#3b82f6"] },
  { key: "hiphop", name: "Hip hop / Rap", match: /hip ?-?hop|rap|trap|drill|boom ?bap|grime/, c: ["#ea7a0c", "#dc2626"] },
  { key: "rnb", name: "R&B / Soul", match: /r ?& ?b|rnb|soul|motown/, c: ["#9333ea", "#db2777"] },
  { key: "metal", name: "Metal / Punk", match: /metal|punk|hardcore|grunge|thrash|emo\b/, c: ["#b91c1c", "#44403c"] },
  { key: "rock", name: "Rock", match: /rock|guitar|indie|alternative/, c: ["#dc2626", "#ea580c"] },
  { key: "edm", name: "Electronic / EDM", match: /edm|electro|house|techno|trance|dubstep|dance|drum ?(and|&|n) ?bass|dnb|club/, c: ["#0891b2", "#7c3aed"] },
  { key: "jazz", name: "Jazz / Blues", match: /jazz|blues|swing|bossa|lounge|funk|disco/, c: ["#b45309", "#9f1239"] },
  { key: "country", name: "Country / Folk", match: /country|folk|acoustic|bluegrass|americana|singer-?songwriter/, c: ["#b7791f", "#4d7c0f"] },
  { key: "reggae", name: "Reggae / Afro", match: /reggae|dancehall|\bska\b|\bdub\b|afro|amapiano/, c: ["#15803d", "#ca8a04"] },
  { key: "latin", name: "Latin", match: /latin|reggaeton|salsa|bachata|cumbia|samba|flamenco/, c: ["#e11d48", "#d97706"] },
  { key: "cinematic", name: "Cinematic / Classical", match: /cinematic|orchestral|classical|epic|score|soundtrack|piano|ambient|choir/, c: ["#4f46e5", "#0284c7"] },
  { key: "kpop", name: "K-pop / J-pop", match: /k-?pop|j-?pop|anime/, c: ["#ec4899", "#06b6d4"] },
  { key: "pop", name: "Pop", match: /pop/, c: ["#db2777", "#a855f7"] },
];
const DEFAULT_GENRE = { key: "default", name: "Default colours", c: ["#8b5cf6", "#ec4899"] };

/** Picks the genre whose keyword appears earliest in the text. */
function detectGenre(text) {
  const t = (text || "").toLowerCase();
  let best = null;
  let bestIdx = Infinity;
  for (const g of GENRES) {
    const m = t.match(g.match);
    if (m && m.index < bestIdx) {
      best = g;
      bestIdx = m.index;
    }
  }
  return best || DEFAULT_GENRE;
}
const genreByKey = (key) => GENRES.find((g) => g.key === key) || DEFAULT_GENRE;

function applyGenre() {
  // With no style typed, simple mode falls back to the song description.
  const text = $("#style").value || (mode === "simple" ? $("#prompt").value : "");
  const g = detectGenre(text);
  const root = document.documentElement.style;
  root.setProperty("--accent", g.c[0]);
  root.setProperty("--accent2", g.c[1]);
  $("#genreName").textContent = g === DEFAULT_GENRE ? "Default colours" : `${g.name} colours`;
  return g;
}

/* ---------------- theme ---------------- */
const THEME_KEY = "songforge.theme";
function getTheme() {
  try {
    const t = localStorage.getItem(THEME_KEY);
    return t === "light" || t === "dark" ? t : "system";
  } catch {
    return "system";
  }
}
function setTheme(choice) {
  if (choice === "system") delete document.documentElement.dataset.theme;
  else document.documentElement.dataset.theme = choice;
  try {
    localStorage.setItem(THEME_KEY, choice);
  } catch {
    /* ignore */
  }
  $$("[data-theme-choice]").forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.themeChoice === choice)));
}

const STATUS_TEXT = {
  PENDING: "Queued",
  TEXT_SUCCESS: "Writing lyrics",
  FIRST_SUCCESS: "First track ready",
  SUCCESS: "Done",
  CREATE_TASK_FAILED: "Failed",
  GENERATE_AUDIO_FAILED: "Failed",
  CALLBACK_EXCEPTION: "Failed",
  SENSITIVE_WORD_ERROR: "Blocked",
};
const STATUS_PROGRESS = { PENDING: 15, TEXT_SUCCESS: 40, FIRST_SUCCESS: 75, SUCCESS: 100 };
const FAILED = new Set(["CREATE_TASK_FAILED", "GENERATE_AUDIO_FAILED", "CALLBACK_EXCEPTION", "SENSITIVE_WORD_ERROR"]);

let mode = "simple";
let jobs = loadJobs();
const pollers = new Map();

/* ---------------- storage ---------------- */
function loadJobs() {
  try {
    return JSON.parse(localStorage.getItem(STORE_KEY)) || [];
  } catch {
    return [];
  }
}
function saveJobs() {
  try {
    localStorage.setItem(STORE_KEY, JSON.stringify(jobs.slice(0, 50)));
  } catch {
    /* storage unavailable – history just won't persist */
  }
}
function getPw() {
  try { return sessionStorage.getItem(PW_KEY) || ""; } catch { return ""; }
}
function setPw(v) {
  try { sessionStorage.setItem(PW_KEY, v); } catch { /* ignore */ }
}

/* ---------------- API ---------------- */
async function api(path, { method = "GET", body } = {}) {
  const headers = { "Content-Type": "application/json" };
  const pw = getPw();
  if (pw) headers["x-app-password"] = pw;
  const res = await fetch(`/api/${path}`, { method, headers, body: body ? JSON.stringify(body) : undefined });
  let data = {};
  try { data = await res.json(); } catch { /* non-JSON */ }
  if (res.status === 401 && data.needsPassword) {
    await askPassword(Boolean(pw));
    return api(path, { method, body });
  }
  if (!res.ok) {
    const err = new Error(data.error || `Request failed (HTTP ${res.status})`);
    err.status = res.status;
    throw err;
  }
  return data.data;
}

function askPassword(wasWrong) {
  return new Promise((resolve) => {
    const dlg = $("#pwDialog");
    $("#pwError").hidden = !wasWrong;
    $("#pwInput").value = "";
    dlg.showModal();
    $("#pwForm").onsubmit = () => {
      setPw($("#pwInput").value);
      resolve();
    };
  });
}

async function refreshCredits() {
  try {
    const credits = await api("credits");
    $("#credits").textContent = `Credits: ${credits}`;
  } catch {
    $("#credits").textContent = "Credits: —";
  }
}

/* ---------------- form ---------------- */
function setMode(next) {
  mode = next;
  $$(".tab").forEach((t) => {
    const on = t.dataset.mode === next;
    t.classList.toggle("active", on);
    t.setAttribute("aria-selected", on);
  });
  $$(".simple-only").forEach((el) => (el.hidden = next !== "simple"));
  $$(".custom-only").forEach((el) => (el.hidden = next !== "custom"));
  syncInstrumental();
  applyGenre();
}

function syncInstrumental() {
  const instr = $("#instrumental").checked;
  $("#lyrics").disabled = instr;
  $("#vocalGender").disabled = instr;
  $("#lyrics").placeholder = instr
    ? "Instrumental is on – no lyrics needed."
    : "[Verse]\nCity lights are fading slow...\n\n[Chorus]\n...";
}

function addChips(container, items, onPick, colorize = false) {
  items.forEach((text) => {
    const b = document.createElement("button");
    if (colorize) {
      const g = detectGenre(text);
      b.dataset.c1 = g.key;
      b.style.setProperty("--c1", g.c[0]);
    }
    b.type = "button";
    b.className = "chip";
    b.textContent = text.length > 38 ? text.slice(0, 36) + "…" : text;
    b.title = text;
    b.onclick = () => onPick(text);
    container.appendChild(b);
  });
}

function showFormError(msg) {
  const el = $("#formError");
  el.textContent = msg || "";
  el.hidden = !msg;
}

function collectPayload() {
  const instrumental = $("#instrumental").checked;
  const style = $("#style").value.trim();
  const model = $("#model").value;
  if (mode === "simple") {
    const prompt = $("#prompt").value.trim();
    if (!prompt && !style) throw new Error("Describe the song you want first.");
    return { customMode: false, instrumental, model, prompt, style };
  }
  const lyrics = $("#lyrics").value.trim();
  if (!instrumental && !lyrics) throw new Error("Add some lyrics, or switch on Instrumental.");
  if (instrumental && !style) throw new Error("Add a style for your instrumental.");
  const payload = {
    customMode: true,
    instrumental,
    model,
    title: $("#title").value.trim(),
    style,
    lyrics: instrumental ? "" : lyrics,
    negativeTags: $("#negativeTags").value.trim(),
    vocalGender: instrumental ? "" : $("#vocalGender").value,
    styleWeight: Number($("#styleWeight").value),
    weirdnessConstraint: Number($("#weirdness").value),
    variety: Number($("#variety").value),
  };
  const dur = $("#duration").value;
  if (dur) payload.duration = Number(dur);
  return payload;
}

async function onGenerate(e) {
  e.preventDefault();
  showFormError("");
  let payload;
  try {
    payload = collectPayload();
  } catch (err) {
    showFormError(err.message);
    return;
  }

  const btn = $("#genBtn");
  btn.disabled = true;
  $(".btn-label", btn).textContent = "Starting…";
  try {
    const data = await api("generate", { method: "POST", body: payload });
    const job = {
      taskId: data.taskId,
      label: payload.title || payload.prompt || payload.style || "Untitled song",
      model: payload.model,
      genre: detectGenre(payload.style || payload.prompt).key,
      createdAt: Date.now(),
      status: "PENDING",
      tracks: [],
      error: "",
    };
    jobs.unshift(job);
    saveJobs();
    render();
    startPolling(job.taskId);
  } catch (err) {
    showFormError(err.message);
  } finally {
    btn.disabled = false;
    $(".btn-label", btn).textContent = "Generate song";
  }
}

/* ---------------- lyrics helper ---------------- */
async function onLyricsGenerate() {
  const prompt = $("#lyricsPrompt").value.trim();
  if (!prompt) {
    $("#lyricsPrompt").focus();
    return;
  }
  const btn = $("#lyricsGo");
  btn.disabled = true;
  btn.textContent = "Writing…";
  showFormError("");
  try {
    const { taskId } = await api("lyrics", { method: "POST", body: { prompt } });
    const deadline = Date.now() + 3 * 60 * 1000;
    while (Date.now() < deadline) {
      await sleep(3000);
      const info = await api(`lyrics-status?taskId=${encodeURIComponent(taskId)}`);
      if (info?.status === "SUCCESS") {
        const options = info.response?.data || [];
        const pick = options.find((o) => o.text) || options[0];
        if (!pick?.text) throw new Error("No lyrics were returned.");
        $("#lyrics").value = pick.text;
        if (pick.title && !$("#title").value) $("#title").value = pick.title;
        $("#lyricsHelper").hidden = true;
        return;
      }
      if (info?.status && info.status !== "PENDING") {
        throw new Error(info.errorMessage || `Lyrics generation failed (${info.status}).`);
      }
    }
    throw new Error("Lyrics generation timed out. Please try again.");
  } catch (err) {
    showFormError(err.message);
  } finally {
    btn.disabled = false;
    btn.textContent = "Generate";
  }
}

/* ---------------- polling ---------------- */
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function startPolling(taskId) {
  if (pollers.has(taskId)) return;
  const tick = async () => {
    const job = jobs.find((j) => j.taskId === taskId);
    if (!job) return pollers.delete(taskId);
    try {
      const info = await api(`status?taskId=${encodeURIComponent(taskId)}`);
      const status = info?.status || "PENDING";
      job.status = status;
      const tracks = info?.response?.sunoData || [];
      if (tracks.length) {
        job.tracks = tracks.map((t) => ({
          id: t.id,
          title: t.title,
          tags: t.tags,
          image: t.image_url || t.source_image_url,
          audio: t.audio_url || t.source_audio_url,
          stream: t.stream_audio_url || t.source_stream_audio_url,
          lyrics: t.prompt,
          duration: t.duration,
        }));
      }
      if (FAILED.has(status)) job.error = info.errorMessage || STATUS_TEXT[status];
    } catch (err) {
      job.error = err.message;
    }
    const timedOut = Date.now() - (job.pollStart || job.createdAt) > MAX_POLL_MINUTES * 60 * 1000;
    if (timedOut && job.status !== "SUCCESS" && !FAILED.has(job.status)) {
      job.status = "TIMEOUT";
      job.error = "This is taking longer than expected. Refresh the page later to check again.";
    }
    saveJobs();
    renderJob(job);
    if (job.status === "SUCCESS" || FAILED.has(job.status) || job.status === "TIMEOUT") {
      pollers.delete(taskId);
      if (job.status === "SUCCESS") refreshCredits();
      return;
    }
    pollers.set(taskId, setTimeout(tick, POLL_MS));
  };
  pollers.set(taskId, setTimeout(tick, 1500));
}

/* ---------------- rendering ---------------- */
function render() {
  const list = $("#jobs");
  $("#empty").hidden = jobs.length > 0;
  // remove cards for deleted jobs
  $$(".job", list).forEach((el) => {
    if (!jobs.some((j) => j.taskId === el.dataset.taskId)) el.remove();
  });
  jobs.forEach((job, i) => {
    const el = renderJob(job);
    if (list.children[i] !== el) list.insertBefore(el, list.children[i] || null);
  });
}

function fmtDuration(sec) {
  if (!sec) return "";
  const m = Math.floor(sec / 60);
  const s = Math.round(sec % 60).toString().padStart(2, "0");
  return `${m}:${s}`;
}

function renderJob(job) {
  let el = $(`.job[data-task-id="${CSS.escape(job.taskId)}"]`);
  if (!el) {
    el = $("#jobTpl").content.firstElementChild.cloneNode(true);
    el.dataset.taskId = job.taskId;
    const g = genreByKey(job.genre);
    el.style.setProperty("--accent", g.c[0]);
    el.style.setProperty("--accent2", g.c[1]);
  }
  const done = job.status === "SUCCESS";
  const failed = FAILED.has(job.status) || job.status === "TIMEOUT";

  $(".job-title", el).textContent = job.label;
  $(".job-meta", el).textContent = `${new Date(job.createdAt).toLocaleString()} · ${job.model}`;
  const badge = $(".badge", el);
  badge.textContent = job.status === "TIMEOUT" ? "Still working" : STATUS_TEXT[job.status] || job.status;
  badge.className = "badge" + (done ? " done" : failed ? " failed" : "");
  el.classList.toggle("complete", done || failed);

  const progress = $(".progress", el);
  progress.classList.toggle("indeterminate", !done && !failed);
  $(".bar", progress).style.width = `${STATUS_PROGRESS[job.status] || 10}%`;

  const errEl = $(".job-error", el);
  errEl.textContent = failed ? job.error : "";
  errEl.hidden = !failed;

  const tracksEl = $(".tracks", el);
  job.tracks.forEach((t) => {
    let tr = $(`.track[data-id="${CSS.escape(t.id)}"]`, tracksEl);
    if (!tr) {
      tr = $("#trackTpl").content.firstElementChild.cloneNode(true);
      tr.dataset.id = t.id;
      $(".show-lyrics", tr).onclick = () => {
        const pre = $(".track-lyrics", tr);
        pre.hidden = !pre.hidden;
      };
      tracksEl.appendChild(tr);
    }
    $(".track-title", tr).textContent = [t.title || "Untitled", fmtDuration(t.duration)].filter(Boolean).join(" · ");
    $(".track-tags", tr).textContent = t.tags || "";
    const img = $(".cover", tr);
    // Transparent placeholder lets the genre gradient show when there's no artwork.
    const BLANK = "data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7";
    img.onerror = () => (img.src = BLANK);
    const wanted = t.image || BLANK;
    if (img.getAttribute("src") !== wanted) img.src = wanted;

    const audio = $("audio", tr);
    const src = t.audio || t.stream;
    // Only swap source when not playing, so streaming playback isn't interrupted.
    if (src && audio.dataset.src !== src && (audio.paused || !audio.dataset.src)) {
      audio.src = src;
      audio.dataset.src = src;
    }

    const dl = $(".dl", tr);
    if (t.audio) {
      dl.href = t.audio;
      dl.setAttribute("download", `${(t.title || "song").replace(/[^\w\- ]+/g, "")}.mp3`);
      dl.removeAttribute("aria-disabled");
      dl.textContent = "⬇ Download MP3";
    } else {
      dl.removeAttribute("href");
      dl.setAttribute("aria-disabled", "true");
      dl.textContent = "Finishing…";
    }

    const lyricsBtn = $(".show-lyrics", tr);
    lyricsBtn.hidden = !t.lyrics;
    $(".track-lyrics", tr).textContent = t.lyrics || "";
  });
  return el;
}

/* ---------------- init ---------------- */
function init() {
  $$(".tab").forEach((t) => (t.onclick = () => setMode(t.dataset.mode)));
  $("#instrumental").onchange = syncInstrumental;
  $("#genForm").onsubmit = onGenerate;
  $("#lyricsBtn").onclick = () => {
    $("#lyricsHelper").hidden = !$("#lyricsHelper").hidden;
    if (!$("#lyricsHelper").hidden) $("#lyricsPrompt").focus();
  };
  $("#lyricsGo").onclick = onLyricsGenerate;
  $("#lyricsPrompt").onkeydown = (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      onLyricsGenerate();
    }
  };
  $("#clearBtn").onclick = () => {
    if (!jobs.length || !confirm("Remove all songs from your history?")) return;
    pollers.forEach((t) => clearTimeout(t));
    pollers.clear();
    jobs = [];
    saveJobs();
    render();
  };

  const bindRange = (id, outId, fmt) => {
    const update = () => ($(`#${outId}`).textContent = fmt($(`#${id}`).value));
    $(`#${id}`).oninput = update;
    update();
  };
  bindRange("styleWeight", "styleWeightOut", (v) => Number(v).toFixed(2));
  bindRange("weirdness", "weirdnessOut", (v) => Number(v).toFixed(2));
  bindRange("variety", "varietyOut", (v) => VARIETY[v]);

  addChips($("#ideaChips"), IDEAS, (t) => {
    $("#prompt").value = t;
    applyGenre();
  });
  addChips(
    $("#styleChips"),
    STYLES,
    (t) => {
      const cur = $("#style").value.trim();
      const parts = cur ? cur.split(/\s*,\s*/) : [];
      if (!parts.includes(t)) parts.push(t);
      $("#style").value = parts.join(", ");
      applyGenre();
    },
    true
  );
  $("#style").addEventListener("input", applyGenre);
  $("#prompt").addEventListener("input", applyGenre);

  $$("[data-theme-choice]").forEach((b) => (b.onclick = () => setTheme(b.dataset.themeChoice)));
  setTheme(getTheme());

  setMode("simple");
  render();
  // Resume polling for anything unfinished (e.g. after a page refresh).
  jobs.forEach((j) => {
    if (j.status !== "SUCCESS" && !FAILED.has(j.status)) {
      if (j.status === "TIMEOUT") {
        j.status = "PENDING";
        j.pollStart = Date.now();
      }
      startPolling(j.taskId);
    }
  });

  fetch("/api/config")
    .then((r) => r.json())
    .then(async (cfg) => {
      if (!cfg.keyConfigured) {
        showFormError("Setup needed: add SUNO_API_KEY in your Netlify environment variables, then redeploy.");
        return;
      }
      if (cfg.passwordRequired && !getPw()) await askPassword(false);
      refreshCredits();
    })
    .catch(() => refreshCredits());
}

init();
