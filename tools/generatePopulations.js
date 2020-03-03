const fs = require('fs');
const path = require('path');

const parse = require('csv-parse/lib/sync')
const locations = require('../site/data/locations.json');
const features = require('../site/data/features.json');

const dataPath = path.join('data');

function readCSVSync(csvPath) {
  let source = parse(fs.readFileSync(path.resolve(dataPath, csvPath)), {
    columns: true
  });
  let obj = {};
  for (let item of source) {
    if (item.population) {
      obj[item.name] = parseInt(item.population, 10);
    }
    else {
      console.error('Invalid data in %s for %s', csvPath, item.name);
      process.exit(1);
    }
  }
  return obj;
}

let populationByProvince = {
  'Mainland China': readCSVSync('population-chinese-admin-divisions.csv'),
  'Australia': readCSVSync('population-australia-states.csv'),
  'Canada': readCSVSync('population-canada-provinces.csv')
};

let usPopulation = {
  'state': readCSVSync('population-us-states.csv'),
  'county': readCSVSync('population-us-counties.csv')
};

let supplementalPopulation = readCSVSync('population-supplemental.csv');

function getLocationName(location) {
  return (location.province ? location.province + ', ' : '') + location.country;
}

// Use data from features
let populationByCountry = {};
for (let feature of features.features) {
  if (feature.properties.pop_est) {
    populationByCountry[feature.properties.name] = feature.properties.pop_est;
    if (feature.properties.name_en) {
      populationByCountry[feature.properties.name_en] = feature.properties.pop_est;
    }
    if (feature.properties.abbrev) {
      populationByCountry[feature.properties.abbrev.replace(/\./g, '')] = feature.properties.pop_est;
    }
  }
}

let populationFound = 0;
for (let locationId in locations) {
  let population = null;

  let location = locations[locationId];

  // Try population data by region
  if (location.country && location.province) {
    if (location.country === 'US') {
      if (usPopulation.county[location.province]) {
        // Try counties
        population = usPopulation.county[location.province];
      }
      else if (usPopulation.state[location.province]) {
        // Try states
        population = usPopulation.state[location.province];
      }
    }
    else {
      let populationData = populationByProvince[location.country];
      if (populationData) {
        population = populationData[location.province];
      }
    }
  }

  // Try population by country
  if (!location.province || location.province === location.country) {
    population = populationByCountry[location.country];
  }

  if (!population) {
    population = supplementalPopulation[location.province];
  }

  if (!population) {
    population = supplementalPopulation[location.country];
  }

  if (!population) {
    console.error('  ❌ %s: ?', getLocationName(location));
  }
  else {
    location.population = population;
    console.log('  ✅ %s: %s', getLocationName(location), population);
    populationFound++;
  }
}

console.log('Found population data for %d out of %d regions', populationFound, Object.keys(locations).length);

fs.writeFile(path.join('site', 'data', 'locations.json'), JSON.stringify(locations, null, 2), (err) => {
  if (err) {
    console.error('❌ Failed to write modified locations: %s', err);
    process.exit(1);
  }
  else {
    console.log('✅ Modified locations written successfully');
  }
});
