const fs = require('fs');
const path = require('path');

const turf = require('@turf/turf');

const countryData = require('../data/ne_10m_admin_0_countries-4pct.json');
const provinceData = require('../data/ne_10m_admin_1_states_provinces-10pct.json');
const data = require('../site/data/data.json');

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

for (let locationId in data.locations) {
  let location = data.locations[locationId];

  let found = false;
  let point = turf.point([location.Long, location.Lat]);
  // Treat HK as a country or it won't match
  if (location['Province/State'] && location['Province/State'] != 'Hong Kong') {
    // Check if the location exists within our provinces
    for (let feature of provinceData.features) {
      if (location['Province/State'] === feature.properties.name) {
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
      if (location['Province/State'] === feature.properties.NAME || location['Country/Region'] === feature.properties.NAME) {
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
    console.error('Could not find location', location);
  }
}

console.log('Found', usedPolys.features.length, 'out of', Object.keys(data.locations).length);

fs.writeFile(path.join('site', 'data', 'features.json'), JSON.stringify(usedPolys, null, 2), (err) => {
  if (err) {
    console.error('Failed to write features: %s', err);
  }
  else {
    console.log('Features written successfully');

    fs.writeFile(path.join('site', 'data', 'data.json'), JSON.stringify(data, null, 2), (err) => {
      if (err) {
        console.error('Failed to write modified data: %s', err);
      }
      else {
        console.log('Modified data written successfully');
      }
    });
  }
});

