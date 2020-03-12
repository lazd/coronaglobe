const fsp = require('fs');
const path = require('path');

const turf = require('@turf/turf');

const usStates = require('../data/us-states.json');
const countryData = require('../data/ne_10m_admin_0_countries-4pct.json');
const usCountyData = require('../data/counties-500k.json');
const provinceData = require('../data/ne_10m_admin_1_states_provinces-10pct.json');

const DEBUG = false;

function cleanProps(obj) {
  if (obj.wikipedia === -99) {
    delete obj.wikipedia;
  }

  for (let prop in obj) {
    if (typeof obj[prop] === 'string' && obj[prop].trim() === '') {
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
  'region',
  'admin',
  'geonunit',
  'pop_est',
  'pop_year',
  'gdp_md_est',
  'gdp_year',
  'iso_a2',
  'iso_3166_2',
  'type_en',
  'wikipedia'
];

const locationTransforms = {
  // Correct missing county
  'Island, WA': (location) => {
    location.province = 'Island County, WA';
  },

  // 🇭🇰
  'Hong Kong': (location) => {
    location.country = 'Hong Kong';
    delete location.province;
  },

  // Why is this in Denmark?
  'Faroe Islands': (location) => {
    location.country = 'Faroe Islands';
    delete location.province;
  },

  // Why is it UK, United Kingdom?
  'UK': (location) => {
    delete location.province;
  }
}

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
      if (feature.properties.geonunit) {
        feature.properties.shortName = feature.properties.name;
        feature.properties.name = feature.properties.name + ', ' + feature.properties.geonunit;
      }
    }

    if (DEBUG) {
      console.log('Storing %s in %s', location.name, feature.properties.name);
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

    locationLoop: for (let location of locations) {
      let found = false;
      let point = turf.point(location.coordinates);

      // Apply transforms
      if (locationTransforms[location.province]) {
        locationTransforms[location.province](location);
      }

      if (location.country === 'Italy' && !location.province) {
        // We have province level data for Italy, don't consider it as a feature
        console.log('  ⚠️  Skipping country-level data for %s', location.country);
        foundCount++;
        continue;
      }

      if (location.province) {
        if (location.country === 'US') {
          // Ignore state-level data
          if (usStates[location.province]) {
            console.log('  ⚠️  Skipping state-level data for %s', location.province);
            foundCount++;
            continue;
          }
          // Find county
          for (let feature of usCountyData.features) {
            if (feature.properties.name === location.province) {
              found = true;
              storeFeature(feature, location);
              continue locationLoop;
            }
            if (feature.geometry) {
              let poly = turf.feature(feature.geometry);
              if (turf.booleanPointInPolygon(point, poly)) {
                found = true;
                storeFeature(feature, location);
                continue locationLoop;
              }
            }
          }
        }

        // Check if the location exists within our provinces
        for (let feature of provinceData.features) {
          if (location.province === feature.properties.name || location.province === feature.properties.name_en) {
            found = true;
            storeFeature(feature, location);
            break;
          }

          if (feature.properties.name === 'New York' && location.province === 'New York County, NY') {
            // Can't find New York for some reason, hardcode FTW
            found = true;
            storeFeature(feature, location);
            break;
          }

          if (feature.geometry) {
            let poly = turf.feature(feature.geometry);
            if (turf.booleanPointInPolygon(point, poly)) {
              found = true;
              storeFeature(feature, location);
              break;
            }
          }

          // Match alternate names
          // No known location, but might be useful in the future
          if (feature.properties.alt && feature.properties.alt.split('|').indexOf(location.province) !== -1) {
            found = true;
            storeFeature(feature, location);
            break;
          }
          if (feature.properties.region === location.province && feature.properties.admin === location.country) {
            found = true;
            storeFeature(feature, location);
            break;
          }
        }
      }
      else {
        // Check if the location exists within our countries
        for (let feature of countryData.features) {
          // Find by full name
          if (location.country === feature.properties.name) {
            found = true;
            storeFeature(feature, location);
            break;
          }

          // Find by abbreviation
          if (feature.properties.abbrev && feature.properties.abbrev.replace(/\./g, '') === location.country) {
            found = true;
            storeFeature(feature, location);
            break;
          }

          if (feature.geometry) {
            let poly = turf.feature(feature.geometry);

            if (turf.booleanPointInPolygon(point, poly)) {
              found = true;
              storeFeature(feature, location);
              break;
            }
          }
        }

        // Check by province as a last resort
        if (!found) {
          // Check within provinces
          for (let feature of provinceData.features) {
            if (location.country === feature.properties.name) {
              found = true;
              storeFeature(feature, location);
              break;
            }

            // Find by geonunit
            if (feature.properties.geonunit === location.country) {
              found = true;
              storeFeature(feature, location);
              break;
            }

            if (feature.geometry) {
              let poly = turf.feature(feature.geometry);

              if (turf.booleanPointInPolygon(point, poly)) {
                found = true;
                storeFeature(feature, location);
                break;
              }
            }
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
