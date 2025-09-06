// App: face-api.js + Supabase attendance
// Requires: config.js exporting CONFIG = { SUPABASE_URL, SUPABASE_KEY, MATCH_THRESHOLD (0.6 default), MODEL_PATH ('/models') }

const video = document.getElementById("video");
const overlay = document.getElementById("overlay");
const ctx = overlay.getContext("2d");
const btnLoad = document.getElementById("btnLoadStudents");
const btnStart = document.getElementById("btnStart");
const btnStop = document.getElementById("btnStop");
const btnExport = document.getElementById("btnExport");
const modelStatusEl = document.getElementById("modelStatus");
const studentsCountEl = document.getElementById("studentsCount");
const presentCountEl = document.getElementById("presentCount");
const lastMatchEl = document.getElementById("lastMatch");
const presentTableBody = document.querySelector("#presentTable tbody");

const MATCH_THRESHOLD =
  window.CONFIG && window.CONFIG.MATCH_THRESHOLD
    ? window.CONFIG.MATCH_THRESHOLD
    : 0.6;
const MODEL_PATH =
  window.CONFIG && window.CONFIG.MODEL_PATH
    ? window.CONFIG.MODEL_PATH
    : "/models";

// Supabase init
let supabase = null;
if (window.CONFIG && window.CONFIG.SUPABASE_URL && window.CONFIG.SUPABASE_KEY) {
  supabase = supabaseJs.createClient(
    window.CONFIG.SUPABASE_URL,
    window.CONFIG.SUPABASE_KEY
  );
} else {
  console.warn("Supabase config missing. Edit config.js");
}

let knownDescriptors = []; // {student_id, full_name, descriptor (Float32Array)}
let present = {}; // student_id -> checkin_time
let scanning = false;
let scanTimer = null;

async function loadModels() {
  modelStatusEl.textContent = "loading...";
  // load networks: tinyFaceDetector and faceRecognitionNet
  await faceapi.nets.tinyFaceDetector.loadFromUri(MODEL_PATH);
  await faceapi.nets.faceLandmark68Net.loadFromUri(MODEL_PATH);
  await faceapi.nets.faceRecognitionNet.loadFromUri(MODEL_PATH);
  modelStatusEl.textContent = "loaded";
}

async function setupCamera() {
  const constraints = {
    video: {
      facingMode: "environment",
      width: { ideal: 640 },
      height: { ideal: 480 },
    },
    audio: false,
  };
  const stream = await navigator.mediaDevices.getUserMedia(constraints);
  video.srcObject = stream;
  await video.play();
  overlay.width = video.videoWidth;
  overlay.height = video.videoHeight;
}

async function loadStudentsFromSupabase() {
  if (!supabase) {
    alert("Supabase not configured in config.js");
    return;
  }
  btnLoad.disabled = true;
  studentsCountEl.textContent = "loading...";
  // expects table 'students' with student_id, full_name, image_url
  const { data, error } = await supabase.from("students").select("*");
  if (error) {
    alert("Supabase error: " + error.message);
    btnLoad.disabled = false;
    return;
  }
  knownDescriptors = [];
  for (const row of data) {
    try {
      const img = await faceapi.fetchImage(row.image_url);
      const detection = await faceapi
        .detectSingleFace(img, new faceapi.TinyFaceDetectorOptions())
        .withFaceLandmarks()
        .withFaceDescriptor();
      if (!detection) {
        console.warn("No face for", row.student_id, row.full_name);
        continue;
      }
      knownDescriptors.push({
        student_id: row.student_id,
        full_name: row.full_name,
        descriptor: detection.descriptor,
      });
    } catch (e) {
      console.warn("Failed load student image", row, e);
    }
  }
  studentsCountEl.textContent = knownDescriptors.length;
  btnLoad.disabled = false;
  btnStart.disabled = knownDescriptors.length === 0;
  alert("Loaded " + knownDescriptors.length + " student face encodings.");
}

function findBestMatch(descriptor) {
  if (knownDescriptors.length === 0) return null;
  let best = { idx: -1, dist: Infinity };
  for (let i = 0; i < knownDescriptors.length; i++) {
    const kd = knownDescriptors[i].descriptor;
    let sum = 0;
    for (let j = 0; j < kd.length; j++) {
      const d = kd[j] - descriptor[j];
      sum += d * d;
    }
    const dist = Math.sqrt(sum);
    if (dist < best.dist) {
      best = { idx: i, dist };
    }
  }
  if (best.dist <= MATCH_THRESHOLD)
    return { match: knownDescriptors[best.idx], distance: best.dist };
  return null;
}

async function scanOnce() {
  if (!scanning) return;
  const options = new faceapi.TinyFaceDetectorOptions({
    inputSize: 256,
    scoreThreshold: 0.5,
  });
  const results = await faceapi
    .detectAllFaces(video, options)
    .withFaceLandmarks()
    .withFaceDescriptors();
  ctx.clearRect(0, 0, overlay.width, overlay.height);
  if (!results || results.length === 0) {
    lastMatchEl.textContent = "No faces";
    return;
  }
  for (const r of results) {
    const box = r.detection.box;
    ctx.strokeStyle = "#22c55e";
    ctx.lineWidth = 2;
    ctx.strokeRect(box.x, box.y, box.width, box.height);
    const match = findBestMatch(r.descriptor);
    if (match) {
      const sid = match.match.student_id;
      const name = match.match.full_name;
      const now = new Date().toISOString();
      if (!present[sid]) {
        present[sid] = now;
        // insert into supabase attendance table if configured
        if (supabase) {
          supabase
            .from("attendance")
            .insert([{ student_id: sid, full_name: name, checkin_time: now }])
            .then((res) => {})
            .catch((e) => console.warn(e));
        }
        refreshPresentTable();
      }
      lastMatchEl.textContent = `${name} (${sid}) — dist ${match.distance.toFixed(
        3
      )}`;
      ctx.fillStyle = "#22c55e";
      ctx.font = "16px sans-serif";
      ctx.fillText(name, box.x + 4, box.y + 18);
    } else {
      lastMatchEl.textContent = `Unknown (${results.length})`;
      ctx.fillStyle = "#ef4444";
      ctx.font = "16px sans-serif";
      ctx.fillText("Unknown", box.x + 4, box.y + 18);
    }
  }
}

function refreshPresentTable() {
  presentCountEl.textContent = Object.keys(present).length;
  presentTableBody.innerHTML = "";
  Object.entries(present).forEach(([sid, time]) => {
    const kd = knownDescriptors.find((k) => k.student_id === sid);
    const name = kd ? kd.full_name : "";
    const tr = document.createElement("tr");
    tr.innerHTML = `<td>${sid}</td><td>${name}</td><td>${time}</td>`;
    presentTableBody.appendChild(tr);
  });
  btnExport.disabled = Object.keys(present).length === 0;
}

function startScanning() {
  scanning = true;
  btnStart.disabled = true;
  btnStop.disabled = false;
  scanTimer = setInterval(scanOnce, 900);
}

function stopScanning() {
  scanning = false;
  btnStart.disabled = false;
  btnStop.disabled = true;
  if (scanTimer) {
    clearInterval(scanTimer);
    scanTimer = null;
  }
}

async function exportCSV() {
  // If using Supabase, you can also query attendance table and export that
  const rows = Object.entries(present).map(([sid, time]) => {
    const kd = knownDescriptors.find((k) => k.student_id === sid);
    return {
      student_id: sid,
      full_name: kd ? kd.full_name : "",
      checkin_time: time,
    };
  });
  let csv =
    "student_id,full_name,checkin_time\n" +
    rows
      .map((r) => `${r.student_id},"${r.full_name}",${r.checkin_time}`)
      .join("\\n");
  const blob = new Blob([csv], { type: "text/csv" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = "attendance.csv";
  a.click();
}

btnLoad.addEventListener("click", loadStudentsFromSupabase);
btnStart.addEventListener("click", startScanning);
btnStop.addEventListener("click", stopScanning);
btnExport.addEventListener("click", exportCSV);

(async function init() {
  try {
    await loadModels();
    await setupCamera();
  } catch (e) {
    alert(
      "Initialization error: " + e.message + "\\nSee README for model setup."
    );
  }
})();
