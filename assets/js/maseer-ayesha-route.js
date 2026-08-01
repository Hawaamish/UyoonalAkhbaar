(function(){
  function createPathController({ map, geojsonUrl, color, title }){
    const source = new ol.source.Vector();
    const layer = new ol.layer.Vector({
      source,
      style: createLineStyle(color),
      properties: { title, isPathLayer: true }
    });
    layer.setVisible(false);
    map.addLayer(layer);

    let features = [];
    let animationFrameId = null;
    let pendingAnimationTimeout = null;

    function createLineStyle(colorValue){
      return (featureItem) => new ol.style.Style({
        geometry: getAnimatedGeometry(featureItem, featureItem.get('animationProgress') ?? 1),
        stroke: new ol.style.Stroke({
          color: colorValue,
          width: 4
        })
      });
    }

    function getAnimatedGeometry(featureItem, progress){
      const geometry = featureItem.getGeometry();
      if (!geometry || progress >= 1) return geometry;

      if (geometry.getType() === 'MultiLineString'){
        const partials = geometry.getCoordinates().map((lineCoords) => {
          const lineString = new ol.geom.LineString(lineCoords);
          return getPartialLineString(lineString, progress);
        }).filter(Boolean);

        return partials.length ? new ol.geom.MultiLineString(partials) : geometry;
      }

      if (geometry.getType() === 'LineString'){
        return getPartialLineString(geometry, progress) || geometry;
      }

      return geometry;
    }

    function getPartialLineString(lineString, progress){
      if (!lineString || progress <= 0) return null;

      const coords = lineString.getCoordinates();
      if (coords.length < 2) return lineString;

      let totalLength = 0;
      const segments = [];

      for (let i = 1; i < coords.length; i++) {
        segments.push({ start: coords[i - 1], end: coords[i] });
        totalLength += distance(coords[i - 1], coords[i]);
      }

      if (totalLength <= 0) return lineString;

      const targetLength = totalLength * progress;
      let walked = 0;
      const partial = [coords[0]];

      for (const segment of segments) {
        const segmentLength = distance(segment.start, segment.end);
        if (walked + segmentLength >= targetLength) {
          const ratio = (targetLength - walked) / segmentLength;
          partial.push(interpolate(segment.start, segment.end, ratio));
          break;
        }
        walked += segmentLength;
        partial.push(segment.end);
      }

      return partial.length > 1 ? new ol.geom.LineString(partial) : null;
    }

    function distance(start, end){
      const dx = end[0] - start[0];
      const dy = end[1] - start[1];
      return Math.sqrt(dx * dx + dy * dy);
    }

    function interpolate(start, end, ratio){
      return [
        start[0] + ((end[0] - start[0]) * ratio),
        start[1] + ((end[1] - start[1]) * ratio)
      ];
    }

    function loadGeoJson(){
      fetch(geojsonUrl)
        .then((response) => response.json())
        .then((data) => {
          const format = new ol.format.GeoJSON();
          const parsedFeatures = format.readFeatures(data, {
            featureProjection: map.getView().getProjection()
          });

          if (parsedFeatures.length){
            features = parsedFeatures;
            features.forEach((featureItem) => {
              featureItem.set('animationProgress', 0);
            });
            source.addFeatures(features);
            layer.changed();
          }
        })
        .catch((err) => {
          console.error(`Failed to load ${title}:`, err);
        });
    }

    function clearPendingAnimation(){
      if (pendingAnimationTimeout){
        clearTimeout(pendingAnimationTimeout);
      }
      pendingAnimationTimeout = null;
    }

    function cancelAnimation(){
      if (animationFrameId){
        cancelAnimationFrame(animationFrameId);
      }
      animationFrameId = null;
    }

    function startAnimation(){
      cancelAnimation();
      if (!features.length) return;

      features.forEach((featureItem) => {
        featureItem.set('animationProgress', 0);
      });
      layer.setVisible(true);
      const startTime = performance.now();
      const duration = 1800;

      function tick(now){
        const elapsed = now - startTime;
        const progress = Math.min(1, elapsed / duration);
        const eased = 1 - Math.pow(1 - progress, 3);
        features.forEach((featureItem) => {
          featureItem.set('animationProgress', eased);
        });
        layer.changed();

        if (progress < 1){
          animationFrameId = requestAnimationFrame(tick);
        } else {
          animationFrameId = null;
        }
      }

      animationFrameId = requestAnimationFrame(tick);
    }

    function setVisible(visible, options){
      const delayMs = options && Number.isFinite(options.delayMs) ? options.delayMs : 0;

      clearPendingAnimation();
      if (!visible){
        layer.setVisible(false);
        cancelAnimation();
        if (features.length){
          features.forEach((featureItem) => {
            featureItem.set('animationProgress', 0);
          });
          layer.changed();
        }
        return;
      }

      if (!features.length) return;
      layer.setVisible(false);

      if (delayMs > 0){
        pendingAnimationTimeout = setTimeout(() => {
          pendingAnimationTimeout = null;
          startAnimation();
        }, delayMs);
        return;
      }

      startAnimation();
    }

    function isVisible(){
      return layer.getVisible();
    }

    loadGeoJson();

    return {
      layer,
      setVisible,
      isVisible
    };
  }

  window.initMaseerAyeshaRouteLayer = function({ map }){
    return createPathController({
      map,
      geojsonUrl: '../assets/data/MaseerAyesha.geojson',
      color: '#FB6C00',
      title: 'MaseerAyesha'
    });
  };
})();
