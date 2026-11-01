// Controls for <model-viewer> panels: pause/play auto-rotation and reset view.
// Auto-rotation (where a pause button exists) turns back on when a viewer
// scrolls out of view and returns. "Home" returns to the viewer's starting
// camera-orbit attribute.
(function () {

  function setRotating(viewer, toggle, rotating) {
    viewer.autoRotate = rotating;
    if (!toggle) return;
    const label = rotating ? 'Pause rotation' : 'Resume rotation';
    toggle.title = label;
    toggle.setAttribute('aria-label', label);
    toggle.querySelector('.icon-pause').classList.toggle('is-hidden', !rotating);
    toggle.querySelector('.icon-play').classList.toggle('is-hidden', rotating);
  }

  function resetView(viewer, homeOrbit) {
    // Re-applying the same orbit value is ignored, so clear it first.
    viewer.cameraOrbit = '';
    viewer.cameraTarget = '';
    viewer.fieldOfView = '';
    viewer.updateComplete.then(function () {
      viewer.resetTurntableRotation(0);
      viewer.cameraOrbit = homeOrbit;
      viewer.cameraTarget = 'auto auto auto';
      viewer.fieldOfView = 'auto';
    });
  }

  function init(viewer) {
    const wrap = viewer.closest('.viewer-wrap');
    const toggle = wrap && wrap.querySelector('.js-rotate-toggle');
    const reset = wrap && wrap.querySelector('.js-reset-view');
    const homeOrbit = viewer.getAttribute('camera-orbit') || 'auto auto auto';

    if (toggle) {
      toggle.addEventListener('click', function () {
        setRotating(viewer, toggle, !viewer.autoRotate);
      });
    }
    if (reset) {
      reset.addEventListener('click', function () { resetView(viewer, homeOrbit); });
    }

    // Restart auto-rotation once the viewer has left the screen.
    if (toggle) {
      new IntersectionObserver(function (entries) {
        entries.forEach(function (entry) {
          if (!entry.isIntersecting) setRotating(viewer, toggle, true);
        });
      }).observe(viewer);
    }
  }

  // Wait until the model-viewer component has loaded before wiring controls.
  customElements.whenDefined('model-viewer').then(function () {
    document.querySelectorAll('model-viewer').forEach(init);
  });
})();
