const fsp = require('fs').promises;
const path = require('path');

const generateCasesByLocation = require('./generateCasesByLocation');
const generateFeatures = require('./generateFeatures');
const generatePopulations = require('./generatePopulations');
const generateCasesByRegion = require('./generateCasesByRegion');
const dumpStatistics = require('./dumpStatistics');
const generateRandomDataWithinFeatures = require('./generateRandomDataWithinFeatures');

function writeFile(fileName, object) {
  return fsp.writeFile(path.join('site', 'data', fileName), JSON.stringify(object, null, 2))
    .then(() => {
      console.log('  ✅ %s written successfully', fileName);
    });
}

// Read confirmed and build list of locations
generateCasesByLocation()
  // Turn locations into regions
  .then(generateFeatures)
  // Generate populations
  .then(generatePopulations)
  .then(generateCasesByRegion)
  .then(generateRandomDataWithinFeatures)
  .then(async ({regionDays, featureCollection, locationDays, locations, points}) => {
    console.log('⏳ Writing data...');
    await writeFile('features.json', featureCollection);
    await writeFile('cases.json', regionDays);
    // await writeFile('locations.json', locations);
    // await writeFile('locationCases.json', locationDays);
    await writeFile('points.json', points);
    return {regionDays, featureCollection};
  })
  .then(dumpStatistics)
  .then(() => {
    console.log('✅ Import complete!');
  },
  reason => {
    console.error('❌ Import failed: ' + reason);
    process.exit(1);
  });
