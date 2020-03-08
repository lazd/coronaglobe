const fs = require('fs');
const path = require('path');

function generateCasesByRegion({locationDays, locations, featureCollection}) {
  function getLocationsForFeature(feature) {
    let featureLocations = [];
    for (let [locationName, location] of Object.entries(locations)) {
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

    let currentCases = locationDays[date];
    for (let location of featureLocations) {
      let currentInfo = currentCases[location.name];
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

  console.log('⏳ Summing cases by region...');

  let regionDays = {};

  for (let date in locationDays) {
    regionDays[date] = {};

    for (let feature of featureCollection.features) {
      regionDays[date][feature.properties.id] = getCaseDataFeaturePerDay(feature, date);
    }
  }

  console.log('✅ Cases by region generated');

  return {regionDays, featureCollection, locationDays, locations};
}

module.exports = generateCasesByRegion;
