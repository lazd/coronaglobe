const fs = require('fs');
const path = require('path');

const data = require('../site/data/data.json');
const features = require('../site/data/features.json');
const randomPointGenerator = require('random-points-generator');

function simplifyPointSet(pointFeatures) {
  let pointArray = [];
  for (let point of pointFeatures.features) {
    pointArray.push(point.geometry.coordinates);
  }
  return pointArray;
}

var locations = data.locations;
var latestDate = Object.keys(data.days).pop();
var currentLocations = data.days[latestDate];

let caseDivisor = 250;
let minimumCluster = 4;
let pointFeatures = {};

console.log('⏳ Generating random point sets...');
let error = false;
for (var locationId in currentLocations) {
  let locationData = currentLocations[locationId];
  var location = locations[locationId];
  var cases = locationData.cases;

  if (cases) {
    if (cases > caseDivisor * minimumCluster) {
      var locationString = (location.province? location.province+ ', ' : '') + location.country;

      let pointsToGenerate = Math.max(Math.round(cases / caseDivisor), 1);
      console.log('  %s: generating %d points for %d cases', locationString, pointsToGenerate, cases);
      try {
        pointFeatures[locationId] = simplifyPointSet(randomPointGenerator.random(pointsToGenerate, {
          features: features.features[location.featureId]
        }));
      }
      catch(err) {
        error = true;
        console.error('    ⚠️ could not generate random points: %s', err);
      }
    }
  }
}

if (error) {
  process.exit(1);
}

fs.writeFile(path.join('site', 'data', 'clusters.json'), JSON.stringify(pointFeatures, null, 2), (err) => {
  if (err) {
    console.error('❌ Failed to write clusters: %s', err);
    process.exit(1);
  }
  else {
    console.log('✅ Clusters written successfully');
  }
});

