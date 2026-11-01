// Shared live plot used by the side panels: draws one or more series from the
// start of a looping clip up to the current time, with a dot at the current
// value, so the line grows with the motion and restarts on each loop.
window.MotionPlot = (function () {
  const MUTED = '#7a7a7a';
  const GRID = '#e6e6e6';
  const ZERO = '#bdbdbd';
  const PAD = { left: 38, right: 10, top: 8, bottom: 22 };

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

  // config: { times, series: [{ values, color, dash, label }], yMin, yMax,
  //           yTicks, xTicks, unit, readout (element, optional) }
  function create(canvas, config) {
    const ctx = canvas.getContext('2d');
    let cfg = config;
    let width = 0;
    let height = 0;
    let dirty = true;

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

    function x(t) {
      const tEnd = cfg.times[cfg.times.length - 1];
      return PAD.left + (t / tEnd) * (width - PAD.left - PAD.right);
    }
    function y(v) {
      return PAD.top + (cfg.yMax - v) / (cfg.yMax - cfg.yMin) * (height - PAD.top - PAD.bottom);
    }

    function draw(t) {
      dirty = false;
      ctx.clearRect(0, 0, width, height);
      ctx.font = '11px "Noto Sans", sans-serif';
      ctx.setLineDash([]);
      ctx.lineWidth = 1;

      // Grid + y labels
      ctx.textAlign = 'right';
      ctx.textBaseline = 'middle';
      cfg.yTicks.forEach(function (v) {
        ctx.strokeStyle = v === 0 ? ZERO : GRID;
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
      cfg.xTicks.forEach(function (s) { ctx.fillText(s + ' s', x(s), height - PAD.bottom + 6); });

      // Series up to the current time
      const now = cfg.series.map(function (s) { return sample(cfg.times, s.values, t); });
      cfg.series.forEach(function (s, k) {
        ctx.strokeStyle = s.color;
        ctx.lineWidth = 2;
        ctx.lineJoin = 'round';
        ctx.setLineDash(s.dash || []);
        ctx.beginPath();
        ctx.moveTo(x(cfg.times[0]), y(s.values[0]));
        for (let i = 1; i < cfg.times.length && cfg.times[i] <= t; i++) {
          ctx.lineTo(x(cfg.times[i]), y(s.values[i]));
        }
        ctx.lineTo(x(t), y(now[k]));
        ctx.stroke();
      });

      // Current-value markers (8 px dot with a 2 px surface ring)
      ctx.setLineDash([]);
      cfg.series.forEach(function (s, k) {
        ctx.beginPath();
        ctx.arc(x(t), y(now[k]), 4, 0, 2 * Math.PI);
        ctx.fillStyle = s.color;
        ctx.fill();
        ctx.lineWidth = 2;
        ctx.strokeStyle = '#fff';
        ctx.stroke();
      });

      if (cfg.readout) {
        const parts = cfg.series.map(function (s, k) {
          const v = Math.round(now[k]) || 0;
          return (cfg.series.length > 1 ? s.label + ' ' : '') + v + ' ' + cfg.unit;
        });
        cfg.readout.textContent = parts.join(' · ') + ' at ' + t.toFixed(1) + ' s';
      }
    }

    return {
      draw: draw,
      needsRedraw: function () { return dirty; },
      setConfig: function (next) { cfg = next; dirty = true; }
    };
  }

  return { create: create, sample: sample };
})();
