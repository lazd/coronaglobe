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
    newObj[prop] = obj[prop];
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
  let newFeature = Object.assign({}, feature);
  newFeature.properties = cleanProps(takeOnlyProps(normalizeProps(feature.properties), props));
  let index = usedPolys.features.push(newFeature) - 1;
  location.featureId = index;
}

console.log('⏳ Generating features...');
for (let locationId in locations) {
  let location = locations[locationId];

  let found = false;
  let point = turf.point(location.coordinates);
  // Treat HK as a country or it won't match
  if (location.province && location.province != 'Hong Kong') {
    // Check if the location exists within our provinces
    for (let feature of provinceData.features) {
      if (location.province === feature.properties.name || location.province === feature.properties.name_en) {
        found = true;
        storeFeature(feature, location);
        break;
      }

      if (feature.properties.name === 'New York' && location.province === 'New York City, NY') {
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
      if (location.province === feature.properties.NAME || location.country === feature.properties.NAME) {
        found = true;
        storeFeature(feature, location);
        break;
      }

      if (!location.province && feature.properties.ABBREV.replace(/\./g, '') === location.country) {
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
    process.exit(1);
  }
}

console.log('Found features for %d out of %d regions', usedPolys.features.length, Object.keys(locations).length);

fs.writeFile(path.join('site', 'data', 'features.json'), JSON.stringify(usedPolys, null, 2), (err) => {
  if (err) {
    console.error('❌ Failed to write features: %s', err);
    process.exit(1);
  }
  else {
    console.log('✅ Features written successfully');
  }
});
