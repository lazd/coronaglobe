const fs = require('fs');
const path = require('path');

let locationCases = require('../site/data/cases.json');
let locations = require('../site/data/locations.json');
let features = require('../site/data/features.json');

function getLocationsForFeature(feature) {
  let featureLocations = [];
  for (let location of locations) {
    if (location.featureId === feature.properties.id) {
      featureLocations.push(location);
    }
  }
  return featureLocations;
}

function getCaseDataFeaturePerDay(feature, date) {
  let featureLocations = getLocationsForFeature(feature);

  let population = feature.properties.pop_est;
  let info = {
    cases: 0,
    active: 0,
    deaths: 0,
    recovered: 0
  };

  let currentCases = locationCases[date];
  for (let location of featureLocations) {
    let currentInfo = currentCases[location.id];
    if (currentInfo) {
      info.cases += currentInfo.cases;
      info.active += currentInfo.active;
      info.deaths += currentInfo.deaths;
      info.recovered += currentInfo.recovered;
    }
  }
  if (population) {
    info.rate = info.active / population;
  }

  return info;
}

console.log('⏳ Calculating totals by region...');

let regionCases = {};

for (let date in locationCases) {
  regionCases[date] = {};

  for (let feature of features.features) {
    regionCases[date][feature.properties.id] = getCaseDataFeaturePerDay(feature, date);
  }
}

let rateOrder = [];
let lastDate = Object.keys(regionCases).pop();
for (let featureId in regionCases[lastDate]) {
  let info = regionCases[lastDate][featureId];
  if (info.rate && info.active > 100) {
    let feature = features.features[featureId];
    rateOrder.push(Object.assign({
      name: feature.properties.name,
      population: feature.properties.pop_est
    }, info));
  }
}

rateOrder = rateOrder.sort((a, b) => {
  if (a.rate == b.rate) {
    return 0;
  }
  if (a.rate > b.rate) {
    return -1;
  }
  else {
    return 1;
  }
});

console.log('🗒  Highest rates for %s', lastDate);
for (var i = 0; i < 25 && i < rateOrder.length; i++) {
  let rateInfo = rateOrder[i];
  console.log('  %d. %s: %s% (%s out of %s)', i + 1, rateInfo.name, rateInfo.rate.toFixed(8), rateInfo.active.toLocaleString('en-US'), rateInfo.population.toLocaleString('en-US'));
}

fs.writeFile(path.join('site', 'data', 'casesByFeature.json'), JSON.stringify(regionCases, null, 2), (err) => {
  if (err) {
    console.error('❌ Failed to write cases by feature: %s', err);
    process.exit(1);
  }
  else {
    console.log('✅ Cases by feature written successfully');
  }
});
