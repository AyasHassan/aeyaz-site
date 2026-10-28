// Category filters on the Work page
(function () {
  var bar = document.querySelector('.filters');
  var grid = document.getElementById('rows');
  if (!bar || !grid) return;
  var cards = grid.querySelectorAll('.proj');
  bar.addEventListener('click', function (e) {
    var btn = e.target.closest('button[data-filter]');
    if (!btn) return;
    var f = btn.getAttribute('data-filter');
    bar.querySelectorAll('button').forEach(function (b) { b.setAttribute('aria-pressed', b === btn ? 'true' : 'false'); });
    cards.forEach(function (c) {
      var cats = (c.getAttribute('data-cats') || '').split(' ');
      var isArchive = c.hasAttribute('data-archive');
      c.hidden = f === 'all' ? isArchive : cats.indexOf(f) === -1;
    });
  });
})();

// Contact form → Web3Forms (free), with an email fallback
(function () {
  var form = document.getElementById('contact-form');
  if (!form) return;
  var thanks = document.querySelector('.thanks');
  var err = form.querySelector('.form-error');
  form.addEventListener('submit', function (e) {
    e.preventDefault();
    var data = new FormData(form);
    var key = form.getAttribute('data-key');
    if (!key) {
      // No form key set yet: open the visitor's email app instead
      var to = form.getAttribute('data-email');
      var body = data.get('message') + '\n\n— ' + data.get('name') + ' (' + data.get('email') + ')';
      window.location.href = 'mailto:' + to + '?subject=' + encodeURIComponent('Website enquiry from ' + data.get('name')) + '&body=' + encodeURIComponent(body);
      return;
    }
    if (data.get('botcheck')) return;
    var btn = form.querySelector('.send');
    btn.disabled = true; err.hidden = true;
    fetch('https://api.web3forms.com/submit', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({
        access_key: key,
        subject: 'Website enquiry from ' + data.get('name'),
        from_name: 'aeyaz.com',
        name: data.get('name'),
        email: data.get('email'),
        message: data.get('message')
      })
    }).then(function (r) { return r.json(); }).then(function (res) {
      if (res && res.success) { form.hidden = true; thanks.hidden = false; }
      else { err.hidden = false; btn.disabled = false; }
    }).catch(function () { err.hidden = false; btn.disabled = false; });
  });
})();
