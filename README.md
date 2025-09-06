# Face Attendance — Frontend-only starter (face-api.js + Supabase)

This project is a frontend-only attendance scanner using **face-api.js** (runs in the browser) and **Supabase** for an online database and storage. No Python backend required.

## What you get in this ZIP

- `index.html` — main UI
- `app.js` — detection, matching, Supabase writes
- `styles.css` — simple styling
- `config.example.js` — rename to `config.js` and fill values
- `README.md` — this file

## How it works (high level)

1. Load face-api.js models (Tiny Face Detector + Landmarks + Recognition) from `MODEL_PATH`.
2. Load student list from Supabase `students` table (columns: `student_id`, `full_name`, `image_url`).
3. For each student image, compute a face descriptor in the browser and keep it in memory.
4. Use the webcam to capture faces, compute descriptor, compare to known descriptors.
5. When a match is found (distance <= `MATCH_THRESHOLD`), mark present and write to Supabase `attendance` table.

## Supabase setup (quick)

1. Create a free project on https://supabase.com
2. Create table `students` with columns:
   - `student_id` (text, primary key)
   - `full_name` (text)
   - `image_url` (text) — public URL or Supabase storage public link
3. Create table `attendance` with columns:
   - `id` uuid default gen_random_uuid()
   - `student_id` text
   - `full_name` text
   - `checkin_time` timestamptz
4. Upload student images to Supabase Storage (or use any public image host) and populate `students` rows accordingly.
5. Add Row Level Security (RLS) policy to allow the anon key to insert into `attendance` while restricting other access. See Supabase docs for RLS policies.

## Models (face-api.js)

This project expects the face-api.js model files to be available at `MODEL_PATH` (default `/models`). You can download the models from:
https://github.com/justadudewhohacks/face-api.js-models

Copy the `tiny_face_detector_model-*.bin`, `face_landmark_68_model-*.bin`, and `face_recognition_model-*.bin` plus their `.json` files into `frontend/models` (or host them on a static server and set `MODEL_PATH` accordingly).

## Security note

Storing Supabase anon key in client-side JS exposes it publicly. Configure Row Level Security (RLS) in Supabase to limit what the anon key can do (e.g., only allow inserts into attendance, and only from certain origins). For production, consider a lightweight server/proxy to keep secrets safe.

## Run locally (development)

1. Rename `config.example.js` → `config.js` and fill your Supabase project URL and anon key.
2. Download face-api.js models into `models/` or host them and set `MODEL_PATH`.
3. Serve this folder with a static server (to allow camera on some phones, use HTTPS or `localhost`):
   ```bash
   # from this folder
   python -m http.server 5500
   ```
4. Open: http://localhost:5500

## Notes & customization

- `MATCH_THRESHOLD` default is 0.6 (adjust for stricter/looser matching).
- This approach runs recognition **in the browser** — good for privacy and avoids server costs, but model download is required.
- If you want the matching to happen server-side (so you don't expose student images/descriptors to clients), use a server API instead.

---

If you want I can also build a small demo GitHub repo and add step-by-step deployment notes for hosting the front-end (GitHub Pages) and creating a Supabase project.
