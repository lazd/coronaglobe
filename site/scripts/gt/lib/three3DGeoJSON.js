/* Draw GeoJSON
Iterates through the latitude and longitude values, converts the values to XYZ coordinates, and draws the geoJSON geometries.
via https://stackoverflow.com/a/55166015/1170723
*/

import Delaunator from 'delaunator';

let TRIANGULATION_DENSITY = 5;

function verts2array(coords) {
  let flat = [];
  for (let k = 0; k < coords.length; k++) {
    flat.push(coords[k][0], coords[k][1]);
  }
  return flat;
}

function array2verts(arr) {
  let coords = [];
  for (let k = 0; k < arr.length; k += 2) {
    coords.push([arr[k], arr[k + 1]]);
  }
  return coords;
}

function findBBox(points) {
  let min = {
    x: 1e99,
    y: 1e99
  };
  let max = {
    x: -1e99,
    y: -1e99
  };
  for (var point_num = 0; point_num < points.length; point_num++) {
    if (points[point_num][0] < min.x) {
      min.x = points[point_num][0];
    }
    if (points[point_num][0] > max.x) {
      max.x = points[point_num][0];
    }
    if (points[point_num][1] < min.y) {
      min.y = points[point_num][1];
    }
    if (points[point_num][1] > max.y) {
      max.y = points[point_num][1];
    }
  }
  return {
    min: min,
    max: max
  };
}

function isInside(point, vs) {
  // ray-casting algorithm based on
  // http://www.ecse.rpi.edu/Homepages/wrf/Research/Short_Notes/pnpoly.html

  var x = point[0],
    y = point[1];

  var inside = false;
  for (var i = 0, j = vs.length - 1; i < vs.length; j = i++) {
    var xi = vs[i][0],
      yi = vs[i][1];
    var xj = vs[j][0],
      yj = vs[j][1];

    var intersect = ((yi > y) != (yj > y)) && (x < (xj - xi) * (y - yi) / (yj - yi) + xi);
    if (intersect) inside = !inside;
  }

  return inside;
}

function genInnerVerts(points) {
  let res = [];
  for (let k = 0; k < points.length; k++) {
    res.push(points[k]);
  }

  let bbox = findBBox(points);

  let step = TRIANGULATION_DENSITY;
  let k = 0;
  for (let x = bbox.min.x + step / 2; x < bbox.max.x; x += step) {
    for (let y = bbox.min.y + step / 2; y < bbox.max.y; y += step) {
      let newp = [x, y];
      if (isInside(newp, points)) {
        res.push(newp);
      }
      k++;
    }
  }

  return res;
}

function removeOuterTriangles(delaunator, points) {
  let newTriangles = [];
  for (let k = 0; k < delaunator.triangles.length; k += 3) {
    let t0 = delaunator.triangles[k];
    let t1 = delaunator.triangles[k + 1];
    let t2 = delaunator.triangles[k + 2];

    let x0 = delaunator.coords[2 * t0];
    let y0 = delaunator.coords[2 * t0 + 1];

    let x1 = delaunator.coords[2 * t1];
    let y1 = delaunator.coords[2 * t1 + 1];

    let x2 = delaunator.coords[2 * t2];
    let y2 = delaunator.coords[2 * t2 + 1];

    let midx = (x0 + x1 + x2) / 3;
    let midy = (y0 + y1 + y2) / 3;

    let midp = [midx, midy];

    if (isInside(midp, points)) {
      newTriangles.push(t0, t1, t2);
    }
  }
  delaunator.triangles = newTriangles;
}

// 2D funcs
function needsInterpolation(point2, point1) {
    //If the distance between two latitude and longitude values is
    //greater than five degrees, return true.
    var lon1 = point1[0];
    var lat1 = point1[1];
    var lon2 = point2[0];
    var lat2 = point2[1];
    var lon_distance = Math.abs(lon1 - lon2);
    var lat_distance = Math.abs(lat1 - lat2);

    if (lon_distance > 5 || lat_distance > 5) {
        return true;
    } else {
        return false;
    }
}

function interpolatePoints(interpolation_array) {
    //This function is recursive. It will continue to add midpoints to the
    //interpolation array until needsInterpolation() returns false.
    var temp_array = [];
    var point1, point2;

    for (var point_num = 0; point_num < interpolation_array.length - 1; point_num++) {
        point1 = interpolation_array[point_num];
        point2 = interpolation_array[point_num + 1];

        if (needsInterpolation(point2, point1)) {
            temp_array.push(point1);
            temp_array.push(getMidpoint(point1, point2));
        } else {
            temp_array.push(point1);
        }
    }

    temp_array.push(interpolation_array[interpolation_array.length - 1]);

    if (temp_array.length > interpolation_array.length) {
        temp_array = interpolatePoints(temp_array);
    } else {
        return temp_array;
    }
    return temp_array;
}

function getMidpoint(point1, point2) {
    var midpoint_lon = (point1[0] + point2[0]) / 2;
    var midpoint_lat = (point1[1] + point2[1]) / 2;
    var midpoint = [midpoint_lon, midpoint_lat];

    return midpoint;
}

function createCoordinateArray(feature) {
    //Loop through the coordinates and figure out if the points need interpolation.
    var temp_array = [];
    var interpolation_array = [];

    for (var point_num = 0; point_num < feature.length; point_num++) {
        var point1 = feature[point_num];
        var point2 = feature[point_num - 1];

        if (point_num > 0) {
            if (needsInterpolation(point2, point1)) {
                interpolation_array = [point2, point1];
                interpolation_array = interpolatePoints(interpolation_array);

                for (var inter_point_num = 0; inter_point_num < interpolation_array.length; inter_point_num++) {
                    temp_array.push(interpolation_array[inter_point_num]);
                }
            } else {
                temp_array.push(point1);
            }
        } else {
            temp_array.push(point1);
        }
    }
    return temp_array;
}

var x_values = [];
var y_values = [];
var z_values = [];

var clickableObjects = [];

function drawThreeGeo(json, radius, shape, options, targetGroup) {
  var json_geom = createGeometryArray(json);
  var convertCoordinates = getConversionFunctionName(shape);

  for (var geom_num = 0; geom_num < json_geom.length; geom_num++) {
    if (json_geom[geom_num].type == 'Point') {
      convertCoordinates(json_geom[geom_num].coordinates, radius);
      drawParticle(y_values[0], z_values[0], x_values[0], options);

    } else if (json_geom[geom_num].type == 'MultiPoint') {
      for (let point_num = 0; point_num < json_geom[geom_num].coordinates.length; point_num++) {
        convertCoordinates(json_geom[geom_num].coordinates[point_num], radius);
        drawParticle(y_values[0], z_values[0], x_values[0], options, targetGroup);
      }

    } else if (json_geom[geom_num].type == 'LineString') {

      for (let point_num = 0; point_num < json_geom[geom_num].coordinates.length; point_num++) {
        convertCoordinates(json_geom[geom_num].coordinates[point_num], radius);
      }
      drawLine(y_values, z_values, x_values, options, targetGroup);

    } else if (json_geom[geom_num].type == 'Polygon') {
      let group = createGroup(geom_num, targetGroup);

      // Mesh
      for (let segment_num = 0; segment_num < json_geom[geom_num].coordinates.length; segment_num++) {
        let coords = json_geom[geom_num].coordinates[segment_num];
        let refined = genInnerVerts(coords);
        let flat = verts2array(refined);
        let d = new Delaunator(flat);
        removeOuterTriangles(d, coords);

        let delaunayVerts = array2verts(d.coords);
        for (let point_num = 0; point_num < delaunayVerts.length; point_num++) {
          convertCoordinates(delaunayVerts[point_num], radius);
        }
        drawMesh(group, y_values, z_values, x_values, d.triangles, options);
      }

      // Outline
      for (var segment_num = 0; segment_num < json_geom[geom_num].coordinates.length; segment_num++) {
        let coordinate_array = createCoordinateArray(json_geom[geom_num].coordinates[segment_num]);

        for (var point_num = 0; point_num < coordinate_array.length; point_num++) {
          convertCoordinates(coordinate_array[point_num], radius);
        }
        drawLine(y_values, z_values, x_values, options, targetGroup);
      }

    } else if (json_geom[geom_num].type == 'MultiLineString') {
      for (let segment_num = 0; segment_num < json_geom[geom_num].coordinates.length; segment_num++) {
        let coords = json_geom[geom_num].coordinates[segment_num];
        for (let point_num = 0; point_num < coords.length; point_num++) {
          convertCoordinates(json_geom[geom_num].coordinates[segment_num][point_num], radius);
        }
        drawLine(y_values, z_values, x_values, targetGroup);
      }

    } else if (json_geom[geom_num].type == 'MultiPolygon') {
      let group = createGroup(geom_num, targetGroup);

      // Mesh
      for (let polygon_num = 0; polygon_num < json_geom[geom_num].coordinates.length; polygon_num++) {
        for (let segment_num = 0; segment_num < json_geom[geom_num].coordinates[polygon_num].length; segment_num++) {
          let coords = json_geom[geom_num].coordinates[polygon_num][segment_num];
          let refined = genInnerVerts(coords);
          let flat = verts2array(refined);
          let d = new Delaunator(flat);
          removeOuterTriangles(d, coords);

          let delaunayVerts = array2verts(d.coords);
          for (let point_num = 0; point_num < delaunayVerts.length; point_num++) {
            convertCoordinates(delaunayVerts[point_num], radius);
          }
          drawMesh(group, y_values, z_values, x_values, d.triangles, options)
        }
      }

      // Outline
      for (var polygon_num = 0; polygon_num < json_geom[geom_num].coordinates.length; polygon_num++) {
        for (var segment_num = 0; segment_num < json_geom[geom_num].coordinates[polygon_num].length; segment_num++) {
          let coordinate_array = createCoordinateArray(json_geom[geom_num].coordinates[polygon_num][segment_num]);

          for (var point_num = 0; point_num < coordinate_array.length; point_num++) {
              convertCoordinates(coordinate_array[point_num], radius);
          }
          drawLine(y_values, z_values, x_values, options, targetGroup);
        }
      }
    } else {
      throw new Error('The geoJSON is not valid.');
    }
  }
}

function createGeometryArray(json) {
  var geometry_array = [];

  if (json.type == 'Feature') {
    geometry_array.push(json.geometry);
  } else if (json.type == 'FeatureCollection') {
    for (var feature_num = 0; feature_num < json.features.length; feature_num++) {
      geometry_array.push(json.features[feature_num].geometry);
    }
  } else if (json.type == 'GeometryCollection') {
    for (var geom_num = 0; geom_num < json.geometries.length; geom_num++) {
      geometry_array.push(json.geometries[geom_num]);
    }
  } else {
    throw new Error('The geoJSON is not valid.');
  }
  return geometry_array;
}

function getConversionFunctionName(shape) {
  var conversionFunctionName;

  if (shape == 'sphere') {
    conversionFunctionName = convertToSphereCoords;
  } else if (shape == 'plane') {
    conversionFunctionName = convertToPlaneCoords;
  } else {
    throw new Error('The shape that you specified is not valid.');
  }
  return conversionFunctionName;
}

function convertToSphereCoords(coordinates_array, sphere_radius) {
  let lon = coordinates_array[0];
  let lat = coordinates_array[1];

  let phi = (lon + 90) * Math.PI / 180; // Lon
  let theta = lat * Math.PI / 180; // Lat

  let x = sphere_radius * Math.cos(phi) * Math.cos(theta); // Lon
  let y = sphere_radius * Math.sin(phi) * Math.cos(theta); // Lat
  let z = sphere_radius * Math.sin(theta);

  x_values.push(x);
  y_values.push(y);
  z_values.push(z);
}

function convertToPlaneCoords(coordinates_array, radius) {
  var lon = coordinates_array[0];
  var lat = coordinates_array[1];

  z_values.push((lat / 180) * radius);
  y_values.push((lon / 180) * radius);
}

function drawParticle(x, y, z, options, targetGroup) {
  var particle_geom = new THREE.Geometry();
  particle_geom.vertices.push(new THREE.Vector3(x, y, z));

  var particle_material = new THREE.ParticleSystemMaterial(options);

  var particle = new THREE.ParticleSystem(particle_geom, particle_material);
  targetGroup.add(particle);

  clearArrays();
}

function drawLine(x_values, y_values, z_values, options, targetGroup) {
  var line_geom = new THREE.Geometry();
  createVertexForEachPoint(line_geom, x_values, y_values, z_values);

  // Todo: re-add options
  var line_material = new THREE.LineBasicMaterial({
    linewidth: 1,
    color: 'black'
  });
  var line = new THREE.Line(line_geom, line_material);
  line.renderOrder = Infinity;
  targetGroup.add(line);

  clearArrays();
}

function createGroup(idx, targetGroup) {
  var group = new THREE.Group();
  group.userData.userText = "_" + idx;
  targetGroup.add(group);
  return group;
}

function drawMesh(group, x_values, y_values, z_values, triangles, material) {
  var geometry = new THREE.Geometry();

  for (let k = 0; k < x_values.length; k++) {
    geometry.vertices.push(
      new THREE.Vector3(x_values[k], y_values[k], z_values[k])
    );
  }

  for (let k = 0; k < triangles.length; k += 3) {
    geometry.faces.push(new THREE.Face3(triangles[k], triangles[k + 1], triangles[k + 2]));
  }

  geometry.computeVertexNormals();

  var mesh = new THREE.Mesh(geometry, material);
  clickableObjects.push(mesh);
  group.add(mesh);

  clearArrays();
}

function createVertexForEachPoint(object_geometry, values_axis1, values_axis2, values_axis3) {
  for (var i = 0; i < values_axis1.length; i++) {
    object_geometry.vertices.push(new THREE.Vector3(values_axis1[i],
      values_axis2[i], values_axis3[i]));
  }
}

function clearArrays() {
  x_values.length = 0;
  y_values.length = 0;
  z_values.length = 0;
}

export default drawThreeGeo;
