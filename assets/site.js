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
      // Form not set up yet: tell the visitor instead of opening their email app
      err.hidden = false;
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
        replyto: data.get('email'),
        message: data.get('message')
      })
    }).then(function (r) { return r.json(); }).then(function (res) {
      if (res && res.success) { form.hidden = true; thanks.hidden = false; }
      else { err.hidden = false; btn.disabled = false; }
    }).catch(function () { err.hidden = false; btn.disabled = false; });
  });
})();
