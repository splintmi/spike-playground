(function (app) {
    var collection = new Backbone.Collection(),
        loaded = collection.fetch({url: '/dummy-data.json'}),
        mapLoaded = $.Deferred(),
        rects = [];

    function convertPointToXY(latLng) {
        var projection = app.map.getProjection(),
            gLatLng = new google.maps.LatLng(latLng.lat, latLng.lng),
            point = projection.fromLatLngToPoint(gLatLng);

        return {x: point.x, y: point.y};
    }

    function getGoogleMapBoundsXY(inputBounds) {
        var bounds = inputBounds || app.map.getBounds(),
            swLatLng = bounds.getSouthWest(),
            neLatLng = bounds.getNorthEast(),

            swXY = convertPointToXY({
                lat: swLatLng.lat(),
                lng: swLatLng.lng()
            }),

            neXY = convertPointToXY({
                lat: neLatLng.lat(),
                lng: neLatLng.lng()
            });

        return {
            sw: swXY,
            ne: neXY
        }
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

    function pointToArray(point) {
        return [point.x, point.y];
    }

    function pointsToArray(xyPoints) {
        return _.map(xyPoints, pointToArray);
    }

    function pointInBounds(point, bounds) {
        var projection = app.map.getProjection(),
            latLng = projection.fromPointToLatLng(new google.maps.Point(point.x, point.y));

        return bounds.contains(latLng);
    }

    function createQuadTree(xyPoints, inputBounds) {
        var quadtree,
            bounds,

            pointsInBounds = _.filter(xyPoints, function (point) {
                return pointInBounds(point, inputBounds)
            });

        bounds = getGoogleMapBoundsXY(inputBounds);

        quadtree = d3.geom.quadtree()
            .extent([ [bounds.sw.x, bounds.ne.y], [bounds.ne.x, bounds.sw.y] ])
            (pointsToArray(pointsInBounds));

        updateNodes(quadtree);

        return quadtree;

    }

    function renderQuadTree(node, x1, y1, x2, y2) {
        var projection = app.map.getProjection(),
            swGeo = projection.fromPointToLatLng(new google.maps.Point(x1, y1)),
            neGeo = projection.fromPointToLatLng(new google.maps.Point(x2, y2)),
            bounds = new google.maps.LatLngBounds(swGeo, neGeo),

            rect;

        if (!node.leaf) {
            rect = new google.maps.Rectangle({
                bounds: bounds,
                map: app.map,
                fillOpacity: 0
            });

            rects.push(rect);
        }
    }

    function collectionToXyPoints() {
        return _.map(collection.pluck('location'), convertPointToXY);
    }

    function createAndRenderQuadtree(bounds) {
        var xyPoints = collectionToXyPoints(),
            quadtree = createQuadTree(xyPoints, bounds);

        _.each(rects, function (rect) {
            rect.setMap(null);
        });
        quadtree.visit(renderQuadTree);

        return quadtree;
    }

    Backbone.Events.on('map-loaded', function () {
        mapLoaded.resolve();
    });

    $.when(mapLoaded, loaded).done(function () {
        Backbone.Events.on('zoom-change', function (bounds) {
            createAndRenderQuadtree(bounds);
        });

        collection.each(function (item) {
            var marker = new google.maps.Marker({
                position: new google.maps.LatLng(item.attributes.location.lat, item.attributes.location.lng)
            });

            marker.setMap(app.map);
        });

        createAndRenderQuadtree(app.map.getBounds());
    });

}(app));
