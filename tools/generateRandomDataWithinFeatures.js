const fs = require('fs');
const path = require('path');

const config = require('../data/config.json');
const cases = require('../site/data/cases.json');
const locations = require('../site/data/locations.json');
const features = require('../site/data/features.json');

// Pull in existing points if present
let points = {};
let pointsPath = path.join(__dirname, '../site/data/points.json');
if (fs.existsSync(pointsPath)) {
  points = require(pointsPath);
}

const randomPointGenerator = require('random-points-generator');

function simplifyPointSet(pointFeatures) {
  let pointArray = [];
  for (let point of pointFeatures.features) {
    pointArray.push(point.geometry.coordinates);
  }
  return pointArray;
}

let latestDate = Object.keys(cases).pop();
let currentLocations = cases[latestDate];

console.log('⏳ Generating random point sets...');
let error = false;
for (let locationId in currentLocations) {
  let locationData = currentLocations[locationId];
  let location = locations[locationId];
  let cases = locationData.cases;

  if (cases) {
    if (cases > config.caseDivisor * config.minimumClusters) {
      let locationString = (location.province ? location.province + ', ' : '') + location.country;

      let pointsToGenerate = Math.max(Math.round(cases / config.caseDivisor), 1);

      if (points[locationId]) {
        // Use existing points as a base
        // this avoids variation between days
        pointsToGenerate = pointsToGenerate - points[locationId].length;
      }

      if (pointsToGenerate > 0) {
        console.log('  %s: generating %d points for %d cases', locationString, pointsToGenerate, cases);
        try {
          let newPointFeatures = simplifyPointSet(randomPointGenerator.random(pointsToGenerate, {
            features: features.features[locationId]
          }));

          // Add to existing features
          points[locationId] = (points[locationId] || []).concat(newPointFeatures);
        }
        catch(err) {
          error = true;
          console.error('    ⚠️ could not generate random points: %s', err);
        }
      }
      else if (location.pointFeatures) {
        console.log('  %s: skipping point generation, data already contains %d points for %d cases', locationString, location.pointFeatures.length, cases);
      }
    }
  }
}

if (error) {
  process.exit(1);
}

fs.writeFile(path.join('site', 'data', 'points.json'), JSON.stringify(points, null, 2), (err) => {
  if (err) {
    console.error('❌ Failed to update location data: %s', err);
    process.exit(1);
  }
  else {
    console.log('✅ Location data updated successfully');
  }
});

