(function(){
  'use strict';

  const ESRI_SHADED_RELIEF_URL = 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Shaded_Relief/MapServer/tile/{z}/{y}/{x}';

  function initEsriShadedReliefLayer(options){
    const map = options && options.map;
    if (!map){
      return null;
    }

    const layer = new ol.layer.Tile({
      source: new ol.source.XYZ({
        url: ESRI_SHADED_RELIEF_URL,
        attributions: 'Tiles © Esri',
        maxZoom: 13,
        crossOrigin: 'anonymous'
      }),
      properties: { title: 'ESRI Shaded Relief', isBasemapOverlay: true },
      opacity: 1
    });

    // Draw this layer with hard-light blending against the satellite layer below.
    layer.on('prerender', function(evt){
      const ctx = evt.context;
      if (ctx && typeof ctx.save === 'function'){
        ctx.save();
        ctx.globalCompositeOperation = 'hard-light';
      }
    });

    layer.on('postrender', function(evt){
      const ctx = evt.context;
      if (ctx && typeof ctx.restore === 'function'){
        ctx.restore();
      }
    });

    layer.setZIndex(1);
    map.addLayer(layer);

    return {
      layer: layer,
      setVisible: function(visible){ layer.setVisible(visible); },
      getVisible: function(){ return layer.getVisible(); }
    };
  }

  window.initEsriShadedReliefLayer = initEsriShadedReliefLayer;
})();
