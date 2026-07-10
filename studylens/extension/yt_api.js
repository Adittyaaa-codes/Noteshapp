(function() {
  try {
    const player = document.getElementById('movie_player') || document.querySelector('ytd-player').getPlayer();
    if (player && typeof player.getPlayerResponse === 'function') {
      const response = player.getPlayerResponse();
      window.postMessage({ type: 'YT_STUDYLENS_RESPONSE', payload: response }, '*');
    }
  } catch (e) {
    window.postMessage({ type: 'YT_STUDYLENS_RESPONSE', error: e.message }, '*');
  }
})();
