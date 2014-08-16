(function(global) {
    'use strict';

    function ns (parent_ns, ns_string, extent) {
        var ns_parts = ns_string.split('.'),
            hlq = 'app',
            parent = parent_ns,
            i;

        if (ns_parts[0] === hlq) {
            ns_parts = ns_parts.slice(0);
        }

        for (i = 0; i < ns_parts.length; i += 1) {
            if (parent[ns_parts[i]] === undefined) {
                if (extent) {
                    parent[ns_parts[i]] = extent;
                } else {
                    parent[ns_parts[i]] = {};
                }
            }

            parent = parent[ns_parts[i]];
        }

        return parent;
    }

    function bindNS (parent_ns, ns_string, extent) {
        ns.apply(this, [parent_ns, ns_string, extent]);
    }

    global.app = {
        ns: ns,
        bindNS: bindNS
    };

}(this));

(function (app) {
    app.ns(app, 'AnswersModel', Backbone.Model.extend({
        defaults: {
            'x_coord': 0,
            'y_coord': 0
        },

        initialize: function () {  }
    }));
}(app));
(function (app) {
    app.ns(app, 'AnswerCollection', Backbone.Collection.extend({
        model: app.AnswersModel,

        initialize: function () {
            this.loaded = $.Deferred();
        },

        fetch: function () {
            var jqXHR = Backbone.Collection.prototype.fetch.apply(this, arguments);

            jqXHR.done(this.loaded.resolve);
            jqXHR.fail(this.loaded.reject);
        },

        parse: function(response) {
            return response.items;
        },
        url: 'http://api.stackexchange.com/2.2/tags/reactjs/faq?site=stackoverflow'
    }));
}(app));
(function (app) {
    function initialize() {
        var mapOptions = {
            center: new google.maps.LatLng(40.01144663490021, -90.22767623046876),
            zoom: 7
        };
        var map = new google.maps.Map(document.getElementById("map-canvas"),
            mapOptions);

        app.ns(app, 'map', map);

        google.maps.event.addListener(map, 'idle', function () {
            Backbone.Events.trigger('map-idle');
        });

        google.maps.event.addListener(map, 'zoom_changed', function () {
            Backbone.Events.trigger('zoom-change', map.getBounds());
        });

        google.maps.event.addListener(map, 'bounds_changed', function () {
            Backbone.Events.trigger('bounds-change', map.getBounds());
        });

        google.maps.event.addListenerOnce(map, 'idle', function () {
            Backbone.Events.trigger('map-loaded');
        });
    }
    google.maps.event.addDomListener(window, 'load', initialize);
}(app));
(function (app) {
    var EPSG_4087 = '+proj=eqc +lat_ts=0 +lat_0=0 +lon_0=0 +x_0=0 +y_0=0 +datum=WGS84 +units=m +no_defs',
        EPSG_4326 = '+proj=longlat +datum=WGS84 +no_defs',

        host = Backbone.history.location.hostname,
        collection = new Backbone.Collection(),
        loaded,
        data = '/dummy-data.json',
        endPointUrl = host === 'localhost' ? data : '/spike-playground' + data,
        mapLoaded = $.Deferred(),
        rects = [],
        markers = {},
        groupMarkers = {};

    loaded = collection.fetch({url: endPointUrl});

    function convertLatLngToXy(latLng) {
        var projectedPoint = proj4(EPSG_4326, EPSG_4087, [latLng.lng, latLng.lat]);

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
        }
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

    function pointToArray(point) {
        return [point.x, point.y];
    }

    function pointsToArray(xyPoints) {
        return _.map(xyPoints, pointToArray);
    }

    function bboxToPolygon(swPoint, nePoint) {
        return new Terraformer.Polygon({
            type:"Polygon",
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
        })
    }

    function pointInBounds(point, bounds) {
        var boundsPoints = convertGoogleMapBoundsToXY(bounds),
            boundsPoly = bboxToPolygon(boundsPoints.sw, boundsPoints.ne),
            latLng = new Terraformer.Point({
                type:"Point",
                coordinates:[point.x, point.y]
            });

        return boundsPoly.contains(latLng);
    }

    function createQuadTree(xyPoints, inputBounds) {
        var quadtree,
//            xyBounds = convertGoogleMapBoundsToXY(inputBounds),
            PROJECTION_BOUNDS = [[-20037508.3428, -10018754.1714], [20037508.3428, 10018754.1714]],

            pointsInBounds = _.filter(xyPoints, function (point) {
                return pointInBounds(point, inputBounds)
            });

        if (xyPoints.length === pointsInBounds.length) {
            quadtree = d3.geom.quadtree()
                .extent(PROJECTION_BOUNDS)
//                .extent([[xyBounds.sw.x, xyBounds.sw.y], [xyBounds.ne.x, xyBounds.ne.y]])
            (pointsToArray(pointsInBounds));
        } else {
            quadtree = d3.geom.quadtree(pointsInBounds);
        }

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
        var geographicCoords = proj4(EPSG_4087, EPSG_4326, coordinates);

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

    function googleMapsRectangleFromBounds(inputBounds) {
        return new google.maps.Rectangle({
            bounds: polygonToGoogleLatLngBounds(inputBounds),
            map: app.map,
            fillOpacity: 0
        });
    }

    function collectionToXyPoints() {
        return _.map(collection.pluck('location'), convertLatLngToXy);
    }

    function getContainingBounds(nodes) {
        return _.filter(nodes, function (childNode) {
            return childNode.containsLeaf;
        });
    }

    function boundsContainedBy(innerBounds, outerBounds) {
        var X_COORD = 0;
        var Y_COORD = 1;
        var innerBoundsCoords = boundingBoxToExtent(innerBounds),
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

    function createAndRenderQuadtree(bounds) {
        var xyPoints = collectionToXyPoints(),
            quadtree = createQuadTree(xyPoints, bounds),
            nodes = flattenQuadtree(quadtree),
            groupsToRender,

            containingBoundsSet;

        _.each(rects, function (rect) {
            rect.setMap(null);
        });

        containingBoundsSet = _.map(getContainingBounds(nodes), function (node) {
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

        groupsToRender = _.filter(containingBoundsSet, function (outerBounds) {
            var containsOthers = false;

            _.each(containingBoundsSet, function (innerBounds) {
                if (boundsContainedBy(innerBounds, outerBounds) && outerBounds.id != innerBounds.id) {
                    containsOthers = true;
                }
                return !containsOthers;
            });

            return !containsOthers;
        });

        _.each(groupsToRender, function (childBounds) {
            var nodesInChildBounds = _.compact(nodes[childBounds.id].nodes);

            _.each(nodesInChildBounds, function (nodeToHide) {
                Backbone.Events.trigger('hide-marker', {point: {x: nodeToHide.x, y: nodeToHide.y}, bounds: childBounds});
            });

            rects.push(googleMapsRectangleFromBounds(childBounds));
        });

        app.containingBounds = containingBoundsSet;

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
                opacity: .5
            });
        }
    }

    function resetGroupMarkerCache() {
        _.each(groupMarkers, function (marker) {
            marker.setMap(null);
        });

        groupMarkers = {};
    }

    Backbone.Events.on('map-loaded', function () {
        mapLoaded.resolve();
    });

    Backbone.Events.on('hide-marker', function (nodeToHide) {
        var model = collection.where({x_coord: nodeToHide.point.x, y_coord: nodeToHide.point.y})[0];

//        markers[model.id].setMap(null);
        markers[model.id].setOpacity(.2);

        createMarkerForGroup(nodeToHide.bounds);
    });

    $.when(mapLoaded, loaded).done(function () {
        var quadtree;

        Backbone.Events.on('bounds-change', _.debounce(function (bounds) {
            resetGroupMarkerCache();

            _.each(markers, function (marker) {
//                marker.setMap(app.map);
                marker.setOpacity(1.0);
            });

            createAndRenderQuadtree(bounds);

        }), 500);

        collection.each(function (item) {
            var point = convertLatLngToXy(item.attributes.location);

            item.set('x_coord', point.x);
            item.set('y_coord', point.y);

            var marker = new google.maps.Marker({
                position: new google.maps.LatLng(item.attributes.location.lat, item.attributes.location.lng),
                title: item.attributes.name
            });

            markers[item.id] = marker;

            marker.setMap(app.map);
        });

        quadtree = createAndRenderQuadtree(app.map.getBounds());

        app.quadtree = quadtree;
    });

}(app));

//# sourceMappingURL=quadtree.js.map