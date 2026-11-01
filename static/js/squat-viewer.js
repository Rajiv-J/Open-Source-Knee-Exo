// Squat simulation viewer:
//  - pause/play button for the squat motion
//  - tints each muscle by its activation (0-1) in sync with the animation
//  - live knee moment plot (motion-plot.js) that draws along with the motion
// Data comes from the JSON written by tools/build_squat_model.py (see the
// viewer's data-motion attribute).
(function () {
  const viewer = document.getElementById('squat-viewer');
  if (!viewer) return;

  const RELAXED = [0.11, 0.08, 0.61]; // activation 0
  const ACTIVE = [0.90, 0.01, 0.01];  // activation 1

  const sample = window.MotionPlot.sample;

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

    const canvas = document.getElementById('knee-plot');
    const plot = window.MotionPlot.create(canvas, {
      times: data.times,
      series: [{ values: data.knee_moment, color: '#2a78d6', label: 'Knee moment' }],
      yMin: -30, yMax: 90, yTicks: [-20, 0, 20, 40, 60, 80], xTicks: [0, 2, 4, 6],
      unit: 'Nm', readout: canvas.parentElement.querySelector('.plot-readout')
    });

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
