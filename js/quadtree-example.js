(function (app) {
    var collection = new Backbone.Collection(),
        loaded = collection.fetch({url: '/dummy-data.json'}),
        mapLoaded = $.Deferred();

    function getGoogleMapBoundsXY() {
        var bounds = app.map.getBounds(),
            swPoint = bounds.getSouthWest(),
            nePoint = bounds.getNorthEast(),

            swXY = convertPointToXY({
                lat: swPoint.lat(),
                lng: swPoint.lng()
            }),

            neXY = convertPointToXY({
                lat: nePoint.lat(),
                lng: nePoint.lng()
            });

        return [[swXY.x, swXY.y], [neXY.x, neXY.y]];
    }

    function convertPointToMercator(point) {
        var projection = app.map.getProjection(),
            gLatLng = new google.maps.LatLng(point.lat, point.lng);

        return projection.fromLatLngToPoint(gLatLng);
    }

    function convertPointToXY(location) {
        var mercatorPoint = convertPointToMercator(location);

        return {x: mercatorPoint.x, y: mercatorPoint.y};
    }

    function updateNodes(qTree) {
        var nodes = [];

        qTree.depth = 0;

        qTree.visit(function (node, x1, y1, x2, y2) {
            var nodeRect = {
                    left: x1,
                    right: x2,
                    bottom: y1,
                    top: y2
                },
                maxDepth = 0,
                i;

            node.width = (nodeRect.right - nodeRect.left);
            node.height = (nodeRect.top - nodeRect.bottom);

            nodes.push(node);

            for (i = 0; i < 4; i++) {
                if (node.nodes[i]) {
                    node.nodes[i].depth = node.depth + 1;
                    if (node.nodes[i].depth > maxDepth) {
                        maxDepth = node.nodes[i].depth;

                        qTree.depth = maxDepth;
                    }
                }
            }
        });

        return nodes;
    }

    Backbone.Events.on('map-loaded', function () {
        mapLoaded.resolve();
    });

    $.when(mapLoaded, loaded).done(function () {
//        Backbone.Events.on('bounds-change', function (bounds) {
//        });

        collection.each(function (item) {
            var marker = new google.maps.Marker({
                position: new google.maps.LatLng(item.attributes.location.lat, item.attributes.location.lng)
            });

            marker.setMap(app.map);
        });

        var xyPoints = _.map(collection.pluck('location'), convertPointToXY),
            bounds = getGoogleMapBoundsXY(),
            quadtree = d3.geom.quadtree(xyPoints);

        updateNodes(quadtree);

//        var x0 = bounds[0][0],
//            y0 = bounds[0][1],
//            x3 = bounds[1][0],
//            y3 = bounds[1][0];

        quadtree.visit(function (node, x1, y1, x2, y2) {
            var works,
                projection = app.map.getProjection(),
                swGeo = projection.fromPointToLatLng(new google.maps.Point(x1, y1)),
                neGeo = projection.fromPointToLatLng(new google.maps.Point(x2, y2)),
                bounds = new google.maps.LatLngBounds(swGeo, neGeo),

                rect;

            if (!node.leaf) {
                rect = new google.maps.Rectangle({
                    bounds: bounds,
                    map: app.map
                });
//                works = x1 >= x3 || y1 >= y3 || x2 < x0 || y2 < y0;
            }
        });

        app.quadtree = quadtree;
        app.points = xyPoints;
    });

}(app));