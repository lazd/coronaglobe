const fs = require('fs');
const path = require('path');

const turf = require('@turf/turf');

const countryData = require('../data/ne_10m_admin_0_countries-4pct.json');
const provinceData = require('../data/ne_10m_admin_1_states_provinces-10pct.json');
const locations = require('../site/data/locations.json');

let usedPolys = {"type":"FeatureCollection", "features": []};

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

function storeFeature(feature, location) {
  let index = usedPolys.features.indexOf(feature);
  if (index === -1) {
    index = usedPolys.features.push(feature) - 1;
  }

  feature.properties.id = index;
  location.featureId = index;
  foundCount++;
}

function cleanFeatures(set) {
  for (let feature of set.features) {
    feature.properties = cleanProps(takeOnlyProps(normalizeProps(feature.properties), props));
  }
}

console.log('⏳ Generating features...');

// Clean and normalize data first
cleanFeatures(countryData);
cleanFeatures(provinceData);

let foundCount = 0;
for (let locationId in locations) {
  let location = locations[locationId];

  let found = false;
  let point = turf.point(location.coordinates);
  // Treat HK as a country or it won't match
  if (location.province && location.province != 'Hong Kong' && location.province != 'Taiwan') {
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
    console.error('❌ Could not find location', location);
  }
}

console.log('Found features for %d out of %d regions for a total of %d features', foundCount, Object.keys(locations).length, usedPolys.features.length);

fs.writeFile(path.join('site', 'data', 'features.json'), JSON.stringify(usedPolys, null, 2), (err) => {
  if (err) {
    console.error('❌ Failed to write features: %s', err);
    process.exit(1);
  }
  else {
    console.log('✅ Features written successfully');
    fs.writeFile(path.join('site', 'data', 'locations.json'), JSON.stringify(locations, null, 2), (err) => {
      if (err) {
        console.error('❌ Failed to write modified locations: %s', err);
        process.exit(1);
      }
      else {
        console.log('✅ Modified locations written successfully');
      }
    });
  }
});
