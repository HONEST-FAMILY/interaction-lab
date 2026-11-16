rec_smooth — deterministic, frame-stepped website interaction videos
=====================================================================

Why: real-time capture of headless Chrome (CDP screencast, Playwright recordVideo) drops and repeats
frames. rec_smooth.py never records in real time. It owns the page clock and renders one frame per step:

  per frame k (T = (k + 0.5) * 1000/fps virtual ms):
    1. send this frame's pointer input (CDP Input.dispatchMouseEvent / dispatchTouchEvent)
    2. window.scrollTo(planned y, rounded to the device-pixel grid)
    3. wait 2 native frames + 1 task  -> rAF-aligned input, scroll events, IntersectionObserver callbacks land
    4. advance virtual time to T: due setTimeout/setInterval (in order), then exactly ONE batch of
       requestAnimationFrame callbacks with timestamp T, then every CSS transition / CSS animation /
       Web Animation gets currentTime = (T - its start)   [document timeline is frozen with
       CDP Animation.setPlaybackRate(0) before navigation, so nothing advances on the wall clock]
    5. Page.captureScreenshot (PNG, device pixels) -> frames/f_00000.png

  Date, performance.now, setTimeout/Interval, requestAnimationFrame, requestIdleCallback and Math.random
  (seeded) are replaced by an init script before any page script runs. Scroll-driven animations
  (animation-timeline: scroll()) are left alone. Playwright's page.clock is NOT used: it fires rAF on a
  16 ms grid (62.5 Hz), which beats against 60/30 fps video and makes rAF-driven canvas code stutter.
  The first warm-up tick is half a 60 Hz step (phase_ms 8.33) so fixed-step accumulators (acc += dt*60) sit mid-phase and
  always run the same number of physics steps per video frame.

  Pages are prepared first: networkidle, optional pre-scroll through the page + reload (warm cache),
  native lazy images switched to eager, every <img> loaded and decode()d, document.fonts.ready.
  If any image is broken or the plan's ready_js is not truthy, the page is reloaded (load_retries) and
  the run aborts instead of recording a half-loaded page (the host had intermittent TLS errors on 11/16).
  A soft white ring (pointer indicator, 28 px) is injected and follows the pointer while an interaction
  is happening; it shrinks while pressed and fades out when the pointer leaves.

Requirements: Python 3.12, playwright (python), numpy, Pillow, installed Chrome, ffmpeg/ffprobe
(C:/Users/ssa41/bin or PATH, or env FFMPEG). On this PC every browser run MUST go through the shared
queue: python C:/project/interaction-lab/tools/web/one.py <command ...>   (never launch Chrome directly).
Run steps one after another (no parallel jobs).

Reproduce the maek2 videos (from C:/project/_issue2009/v6)
---------------------------------------------------------
  set T=C:/project/_issue2009/v6/tools   W=C:/project/_issue2009/v6/work   V=C:/project/_issue2009/v6/video

  1) record (frames + timeline.json)
     python C:/project/interaction-lab/tools/web/one.py python -I %T%/rec_smooth.py %T%/plan_maek2_hero.json --out %W%/hero
     python C:/project/interaction-lab/tools/web/one.py python -I %T%/rec_smooth.py %T%/plan_maek2_reel.json --out %W%/reel

  2) smoothness proof (frames and the delivered mp4)
     python -I %T%/smooth_check.py --timeline %W%/hero/timeline.json --frames %W%/hero/frames --video %V%/maek2_hero_1080p60.mp4 --top 90 --out %W%/hero_check.json
     python -I %T%/smooth_check.py --timeline %W%/reel/timeline.json --frames %W%/reel/frames --video %V%/maek2_reel_1080x1920.mp4 --top 70 --bottom 64 --out %W%/reel_check.json

  3) encode
     python -I %T%/encode.py hero  --frames %W%/hero/frames --fps 60 --timeline %W%/hero/timeline.json --out %V%/maek2_hero_1080p60.mp4 --max-mb 12 --crf 22 --poster %V%/maek2_hero_poster.jpg --poster-frame <frame index or mark name> --poster-max-kb 250
     python -I %T%/encode.py thumb --frames %W%/hero/frames --src-fps 60 --fps 30 --start 0 --dur 6.2 --xfade 0.5 --size 960x540 --out %V%/maek2_thumb_loop.mp4 --max-kb 900 --poster %V%/maek2_thumb_poster.jpg --poster-max-kb 120 --work %W%
     python -I %T%/encode.py reel  --frames %W%/reel/frames --fps 30 --timeline %W%/reel/timeline.json --out %V%/maek2_reel_1080x1920.mp4 --max-mb 40 --crf 17 --cover %V%/maek2_reel_cover.jpg --cover-frame <index>
     python -I %T%/encode.py sheet --video %V%/maek2_hero_1080p60.mp4 --out %V%/sheet_hero.jpg --cols 4 --rows 6 --cell-w 480 --work %W%
     python -I %T%/encode.py sheet --video %V%/maek2_reel_1080x1920.mp4 --out %V%/sheet_reel.jpg --cols 6 --rows 4 --cell-w 270 --work %W%

  encode settings: libx264 High, yuv420p (BT.709, limited range, tagged), +faststart, GOP 2 s,
  CRF searched downward/upward until the file fits the size cap; hero/thumb have no audio, the reel gets
  a silent 48 kHz stereo AAC track of exactly the video length. Thumb loop = every 2nd 60 fps frame,
  2x box-downscaled, last 0.5 s cross-faded (smoothstep) into frame 0 so the loop point is invisible.

Plan file (JSON) for a new site
-------------------------------
  {
    "name": "site_hero", "url": "https://.../index.html",
    "viewport": [1920, 1080], "dpr": 1, "mobile": false, "fps": 60,
    "pointer": "mouse" | "touch",            (default: touch when mobile)
    "hide_css": "selector{display:none!important}",   (injected after load; scroll-behavior is forced to auto)
    "prescroll": true, "eager_images": true, "seed": 7, "phase_ms": 8.33,
    "ready_js": "JS that must be truthy before recording (e.g. app booted)", "load_retries": 4,
    "log_js": "optional JS expression logged per recorded frame (e.g. app state)",
    "block_urls": ["hf-feedback"],                     (requests whose URL contains one of these are aborted)
    "swap_files": {"/img/hero.webp": "C:/.../blur/hero.webp"},   (requests whose URL contains the key get the local file)
    "indicator": {"size": 28, "pressed_scale": 0.82, "fade": 0.18},
    "steps": [ ... ]
  }
  timeline.json meta "routes" = how many requests were blocked / swapped (0 swapped = the keys did not match).
  steps (s = seconds; frames = round(s * fps); positions are CSS px of the viewport, or fractions
  of an element's box when "space" is a selector):
    {"do":"warmup","s":3}                       advance virtual time without recording (page settles)
    {"do":"hold","s":0.8}                       record, nothing driven
    {"do":"scroll_to","y":1200 | "selector":"#id","align":"top|center|bottom","offset":-40,"s":1.6,"easing":"smoothstep"}
    {"do":"scroll_by","dy":600,"s":1.0,"easing":"trap:0.3"}
    {"do":"move","space":"#stage","from":[u,v],"to":[u,v],"s":0.3}        pointer appears/moves (indicator on)
    {"do":"drag","space":"#stage","path":[[u,v],...],"s":2.4,"timing":"segments|arc","easing":"sine","press":true,"release":true}
          segments = each leg eased (natural turn-arounds), length-proportional time; arc = Catmull-Rom, constant speed
    {"do":"down"} {"do":"up"}                   press / release where the pointer is
    {"do":"tap","selector":".btn" | "at":[x,y],"approach":0.15,"press":0.1,"after":0.25}
    {"do":"leave","s":0.25}                     mouse leaves the window, indicator fades out
    {"do":"hide","s":0.25}                      indicator fades out (pointer stays)
    {"do":"eval","js":"..."}                    run JS before this frame's tick
    {"do":"mark","name":"revealed"}             name the next recorded frame (usable as --poster-frame)
  easings: linear, smoothstep, smootherstep, sine, cubic, in, out, trap:<ramp 0..0.5> (constant-speed middle)

  Tips: find the site's smooth-scroll library first (Lenis/GSAP/locomotive). If one is present, drive it
  through its own API with immediate jumps (e.g. lenis.scrollTo(y,{immediate:true}) via an "eval" step or
  hide_css) so each frame lands on the planned position; rec_smooth's virtual rAF already steps its loop.
  Keep 60 fps scroll speed under ~25 px/frame and 30 fps under ~45 device px/frame for a calm look.
  Check timeline.json "pointer_on_time" (input delivered before the tick) and run smooth_check.py.

Children's faces and customer contacts (portfolio videos are public)
-------------------------------------------------------------------
  Blur at the image source, not on the video: download the site's photos, blur the faces, and let the
  recorder serve the blurred files through "swap_files". Every scroll position then shows blurred faces.
    1) model (once): https://media.githubusercontent.com/media/opencv/opencv_zoo/main/models/face_detection_yunet/face_detection_yunet_2023mar.onnx
       needs opencv-python >= 4.8 (cv2.FaceDetectorYN)
    2) python -I face_blur.py <yunet.onnx> <orig_dir> <blur_dir> <check_sheet.jpg> [extra_faces.json]
       detects at 1x/2x/3x, blurs an ellipse 45 % larger than each face, keeps format and transparency,
       writes <blur_dir>/_faces.json and a sheet with red boxes. Look at the sheet: side faces, faces behind
       hands and small faces in group photos are missed; add them by hand in extra_faces.json
       {"card.jpg": [[x1, y1, x2, y2]]} and run again.
    3) plan "swap_files": {"/img/<name>": "<blur_dir>/<name>"} for every photo with a person.
  Phone numbers, e-mails and addresses in the header: hide_css with filter:blur(6px) on that element.
  Do not film the footer or the contact section. Feedback widgets of preview hosts: "block_urls".
  Example: plan_dr2_hero.json (dancingrainbow draft 2, 22 s, 11 photos swapped, header phone blurred).

Outputs of rec_smooth.py: <out>/frames/f_%05d.png, <out>/timeline.json (per frame: virtual time,
planned/actual scrollY, pointer, timers/rAF/animation counts, log_js value; segments; marks).
Frame folders are large (1080p PNG ~1.7 MB each): delete them after encoding if over 2 GB.
