// "Copy" button for the BibTeX block.
(function () {
  const button = document.querySelector('.js-copy-bibtex');
  const entry = document.getElementById('bibtex-entry');
  if (!button || !entry) return;
  const label = button.querySelector('.copy-label');

  function flash(text) {
    label.textContent = text;
    setTimeout(function () { label.textContent = 'Copy'; }, 1800);
  }

  button.addEventListener('click', function () {
    const text = entry.textContent;
    if (navigator.clipboard && window.isSecureContext) {
      navigator.clipboard.writeText(text).then(function () { flash('Copied!'); },
        function () { flash('Press Ctrl+C'); });
    } else {
      // Fallback: select the text so the visitor can copy it manually.
      const range = document.createRange();
      range.selectNodeContents(entry);
      const sel = window.getSelection();
      sel.removeAllRanges();
      sel.addRange(range);
      flash(document.execCommand('copy') ? 'Copied!' : 'Press Ctrl+C');
    }
  });
})();
