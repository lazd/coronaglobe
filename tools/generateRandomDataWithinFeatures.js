const fs = require('fs');
const path = require('path');

const config = require('../data/config.json');

const randomPointGenerator = require('random-points-generator');

function simplifyPointSet(pointFeatures) {
  let pointArray = [];
  for (let point of pointFeatures.features) {
    pointArray.push(point.geometry.coordinates);
  }
  return pointArray;
}

function generateRandomDataWithinFeatures({regionDays, featureCollection, locationDays, locations}) {
  // Pull in existing points if present
  let points = {};
  let pointsPath = path.join(__dirname, '../site/data/points.json');
  if (fs.existsSync(pointsPath)) {
    points = require(pointsPath);
  }

  let latestDate = Object.keys(regionDays).pop();
  let lastestCasesByRegion = regionDays[latestDate];

  console.log('⏳ Generating random point sets...');
  let error = false;
  for (let feature of featureCollection.features) {
    let featureId = feature.properties.id;
    let featureData = lastestCasesByRegion[feature.properties.id];
    let cases = featureData.cases;

    if (cases) {
      if (cases > config.caseDivisor * config.minimumClusters) {
        let locationString = feature.properties.name;

        let pointsToGenerate = Math.max(Math.round(cases / config.caseDivisor), 1);

        if (points[featureId]) {
          // Use existing points as a base
          // this avoids variation between days
          pointsToGenerate = pointsToGenerate - points[featureId].length;
        }

        if (pointsToGenerate > 0) {
          console.log('  %s: generating %d points for %d cases', locationString, pointsToGenerate, cases);
          try {
            let newPoints = simplifyPointSet(randomPointGenerator.random(pointsToGenerate, {
              features: feature
            }));

            // Add to existing points
            points[featureId] = (points[featureId] || []).concat(newPoints);
          }
          catch(err) {
            error = true;
            console.error('    ⚠️ could not generate random points: %s', err);
          }
        }
      }
    }
  }

  console.log('✅ Random point sets generated...');

  return {regionDays, featureCollection, locationDays, locations, points};
}

module.exports = generateRandomDataWithinFeatures;
