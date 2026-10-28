(function () {
  var words = ['와우', '디테일', '손끝', '끝판왕'];
  var canvas = document.getElementById('c');
  var engine = ParticleText(canvas, { words: words, accent: '#e5482d', autoAdvance: 7000, centerY: 0.5 });
  var dotsBox = document.querySelector('.type-word');
  var form = document.querySelector('.type-form');
  var input = form.querySelector('input');

  words.forEach(function () { dotsBox.appendChild(document.createElement('i')); });
  var dots = dotsBox.querySelectorAll('i');

  function mark(text) {
    var idx = words.indexOf(text);
    for (var i = 0; i < dots.length; i++) dots[i].classList.toggle('is-on', i === idx);
  }

  engine.on('change', mark);
  engine.on('tap', function () { engine.setAutoAdvance(7000); engine.next(); });

  form.addEventListener('submit', function (e) {
    e.preventDefault();
    var value = input.value.trim().slice(0, 10);
    if (!value) return;
    Lab.dismissHint();
    engine.setAutoAdvance(0);
    engine.setText(value);
    input.value = '';
    input.blur();
  });
})();
