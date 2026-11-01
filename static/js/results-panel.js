// Results panel: experiment video with a live plot underneath. Tabs switch the
// plot between knee angle and torque (biological moment + exo torque). The
// plot follows video.currentTime, so it pauses and loops with the video.
(function () {
  const video = document.getElementById('trial-video');
  if (!video) return;
  const panel = video.closest('.side-panel');
  const canvas = document.getElementById('trial-plot');
  const title = panel.querySelector('.plot-title');
  const legend = panel.querySelector('.plot-legend');
  const readout = panel.querySelector('.plot-readout');
  const toggle = panel.querySelector('.js-video-toggle');
  const tabs = panel.querySelectorAll('.plot-tabs a');

  // Pause/play
  function showPlaying(playing) {
    const label = playing ? 'Pause video' : 'Play video';
    toggle.title = label;
    toggle.setAttribute('aria-label', label);
    toggle.querySelector('.icon-pause').classList.toggle('is-hidden', !playing);
    toggle.querySelector('.icon-play').classList.toggle('is-hidden', playing);
  }
  toggle.addEventListener('click', function () {
    if (video.paused) video.play(); else video.pause();
  });
  video.addEventListener('play', function () { showPlaying(true); });
  video.addEventListener('pause', function () { showPlaying(false); });

  fetch(video.dataset.motion).then(function (r) { return r.json(); }).then(function (data) {
    const views = {
      angle: {
        title: 'Right knee angle (deg, flexion −)',
        legend: false,
        config: {
          times: data.times,
          series: [{ values: data.knee_angle, color: '#2a78d6', label: 'Angle' }],
          yMin: -130, yMax: 10, yTicks: [-120, -90, -60, -30, 0], xTicks: [0, 3, 6, 9, 12],
          unit: 'deg', readout: readout
        }
      },
      torque: {
        title: 'Right knee torque (Nm, extension +)',
        legend: true,
        config: {
          times: data.times,
          series: [
            { values: data.bio_moment, color: '#2a78d6', label: 'Biological' },
            { values: data.exo_torque, color: '#eb6834', dash: [6, 4], label: 'Exo' }
          ],
          yMin: -20, yMax: 100, yTicks: [0, 25, 50, 75, 100], xTicks: [0, 3, 6, 9, 12],
          unit: 'Nm', readout: readout
        }
      }
    };

    const plot = window.MotionPlot.create(canvas, views.angle.config);

    function show(name) {
      const view = views[name];
      tabs.forEach(function (a) {
        const on = a.dataset.plot === name;
        a.parentElement.classList.toggle('is-active', on);
        a.setAttribute('aria-selected', on ? 'true' : 'false');
      });
      title.textContent = view.title;
      legend.classList.toggle('is-hidden', !view.legend);
      plot.setConfig(view.config);
    }
    tabs.forEach(function (a) {
      a.addEventListener('click', function (e) { e.preventDefault(); show(a.dataset.plot); });
    });

    let lastTime = -1;
    function tick() {
      const t = video.currentTime;
      if (t !== lastTime || plot.needsRedraw()) {
        lastTime = t;
        plot.draw(t);
      }
      requestAnimationFrame(tick);
    }
    requestAnimationFrame(tick);
  });
})();
