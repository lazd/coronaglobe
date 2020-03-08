const fsp = require('fs');
const path = require('path');

const turf = require('@turf/turf');

const countryData = require('../data/ne_10m_admin_0_countries-4pct.json');
const provinceData = require('../data/ne_10m_admin_1_states_provinces-10pct.json');

function cleanProps(obj) {
  if (obj.wikipedia === -99) {
    delete obj.wikipedia;
  }

  for (let prop in obj) {
    if (obj[prop] === '') {
      delete obj[prop];
    }
  }

  return obj;
}

function takeOnlyProps(obj, props) {
  let newObj = {};
  for (let prop of props) {
    if (typeof obj[prop] !== 'undefined') {
      newObj[prop] = obj[prop];
    }
  }
  return newObj;
}

function normalizeProps(obj) {
  let newObj = {};
  for (let prop in obj) {
    newObj[prop.toLowerCase()] = obj[prop];
  }
  return newObj;
}

let props = [
  'name',
  'name_en',
  'abbrev',
  'pop_est',
  'pop_year',
  'gdp_md_est',
  'gdp_year',
  'iso_a2',
  'iso_3166_2',
  'latitude',
  'longitude',
  'type_en',
  'wikipedia'
];

function cleanFeatures(set) {
  for (let feature of set.features) {
    feature.properties = cleanProps(takeOnlyProps(normalizeProps(feature.properties), props));
  }
}

function generateFeatures({locationDays, locations}) {
  function storeFeature(feature, location) {
    let index = featureCollection.features.indexOf(feature);
    if (index === -1) {
      index = featureCollection.features.push(feature) - 1;
    }

    feature.properties.id = index;
    location.featureId = index;
    foundCount++;
  }

  let foundCount = 0;
  let featureCollection = {
    type: 'FeatureCollection',
    features: []
  };

  return new Promise((resolve, reject) => {
    console.log('⏳ Generating features...');

    // Clean and normalize data first
    cleanFeatures(countryData);
    cleanFeatures(provinceData);

    for (let locationId in locations) {
      let location = locations[locationId];

      let found = false;
      let point = turf.point(location.coordinates);

      // Treat HK as a country or it won't match
      // Todo: Make sure this is no longer needed
      if (location.province && location.province != 'Hong Kong' && location.province != 'Taiwan') {
        // Check if the location exists within our provinces
        for (let feature of provinceData.features) {
          if (location.province === feature.properties.name || location.province === feature.properties.name_en) {
            found = true;
            storeFeature(feature, location);
            break;
          }

          // Todo: Check if this is needed
          if (feature.properties.name === 'New York' && location.province === 'New York County, NY') {
            // Can't find New York for some reason, hardcode FTW
            found = true;
            storeFeature(feature, location);
            break;
          }

          if (!feature.geometry) {
            continue;
          }

          let poly = turf.feature(feature.geometry);
          if (turf.booleanPointInPolygon(point, poly)) {
            found = true;
            storeFeature(feature, location);
            break;
          }
        }
      }
      else {
        // Check if the location exists within our countries
        for (let feature of countryData.features) {
          if (location.province === feature.properties.name || location.country === feature.properties.name) {
            found = true;
            storeFeature(feature, location);
            break;
          }

          if (!location.province && feature.properties.abbrev && feature.properties.abbrev.replace(/\./g, '') === location.country) {
            found = true;
            storeFeature(feature, location);
            break;
          }

          if (!feature.geometry) {
            continue;
          }

          let poly = turf.feature(feature.geometry);

          if (turf.booleanPointInPolygon(point, poly)) {
            found = true;
            storeFeature(feature, location);
            break;
          }
        }
      }

      if (!found) {
        console.error('  ❌ Could not find location %s [%f, %f]', location.name, location.coordinates[0], location.coordinates[1]);
      }
    }

    console.log('✅ Found features for %d out of %d regions for a total of %d features', foundCount, Object.keys(locations).length, featureCollection.features.length);

    resolve({locationDays, locations, featureCollection});
  });
}

module.exports = generateFeatures;
