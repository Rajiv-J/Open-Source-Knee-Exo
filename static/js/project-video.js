// Project video controls: play/pause, mute/unmute, captions on/off and a larger player.
// The video always starts muted, with captions on (drawn in our own box above the buttons). The larger player is the same
// element lifted into a centred view (over a dimmed backdrop), so playback never
// restarts. Close it with the same button, the backdrop, or Esc.
(function () {
  const player = document.querySelector('.project-player');
  if (!player) return;
  const video = player.querySelector('.project-video');
  const playBtn = player.querySelector('.js-pv-play');
  const muteBtn = player.querySelector('.js-pv-mute');
  const ccBtn = player.querySelector('.js-pv-captions');
  const expandBtn = player.querySelector('.js-pv-expand');

  function setLabel(button, label) {
    button.title = label;
    button.setAttribute('aria-label', label);
  }
  // two-icon buttons: show icons[0] when on, icons[1] when off
  function setButton(button, on, labels, icons) {
    setLabel(button, on ? labels[0] : labels[1]);
    button.querySelector(icons[0]).classList.toggle('is-hidden', !on);
    button.querySelector(icons[1]).classList.toggle('is-hidden', on);
  }
  const showPlaying = () => setButton(playBtn, !video.paused, ['Pause video', 'Play video'], ['.icon-pause', '.icon-play']);
  const showMuted = () => setButton(muteBtn, video.muted, ['Unmute', 'Mute'], ['.icon-muted', '.icon-sound']);

  // always start muted
  video.muted = true;
  video.defaultMuted = true;
  showMuted();

  playBtn.addEventListener('click', function () { if (video.paused) video.play(); else video.pause(); });
  muteBtn.addEventListener('click', function () { video.muted = !video.muted; });
  video.addEventListener('play', showPlaying);
  video.addEventListener('pause', showPlaying);
  video.addEventListener('volumechange', showMuted);
  showPlaying();

  // captions: on by default. The track stays 'hidden' (the browser does not draw
  // it); the current cue's text is shown in .project-captions instead.
  const box = player.querySelector('.project-captions');
  const track = video.textTracks[0];
  let captionsOn = true;
  function drawCue() {
    const cue = track && track.activeCues && track.activeCues[0];
    box.textContent = captionsOn && cue ? cue.text : '';
  }
  function setCaptions(on) {
    captionsOn = on;
    ccBtn.classList.toggle('is-off', !on);
    ccBtn.setAttribute('aria-pressed', on ? 'true' : 'false');
    setLabel(ccBtn, on ? 'Hide captions' : 'Show captions');
    drawCue();
  }
  if (track) {
    track.mode = 'hidden';
    track.addEventListener('cuechange', drawCue);
  }
  ccBtn.addEventListener('click', function () { setCaptions(!captionsOn); });
  setCaptions(true);

  // larger player
  const backdrop = document.createElement('div');
  backdrop.className = 'panel-backdrop';
  backdrop.hidden = true;
  document.body.appendChild(backdrop);

  function setExpanded(on) {
    player.classList.toggle('is-expanded', on);
    backdrop.hidden = !on;
    document.body.classList.toggle('has-expanded-panel', on);
    expandBtn.setAttribute('aria-expanded', on ? 'true' : 'false');
    setButton(expandBtn, !on, ['Open larger player', 'Close larger player'], ['.icon-expand', '.icon-collapse']);
  }
  expandBtn.addEventListener('click', function () { setExpanded(!player.classList.contains('is-expanded')); });
  backdrop.addEventListener('click', function () { setExpanded(false); });
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' && player.classList.contains('is-expanded')) setExpanded(false);
  });
})();
