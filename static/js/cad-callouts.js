// Part callouts on the CAD viewer, styled like Figure 1(a): a ring on the part,
// a leader (diagonal, then straight) and a label. Each callout is three
// model-viewer hotspots (anchor, elbow, end) that all lie in a plane parallel
// to the motor's plane (constant x), so the leaders turn with the model.
// Callouts fade in as the outer side of the leg turns toward the camera and
// fade out as it turns away (where the leaders would be seen edge-on). The
// eye button toggles callouts on and off.
(function () {
  // Points are in model coordinates (metres); normal +x = outer side of the leg.
  const CALLOUTS = [
    { label: 'Thigh Cuff', color: 'brown', anchor: [0.1852, 0.58, 0.09], elbow: [0.1852, 0.604, 0.135], end: [0.1852, 0.604, 0.165] },
    { label: 'Low-Level Board', color: 'blue', anchor: [0.2457, 0.5, 0.006], elbow: [0.2457, 0.524, -0.039], end: [0.2457, 0.524, -0.069] },
    { label: 'QDD Actuator', color: 'blue', anchor: [0.2391, 0.37, -0.004], elbow: [0.2391, 0.346, -0.049], end: [0.2391, 0.346, -0.079] },
    { label: 'Shank Cuff', color: 'brown', anchor: [0.1742, 0.29, 0.03], elbow: [0.1742, 0.274, 0.075], end: [0.1742, 0.274, 0.105] },
    { label: 'Adjustable Ankle Bar', color: 'brown', anchor: [0.1794, 0.09, -0.004], elbow: [0.1794, 0.114, -0.049], end: [0.1794, 0.114, -0.079] },
    { label: 'Ankle Cuff', color: 'brown', anchor: [0.1347, 0.05, 0.03], elbow: [0.1347, 0.034, 0.075], end: [0.1347, 0.034, 0.105] }
  ];
  const COLORS = { brown: '#994d00', blue: '#2cbce8' };
  const NS = 'http://www.w3.org/2000/svg';

  const viewer = document.getElementById('cad-viewer');
  if (!viewer) return;
  const wrap = viewer.closest('.viewer-wrap');
  const toggle = wrap.querySelector('.js-callout-toggle');

  function hotspot(name, point) {
    const el = document.createElement('div');
    el.className = 'callout-point';
    el.slot = 'hotspot-' + name;
    el.dataset.position = point.map(function (v) { return v + 'm'; }).join(' ');
    el.dataset.normal = '1 0 0';
    el.dataset.visibilityAttribute = 'visible'; // model-viewer sets data-visible when facing the camera
    viewer.appendChild(el);
    return el;
  }

  const layer = document.createElementNS(NS, 'svg');
  layer.setAttribute('class', 'callout-layer');
  layer.setAttribute('aria-hidden', 'true');
  wrap.appendChild(layer);

  const items = CALLOUTS.map(function (c, i) {
    const color = COLORS[c.color];
    const group = document.createElementNS(NS, 'g');
    const line = document.createElementNS(NS, 'polyline');
    line.setAttribute('stroke', color);
    const ring = document.createElementNS(NS, 'circle');
    ring.setAttribute('r', '5');
    ring.setAttribute('stroke', color);
    group.appendChild(line);
    group.appendChild(ring);
    layer.appendChild(group);

    const label = document.createElement('span');
    label.className = 'callout-label';
    label.textContent = c.label;
    wrap.appendChild(label);

    return {
      a: hotspot('callout-' + i + '-a', c.anchor),
      e: hotspot('callout-' + i + '-e', c.elbow),
      f: hotspot('callout-' + i + '-f', c.end),
      group: group, line: line, ring: ring, label: label
    };
  });

  function centre(el, origin) {
    const r = el.getBoundingClientRect();
    return [r.left + r.width / 2 - origin.left, r.top + r.height / 2 - origin.top];
  }

  // How much the outer side (+x) faces the camera: 0 = edge-on, 1 = straight on.
  function facing() {
    const o = viewer.getCameraOrbit();
    return Math.sin(o.phi) * Math.sin(o.theta);
  }
  const FADE_START = 0.35; // fully hidden below this
  const FADE_RANGE = 0.25; // fully shown above FADE_START + FADE_RANGE

  let enabled = true;
  function tick() {
    if (enabled) {
      const origin = wrap.getBoundingClientRect();
      const fade = Math.min(1, Math.max(0, (facing() - FADE_START) / FADE_RANGE));
      items.forEach(function (it) {
        const visible = it.a.hasAttribute('data-visible') && fade > 0;
        it.group.style.opacity = visible ? fade : 0;
        it.label.style.opacity = visible ? fade : 0;
        const a = centre(it.a, origin), e = centre(it.e, origin), f = centre(it.f, origin);
        it.line.setAttribute('points', a.join(',') + ' ' + e.join(',') + ' ' + f.join(','));
        it.ring.setAttribute('cx', a[0]);
        it.ring.setAttribute('cy', a[1]);
        // Text sits beyond the end of the leader, on the side it points to.
        const toRight = f[0] >= e[0];
        it.label.style.left = f[0] + 'px';
        it.label.style.top = f[1] + 'px';
        it.label.classList.toggle('is-left', !toRight);
      });
    }
    requestAnimationFrame(tick);
  }

  if (toggle) {
    toggle.addEventListener('click', function () {
      enabled = !enabled;
      wrap.classList.toggle('callouts-off', !enabled);
      const label = enabled ? 'Hide part labels' : 'Show part labels';
      toggle.title = label;
      toggle.setAttribute('aria-label', label);
      toggle.querySelector('.icon-eye').classList.toggle('is-hidden', !enabled);
      toggle.querySelector('.icon-eye-off').classList.toggle('is-hidden', enabled);
    });
  }

  customElements.whenDefined('model-viewer').then(function () { requestAnimationFrame(tick); });
})();
