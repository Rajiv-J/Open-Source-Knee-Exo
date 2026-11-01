// Squat simulation viewer:
//  - pause/play button for the squat motion
//  - tints each muscle by its activation (0-1) in sync with the animation
//  - live knee moment plot that draws along with the motion
// Data comes from the JSON written by tools/build_squat_model.py (see the
// viewer's data-motion attribute).
(function () {
  const viewer = document.getElementById('squat-viewer');
  if (!viewer) return;

  const RELAXED = [0.11, 0.08, 0.61]; // activation 0
  const ACTIVE = [0.90, 0.01, 0.01];  // activation 1

  // Linear interpolation of series at time t (times ascending).
  function sample(times, series, t) {
    let lo = 0;
    let hi = times.length - 1;
    if (t <= times[0]) return series[0];
    if (t >= times[hi]) return series[hi];
    while (hi - lo > 1) {
      const mid = (lo + hi) >> 1;
      if (times[mid] <= t) lo = mid; else hi = mid;
    }
    const f = (t - times[lo]) / (times[hi] - times[lo]);
    return series[lo] + f * (series[hi] - series[lo]);
  }

  function mix(a) {
    return [0, 1, 2].map(function (i) { return RELAXED[i] + a * (ACTIVE[i] - RELAXED[i]); }).concat(1);
  }

  // Pause/play: freezes the motion (and muscle colours) at the current pose.
  const motionToggle = viewer.closest('.viewer-wrap').querySelector('.js-motion-toggle');
  function showPlaying(playing) {
    const label = playing ? 'Pause motion' : 'Play motion';
    motionToggle.title = label;
    motionToggle.setAttribute('aria-label', label);
    motionToggle.querySelector('.icon-pause').classList.toggle('is-hidden', !playing);
    motionToggle.querySelector('.icon-play').classList.toggle('is-hidden', playing);
  }
  if (motionToggle) {
    motionToggle.addEventListener('click', function () {
      if (viewer.paused) viewer.play(); else viewer.pause();
    });
    viewer.addEventListener('play', function () { showPlaying(true); });
    viewer.addEventListener('pause', function () { showPlaying(false); });
  }

  // Knee moment plot (canvas). The line is drawn from the start of the clip up
  // to the current time, so it grows with the motion and restarts each loop.
  function createPlot(canvas, data) {
    if (!canvas) return { draw: function () {}, needsRedraw: function () { return false; } };
    const Y_MIN = -30, Y_MAX = 90, Y_TICKS = [-20, 0, 20, 40, 60, 80];
    const X_TICKS = [0, 2, 4, 6];
    const PAD = { left: 34, right: 10, top: 8, bottom: 22 };
    const MUTED = '#7a7a7a', GRID = '#e6e6e6', LINE = '#2f6fbf';
    const readout = canvas.parentElement.querySelector('.plot-readout');
    const tEnd = data.times[data.times.length - 1];
    const ctx = canvas.getContext('2d');
    let width = 0, height = 0, dirty = true;

    function resize() {
      const dpr = window.devicePixelRatio || 1;
      width = canvas.clientWidth;
      height = canvas.clientHeight;
      canvas.width = Math.round(width * dpr);
      canvas.height = Math.round(height * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      dirty = true;
    }
    new ResizeObserver(resize).observe(canvas);
    resize();

    const x = function (t) { return PAD.left + (t / tEnd) * (width - PAD.left - PAD.right); };
    const y = function (v) { return PAD.top + (Y_MAX - v) / (Y_MAX - Y_MIN) * (height - PAD.top - PAD.bottom); };

    function draw(t) {
      dirty = false;
      ctx.clearRect(0, 0, width, height);
      ctx.font = '11px "Noto Sans", sans-serif';
      ctx.lineWidth = 1;

      // Grid + y labels
      ctx.textAlign = 'right';
      ctx.textBaseline = 'middle';
      Y_TICKS.forEach(function (v) {
        ctx.strokeStyle = v === 0 ? '#bdbdbd' : GRID;
        ctx.beginPath();
        ctx.moveTo(PAD.left, y(v));
        ctx.lineTo(width - PAD.right, y(v));
        ctx.stroke();
        ctx.fillStyle = MUTED;
        ctx.fillText(String(v), PAD.left - 6, y(v));
      });

      // x labels
      ctx.textAlign = 'center';
      ctx.textBaseline = 'top';
      X_TICKS.forEach(function (s) { ctx.fillText(s + ' s', x(s), height - PAD.bottom + 6); });

      // Moment line up to the current time
      const v = sample(data.times, data.knee_moment, t);
      ctx.strokeStyle = LINE;
      ctx.lineWidth = 2;
      ctx.lineJoin = 'round';
      ctx.beginPath();
      ctx.moveTo(x(data.times[0]), y(data.knee_moment[0]));
      for (let i = 1; i < data.times.length && data.times[i] <= t; i++) {
        ctx.lineTo(x(data.times[i]), y(data.knee_moment[i]));
      }
      ctx.lineTo(x(t), y(v));
      ctx.stroke();

      // Current value marker (8 px dot with a 2 px surface ring)
      ctx.beginPath();
      ctx.arc(x(t), y(v), 4, 0, 2 * Math.PI);
      ctx.fillStyle = LINE;
      ctx.fill();
      ctx.lineWidth = 2;
      ctx.strokeStyle = '#fff';
      ctx.stroke();

      if (readout) readout.textContent = (Math.round(v) || 0) + ' Nm at ' + t.toFixed(1) + ' s';
    }

    return { draw: draw, needsRedraw: function () { return dirty; } };
  }

  const modelLoaded = new Promise(function (resolve) {
    if (viewer.loaded) resolve();
    else viewer.addEventListener('load', resolve, { once: true });
  });
  const motion = fetch(viewer.dataset.motion).then(function (r) { return r.json(); });

  Promise.all([motion, modelLoaded]).then(function (results) {
    const data = results[0];

    // Materials are named "muscle:<name>"; the mirrored left leg (_l) uses the
    // right leg's (_r) activation.
    const muscles = viewer.model.materials
      .filter(function (m) { return m.name.indexOf('muscle:') === 0; })
      .map(function (m) {
        return { material: m, key: m.name.slice(7).replace(/_l$/, '_r') };
      })
      .filter(function (m) { return data.activations[m.key]; });

    const plot = createPlot(document.getElementById('knee-plot'), data);

    let lastTime = -1;
    function tick() {
      const t = viewer.currentTime;
      if (t !== lastTime || plot.needsRedraw()) {
        lastTime = t;
        muscles.forEach(function (m) {
          const a = Math.min(1, Math.max(0, sample(data.times, data.activations[m.key], t)));
          m.material.pbrMetallicRoughness.setBaseColorFactor(mix(a));
        });
        plot.draw(t);
      }
      requestAnimationFrame(tick);
    }
    requestAnimationFrame(tick);
  });
})();
