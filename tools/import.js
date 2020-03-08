const fsp = require('fs').promises;
const path = require('path');

const generateCasesByLocation = require('./generateCasesByLocation');
const generateFeatures = require('./generateFeatures');
const generatePopulations = require('./generatePopulations');
const generateCasesByRegion = require('./generateCasesByRegion');
const dumpStatistics = require('./dumpStatistics');

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
  .then(async ({regionDays, featureCollection, locationDays, locations}) => {
    console.log('⏳ Writing data...');
    await writeFile('features.json', featureCollection);
    await writeFile('cases.json', regionDays);
    await writeFile('locations.json', locations);
    await writeFile('locationCases.json', locationDays);
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
