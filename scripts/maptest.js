// Extracted from maptest.html. Existing section comments describe the page's behavior.

// 4. Connect OpenLayers to your working QGIS Server backend
        const qgisWmsSource = new ol.source.ImageWMS({
            url: 'http://localhost:8080/cgi-bin/qgis_mapserv.fcgi.exe',
            params: {
                'MAP': 'C:/Files/GeoFiles/U2_Map2.qgs', // <-- The exact path to your QGIS project file"C:\Files\GeoFiles\U2_Map2.qgs"
                'LAYERS': 'ne_10m_land',           // <-- CRUCIAL: Change this to the exact name of your layer inside QGIS Desktop
                'FORMAT': 'image/png',
                'TRANSPARENT': true
            },
            serverType: 'qgis'
        });

        // 5. Initialize the Map layout
        const map = new ol.Map({
            target: 'map', // Matches the div id="map" above
            layers: [
                // Standard global background map (OpenStreetMap) so your data isn't floating in gray space
                new ol.layer.Tile({
                    source: new ol.source.OSM()
                }),
                // Your live custom styled QGIS data layer layered on top
                new ol.layer.Image({
                    source: qgisWmsSource
                })
            ],
            view: new ol.View({
                center: ol.proj.fromLonLat([0, 0]), // Center of the world [Longitude, Latitude]
                zoom: 2                             // Starting zoom level
            })
        });
