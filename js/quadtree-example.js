(function (app) {
    'use strict';

    var EPSG_3857 = '+proj=merc +a=6378137 +b=6378137 +lat_ts=0.0 +lon_0=0.0 +x_0=0.0 +y_0=0 +k=1.0 +units=m +nadgrids=@null +wktext  +no_defs',
        EPSG_4326 = '+proj=longlat +datum=WGS84 +no_defs',

        host = Backbone.history.location.hostname,
        collection = new Backbone.Collection(),
        loaded,
        data = '/locations.json',
        endPointUrl = host === 'localhost' ? data : '/spike-playground' + data,
        mapLoaded = new $.Deferred(),
        rects = [],
        markers = {},
        groupMarkers = {};

    loaded = collection.fetch({url: endPointUrl});

    function convertLatLngToXy(latLng) {
        var projectedPoint = proj4(EPSG_4326, EPSG_3857, [latLng.lng, latLng.lat]);

        return {x: projectedPoint[0], y: projectedPoint[1]};
    }

    function convertGoogleMapBoundsToXY(inputBounds) {
        var bounds = inputBounds || app.map.getBounds(),
            swLatLng = bounds.getSouthWest(),
            neLatLng = bounds.getNorthEast(),

            swXY = convertLatLngToXy({
                lat: swLatLng.lat(),
                lng: swLatLng.lng()
            }),

            neXY = convertLatLngToXy({
                lat: neLatLng.lat(),
                lng: neLatLng.lng()
            });

        return {
            sw: swXY,
            ne: neXY
        };
    }

    function updateNodes(qTree) {
        qTree.depth = 0;

        qTree.visit(function (node, x1, y1, x2, y2) {
            node.bounds = {
                x1: x1,
                y1: y1,
                x2: x2,
                y2: y2
            };

            if (!node.leaf) {
                var leafNodes = _.filter(node.nodes, function (node) {
                    return (node && node.leaf);
                });

                node.containsLeaf = leafNodes.length > 0;
            }
        });
    }

    function bboxToPolygon(swPoint, nePoint) {
        return new Terraformer.Polygon({
            type: 'Polygon',
            coordinates:
                [
                    [
                        [nePoint.x, nePoint.y],
                        [swPoint.x, nePoint.y],
                        [swPoint.x, swPoint.y],
                        [nePoint.x, swPoint.y],
                        [nePoint.x, nePoint.y]
                    ]
                ]
        });
    }

    function pointInBounds(point, bbox) {
        var bounds = convertGoogleMapBoundsToXY(bbox),

            swX = bounds.sw.x,
            swY = bounds.sw.y,
            neX = bounds.ne.x,
            neY = bounds.ne.y,
            y = point.y,
            x = point.x;

        return  swX <= x && x <= neX && swY <= y && y <= neY;
    }

    function createQuadTree(xyPoints, inputBounds) {
        var quadtree,
            pointsInBounds = _.filter(xyPoints, function (point) {
                return pointInBounds(point, inputBounds);
            });

            quadtree = d3.geom.quadtree(pointsInBounds);

        updateNodes(quadtree);

        return quadtree;
    }

    function pointsToPolygon(x1, y1, x2, y2) {
        return bboxToPolygon({x: x1, y: y1}, {x: x2, y: y2});
    }

    function flattenQuadtree(quadtree) {
        var nodes = {},
            nodeId = 0;

        quadtree.visit(function (node) {
            node.id = nodeId;
            nodes[nodeId] = node;

            nodeId += 1;
        });

        return nodes;
    }

    function boundingBoxToExtent(inputBounds) {
        var bounds = inputBounds.bbox();
        return [[bounds[0], bounds[1]], [bounds[2], bounds[3]]];
    }

    function projectedCoordinatePairToGoogleLatLng(coordinates) {
        var geographicCoords = proj4(EPSG_3857, EPSG_4326, coordinates);

        return new google.maps.LatLng(geographicCoords[1], geographicCoords[0]);
    }

    function polygonToGoogleLatLngBounds(inputBounds) {
        var bounds = boundingBoxToExtent(inputBounds),
            swCoords = bounds[0],
            neCoords = bounds[1],

            swGlatLng = projectedCoordinatePairToGoogleLatLng(swCoords),
            neGlatLng = projectedCoordinatePairToGoogleLatLng(neCoords);

        return new google.maps.LatLngBounds(swGlatLng, neGlatLng);
    }

    /*function googleMapsRectangleFromBounds(inputBounds) {
        return new google.maps.Rectangle({
            bounds: polygonToGoogleLatLngBounds(inputBounds),
            map: app.map,
            fillOpacity: 0
        });
    }*/

    function collectionToXyPoints() {
        return _.map(collection.pluck('location'), convertLatLngToXy);
    }

    function getContainingBounds(nodes) {
        return _.filter(nodes, function (childNode) {
            return childNode.containsLeaf;
        });
    }

    function boundsContainedBy(innerBounds, outerBounds) {
        var X_COORD = 0,
            Y_COORD = 1,

            innerBoundsCoords = boundingBoxToExtent(innerBounds),
            outerBoundsCoords = boundingBoxToExtent(outerBounds),

            outerNeCoords = outerBoundsCoords[1],
            outerSwCoords = outerBoundsCoords[0],
            innerNeCoords = innerBoundsCoords[1],
            innerSwCoords = innerBoundsCoords[0];

        return outerNeCoords[X_COORD] >= innerNeCoords[X_COORD] &&
            outerNeCoords[Y_COORD] >= innerNeCoords[Y_COORD] &&
            outerSwCoords[X_COORD] <= innerSwCoords[X_COORD] &&
            outerSwCoords[Y_COORD] <= innerSwCoords[Y_COORD];
    }

    function getAllBoundsFromQuadtreeOf(nodes) {
        return _.map(getContainingBounds(nodes), function (node) {
            var nodeBounds = node.bounds,
                xyBounds = pointsToPolygon(
                    nodeBounds.x1,
                    nodeBounds.y1,
                    nodeBounds.x2,
                    nodeBounds.y2
                );

            xyBounds.id = node.id;

            return xyBounds;
        });
    }

    function hideDebugRectangles() {
        _.each(rects, function (rect) {
            rect.setMap(null);
        });
    }

    function removeEmptyCellsFrom(flatQuadtree, id) {
        return _.compact(flatQuadtree[id].nodes);
    }

    function createAndRenderQuadtree(bounds) {
        var xyPoints = collectionToXyPoints(),
            quadtree = createQuadTree(xyPoints, bounds),
            nodes = flattenQuadtree(quadtree),
            groupsToRender,

            allBoundsFromQuadtree;

        hideDebugRectangles();

        allBoundsFromQuadtree = getAllBoundsFromQuadtreeOf(nodes);

        groupsToRender = _.filter(allBoundsFromQuadtree, function (outerBounds) {
            var containsOthers = false;

            _.each(allBoundsFromQuadtree, function (innerBounds) {
                if (boundsContainedBy(innerBounds, outerBounds) && outerBounds.id !== innerBounds.id) {
                    containsOthers = true;
                }
            });
//            rects.push(googleMapsRectangleFromBounds(outerBounds));

            return !containsOthers;
        });

        _.each(groupsToRender, function (childBounds) {
            var nodesInChildBounds = removeEmptyCellsFrom(nodes, childBounds.id);

            _.each(nodesInChildBounds, function (nodeToHide) {
                Backbone.Events.trigger('hide-marker', {point: {x: nodeToHide.x, y: nodeToHide.y}, bounds: childBounds});
            });

//            rects.push(googleMapsRectangleFromBounds(childBounds));
        });

        app.containingBounds = allBoundsFromQuadtree;

        return quadtree;
    }

    function createMarkerForGroup(bounds) {
        var center;

        if (!groupMarkers[bounds.id]) {
            center = polygonToGoogleLatLngBounds(bounds).getCenter();

            groupMarkers[bounds.id] = new google.maps.Marker({
                position: center,
                map: app.map,
                title: 'group ' + bounds.id,
                opacity: 1.0,
                icon: 'blue-marker.png'
            });
        }
    }

    function resetGroupMarkerCache() {
        _.each(groupMarkers, function (marker) {
            marker.setMap(null);
        });

        groupMarkers = {};
    }

    function renderMarker(item) {
        var point = convertLatLngToXy(item.attributes.location);

        item.set('xCoord', point.x);
        item.set('yCoord', point.y);

        var marker = new google.maps.Marker({
            position: new google.maps.LatLng(item.attributes.location.lat, item.attributes.location.lng),
            title: item.attributes.name,
            opacity: 1.0
        });

        markers[item.id] = marker;

        marker.setMap(app.map);
    }

    function lookupModelByCoordinates(xCoord, yCoord) {
        return collection.where({xCoord: xCoord, yCoord: yCoord})[0];
    }

    function init() {
        Backbone.Events.on('map-loaded', function () {
            mapLoaded.resolve();
        });

        Backbone.Events.on('hide-marker', function (nodeToHide) {
            var model = lookupModelByCoordinates(nodeToHide.point.x, nodeToHide.point.y);

//            markers[model.id].setOpacity(.2);
//            markers[model.id].setVisible(false);
            markers[model.id].setMap(null);
//            console.log('hidden');

            createMarkerForGroup(nodeToHide.bounds);
        });

        $.when(mapLoaded, loaded).done(function () {
            var quadtree;

            Backbone.Events.on('bounds-change', _.debounce(function (bounds) {
                resetGroupMarkerCache();

                _.each(markers, function (marker) {
                    marker.setOpacity(1.0);
                    marker.setMap(app.map);
                });

                createAndRenderQuadtree(bounds);

            }), 500);

            collection.each(renderMarker);

            quadtree = createAndRenderQuadtree(app.map.getBounds());

            app.quadtree = quadtree;
        });
    }

    init();
}(app));
