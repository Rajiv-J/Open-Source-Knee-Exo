// Squat simulation viewer: tints each muscle by its activation (0-1) in sync
// with the animation. Data comes from the JSON written by
// tools/build_squat_model.py (see the viewer's data-motion attribute).
(function () {
  const viewer = document.getElementById('squat-viewer');
  if (!viewer) return;

  const RELAXED = [0.45, 0.22, 0.22]; // activation 0
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

    let lastTime = -1;
    function tick() {
      const t = viewer.currentTime;
      if (t !== lastTime) {
        lastTime = t;
        muscles.forEach(function (m) {
          const a = Math.min(1, Math.max(0, sample(data.times, data.activations[m.key], t)));
          m.material.pbrMetallicRoughness.setBaseColorFactor(mix(a));
        });
      }
      requestAnimationFrame(tick);
    }
    requestAnimationFrame(tick);
  });
})();
