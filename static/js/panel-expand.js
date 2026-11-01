// Expand button for the side panels: shows the panel large in the centre of
// the screen (over a dimmed backdrop). The panel element itself is restyled,
// not moved, so 3D viewers, videos and plots keep playing where they were.
// Close with the same button, the backdrop, or Esc.
(function () {
  const backdrop = document.createElement('div');
  backdrop.className = 'panel-backdrop';
  backdrop.hidden = true;
  document.body.appendChild(backdrop);

  let open = null; // the expanded panel, if any

  function setButton(button, expanded) {
    const label = expanded ? 'Close expanded view' : 'Expand panel';
    button.title = expanded ? 'Close' : 'Expand';
    button.setAttribute('aria-label', label);
    button.setAttribute('aria-expanded', expanded ? 'true' : 'false');
    button.querySelector('.icon-expand').classList.toggle('is-hidden', expanded);
    button.querySelector('.icon-collapse').classList.toggle('is-hidden', !expanded);
  }

  function collapse() {
    if (!open) return;
    open.classList.remove('is-expanded');
    setButton(open.querySelector('.js-panel-expand'), false);
    open = null;
    backdrop.hidden = true;
    document.body.classList.remove('has-expanded-panel');
  }

  function expand(panel) {
    collapse();
    open = panel;
    panel.classList.add('is-expanded');
    setButton(panel.querySelector('.js-panel-expand'), true);
    backdrop.hidden = false;
    document.body.classList.add('has-expanded-panel');
  }

  document.querySelectorAll('.js-panel-expand').forEach(function (button) {
    const panel = button.closest('.side-panel');
    button.addEventListener('click', function () {
      if (open === panel) collapse(); else expand(panel);
    });
  });
  backdrop.addEventListener('click', collapse);
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape') collapse();
  });
})();
