(function (app) {
    app.ns(app, 'IowaGeoJson', function () {
        return [
            {"type":"FeatureCollection","properties":{"kind":"state","state":"IA"},"features":[
                {"type":"Feature","properties":{"kind":"county","name":"Dallas","state":"IA"},"geometry":{"type":"MultiPolygon","coordinates":[[[[-93.8166,41.8638],[-93.7892,41.5133],[-93.8221,41.5078],[-94.2438,41.5023],[-94.2438,41.6009],[-94.2821,41.6009],[-94.2821,41.8638],[-94.1617,41.8638]]]]}}
            ]},
            {"type":"FeatureCollection","properties":{"kind":"state","state":"IA"},"features":[
                {"type":"Feature","properties":{"kind":"county","name":"Polk","state":"IA"},"geometry":{"type":"MultiPolygon","coordinates":[[[[-93.7728,41.8638],[-93.6961,41.8638],[-93.3456,41.8638],[-93.3292,41.5078],[-93.3292,41.4914],[-93.7071,41.5133],[-93.7892,41.5133],[-93.8166,41.8638]]]]}}
            ]}
        ];
    });
}(app));