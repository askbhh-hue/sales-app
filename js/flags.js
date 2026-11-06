/* Feature flags — default OFF for safe rollout.
   Override only from the browser console for emergencies:
   FS_FLAG_SET('useCloud', true) then refresh.
   No build step required. */
(function () {
  'use strict';

  var DEFAULTS = {
    useCloud: false,
    dualWrite: false,
    useAiGateway: false,
    useVisionServer: false,
    useGeoEngine: false,
    useProactive: false,
    useTelegram: false,
    googleMaps: false
  };

  var overrides = {};
  try {
    var raw = localStorage.getItem('fs_flags');
    if (raw) overrides = JSON.parse(raw) || {};
  } catch (_) {}

  var flags = {};
  Object.keys(DEFAULTS).forEach(function (key) {
    if (overrides[key] === true) flags[key] = true;
    else if (overrides[key] === false) flags[key] = false;
    else flags[key] = DEFAULTS[key];
  });

  window.FS_FLAGS = Object.freeze(flags);

  window.FS_FLAG = function (name) {
    return !!window.FS_FLAGS[name];
  };

  window.FS_FLAG_SET = function (name, value) {
    try {
      var current = JSON.parse(localStorage.getItem('fs_flags') || '{}') || {};
      current[name] = !!value;
      localStorage.setItem('fs_flags', JSON.stringify(current));
      location.reload();
    } catch (_) {
      alert('تعذر حفظ الإعداد. جرّب من متصفح تاني.');
    }
  };
})();
